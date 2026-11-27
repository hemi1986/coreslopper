import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { srtTime } from './episode.js';
import { readYamlFile } from './project.js';
import { buildReleasePlan } from './release-plan.js';
import {
  ChannelConfigSchema,
  PLATFORM_LIMITS,
  ReleaseMetadataSchema,
  type ChannelConfig,
  type ProjectConfig,
  type ProjectKind,
  type ReleaseManifest,
  type ReleaseMetadata,
  type ReleaseShape,
  type ReleaseStatus,
  type Timing,
  type UploadData,
} from './schema.js';

// Pure helpers of the release package: lyrics files, chapters, the canvas
// window, platform limits, and TODO detection. No ffmpeg, no renderer.

/** `config/channel.yaml` of the workspace, or undefined when there is none. */
export async function loadChannel(root: string): Promise<ChannelConfig | undefined> {
  const path = join(root, 'config', 'channel.yaml');
  return existsSync(path) ? readYamlFile(path, ChannelConfigSchema) : undefined;
}

/** The longest episode track a short episode may have, in seconds; 180 s still counts (ADR 0057, HS-266). */
export const SHORT_EPISODE_MAX_SECONDS = 180;

/**
 * The release shape of a project (ADR 0057): a music video and a meme take
 * their kind; an episode is a short episode when its master is at least as tall
 * as wide (9:16, 4:5, 1:1) and its episode track lasts at most 180 s. An
 * episode without a built track is an episode.
 */
export function releaseShape(input: {
  kind: ProjectKind;
  master: { width: number; height: number };
  durationSeconds: number | undefined;
}): ReleaseShape {
  if (input.kind !== 'episode') return input.kind;
  const upright = input.master.height >= input.master.width;
  const short = input.durationSeconds !== undefined && input.durationSeconds <= SHORT_EPISODE_MAX_SECONDS;
  return upright && short ? 'short-episode' : 'episode';
}

/** The shape a manifest recorded; a manifest written before shapes existed reads as its project kind. */
export function manifestShape(manifest: Pick<ReleaseManifest, 'shape'>, kind: ProjectKind): ReleaseShape {
  return manifest.shape ?? kind;
}

/**
 * What started the release: the first done mark or live URL in the release
 * status, in the status's own order. Until there is one, the release shape
 * follows the project; after it, the shape is kept (HS-268).
 */
export function releaseStart(status: Pick<ReleaseStatus, 'items'>): string | undefined {
  for (const [id, item] of Object.entries(status.items)) {
    if (item.done) return `the done mark ${id}`;
    if (item.url) return `the live URL of ${id}`;
  }
  return undefined;
}

/**
 * Why a run may not build its shape: the release started with another shape
 * (HS-268). Undefined when the shape is the manifest's or nothing was posted yet.
 */
export function keptShapeProblem(input: { recorded: ReleaseShape | undefined; derived: ReleaseShape; start: string | undefined }): string | undefined {
  if (!input.recorded || !input.start || input.recorded === input.derived) return undefined;
  return `the release started as ${input.recorded} (${input.start}), and this run's shape is ${input.derived}: release changes nothing. Remove the done marks and live URLs first to release it as ${input.derived}.`;
}

/** A project with `distribution: internal` is never released publicly: no release package, no release calendar. */
export function releasedPublicly(config: Pick<ProjectConfig, 'distribution'>): boolean {
  return config.distribution !== 'internal';
}

/** The one wording for a project with `distribution: internal`, for every command that leaves it alone. */
export function notReleasedPublicly(slug: string): string {
  return `${slug} is not released publicly (distribution: internal)`;
}

/** A link value that still holds the `<ID>` placeholder. */
export const PLACEHOLDER = /<ID>/;

/** The marker that turns an open item into a TODO in a generated text. */
export const TODO = 'TODO';

/** Lyrics as a distributor wants them: no `[Section]` tags, at most one blank line between stanzas. */
export function plainLyrics(text: string): string {
  return `${text
    .split(/\r?\n/)
    .filter((line) => !/^\s*\[[^\]]*\]\s*$/.test(line))
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`;
}

function lrcTime(seconds: number): string {
  const centis = Math.round(Math.max(0, seconds) * 100);
  const minutes = Math.floor(centis / 6000);
  const rest = centis - minutes * 6000;
  return `${String(minutes).padStart(2, '0')}:${String(Math.floor(rest / 100)).padStart(2, '0')}.${String(rest % 100).padStart(2, '0')}`;
}

/** Line-synchronised lyrics (LRC) from the effective timing; an empty line marks the end of each line. */
export function buildLrc(timing: Timing, meta: { artist?: string; title?: string; length?: number } = {}): string {
  const header = [
    ...(meta.artist ? [`[ar:${meta.artist}]`] : []),
    ...(meta.title ? [`[ti:${meta.title}]`] : []),
    ...(meta.length ? [`[length:${lrcTime(meta.length).slice(0, 5)}]`] : []),
  ];
  const lines = [...timing.lines].filter((line) => line.text.trim()).sort((a, b) => a.start - b.start);
  const body: string[] = [];
  lines.forEach((line, index) => {
    body.push(`[${lrcTime(line.start)}]${line.text.trim()}`);
    const next = lines[index + 1];
    // Clear the line when a pause follows, so players do not hold it over an instrumental.
    if (!next || next.start - line.end > 1) body.push(`[${lrcTime(line.end)}]`);
  });
  return `${[...header, ...body].join('\n')}\n`;
}

/** The lyrics as subtitles (SRT) from the effective timing. */
export function buildLyricsSrt(timing: Timing): string {
  return timing.lines
    .filter((line) => line.text.trim())
    .sort((a, b) => a.start - b.start)
    .map((line, index) => `${index + 1}\n${srtTime(line.start)} --> ${srtTime(Math.max(line.end, line.start + 0.5))}\n${line.text.trim()}\n`)
    .join('\n');
}

/** `m:ss` or `h:mm:ss`, as YouTube reads chapter times. */
export function chapterTime(seconds: number): string {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export interface Chapter {
  start: number;
  title: string;
}

/** YouTube's chapter rules: the first at 0:00, at least three, each at least ten seconds long. */
export const CHAPTER_RULES = { min: 3, minSeconds: 10 } as const;

/**
 * Chapters from the timing's sections: each section label starts a chapter;
 * a section shorter than ten seconds joins the one before. Empty when fewer
 * than three remain, since YouTube would ignore them.
 */
export function chaptersFromSections(timing: Timing): Chapter[] {
  const chapters: (Chapter & { end: number })[] = [];
  for (const section of [...timing.sections].sort((a, b) => a.start - b.start)) {
    const last = chapters.at(-1);
    if (last && (section.end - section.start < CHAPTER_RULES.minSeconds || last.end - last.start < CHAPTER_RULES.minSeconds)) {
      last.end = section.end;
      continue;
    }
    chapters.push({ start: chapters.length ? section.start : 0, end: section.end, title: section.label });
  }
  const tail = chapters.at(-1);
  if (tail && chapters.length > 1 && tail.end - tail.start < CHAPTER_RULES.minSeconds) {
    chapters.pop();
    chapters.at(-1)!.end = tail.end;
  }
  return chapters.length >= CHAPTER_RULES.min ? chapters.map(({ start, title }) => ({ start, title })) : [];
}

/** Problems of explicit chapters against YouTube's rules. */
export function chapterProblems(chapters: Chapter[], duration: number): string[] {
  const problems: string[] = [];
  if (chapters.length === 0) return problems;
  if (chapters[0]!.start !== 0) problems.push('the first chapter must start at 0:00');
  if (chapters.length < CHAPTER_RULES.min) problems.push(`${chapters.length} chapters; YouTube needs at least ${CHAPTER_RULES.min}`);
  chapters.forEach((chapter, index) => {
    const end = chapters[index + 1]?.start ?? duration;
    if (end - chapter.start < CHAPTER_RULES.minSeconds) problems.push(`chapter "${chapter.title}" is shorter than ${CHAPTER_RULES.minSeconds} s`);
  });
  return problems;
}

/** Spotify Canvas: 3–8 s, vertical, at least 720 px high, no sound. */
export const CANVAS_SPEC = { minSeconds: 3, maxSeconds: 8, seconds: 6, crossfade: 0.5, minHeight: 720 } as const;

export interface CanvasWindow {
  start: number;
  /** Seconds of the finished loop. */
  length: number;
  /** True when no lyric line is on screen inside the window. */
  textFree: boolean;
  reason: string;
}

/**
 * The canvas window: by default the hook at the start of the first chorus.
 * Lyrics are burned into the render, so a window without a lyric line wins
 * when one exists nearby; the crossfade tail is part of the window.
 */
export function canvasWindow(timing: Timing, options: { start?: number; length?: number } = {}): CanvasWindow {
  const length = Math.min(CANVAS_SPEC.maxSeconds, Math.max(CANVAS_SPEC.minSeconds, options.length ?? CANVAS_SPEC.seconds));
  const span = length + CANVAS_SPEC.crossfade;
  const duration = timing.audio.duration;
  const clamp = (start: number) => Math.max(0, Math.min(start, duration - span));
  const textFree = (start: number) => !timing.lines.some((line) => line.text.trim() && line.start < start + span && line.end > start);
  if (options.start !== undefined) {
    const start = clamp(options.start);
    return { start, length, textFree: textFree(start), reason: 'chosen' };
  }
  const chorus = [...timing.sections].sort((a, b) => a.start - b.start).find((section) => /chorus|refrain|hook/i.test(`${section.id} ${section.label}`));
  const preferred = clamp(chorus?.start ?? 0);
  if (textFree(preferred)) return { start: preferred, length, textFree: true, reason: chorus ? 'first chorus' : 'start' };
  // Candidate starts on the beat grid (or every half second): from the chorus onwards first, then backwards from it.
  const grid = [...new Set((timing.beats.length ? timing.beats : Array.from({ length: Math.floor(duration * 2) }, (_, i) => i / 2)).map(clamp))];
  const candidates = [...grid.filter((start) => start >= preferred).sort((a, b) => a - b), ...grid.filter((start) => start < preferred).sort((a, b) => b - a)];
  const free = candidates.find(textFree);
  if (free !== undefined) return { start: free, length, textFree: true, reason: free >= preferred ? 'first window without lyrics from the first chorus on' : 'nearest window without lyrics before the first chorus' };
  return { start: preferred, length, textFree: false, reason: chorus ? 'first chorus (lyrics on screen)' : 'start (lyrics on screen)' };
}

/** The limits in effect: the built-in ones, overridden by `config/channel.yaml`. */
export function platformLimits(channel?: ChannelConfig) {
  const merge = <T extends Record<string, number>>(base: T, override?: Partial<Record<keyof T, number | undefined>>): T =>
    Object.fromEntries(Object.entries(base).map(([key, value]) => [key, override?.[key as keyof T] ?? value])) as T;
  return {
    youtube: merge(PLATFORM_LIMITS.youtube, channel?.limits.youtube),
    instagram: merge(PLATFORM_LIMITS.instagram, channel?.limits.instagram),
    tiktok: merge(PLATFORM_LIMITS.tiktok, channel?.limits.tiktok),
    spotify: merge(PLATFORM_LIMITS.spotify, channel?.limits.spotify),
    x: merge(PLATFORM_LIMITS.x, channel?.limits.x),
    linkedin: merge(PLATFORM_LIMITS.linkedin, channel?.limits.linkedin),
  };
}
export type PlatformLimits = ReturnType<typeof platformLimits>;

/**
 * The project's release facts over the channel's `release_defaults`: a field
 * the project sets always wins; songwriters and AI credits come from the
 * channel only when the project gives none.
 */
export function withReleaseDefaults(release: ReleaseMetadata | undefined, channel?: Pick<ChannelConfig, 'release_defaults'>): ReleaseMetadata | undefined {
  const defaults = channel?.release_defaults;
  if (!defaults) return release;
  const base = release ?? ReleaseMetadataSchema.parse({});
  const pick = <K extends keyof ReleaseMetadata>(key: K) => base[key] ?? (defaults as Partial<ReleaseMetadata>)[key];
  return ReleaseMetadataSchema.parse({
    ...base,
    distributor: pick('distributor'),
    artist: pick('artist'),
    primary_genre: pick('primary_genre'),
    secondary_genre: pick('secondary_genre'),
    explicit: pick('explicit'),
    songwriters: base.songwriters.length ? base.songwriters : (defaults.songwriters ?? []),
    producer: pick('producer'),
    label: pick('label'),
    ai_credits: base.ai_credits || defaults.ai_credits ? { ...defaults.ai_credits, ...stripUndefined(base.ai_credits ?? {}) } : undefined,
    ai_tool: pick('ai_tool'),
    license_note: pick('license_note'),
  });
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}

/** Artist and title of the release: `release:` first, then song.json, then the project. */
export function releaseIdentity(
  config: Pick<ProjectConfig, 'title' | 'release'>,
  song: { artist?: unknown; title?: unknown } = {},
): { artist?: string; title: string } {
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
  return {
    artist: config.release?.artist ?? text(song.artist),
    title: config.release?.title ?? text(song.title) ?? config.title,
  };
}

/** A file name without characters that file systems or upload forms reject. */
export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim() || 'release';
}

/** The release fields a distributor needs that the user has not given yet. Never filled in by guessing. */
export function releaseTodos(
  release: ReleaseMetadata | undefined,
  channel?: ChannelConfig,
  /** Artist and title the user gave elsewhere (song.json); they count as given. */
  identity: { artist?: string; title?: string } = {},
): string[] {
  if (!release) return ['release: block in project.yaml is missing (genres, songwriters, AI credits, release date, ...); fill it in with the user'];
  const todos: string[] = [];
  const need = (value: unknown, field: string) => {
    if (value === undefined || (Array.isArray(value) && value.length === 0)) todos.push(`release.${field} is not set`);
  };
  need(release.artist ?? identity.artist, 'artist');
  need(release.title ?? identity.title, 'title');
  need(release.primary_genre, 'primary_genre');
  need(release.language, 'language');
  need(release.explicit, 'explicit');
  need(release.songwriters, 'songwriters (legal names, from the user)');
  need(release.release_date, 'release_date');
  const aiCreditsWanted = channel?.disclosure.distributor_ai_credits ?? true;
  if (aiCreditsWanted) {
    const credits = release.ai_credits;
    for (const part of ['lyrics', 'music', 'vocals', 'instrumental'] as const) {
      if (credits?.[part] === undefined) todos.push(`release.ai_credits.${part} is not set (none | partial | full)`);
    }
    const usesAi = Object.values(credits ?? {}).some((value) => value && value !== 'none');
    if (usesAi && !release.ai_tool) todos.push('release.ai_tool is not set');
    if (usesAi && !release.license_note) todos.push('release.license_note is not set (e.g. the paid plan the song was made with)');
  }
  return todos;
}

/** Channel links that still hold `<ID>`. */
export function channelTodos(channel?: ChannelConfig): string[] {
  if (!channel) return [];
  return Object.entries(channel.links)
    .filter(([, link]) => PLACEHOLDER.test(link.url ?? '') || PLACEHOLDER.test(link.handle ?? ''))
    .map(([platform]) => `config/channel.yaml: links.${platform} still holds <ID>`);
}

/** Lines of a generated text that hold `<ID>` without a TODO marker on the same line. */
export function unmarkedPlaceholders(text: string): string[] {
  return text.split('\n').filter((line) => PLACEHOLDER.test(line) && !line.includes(TODO));
}

/** Whether a licence is unknown: unset, blank, or a value that starts with "unknown" (e.g. "unknown – ask Jane"). */
export function licenceUnknown(licence: string | undefined): boolean {
  const text = licence?.trim().toLowerCase() ?? '';
  return !text || /^unknown\b/.test(text);
}

/**
 * Whether a licence asks for attribution: the Creative Commons BY family under
 * any of its names (CC BY 4.0, Creative Commons Attribution 4.0, a licence URL,
 * or a licence named for attribution); "no attribution required" does not.
 */
export function licenceNeedsCredit(licence: string | undefined): boolean {
  const text = licence?.trim().toLowerCase() ?? '';
  if (/^cc[- ]?by\b/.test(text) || /^creative commons (by|attribution)\b/.test(text)) return true;
  if (/creativecommons\.org\/licenses\/by\b/.test(text)) return true;
  if (/^credit required\b/.test(text) || /^attribute\b/.test(text)) return true;
  // "Attribution required" asks for one; "Attribution not required" is a public-domain wording.
  return /^attribution\b/.test(text) && !/\b(not|no)\s+(required|needed)\b/.test(text);
}

/** A library sound a project used, as the release check reads it; `licence` is undefined when the entry is gone. */
export interface UsedSound {
  id: string;
  licence?: string;
  credit?: string;
}

/**
 * The TODO lines for the library sounds a project used: an unknown licence, or
 * one that asks for attribution without its credit; never an error (HS-261,
 * HS-265). A sound whose entry is gone has no licence either, so it is unknown.
 */
export function soundLicenceTodos(sounds: UsedSound[]): string[] {
  const todos: string[] = [];
  for (const sound of sounds) {
    const edit = `sound edit ${sound.id}`;
    if (sound.licence === undefined) todos.push(`sound ${sound.id}: its entry is missing from the library, so its licence is unknown (sound list)`);
    else if (licenceUnknown(sound.licence)) todos.push(`sound ${sound.id}: the licence is unknown; decide whether it may be used (${edit} --licence <licence|own>)`);
    else if (!sound.credit?.trim() && licenceNeedsCredit(sound.licence)) todos.push(`sound ${sound.id}: the licence "${sound.licence}" asks for a credit that is missing (${edit} --credit "...")`);
  }
  return todos;
}

/**
 * Limit and completeness problems of the platform texts in the upload data:
 * `errors` break a limit, `missing` are texts the skill still has to write.
 * A meme has one video and no main-video extras: its one description is the
 * Shorts, TikTok, and Reels caption. This is the plan's own check, over a plan
 * built from the upload data alone.
 */
export function platformTextProblems(
  data: UploadData,
  limits: PlatformLimits,
  /** `shape` is the release shape (`releaseShape`); the project kind follows from it. */
  options: { shape: ReleaseShape; credits?: string[]; tiktokPointer?: string; durationSeconds?: number },
): { errors: string[]; missing: string[] } {
  const plan = buildReleasePlan({
    kind: options.shape === 'short-episode' ? 'episode' : options.shape,
    shape: options.shape,
    language: data.language,
    slug: 'release',
    title: '',
    data,
    limits,
    chapters: [],
    credits: options.credits,
    tiktokPointer: options.tiktokPointer,
    durationSeconds: options.durationSeconds,
    files: { thumbnails: [], shorts: [] },
  });
  return plan.problems;
}
