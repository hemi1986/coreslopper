import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, extname, isAbsolute, join, resolve } from 'node:path';
import { ConfigError, repoRoot } from '@coreslopper/core';
import { VIDEO_EXTENSIONS, delay, fetchJsonWithRetry, mimeForPath, type FetchLike } from './http.js';
import type { Operation, Provider, ProviderInput, ProviderOutput } from './types.js';

/**
 * Local video generation through a ComfyUI server.
 *
 * A model is the name of a workflow exported with "Export (API)" and stored in
 * `comfyui/workflows/<name>.json`. The adapter finds the nodes it fills by
 * their title (`_meta.title`), uploads the frames, queues the prompt, waits for
 * the history entry, and downloads the video outputs.
 */

/**
 * Node title tags the adapter recognizes. Rename the nodes in ComfyUI before
 * exporting; one node can carry several tags separated by spaces.
 */
export const COMFYUI_TITLES = {
  prompt: 'cs_prompt',
  negative: 'cs_negative',
  startImage: 'cs_start_image',
  endImage: 'cs_end_image',
  seed: 'cs_seed',
  width: 'cs_width',
  height: 'cs_height',
  frames: 'cs_frames',
  fps: 'cs_fps',
  output: 'cs_output',
} as const;

/** Input names tried in order on a titled node. */
const INPUT_CANDIDATES: Record<keyof typeof COMFYUI_TITLES, string[]> = {
  prompt: ['text', 'prompt', 'string', 'value'],
  negative: ['text', 'prompt', 'string', 'value'],
  startImage: ['image'],
  endImage: ['image'],
  seed: ['seed', 'noise_seed', 'value'],
  width: ['width', 'value'],
  height: ['height', 'value'],
  frames: ['length', 'frames', 'num_frames', 'frame_count', 'value'],
  fps: ['frame_rate', 'fps', 'value'],
  output: [],
};

/** Params the adapter understands. Anything else is a configuration error. */
const ADAPTER_PARAMS = new Set(['fps', 'frame_step', 'size_multiple', 'width', 'height', 'node_inputs']);

export const COMFYUI_DEFAULT_URL = 'http://127.0.0.1:8188';

export interface ComfyNode {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: { title?: string };
}

export type ComfyWorkflow = Record<string, ComfyNode>;

export interface ComfyUIProviderOptions {
  baseUrl?: string;
  workflowsDir?: string;
  requestTimeoutMs?: number;
  generationTimeoutMs?: number;
  pollIntervalMs?: number;
  fetchImpl?: FetchLike;
}

export function defaultWorkflowsDir(): string {
  const fromEnv = process.env.COMFYUI_WORKFLOWS_DIR;
  if (fromEnv) return resolve(fromEnv);
  return join(repoRoot(), 'comfyui', 'workflows');
}

export function comfyUIBaseUrl(value = process.env.COMFYUI_URL): string {
  return (value && value.trim().length > 0 ? value.trim() : COMFYUI_DEFAULT_URL).replace(/\/+$/, '');
}

function isLink(value: unknown): boolean {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && typeof value[1] === 'number';
}

/** Parse an API-format export and reject the UI format with a useful message. */
export function parseWorkflow(text: string, label: string): ComfyWorkflow {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new ConfigError(`ComfyUI workflow ${label} is not valid JSON: ${(error as Error).message}`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new ConfigError(`ComfyUI workflow ${label} must be a JSON object.`);
  }
  const record = data as Record<string, unknown>;
  if (Array.isArray(record.nodes) && Array.isArray(record.links)) {
    throw new ConfigError(
      `ComfyUI workflow ${label} is a UI workflow. In ComfyUI use Workflow > Export (API) and save that file instead.`,
    );
  }
  const entries = Object.entries(record);
  if (entries.length === 0) throw new ConfigError(`ComfyUI workflow ${label} has no nodes.`);
  for (const [id, node] of entries) {
    const candidate = node as Partial<ComfyNode> | null;
    if (!candidate || typeof candidate.class_type !== 'string' || typeof candidate.inputs !== 'object') {
      throw new ConfigError(
        `ComfyUI workflow ${label}: node "${id}" has no class_type/inputs. Export the workflow with Export (API).`,
      );
    }
  }
  return data as ComfyWorkflow;
}

/**
 * Node IDs whose title carries a tag. A title can hold several tags separated by
 * spaces or commas, e.g. "cs_width cs_height cs_frames" on an LTX latent node.
 */
export function nodesWithTitle(workflow: ComfyWorkflow, title: string): string[] {
  return Object.entries(workflow)
    .filter(([, node]) => (node._meta?.title ?? '').split(/[\s,]+/).includes(title))
    .map(([id]) => id);
}

export interface WorkflowInspection {
  /** Titles from COMFYUI_TITLES that are present, with their node IDs. */
  titles: Partial<Record<keyof typeof COMFYUI_TITLES, string[]>>;
  /** Operation the workflow fits, judged by its image inputs. */
  operation: 'textToVideo' | 'imageToVideo' | 'firstLastFrameToVideo';
  warnings: string[];
}

/** Describe what a workflow accepts; used by the adapter and by `doctor`. */
export function inspectWorkflow(workflow: ComfyWorkflow): WorkflowInspection {
  const titles: WorkflowInspection['titles'] = {};
  for (const [key, title] of Object.entries(COMFYUI_TITLES) as [keyof typeof COMFYUI_TITLES, string][]) {
    const ids = nodesWithTitle(workflow, title);
    if (ids.length > 0) titles[key] = ids;
  }
  const operation = titles.endImage
    ? 'firstLastFrameToVideo'
    : titles.startImage
      ? 'imageToVideo'
      : 'textToVideo';
  const warnings: string[] = [];
  if (!titles.prompt) warnings.push(`no node titled ${COMFYUI_TITLES.prompt}; the prompt cannot be set`);
  if (titles.endImage && !titles.startImage) {
    warnings.push(`${COMFYUI_TITLES.endImage} without ${COMFYUI_TITLES.startImage}`);
  }
  if (!titles.seed) warnings.push(`no node titled ${COMFYUI_TITLES.seed}; every run uses the workflow's seed`);
  if (!titles.frames) warnings.push(`no node titled ${COMFYUI_TITLES.frames}; clip length cannot follow the shot`);
  return { titles, operation, warnings };
}

function setTitled(
  workflow: ComfyWorkflow,
  key: keyof typeof COMFYUI_TITLES,
  value: unknown,
  label: string,
  inputNames = INPUT_CANDIDATES[key],
): boolean {
  const title = COMFYUI_TITLES[key];
  const ids = nodesWithTitle(workflow, title);
  for (const id of ids) {
    const node = workflow[id]!;
    const name = inputNames.find((candidate) => candidate in node.inputs && !isLink(node.inputs[candidate]));
    if (!name) {
      throw new ConfigError(
        `ComfyUI workflow ${label}: node ${id} "${title}" (${node.class_type}) has no unconnected input named ` +
          `${inputNames.join(', ')}. Title the node that holds the value, not the one that consumes it.`,
      );
    }
    node.inputs[name] = value;
  }
  return ids.length > 0;
}

function setNodeInput(workflow: ComfyWorkflow, path: string, value: unknown, label: string): void {
  const dot = path.lastIndexOf('.');
  if (dot <= 0) throw new ConfigError(`node_inputs key "${path}" must be "<node title or id>.<input>".`);
  const target = path.slice(0, dot);
  const input = path.slice(dot + 1);
  const ids = workflow[target] ? [target] : nodesWithTitle(workflow, target);
  if (ids.length === 0) throw new ConfigError(`ComfyUI workflow ${label}: no node with id or title "${target}".`);
  for (const id of ids) {
    const node = workflow[id]!;
    if (!(input in node.inputs)) {
      throw new ConfigError(`ComfyUI workflow ${label}: node ${id} has no input "${input}".`);
    }
    node.inputs[input] = value;
  }
}

function positiveInt(value: unknown, name: string, fallback: number): number {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new ConfigError(`ComfyUI param ${name} must be a positive integer.`);
  return number;
}

function roundTo(value: number, multiple: number): number {
  return Math.max(multiple, Math.round(value / multiple) * multiple);
}

/** Frames for a duration. With frame_step 8 the count is 8n+1, as LTX expects. */
export function framesFor(durationSeconds: number, fps: number, step: number): number {
  const target = Math.max(1, Math.round(durationSeconds * fps));
  if (step <= 1) return target;
  return Math.max(1, Math.ceil((target - 1) / step)) * step + 1;
}

interface OutputFile {
  filename: string;
  subfolder: string;
  type: string;
}

function collectOutputFiles(outputs: Record<string, unknown>, nodeIds?: string[]): OutputFile[] {
  const files: OutputFile[] = [];
  for (const [id, value] of Object.entries(outputs)) {
    if (nodeIds && !nodeIds.includes(id)) continue;
    if (!value || typeof value !== 'object') continue;
    for (const list of Object.values(value as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        const entry = item as Record<string, unknown>;
        if (typeof entry.filename !== 'string') continue;
        const type = typeof entry.type === 'string' ? entry.type : 'output';
        if (type !== 'output') continue;
        files.push({
          filename: entry.filename,
          subfolder: typeof entry.subfolder === 'string' ? entry.subfolder : '',
          type,
        });
      }
    }
  }
  return files;
}

export class ComfyUIProvider implements Provider {
  readonly name = 'comfyui';
  private readonly baseUrl: string;
  private readonly workflowsDir: string;
  private readonly requestTimeoutMs: number;
  private readonly generationTimeoutMs: number;
  private readonly pollIntervalMs: number;
  private readonly fetchImpl: FetchLike;
  private readonly clientId: string;

  constructor(options: ComfyUIProviderOptions = {}) {
    this.baseUrl = comfyUIBaseUrl(options.baseUrl);
    this.workflowsDir = options.workflowsDir ?? defaultWorkflowsDir();
    this.requestTimeoutMs = options.requestTimeoutMs ?? 120_000;
    this.generationTimeoutMs =
      options.generationTimeoutMs ?? positiveInt(process.env.COMFYUI_TIMEOUT_MS, 'COMFYUI_TIMEOUT_MS', 3_600_000);
    this.pollIntervalMs = options.pollIntervalMs ?? 2_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.clientId = `coreslopper-${process.pid}`;
  }

  async generateImage(): Promise<ProviderOutput> {
    throw new ConfigError('The ComfyUI backend generates video clips only. Set providers.image to fal or higgsfield.');
  }

  async editImage(): Promise<ProviderOutput> {
    throw new ConfigError('The ComfyUI backend generates video clips only. Set providers.image to fal or higgsfield.');
  }

  async lipSync(): Promise<ProviderOutput> {
    throw new ConfigError(
      'The ComfyUI backend has no lip-sync. Leave providers.lipsync unset (it falls back to fal) or set it to fal.',
    );
  }

  async textToVideo(input: ProviderInput): Promise<ProviderOutput> {
    return this.run(input, 'textToVideo');
  }

  async imageToVideo(input: ProviderInput): Promise<ProviderOutput> {
    if (!input.references?.[0]) throw new Error('imageToVideo requires a start-frame reference image.');
    return this.run(input, 'imageToVideo');
  }

  async firstLastFrameToVideo(input: ProviderInput): Promise<ProviderOutput> {
    const [start, end] = input.references ?? [];
    if (!start || !end) throw new Error('firstLastFrameToVideo requires a start frame and an end frame.');
    return this.run(input, 'firstLastFrameToVideo');
  }

  /** The workflow content is part of the cache key, so editing a workflow regenerates. */
  async fingerprint(_operation: Operation, model: string): Promise<string> {
    const text = await readFile(this.workflowPath(model), 'utf8');
    return createHash('sha256').update(text).digest('hex');
  }

  workflowPath(model: string): string {
    const name = model.endsWith('.json') ? model : `${model}.json`;
    const path = isAbsolute(name) ? name : join(this.workflowsDir, name);
    if (!existsSync(path)) {
      throw new ConfigError(
        `ComfyUI workflow "${model}" not found at ${path}. Export it with Export (API) into ${this.workflowsDir}.`,
      );
    }
    return path;
  }

  /** Fill a workflow for one request. Exposed for tests and dry runs. */
  async buildPrompt(
    input: ProviderInput,
    operation: 'textToVideo' | 'imageToVideo' | 'firstLastFrameToVideo',
    uploads: { start?: string; end?: string } = {},
  ): Promise<ComfyWorkflow> {
    const path = this.workflowPath(input.model);
    const label = basename(path);
    const workflow = parseWorkflow(await readFile(path, 'utf8'), label);
    const inspection = inspectWorkflow(workflow);
    const params = input.params ?? {};
    const unknown = Object.keys(params).filter((key) => !ADAPTER_PARAMS.has(key));
    if (unknown.length > 0) {
      throw new ConfigError(
        `Unknown ComfyUI params for ${input.model}: ${unknown.join(', ')}. ` +
          `Allowed: ${[...ADAPTER_PARAMS].join(', ')}. Set other node values with node_inputs.`,
      );
    }
    if (inspection.operation !== operation) {
      throw new ConfigError(
        `ComfyUI workflow ${label} fits ${inspection.operation} (by its ${COMFYUI_TITLES.startImage}/` +
          `${COMFYUI_TITLES.endImage} nodes), but the batch item asks for ${operation}. Use another workflow or role.`,
      );
    }

    if (!setTitled(workflow, 'prompt', input.prompt, label)) {
      throw new ConfigError(`ComfyUI workflow ${label} needs a node titled ${COMFYUI_TITLES.prompt}.`);
    }
    if (input.negativePrompt) setTitled(workflow, 'negative', input.negativePrompt, label);
    if (uploads.start) setTitled(workflow, 'startImage', uploads.start, label);
    if (uploads.end) setTitled(workflow, 'endImage', uploads.end, label);
    setTitled(workflow, 'seed', input.seed, label);

    const multiple = positiveInt(params.size_multiple, 'size_multiple', 1);
    const width = params.width ?? input.width;
    const height = params.height ?? input.height;
    if (width !== undefined) setTitled(workflow, 'width', roundTo(positiveInt(width, 'width', 1), multiple), label);
    if (height !== undefined) setTitled(workflow, 'height', roundTo(positiveInt(height, 'height', 1), multiple), label);

    const fps = positiveInt(params.fps, 'fps', 24);
    if (params.fps !== undefined) setTitled(workflow, 'fps', fps, label);
    if (input.durationSeconds !== undefined) {
      const frames = framesFor(input.durationSeconds, fps, positiveInt(params.frame_step, 'frame_step', 1));
      if (!setTitled(workflow, 'frames', frames, label)) {
        throw new ConfigError(
          `ComfyUI workflow ${label} needs a node titled ${COMFYUI_TITLES.frames} so the clip can be ${input.durationSeconds}s long.`,
        );
      }
    }

    const nodeInputs = params.node_inputs;
    if (nodeInputs !== undefined) {
      if (!nodeInputs || typeof nodeInputs !== 'object' || Array.isArray(nodeInputs)) {
        throw new ConfigError('ComfyUI param node_inputs must map "<node title or id>.<input>" to a value.');
      }
      for (const [key, value] of Object.entries(nodeInputs)) setNodeInput(workflow, key, value, label);
    }
    return workflow;
  }

  private async run(
    input: ProviderInput,
    operation: 'textToVideo' | 'imageToVideo' | 'firstLastFrameToVideo',
  ): Promise<ProviderOutput> {
    // Validate the workflow before uploading anything.
    await this.buildPrompt(input, operation, { start: 'check.png', end: 'check.png' });
    const [startPath, endPath] = input.references ?? [];
    const uploads = {
      start: operation !== 'textToVideo' && startPath ? await this.upload(startPath) : undefined,
      end: operation === 'firstLastFrameToVideo' && endPath ? await this.upload(endPath) : undefined,
    };
    const workflow = await this.buildPrompt(input, operation, uploads);

    const queued = await fetchJsonWithRetry(
      'ComfyUI',
      `${this.baseUrl}/prompt`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: workflow, client_id: this.clientId }),
      },
      this.requestTimeoutMs,
      this.fetchImpl,
    ).catch((error: unknown) => {
      throw this.connectionError(error);
    });
    const promptId = queued.prompt_id;
    if (typeof promptId !== 'string') {
      throw new Error(`ComfyUI did not queue the prompt: ${JSON.stringify(queued).slice(0, 500)}`);
    }

    const entry = await this.waitForHistory(promptId);
    const outputs = (entry.outputs ?? {}) as Record<string, unknown>;
    const outputNodes = nodesWithTitle(workflow, COMFYUI_TITLES.output);
    const files = collectOutputFiles(outputs, outputNodes.length > 0 ? outputNodes : undefined);
    const videos = files.filter((file) => VIDEO_EXTENSIONS.has(extname(file.filename).toLowerCase()));
    if (videos.length === 0) {
      throw new Error(
        `ComfyUI prompt ${promptId} produced no video output` +
          (files.length > 0 ? ` (only ${files.map((file) => file.filename).join(', ')})` : '') +
          '. Save the clip with a video node (SaveVideo or VHS Video Combine as mp4/webm).',
      );
    }
    return { files: await this.download(videos, input.outputDir, promptId), raw: { prompt_id: promptId, outputs } };
  }

  private connectionError(error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error);
    if (/fetch failed|ECONNREFUSED|ENOTFOUND|timed? ?out|aborted/i.test(message)) {
      return new ConfigError(
        `ComfyUI is not reachable at ${this.baseUrl} (${message}). Start ComfyUI or set COMFYUI_URL in .env.`,
      );
    }
    return error instanceof Error ? error : new Error(message);
  }

  private async upload(path: string): Promise<string> {
    const data = await readFile(path);
    const name = `${createHash('sha256').update(data).digest('hex').slice(0, 16)}${extname(path).toLowerCase() || '.png'}`;
    const form = new FormData();
    form.append('image', new Blob([data], { type: mimeForPath(path) }), name);
    form.append('type', 'input');
    form.append('subfolder', 'coreslopper');
    form.append('overwrite', 'true');
    const result = await fetchJsonWithRetry(
      'ComfyUI upload',
      `${this.baseUrl}/upload/image`,
      { method: 'POST', body: form },
      this.requestTimeoutMs,
      this.fetchImpl,
    ).catch((error: unknown) => {
      throw this.connectionError(error);
    });
    const uploaded = typeof result.name === 'string' ? result.name : name;
    const subfolder = typeof result.subfolder === 'string' ? result.subfolder : '';
    return subfolder ? `${subfolder}/${uploaded}` : uploaded;
  }

  private async waitForHistory(promptId: string): Promise<Record<string, unknown>> {
    const started = Date.now();
    while (Date.now() - started < this.generationTimeoutMs) {
      const history = await fetchJsonWithRetry(
        'ComfyUI',
        `${this.baseUrl}/history/${encodeURIComponent(promptId)}`,
        { method: 'GET' },
        this.requestTimeoutMs,
        this.fetchImpl,
      ).catch((error: unknown) => {
        throw this.connectionError(error);
      });
      const entry = history[promptId] as Record<string, unknown> | undefined;
      const status = entry?.status as { status_str?: string; completed?: boolean; messages?: unknown[] } | undefined;
      if (status?.status_str === 'error') {
        const failure = (status.messages ?? []).find(
          (message) => Array.isArray(message) && (message[0] === 'execution_error' || message[0] === 'execution_interrupted'),
        ) as [string, Record<string, unknown>] | undefined;
        const detail = failure
          ? `${failure[0]}: ${String(failure[1]?.exception_message ?? failure[1]?.node_type ?? '').trim()}`
          : 'unknown error';
        throw new Error(`ComfyUI prompt ${promptId} failed (${detail}).`);
      }
      if (entry && (status?.completed || status?.status_str === 'success' || entry.outputs)) return entry;
      await delay(this.pollIntervalMs);
    }
    throw new Error(
      `ComfyUI prompt ${promptId} did not finish within ${Math.round(this.generationTimeoutMs / 1000)}s. ` +
        'Raise COMFYUI_TIMEOUT_MS for long clips.',
    );
  }

  private async download(files: OutputFile[], outputDir: string, promptId: string): Promise<string[]> {
    await mkdir(outputDir, { recursive: true });
    const written: string[] = [];
    for (const [index, file] of files.entries()) {
      const query = new URLSearchParams({ filename: file.filename, subfolder: file.subfolder, type: file.type });
      const response = await this.fetchImpl(`${this.baseUrl}/view?${query.toString()}`, {
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
      if (!response.ok) throw new Error(`Failed to download ComfyUI output ${file.filename}: ${response.status}`);
      const path = join(outputDir, `comfyui-${promptId.slice(0, 12)}-${index}${extname(file.filename).toLowerCase()}`);
      await writeFile(path, Buffer.from(await response.arrayBuffer()));
      written.push(path);
    }
    return written;
  }
}

export interface ComfyUIServerStatus {
  ok: boolean;
  url: string;
  message: string;
}

/** Check that a ComfyUI server answers; used by `doctor`. */
export async function checkComfyUI(
  baseUrl = comfyUIBaseUrl(),
  fetchImpl: FetchLike = fetch,
  timeoutMs = 3_000,
): Promise<ComfyUIServerStatus> {
  const url = comfyUIBaseUrl(baseUrl);
  try {
    const response = await fetchImpl(`${url}/system_stats`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return { ok: false, url, message: `HTTP ${response.status}` };
    const stats = (await response.json()) as {
      system?: { comfyui_version?: string };
      devices?: { name?: string; vram_total?: number }[];
    };
    const device = stats.devices?.[0];
    const vram = device?.vram_total ? ` ${(device.vram_total / 1024 ** 3).toFixed(0)} GB` : '';
    const version = stats.system?.comfyui_version ? `ComfyUI ${stats.system.comfyui_version}` : 'ComfyUI';
    return { ok: true, url, message: `${version}${device?.name ? ` on ${device.name}${vram}` : ''}` };
  } catch (error) {
    return { ok: false, url, message: error instanceof Error ? error.message : String(error) };
  }
}

export interface WorkflowFileReport {
  name: string;
  ok: boolean;
  operation?: WorkflowInspection['operation'];
  warnings: string[];
  error?: string;
}

/** Validate every workflow export in a directory without contacting ComfyUI. */
export async function inspectWorkflowDir(dir = defaultWorkflowsDir()): Promise<WorkflowFileReport[]> {
  if (!existsSync(dir)) return [];
  const names = (await readdir(dir)).filter((name) => name.endsWith('.json')).sort();
  const reports: WorkflowFileReport[] = [];
  for (const name of names) {
    try {
      const inspection = inspectWorkflow(parseWorkflow(await readFile(join(dir, name), 'utf8'), name));
      reports.push({
        name: name.replace(/\.json$/, ''),
        ok: Boolean(inspection.titles.prompt),
        operation: inspection.operation,
        warnings: inspection.warnings,
      });
    } catch (error) {
      reports.push({ name: name.replace(/\.json$/, ''), ok: false, warnings: [], error: (error as Error).message });
    }
  }
  return reports;
}
