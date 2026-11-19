import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { ConfigError } from '@coreslopper/core';
import {
  AUDIO_EXTENSIONS,
  delay,
  downloadOutputs,
  fetchJsonWithRetry,
  IMAGE_EXTENSIONS,
  mimeForPath,
  VIDEO_EXTENSIONS,
  type FetchLike,
} from './http.js';
import type { Provider, ProviderInput, ProviderOutput } from './types.js';
import { clipDurationSeconds, withoutDurationOptions } from './duration.js';

export interface TopviewProviderOptions {
  /** Platform key (`platform-backend.topview.ai`) for images and clips. */
  apiKey?: string;
  baseUrl?: string;
  /** Topview OpenAPI credentials (`api.topview.ai`) for Avatar 4 lip-sync. */
  avatar?: TopviewAvatarCredentials;
  avatarBaseUrl?: string;
  requestTimeoutMs?: number;
  pollIntervalMs?: number;
  fetchImpl?: FetchLike;
}

/**
 * How a model takes its inputs. Topview models do not share one request shape:
 * - `flat`: `prompt` plus named image fields (`images`, `image`, `last_image`, ...).
 * - `content`: a `content[]` list of text and media items with roles
 *   (`first_frame`, `last_frame`), as used by Topview T1, Seedance, and MiniMax.
 * - `wan`: Alibaba's native shape, `input` (prompt, `media[]` with typed frames)
 *   plus `parameters` (all settings, including `seed`), as used by Wan 3.0.
 */
type RequestFormat = 'flat' | 'content' | 'wan';

const UPLOAD_LIMIT_BYTES = 20 * 1024 * 1024;
/** Signed upload URLs live at most one hour; reuse one for a shorter time. */
const UPLOAD_REUSE_MS = 45 * 60 * 1000;
const PENDING = new Set(['created', 'processing']);

/** Topview OpenAPI credentials: the `Topview-Uid` header and the API key from topview.ai API Settings. */
export interface TopviewAvatarCredentials {
  uid: string;
  apiKey: string;
}

/** Avatar 4 task states (`/v1/photo_avatar/task/query`). */
const AVATAR_PENDING = new Set(['init', 'running', 'processing', 'queued']);

/**
 * Resolve the Topview OpenAPI credentials for Avatar 4 from the environment:
 * `TOPVIEW_UID` and `TOPVIEW_OPENAPI_KEY`. They are separate from the platform
 * key: Avatar 4 runs on `api.topview.ai` and bills plan credits.
 */
export function resolveTopviewAvatarCredentials(env: NodeJS.ProcessEnv = process.env): TopviewAvatarCredentials | undefined {
  const uid = env.TOPVIEW_UID?.trim();
  const apiKey = env.TOPVIEW_OPENAPI_KEY?.trim().replace(/^Bearer\s+/i, '');
  return uid && apiKey ? { uid, apiKey } : undefined;
}

/** Resolve the Topview platform key from the environment. */
export function resolveTopviewApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = env.TOPVIEW_API_PLATFORM_KEY ?? env.TOPVIEW_API_KEY;
  return value?.trim() ? value.trim().replace(/^Bearer\s+/i, '') : undefined;
}

function normalizeSeed(seed: number): number {
  const value = Math.abs(Math.trunc(seed)) % 2_147_483_647;
  return value || 1;
}

function take<T>(
  params: Record<string, unknown>,
  key: string,
  read: (value: unknown) => T,
): [T, Record<string, unknown>] {
  const { [key]: value, ...rest } = params;
  return [read(value), rest];
}

const asSwitch = (value: unknown): boolean => value === true;
const asField = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

function asFormat(value: unknown): RequestFormat {
  if (value === undefined || value === 'flat') return 'flat';
  if (value === 'content' || value === 'wan') return value;
  throw new ConfigError(`Topview request_format must be "flat", "content", or "wan", got ${JSON.stringify(value)}.`);
}

/** Adapter-only params, stripped before the request is sent. */
interface AdapterOptions {
  format: RequestFormat;
  referenceField?: string;
  endField?: string;
  sendSeed: boolean;
  sendNegative: boolean;
  params: Record<string, unknown>;
}

function adapterOptions(params: Record<string, unknown> = {}): AdapterOptions {
  const [format, a] = take(params, 'request_format', asFormat);
  const [referenceField, b] = take(a, 'reference_field', asField);
  const [endField, c] = take(b, 'end_reference_field', asField);
  const [sendSeed, d] = take(c, 'send_seed', asSwitch);
  const [sendNegative, rest] = take(d, 'send_negative_prompt', asSwitch);
  return { format, referenceField, endField, sendSeed, sendNegative, params: rest };
}

function mediaKind(path: string): 'image' | 'video' | 'audio' {
  const extension = extname(path).toLowerCase();
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  throw new ConfigError(`Topview cannot upload ${path}: unknown media type.`);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export class TopviewProvider implements Provider {
  readonly name = 'topview';
  private readonly key: string | undefined;
  private readonly avatar: TopviewAvatarCredentials | undefined;
  private readonly baseUrl: string;
  private readonly avatarBaseUrl: string;
  private readonly requestTimeoutMs: number;
  private readonly pollIntervalMs: number;
  private readonly fetchImpl: FetchLike;
  private readonly uploadCache = new Map<string, { url: Promise<string>; at: number }>();

  constructor(options: TopviewProviderOptions = {}) {
    const apiKey = options.apiKey ?? resolveTopviewApiKey();
    const avatar = options.avatar ?? resolveTopviewAvatarCredentials();
    if (!apiKey && !avatar) {
      throw new ConfigError(
        'Topview credentials are not set. Add TOPVIEW_API_PLATFORM_KEY to .env (platform.topview.ai/api-keys), ' +
          'or TOPVIEW_UID and TOPVIEW_OPENAPI_KEY for Avatar 4 lip-sync, or use the mock provider.',
      );
    }
    this.key = apiKey || undefined;
    this.avatar = avatar;
    this.baseUrl = (options.baseUrl ?? 'https://platform-backend.topview.ai/api/v1').replace(/\/+$/, '');
    this.avatarBaseUrl = (options.avatarBaseUrl ?? 'https://api.topview.ai').replace(/\/+$/, '');
    this.requestTimeoutMs = options.requestTimeoutMs ?? 1_800_000;
    this.pollIntervalMs = options.pollIntervalMs ?? 3_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async generateImage(input: ProviderInput): Promise<ProviderOutput> {
    const options = adapterOptions(input.params);
    return this.runModel(input, { ...this.promptFields(input, options), ...options.params });
  }

  async editImage(input: ProviderInput): Promise<ProviderOutput> {
    const references = input.references ?? [];
    if (references.length === 0) throw new Error('editImage requires at least one reference image.');
    const options = adapterOptions(input.params);
    const field = options.referenceField ?? 'images';
    const urls = await Promise.all(references.map((reference) => this.uploadReference(reference)));
    if (!field.endsWith('s') && urls.length > 1) {
      throw new Error(`Topview reference field "${field}" accepts one image, but ${urls.length} references were supplied.`);
    }
    return this.runModel(input, {
      ...this.promptFields(input, options),
      [field]: field.endsWith('s') ? urls : urls[0],
      ...options.params,
    });
  }

  async textToVideo(input: ProviderInput): Promise<ProviderOutput> {
    return this.runVideo(input, []);
  }

  async imageToVideo(input: ProviderInput): Promise<ProviderOutput> {
    const start = input.references?.[0];
    if (!start) throw new Error('imageToVideo requires a start-frame reference image.');
    return this.runVideo(input, [start]);
  }

  async firstLastFrameToVideo(input: ProviderInput): Promise<ProviderOutput> {
    const [start, end] = input.references ?? [];
    if (!start || !end) throw new Error('firstLastFrameToVideo requires a start frame and an end frame.');
    return this.runVideo(input, [start, end]);
  }

  /**
   * Avatar 4 (photo avatar) lip-sync on the Topview OpenAPI: upload the face
   * (`references[0]`) and the vocal segment, submit a `scriptMode: audio` task,
   * poll it, and download `finishedVideoUrl`. The model is the Avatar mode
   * (`avatar4`, `avatar4Fast`, or `avatar2`); the prompt goes to `customMotion`.
   * Remaining params (e.g. `offPeak`) are sent as they are.
   */
  async lipSync(input: ProviderInput): Promise<ProviderOutput> {
    const reference = input.references?.[0];
    if (!reference) throw new Error('lipSync requires a face reference image.');
    if (!input.audio) throw new Error('lipSync requires an audio file.');
    const avatar = this.avatar;
    if (!avatar) {
      throw new ConfigError(
        'Topview lip-sync (Avatar 4) needs the Topview OpenAPI credentials: add TOPVIEW_UID and TOPVIEW_OPENAPI_KEY ' +
          '(topview.ai > API Settings) to .env. The platform key does not cover Avatar 4.',
      );
    }
    const mode = input.model.replace(/^.*\//, '');
    if (!['avatar4', 'avatar4Fast', 'avatar2'].includes(mode)) {
      throw new ConfigError(`Topview lip-sync model must be avatar4, avatar4Fast, or avatar2, got ${JSON.stringify(input.model)}.`);
    }
    const { request_format: _format, ...params } = input.params ?? {};
    const [imageFileId, audioFileId] = await Promise.all([
      this.avatarUpload(reference, avatar),
      this.avatarUpload(input.audio, avatar),
    ]);
    const prompt = input.prompt.trim();
    const submitted = this.avatarResult(
      await fetchJsonWithRetry(
        'Topview Avatar',
        `${this.avatarBaseUrl}/v1/photo_avatar/task/submit`,
        {
          method: 'POST',
          headers: { ...this.avatarHeaders(avatar), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateImageFileId: imageFileId,
            mode,
            scriptMode: 'audio',
            audioFileId,
            ...(prompt ? { customMotion: prompt.slice(0, 600) } : {}),
            ...params,
          }),
        },
        this.requestTimeoutMs,
        this.fetchImpl,
        1,
      ),
    );
    const taskId = typeof submitted.taskId === 'string' ? submitted.taskId : undefined;
    if (!taskId || !/^[A-Za-z0-9_-]+$/.test(taskId)) {
      throw new Error(`Topview Avatar returned no task id: ${JSON.stringify(submitted).slice(0, 500)}`);
    }

    const started = Date.now();
    let interval = this.pollIntervalMs;
    for (;;) {
      const task = this.avatarResult(
        await fetchJsonWithRetry(
          'Topview Avatar',
          `${this.avatarBaseUrl}/v1/photo_avatar/task/query?taskId=${taskId}`,
          { method: 'GET', headers: this.avatarHeaders(avatar) },
          Math.min(this.requestTimeoutMs, 60_000),
          this.fetchImpl,
          8,
        ),
      );
      const status = String(task.status ?? '').toLowerCase();
      if (status === 'success') {
        const url = typeof task.finishedVideoUrl === 'string' ? task.finishedVideoUrl : undefined;
        if (!url) throw new Error(`Topview Avatar task ${taskId} has no finishedVideoUrl: ${JSON.stringify(task).slice(0, 500)}`);
        return {
          files: await downloadOutputs('topview', [url], input.outputDir, this.requestTimeoutMs, this.fetchImpl),
          raw: task,
        };
      }
      if (status === 'fail' || status === 'failed') {
        throw new Error(`Topview Avatar task ${taskId} failed: ${String(task.errorMsg || JSON.stringify(task).slice(0, 500))}`);
      }
      if (!AVATAR_PENDING.has(status)) throw new Error(`Topview Avatar task ${taskId} has unexpected status ${status}.`);
      if (Date.now() - started >= this.requestTimeoutMs) {
        throw new Error(`Topview Avatar task ${taskId} timed out after ${this.requestTimeoutMs}ms. Query it before submitting again.`);
      }
      await delay(interval);
      interval = Math.min(Math.round(interval * 1.25), 15_000);
    }
  }

  private avatarHeaders(avatar: TopviewAvatarCredentials): Record<string, string> {
    return { Authorization: `Bearer ${avatar.apiKey}`, 'Topview-Uid': avatar.uid };
  }

  /** Check the OpenAPI `{ code, message, result }` envelope; return `result`. */
  private avatarResult(body: Record<string, unknown>): Record<string, unknown> {
    if (body.error !== undefined || (body.code !== undefined && String(body.code) !== '200')) {
      const message = `Topview Avatar ${String(body.code ?? 'error')}: ${JSON.stringify(body).slice(0, 500)}`;
      // Credentials and credits are hard stops, not retryable failures.
      if (/unauthori|credit|balance|insufficient/i.test(message)) throw new ConfigError(message);
      throw new Error(message);
    }
    return record(body.result);
  }

  /** Upload a local file through an OpenAPI upload credential; return its fileId. */
  private async avatarUpload(path: string, avatar: TopviewAvatarCredentials): Promise<string> {
    const format = extname(path).slice(1).toLowerCase();
    const kind = mediaKind(path);
    const allowed = kind === 'audio' ? ['mp3', 'wav', 'm4a'] : kind === 'image' ? ['png', 'jpg', 'jpeg', 'bmp', 'webp'] : [];
    if (!allowed.includes(format)) {
      throw new ConfigError(`Topview Avatar cannot upload ${path}: use PNG, JPG, BMP, or WebP images and MP3, WAV, or M4A audio.`);
    }
    const credential = this.avatarResult(
      await fetchJsonWithRetry(
        'Topview Avatar upload',
        `${this.avatarBaseUrl}/v1/upload/credential?format=${format}`,
        { method: 'GET', headers: this.avatarHeaders(avatar) },
        this.requestTimeoutMs,
        this.fetchImpl,
      ),
    );
    const fileId = typeof credential.fileId === 'string' ? credential.fileId : undefined;
    const uploadUrl = typeof credential.uploadUrl === 'string' ? credential.uploadUrl : undefined;
    if (!fileId || !uploadUrl) {
      throw new Error(`Topview Avatar returned no upload credential for ${path}: ${JSON.stringify(credential).slice(0, 500)}`);
    }
    const data = await readFile(path);
    const upload = await this.fetchImpl(uploadUrl, {
      method: 'PUT',
      body: new Uint8Array(data),
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    });
    if (!upload.ok) throw new Error(`Topview Avatar upload failed for ${path}: ${upload.status}`);
    const check = await fetchJsonWithRetry(
      'Topview Avatar upload',
      `${this.avatarBaseUrl}/v1/upload/check?fileId=${encodeURIComponent(fileId)}`,
      { method: 'GET', headers: this.avatarHeaders(avatar) },
      this.requestTimeoutMs,
      this.fetchImpl,
    );
    if (String(check.code) !== '200' || check.result !== true) {
      throw new Error(`Topview Avatar upload check failed for ${path}: ${JSON.stringify(check).slice(0, 300)}`);
    }
    return fileId;
  }

  private promptFields(input: ProviderInput, options: AdapterOptions): Record<string, unknown> {
    return {
      prompt: input.prompt,
      ...(options.sendSeed ? { seed: normalizeSeed(input.seed) } : {}),
      ...(options.sendNegative && input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
    };
  }

  /** `frames` is empty (text-to-video), [start], or [start, end]. */
  private async runVideo(input: ProviderInput, frames: string[]): Promise<ProviderOutput> {
    const options = adapterOptions(input.params);
    const [start, end] = await Promise.all(frames.map((frame) => this.uploadReference(frame)));
    const duration = clipDurationSeconds(input.durationSeconds, options.params);
    const params = withoutDurationOptions(options.params);

    if (options.format === 'wan') {
      const media: Record<string, unknown>[] = [];
      if (start) media.push({ type: 'first_frame', url: start });
      if (end) media.push({ type: 'last_frame', url: end });
      return this.runModel(input, {
        input: { prompt: input.prompt, ...(media.length > 0 ? { media } : {}) },
        parameters: {
          ...(options.sendSeed ? { seed: normalizeSeed(input.seed) } : {}),
          ...params,
          duration,
        },
      });
    }

    if (options.format === 'content') {
      const content: Record<string, unknown>[] = [{ type: 'text', text: input.prompt }];
      if (start) content.push({ type: 'image_url', role: 'first_frame', image_url: { url: start } });
      if (end) content.push({ type: 'image_url', role: 'last_frame', image_url: { url: end } });
      return this.runModel(input, {
        content,
        ...(options.sendSeed ? { seed: normalizeSeed(input.seed) } : {}),
        ...(options.sendNegative && input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
        ...params,
        duration,
      });
    }

    const body: Record<string, unknown> = { ...this.promptFields(input, options) };
    if (start) body[options.referenceField ?? 'image'] = start;
    if (end) {
      if (!options.endField) {
        throw new ConfigError(
          `Model ${input.model} has no end_reference_field param. Set it in config/models.yaml to the field that takes the end frame (e.g. last_image), or use request_format: content.`,
        );
      }
      body[options.endField] = end;
    }
    return this.runModel(input, { ...body, ...params, duration });
  }

  private authHeaders(): Record<string, string> {
    if (!this.key) {
      throw new ConfigError(
        'Topview images and clips need the platform key. Add TOPVIEW_API_PLATFORM_KEY to .env (platform.topview.ai/api-keys).',
      );
    }
    return { Authorization: `Bearer ${this.key}` };
  }

  private async runModel(input: ProviderInput, body: Record<string, unknown>): Promise<ProviderOutput> {
    const model = input.model.replace(/^\/+|\/+$/g, '').replace(/\/predictions$/, '');
    const headers: Record<string, string> = { ...this.authHeaders(), 'Content-Type': 'application/json' };
    if (input.idempotencyKey) headers['Idempotency-Key'] = input.idempotencyKey;

    const accepted = this.unwrap(
      await fetchJsonWithRetry(
        'Topview',
        `${this.baseUrl}/models/${model}/predictions`,
        { method: 'POST', headers, body: JSON.stringify(body) },
        this.requestTimeoutMs,
        this.fetchImpl,
      ),
    );
    const id = typeof accepted.id === 'string' ? accepted.id : undefined;
    let task = accepted;
    if (!this.settled(task)) {
      if (!id) throw new Error(`Topview returned no task id for ${model}: ${JSON.stringify(accepted).slice(0, 500)}`);
      task = await this.poll(id);
    }

    const outputs = Array.isArray(task.outputs) ? task.outputs.filter((value): value is string => typeof value === 'string') : [];
    if (outputs.length === 0) {
      throw new Error(`Topview returned no outputs for ${model}: ${JSON.stringify(task).slice(0, 500)}`);
    }
    const urls = outputs.filter((value) => /^https?:\/\//.test(value));
    const files = await downloadOutputs('topview', urls, input.outputDir, this.requestTimeoutMs, this.fetchImpl);
    files.push(...(await this.writeInline(outputs.filter((value) => !/^https?:\/\//.test(value)), input.outputDir)));
    return { files, raw: task };
  }

  /** Check the `{ code, message, data }` envelope and the task status; return `data`. */
  private unwrap(body: Record<string, unknown>): Record<string, unknown> {
    if (body.code !== undefined && body.code !== 200) {
      throw new Error(`Topview ${String(body.code)}: ${JSON.stringify(body).slice(0, 500)}`);
    }
    const task = record(body.data);
    const status = String(task.status ?? '');
    if (status === 'failed') {
      throw new Error(`Topview task ${String(task.id)} failed: ${String(task.error || JSON.stringify(task).slice(0, 500))}`);
    }
    if (status === 'payment_required') {
      // A hard stop: the workspace balance is short. Topview settles the task by itself after a top-up.
      throw new ConfigError(
        `Topview task ${String(task.id)} needs payment (shortfall ${String(task.shortfall_usd ?? task.amount_due_usd ?? '?')} USD). ` +
          'Top up the Topview workspace; the task settles without a new submission.',
      );
    }
    return task;
  }

  private settled(task: Record<string, unknown>): boolean {
    return task.status === 'completed' && Array.isArray(task.outputs) && task.outputs.length > 0;
  }

  private async poll(id: string): Promise<Record<string, unknown>> {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`Topview returned an invalid task id: ${id}`);
    const started = Date.now();
    let interval = this.pollIntervalMs;
    while (Date.now() - started < this.requestTimeoutMs) {
      const task = this.unwrap(
        await fetchJsonWithRetry(
          'Topview',
          `${this.baseUrl}/predictions/${id}`,
          { method: 'GET', headers: this.authHeaders() },
          Math.min(this.requestTimeoutMs, 60_000),
          this.fetchImpl,
          8,
        ),
      );
      if (task.status === 'completed') return task;
      if (!PENDING.has(String(task.status))) {
        throw new Error(`Topview task ${id} has unexpected status ${String(task.status)}.`);
      }
      await delay(interval);
      interval = Math.min(Math.round(interval * 1.25), 15_000);
    }
    throw new Error(`Topview task ${id} timed out after ${this.requestTimeoutMs}ms. Query it before submitting again.`);
  }

  /** Outputs without a URL are raw Base64 images. */
  private async writeInline(values: string[], outputDir: string): Promise<string[]> {
    if (values.length === 0) return [];
    await mkdir(outputDir, { recursive: true });
    const files: string[] = [];
    for (const [index, value] of values.entries()) {
      const data = Buffer.from(value.replace(/^data:[^,]+,/, ''), 'base64');
      const name = createHash('sha256').update(value).digest('hex').slice(0, 16);
      const path = join(outputDir, `topview-${name}-inline-${index}.png`);
      await writeFile(path, data);
      files.push(path);
    }
    return files;
  }

  /**
   * Upload a local file to Topview media storage and return its signed HTTPS URL.
   * The pending upload is cached, so a reference used twice in one request is sent once.
   */
  private uploadReference(path: string): Promise<string> {
    if (/^https?:\/\//.test(path)) return Promise.resolve(path);
    const cached = this.uploadCache.get(path);
    if (cached && Date.now() - cached.at < UPLOAD_REUSE_MS) return cached.url;
    const url = this.upload(path);
    this.uploadCache.set(path, { url, at: Date.now() });
    url.catch(() => this.uploadCache.delete(path));
    return url;
  }

  private async upload(path: string): Promise<string> {
    const kind = mediaKind(path);
    const data = await readFile(path);
    if (data.byteLength > UPLOAD_LIMIT_BYTES) {
      throw new ConfigError(`Topview uploads are limited to 20 MiB; ${path} has ${data.byteLength} bytes.`);
    }
    const form = new FormData();
    form.append('kind', kind);
    form.append('file', new Blob([new Uint8Array(data)], { type: mimeForPath(path) }), basename(path));

    const body = await fetchJsonWithRetry(
      'Topview upload',
      `${this.baseUrl}/media/files`,
      { method: 'POST', headers: this.authHeaders(), body: form },
      this.requestTimeoutMs,
      this.fetchImpl,
    );
    const asset = record(body.data);
    const url = typeof asset.download_url === 'string' ? asset.download_url : undefined;
    if (!url) throw new Error(`Topview upload returned no download_url for ${path}: ${JSON.stringify(body).slice(0, 500)}`);
    return url;
  }
}
