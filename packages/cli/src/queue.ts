import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { copyFile, readFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import {
  BudgetError,
  ConfigError,
  ValidationError,
  ensureDir,
  loadProject,
  resolveAnchor,
  type LoadedProject,
  type ProviderKind,
  type Shot,
} from '@coreslopper/core';
import { pikaVariantOf } from '@coreslopper/providers';
import { comfyRestart, comfyRestartCommand } from './comfy.js';
import { BatchItemSchema, projectTarget, resolveOut, runBatch } from './generate.js';
import { clipFrame } from './image-ops.js';
import { reviewImage, type ImageVerdict } from './review-image.js';

/**
 * The generation queue of a project: `assets/queue.json`. One `queue run`
 * process generates the items one after the other (one GPU), reviews every
 * result in the background, files passed results at their `out` path, and puts
 * a failed image back with the reviewer's fix prompt. Clips and exhausted
 * images wait as `needs-fix` for the stage runner.
 */

export const QUEUE_STATUSES = ['pending', 'generating', 'reviewing', 'passed', 'needs-fix', 'error'] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

const ReviewTargetSchema = z
  .object({ shot: z.string().optional(), ref: z.string().optional() })
  .refine((value) => Boolean(value.shot) !== Boolean(value.ref), { message: 'review needs either "shot" or "ref".' });

const AttemptSchema = z.object({
  n: z.number().int().positive(),
  /** The attempt's file, relative to the project. */
  file: z.string(),
  seed: z.number().int().optional(),
  provider: z.string().optional(),
  verdict: z.enum(['pass', 'fail']).optional(),
  score: z.number().optional(),
  issues: z.array(z.string()).optional(),
  fix_prompt: z.string().optional(),
});

const EntrySchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['image', 'clip', 'audio']),
  /** The batch item as `generate` takes it (without the queue keys). */
  item: z.record(z.string(), z.unknown()),
  /** Where the approved result is filed, relative to the project. */
  out: z.string().min(1),
  review: ReviewTargetSchema.optional(),
  /** Ids that must have passed first. An id that is not in the queue counts as done. */
  after: z.array(z.string()).default([]),
  /** A clip whose last frame becomes this item's first reference (frame chaining). */
  chainFrom: z.string().optional(),
  /** Provider for the next attempt only (the cloud fallback); cleared after it ran. */
  provider: z.string().optional(),
  status: z.enum(QUEUE_STATUSES).default('pending'),
  /** Number of the attempt that runs next, or of the last one. */
  attempt: z.number().int().positive().default(1),
  /** Position in the queue; a requeued item gets a new, higher one. */
  order: z.number().int().default(0),
  /** What the next review checks first: the blocking issues of the last attempt. */
  focus: z.string().optional(),
  attempts: z.array(AttemptSchema).default([]),
  note: z.string().optional(),
  error: z.string().optional(),
});

const QueueSchema = z.object({ version: z.literal(1).default(1), items: z.array(EntrySchema).default([]) });

export type QueueEntry = z.infer<typeof EntrySchema>;
export type QueueAttempt = z.infer<typeof AttemptSchema>;
export type Queue = z.infer<typeof QueueSchema>;

/** A batch item with the queue keys, as `queue add --batch` reads it. */
const QueueItemInputSchema = z
  .object({
    id: z.string().min(1),
    out: z.string().min(1),
    review: ReviewTargetSchema.optional(),
    after: z.array(z.string()).default([]),
    chainFrom: z.string().optional(),
  })
  .passthrough();

export type QueueItemInput = z.input<typeof QueueItemInputSchema>;

const IMAGE_OPERATIONS = new Set(['generateImage', 'editImage']);

export function queuePath(assetsDir: string): string {
  return join(assetsDir, 'queue.json');
}

export function loadQueue(assetsDir: string): Queue {
  const path = queuePath(assetsDir);
  if (!existsSync(path)) return { version: 1, items: [] };
  return QueueSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

/**
 * Read, change, and write the queue in one synchronous step, so `queue add`,
 * `retry`, and `accept` can change it while `queue run` works on it.
 */
export function updateQueue<T>(assetsDir: string, change: (queue: Queue) => T): T {
  const queue = loadQueue(assetsDir);
  const result = change(queue);
  const path = queuePath(assetsDir);
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(queue, null, 2)}\n`);
  renameSync(temporary, path);
  return result;
}

function entryOf(queue: Queue, id: string): QueueEntry {
  const entry = queue.items.find((item) => item.id === id) ?? queue.items.find((item) => item.id.endsWith(`:${id}`) && queue.items.filter((other) => other.id.endsWith(`:${id}`)).length === 1);
  if (!entry) throw new ValidationError(`No queue item "${id}". Run \`queue status\` for the ids.`);
  return entry;
}

function nextOrder(queue: Queue): number {
  return Math.max(0, ...queue.items.map((item) => item.order)) + 1;
}

function kindOf(operation: unknown): QueueEntry['kind'] {
  if (operation === 'generateAudio') return 'audio';
  return IMAGE_OPERATIONS.has(String(operation)) ? 'image' : 'clip';
}

/** `assets/keyframes/shot-008.png` + 2 → `assets/keyframes/attempts/shot-008-a2.png`. */
export function attemptPath(out: string, attempt: number, extension = extname(out)): string {
  return join(dirname(out), 'attempts', `${basename(out, extname(out))}-a${attempt}${extension}`);
}

/** A stable seed for an item without one, so a rerun hits the cache. */
function stableSeed(id: string): number {
  let hash = 7;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 900_000;
  return 1000 + hash;
}

// ---------------------------------------------------------------------------
// Adding items
// ---------------------------------------------------------------------------

export interface AddResult {
  added: string[];
  replaced: string[];
  skipped: string[];
}

/** Add items to the queue. An id that is already queued is skipped, or reset with `replace`. */
export function addToQueue(project: LoadedProject, inputs: QueueItemInput[], options: { replace?: boolean } = {}): AddResult {
  const parsed = inputs.map((input) => QueueItemInputSchema.parse(input));
  for (const input of parsed) {
    resolveOut(project.paths.root, input.out, project.paths.series);
    const { id: _id, out: _out, review: _review, after: _after, chainFrom: _chain, ...item } = input;
    // Fail on a malformed item now, not in the middle of a run.
    BatchItemSchema.parse(item);
    if (input.chainFrom && !(item.references as unknown[] | undefined)?.length) {
      throw new ValidationError(`${input.id}: chainFrom needs the chain start frame as the first reference.`);
    }
  }
  const result: AddResult = { added: [], replaced: [], skipped: [] };
  updateQueue(project.paths.assets, (queue) => {
    for (const input of parsed) {
      const { id, out, review, after, chainFrom, ...item } = input;
      const existing = queue.items.find((entry) => entry.id === id);
      if (existing && !options.replace) {
        result.skipped.push(id);
        continue;
      }
      if (existing && (existing.status === 'generating' || existing.status === 'reviewing')) {
        throw new ValidationError(`${id} is ${existing.status}; wait for it before replacing it.`);
      }
      const entry: QueueEntry = EntrySchema.parse({
        id,
        kind: kindOf(item.operation),
        item,
        out,
        ...(review ? { review } : {}),
        after: [...new Set([...after, ...(chainFrom ? [chainFrom] : [])])],
        ...(chainFrom ? { chainFrom } : {}),
        order: nextOrder(queue),
        // A replaced item keeps counting its attempts, so files and verdicts stay apart.
        attempt: existing ? Math.max(existing.attempt, ...existing.attempts.map((attempt) => attempt.n)) + 1 : 1,
        attempts: existing?.attempts ?? [],
      });
      if (existing) {
        queue.items[queue.items.indexOf(existing)] = entry;
        result.replaced.push(id);
      } else {
        queue.items.push(entry);
        result.added.push(id);
      }
    }
  });
  return result;
}

export interface ShotItemOptions {
  kind: 'keyframe' | 'clip';
  /** Shot ids; default every shot that has the prompt. `001`, `shot-001`, and ranges `003-007` work. */
  shots?: string[];
  role?: string;
  /** Local workflow for every item (`params.workflow`), e.g. `qwen-edit-quality`, `pika-h3-flf2va`. */
  workflow?: string;
  /** Per-item changes, keyed by item id or shot id; merged over the built item. */
  overrides?: Record<string, Record<string, unknown>>;
}

export interface ShotItems {
  items: QueueItemInput[];
  /** Shots left out, with the reason. */
  skipped: { shot: string; reason: string }[];
}

/** Expand `001`, `shot-004`, `003-007` to shot ids. */
export function expandShotIds(values: string[]): string[] {
  const ids: string[] = [];
  const pad = (n: number) => `shot-${String(n).padStart(3, '0')}`;
  for (const value of values) {
    const text = value.replace(/shot-/g, '');
    const range = /^(\d+)-(\d+)$/.exec(text);
    if (range) {
      for (let n = Number(range[1]); n <= Number(range[2]); n += 1) ids.push(pad(n));
    } else if (/^\d+$/.test(text)) {
      ids.push(pad(Number(text)));
    } else {
      throw new ValidationError(`"${value}" is not a shot id or range (001, shot-004, 003-007).`);
    }
  }
  return [...new Set(ids)];
}

/**
 * The reference images of a shot in the fixed order of the keyframe prompt:
 * the plate (image 1), then per character its state reference (its sheet when
 * the shot names no state), then the props. Paths are relative to the project.
 */
export function shotReferences(project: LoadedProject, shot: Shot): string[] {
  const canon = project.paths.series ?? project.paths.root;
  const missing: string[] = [];
  const references: string[] = [];
  const add = (label: string, ref: string | undefined) => {
    if (!ref) return void missing.push(`${label} has no reference image`);
    const path = join(canon, ref);
    if (!existsSync(path)) return void missing.push(`${label}: ${relative(project.paths.root, path)} does not exist`);
    references.push(relative(project.paths.root, path));
  };
  if (shot.refs.plate) {
    const [setId, plateId] = shot.refs.plate.split('/');
    const plate = project.sets?.sets.find((set) => set.id === setId)?.plates.find((entry) => entry.id === plateId);
    if (!plate) missing.push(`plate ${shot.refs.plate} is not in sets.yaml`);
    else add(`plate ${shot.refs.plate}`, plate.ref);
  }
  for (const characterId of new Set([...shot.refs.characters, ...Object.keys(shot.refs.states)])) {
    const character = project.characters?.characters.find((entry) => entry.id === characterId);
    if (!character) {
      missing.push(`character ${characterId} is not in characters.yaml`);
      continue;
    }
    const stateId = shot.refs.states[characterId];
    if (stateId) {
      const state = character.states.find((entry) => entry.id === stateId);
      if (!state) missing.push(`state ${characterId}/${stateId} is not in characters.yaml`);
      else add(`state ${characterId}/${stateId}`, state.ref);
    } else {
      add(`character ${characterId}`, character.sheet ?? character.refs[0]);
    }
  }
  for (const propId of shot.refs.props) {
    const prop = project.sets?.props.find((entry) => entry.id === propId);
    if (!prop) missing.push(`prop ${propId} is not in sets.yaml`);
    else add(`prop ${propId}`, prop.refs[0]);
  }
  if (missing.length > 0) {
    throw new ValidationError(`${shot.id}: create these references first (character-bible, style-bible).`, missing);
  }
  return references;
}

function clipSeconds(project: LoadedProject, shot: Shot): number {
  const planned = Number(shot.motion?.props.clipSeconds);
  if (Number.isFinite(planned) && planned > 0) return planned;
  if (!project.effectiveTiming) throw new ValidationError(`${shot.id}: set motion.props.clipSeconds, or run the timing stage first.`);
  const seconds = resolveAnchor(shot.end, project.effectiveTiming) - resolveAnchor(shot.start, project.effectiveTiming);
  return Math.min(10, Math.max(2, Math.ceil(seconds)));
}

function isFl2va(workflow: string): boolean {
  return pikaVariantOf(workflow) === 'fl2va' || /pika-h3-fl[f]?2va/.test(workflow);
}

/**
 * A plain clip prompt as a Pika FL2VA prompt: one shot that starts on the
 * keyframe, with the sentences after "Sound:" as the soundscape. A shot that
 * needs time marks or several beats gets a hand-written `fl2va` override.
 */
export function fl2vaFromPlain(prompt: string): { shots: string[]; soundscape: string } {
  const text = prompt.trim();
  const sound = /\bSound:\s*([\s\S]+)$/i.exec(text);
  const action = (sound ? text.slice(0, sound.index) : text).trim();
  if (/\[Shot \d+\]|^[a-z_]+:/m.test(action) || /<(Picture|Subject) \d+>/.test(action)) {
    throw new ValidationError('The clip prompt already carries a Pika schema; pass it as an "fl2va" or "flex" override instead.');
  }
  return {
    shots: [`The shot begins exactly on Picture 1. ${action}`],
    soundscape: sound ? sound[1]!.trim() : 'Natural ambient sound of the scene. Nobody speaks.',
  };
}

/**
 * Build queue items for shots straight from `storyboard.yaml`: a keyframe from
 * `prompts.keyframe` and the shot's references, or a clip from `prompts.video`
 * and the keyframe. What the storyboard cannot say (a structured Pika prompt,
 * an end frame, another seed) comes in through `overrides`.
 */
export function buildShotItems(project: LoadedProject, options: ShotItemOptions): ShotItems {
  const storyboard = project.storyboard;
  if (!storyboard) throw new ValidationError(`storyboard.yaml is missing in ${project.paths.root}.`);
  const wanted = options.shots?.length ? expandShotIds(options.shots) : undefined;
  for (const id of wanted ?? []) {
    if (!storyboard.shots.some((shot) => shot.id === id)) throw new ValidationError(`Shot ${id} is not in storyboard.yaml.`);
  }
  const items: QueueItemInput[] = [];
  const skipped: ShotItems['skipped'] = [];
  for (const shot of storyboard.shots) {
    if (wanted && !wanted.includes(shot.id)) continue;
    const number = Number(shot.id.slice(5));
    const skip = (reason: string) => {
      if (wanted) skipped.push({ shot: shot.id, reason });
    };
    const chained = shot.chaining?.enabled && shot.chaining.from ? shot.chaining.from : undefined;
    let item: QueueItemInput;
    if (options.kind === 'keyframe') {
      if (!shot.prompts?.keyframe) {
        skip('no prompts.keyframe');
        continue;
      }
      if (chained) {
        skip(`chained: its start frame is the last frame of the ${chained} clip`);
        continue;
      }
      const references = shotReferences(project, shot);
      const workflow = options.workflow ?? (typeof shot.motion?.props.keyframeWorkflow === 'string' ? shot.motion.props.keyframeWorkflow : undefined);
      item = {
        id: `keyframe:${shot.id}`,
        out: `assets/keyframes/${shot.id}.png`,
        review: { shot: shot.id },
        operation: references.length > 0 ? 'editImage' : 'generateImage',
        role: options.role ?? (references.length > 0 ? 'image.edit' : 'image.keyframe'),
        prompt: shot.prompts.keyframe,
        references,
        seed: 1000 + number,
        ...(workflow ? { params: { workflow } } : {}),
      };
    } else {
      if (shot.lipSync) {
        skip('lip-sync shot: build its item by hand (ai-clips, lip-sync step)');
        continue;
      }
      if (!shot.prompts?.video) {
        skip('no prompts.video');
        continue;
      }
      if (shot.asset && !new RegExp(`^assets/clips/${shot.id}(_upscaled)?\\.[a-z0-9]+$`).test(shot.asset)) {
        skip(`its asset is ${shot.asset}: a still or another shot's clip, nothing to generate`);
        continue;
      }
      const start = chained ? `assets/keyframes/chain/${shot.id}-start.png` : `assets/keyframes/${shot.id}.png`;
      item = {
        id: `clip:${shot.id}`,
        out: `assets/clips/${shot.id}.mp4`,
        review: { shot: shot.id },
        after: chained ? [] : [`keyframe:${shot.id}`],
        ...(chained ? { chainFrom: `clip:${chained}` } : {}),
        operation: 'imageToVideo',
        role: options.role ?? 'video.image_to_video.quality',
        ...(options.workflow && isFl2va(options.workflow) ? { fl2va: fl2vaFromPlain(shot.prompts.video) } : { prompt: shot.prompts.video }),
        references: [start],
        durationSeconds: clipSeconds(project, shot),
        seed: 2000 + number,
        ...(options.workflow ? { params: { workflow: options.workflow } } : {}),
      };
    }
    const override = options.overrides?.[item.id] ?? options.overrides?.[shot.id];
    if (override) {
      const { params, ...rest } = override;
      item = { ...item, ...rest } as QueueItemInput;
      if (params && typeof params === 'object') item.params = { ...((item.params as object) ?? {}), ...params };
      // A structured prompt replaces the storyboard's plain one.
      if (rest.flex !== undefined || rest.fl2va !== undefined) delete (item as Record<string, unknown>).prompt;
    }
    items.push(item);
  }
  return { items, skipped };
}

export async function readJsonOrYaml(path: string): Promise<unknown> {
  const raw = await readFile(resolve(path), 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return parseYaml(raw);
  }
}

// ---------------------------------------------------------------------------
// Retry, accept, drop
// ---------------------------------------------------------------------------

export interface RetryOptions {
  /** New prompt for the next attempt. */
  prompt?: string;
  /** Item fields to merge in (e.g. a rewritten `fl2va`, other references), from a JSON file. */
  item?: Record<string, unknown>;
  /** Provider for this one attempt, e.g. the cloud fallback. */
  provider?: ProviderKind;
  seed?: number;
}

/**
 * Put an item back into the queue. Without changes, an attempt that was never
 * reviewed is only reviewed again; otherwise the next attempt is generated, with
 * a new seed and the last blocking issues as the review focus.
 */
export function retryItem(assetsDir: string, id: string, options: RetryOptions = {}): QueueEntry {
  return updateQueue(assetsDir, (queue) => {
    const entry = entryOf(queue, id);
    if (entry.status === 'generating' || entry.status === 'reviewing') {
      throw new ValidationError(`${entry.id} is ${entry.status}; wait for it.`);
    }
    const last = entry.attempts.at(-1);
    const changed = options.prompt !== undefined || options.item !== undefined || options.provider !== undefined || options.seed !== undefined;
    entry.error = undefined;
    entry.note = undefined;
    if (!changed && last && last.verdict === undefined && entry.review) {
      entry.status = 'reviewing';
      return entry;
    }
    if (options.item) {
      const { params, ...rest } = options.item;
      Object.assign(entry.item, rest);
      if (params && typeof params === 'object') entry.item.params = { ...((entry.item.params as object) ?? {}), ...params };
      if (rest.flex !== undefined || rest.fl2va !== undefined) delete entry.item.prompt;
    }
    if (options.prompt !== undefined) {
      entry.item.prompt = options.prompt;
      delete entry.item.flex;
      delete entry.item.fl2va;
    }
    BatchItemSchema.parse(entry.item);
    if (last) {
      entry.attempt = Math.max(entry.attempt, last.n) + 1;
      entry.item.seed = options.seed ?? Number(entry.item.seed ?? last.seed ?? stableSeed(entry.id)) + 1;
      const blocking = (last.issues ?? []).filter((issue) => !/^\W*note\b/i.test(issue));
      entry.focus = blocking.length > 0 ? blocking.join('; ') : entry.focus;
    } else if (options.seed !== undefined) {
      entry.item.seed = options.seed;
    }
    if (options.provider) entry.provider = options.provider;
    entry.status = 'pending';
    entry.order = nextOrder(queue);
    return entry;
  });
}

/** The attempt to keep when none passed: the best score, the later one on a tie. */
export function bestAttempt(entry: QueueEntry): QueueAttempt | undefined {
  return [...entry.attempts].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.n - a.n)[0];
}

/**
 * Approve an item by hand (the user's eye overrides the reviewer): file the
 * given attempt, or the best one, at `out` and unlock what derives from it.
 */
export async function acceptItem(project: LoadedProject, id: string, attempt?: number, note?: string): Promise<QueueEntry> {
  const queue = loadQueue(project.paths.assets);
  const current = entryOf(queue, id);
  const chosen = attempt === undefined ? bestAttempt(current) : current.attempts.find((entry) => entry.n === attempt);
  if (!chosen) throw new ValidationError(`${current.id} has no attempt${attempt === undefined ? '' : ` ${attempt}`} to accept.`);
  const source = join(project.paths.root, chosen.file);
  if (!existsSync(source)) throw new ValidationError(`Missing attempt file: ${source}`);
  const out = resolveOut(project.paths.root, current.out, project.paths.series);
  await ensureDir(dirname(out));
  await copyFile(source, out);
  return updateQueue(project.paths.assets, (fresh) => {
    const entry = entryOf(fresh, current.id);
    entry.status = 'passed';
    entry.error = undefined;
    entry.note = `accepted attempt ${chosen.n}${note ? `: ${note}` : ''}`;
    return entry;
  });
}

export function dropItem(assetsDir: string, id: string): QueueEntry {
  return updateQueue(assetsDir, (queue) => {
    const entry = entryOf(queue, id);
    if (entry.status === 'generating' || entry.status === 'reviewing') throw new ValidationError(`${entry.id} is ${entry.status}; wait for it.`);
    queue.items.splice(queue.items.indexOf(entry), 1);
    return entry;
  });
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/** Pending items that can never start: something they wait for needs a fix or failed. */
export function blockedBy(queue: Queue, entry: QueueEntry): string[] {
  return entry.after.filter((id) => {
    const dependency = queue.items.find((item) => item.id === id);
    return dependency !== undefined && (dependency.status === 'needs-fix' || dependency.status === 'error');
  });
}

function ready(queue: Queue, entry: QueueEntry): boolean {
  return entry.after.every((id) => {
    const dependency = queue.items.find((item) => item.id === id);
    return dependency === undefined || dependency.status === 'passed';
  });
}

export function formatQueue(queue: Queue): string {
  if (queue.items.length === 0) return 'The queue is empty.';
  const width = Math.max(...queue.items.map((entry) => entry.id.length));
  const lines = [...queue.items]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((entry) => {
      const last = entry.attempts.at(-1);
      const blocked = entry.status === 'pending' ? blockedBy(queue, entry) : [];
      const detail =
        entry.status === 'needs-fix' || entry.status === 'error'
          ? [entry.note, entry.error, ...(last?.verdict === 'fail' ? (last.issues ?? []).filter((issue) => !/^\W*note\b/i.test(issue)) : [])]
              .filter(Boolean)
              .join(' | ')
          : blocked.length > 0
            ? `waits for ${blocked.join(', ')}`
            : (entry.note ?? '');
      const score = last?.score !== undefined ? String(last.score).padStart(2) : ' -';
      return `${entry.id.padEnd(width)}  ${entry.status.padEnd(10)}  a${entry.attempt}  ${score}  ${detail.slice(0, 400)}`.trimEnd();
    });
  const count = (status: QueueStatus) => queue.items.filter((entry) => entry.status === status).length;
  const summary = QUEUE_STATUSES.map((status) => [status, count(status)] as const)
    .filter(([, n]) => n > 0)
    .map(([status, n]) => `${n} ${status}`)
    .join(', ');
  return `${lines.join('\n')}\n${summary}`;
}

// ---------------------------------------------------------------------------
// Lock
// ---------------------------------------------------------------------------

function lockPath(assetsDir: string): string {
  return join(assetsDir, 'queue.lock');
}

/** The pid of a live `queue run` on this project, if any. */
export function runningPid(assetsDir: string): number | undefined {
  const path = lockPath(assetsDir);
  if (!existsSync(path)) return undefined;
  const pid = Number(readFileSync(path, 'utf8').trim());
  if (!Number.isInteger(pid) || pid <= 0) return undefined;
  try {
    process.kill(pid, 0);
    return pid;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export interface Generated {
  /** The generated file (absolute). */
  file: string;
  seed?: number;
  provider: string;
}

export interface QueueDeps {
  /** Generate one item; default `runBatch` (estimate, budget, cache, manifest). */
  generate(project: LoadedProject, entry: QueueEntry): Promise<Generated>;
  /** Review one attempt; default `reviewImage` (a clip by its frames). */
  review(project: LoadedProject, entry: QueueEntry, file: string, attempt: number): Promise<Pick<ImageVerdict, 'verdict' | 'score' | 'issues' | 'fix_prompt'>>;
  /** Write the last frame of a clip to `output`; default ffmpeg. */
  lastFrame(clip: string, output: string): Promise<unknown>;
  /** Restart the generation backend after a failed or hung generation; undefined when none is configured. */
  restart?: () => Promise<void>;
  log(line: string): void;
}

export interface QueueRunOptions {
  /** Attempts per item before it waits for the runner (the cloud fallback is the runner's call); default 3. */
  maxAttempts?: number;
  /** Reviews that run at once; default 2. */
  reviews?: number;
  /** Tries per generation when the backend fails; default 2. */
  tries?: number;
  /** Seconds after which a generation counts as hung; default 1500. */
  timeoutSeconds?: number;
  deps?: Partial<QueueDeps>;
}

export interface QueueRunResult {
  passed: string[];
  needsFix: string[];
  errors: string[];
  /** Pending items that wait for an item that needs a fix. */
  blocked: string[];
}

function defaultDeps(): QueueDeps {
  return {
    async generate(project, entry) {
      const item = BatchItemSchema.parse({ ...entry.item, id: entry.id });
      const fresh = await loadProject(project.paths.root);
      const [done] = await runBatch(projectTarget(fresh), [item], {
        ...(entry.provider ? { provider: entry.provider as ProviderKind } : {}),
        log: false,
      });
      const file = done?.upscaled ?? done?.result?.files[0];
      if (!file) throw new ValidationError(`${entry.id}: the generation returned no file.`);
      return { file, seed: done?.result?.seed, provider: done?.resolved.provider ?? 'unknown' };
    },
    review(project, entry, file, attempt) {
      const target = { shot: entry.review?.shot, ref: entry.review?.ref, attempt, focus: entry.focus };
      return reviewImage(project.paths.root, entry.kind === 'clip' ? { ...target, clip: file } : { ...target, images: [file] });
    },
    lastFrame: (clip, output) => clipFrame(clip, 'last', output),
    ...(comfyRestartCommand() ? { restart: () => comfyRestart() } : {}),
    log: (line) => console.log(`${new Date().toTimeString().slice(0, 8)} ${line}`),
  };
}

class Timeout extends Error {}

function withTimeout<T>(promise: Promise<T>, seconds: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Timeout(`no result after ${seconds} s`)), seconds * 1000);
  });
  promise.catch(() => undefined);
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Work the queue until nothing can move: generate ready items in order, review
 * each result in the background, requeue failed images with the fix prompt.
 * Budget and credential problems stop the run; a single broken item does not.
 */
export async function runQueue(projectDir: string, options: QueueRunOptions = {}): Promise<QueueRunResult> {
  const project = await loadProject(projectDir);
  const assets = project.paths.assets;
  const deps: QueueDeps = { ...defaultDeps(), ...options.deps };
  const maxAttempts = options.maxAttempts ?? 3;
  const maxReviews = Math.max(1, options.reviews ?? 2);
  const tries = Math.max(1, options.tries ?? 2);
  const timeoutSeconds = options.timeoutSeconds ?? 1500;

  const other = runningPid(assets);
  if (other && other !== process.pid) throw new ValidationError(`A queue run is already working on this project (pid ${other}). Follow it with \`queue wait\`.`);
  await ensureDir(assets);
  writeFileSync(lockPath(assets), String(process.pid));

  const reviews = new Map<string, Promise<void>>();
  const patch = (id: string, change: (entry: QueueEntry, queue: Queue) => void) =>
    updateQueue(assets, (queue) => {
      const entry = queue.items.find((item) => item.id === id);
      if (entry) change(entry, queue);
    });

  const startReview = (entry: QueueEntry, attempt: QueueAttempt) => {
    const file = join(project.paths.root, attempt.file);
    const task = (async () => {
      try {
        const verdict = await deps.review(project, entry, file, attempt.n);
        const blocking = verdict.issues.filter((issue) => !/^\W*note\b/i.test(issue));
        if (verdict.verdict === 'pass') {
          const out = resolveOut(project.paths.root, entry.out, project.paths.series);
          await ensureDir(dirname(out));
          await copyFile(file, out);
        }
        patch(entry.id, (current, queue) => {
          const record = current.attempts.find((item) => item.n === attempt.n);
          if (record) Object.assign(record, { verdict: verdict.verdict, score: verdict.score, issues: verdict.issues, fix_prompt: verdict.fix_prompt });
          if (verdict.verdict === 'pass') {
            current.status = 'passed';
            current.note = undefined;
            deps.log(`pass  ${current.id} a${attempt.n} (${verdict.score}) -> ${current.out}`);
            return;
          }
          const fix = verdict.fix_prompt.trim();
          const canFix = current.kind === 'image' && fix !== '' && fix.toLowerCase() !== 'none';
          if (canFix && current.attempts.length < maxAttempts) {
            current.item.prompt = fix;
            current.item.seed = Number(current.item.seed ?? attempt.seed ?? stableSeed(current.id)) + 1;
            current.attempt = attempt.n + 1;
            current.focus = blocking.join('; ') || undefined;
            current.order = nextOrder(queue);
            current.status = 'pending';
            deps.log(`fail  ${current.id} a${attempt.n} (${verdict.score}): requeued as a${current.attempt} with the fix prompt`);
            return;
          }
          current.status = 'needs-fix';
          current.focus = blocking.join('; ') || undefined;
          current.note =
            current.kind === 'image'
              ? `${current.attempts.length} attempt(s) failed: one cloud attempt (queue retry --provider), a patch, or queue accept`
              : 'rewrite the prompt from the issues, then queue retry';
          deps.log(`fail  ${current.id} a${attempt.n} (${verdict.score}): needs a fix`);
        });
      } catch (error) {
        patch(entry.id, (current) => {
          current.status = 'error';
          current.error = `review: ${error instanceof Error ? error.message : String(error)}`.slice(0, 500);
        });
        deps.log(`error ${entry.id} a${attempt.n}: review failed (queue retry reviews it again)`);
      }
    })().finally(() => reviews.delete(entry.id));
    reviews.set(entry.id, task);
  };

  const generate = async (entry: QueueEntry): Promise<void> => {
    patch(entry.id, (current) => {
      current.status = 'generating';
      current.error = undefined;
    });
    try {
      if (entry.chainFrom) {
        const from = loadQueue(assets).items.find((item) => item.id === entry.chainFrom);
        const clip = resolveOut(project.paths.root, from?.out ?? `assets/clips/${entry.chainFrom.replace(/^clip:/, '')}.mp4`);
        if (!existsSync(clip)) throw new ValidationError(`${entry.id}: the clip it chains from is missing: ${relative(project.paths.root, clip)}`);
        const first = (entry.item.references as string[])[0]!;
        await deps.lastFrame(clip, resolve(project.paths.root, first));
      }
      let generated: Generated | undefined;
      let failure: unknown;
      for (let attempt = 1; attempt <= tries && !generated; attempt += 1) {
        try {
          deps.log(`gen   ${entry.id} a${entry.attempt}${attempt > 1 ? ` (try ${attempt})` : ''}`);
          generated = await withTimeout(deps.generate(project, entry), timeoutSeconds);
        } catch (error) {
          if (error instanceof BudgetError || error instanceof ConfigError) throw error;
          // A malformed item fails the same way every time.
          if (error instanceof ValidationError || error instanceof z.ZodError) throw error;
          failure = error;
          deps.log(`      ${entry.id}: ${error instanceof Error ? error.message.slice(0, 300) : String(error)}`);
          if (attempt < tries && deps.restart) await deps.restart();
          else if (error instanceof Timeout && !deps.restart) break;
        }
      }
      if (!generated) throw failure ?? new Error('generation failed');

      const out = resolveOut(project.paths.root, entry.out, project.paths.series);
      const attemptFile = attemptPath(out, entry.attempt, extname(generated.file) || extname(out));
      await ensureDir(dirname(attemptFile));
      await copyFile(generated.file, attemptFile);
      const record: QueueAttempt = {
        n: entry.attempt,
        file: relative(project.paths.root, attemptFile),
        ...(generated.seed !== undefined ? { seed: generated.seed } : {}),
        provider: generated.provider,
      };
      if (!entry.review) {
        await ensureDir(dirname(out));
        await copyFile(generated.file, out);
      }
      patch(entry.id, (current) => {
        current.attempts = [...current.attempts.filter((item) => item.n !== record.n), record];
        current.provider = undefined;
        current.status = current.review ? 'reviewing' : 'passed';
      });
      if (entry.review) startReview(entry, record);
      else deps.log(`done  ${entry.id} -> ${entry.out}`);
    } catch (error) {
      if (error instanceof BudgetError || error instanceof ConfigError) {
        patch(entry.id, (current) => {
          current.status = 'pending';
        });
        throw error;
      }
      const message = error instanceof z.ZodError ? error.issues.map((issue) => issue.message).join('; ') : error instanceof Error ? error.message : String(error);
      patch(entry.id, (current) => {
        current.status = 'error';
        current.error = message.slice(0, 500);
      });
      deps.log(`error ${entry.id}: ${message.slice(0, 300)}`);
    }
  };

  try {
    // Left over from a killed run: generate again (the cache answers), review again.
    for (const entry of loadQueue(assets).items) {
      if (entry.status === 'generating') patch(entry.id, (current) => void (current.status = 'pending'));
    }
    for (;;) {
      const queue = loadQueue(assets);
      for (const entry of queue.items) {
        if (entry.status !== 'reviewing' || reviews.has(entry.id)) continue;
        const last = entry.attempts.at(-1);
        if (!last) patch(entry.id, (current) => void (current.status = 'pending'));
        else if (reviews.size < maxReviews) startReview(entry, last);
      }
      const next = queue.items
        .filter((entry) => entry.status === 'pending' && ready(queue, entry))
        .sort((a, b) => a.order - b.order)[0];
      if (next) {
        // Generation never waits for a review, unless too many are open already.
        while (reviews.size >= maxReviews + 2) await Promise.race(reviews.values());
        await generate(next);
        continue;
      }
      if (reviews.size > 0) {
        await Promise.race(reviews.values());
        continue;
      }
      if (queue.items.some((entry) => entry.status === 'reviewing')) continue;
      break;
    }
  } finally {
    await Promise.allSettled(reviews.values());
    rmSync(lockPath(assets), { force: true });
  }

  const final = loadQueue(assets);
  const ids = (status: QueueStatus) => final.items.filter((entry) => entry.status === status).map((entry) => entry.id);
  return {
    passed: ids('passed'),
    needsFix: ids('needs-fix'),
    errors: ids('error'),
    blocked: final.items.filter((entry) => entry.status === 'pending').map((entry) => entry.id),
  };
}

// ---------------------------------------------------------------------------
// Wait
// ---------------------------------------------------------------------------

export interface WaitResult {
  /** `needs-fix`/`error`: an item wants the runner. `finished`: no run is active. `timeout`: still running. */
  reason: 'needs-fix' | 'finished' | 'timeout';
  changes: string[];
}

/**
 * Block until the queue needs the runner: an item turned `needs-fix` or `error`,
 * the run ended, or the timeout passed. Replaces sleep loops around a background run.
 */
export async function waitForQueue(
  assetsDir: string,
  options: { timeoutSeconds?: number; pollMs?: number } = {},
): Promise<WaitResult> {
  const deadline = Date.now() + (options.timeoutSeconds ?? 540) * 1000;
  const snapshot = new Map(loadQueue(assetsDir).items.map((entry) => [entry.id, `${entry.status} a${entry.attempt}`]));
  const diff = () =>
    loadQueue(assetsDir)
      .items.filter((entry) => snapshot.get(entry.id) !== `${entry.status} a${entry.attempt}`)
      .map((entry) => `${entry.id}: ${snapshot.get(entry.id) ?? 'new'} -> ${entry.status} a${entry.attempt}`);
  const wantsRunner = () =>
    loadQueue(assetsDir).items.some(
      (entry) => (entry.status === 'needs-fix' || entry.status === 'error') && !snapshot.get(entry.id)?.startsWith(entry.status),
    );
  for (;;) {
    if (wantsRunner()) return { reason: 'needs-fix', changes: diff() };
    if (!runningPid(assetsDir)) return { reason: 'finished', changes: diff() };
    if (Date.now() >= deadline) return { reason: 'timeout', changes: diff() };
    await new Promise((resolvePromise) => setTimeout(resolvePromise, options.pollMs ?? 2000));
  }
}
