import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, extname, isAbsolute, join, resolve } from 'node:path';
import {
  COMFYUI_MODEL_INPUTS,
  ConfigError,
  REF2VA_LIMITS,
  ValidationError,
  checkFl2vaPrompt,
  fl2vaMarkers,
  loadModelsConfig,
  pikaFrames,
  repoRoot,
  type ModelsConfig,
} from '@coreslopper/core';
import {
  AUDIO_EXTENSIONS,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  delay,
  fetchJsonWithRetry,
  mimeForPath,
  type FetchLike,
} from './http.js';
import type { Operation, Provider, ProviderInput, ProviderOutput } from './types.js';

/**
 * Local generation through a ComfyUI server: stills, image edits, video clips,
 * lip-sync, and audio.
 *
 * A model is the name of a workflow exported with "Export (API)" and stored in
 * `comfyui/workflows/<name>.json`. The adapter finds the nodes it fills by
 * their title (`_meta.title`), uploads images and audio, queues the prompt,
 * waits for the history entry, and downloads the outputs. The class of the
 * `cs_output` node decides whether a workflow makes images, video, or audio.
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
  duration: 'cs_duration',
  audio: 'cs_audio',
  audioStart: 'cs_audio_start',
  resolution: 'cs_resolution',
  references: 'cs_references',
  lyrics: 'cs_lyrics',
  transcript: 'cs_transcript',
  video: 'cs_video',
  scale: 'cs_scale',
  colorCorrection: 'cs_color_correction',
  splitLatent: 'cs_split',
  turbo: 'cs_turbo',
  output: 'cs_output',
} as const;

export type ComfyTag = keyof typeof COMFYUI_TITLES;

/** Input names tried in order on a titled node. */
const INPUT_CANDIDATES: Record<ComfyTag, string[]> = {
  prompt: ['text', 'prompt', 'caption', 'tags', 'string', 'value'],
  negative: ['negative_prompt', 'text', 'prompt', 'string', 'value'],
  startImage: ['image'],
  endImage: ['image'],
  seed: ['seed', 'noise_seed', 'value'],
  width: ['width', 'value'],
  height: ['height', 'value'],
  frames: ['length', 'frames', 'num_frames', 'frame_count', 'value'],
  fps: ['frame_rate', 'fps', 'value'],
  duration: ['seconds', 'duration', 'max_duration', 'value'],
  audio: ['audio'],
  audioStart: ['start_index', 'start', 'value'],
  resolution: ['aspect_ratio'],
  references: [],
  lyrics: ['lyrics', 'text', 'value'],
  transcript: ['prompt_text', 'transcript', 'reference_text', 'text', 'value'],
  video: ['file', 'video'],
  scale: ['resize_type.multiplier', 'scale_by', 'multiplier', 'value'],
  colorCorrection: ['color_correction_method', 'color_correction', 'value'],
  splitLatent: ['value'],
  turbo: ['value'],
  output: [],
};

/** Params the adapter understands. Anything else is a configuration error. */
const ADAPTER_PARAMS = new Set([
  'fps',
  'frame_step',
  'size_multiple',
  'megapixels',
  'width',
  'height',
  'lyrics',
  'transcript',
  'scale',
  'color_correction',
  'split_latent',
  'turbo',
  'max_references',
  'node_inputs',
]);

/** Loader inputs that name a model file; checked against GET /object_info before a run. */
const MODEL_FILE_INPUTS: readonly string[] = COMFYUI_MODEL_INPUTS;

/** A ComfyUI failure that means the GPU ran out of memory. */
export function isOutOfMemory(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /out of memory|OutOfMemory|\bOOM\b|Allocation on device/i.test(message);
}

/** What a workflow produces, judged by the class of its cs_output node. */
export type ComfyOutputKind = 'image' | 'video' | 'audio';

const OUTPUT_EXTENSIONS: Record<ComfyOutputKind, Set<string>> = {
  image: IMAGE_EXTENSIONS,
  video: VIDEO_EXTENSIONS,
  audio: AUDIO_EXTENSIONS,
};

export const COMFYUI_DEFAULT_URL = 'http://127.0.0.1:8188';

export interface ComfyNode {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: { title?: string };
}

export type ComfyWorkflow = Record<string, ComfyNode>;

export interface ComfyUploads {
  start?: string;
  end?: string;
  /** Extra edit references after the first, for cs_references. */
  references?: string[];
  audio?: string;
  /** The clip to restore or upscale (cs_video). */
  video?: string;
  /** Reference-to-video images for cs_ref_0 … cs_ref_<n-1>, in prompt order (<Picture 1> first). */
  indexedReferences?: string[];
}

export interface ComfyUIProviderOptions {
  baseUrl?: string;
  workflowsDir?: string;
  requestTimeoutMs?: number;
  generationTimeoutMs?: number;
  pollIntervalMs?: number;
  fetchImpl?: FetchLike;
  /** Allowed model files of fixed workflows; default `comfyui_locks` from config/models.yaml. */
  locks?: ComfyUILocks;
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
  const wanted = normalizeTag(title);
  return Object.entries(workflow)
    .filter(([, node]) => titleTags(node).includes(wanted))
    .map(([id]) => id);
}

/** Older names a tag is also found by: the Pika H3 export calls its ResolutionSelector cs:aspect. */
const TAG_ALIASES: Record<string, string> = { cs_aspect: 'cs_resolution' };

/** `cs:prompt` and `cs_prompt` are the same tag; aliases map to their canonical name. */
export function normalizeTag(token: string): string {
  const tag = token.replace(/^cs:/, 'cs_');
  return TAG_ALIASES[tag] ?? tag;
}

function titleTags(node: ComfyNode): string[] {
  return (node._meta?.title ?? '')
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(normalizeTag);
}

/** Indexed reference images `cs_ref_<n>` (or `cs:ref_<n>`) by index. */
export function indexedReferenceNodes(workflow: ComfyWorkflow): Map<number, string> {
  const found = new Map<number, string>();
  for (const [id, node] of Object.entries(workflow)) {
    for (const tag of titleTags(node)) {
      const match = /^cs_ref_(\d+)$/.exec(tag);
      if (match) found.set(Number(match[1]), id);
    }
  }
  return found;
}

/** Inputs anywhere in the workflow that link to a node, as [consumer id, input name]. */
function linksTo(workflow: ComfyWorkflow, source: string): [string, string][] {
  const links: [string, string][] = [];
  for (const [id, node] of Object.entries(workflow)) {
    for (const [name, value] of Object.entries(node.inputs)) {
      if (isLink(value) && (value as [string, number])[0] === source) links.push([id, name]);
    }
  }
  return links;
}

/** A workflow built on MiniMax H3 reference-to-video (Pika H3 Flex). */
function isRef2va(workflow: ComfyWorkflow): boolean {
  return Object.values(workflow).some((node) => node.class_type === 'MiniMaxH3ReferenceToVideo');
}

/** A workflow built on MiniMax H3 first/last-frame-to-video (Pika H3 Flex FL2VA); the end frame is optional. */
function isFl2va(workflow: ComfyWorkflow): boolean {
  return Object.values(workflow).some((node) => node.class_type === 'MiniMaxH3ImageToVideo');
}

/**
 * A Pika H3 Flex Ref2VA graph that lip-syncs: the vocal (`cs:audio`, cut by
 * `cs:audio_start`) is anchored as the soundtrack from frame 0 with a
 * MiniMax H3 AddGuide node, so the picture is generated to the given voice.
 */
export function isRef2vaLipSync(workflow: ComfyWorkflow): boolean {
  return isRef2va(workflow) && nodesWithTitle(workflow, COMFYUI_TITLES.audio).length > 0;
}

export type PikaVariant = 'ref2va' | 'fl2va';

/** The Pika H3 Flex variant of a workflow, judged by its MiniMax H3 node; undefined for any other graph. */
export function pikaVariant(workflow: ComfyWorkflow): PikaVariant | undefined {
  return isRef2va(workflow) ? 'ref2va' : isFl2va(workflow) ? 'fl2va' : undefined;
}

/**
 * The Pika H3 Flex variant of a workflow by its model name, read from the
 * workflows folder; undefined when the file is missing (the adapter reports it)
 * or is not a Pika graph.
 */
export function pikaVariantOf(model: string, workflowsDir = defaultWorkflowsDir()): PikaVariant | undefined {
  const name = model.endsWith('.json') ? model : `${model}.json`;
  const path = isAbsolute(name) ? name : join(workflowsDir, name);
  if (!existsSync(path)) return undefined;
  return pikaVariant(parseWorkflow(readFileSync(path, 'utf8'), basename(path)));
}

/**
 * Node titles a Pika H3 Flex workflow must carry. Without one of them the
 * adapter would leave a template value in place (the example image, seed,
 * aspect, or length), so a missing tag is a configuration error.
 */
const PIKA_REQUIRED_TAGS: Record<PikaVariant, ComfyTag[]> = {
  ref2va: ['prompt', 'seed', 'duration', 'resolution', 'output'],
  fl2va: ['prompt', 'seed', 'duration', 'startImage', 'endImage', 'output'],
};

/** The tag as it is written in the Pika exports: `cs:start_image`, `cs:aspect`. */
function pikaTagName(tag: ComfyTag): string {
  return tag === 'resolution' ? 'cs:aspect' : COMFYUI_TITLES[tag].replace(/^cs_/, 'cs:');
}

/** Throw when a Pika H3 Flex workflow misses one of its required node titles. */
export function checkPikaTags(workflow: ComfyWorkflow, label: string): void {
  const variant = pikaVariant(workflow);
  if (!variant) return;
  const missing = PIKA_REQUIRED_TAGS[variant]
    .filter((tag) => nodesWithTitle(workflow, COMFYUI_TITLES[tag]).length === 0)
    .map(pikaTagName);
  if (variant === 'ref2va' && !indexedReferenceNodes(workflow).has(0)) missing.push('cs:ref_0');
  if (isRef2vaLipSync(workflow) && nodesWithTitle(workflow, COMFYUI_TITLES.audioStart).length === 0) {
    missing.push('cs:audio_start');
  }
  if (missing.length > 0) {
    throw new ConfigError(
      `ComfyUI workflow ${label} (Pika H3 Flex ${variant === 'ref2va' ? 'Ref2VA' : 'FL2VA'}) has no node titled ` +
        `${missing.join(', ')}. Title the nodes in ComfyUI and export again (see comfyui/README.md).`,
    );
  }
  if (isRef2vaLipSync(workflow)) checkAudioGuide(workflow, label);
}

/**
 * The vocal of a Pika lip-sync graph must reach the sampler as an anchored
 * soundtrack: a MiniMaxH3AddGuide at frame 0 with the audio VAE, fed from the
 * reference-to-video conditioning and feeding the guider. As a reference audio
 * (`ref_audios`) it would only steer the voice and break the identity.
 */
function checkAudioGuide(workflow: ComfyWorkflow, label: string): void {
  const problems: string[] = [];
  const guides = Object.entries(workflow).filter(([, node]) => node.class_type === 'MiniMaxH3AddGuide');
  const audioGuides = guides.filter(([, node]) => isLink(node.inputs.audio));
  if (audioGuides.length !== 1) problems.push('it needs exactly one MiniMaxH3AddGuide with the vocal on its audio input');
  const [guideId, guide] = audioGuides[0] ?? [];
  if (guide) {
    if (Number(guide.inputs.frame_idx) !== 0) problems.push('the audio guide must start at frame_idx 0');
    if (!isLink(guide.inputs.audio_vae)) problems.push('the audio guide needs the audio VAE');
    const consumers = linksTo(workflow, guideId!).map(([id]) => workflow[id]!.class_type);
    if (!consumers.includes('BasicGuider')) problems.push('the audio guide must feed the guider');
  }
  const ref2va = Object.values(workflow).find((node) => node.class_type === 'MiniMaxH3ReferenceToVideo');
  if (ref2va && Object.keys(ref2va.inputs).some((name) => name.startsWith('ref_audios.'))) {
    problems.push('no reference audio on MiniMaxH3ReferenceToVideo (it breaks identity); the vocal goes through the guide');
  }
  if (problems.length > 0) {
    throw new ConfigError(`ComfyUI workflow ${label} (Pika H3 Flex lip-sync): ${problems.join('; ')}.`);
  }
}

const PIKA_SAMPLER = 'lcm';
const PIKA_SIGMAS = '1.0, 0.972973, 0.923077, 0.8, 0.571429, 0.333333, 0.0';

/** Allowed model files per workflow family, from `comfyui_locks` in config/models.yaml. */
export type ComfyUILocks = ModelsConfig['comfyui_locks'];

/** The `comfyui_locks` key of a Pika variant. */
export const PIKA_LOCK_KEYS: Record<PikaVariant, string> = { ref2va: 'pika-h3-ref2va', fl2va: 'pika-h3-fl2va' };

/**
 * The fixed part of the Pika H3 Flex workflows. In code: sampler lcm, the seven
 * manual sigmas, and exactly one LoRA at 1.0 (Turbo or Lightning LoRAs on top
 * break the output). In config (`comfyui_locks`): which UNet, CLIP, VAE, and
 * LoRA files the variant may load. A workflow that differs is rejected.
 */
export function checkPikaLocks(workflow: ComfyWorkflow, label: string, variant: PikaVariant, locks: ComfyUILocks): void {
  const key = PIKA_LOCK_KEYS[variant];
  const allowed = locks[key];
  if (!allowed) {
    throw new ConfigError(
      `config/models.yaml has no comfyui_locks.${key}: list the model files ${label} may load ` +
        `(${MODEL_FILE_INPUTS.slice(0, 4).join(', ')}).`,
    );
  }
  const problems: string[] = [];
  const nodes = Object.values(workflow);
  const samplers = nodes.filter((node) => node.class_type === 'KSamplerSelect');
  if (samplers.length !== 1 || samplers[0]!.inputs.sampler_name !== PIKA_SAMPLER) {
    problems.push(`sampler must be ${PIKA_SAMPLER}`);
  }
  const sigmas = nodes.filter((node) => node.class_type === 'ManualSigmas');
  const normalized = (value: unknown) => String(value).replace(/\s+/g, '');
  if (sigmas.length !== 1 || normalized(sigmas[0]!.inputs.sigmas) !== normalized(PIKA_SIGMAS)) {
    problems.push(`ManualSigmas must be ${PIKA_SIGMAS}`);
  }
  const loras = nodes.filter((node) => /lora/i.test(node.class_type));
  if (loras.length !== 1 || Number(loras[0]!.inputs.strength_model) !== 1) {
    problems.push(`exactly one LoRA at 1.0 (no Turbo/Lightning LoRAs on top)`);
  }
  for (const node of nodes) {
    for (const input of MODEL_FILE_INPUTS) {
      const file = node.inputs[input];
      if (typeof file !== 'string') continue;
      const list = allowed[input as keyof typeof allowed];
      if (!list) problems.push(`${node.class_type} loads ${input} "${file}", but comfyui_locks.${key} allows no ${input}`);
      else if (!list.includes(file)) {
        problems.push(`${node.class_type} ${input} "${file}" is not in comfyui_locks.${key}.${input} (${list.join(', ')})`);
      }
    }
  }
  if (problems.length > 0) {
    throw new ConfigError(`ComfyUI workflow ${label} breaks the fixed Pika H3 Flex setup: ${problems.join('; ')}.`);
  }
}

/**
 * Wire 1–n uploaded images into the indexed reference slots. Existing
 * `cs_ref_<k>` LoadImage nodes are filled; missing ones are added as copies and
 * linked to the next `ref_image_<k>` input of the node `cs_ref_0` feeds; slots
 * beyond n are removed with their links. Everything is found by title and link,
 * never by node ID.
 */
function setIndexedReferences(workflow: ComfyWorkflow, images: string[], label: string): void {
  const slots = indexedReferenceNodes(workflow);
  const first = slots.get(0);
  if (!first) throw new ConfigError(`ComfyUI workflow ${label} has no node titled cs:ref_0.`);
  const indices = [...slots.keys()].sort((a, b) => a - b);
  if (indices.some((index, position) => index !== position)) {
    throw new ConfigError(`ComfyUI workflow ${label}: reference tags must count cs:ref_0, cs:ref_1, … without gaps.`);
  }
  const [consumerLink, ...more] = linksTo(workflow, first);
  if (!consumerLink || more.length > 0) {
    throw new ConfigError(`ComfyUI workflow ${label}: cs:ref_0 must feed exactly one reference input.`);
  }
  const [consumer, firstInput] = consumerLink;
  const slotMatch = /^(.*?)(\d+)$/.exec(firstInput);
  if (!slotMatch) {
    throw new ConfigError(`ComfyUI workflow ${label}: cs:ref_0 feeds "${firstInput}", which is not a numbered slot.`);
  }
  const prefix = slotMatch[1]!;
  const base = Number(slotMatch[2]);
  const template = workflow[first]!;

  for (const index of indices) {
    const id = slots.get(index)!;
    if (index < images.length) {
      workflow[id]!.inputs.image = images[index];
      continue;
    }
    for (const [user, input] of linksTo(workflow, id)) delete workflow[user]!.inputs[input];
    delete workflow[id];
  }
  for (let index = indices.length; index < images.length; index += 1) {
    // The ID is not a tag, so node_inputs keys like "cs_ref_1.image" never address it by ID.
    let id = `ref_${index}`;
    while (workflow[id]) id = `${id}_`;
    workflow[id] = {
      class_type: template.class_type,
      inputs: { ...template.inputs, image: images[index] },
      _meta: { title: `cs:ref_${index}` },
    };
    workflow[consumer]!.inputs[`${prefix}${base + index}`] = [id, 0];
  }
}

export interface WorkflowInspection {
  /** Titles from COMFYUI_TITLES that are present, with their node IDs. */
  titles: Partial<Record<ComfyTag, string[]>>;
  /** What the workflow saves. */
  kind: ComfyOutputKind;
  /** Operations the workflow fits, judged by its output and its image/audio inputs. */
  operations: Operation[];
  /** Indexed reference slots (`cs_ref_<n>`) in the export. */
  referenceSlots: number;
  warnings: string[];
}

/** Output kind from the class of the cs_output node; video when untagged. */
function outputKind(workflow: ComfyWorkflow, outputIds: string[] | undefined): ComfyOutputKind {
  const classes = (outputIds ?? []).map((id) => workflow[id]!.class_type);
  if (classes.length > 0 && classes.every((name) => /audio/i.test(name))) return 'audio';
  if (classes.length > 0 && classes.every((name) => /image/i.test(name) && !/video|animated/i.test(name))) return 'image';
  return 'video';
}

/** Describe what a workflow accepts; used by the adapter and by `doctor`. */
export function inspectWorkflow(workflow: ComfyWorkflow): WorkflowInspection {
  const titles: WorkflowInspection['titles'] = {};
  for (const [key, title] of Object.entries(COMFYUI_TITLES) as [ComfyTag, string][]) {
    const ids = nodesWithTitle(workflow, title);
    if (ids.length > 0) titles[key] = ids;
  }
  const kind = outputKind(workflow, titles.output);
  const referenceSlots = indexedReferenceNodes(workflow).size;
  const operations: Operation[] = [];
  if (kind === 'audio') operations.push('generateAudio');
  // A video workflow that loads a video restores or upscales it.
  else if (kind === 'video' && titles.video) operations.push('upscaleVideo');
  else if (kind === 'image') operations.push(titles.startImage ? 'editImage' : 'generateImage');
  // Pika Ref2VA with an anchored vocal: identity references plus the voice it is generated to.
  else if (referenceSlots > 0 && titles.audio && isRef2va(workflow)) operations.push('lipSync');
  // Indexed reference images (cs_ref_0 …) are identity anchors, not a start frame.
  else if (referenceSlots > 0) operations.push('referenceToVideo');
  // A video workflow with driving audio lip-syncs a start (and optional end) frame.
  else if (titles.audio) operations.push('lipSync');
  // Pika H3 FL2VA: the end frame is optional, so the same graph also runs image-to-video.
  else if (titles.endImage) {
    operations.push('firstLastFrameToVideo');
    if (isFl2va(workflow)) operations.push('imageToVideo');
  }
  else if (titles.startImage) operations.push('imageToVideo');
  else operations.push('textToVideo');

  const warnings: string[] = [];
  if (!titles.prompt && !titles.video) warnings.push(`no node titled ${COMFYUI_TITLES.prompt}; the prompt cannot be set`);
  if (titles.endImage && !titles.startImage) {
    warnings.push(`${COMFYUI_TITLES.endImage} without ${COMFYUI_TITLES.startImage}`);
  }
  if (kind === 'video' && titles.audio && !titles.startImage && referenceSlots === 0) {
    warnings.push(`${COMFYUI_TITLES.audio} without ${COMFYUI_TITLES.startImage}; lip-sync needs a face frame`);
  }
  if (!titles.seed) warnings.push(`no node titled ${COMFYUI_TITLES.seed}; every run uses the workflow's seed`);
  if (kind === 'video' && !titles.video && !titles.frames && !titles.duration) {
    warnings.push(
      `no node titled ${COMFYUI_TITLES.frames} or ${COMFYUI_TITLES.duration}; clip length cannot follow the shot`,
    );
  }
  if (kind === 'audio' && titles.audio && !titles.transcript) {
    warnings.push(`${COMFYUI_TITLES.audio} without ${COMFYUI_TITLES.transcript}; a voice clone usually needs the reference transcript`);
  }
  if (referenceSlots > 0 && titles.audio && !isRef2va(workflow)) {
    warnings.push('reference-to-video with an audio reference; audio references break identity and are not used');
  }
  return { titles, kind, operations, referenceSlots, warnings };
}

function setTitled(
  workflow: ComfyWorkflow,
  key: ComfyTag,
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

function positiveNumber(value: unknown, name: string, fallback: number): number {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new ConfigError(`ComfyUI param ${name} must be a positive number.`);
  return number;
}

/**
 * Link extra reference images into a node with an autogrow image input, e.g.
 * Qwen's `images.image_1 … image_16`. New LoadImage nodes are added for them.
 */
function addReferenceImages(workflow: ComfyWorkflow, images: string[], label: string): void {
  if (images.length === 0) return;
  const ids = nodesWithTitle(workflow, COMFYUI_TITLES.references);
  if (ids.length === 0) {
    throw new ConfigError(
      `ComfyUI workflow ${label} takes one input image, but the batch item has ${images.length + 1} references. ` +
        `Tag a node with an autogrow image input ${COMFYUI_TITLES.references}, or pass one reference.`,
    );
  }
  const loaders = images.map((image, index) => {
    let id = `ref_${index + 2}`;
    while (workflow[id]) id = `${id}_`;
    workflow[id] = { class_type: 'LoadImage', inputs: { image }, _meta: { title: `Reference ${index + 2}` } };
    return id;
  });
  for (const id of ids) {
    const node = workflow[id]!;
    const slots = Object.keys(node.inputs)
      .map((name) => /^(.*?)(\d+)$/.exec(name))
      .filter((match): match is RegExpExecArray => Boolean(match && /image/i.test(match[1]!)));
    const prefix = slots[0]?.[1] ?? 'images.image_';
    let next = Math.max(0, ...slots.filter((match) => match[1] === prefix).map((match) => Number(match[2]))) + 1;
    for (const loader of loaders) {
      node.inputs[`${prefix}${next}`] = [loader, 0];
      next += 1;
    }
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

/**
 * ResolutionSelector aspect options by width/height ratio. A workflow tagged
 * cs_resolution gets the option that matches the requested output size.
 */
const RESOLUTION_ASPECTS: [string, number][] = [
  ['1:1 (Square)', 1],
  ['2:3 (Portrait Photo)', 2 / 3],
  ['3:2 (Photo)', 3 / 2],
  ['3:4 (Portrait Standard)', 3 / 4],
  ['4:3 (Standard)', 4 / 3],
  ['9:16 (Portrait Widescreen)', 9 / 16],
  ['16:9 (Widescreen)', 16 / 9],
  ['21:9 (Ultrawide)', 21 / 9],
];

export function resolutionAspect(width: number, height: number): string {
  const ratio = width / height;
  const match = RESOLUTION_ASPECTS.find(([, value]) => Math.abs(value - ratio) / value < 0.02);
  if (!match) {
    throw new ConfigError(
      `Output size ${width}x${height} has no matching ResolutionSelector aspect ratio. ` +
        `Supported: ${RESOLUTION_ASPECTS.map(([name]) => name).join(', ')}.`,
    );
  }
  return match[0];
}

/**
 * Frames that fit inside a duration, never more. Lip-sync uses it so the clip
 * never outruns its audio; the dropped remainder is the silent tail of the segment.
 */
export function framesWithin(durationSeconds: number, fps: number, step: number): number {
  const available = Math.floor(durationSeconds * fps + 1e-6);
  if (step <= 1) return Math.max(1, available);
  const blocks = Math.floor((available - 1) / step);
  if (blocks < 1) {
    throw new ConfigError(
      `A ${durationSeconds}s lip-sync segment is too short: it needs at least ${step + 1} frames at ${fps} fps.`,
    );
  }
  return blocks * step + 1;
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
  private locks?: Promise<ComfyUILocks>;

  constructor(options: ComfyUIProviderOptions = {}) {
    this.baseUrl = comfyUIBaseUrl(options.baseUrl);
    this.workflowsDir = options.workflowsDir ?? defaultWorkflowsDir();
    this.requestTimeoutMs = options.requestTimeoutMs ?? 120_000;
    this.generationTimeoutMs =
      options.generationTimeoutMs ?? positiveInt(process.env.COMFYUI_TIMEOUT_MS, 'COMFYUI_TIMEOUT_MS', 3_600_000);
    this.pollIntervalMs = options.pollIntervalMs ?? 2_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.clientId = `coreslopper-${process.pid}`;
    if (options.locks) this.locks = Promise.resolve(options.locks);
  }

  private comfyuiLocks(): Promise<ComfyUILocks> {
    this.locks ??= loadModelsConfig().then((config) => config.comfyui_locks);
    return this.locks;
  }

  async generateImage(input: ProviderInput): Promise<ProviderOutput> {
    return this.run(input, 'generateImage');
  }

  async editImage(input: ProviderInput): Promise<ProviderOutput> {
    if (!input.references?.[0]) throw new Error('editImage requires an input image.');
    return this.run(input, 'editImage');
  }

  async lipSync(input: ProviderInput): Promise<ProviderOutput> {
    if (!input.references?.[0]) throw new Error('lipSync requires a face reference image.');
    if (!input.audio) throw new Error('lipSync requires an audio file.');
    return this.run(input, 'lipSync');
  }

  async generateAudio(input: ProviderInput): Promise<ProviderOutput> {
    return this.run(input, 'generateAudio');
  }

  /**
   * Restore or upscale a clip (`references[0]`). On an out-of-memory failure the
   * run is repeated once with the latent split into temporal chunks.
   */
  async upscaleVideo(input: ProviderInput): Promise<ProviderOutput> {
    if (!input.references?.[0]) throw new Error('upscaleVideo requires the clip as the first reference.');
    try {
      return await this.run(input, 'upscaleVideo');
    } catch (error) {
      if (!isOutOfMemory(error) || input.params?.split_latent === true) throw error;
      console.warn(`ComfyUI ran out of GPU memory on ${input.model}; retrying once with split_latent: true.`);
      try {
        return await this.run({ ...input, params: { ...input.params, split_latent: true } }, 'upscaleVideo');
      } catch (retry) {
        if (!isOutOfMemory(retry)) throw retry;
        throw new Error(
          `ComfyUI ran out of GPU memory on ${input.model} even with split_latent: true. ` +
            'Turn the restore off for this shot (seedvr2: "off"), use restore instead of upscale, or free VRAM.',
        );
      }
    }
  }

  async textToVideo(input: ProviderInput): Promise<ProviderOutput> {
    return this.run(input, 'textToVideo');
  }

  async referenceToVideo(input: ProviderInput): Promise<ProviderOutput> {
    if (!input.references?.[0]) throw new Error('referenceToVideo requires at least one reference image.');
    return this.run(input, 'referenceToVideo');
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
    operation: Operation,
    uploads: ComfyUploads = {},
  ): Promise<ComfyWorkflow> {
    const path = this.workflowPath(input.model);
    const label = basename(path);
    const workflow = parseWorkflow(await readFile(path, 'utf8'), label);
    const inspection = inspectWorkflow(workflow);
    const ref2va = isRef2va(workflow);
    const fl2va = isFl2va(workflow);
    const pikaFlex = ref2va || fl2va;
    // Pika lip-sync takes its face like Ref2VA: as indexed identity references, not a start frame.
    const indexed = operation === 'referenceToVideo' || (ref2va && operation === 'lipSync');
    checkPikaTags(workflow, label);
    const params = input.params ?? {};
    const unknown = Object.keys(params).filter((key) => !ADAPTER_PARAMS.has(key));
    if (unknown.length > 0) {
      throw new ConfigError(
        `Unknown ComfyUI params for ${input.model}: ${unknown.join(', ')}. ` +
          `Allowed: ${[...ADAPTER_PARAMS].join(', ')}. Set other node values with node_inputs.`,
      );
    }
    if (!inspection.operations.includes(operation)) {
      throw new ConfigError(
        `ComfyUI workflow ${label} fits ${inspection.operations.join(', ')} (by its ${COMFYUI_TITLES.output}, ` +
          `image, and audio nodes), but the batch item asks for ${operation}. Use another workflow or role.`,
      );
    }

    // A restore/upscale workflow has no prompt; everything else needs one.
    if (!setTitled(workflow, 'prompt', input.prompt, label) && operation !== 'upscaleVideo') {
      throw new ConfigError(`ComfyUI workflow ${label} needs a node titled ${COMFYUI_TITLES.prompt}.`);
    }
    if (uploads.video) setTitled(workflow, 'video', uploads.video, label);
    if (params.scale !== undefined) {
      setTitled(workflow, 'scale', positiveNumber(params.scale, 'scale', 1), label);
    }
    if (params.color_correction !== undefined) {
      if (typeof params.color_correction !== 'string' || params.color_correction.trim() === '') {
        throw new ConfigError('ComfyUI param color_correction must be a method name, e.g. "lab" or "wavelet".');
      }
      setTitled(workflow, 'colorCorrection', params.color_correction, label);
    }
    for (const [param, tag] of [
      ['split_latent', 'splitLatent'],
      ['turbo', 'turbo'],
    ] as const) {
      if (params[param] === undefined) continue;
      if (typeof params[param] !== 'boolean') throw new ConfigError(`ComfyUI param ${param} must be true or false.`);
      if (!setTitled(workflow, tag, params[param], label)) {
        throw new ConfigError(`ComfyUI workflow ${label} has no node titled ${COMFYUI_TITLES[tag]} for param ${param}.`);
      }
    }
    if (input.negativePrompt) setTitled(workflow, 'negative', input.negativePrompt, label);
    if (uploads.start) setTitled(workflow, 'startImage', uploads.start, label);
    if (uploads.end) setTitled(workflow, 'endImage', uploads.end, label);
    if (fl2va && operation === 'imageToVideo') {
      // No end frame: drop the end LoadImage and its links so the template's example image never leaks in.
      for (const id of inspection.titles.endImage ?? []) {
        for (const [user, name] of linksTo(workflow, id)) delete workflow[user]!.inputs[name];
        delete workflow[id];
      }
    }
    addReferenceImages(workflow, uploads.references ?? [], label);
    if (uploads.audio) setTitled(workflow, 'audio', uploads.audio, label);
    if (indexed) {
      if (operation === 'referenceToVideo' && input.audio) {
        throw new ConfigError(
          `ComfyUI workflow ${label} takes no audio reference: MiniMax H3 loses the subject's identity with one. ` +
            'Describe the sound in overall_soundscape instead.',
        );
      }
      const images = uploads.indexedReferences ?? [];
      const max = params.max_references === undefined ? REF2VA_LIMITS.defaultImages : Number(params.max_references);
      if (!Number.isInteger(max) || max < 1 || max > REF2VA_LIMITS.images) {
        throw new ConfigError(`ComfyUI param max_references must be an integer from 1 to ${REF2VA_LIMITS.images}.`);
      }
      if (images.length < 1) throw new ConfigError(`ComfyUI workflow ${label} needs at least one reference image.`);
      if (images.length > max) {
        throw new ConfigError(
          `The item has ${images.length} reference images; ${label} takes ${max} by default. ` +
            `Merge references, or raise params.max_references (hard limit ${REF2VA_LIMITS.images}).`,
        );
      }
      setIndexedReferences(workflow, images, label);
    }
    if (inspection.kind === 'video' && inspection.titles.audio) {
      // The driving audio is cut in the workflow: start here, length = frames / fps.
      const start = input.audioStartSeconds ?? 0;
      if (!Number.isFinite(start) || start < 0) throw new ConfigError('audioStartSeconds must be 0 or more.');
      setTitled(workflow, 'audioStart', start, label);
    }
    if (inspection.titles.lyrics) {
      if (params.lyrics !== undefined && typeof params.lyrics !== 'string') {
        throw new ConfigError('ComfyUI param lyrics must be a string.');
      }
      // Never let the workflow's demo lyrics leak into a generation.
      setTitled(workflow, 'lyrics', params.lyrics ?? '', label);
    }
    if (inspection.titles.transcript) {
      // A voice clone needs the exact words of its reference recording.
      if (typeof params.transcript !== 'string' || params.transcript.trim() === '') {
        throw new ConfigError(
          `ComfyUI workflow ${label} clones a voice: set params.transcript to the exact text of the reference audio.`,
        );
      }
      setTitled(workflow, 'transcript', params.transcript, label);
    }
    setTitled(workflow, 'seed', input.seed, label);

    // Pika H3 Flex sizes itself (ResolutionSelector or the start frame at ~0.98 MP, multiples of 32).
    const size = pikaFlex ? {} : this.targetSize(input, params);
    if (size.width !== undefined) setTitled(workflow, 'width', size.width, label);
    if (size.height !== undefined) setTitled(workflow, 'height', size.height, label);
    if (inspection.titles.resolution) {
      const width = Number(params.width ?? input.width);
      const height = Number(params.height ?? input.height);
      if (width > 0 && height > 0) setTitled(workflow, 'resolution', resolutionAspect(width, height), label);
      if (params.megapixels !== undefined && !pikaFlex) {
        const megapixels = positiveNumber(params.megapixels, 'megapixels', 1);
        for (const id of inspection.titles.resolution) setNodeInput(workflow, `${id}.megapixels`, megapixels, label);
      }
      if (params.size_multiple !== undefined && !pikaFlex) {
        const multiple = positiveInt(params.size_multiple, 'size_multiple', 1);
        for (const id of inspection.titles.resolution) setNodeInput(workflow, `${id}.multiple`, multiple, label);
      }
    }

    const fps = positiveInt(params.fps, 'fps', 24);
    if (params.fps !== undefined) setTitled(workflow, 'fps', fps, label);
    if (pikaFlex) {
      // The graph rounds the duration to 17n+5 frames at 24 fps itself; frame_step,
      // size_multiple, and megapixels would only shift it, so the shot's own length goes in.
      if (input.durationSeconds === undefined) {
        throw new ConfigError(`ComfyUI workflow ${label} needs durationSeconds; it would fall back to the template's length.`);
      }
      pikaFrames(input.durationSeconds);
      setTitled(workflow, 'duration', input.durationSeconds, label);
      // The two Pika prompt schemas must not mix: the graph reads either one literally.
      if (fl2va) {
        checkFl2vaPrompt(input.prompt, { seconds: input.durationSeconds, lastFrame: operation === 'firstLastFrameToVideo' });
      } else if (fl2vaMarkers(input.prompt).length > 0) {
        throw new ValidationError(
          `ComfyUI workflow ${label} is Ref2VA, but the prompt follows the FL2VA schema (${fl2vaMarkers(input.prompt).join(', ')}). ` +
            'Give a Flex prompt (subject_definitions … non_diegetic_music) or run the item on pika-h3-flf2va.',
        );
      }
    } else if (input.durationSeconds !== undefined) {
      const step = positiveInt(params.frame_step, 'frame_step', 1);
      const frames =
        operation === 'lipSync'
          ? framesWithin(input.durationSeconds, fps, step)
          : framesFor(input.durationSeconds, fps, step);
      const setFrames = setTitled(workflow, 'frames', frames, label);
      // A seconds input: video workflows that derive 8n+1 frames themselves get a
      // length that rounds to the same frame count, so the clip covers the shot.
      const seconds =
        inspection.kind === 'video' && step > 1 ? Number(((frames - 1 + 0.5) / fps).toFixed(4)) : input.durationSeconds;
      const setDuration = setTitled(workflow, 'duration', seconds, label);
      if (!setFrames && !setDuration) {
        throw new ConfigError(
          `ComfyUI workflow ${label} needs a node titled ${COMFYUI_TITLES.frames} or ${COMFYUI_TITLES.duration} ` +
            `so the output can be ${input.durationSeconds}s long.`,
        );
      }
    }

    const nodeInputs = params.node_inputs;
    if (nodeInputs !== undefined) {
      if (!nodeInputs || typeof nodeInputs !== 'object' || Array.isArray(nodeInputs)) {
        throw new ConfigError('ComfyUI param node_inputs must map "<node title or id>.<input>" to a value.');
      }
      for (const [key, value] of Object.entries(nodeInputs)) {
        // The fixed part of a Pika H3 Flex graph is only reachable by node ID; keep it out of reach.
        if (pikaFlex && !key.startsWith('cs:') && !key.startsWith('cs_')) {
          throw new ConfigError(
            `ComfyUI workflow ${label}: node_inputs "${key}" must address a cs: tag. ` +
              'Sampler, sigmas, LoRA, models, and VAEs of the Pika H3 Flex workflow are fixed.',
          );
        }
        setNodeInput(workflow, key, value, label);
      }
    }
    if (pikaFlex) checkPikaLocks(workflow, label, ref2va ? 'ref2va' : 'fl2va', await this.comfyuiLocks());
    // Group the server's outputs per workflow and request.
    const prefix = `coreslopper/${basename(label, '.json')}/${(input.idempotencyKey ?? String(input.seed)).slice(0, 16)}`;
    for (const id of inspection.titles.output ?? []) {
      if (typeof workflow[id]!.inputs.filename_prefix === 'string') workflow[id]!.inputs.filename_prefix = prefix;
    }
    return workflow;
  }

  /** Width and height for the size tags: override, megapixel target, then rounding. */
  private targetSize(input: ProviderInput, params: Record<string, unknown>): { width?: number; height?: number } {
    const rawWidth = params.width ?? input.width;
    const rawHeight = params.height ?? input.height;
    if (rawWidth === undefined && rawHeight === undefined) return {};
    let width = rawWidth === undefined ? undefined : positiveInt(rawWidth, 'width', 1);
    let height = rawHeight === undefined ? undefined : positiveInt(rawHeight, 'height', 1);
    if (params.megapixels !== undefined && width !== undefined && height !== undefined) {
      const factor = Math.sqrt((positiveNumber(params.megapixels, 'megapixels', 1) * 1_000_000) / (width * height));
      width *= factor;
      height *= factor;
    }
    const multiple = positiveInt(params.size_multiple, 'size_multiple', 1);
    return {
      width: width === undefined ? undefined : roundTo(width, multiple),
      height: height === undefined ? undefined : roundTo(height, multiple),
    };
  }

  private async run(input: ProviderInput, operation: Operation): Promise<ProviderOutput> {
    const references = input.references ?? [];
    // Ref2VA, and lip-sync on a Pika Ref2VA graph, wire every reference into cs:ref_<n>.
    const indexed =
      operation === 'referenceToVideo' ||
      (operation === 'lipSync' &&
        isRef2va(parseWorkflow(await readFile(this.workflowPath(input.model), 'utf8'), basename(input.model))));
    const takesStart =
      operation !== 'textToVideo' &&
      operation !== 'generateImage' &&
      operation !== 'generateAudio' &&
      operation !== 'upscaleVideo' &&
      !indexed;
    const extra = operation === 'editImage' ? references.slice(1) : [];
    // Validate the workflow before uploading anything.
    const check = await this.buildPrompt(input, operation, {
      start: 'check.png',
      end: 'check.png',
      references: extra.map(() => 'check.png'),
      audio: 'check.wav',
      video: 'check.mp4',
      indexedReferences: indexed ? references.map(() => 'check.png') : [],
    });
    const inspection = inspectWorkflow(check);
    await this.checkModelFiles(check, basename(this.workflowPath(input.model)));
    const [startPath, endPath] = references;
    const start = takesStart && startPath ? await this.upload(startPath) : undefined;
    // Lip-sync with a single keyframe uses it as start and end frame.
    const end =
      operation === 'firstLastFrameToVideo' || (operation === 'lipSync' && inspection.titles.endImage)
        ? endPath
          ? await this.upload(endPath)
          : start
        : undefined;
    const uploads: ComfyUploads = {
      start,
      end,
      references: await Promise.all(extra.map((path) => this.upload(path))),
      ...(operation === 'upscaleVideo' && startPath ? { video: await this.upload(startPath) } : {}),
      ...(indexed
        ? { indexedReferences: await Promise.all(references.map((path) => this.upload(path))) }
        : {}),
    };
    if (inspection.titles.audio) {
      // Lip-sync: the driving vocals. Voice clone: the reference voice.
      if (!input.audio) {
        throw new ConfigError(
          `ComfyUI workflow ${basename(this.workflowPath(input.model))} needs "audio": ` +
            (inspection.kind === 'audio' ? 'a reference voice recording.' : 'the vocal stem that drives the lip-sync.'),
        );
      }
      uploads.audio = await this.upload(input.audio);
    }
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
    const wanted = files.filter((file) => OUTPUT_EXTENSIONS[inspection.kind].has(extname(file.filename).toLowerCase()));
    if (wanted.length === 0) {
      throw new Error(
        `ComfyUI prompt ${promptId} produced no ${inspection.kind} output` +
          (files.length > 0 ? ` (only ${files.map((file) => file.filename).join(', ')})` : '') +
          (inspection.kind === 'video'
            ? '. Save the clip with a video node (SaveVideo or VHS Video Combine as mp4/webm).'
            : `. Save the result with a ${inspection.kind} save node tagged ${COMFYUI_TITLES.output}.`),
      );
    }
    return { files: await this.download(wanted, input.outputDir, promptId), raw: { prompt_id: promptId, outputs } };
  }

  private readonly modelOptions = new Map<string, Promise<Record<string, string[]> | undefined>>();

  /** Model-file choices per loader input of a node class, from GET /object_info; undefined when unknown. */
  private async loaderOptions(classType: string): Promise<Record<string, string[]> | undefined> {
    let pending = this.modelOptions.get(classType);
    if (!pending) {
      pending = (async () => {
        try {
          const info = await fetchJsonWithRetry(
            'ComfyUI',
            `${this.baseUrl}/object_info/${encodeURIComponent(classType)}`,
            { method: 'GET' },
            this.requestTimeoutMs,
            this.fetchImpl,
          );
          const node = info[classType] as { input?: Record<string, Record<string, unknown>> } | undefined;
          if (!node?.input) return undefined;
          const options: Record<string, string[]> = {};
          for (const group of Object.values(node.input)) {
            for (const [name, spec] of Object.entries(group ?? {})) {
              if (!MODEL_FILE_INPUTS.includes(name) || !Array.isArray(spec)) continue;
              const [first, second] = spec as [unknown, unknown];
              const list = Array.isArray(first)
                ? first
                : (second as { options?: unknown } | undefined)?.options;
              if (Array.isArray(list)) options[name] = list.filter((value): value is string => typeof value === 'string');
            }
          }
          return options;
        } catch {
          // An older server or a test double without /object_info: let the run report problems.
          return undefined;
        }
      })();
      this.modelOptions.set(classType, pending);
    }
    return pending;
  }

  /** Stop before queueing when a model file the workflow loads is not installed. */
  private async checkModelFiles(workflow: ComfyWorkflow, label: string): Promise<void> {
    const missing: string[] = [];
    for (const node of Object.values(workflow)) {
      const inputs = MODEL_FILE_INPUTS.filter((name) => typeof node.inputs[name] === 'string');
      if (inputs.length === 0) continue;
      const options = await this.loaderOptions(node.class_type);
      if (!options) continue;
      for (const name of inputs) {
        const value = node.inputs[name] as string;
        const list = options[name];
        if (list && list.length > 0 && !list.includes(value)) missing.push(`${value} (${node.class_type}.${name})`);
      }
    }
    if (missing.length > 0) {
      throw new ConfigError(
        `ComfyUI at ${this.baseUrl} is missing model files for ${label}: ${[...new Set(missing)].join(', ')}. ` +
          'Install them into the matching ComfyUI models folder and restart ComfyUI.',
      );
    }
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
    return this.uploadData(await readFile(path), extname(path).toLowerCase() || '.png', mimeForPath(path));
  }

  /** Upload into ComfyUI's input/coreslopper/ folder; the name is the content hash. */
  private async uploadData(data: Buffer, extension: string, mime: string): Promise<string> {
    const name = `${createHash('sha256').update(data).digest('hex').slice(0, 16)}${extension}`;
    const form = new FormData();
    form.append('image', new Blob([new Uint8Array(data)], { type: mime }), name);
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

export interface ComfyUIVram {
  device?: string;
  /** Total device memory, GB. */
  totalGb: number;
  /** Memory in use on the device (total minus free), GB. */
  usedGb: number;
  /** Memory PyTorch holds reserved, GB; ComfyUI keeps it after a job, so it approximates the job's peak. */
  torchReservedGb?: number;
}

/** VRAM of the server's first device, or undefined when the server does not report it. */
export async function comfyUIVram(
  baseUrl = comfyUIBaseUrl(),
  fetchImpl: FetchLike = fetch,
  timeoutMs = 3_000,
): Promise<ComfyUIVram | undefined> {
  try {
    const response = await fetchImpl(`${comfyUIBaseUrl(baseUrl)}/system_stats`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return undefined;
    const stats = (await response.json()) as {
      devices?: { name?: string; vram_total?: number; vram_free?: number; torch_vram_total?: number }[];
    };
    const device = stats.devices?.[0];
    if (!device?.vram_total) return undefined;
    const gb = (bytes: number) => Number((bytes / 1024 ** 3).toFixed(2));
    return {
      ...(device.name ? { device: device.name } : {}),
      totalGb: gb(device.vram_total),
      usedGb: gb(device.vram_total - (device.vram_free ?? 0)),
      ...(device.torch_vram_total !== undefined ? { torchReservedGb: gb(device.torch_vram_total) } : {}),
    };
  } catch {
    return undefined;
  }
}

export interface WorkflowFileReport {
  name: string;
  ok: boolean;
  operations?: Operation[];
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
        ok: Boolean(inspection.titles.prompt) || inspection.operations.includes('upscaleVideo'),
        operations: inspection.operations,
        warnings: inspection.warnings,
      });
    } catch (error) {
      reports.push({ name: name.replace(/\.json$/, ''), ok: false, warnings: [], error: (error as Error).message });
    }
  }
  return reports;
}
