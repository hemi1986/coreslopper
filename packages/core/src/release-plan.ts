import {
  ReleasePlanSchema,
  type ChannelConfig,
  type ReleaseCalendar,
  type ReleaseMetadata,
  type ReleasePlan,
  type ReleasePlanPost,
  type ReleaseShape,
  type UploadData,
} from './schema.js';
import type { Chapter, PlatformLimits, ShortsSource } from './release.js';
import { SHORT_FORM_MAX_SECONDS, upToThreeMinutes } from './short-form.js';

// One release plan: every post's exact text, files, source and limits, and what
// is still to write. It is assembled once from the project, `review/upload.yaml`,
// and the channel; `release` writes it into `manifest.json`, and the folder
// texts, QA, the board, the autopilot and `publish` read it. Pure: no ffmpeg, no
// filesystem.

/** The files of `renders/release/` the folder texts refer to. */
export interface ReleasePlanFiles {
  master?: string;
  /** Every format's video, by format id (`16x9`, `9x16`, `1x1`, ...). */
  videos?: Record<string, string>;
  subtitles?: string;
  thumbnails: string[];
  shorts: { name: string; video: string; thumbnail?: string; tiktokCover?: string }[];
  audio?: string;
  cover?: string;
  /** A short episode's 1080x1440 TikTok cover (ADR 0057). */
  tiktokCover?: string;
  canvas?: string;
  lyricsTxt?: string;
  lyricsLrc?: string;
  announceStory?: string;
  announcePost?: string;
  teaser?: string;
  story?: string;
}

/** The longest main video that still gets its Instagram Reel, in seconds (ADR 0057). */
export const MAIN_REEL_MAX_SECONDS = SHORT_FORM_MAX_SECONDS;

/**
 * Whether the main video goes to Instagram as a Reel: only up to 3 minutes,
 * 180 s included, within `upToThreeMinutes`'s tolerance. An unknown length (no
 * timing) keeps the Reel.
 */
export function mainVideoReel(durationSeconds: number | undefined): boolean {
  return durationSeconds === undefined || upToThreeMinutes(durationSeconds);
}

/**
 * The texts of the upload data a release does not use, each named by its
 * field: a Short's story caption when the release-day story shows another
 * Short (or none), and `instagram_post` when the main video lasts over 3
 * minutes and gets no Reel (ADR 0057). QA warns about them; they never fail.
 */
export function unusedTexts(data: UploadData, plan: Pick<ReleasePlan, 'posts' | 'kind' | 'shape'>, durationSeconds: number | undefined): string[] {
  const unused: string[] = [];
  const shape = plan.shape ?? plan.kind;
  const story = plan.posts.find((post) => post.id === 'story');
  const shown = story?.files.find((file) => file.role === 'video')?.path;
  const shownName = shown ? /^shorts\/(.+)-9x16\.mp4$/.exec(shown)?.[1] : undefined;
  if (shape !== 'meme' && shape !== 'short-episode') {
    for (const short of data.shorts) {
      if (!short.instagram?.story || short.name === shownName) continue;
      unused.push(
        `shorts.${short.name}.instagram.story: the release-day story ${shownName ? `shows ${shownName}` : 'shows no Short'}, so this caption is not used`,
      );
    }
    if (data.instagram_post && durationSeconds !== undefined && !mainVideoReel(durationSeconds)) {
      unused.push('instagram_post: the main video lasts over 3 minutes and gets no Reel, so this text is not used');
    }
  }
  return unused;
}

/** The video of the main video's Reel: the best vertical render there is – 9:16, 4:5, 1:1 – else the master. */
export function reelVideo(files: Pick<ReleasePlanFiles, 'videos' | 'master'>): string | undefined {
  return files.videos?.['9x16'] ?? files.videos?.['4x5'] ?? files.videos?.['1x1'] ?? files.master;
}

/** The longest video an X account without Premium may post, in seconds (F9 in docs/research/platform-video-formats.md). */
export const X_FREE_VIDEO_SECONDS = 140;

/** The video of the X release post: the main video (the master) for `main` or no media, else the named Short. */
export function xVideo(files: Pick<ReleasePlanFiles, 'master' | 'shorts'>, media: string | undefined): string | undefined {
  if (!media || media === 'main') return files.master;
  return files.shorts.find((short) => short.name === media)?.video;
}

/** Everything a release plan is made from. */
export interface ReleasePlanInput {
  kind: 'music-video' | 'episode' | 'meme';
  /** The release shape (`releaseShape`, or the manifest's). A short episode posts its one video on every platform (ADR 0057). */
  shape: ReleaseShape;
  /**
   * Where the Shorts come from (`releaseForm`); `vertical-version` posts only the
   * vertical version in `files.shorts`, with the texts of the upload data's entry
   * named by the slug. Without it, a short episode and a meme have none and every
   * other release cuts its Shorts.
   */
  shortsSource?: ShortsSource;
  language: string;
  slug: string;
  artist?: string;
  title: string;
  data?: UploadData;
  release?: ReleaseMetadata;
  calendar?: ReleaseCalendar;
  premiere?: boolean;
  channel?: ChannelConfig;
  limits: PlatformLimits;
  chapters: Chapter[];
  credits?: string[];
  files: ReleasePlanFiles;
  durationSeconds?: number;
  /** The line a TikTok description gets when a Short has no `overlay` (the channel's YouTube handle). */
  tiktokPointer?: string;
}

type DraftLimit = {
  max: number;
  unit?: 'chars' | 'bytes';
  counting?: 'x';
  extra?: number;
  strip?: string[];
  label: string;
  field: string;
  verb?: 'has' | 'have';
  style?: 'linkedin-hook';
};

type DraftText = { value: string; limit?: DraftLimit; hashtags?: { count: number; max: number; label: string; suffix?: string } };

type DraftPost = Omit<ReleasePlanPost, 'task' | 'texts' | 'files' | 'errors' | 'missing'> & {
  task?: boolean;
  texts?: Record<string, DraftText>;
  files?: { role: string; path: string; index?: number }[];
  errors?: string[];
  missing?: string[];
};

const chars = (text: string) => [...text].length;

/** X counts every link as 23 characters, also a link it does not shorten. */
export const countX = (text: string) => chars(text.replace(/https?:\/\/\S+/g, 'x'.repeat(23)));

/** The hashtags a caption carries: its own list plus those written in the text. */
export function countHashtags(text: string, hashtags: string[]): number {
  return hashtags.length + (text.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0);
}

/**
 * The text a meme's platform post carries before its hashtags: its description
 * and the credits the library sounds it took need (HS-261, HS-265).
 */
export function memeDescription(data: Pick<UploadData, 'main'> | undefined, credits: string[] = []): string {
  return [data?.main.description.trim() ?? '', ...credits].filter(Boolean).join('\n\n');
}

/**
 * The caption of a meme's one video: its description, the credits the library
 * sounds it took need, and its hashtags. `release` writes this string and the
 * checks measure it, so the two cannot drift (HS-172, ADR 0045).
 */
export function memeCaption(data: Pick<UploadData, 'main'> | undefined, credits: string[] = []): string {
  const main = data?.main;
  return [memeDescription(data, credits), main?.hashtags.join(' ') ?? ''].filter(Boolean).join('\n\n');
}

/** The hashtags a meme's platform post carries: the list plus any the description already holds (credits are not counted). */
export function memeHashtags(data: Pick<UploadData, 'main'> | undefined): number {
  const main = data?.main;
  return countHashtags(main?.description ?? '', main?.hashtags ?? []);
}

/** The TikTok description: caption, the pointer to the full video (TikTok Studio has no text overlay), hashtags. */
export function tiktokDescription(tt: { caption: string; hashtags: string[]; overlay?: string }, pointer: string): string {
  return [tt.caption.trim(), (tt.overlay ?? pointer).trim(), tt.hashtags.join(' ')].filter(Boolean).join('\n\n');
}

/**
 * What TikTok receives when a Short has no TikTok text yet: the upload title
 * without `#shorts`, plus its hashtags. It keeps `publish` working on a package
 * the skill still has to finish; the plan marks the text as missing.
 */
export function tiktokFallback(title: string, hashtags: string[]): string {
  const isShorts = (tag: string) => /^#shorts$/i.test(tag);
  const clean = title
    .split(/\s+/)
    .filter((word) => !isShorts(word))
    .join(' ')
    .trim();
  const tags = hashtags.filter((tag) => !isShorts(tag) && !clean.includes(tag));
  return [clean, tags.join(' ')].filter(Boolean).join('\n\n');
}

function chapterLabel(seconds: number): string {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** Footer lines from the channel that are ready to paste: a fact that is still missing is not written, and is a TODO elsewhere. */
function resolvedFooter(input: ReleasePlanInput): string[] {
  const channel = input.channel;
  if (!channel) return [];
  const lines: string[] = [];
  if (channel.footer.song_credit && input.kind !== 'episode' && input.artist && input.release?.ai_tool) {
    lines.push(channel.footer.song_credit.replaceAll('{artist}', input.artist).replaceAll('{title}', input.title).replaceAll('{ai_tool}', input.release.ai_tool));
  }
  if (channel.footer.tool_credit) lines.push(channel.footer.tool_credit);
  for (const key of channel.footer.links) {
    const value = channel.links[key]?.url ?? channel.links[key]?.handle;
    if (value && !/<ID>/.test(value)) lines.push(`${key}: ${value}`);
  }
  return lines;
}

/** The YouTube description: body, chapters, footer, hashtags. */
function youtubeDescription(input: ReleasePlanInput): string {
  const main = input.data?.main;
  return [
    main?.description.trim(),
    input.chapters.length ? input.chapters.map((chapter) => `${chapterLabel(chapter.start)} ${chapter.title}`).join('\n') : undefined,
    resolvedFooter(input).length ? resolvedFooter(input).join('\n') : undefined,
    main?.hashtags.length ? main.hashtags.join(' ') : undefined,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** The hashtag list YouTube's field takes: comma-separated, without the leading `#` (the description keeps it). */
function hashtagList(hashtags: string[] | undefined): string | undefined {
  return hashtags?.map((tag) => tag.replace(/^#+/, '')).join(', ');
}

function text(value: string | undefined, limit?: DraftLimit, hashtags?: DraftText['hashtags']): DraftText | undefined {
  if (value === undefined || !value.trim()) return undefined;
  return { value: value.trim(), ...(limit ? { limit } : {}), ...(hashtags ? { hashtags } : {}) };
}

function texts(...entries: [string, DraftText | undefined][]): Record<string, DraftText> {
  return Object.fromEntries(entries.filter((entry): entry is [string, DraftText] => Boolean(entry[1])));
}

function measured(text: string, limit: DraftLimit): number {
  let value = text;
  for (const slot of limit.strip ?? []) value = value.replaceAll(slot, '');
  if (limit.strip?.length) value = value.trim();
  const length = limit.unit === 'bytes' ? Buffer.byteLength(value) : limit.counting === 'x' ? countX(value) : chars(value);
  return length + (limit.extra ?? 0);
}

/** The limit and completeness problems of a plan, in a stable order. */
export function planProblems(plan: Pick<ReleasePlan, 'posts'>): { errors: string[]; missing: string[] } {
  const errors: string[] = [];
  const missing: string[] = [];
  for (const post of plan.posts) {
    for (const text of Object.values(post.texts)) {
      if (text.limit) {
        const n = measured(text.value, text.limit);
        if (n > text.limit.max) {
          if (text.limit.style === 'linkedin-hook') {
            errors.push(`linkedin: the first paragraph has ${n} characters; only ${text.limit.max} show before "see more"`);
          } else {
            errors.push(
              `${text.limit.label}: ${text.limit.field} ${text.limit.verb ?? 'has'} ${n} ${text.limit.unit === 'bytes' ? 'bytes' : 'characters'}, limit ${text.limit.max}`,
            );
          }
        }
      }
      const hashtags = text.hashtags;
      if (hashtags && hashtags.count > hashtags.max) errors.push(`${hashtags.label}: ${hashtags.count} hashtags, limit ${hashtags.max}${hashtags.suffix ?? ''}`);
    }
    if (post.hook && post.hook.count > post.hook.max) {
      errors.push(`linkedin: the first paragraph has ${post.hook.count} characters; only ${post.hook.max} show before "see more"`);
    }
    errors.push(...post.errors);
    missing.push(...post.missing);
  }
  return { errors, missing: [...new Set(missing)] };
}

/** The plan with the live URLs filled into its `{youtube}` and `{spotify}` slots. */
export function withUrls(plan: ReleasePlan, urls: { youtube?: string; spotify?: string }): ReleasePlan {
  const posts = plan.posts.map((post) => ({
    ...post,
    texts: Object.fromEntries(
      Object.entries(post.texts).map(([key, text]) => [
        key,
        { ...text, value: text.value.replaceAll('{youtube}', urls.youtube ?? '{youtube}').replaceAll('{spotify}', urls.spotify ?? '{spotify}') },
      ]),
    ),
  }));
  // The problems stay as the plan measured them: a link slot is either not
  // counted (LinkedIn) or counted as its 24 characters (the X reply).
  return { ...plan, posts };
}

/**
 * Build the plan of one release. The same input gives the same posts: the
 * folder writer, QA and the board build it from the project, and `publish`
 * reads the one `release` persisted.
 */
export function buildReleasePlan(input: ReleasePlanInput): ReleasePlan {
  const data = input.data;
  const main = data?.main;
  const limits = input.limits;
  const files = input.files;
  const meme = input.kind === 'meme';
  const music = input.kind === 'music-video';
  // A short episode is one video: no main video, Shorts, story, community post or LinkedIn; the upload data's Shorts are ignored.
  const shortEpisode = input.shape === 'short-episode';
  const posts: DraftPost[] = [];
  const youtubeSynthetic = main?.synthetic_media ?? input.channel?.disclosure.youtube_synthetic ?? true;
  const youtubeTitle = (name?: string): DraftLimit => ({ max: limits.youtube.title, label: name ? `youtube ${name}` : meme || shortEpisode ? 'youtube short' : 'youtube main', field: 'title' });
  // The vertical version is the one Short: only the one in the folder, with the texts named by the slug – never a cut Short's (ADR 0057).
  const verticalVersion = input.shortsSource === 'vertical-version';
  const dataShorts = shortEpisode ? [] : verticalVersion ? (data?.shorts ?? []).filter((short) => short.name === input.slug) : (data?.shorts ?? []);
  const shorts = verticalVersion
    ? files.shorts.map((short) => short.name)
    : [
        ...dataShorts.map((short) => short.name),
        ...(shortEpisode ? [] : files.shorts.map((short) => short.name).filter((name) => !dataShorts.some((short) => short.name === name))),
      ];
  const feed = files.videos?.['4x5'] ?? files.videos?.['1x1'];
  const firstShortVideo = files.shorts[0]?.video;
  const firstShortThumb = files.shorts[0]?.thumbnail;
  const storyCaption = (label: string): DraftLimit => ({ max: limits.instagram.story_caption, label, field: 'caption' });
  const storyCaptionOf = (name: string | undefined) => data?.shorts.find((short) => short.name === name)?.instagram?.story;

  if (meme) {
    const caption = memeCaption(input.data, input.credits);
    const descriptionLimit: DraftLimit = { max: limits.youtube.description_bytes, unit: 'bytes', label: 'youtube short', field: 'description' };
    posts.push({
      id: 'youtube',
      platform: 'youtube',
      files: [{ role: 'master', path: files.master ?? `video/${input.slug}.mp4` }, ...(files.cover ? [{ role: 'cover', path: files.cover }] : [])],
      texts: texts(
        ['title', text(main?.title, youtubeTitle())],
        ['description', text(caption, descriptionLimit)],
        ['tags', text(main?.tags.join(', '), { max: limits.youtube.tags, label: 'youtube short', field: 'tags', verb: 'have' })],
      ),
      source: main?.file,
      syntheticMedia: youtubeSynthetic,
      madeForKids: main?.made_for_kids ?? false,
      language: main?.language ?? input.language,
      url: true,
    });
    const captionLimit = (label: string, platform: 'tiktok' | 'instagram'): DraftLimit => ({
      max: platform === 'tiktok' ? limits.tiktok.caption : limits.instagram.caption,
      label,
      field: 'caption',
    });
    posts.push({
      id: 'tiktok',
      platform: 'tiktok',
      files: [
        ...(files.master ? [{ role: 'video', path: files.master }] : []),
        ...(files.cover ? [{ role: 'cover', path: files.cover }] : []),
      ],
      texts: texts(['caption', text(caption, captionLimit('tiktok', 'tiktok'), { count: memeHashtags(input.data), max: limits.tiktok.hashtags, label: 'tiktok' })]),
      media: files.master,
      source: main?.file,
      url: true,
    });
    posts.push({
      id: 'instagram',
      platform: 'instagram',
      files: [
        ...(files.master ? [{ role: 'video', path: files.master }] : []),
        ...(files.cover ? [{ role: 'cover', path: files.cover }] : []),
      ],
      texts: texts(['caption', text(caption, captionLimit('instagram', 'instagram'), { count: memeHashtags(input.data), max: limits.instagram.hashtags, label: 'instagram' })]),
      media: files.master,
      url: true,
    });
    const draft = ReleasePlanSchema.parse({
      version: 1,
      kind: input.kind,
      language: input.language,
      slug: input.slug,
      artist: input.artist,
      title: input.title,
      durationSeconds: input.durationSeconds,
      premiere: false,
      settings: settingsOf(input),
      posts,
      problems: { errors: [], missing: [] },
    });
    return { ...draft, problems: planProblems(draft) };
  }

  // The main video on YouTube, or a short episode's one video as a Short: title, description with hashtags, hashtags.
  if (shortEpisode) {
    posts.push({
      id: 'youtube',
      platform: 'youtube',
      files: [...(files.master ? [{ role: 'master', path: files.master }] : []), ...(files.cover ? [{ role: 'cover', path: files.cover }] : [])],
      texts: texts(
        ['title', text(main?.title, youtubeTitle())],
        ['description', text(main ? [main.description.trim(), main.hashtags.join(' ')].filter(Boolean).join('\n\n') : undefined, { max: limits.youtube.description_bytes, unit: 'bytes', label: 'youtube short', field: 'description' })],
        ['hashtags', text(hashtagList(main?.hashtags))],
        ['tags', text(main?.tags.join(', '), { max: limits.youtube.tags, label: 'youtube short', field: 'tags', verb: 'have' })],
      ),
      source: main?.file,
      syntheticMedia: youtubeSynthetic,
      madeForKids: main?.made_for_kids ?? false,
      language: main?.language ?? input.language,
      url: true,
    });
  } else {
    posts.push(mainVideoPost(input, youtubeTitle(), youtubeSynthetic));
  }

  for (const name of shorts) {
    const short = dataShorts.find((entry) => entry.name === name);
    const file = files.shorts.find((entry) => entry.name === name);
    const base = {
      id: '',
      platform: 'shorts' as const,
      source: short?.file,
      moment: short?.moment,
      syntheticMedia: short?.synthetic_media ?? input.channel?.disclosure.youtube_synthetic ?? true,
      madeForKids: short?.made_for_kids ?? false,
      language: short?.language ?? data?.language ?? input.language,
    };
    posts.push({
      ...base,
      id: `short:${name}:youtube`,
      files: [...(file?.video ? [{ role: 'video', path: file.video }] : []), ...(file?.thumbnail ? [{ role: 'thumb', path: file.thumbnail }] : [])],
      texts: texts(
        ['title', text(short?.title, youtubeTitle(name))],
        ['description', text(short ? [short.description.trim(), short.hashtags.join(' ')].filter(Boolean).join('\n\n') : undefined)],
        ['hashtags', text(hashtagList(short?.hashtags))],
      ),
      url: true,
    });

    const tiktok = short?.tiktok;
    const pointer = input.tiktokPointer ?? '';
    const caption = tiktok ? tiktokDescription(tiktok, pointer) : short ? tiktokFallback(short.title, short.hashtags) : undefined;
    posts.push({
      ...base,
      id: `short:${name}:tiktok`,
      platform: 'tiktok',
      files: [
        ...(file?.video ? [{ role: 'video', path: file.video }] : []),
        ...(file?.tiktokCover ?? file?.thumbnail ? [{ role: 'tiktok-cover', path: (file?.tiktokCover ?? file?.thumbnail)! }] : []),
      ],
      texts: texts(
        ['caption', text(caption, { max: limits.tiktok.caption, label: `tiktok ${name}`, field: 'caption' }, tiktok ? { count: tiktok.hashtags.length, max: limits.tiktok.hashtags, label: `tiktok ${name}` } : undefined)],
        ['pinned', text(tiktok?.pinned_comment)],
      ),
      media: file?.video,
      url: true,
      missing: [...(!tiktok ? [`shorts.${name}.tiktok`] : [])],
    });

    const instagram = short?.instagram;
    const instagramCaption = instagram ? [instagram.caption.trim(), instagram.hashtags.join(' ')].filter(Boolean).join('\n\n') : undefined;
    const identical = Boolean(instagram && tiktok && instagram.caption.trim() === tiktok.caption.trim());
    posts.push({
      ...base,
      id: `short:${name}:instagram`,
      platform: 'instagram',
      files: [...(file?.video ? [{ role: 'video', path: file.video }] : []), ...(file?.thumbnail ? [{ role: 'thumb', path: file.thumbnail }] : [])],
      texts: texts(
        [
          'caption',
          text(
            instagramCaption,
            instagram ? { max: limits.instagram.caption, label: `instagram ${name}`, field: 'caption' } : undefined,
            instagram ? { count: countHashtags(instagram.caption, instagram.hashtags), max: limits.instagram.hashtags, label: `instagram ${name}` } : undefined,
          ),
        ],
      ),
      media: file?.video,
      coverFrame: instagram?.cover_frame,
      url: true,
      errors: identical ? [`${name}: the Instagram and TikTok captions are identical; write one per platform`] : [],
      // The story text is the release-day story's optional caption, never a TODO (HS-267).
      missing: [...(!instagram ? [`shorts.${name}.instagram`] : [])],
    });

    if (short?.x) {
      posts.push({
        ...base,
        id: `short:${name}:x`,
        platform: 'x',
        files: [...(file?.video ? [{ role: 'video', path: file.video }] : [])],
        texts: texts(
          ['post', text([short.x.post.trim(), short.x.hashtags.join(' ')].filter(Boolean).join('\n\n'), { max: limits.x.post, counting: 'x', label: `x ${name}`, field: 'post' })],
          ['reply', text('{youtube}')],
        ),
        media: file?.video,
        needsYoutube: true,
        url: true,
      });
    }
  }

  if (shortEpisode) posts.push(...oneVideoPosts(input));

  // The main video's Reel: only when the main video lasts at most 3 minutes (ADR 0057).
  if (!shortEpisode && mainVideoReel(input.durationSeconds)) {
    const reel = reelVideo(files);
    posts.push({
      id: 'instagram-post',
      platform: 'instagram',
      files: [...(reel ? [{ role: 'video', path: reel }] : []), ...(files.cover ? [{ role: 'cover', path: files.cover }] : [])],
      texts: texts(
        [
          'caption',
          text(
            data?.instagram_post ? [data.instagram_post.caption.trim(), data.instagram_post.hashtags.join(' ')].filter(Boolean).join('\n\n') : undefined,
            data?.instagram_post ? { max: limits.instagram.caption, label: 'instagram post', field: 'caption' } : undefined,
            data?.instagram_post ? { count: countHashtags(data.instagram_post.caption, data.instagram_post.hashtags), max: limits.instagram.hashtags, label: 'instagram post' } : undefined,
          ),
        ],
      ),
      media: reel,
      url: true,
      missing: [...(!data?.instagram_post ? ['instagram_post'] : [])],
    });
  }

  // X: the release post with the main video, or a Short it names, and its optional reply.
  const x = data?.x;
  const xMediaPath = xVideo(files, x?.media);
  posts.push({
    id: 'x',
    platform: 'x',
    files: xMediaPath ? [{ role: 'video', path: xMediaPath }] : [],
    texts: texts(
      ['post', text(x ? [x.post.trim(), x.hashtags.join(' ')].filter(Boolean).join('\n\n') : undefined, { max: limits.x.post, counting: 'x', label: 'x', field: 'post' })],
      ['reply', text(x?.reply ? [x.reply.trim(), '{youtube}'].join(' ') : undefined, { max: limits.x.post, counting: 'x', extra: 24, strip: ['{youtube}'], label: 'x', field: 'reply with the link' })],
    ),
    media: xMediaPath,
    // Only the reply carries the YouTube link: a post without one waits for nothing.
    ...(x?.reply ? { needsYoutube: true, pointer: 'youtube' as const } : {}),
    url: true,
    errors: x?.media && x.media !== 'main' && !files.shorts.some((short) => short.name === x.media) && !dataShorts.some((short) => short.name === x.media) ? [`x: media ${x.media} is not a Short in upload.yaml`] : [],
    missing: [...(!x ? ['x'] : [])],
  });

  // LinkedIn: the post when the song has the angle, and the reason either way.
  const linkedin = data?.linkedin;
  if (!shortEpisode && linkedin?.decision === 'post' && linkedin.post) {
    const hook = linkedin.post.split(/\n\s*\n/)[0] ?? '';
    const linkedinMedia = linkedin.media === 'main' ? feed ?? files.master : files.shorts.find((short) => short.name === linkedin.media)?.video;
    posts.push({
      id: 'linkedin',
      platform: 'linkedin',
      files: linkedinMedia ? [{ role: 'video', path: linkedinMedia }] : [],
      texts: texts(
        ['reason', text(linkedin.reason)],
        [
          'post',
          text([linkedin.post.trim(), '{youtube}', linkedin.hashtags.join(' ')].filter(Boolean).join('\n\n'), { max: limits.linkedin.post, label: 'linkedin', field: 'post' }),
        ],
      ),
      hook: { count: chars(hook), max: limits.linkedin.hook },
      media: linkedinMedia,
      needsYoutube: true,
      pointer: 'youtube',
      url: true,
      errors: linkedin.media !== 'main' && !files.shorts.some((short) => short.name === linkedin.media) && !dataShorts.some((short) => short.name === linkedin.media) ? [`linkedin: media ${linkedin.media} is not main or a Short`] : [],
    });
  }

  // The microsite page.
  posts.push({
    id: 'microsite',
    platform: 'microsite',
    files: [
      { role: 'microsite-json', path: `microsite/${input.slug}.json` },
      ...(files.cover ? [{ role: 'cover', path: files.cover }] : []),
      ...(files.thumbnails[0] ? [{ role: 'thumbnail', path: files.thumbnails[0] }] : []),
    ],
    texts: texts(['teaser', text(data?.microsite?.teaser)], ['pageText', text(data?.microsite?.text)], ['quote', text(data?.microsite?.quote)]),
    url: true,
    missing: [...(!data?.microsite ? ['microsite'] : [])],
  });

  // The announcement, a week before.
  if (!meme) {
    // A short episode has no release-day story, and its announcement image is vertical.
    const announceImage = files.announcePost ?? (shortEpisode ? files.announceStory : undefined);
    if (!shortEpisode) posts.push({
      id: 'story',
      platform: 'instagram',
      files: [
        ...(files.story ? [{ role: 'story-image', path: files.story }] : firstShortThumb ? [{ role: 'thumbnail', path: firstShortThumb }] : []),
        ...(firstShortVideo ? [{ role: 'video', path: firstShortVideo }] : []),
      ],
      // A story has no text field: only a story that shows a video carries a caption (HS-267).
      texts: texts(['caption', firstShortVideo ? text(storyCaptionOf(files.shorts[0]?.name), storyCaption('story')) : undefined]),
      media: files.story ?? files.cover,
      pointer: 'youtube',
      needsYoutube: true,
    });
    if (data?.announcement) {
      const announcement = [data.announcement.text.trim(), data.announcement.hashtags.join(' ')].filter(Boolean).join('\n\n');
      posts.push({
        id: 'announce:youtube',
        platform: 'youtube',
        files: announceImage ? [{ role: 'announce-post', path: announceImage }] : files.cover ? [{ role: 'cover', path: files.cover }] : [],
        texts: texts(['text', text(announcement)]),
        media: announceImage ?? files.cover,
        url: true,
      });
      posts.push({
        id: 'announce:instagram',
        platform: 'instagram',
        files: files.announceStory
          ? [...(files.teaser ? [{ role: 'teaser', path: files.teaser }] : []), { role: 'announce-story', path: files.announceStory }]
          : files.cover
            ? [{ role: 'cover', path: files.cover }]
            : [],
        // The announcement story carries its own optional caption, and only while it shows the teaser (HS-267).
        texts: texts(['caption', files.announceStory && files.teaser && data.announcement.story ? text(data.announcement.story, storyCaption('announcement story')) : undefined]),
        media: files.announceStory ?? files.cover,
      });
      posts.push({
        id: 'announce:x',
        platform: 'x',
        files: files.teaser
          ? [{ role: 'teaser', path: files.teaser }]
          : announceImage
            ? [{ role: 'announce-post', path: announceImage }]
            : files.cover
              ? [{ role: 'cover', path: files.cover }]
              : [],
        texts: texts(['post', text(announcement, { max: limits.x.post, counting: 'x', label: 'x', field: 'post' })]),
        media: files.teaser ?? announceImage ?? files.cover,
        url: true,
      });
    } else {
      posts.push({ id: 'announcement', platform: 'x', texts: {}, missing: ['announcement'] });
    }
  }

  if (music) {
    posts.push({ id: 'links', platform: 'youtube', task: true, texts: {}, url: true });
    posts.push({
      id: 'distributor',
      platform: 'spotify',
      task: true,
      texts: {},
      files: [
        ...(files.audio ? [{ role: 'audio', path: files.audio }] : []),
        ...(files.cover ? [{ role: 'cover', path: files.cover }] : []),
        ...(files.lyricsTxt ? [{ role: 'lyrics', path: files.lyricsTxt }] : []),
        ...(files.lyricsLrc ? [{ role: 'lyrics-synced', path: files.lyricsLrc }] : []),
      ],
    });
    posts.push({
      id: 'pitch',
      platform: 'spotify',
      task: true,
      texts: texts(['pitch', text(data?.spotify?.pitch, { max: limits.spotify.pitch, label: 'spotify', field: 'pitch' })]),
      missing: [...(!data?.spotify?.pitch ? ['spotify.pitch'] : [])],
    });
    posts.push({ id: 'canvas', platform: 'spotify', task: true, texts: {}, files: files.canvas ? [{ role: 'canvas', path: files.canvas }] : [] });
    posts.push({ id: 'song', platform: 'spotify', task: true, texts: {}, url: true });
    posts.push({
      id: 'artist-pick',
      platform: 'spotify',
      task: true,
      files: [
        ...(files.master ? [{ role: 'master', path: files.master }] : []),
        ...(files.cover ? [{ role: 'cover', path: files.cover }] : []),
      ],
      texts: texts(['artistPick', text(data?.spotify?.artist_pick)]),
      missing: [...(!data?.spotify?.artist_pick ? ['spotify.artist_pick'] : [])],
    });
  }

  const draft = ReleasePlanSchema.parse({
    version: 1,
    kind: input.kind,
    language: input.language,
    slug: input.slug,
    artist: input.artist,
    title: input.title,
    durationSeconds: input.durationSeconds,
    shape: input.shape,
    // A meme and a short episode are Shorts, never a Premiere.
    premiere: !meme && !shortEpisode && Boolean(input.premiere),
    settings: settingsOf(input),
    posts,
    problems: { errors: [], missing: [] },
  });
  return { ...draft, problems: planProblems(draft) };
}

/** The main video's YouTube post: description with chapters and footer, the thumbnails, the pinned comment and the community post. */
function mainVideoPost(input: ReleasePlanInput, title: DraftLimit, youtubeSynthetic: boolean): DraftPost {
  const { files, limits } = input;
  const main = input.data?.main;
  const description = youtubeDescription(input);
  return {
    id: 'youtube',
    platform: 'youtube',
    texts: texts(
      ['title', text(main?.title, title)],
      ['description', text(description, { max: limits.youtube.description_bytes, unit: 'bytes', label: 'youtube main', field: 'description' })],
      ['hashtags', text(hashtagList(main?.hashtags))],
      ['tags', text(main?.tags.join(', '), { max: limits.youtube.tags, label: 'youtube main', field: 'tags', verb: 'have' })],
      ['pinned', text(main?.pinned_comment)],
      ['community', text(main?.community_post)],
    ),
    files: [
      ...(files.master ? [{ role: 'master', path: files.master }] : []),
      ...(files.subtitles ? [{ role: 'subtitles', path: files.subtitles }] : []),
      ...files.thumbnails.map((path, index) => ({ role: index === 0 ? 'thumbnail' : 'alt', path, ...(index ? { index: index + 1 } : {}) })),
    ],
    source: main?.file,
    syntheticMedia: youtubeSynthetic,
    madeForKids: main?.made_for_kids ?? false,
    language: main?.language ?? input.language,
    english: main?.summary_en,
    url: true,
    missing: [...(!main?.pinned_comment ? ['main.pinned_comment'] : []), ...(!main?.community_post ? ['main.community_post'] : [])],
  };
}

/** The caption of a short episode's platform post: its text and hashtags. */
const platformCaption = (block: UploadData['tiktok']) => (block ? [block.caption.trim(), block.hashtags.join(' ')].filter(Boolean).join('\n\n') : undefined);

/** A short episode's one video on TikTok and as a Reel, each with its own caption (ADR 0057); a missing one is a TODO. */
function oneVideoPosts(input: ReleasePlanInput): DraftPost[] {
  const { data, files, limits } = input;
  const tiktok = data?.tiktok;
  const instagram = data?.instagram;
  const identical = Boolean(instagram && tiktok && instagram.caption.trim() === tiktok.caption.trim());
  const video = files.master ? [{ role: 'video', path: files.master }] : [];
  return [
    {
      id: 'tiktok',
      platform: 'tiktok',
      files: [...video, ...(files.tiktokCover ? [{ role: 'tiktok-cover', path: files.tiktokCover }] : [])],
      texts: texts([
        'caption',
        text(
          platformCaption(tiktok),
          { max: limits.tiktok.caption, label: 'tiktok', field: 'caption' },
          tiktok ? { count: countHashtags(tiktok.caption, tiktok.hashtags), max: limits.tiktok.hashtags, label: 'tiktok' } : undefined,
        ),
      ]),
      media: files.master,
      source: data?.main.file,
      url: true,
      missing: tiktok ? [] : ['tiktok'],
    },
    {
      id: 'instagram',
      platform: 'instagram',
      files: [...video, ...(files.cover ? [{ role: 'cover', path: files.cover }] : [])],
      texts: texts([
        'caption',
        text(
          platformCaption(instagram),
          { max: limits.instagram.caption, label: 'instagram', field: 'caption' },
          instagram ? { count: countHashtags(instagram.caption, instagram.hashtags), max: limits.instagram.hashtags, label: 'instagram' } : undefined,
        ),
      ]),
      media: files.master,
      url: true,
      errors: identical ? ['the Instagram and TikTok captions are identical; write one per platform'] : [],
      missing: instagram ? [] : ['instagram'],
    },
  ];
}

function settingsOf(input: ReleasePlanInput): ReleasePlan['settings'] {
  return {
    youtubeSynthetic: input.channel?.disclosure.youtube_synthetic ?? true,
    instagramAiLabel: input.channel?.disclosure.instagram_ai_label ?? true,
    tiktokAiLabel: input.channel?.disclosure.tiktok_ai_label ?? true,
    ...(input.channel?.links.youtube?.handle ? { youtubeHandle: input.channel.links.youtube.handle } : {}),
    ...(input.release?.distributor ? { distributor: input.release.distributor } : {}),
    ...(input.data?.linkedin ? { linkedin: { decision: input.data.linkedin.decision, reason: input.data.linkedin.reason } } : {}),
  };
}
