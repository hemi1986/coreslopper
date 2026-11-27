import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';
import {
  ConfigError,
  PLATFORM_LIMITS,
  ProjectConfigSchema,
  TakesSchema,
  ValidationError,
  buildReleasePlan,
  loadChannel,
  loadProject,
  memeCaption,
  memeDescription,
  platformLimits,
  projectPaths,
  readJsonFile,
  readYamlFile,
  releaseForm,
  repoRoot,
  SHORT_FORM_MAX_SECONDS,
  soundLicenceTodos,
  upToThreeMinutes,
  type PlatformLimits,
  type ProjectConfig,
  type PublishEntry,
  type PublishLog,
  type PublishPlatform,
  type ReleasePlan,
  type ReleaseShape,
  type ShortsSource,
  type UploadData,
  type UploadMain,
  type UploadShort,
  type UsedSound,
} from '@coreslopper/core';
import {
  MockPublisher,
  TIKTOK_LIMITS,
  TikTokPublisher,
  YOUTUBE_QUOTA,
  YouTubePublisher,
  failureClass,
  redactSecrets,
  resolveTikTokCredentials,
  resolveYouTubeCredentials,
  tiktokCaption,
  withFailureClass,
  youtubeDailyQuota,
  type PublishAdapter,
  type PublishItem,
} from '@coreslopper/providers';
import { appendPublishEntry, readPublishLog } from './release-records.js';
import { loadReleasePlan, usedLibrarySounds } from './release.js';
import { releaseLabels } from './release-texts.js';
import { loadUploadData } from './upload-text.js';

/** YouTube limits that `publish` checks before an upload; the text limits come from the one table. */
export const YOUTUBE_LIMITS = {
  titleChars: PLATFORM_LIMITS.youtube.title,
  descriptionBytes: PLATFORM_LIMITS.youtube.description_bytes,
  tagChars: PLATFORM_LIMITS.youtube.tags,
  hashtags: PLATFORM_LIMITS.youtube.hashtags,
  thumbnailBytes: 2 * 1024 * 1024,
  shortSeconds: SHORT_FORM_MAX_SECONDS,
  /** Longest upload of a channel that has not verified its phone number. */
  unverifiedSeconds: 15 * 60,
} as const;

export type PlatformChoice = PublishPlatform | 'all';

export interface VideoProbe {
  width: number;
  height: number;
  duration: number;
}

export interface PublishOptions {
  projectDir: string;
  /** The workspace root the sound library lives in; defaults to the repository root of the working directory. */
  root?: string;
  platform?: PlatformChoice;
  /** `main`, `shorts`, or a Short name. */
  only?: string;
  /** ISO date for a scheduled YouTube publication. */
  schedule?: string;
  dryRun?: boolean;
  force?: boolean;
  /** Use the mock adapters: no network, entries marked as mock. */
  mock?: boolean;
  now?: () => Date;
  /** Width, height, and duration of a video; throws when it cannot probe (no ffprobe). */
  probe?: (path: string) => VideoProbe;
  /** Adapters to use instead of the configured ones (tests). */
  adapters?: Partial<Record<PublishPlatform, PublishAdapter>>;
  /** TikTok: `inbox` (default) sends drafts; `direct` posts publicly, for an app that passed TikTok's audit. */
  tiktokMode?: 'inbox' | 'direct';
  /** Called when TikTok rotates its refresh token. */
  onTikTokRefreshToken?: (token: string) => Promise<void> | void;
  log?: (line: string) => void;
}

export interface PlanStep {
  platform: PublishPlatform;
  item: PublishItem;
  /** The file as written in the log: relative to the project when it lies inside. */
  file: string;
  hash: string;
  action: 'upload' | 'skip';
  /** The earlier upload a skip refers to. */
  previous?: PublishEntry;
  probe?: VideoProbe;
  quotaUnits: number;
}

export interface PublishPlan {
  steps: PlanStep[];
  errors: string[];
  warnings: string[];
  quota: {
    youtube: { used: number; planned: number; limit: number };
    tiktok: { pending: number; planned: number; limit: number };
  };
}

export interface PublishSummary {
  plan: PublishPlan;
  entries: PublishEntry[];
  manualSteps: string[];
}

/** SHA-256 of a file, streamed so a long master does not sit in memory. */
export async function hashVideo(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

/** The calendar day of the YouTube quota, which resets at midnight Pacific Time. */
export function quotaDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(date);
}

/** YouTube's tag budget: tags joined by commas, a tag with a space counted with quotes. */
export function youtubeTagChars(tags: string[]): number {
  return tags.reduce((sum, tag, index) => sum + tag.length + (tag.includes(' ') ? 2 : 0) + (index ? 1 : 0), 0);
}

export function youtubeDescription(item: Pick<PublishItem, 'description' | 'hashtags'>): string {
  const hashtags = item.hashtags.join(' ');
  return hashtags ? `${item.description.trimEnd()}\n\n${hashtags}` : item.description;
}

function toItem(projectDir: string, data: UploadData, entry: UploadMain | UploadShort, kind: 'main' | 'short'): PublishItem {
  const absolute = (path: string) => (isAbsolute(path) ? path : join(projectDir, path));
  return {
    name: kind === 'main' ? 'main' : (entry as UploadShort).name,
    kind,
    file: absolute(entry.file),
    ...(entry.thumbnail ? { thumbnail: absolute(entry.thumbnail) } : {}),
    title: entry.title,
    description: entry.description,
    tags: entry.tags,
    hashtags: entry.hashtags,
    language: entry.language ?? data.language,
    madeForKids: entry.made_for_kids,
    syntheticMedia: entry.synthetic_media,
    categoryId: entry.category_id,
    ...(kind === 'short' ? { related: (entry as UploadShort).related } : {}),
  };
}

/**
 * The exact platform texts of one item from the release plan: the YouTube
 * description already carries chapters, footer, and hashtags, and the TikTok
 * caption already carries its pointer and hashtags.
 */
function applyPlan(item: PublishItem, plan: ReleasePlan | undefined, ids: { youtube: string; tiktok: string }): void {
  const youtube = plan?.posts.find((post) => post.id === ids.youtube);
  const tiktok = plan?.posts.find((post) => post.id === ids.tiktok);
  if (youtube?.texts.title) item.title = youtube.texts.title.value;
  if (youtube?.texts.description) {
    item.description = youtube.texts.description.value;
    // The plan's description already holds the hashtags; appending them again would double them.
    item.hashtags = [];
  }
  if (tiktok?.texts.caption) item.caption = tiktok.texts.caption.value;
}

/** The items `--only` selects, each with the platforms it is meant for. */
export function selectItems(
  projectDir: string,
  data: UploadData,
  only?: string,
  /** The release plan's texts, and how a meme posts when no plan exists yet (HS-261, HS-265, HS-172). */
  main: { meme?: boolean; credits?: string[]; plan?: ReleasePlan } = {},
): { item: PublishItem; platforms: PublishPlatform[] }[] {
  const item = toItem(projectDir, data, data.main, 'main');
  if (main.plan) applyPlan(item, main.plan, { youtube: 'youtube', tiktok: 'tiktok' });
  // A meme posts the one caption the release folder holds, with or without a credit; the platforms never see a different text.
  else if (main.meme) {
    item.description = memeDescription(data, main.credits);
    item.caption = memeCaption(data, main.credits);
  }
  const all = [
    { item, platforms: data.main.platforms },
    ...data.shorts.map((short) => {
      const shortItem = toItem(projectDir, data, short, 'short');
      if (main.plan) applyPlan(shortItem, main.plan, { youtube: `short:${short.name}:youtube`, tiktok: `short:${short.name}:tiktok` });
      return { item: shortItem, platforms: short.platforms };
    }),
  ];
  if (!only) return all;
  if (only === 'main') return all.slice(0, 1);
  if (only === 'shorts') return all.slice(1);
  const match = all.filter(({ item }) => item.name === only);
  if (match.length === 0) {
    throw new ValidationError(`--only ${only}: no such item. Use main, shorts, or one of: ${data.shorts.map((s) => s.name).join(', ') || '(no Shorts)'}.`);
  }
  return match;
}

/** Problems of one item on one platform: errors block the run, warnings are printed. */
export function platformProblems(
  platform: PublishPlatform,
  item: PublishItem,
  probe: VideoProbe | undefined,
  sizes: { video: number; thumbnail?: number },
  limits: PlatformLimits = platformLimits(),
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const label = `${platform} ${item.name}`;
  if (platform === 'youtube') {
    if ([...item.title].length > limits.youtube.title) errors.push(`${label}: title has ${[...item.title].length} characters, limit ${limits.youtube.title}`);
    const description = youtubeDescription(item);
    const bytes = Buffer.byteLength(description, 'utf8');
    if (bytes > limits.youtube.description_bytes) errors.push(`${label}: description with hashtags has ${bytes} bytes, limit ${limits.youtube.description_bytes}`);
    if (/[<>]/.test(item.title) || /[<>]/.test(description)) errors.push(`${label}: title and description may not contain < or >`);
    const tagChars = youtubeTagChars(item.tags);
    if (tagChars > limits.youtube.tags) errors.push(`${label}: tags take ${tagChars} characters, limit ${limits.youtube.tags}`);
    if (item.hashtags.length > limits.youtube.hashtags) warnings.push(`${label}: ${item.hashtags.length} hashtags; YouTube ignores all of them above ${limits.youtube.hashtags}`);
    if (sizes.thumbnail !== undefined) {
      if (sizes.thumbnail > YOUTUBE_LIMITS.thumbnailBytes) errors.push(`${label}: thumbnail is ${(sizes.thumbnail / 1e6).toFixed(1)} MB, limit 2 MB`);
      if (!['.jpg', '.jpeg', '.png'].includes(extname(item.thumbnail ?? '').toLowerCase())) errors.push(`${label}: thumbnail must be JPEG or PNG`);
    }
    if (probe && item.kind === 'short') {
      if (!upToThreeMinutes(probe.duration)) errors.push(`${label}: ${probe.duration.toFixed(1)} s, a Short is at most ${YOUTUBE_LIMITS.shortSeconds} s`);
      if (probe.height < probe.width) errors.push(`${label}: ${probe.width}x${probe.height}, a Short must be vertical or square`);
    }
    if (probe && item.kind === 'main' && probe.duration > YOUTUBE_LIMITS.unverifiedSeconds) {
      warnings.push(`${label}: longer than 15 minutes; the channel must be verified (youtube.com/verify)`);
    }
  }
  if (platform === 'tiktok') {
    if (sizes.video > TIKTOK_LIMITS.maxBytes) errors.push(`${label}: ${(sizes.video / 1024 ** 3).toFixed(2)} GB, limit 4 GB`);
    if (probe) {
      if (probe.duration > TIKTOK_LIMITS.maxSeconds) errors.push(`${label}: ${probe.duration.toFixed(1)} s, limit ${TIKTOK_LIMITS.maxSeconds} s`);
      if (probe.duration < TIKTOK_LIMITS.minSeconds) errors.push(`${label}: ${probe.duration.toFixed(1)} s, minimum ${TIKTOK_LIMITS.minSeconds} s`);
      if (Math.abs(probe.width / probe.height - 9 / 16) > 0.01) warnings.push(`${label}: ${probe.width}x${probe.height}; TikTok shows 9:16 full screen`);
    }
    const caption = tiktokCaption(item);
    if ([...caption].length > limits.tiktok.caption) errors.push(`${label}: caption has ${[...caption].length} characters, limit ${limits.tiktok.caption}`);
  }
  return { errors, warnings };
}

/** The last successful upload of the same file to the same platform, by the same kind of adapter. */
export function findPrevious(
  log: PublishLog,
  platform: PublishPlatform,
  item: string,
  hash: string,
  mock: boolean,
): PublishEntry | undefined {
  const same = log.entries.filter((entry) => entry.platform === platform && entry.item === item && entry.file_hash === hash && entry.mock === mock);
  // The last attempt may have gone out: it holds until the user checks the platform and forces a new upload.
  const last = same.at(-1);
  if (last?.status === 'failed' && last.uncertain) return last;
  return same.filter((entry) => entry.status !== 'failed').at(-1);
}

/** YouTube units spent on the current quota day; a failed attempt counts as an insert, to stay on the safe side. */
export function youtubeUnitsUsed(log: PublishLog, now: Date, mock: boolean): number {
  const today = quotaDay(now);
  return log.entries
    .filter((entry) => entry.platform === 'youtube' && entry.mock === mock && quotaDay(new Date(entry.at)) === today)
    .reduce((sum, entry) => sum + (entry.quota_units ?? (entry.status === 'failed' ? YOUTUBE_QUOTA.insert : 0)), 0);
}

/** TikTok drafts sent in the last 24 hours; the inbox holds at most five pending ones. */
export function tiktokPending(log: PublishLog, now: Date, mock: boolean): number {
  const since = now.getTime() - 24 * 3600 * 1000;
  return log.entries.filter(
    (entry) =>
      entry.platform === 'tiktok' &&
      entry.mock === mock &&
      (entry.status === 'draft' || entry.status === 'processing') &&
      new Date(entry.at).getTime() >= since,
  ).length;
}

function scheduleProblems(schedule: string | undefined, now: Date, platforms: PublishPlatform[]): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!schedule) return { errors, warnings };
  const date = new Date(schedule);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(schedule) || Number.isNaN(date.getTime())) {
    errors.push(`--schedule ${schedule}: use an ISO date with time, e.g. 2026-12-01T18:00:00+01:00`);
  } else if (date.getTime() <= now.getTime() + 15 * 60 * 1000) {
    errors.push(`--schedule ${schedule}: must be at least 15 minutes in the future`);
  }
  if (platforms.includes('youtube')) {
    warnings.push('youtube: a scheduled video only goes public if the API project passed Google\'s audit; otherwise it stays private (docs/publishing.md)');
  }
  if (platforms.includes('tiktok')) warnings.push('tiktok: --schedule does not apply to TikTok; drafts are posted from the inbox, direct posts go live at once');
  return { errors, warnings };
}

/** Build the plan: validate files and limits, find earlier uploads, and count the quota. No network calls. */
export async function buildPublishPlan(
  projectDir: string,
  data: UploadData,
  log: PublishLog,
  options: Pick<PublishOptions, 'platform' | 'only' | 'schedule' | 'force' | 'mock' | 'now' | 'probe'> & {
    /** A meme posts its release caption on the main item (see `selectItems`). */
    meme?: boolean;
    credits?: string[];
    /** The release plan whose texts every upload uses. */
    plan?: ReleasePlan;
    /** The channel's text limits. */
    limits?: PlatformLimits;
    /** Open TODOs of the release checks, reported as warnings: a TODO never blocks an upload (HS-172). */
    todos?: string[];
  } = {},
): Promise<PublishPlan> {
  const root = resolve(projectDir);
  const now = options.now?.() ?? new Date();
  const mock = Boolean(options.mock);
  const limits = options.limits ?? platformLimits();
  const wanted: PublishPlatform[] = !options.platform || options.platform === 'all' ? ['youtube', 'tiktok'] : [options.platform];
  const errors: string[] = [];
  const warnings: string[] = [];
  const steps: PlanStep[] = [];
  const hashes = new Map<string, string>();
  const probes = new Map<string, VideoProbe | undefined>();
  let unprobed = 0;

  for (const { item, platforms } of selectItems(root, data, options.only, { meme: options.meme, credits: options.credits, plan: options.plan })) {
    const targets = platforms.filter((platform) => wanted.includes(platform));
    if (targets.length === 0) continue;
    const file = item.file.startsWith(`${root}/`) ? relative(root, item.file) : item.file;
    if (!existsSync(item.file)) {
      errors.push(`${item.name}: ${file} does not exist`);
      continue;
    }
    if (item.thumbnail && !existsSync(item.thumbnail)) errors.push(`${item.name}: thumbnail ${relative(root, item.thumbnail)} does not exist`);
    if (!hashes.has(item.file)) hashes.set(item.file, await hashVideo(item.file));
    if (!probes.has(item.file)) {
      try {
        probes.set(item.file, options.probe?.(item.file));
      } catch {
        probes.set(item.file, undefined);
        unprobed += 1;
      }
    }
    const probe = probes.get(item.file);
    const sizes = {
      video: (await stat(item.file)).size,
      ...(item.thumbnail && existsSync(item.thumbnail) ? { thumbnail: (await stat(item.thumbnail)).size } : {}),
    };
    for (const platform of targets) {
      const problems = platformProblems(platform, item, probe, sizes, limits);
      errors.push(...problems.errors);
      warnings.push(...problems.warnings);
      const hash = hashes.get(item.file)!;
      const previous = findPrevious(log, platform, item.name, hash, mock);
      const action = previous && !options.force ? 'skip' : 'upload';
      const quotaUnits = platform === 'youtube' && action === 'upload' ? YOUTUBE_QUOTA.insert + (item.thumbnail ? YOUTUBE_QUOTA.thumbnail : 0) : 0;
      steps.push({ platform, item, file, hash, action, ...(previous ? { previous } : {}), ...(probe ? { probe } : {}), quotaUnits });
    }
  }
  if (unprobed) warnings.push(`${unprobed} video(s) not probed (ffprobe missing): length and aspect ratio unchecked`);
  warnings.push(...(options.todos ?? []));

  const uploads = steps.filter((step) => step.action === 'upload');
  const schedule = scheduleProblems(options.schedule, now, [...new Set(uploads.map((step) => step.platform))]);
  errors.push(...schedule.errors);
  warnings.push(...schedule.warnings);

  const quota = {
    youtube: {
      used: youtubeUnitsUsed(log, now, mock),
      planned: uploads.reduce((sum, step) => sum + step.quotaUnits, 0),
      limit: youtubeDailyQuota(),
    },
    tiktok: {
      pending: tiktokPending(log, now, mock),
      planned: uploads.filter((step) => step.platform === 'tiktok').length,
      limit: TIKTOK_LIMITS.pendingPer24h,
    },
  };
  if (quota.youtube.planned && quota.youtube.used + quota.youtube.planned > quota.youtube.limit) {
    errors.push(
      `youtube: the batch needs ${quota.youtube.planned} quota units, but ${quota.youtube.limit - quota.youtube.used} of ${quota.youtube.limit} are left today ` +
        '(resets at midnight Pacific Time). Publish fewer items with --only, or continue tomorrow.',
    );
  }
  if (quota.tiktok.planned && quota.tiktok.pending + quota.tiktok.planned > quota.tiktok.limit) {
    warnings.push(
      `tiktok: ${quota.tiktok.pending} drafts sent in the last 24 h plus ${quota.tiktok.planned} new exceed the ${quota.tiktok.limit} pending drafts TikTok allows; ` +
        'post or delete drafts in the app first, or TikTok will refuse the upload',
    );
  }
  if (steps.length === 0 && errors.length === 0) warnings.push('nothing selected: check --platform, --only, and the items\' platforms');
  return { steps, errors, warnings, quota };
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.round(seconds - minutes * 60)).padStart(2, '0')}`;
}

export function formatPlan(plan: PublishPlan, title: string, dryRun: boolean): string[] {
  const lines = [`Publish plan — ${title}${dryRun ? ' (dry run, no uploads)' : ''}`];
  for (const step of plan.steps) {
    const shape = step.probe ? `${step.probe.width}x${step.probe.height} ${formatDuration(step.probe.duration)}` : 'not probed';
    const what =
      step.action === 'skip'
        ? step.previous!.status === 'failed'
          ? `skip    may have gone out ${step.previous!.at}: check ${step.platform}, then --force to upload again`
          : `skip    already ${step.previous!.status} ${step.previous!.at}${step.previous!.remote_id ? ` (${step.previous!.remote_id})` : ''}`
        : `upload  ${shape}${step.item.thumbnail ? ' + thumbnail' : ''}`;
    lines.push(`  ${step.platform.padEnd(8)} ${step.item.name.padEnd(14)} ${step.file}`);
    lines.push(`  ${''.padEnd(8)} ${''.padEnd(14)} ${what}`);
    lines.push(`  ${''.padEnd(8)} ${''.padEnd(14)} "${step.item.title}"`);
  }
  const { youtube, tiktok } = plan.quota;
  lines.push(`Quota: youtube ${youtube.used + youtube.planned} of ${youtube.limit} units today (${youtube.used} used, ${youtube.planned} planned)`);
  lines.push(`       tiktok ${tiktok.pending + tiktok.planned} of ${tiktok.limit} pending drafts in 24 h (${tiktok.pending} sent, ${tiktok.planned} planned)`);
  for (const warning of plan.warnings) lines.push(`! ${warning}`);
  return lines;
}

function createAdapters(platforms: PublishPlatform[], options: PublishOptions): Record<string, PublishAdapter> {
  const adapters: Record<string, PublishAdapter> = {};
  for (const platform of platforms) {
    const given = options.adapters?.[platform];
    if (given) adapters[platform] = given;
    else if (options.mock) adapters[platform] = new MockPublisher(platform, options.tiktokMode);
    else if (platform === 'youtube') adapters[platform] = new YouTubePublisher({ log: options.log });
    else adapters[platform] = new TikTokPublisher({ log: options.log, onRefreshToken: options.onTikTokRefreshToken, mode: options.tiktokMode });
  }
  return adapters;
}

function secrets(): string[] {
  const youtube = resolveYouTubeCredentials();
  const tiktok = resolveTikTokCredentials();
  return [youtube.clientSecret, youtube.refreshToken, tiktok.clientSecret, tiktok.refreshToken].filter((value): value is string => Boolean(value));
}

/** Manual steps for a Short on YouTube: the related video cannot be set through the API. */
function relatedStep(step: PlanStep, result: PublishEntry, log: PublishLog): string | undefined {
  if (step.platform !== 'youtube' || step.item.kind !== 'short') return undefined;
  const main = log.entries.filter((entry) => entry.platform === 'youtube' && entry.item === 'main' && entry.status !== 'failed' && entry.mock === result.mock).at(-1);
  return `YouTube Studio → ${result.url ?? step.item.name}: set "Related video" to ${main?.url ?? 'the main video once it is uploaded'}`;
}

function printManualSteps(print: (line: string) => void, steps: string[]): void {
  if (steps.length === 0) return;
  print('Manual steps:');
  for (const manual of steps) print(`  - ${manual.replace(/\n/g, '\n    ')}`);
}

/**
 * What the upload needs to post a meme's release text: whether the project is a
 * meme, and the library sounds its takes came from (HS-261, HS-265). Reads only
 * `project.yaml` and `takes.json`: publish needs the kind and the takes, not the
 * whole loaded project.
 */
async function uploadSounds(projectDir: string, root: string): Promise<{ config: ProjectConfig; meme: boolean; sounds: UsedSound[] }> {
  const config = await readYamlFile(projectPaths(projectDir).config, ProjectConfigSchema);
  if (config.kind !== 'meme') return { config, meme: false, sounds: [] };
  const paths = projectPaths(projectDir, config);
  const takes = paths.takes && existsSync(paths.takes) ? await readJsonFile(paths.takes, TakesSchema) : undefined;
  return { config, meme: true, sounds: await usedLibrarySounds({ takes, paths }, root) };
}

/**
 * The release form (shape and Shorts source) of a project without a release folder, derived as `release`
 * derives it (ADR 0057). A project that does not load has no known length, so an
 * episode stays an episode.
 */
async function fallbackForm(projectDir: string, config: ProjectConfig): Promise<{ shape: ReleaseShape; shorts: ShortsSource }> {
  const loaded = config.kind === 'episode' ? await loadProject(projectDir).catch(() => undefined) : undefined;
  const timing = loaded?.effectiveTiming ?? loaded?.timing;
  return releaseForm({ kind: config.kind, master: config.formats.master, durationSeconds: timing?.audio.duration });
}

/**
 * Upload the release package: validate, plan, check quota, then upload each
 * item that is not in the publish log with the same file hash. Every upload
 * is private or a draft. The log is written after each item.
 */
export async function publishProject(options: PublishOptions): Promise<PublishSummary> {
  const projectDir = resolve(options.projectDir);
  const print = options.log ?? ((line: string) => console.log(line));
  const now = options.now ?? (() => new Date());
  const data = await loadUploadData(projectDir);
  let log = await readPublishLog(projectDir);
  const root = options.root ?? repoRoot();
  const { config, meme, sounds } = await uploadSounds(projectDir, root);
  const credits = sounds.map((sound) => sound.credit).filter((credit): credit is string => Boolean(credit));
  const channel = await loadChannel(root);
  const limits = platformLimits(channel);
  const handle = channel?.links.youtube?.handle;
  // The plan `release` wrote; without a release folder, the texts of review/upload.yaml alone.
  const storedPlan = await loadReleasePlan(projectDir);
  const form = await fallbackForm(projectDir, config);
  // The vertical version is the one Short: only the entry named by the slug (ADR 0057).
  const fallbackShorts = form.shorts === 'vertical-version' ? data.shorts.filter((short) => short.name === config.slug) : data.shorts;
  const releasePlan =
    storedPlan ??
    buildReleasePlan({
      kind: config.kind,
      shape: form.shape,
      shortsSource: form.shorts,
      language: data.language,
      slug: config.slug,
      title: config.title,
      data,
      release: config.release,
      channel,
      limits,
      chapters: data.main.chapters ?? [],
      credits,
      files: { thumbnails: [], shorts: fallbackShorts.map((short) => ({ name: short.name, video: short.file })) },
      tiktokPointer: releaseLabels(data.language).tt.overlayDefault(handle && !/<ID>/.test(handle) ? handle : 'YouTube'),
    });
  const plan = await buildPublishPlan(projectDir, data, log, { ...options, meme, credits, plan: releasePlan, limits, todos: soundLicenceTodos(sounds) });
  if (!storedPlan) {
    plan.warnings.unshift('no release plan yet (renders/release/manifest.json): uploading the texts of review/upload.yaml alone; run release for the chapters, footer, and the exact captions');
  }
  for (const line of formatPlan(plan, data.main.title, Boolean(options.dryRun))) print(line);

  if (plan.errors.length) {
    throw new ValidationError(`Publish plan has ${plan.errors.length} error(s); nothing was uploaded.`, plan.errors);
  }
  const uploads = plan.steps.filter((step) => step.action === 'upload');
  if (options.dryRun || uploads.length === 0) {
    if (!options.dryRun) print('Nothing to upload: every selected item is in review/publish.json with the same file. Use --force to upload again.');
    return { plan, entries: [], manualSteps: [] };
  }

  // Credentials for every platform are checked before the first upload.
  const adapters = createAdapters([...new Set(uploads.map((step) => step.platform))], options);
  const entries: PublishEntry[] = [];
  const manualSteps: string[] = [];
  for (const step of uploads) {
    const adapter = adapters[step.platform]!;
    const base = { platform: step.platform, item: step.item.name, file: step.file, file_hash: step.hash, mock: adapter.mock };
    try {
      const result = await adapter.publish({ item: step.item, ...(options.schedule && step.platform === 'youtube' ? { schedule: options.schedule } : {}) });
      const entry: PublishEntry = {
        ...base,
        remote_id: result.remoteId,
        ...(result.url ? { url: result.url } : {}),
        status: result.status,
        ...(result.publishAt ? { publish_at: result.publishAt } : {}),
        ...(result.thumbnail ? { thumbnail: result.thumbnail } : {}),
        warnings: result.warnings,
        ...(result.quotaUnits !== undefined ? { quota_units: result.quotaUnits } : {}),
        at: now().toISOString(),
      };
      log = await appendPublishEntry(projectDir, entry);
      entries.push(entry);
      print(`✔ ${step.platform} ${step.item.name}: ${entry.status}${entry.url ? ` ${entry.url}` : ` (${entry.remote_id})`}`);
      for (const warning of result.warnings) print(`  ! ${warning}`);
      const related = relatedStep(step, entry, log);
      for (const manual of [...result.manualSteps, ...(related ? [related] : [])]) manualSteps.push(`${step.platform} ${step.item.name}: ${manual}`);
    } catch (error) {
      const message = redactSecrets(error instanceof Error ? error.message : String(error), secrets());
      const outcome = failureClass(error);
      const uncertain = outcome === 'uncertain';
      const entry: PublishEntry = { ...base, status: 'failed', warnings: [], error: message, ...(uncertain ? { uncertain } : {}), at: now().toISOString() };
      log = await appendPublishEntry(projectDir, entry);
      entries.push(entry);
      printManualSteps(print, manualSteps);
      if (error instanceof ConfigError) throw new ConfigError(message);
      const failure = new Error(
        `${step.platform} ${step.item.name}: ${message} (logged in review/publish.json; uploads before it are kept` +
          (uncertain ? `; it may have gone out: check ${step.platform} before publishing it again with --force)` : ')'),
      );
      // The autopilot reads the mark and asks the user instead of retrying (never twice).
      throw withFailureClass(failure, outcome);
    }
  }
  printManualSteps(print, manualSteps);
  // A direct post that TikTok is still processing goes live by itself, like a finished one.
  const posted = entries.filter((entry) => entry.platform === 'tiktok' && (entry.status === 'uploaded' || (options.tiktokMode === 'direct' && entry.status === 'processing')));
  if (posted.length) print(`Posted ${posted.length} video(s) on TikTok directly; everything else is private or a draft.`);
  else print('Nothing was made public. Review each video on its platform and publish it yourself.');
  return { plan, entries, manualSteps };
}
