import { existsSync } from 'node:fs';
import { readFile, readdir, rm, rmdir } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import {
  ConfigError,
  FlexPromptSchema,
  REF2VA_LIMITS,
  ValidationError,
  assertAffordable,
  checkFlexPrompt,
  checkSpokenText,
  effectiveBatchCap,
  ensureDir,
  estimateCost,
  formatUsd,
  loadModelsConfig,
  loadProject,
  loadSeries,
  providerForRole,
  recordSpend,
  remainingBudget,
  renderFlexPrompt,
  repoRoot,
  resolveModelRole,
  saveState,
  writeJsonAtomic,
  type LoadedProject,
  type LoadedSeries,
  type LipSyncProviderKind,
  type ModelPricing,
  type ProjectConfig,
  type ProviderKind,
} from '@coreslopper/core';
import {
  GenerationRunner,
  clipDurationSeconds,
  createProvider,
  type GenerationRequest,
  type GenerationResult,
  type Operation,
  type Provider,
} from '@coreslopper/providers';
import {
  halfSize,
  imageSize,
  replaceCharacterNames,
  seedvr2Scale,
  takeClipOptions,
  wanSize,
  type ClipOptions,
} from './clip-options.js';
import { muxOriginalAudio, probeDuration } from './media.js';

export const BatchItemSchema = z
  .object({
    operation: z.enum([
      'generateImage',
      'editImage',
      'textToVideo',
      'imageToVideo',
      'firstLastFrameToVideo',
      'referenceToVideo',
      'lipSync',
      'generateAudio',
    ]),
    role: z.string().min(1),
    /** The prompt text. A referenceToVideo item can give `flex` instead. */
    prompt: z.string().min(1).optional(),
    /** referenceToVideo: a structured Flex prompt, rendered into `prompt` (see core/flex.ts). */
    flex: FlexPromptSchema.optional(),
    references: z.array(z.string()).default([]),
    /**
     * Vocals for lipSync: the vocal stem (`audio/stems/vocals.wav`) with
     * `audioStartSeconds`, or a cut segment (see `audio-segment`). For a voice-clone
     * generateAudio, the reference voice. Relative to the project.
     */
    audio: z.string().optional(),
    /** Local lip-sync: where the line starts in `audio`; needs `durationSeconds`. */
    audioStartSeconds: z.number().min(0).optional(),
    seed: z.number().int().optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    durationSeconds: z.number().positive().optional(),
    params: z.record(z.string(), z.unknown()).default({}),
  })
  .refine((item) => item.operation !== 'lipSync' || (item.audio && item.references.length > 0), {
    message: 'lipSync needs "audio" (a vocal segment) and a face image as the first reference.',
  })
  .refine((item) => item.audioStartSeconds === undefined || item.operation === 'lipSync', {
    message: 'audioStartSeconds is only for lipSync.',
  })
  .refine((item) => item.audioStartSeconds === undefined || item.durationSeconds !== undefined, {
    message: 'audioStartSeconds needs durationSeconds: the length of the vocal line plus about 0.3 s of the pause after it.',
  })
  .refine((item) => item.operation !== 'generateAudio' || item.references.length === 0, {
    message: 'generateAudio takes no references.',
  })
  .refine((item) => item.operation !== 'textToVideo' || item.references.length === 0, {
    message: 'textToVideo takes no references; use imageToVideo for a start frame.',
  })
  .refine((item) => item.operation !== 'imageToVideo' || item.references.length >= 1, {
    message: 'imageToVideo needs a start frame as the first reference.',
  })
  .refine((item) => item.operation !== 'firstLastFrameToVideo' || item.references.length === 2, {
    message: 'firstLastFrameToVideo needs exactly two references: the start frame, then the end frame.',
  })
  .refine((item) => item.operation !== 'lipSync' || item.references.length <= 2, {
    message: 'lipSync takes a start frame and an optional end frame.',
  })
  .refine((item) => (item.prompt === undefined) !== (item.flex === undefined), {
    message: 'Give either "prompt" or "flex", not both and not neither.',
  })
  .refine((item) => item.flex === undefined || item.operation === 'referenceToVideo', {
    message: '"flex" prompts are only for referenceToVideo.',
  })
  .refine(
    (item) =>
      item.operation !== 'referenceToVideo' ||
      (item.references.length >= 1 && item.references.length <= REF2VA_LIMITS.images),
    { message: `referenceToVideo needs 1 to ${REF2VA_LIMITS.images} reference images (<Picture 1> first).` },
  )
  .refine((item) => item.operation !== 'referenceToVideo' || item.audio === undefined, {
    message: 'referenceToVideo takes no audio reference: it breaks identity. Describe the sound in overall_soundscape.',
  })
  .transform((item) => ({ ...item, prompt: item.prompt ?? renderFlexPrompt(item.flex!) }));

/** Lip-sync must be driven by isolated vocals, never by the full mix. */
function checkVocalSource(audio: string, projectRoot: string): void {
  const audioDir = resolve(projectRoot, 'audio');
  if (dirname(audio) === audioDir && /^song\./i.test(basename(audio))) {
    throw new ValidationError(
      `Lip-sync audio ${basename(audio)} is the full mix. Use the isolated vocal stem at audio/stems/vocals.wav: ` +
        'export it from the song session and register it with `npm run cli -- import-song <project>`, or let ' +
        '`audio-analysis` separate it with Demucs (it writes audio/stems/vocals.wav). Then set "audio" to ' +
        'audio/stems/vocals.wav with audioStartSeconds, or cut a segment from it with `audio-segment`.',
    );
  }
}

/** Lip-sync providers that are told the length of the driving audio as durationSeconds. */
const LENGTH_FROM_AUDIO = new Set<ProviderKind>(['comfyui', 'higgsfield', 'topview']);

const VIDEO_OPERATIONS = new Set(['textToVideo', 'imageToVideo', 'firstLastFrameToVideo', 'referenceToVideo', 'lipSync']);

/** Reference-to-video aspect by project kind: music videos are 16:9, episodes 9:16. */
const REF2VA_ASPECT = { 'music-video': { label: '16:9', ratio: 16 / 9 }, episode: { label: '9:16', ratio: 9 / 16 } } as const;

export const BatchSchema = z.array(BatchItemSchema).min(1);

export interface GenerateOptions {
  projectDir: string;
  /** Run the batch for this series canon instead of a project. */
  seriesDir?: string;
  batchPath: string;
  dryRun?: boolean;
  /** Override the project provider for this batch (lip-sync keeps its own provider). */
  provider?: ProviderKind;
  /** Override `providers.lipsync` for the lipSync items of this batch. */
  lipsyncProvider?: LipSyncProviderKind;
}

export interface ResolvedItem {
  item: z.infer<typeof BatchItemSchema>;
  provider: ProviderKind;
  model: string;
  params: Record<string, unknown>;
  pricing: ModelPricing;
  cost: number;
  references: string[];
  audio?: string;
  audioStartSeconds?: number;
  durationSeconds?: number;
  /** The prompt sent to the provider; Wan gets character descriptions instead of names. */
  prompt?: string;
  /** Local clip options (video_model, quality, SeedVR2) and what they resolved to, for the log. */
  clip?: ClipOptions;
  /** SeedVR2 pass after a final local clip. */
  restore?: { mode: 'restore' | 'upscale'; scale: number; colorCorrection: string; model: string; params: Record<string, unknown> };
  /** Log lines: backend, quality, size, SeedVR2 mode. */
  notes?: string[];
}

/** The configuration a batch needs: providers, model overrides, master size, and the batch cap. */
export type BatchConfig = Pick<ProjectConfig, 'providers' | 'models' | 'formats' | 'batch_cap_usd'> &
  Partial<Pick<ProjectConfig, 'kind'>>;

/**
 * Where a batch runs: a project, or a series canon. It owns the budget the
 * batch is checked against, the asset folder and manifest, and how spend is saved.
 */
export interface BatchTarget {
  label: string;
  config: BatchConfig;
  state: { budget: { totalUsd: number; spentUsd: number; reservedUsd: number }; updatedAt: string };
  paths: { root: string; assets: string; manifest: string };
  /** Characters whose names Wan prompts replace with their descriptions. */
  characters?: { id: string; name: string; description: string }[];
  saveState(): Promise<void>;
}

export function projectTarget(project: LoadedProject): BatchTarget {
  return {
    label: 'project',
    config: project.config,
    state: project.state,
    paths: project.paths,
    characters: project.characters?.characters ?? [],
    saveState: () => saveState(project.paths.state, project.state),
  };
}

/** A series canon as a batch target; canon generations need a series budget. */
export function seriesTarget(loaded: LoadedSeries): BatchTarget {
  const { series, state, paths } = loaded;
  if (series.budget_usd === undefined) {
    throw new ConfigError(`series.yaml of "${series.slug}" has no budget_usd; canon generations need a series budget.`);
  }
  if (Math.abs(state.budget.totalUsd - series.budget_usd) > 1e-9) {
    throw new ValidationError(
      `${paths.state} budget (${state.budget.totalUsd}) does not match series.yaml budget_usd (${series.budget_usd}).`,
    );
  }
  return {
    label: 'series',
    config: { providers: series.providers, models: {}, formats: series.formats, batch_cap_usd: series.batch_cap_usd },
    state,
    paths,
    saveState: () => writeJsonAtomic(paths.state, state),
  };
}

function roleOverride(config: BatchConfig, role: string): Record<string, unknown> {
  const value = config.models[role];
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Moved to core with the episode rules; re-exported for existing callers. */
export { checkSpokenText };

function resolveItem(
  item: z.infer<typeof BatchItemSchema>,
  config: BatchConfig,
  models: Awaited<ReturnType<typeof loadModelsConfig>>,
  projectRoot: string,
  providerOverride?: ProviderKind,
  characters: { id: string; name: string; description: string }[] = [],
  lipsyncOverride?: LipSyncProviderKind,
): ResolvedItem {
  const role = models.roles[item.role];
  if (!role) throw new ValidationError(`Unknown model role "${item.role}". Add it to config/models.yaml.`);
  const override = roleOverride(config, item.role);
  const chosen =
    item.operation === 'lipSync'
      ? (lipsyncOverride ?? providerForRole(config, item.role))
      : (providerOverride ?? providerForRole(config, item.role));
  // Reference-to-video exists only as the local Pika H3 Flex workflow; the mock keeps CI offline.
  const provider: ProviderKind = item.operation === 'referenceToVideo' && chosen !== 'mock' ? 'comfyui' : chosen;
  if (item.operation === 'generateAudio' && provider !== 'comfyui' && provider !== 'mock') {
    throw new ConfigError(`Only the ComfyUI backend generates audio, but role "${item.role}" resolved to ${provider}.`);
  }
  if (item.operation === 'generateAudio' && item.role.startsWith('audio.voice')) checkSpokenText(item.prompt);
  if (item.audioStartSeconds !== undefined && provider !== 'comfyui' && provider !== 'mock') {
    throw new ValidationError(
      `audioStartSeconds needs the local lip-sync workflow; ${provider} takes a cut segment. ` +
        'Cut the line with `audio-segment` and drop audioStartSeconds.',
    );
  }
  const resolved = resolveModelRole(role, provider, override, item.role);
  const { workflow, ...merged } = { ...resolved.params, ...item.params };
  const { options: clip, rest } = takeClipOptions(merged);
  let params = rest;
  if (provider === 'comfyui' && clip.videoModel === 'wan') {
    if (item.operation === 'lipSync') {
      throw new ValidationError(
        'Lip-sync shots always run on LTX: Wan 2.2 makes no sound and cannot follow a vocal. Remove video_model: "wan".',
      );
    }
    if (VIDEO_OPERATIONS.has(item.operation) && item.operation !== 'imageToVideo') {
      throw new ValidationError(
        `Wan 2.2 is image-to-video only; ${item.operation} needs LTX. Remove video_model: "wan" or give one start frame.`,
      );
    }
  }
  // `workflow` picks another local workflow for this item (e.g. a slower quality
  // variant). It only applies on ComfyUI; cloud providers keep the role's model.
  if (workflow !== undefined && (typeof workflow !== 'string' || workflow.trim() === '')) {
    throw new ValidationError('params.workflow must be the name of a workflow in comfyui/workflows/.');
  }
  if (provider === 'comfyui' && typeof workflow === 'string') resolved.model = workflow;
  const pricing =
    resolved.pricing ??
    (provider === 'mock' || provider === 'comfyui' ? ({ unit: 'request', usd: 0 } satisfies ModelPricing) : undefined);
  if (!pricing) {
    throw new ConfigError(
      `Role "${item.role}" has no pricing entry for provider "${provider}". ` +
        'Add pricing to config/models.yaml or override models.<role>.pricing in project.yaml.',
    );
  }

  const audio = item.audio
    ? resolve(item.audio.startsWith('/') ? item.audio : join(projectRoot, item.audio))
    : undefined;
  if (audio && !existsSync(audio)) {
    throw new ValidationError(`Missing audio input: ${audio}`);
  }
  if (audio && item.operation === 'lipSync') checkVocalSource(audio, projectRoot);
  // A lip-sync clip is billed by the length of its driving audio: the cut
  // window when the stem is cut in the workflow, else the whole segment.
  const fileSeconds = audio ? probeDuration(audio) : undefined;
  if (item.audioStartSeconds !== undefined && fileSeconds !== undefined) {
    const end = item.audioStartSeconds + (item.durationSeconds ?? 0);
    if (end > fileSeconds + 0.05) {
      throw new ValidationError(
        `Lip-sync window ${item.audioStartSeconds}-${end.toFixed(2)} s runs past the end of ${item.audio} (${fileSeconds.toFixed(2)} s).`,
      );
    }
  }
  const exactAudioSeconds = item.audioStartSeconds !== undefined ? item.durationSeconds : fileSeconds;
  const audioSeconds = exactAudioSeconds === undefined ? undefined : Math.ceil(exactAudioSeconds);
  // For generateAudio the audio is a reference voice, not the output length.
  if (
    item.operation === 'lipSync' &&
    audioSeconds !== undefined &&
    resolved.maxDuration &&
    audioSeconds > resolved.maxDuration
  ) {
    throw new ValidationError(
      `Audio ${item.audio} is ${audioSeconds}s; role "${item.role}" allows at most ${resolved.maxDuration}s.`,
    );
  }

  // A lip-sync model with fixed clip lengths (`durations`, `min_duration`) bills
  // the clip it renders, which can be longer than the driving audio.
  const lipSyncSeconds =
    item.operation === 'lipSync' && audioSeconds !== undefined
      ? 'durations' in params || 'min_duration' in params
        ? clipDurationSeconds(exactAudioSeconds, params)
        : audioSeconds
      : undefined;
  const units =
    pricing.unit === 'second'
      ? lipSyncSeconds ?? clipDurationSeconds(item.durationSeconds, params)
      : pricing.unit === 'image'
        ? Number(params.num_images ?? params.batch_size ?? 1)
        : 1;
  const cost = estimateCost(units, pricing);

  const references = item.references.map((reference) =>
    resolve(reference.startsWith('/') ? reference : join(projectRoot, reference)),
  );
  for (const reference of references) {
    if (!existsSync(reference)) {
      throw new ValidationError(`Missing reference image: ${reference}`);
    }
  }

  if (item.operation === 'referenceToVideo') {
    checkFlexPrompt(item.prompt, references.length);
    if (config.kind) {
      const want = REF2VA_ASPECT[config.kind];
      const { width, height } = { width: item.width ?? config.formats.master.width, height: item.height ?? config.formats.master.height };
      if (Math.abs(width / height - want.ratio) / want.ratio > 0.02) {
        throw new ValidationError(
          `referenceToVideo renders ${want.label} for ${config.kind === 'episode' ? 'an episode' : 'a music video'}, but the item asks for ${width}x${height}. ` +
            `Drop width/height or fix formats.master.`,
        );
      }
    }
  }

  // Local clips: pick LTX or Wan, the render size for draft/final, and the SeedVR2 pass.
  let prompt = item.prompt;
  let restore: ResolvedItem['restore'];
  const notes: string[] = [];
  const localVideo = provider === 'comfyui' && VIDEO_OPERATIONS.has(item.operation);
  const setOptions = Object.keys(item.params).filter((key) =>
    ['video_model', 'quality', 'seedvr2', 'color_correction', 'turbo'].includes(key),
  );
  if (!localVideo && setOptions.length > 0) {
    notes.push(`${setOptions.join(', ')} ignored: only local clips (comfyui) use them`);
  }
  if (localVideo) {
    const master = config.formats.master;
    const own = Object.fromEntries(
      Object.entries(item.params).filter(
        ([key]) => key !== 'workflow' && !['video_model', 'quality', 'seedvr2', 'color_correction', 'turbo'].includes(key),
      ),
    );
    const ownSize = ['width', 'height', 'megapixels'].some((key) => key in own);
    let render: { width: number; height: number };
    if (clip.videoModel === 'wan') {
      const wanRole = models.roles['video.wan'];
      if (!wanRole) throw new ConfigError('Role "video.wan" is missing from config/models.yaml.');
      const wan = resolveModelRole(wanRole, 'comfyui', roleOverride(config, 'video.wan'), 'video.wan');
      resolved.model = typeof workflow === 'string' ? workflow : wan.model;
      const start = imageSize(references[0]!);
      const size = wanSize(start.width / start.height, clip.quality);
      // The shot role's LTX params (megapixels, 8n+1 frames, 24 fps) do not apply to Wan.
      params = { ...wan.params, width: size.width, height: size.height, turbo: clip.turbo, ...own };
      render = { width: Number(params.width), height: Number(params.height) };
      prompt = replaceCharacterNames(item.prompt, characters);
      notes.push(
        `video_model wan · quality ${clip.quality} · turbo ${clip.turbo ? 'on' : 'off'} · ${render.width}x${render.height}` +
          ' · 16 fps, RIFE x3 to 48 fps, no sound',
      );
    } else if (item.operation === 'referenceToVideo') {
      // The graph sizes itself with a ResolutionSelector: the aspect of the request and ~1 MP.
      const megapixels = Number(params.megapixels ?? 0.98);
      const width = item.width ?? master.width;
      const height = item.height ?? master.height;
      const factor = Math.sqrt((megapixels * 1_000_000) / (width * height));
      render = { width: Math.round(width * factor), height: Math.round(height * factor) };
      const max = Number(params.max_references ?? REF2VA_LIMITS.defaultImages);
      notes.push(
        `pika-h3 ref2va · ${references.length}/${max} reference(s) · quality ${clip.quality} · about ` +
          `${render.width}x${render.height} · 24 fps, 17n+5 frames · clip sound (SFX, dialogue), no score`,
      );
    } else {
      if (clip.quality === 'final' && !ownSize) {
        const target =
          clip.seedvr2 === 'upscale'
            ? halfSize(master)
            : { width: Math.ceil(master.width / 64) * 64, height: Math.ceil(master.height / 64) * 64 };
        if (item.operation === 'lipSync') {
          // The lip-sync graph sizes itself with a ResolutionSelector: aspect + megapixels.
          params = { ...params, megapixels: Number(((target.width * target.height) / 1_000_000).toFixed(3)) };
        } else {
          const { megapixels: _drop, ...withoutMegapixels } = params;
          params = { ...withoutMegapixels, width: target.width, height: target.height };
        }
        render = target;
      } else if (params.width !== undefined && params.height !== undefined) {
        render = { width: Number(params.width), height: Number(params.height) };
      } else {
        const megapixels = Number(params.megapixels ?? (master.width * master.height) / 1_000_000);
        const factor = Math.sqrt((megapixels * 1_000_000) / (master.width * master.height));
        render = { width: Math.round(master.width * factor), height: Math.round(master.height * factor) };
      }
      notes.push(`video_model ltx · quality ${clip.quality} · about ${render.width}x${render.height}`);
    }
    if (clip.seedvr2 !== 'off') {
      const upscaleRole = models.roles['video.upscale'];
      if (!upscaleRole) throw new ConfigError('Role "video.upscale" is missing from config/models.yaml.');
      const upscale = resolveModelRole(upscaleRole, 'comfyui', roleOverride(config, 'video.upscale'), 'video.upscale');
      const scale = seedvr2Scale(clip.seedvr2, render, master);
      restore = {
        mode: clip.seedvr2,
        scale,
        colorCorrection: clip.colorCorrection,
        model: upscale.model,
        params: { ...upscale.params, scale, color_correction: clip.colorCorrection },
      };
      notes.push(`seedvr2 ${clip.seedvr2} x${scale} · color_correction ${clip.colorCorrection}`);
    }
  }

  return {
    item,
    provider,
    model: resolved.model,
    params,
    pricing,
    cost,
    references,
    audio,
    prompt,
    notes,
    ...(localVideo ? { clip } : {}),
    ...(restore ? { restore } : {}),
    ...(item.audioStartSeconds !== undefined ? { audioStartSeconds: item.audioStartSeconds } : {}),
    // A local lip-sync workflow sets its clip length from the driving audio, and
    // Higgsfield and Topview pick their clip length from it (fal reads the audio itself).
    durationSeconds:
      item.durationSeconds ??
      (LENGTH_FROM_AUDIO.has(provider) && item.operation === 'lipSync' && exactAudioSeconds !== undefined
        ? Number(exactAudioSeconds.toFixed(3))
        : undefined),
  };
}

/**
 * The provider request for a resolved batch item. Values come from the resolved
 * item, not the raw batch entry: a local lip-sync item gets its length from the
 * probed vocal segment there.
 */
export function toRequest(
  item: ResolvedItem,
  master: { width: number; height: number },
  outputDir: string,
  projectDir: string,
): GenerationRequest {
  return {
    operation: item.item.operation as Operation,
    role: item.item.role,
    model: item.model,
    prompt: item.prompt ?? item.item.prompt,
    seed: item.item.seed,
    references: item.references,
    audio: item.audio,
    ...(item.audioStartSeconds !== undefined ? { audioStartSeconds: item.audioStartSeconds } : {}),
    width: item.item.width ?? master.width,
    height: item.item.height ?? master.height,
    durationSeconds: item.durationSeconds,
    params: item.params,
    outputDir,
    projectDir,
    estimatedCostUsd: item.cost,
  };
}

export type BatchItem = z.infer<typeof BatchItemSchema>;

export interface BatchRunOptions {
  dryRun?: boolean;
  /** Override the project provider for this batch (lip-sync keeps its own provider). */
  provider?: ProviderKind;
  /** Override `providers.lipsync` for the lipSync items of this batch. */
  lipsyncProvider?: LipSyncProviderKind;
  /** Build the provider adapter, e.g. for another ComfyUI server; default `createProvider`. */
  providerFactory?: (kind: ProviderKind) => Provider;
  /** Extra cache-key material (see GenerationRunnerOptions.cacheKey). */
  cacheKey?: Record<string, unknown>;
  /** Print the per-item and summary lines; default true. */
  log?: boolean;
}

export interface BatchRunResult {
  resolved: ResolvedItem;
  /** Undefined on a dry run. */
  result?: GenerationResult;
  /** The SeedVR2 result next to the clip (`<clip>_upscaled.mp4`), when one ran. */
  upscaled?: string;
}

/**
 * Run batch items through estimate, budget, cache, and manifest. Every
 * command that generates media goes through here. Returns one entry per item,
 * in order; a dry run only estimates.
 */
export async function runBatch(
  project: BatchTarget,
  batch: BatchItem[],
  options: BatchRunOptions = {},
): Promise<BatchRunResult[]> {
  const log = options.log === false ? () => undefined : (...args: unknown[]) => console.log(...args);
  const models = await loadModelsConfig();
  const resolved = batch.map((item) => {
    const value = resolveItem(
      item,
      project.config,
      models,
      project.paths.root,
      options.provider,
      project.characters,
      options.lipsyncProvider,
    );
    return value.provider === 'mock' || value.provider === 'comfyui' ? { ...value, cost: 0 } : value;
  });
  const totalEstimate = resolved.reduce((sum, item) => sum + item.cost, 0);

  log(`Batch: ${resolved.length} generation(s), worst-case estimate ${formatUsd(totalEstimate)}`);
  log(
    `Budget: ${formatUsd(remainingBudget(project.state))} remaining · batch cap ${formatUsd(
      effectiveBatchCap(project.config, project.state),
    )}`,
  );
  assertAffordable(project.config, project.state, totalEstimate, `${project.label} generation batch`);
  if (options.dryRun) {
    for (const item of resolved) {
      log(
        `  ${item.item.operation} ${item.item.role} -> ${item.provider}/${item.model} (${formatUsd(item.cost)})`,
      );
      for (const note of item.notes ?? []) log(`    ${note}`);
    }
    return resolved.map((item) => ({ resolved: item }));
  }

  const cacheDir = join(repoRoot(), '.cache', 'generations');
  const runners = new Map<ProviderKind, GenerationRunner>();
  for (const provider of new Set(resolved.map((item) => item.provider))) {
    runners.set(
      provider,
      new GenerationRunner({
        provider: (options.providerFactory ?? createProvider)(provider),
        cacheDir,
        manifestPath: project.paths.manifest,
        ...(options.cacheKey ? { cacheKey: options.cacheKey } : {}),
      }),
    );
  }

  const results: BatchRunResult[] = [];
  let actualSpend = 0;
  let cacheHits = 0;
  for (const [index, item] of resolved.entries()) {
    const runner = runners.get(item.provider);
    if (!runner) throw new ConfigError(`No generation runner for provider "${item.provider}".`);
    const outputDir = join(project.paths.assets, item.item.role.replaceAll('.', '/'));
    await ensureDir(outputDir);
    const request = toRequest(item, project.config.formats.master, outputDir, project.paths.root);
    for (const note of item.notes ?? []) log(`[${index + 1}/${resolved.length}] ${item.item.role}: ${note} · seed ${request.seed ?? 'auto'}`);
    const result = await runner.run(request);
    let upscaled: string | undefined;
    if (item.restore) {
      upscaled = await restoreClip(runner, item, result, outputDir, project.paths.root);
      log(
        `[${index + 1}/${resolved.length}] ${item.item.role}: seedvr2 ${item.restore.mode} x${item.restore.scale}, ` +
          `color_correction ${item.restore.colorCorrection}, seed ${result.seed} -> ${relative(project.paths.root, upscaled)}`,
      );
    }
    results.push({ resolved: item, result, ...(upscaled ? { upscaled } : {}) });
    if (result.cached) {
      cacheHits += 1;
      log(`[${index + 1}/${resolved.length}] ${item.item.role}: cache hit ${result.hash.slice(0, 12)}`);
    } else {
      actualSpend += result.costUsd;
      recordSpend(project.state, result.costUsd);
      await project.saveState();
      log(
        `[${index + 1}/${resolved.length}] ${item.item.role}: ${result.files.length} file(s), ${formatUsd(result.costUsd)}`,
      );
    }
  }

  log(
    `Done. Actual spend ${formatUsd(actualSpend)} · cache hits ${cacheHits}/${resolved.length} · remaining ${formatUsd(
      remainingBudget(project.state),
    )}`,
  );
  return results;
}

/**
 * SeedVR2 pass for a final local clip. The restored clip goes next to the
 * original as `<clip>_upscaled.mp4` with the original's audio stream copied back;
 * the original is never touched. The pass runs through the same cache and manifest.
 */
async function restoreClip(
  runner: GenerationRunner,
  item: ResolvedItem,
  clip: GenerationResult,
  outputDir: string,
  projectRoot: string,
): Promise<string> {
  const restore = item.restore!;
  const source = clip.files.find((file) => ['.mp4', '.webm', '.mov', '.mkv'].includes(extname(file).toLowerCase()));
  if (!source) throw new Error(`SeedVR2: the clip for ${item.item.role} produced no video file.`);
  const rawDir = join(outputDir, 'seedvr2');
  const pass = await runner.run({
    operation: 'upscaleVideo',
    role: 'video.upscale',
    model: restore.model,
    prompt: `SeedVR2 ${restore.mode}`,
    // The clip's seed, so a re-render reproduces the same restore.
    seed: clip.seed,
    references: [source],
    params: restore.params,
    outputDir: rawDir,
    projectDir: projectRoot,
    estimatedCostUsd: 0,
  });
  const raw = pass.files[0];
  if (!raw) throw new Error('SeedVR2 returned no file.');
  const target = join(dirname(source), `${basename(source, extname(source))}_upscaled.mp4`);
  muxOriginalAudio(raw, source, target);
  await rm(raw, { force: true });
  if ((await readdir(rawDir).catch(() => ['keep'])).length === 0) await rmdir(rawDir).catch(() => undefined);
  return target;
}

export async function generateBatch(options: GenerateOptions): Promise<void> {
  const project = options.seriesDir
    ? seriesTarget(await loadSeries(options.seriesDir))
    : projectTarget(await loadProject(options.projectDir));
  const batchRaw = await readFile(resolve(options.batchPath), 'utf8');
  let batchData: unknown;
  try {
    batchData = JSON.parse(batchRaw);
  } catch {
    batchData = parseYaml(batchRaw);
  }
  const batch = BatchSchema.parse(batchData);
  await runBatch(project, batch, {
    dryRun: options.dryRun,
    provider: options.provider,
    lipsyncProvider: options.lipsyncProvider,
  });
}
