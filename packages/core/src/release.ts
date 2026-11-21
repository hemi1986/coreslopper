import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { srtTime } from './episode.js';
import { readYamlFile } from './project.js';
import {
  ChannelConfigSchema,
  PLATFORM_LIMITS,
  ReleaseMetadataSchema,
  type ChannelConfig,
  type ProjectConfig,
  type ReleaseMetadata,
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

const chars = (text: string) => [...text].length;

/**
 * Limit and completeness problems of the platform texts in the upload data:
 * `errors` break a limit, `missing` are texts the skill still has to write.
 */
export function platformTextProblems(
  data: UploadData,
  limits: PlatformLimits,
  options: { music: boolean } = { music: true },
): { errors: string[]; missing: string[] } {
  const errors: string[] = [];
  const missing: string[] = [];
  const main = data.main;
  if (chars(main.title) > limits.youtube.title) errors.push(`youtube main: title has ${chars(main.title)} characters, limit ${limits.youtube.title}`);
  if (!main.pinned_comment) missing.push('main.pinned_comment');
  if (!main.community_post) missing.push('main.community_post');
  for (const short of data.shorts) {
    if (chars(short.title) > limits.youtube.title) errors.push(`youtube ${short.name}: title has ${chars(short.title)} characters, limit ${limits.youtube.title}`);
    if (!short.instagram) missing.push(`shorts.${short.name}.instagram`);
    else {
      const caption = [short.instagram.caption, short.instagram.hashtags.join(' ')].filter(Boolean).join('\n\n');
      if (chars(caption) > limits.instagram.caption) errors.push(`instagram ${short.name}: caption has ${chars(caption)} characters, limit ${limits.instagram.caption}`);
      const tags = short.instagram.hashtags.length + (short.instagram.caption.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0);
      if (tags > limits.instagram.hashtags) errors.push(`instagram ${short.name}: ${tags} hashtags, limit ${limits.instagram.hashtags}`);
      if (!short.instagram.story) missing.push(`shorts.${short.name}.instagram.story`);
    }
    if (!short.tiktok) missing.push(`shorts.${short.name}.tiktok`);
    else {
      // The description holds the caption, the pointer to the full video, and the hashtags.
      const caption = [short.tiktok.caption, short.tiktok.overlay ?? '', short.tiktok.hashtags.join(' ')].filter(Boolean).join('\n\n');
      if (chars(caption) > limits.tiktok.caption) errors.push(`tiktok ${short.name}: caption has ${chars(caption)} characters, limit ${limits.tiktok.caption}`);
      if (short.tiktok.hashtags.length > limits.tiktok.hashtags) errors.push(`tiktok ${short.name}: ${short.tiktok.hashtags.length} hashtags, limit ${limits.tiktok.hashtags}`);
    }
    if (short.instagram && short.tiktok && short.instagram.caption.trim() === short.tiktok.caption.trim()) {
      errors.push(`${short.name}: the Instagram and TikTok captions are identical; write one per platform`);
    }
  }
  if (!data.instagram_post) missing.push('instagram_post');
  if (data.instagram_post) {
    const caption = [data.instagram_post.caption, data.instagram_post.hashtags.join(' ')].join('\n\n');
    if (chars(caption) > limits.instagram.caption) errors.push(`instagram post: caption has ${chars(caption)} characters, limit ${limits.instagram.caption}`);
    if (data.instagram_post.hashtags.length > limits.instagram.hashtags) errors.push(`instagram post: ${data.instagram_post.hashtags.length} hashtags, limit ${limits.instagram.hashtags}`);
  }
  // X: links count as 23 characters each; the YouTube link sits in the reply, not in the post.
  const xLength = (text: string) => chars(text.replace(/https?:\/\/\S+/g, 'x'.repeat(23)));
  const xPost = (post: string, hashtags: string[]) => [post.trim(), hashtags.join(' ')].filter(Boolean).join('\n\n');
  if (!data.x) missing.push('x');
  else {
    const post = xPost(data.x.post, data.x.hashtags);
    if (xLength(post) > limits.x.post) errors.push(`x: post has ${xLength(post)} characters, limit ${limits.x.post}`);
    if (data.x.hashtags.length > limits.x.hashtags) errors.push(`x: ${data.x.hashtags.length} hashtags, limit ${limits.x.hashtags}`);
    if (data.x.reply && xLength(data.x.reply) + 24 > limits.x.post) errors.push(`x: reply with the link has ${xLength(data.x.reply) + 24} characters, limit ${limits.x.post}`);
    if (data.x.media && !data.shorts.some((short) => short.name === data.x?.media)) errors.push(`x: media ${data.x.media} is not a Short in upload.yaml`);
  }
  for (const short of data.shorts) {
    if (!short.x) continue;
    const post = xPost(short.x.post, short.x.hashtags);
    if (xLength(post) > limits.x.post) errors.push(`x ${short.name}: post has ${xLength(post)} characters, limit ${limits.x.post}`);
    if (short.x.hashtags.length > limits.x.hashtags) errors.push(`x ${short.name}: ${short.x.hashtags.length} hashtags, limit ${limits.x.hashtags}`);
  }
  if (!data.linkedin) missing.push('linkedin (decision post or skip, with the reason)');
  else if (data.linkedin.decision === 'post' && data.linkedin.post) {
    const post = [data.linkedin.post.trim(), data.linkedin.hashtags.join(' ')].filter(Boolean).join('\n\n');
    if (chars(post) > limits.linkedin.post) errors.push(`linkedin: post has ${chars(post)} characters, limit ${limits.linkedin.post}`);
    if (data.linkedin.hashtags.length > limits.linkedin.hashtags) errors.push(`linkedin: ${data.linkedin.hashtags.length} hashtags, limit ${limits.linkedin.hashtags}`);
    const hook = data.linkedin.post.split(/\n\s*\n/)[0] ?? '';
    if (chars(hook) > limits.linkedin.hook) errors.push(`linkedin: the first paragraph has ${chars(hook)} characters; only ${limits.linkedin.hook} show before "see more"`);
    if (data.linkedin.media !== 'main' && !data.shorts.some((short) => short.name === data.linkedin?.media)) errors.push(`linkedin: media ${data.linkedin.media} is not main or a Short`);
  }
  if (!data.microsite) missing.push('microsite');
  if (!data.announcement) missing.push('announcement');
  else if (data.announcement.hashtags.length > limits.instagram.hashtags) {
    errors.push(`announcement: ${data.announcement.hashtags.length} hashtags, limit ${limits.instagram.hashtags} (Instagram)`);
  }
  if (options.music) {
    if (!data.spotify?.pitch) missing.push('spotify.pitch');
    else if (chars(data.spotify.pitch) > limits.spotify.pitch) errors.push(`spotify: pitch has ${chars(data.spotify.pitch)} characters, limit ${limits.spotify.pitch}`);
    if (!data.spotify?.artist_pick) missing.push('spotify.artist_pick');
  }
  return { errors, missing };
}
