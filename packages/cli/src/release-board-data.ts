import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ReleaseManifestSchema,
  chaptersFromSections,
  formatId,
  loadChannel,
  loadProject,
  loadReleaseSchedule,
  platformLimits,
  plainLyrics,
  planAutopilot,
  readJsonFile,
  releaseIdentity,
  type AutopilotEventPlan,
  type AutopilotPlatform,
  type CalendarEvent,
  type ReleaseCalendar,
  type ReleaseManifest,
  type ReleaseStatus,
  type UploadData,
} from '@coreslopper/core';
import { loadCalendar, loadStatus } from './release-calendar.js';
import { micrositeSong, type MicrositeSong } from './release-microsite.js';
import {
  announcementText,
  calendarEventLabel,
  distributorRows,
  feedVideo,
  linkedinPostText,
  mediaFile,
  releaseLabels,
  tiktokDescription,
  xTexts,
  youtubeDescriptionText,
  youtubeTarget,
  type ReleaseTextInput,
} from './release-texts.js';
import { loadUploadData, uploadPaths } from './upload-text.js';
import { releaseDir, songJson } from './release.js';
import { DERIVED_PATHS } from './release-images.js';
import { autopilotReadiness, lastRun, loadAutopilotLog } from './autopilot-state.js';

// The release board's view of one project: per platform the posts to make,
// each with its files (paths inside renders/release/), the texts to paste
// with their limits, the settings to check, and where it links to. Post ids
// are calendar event ids, so a post's done state is its calendar entry's.

export interface BoardFile {
  label: string;
  /** Path inside the release folder. */
  path: string;
  kind: 'video' | 'image' | 'audio' | 'text' | 'file';
}

export interface BoardField {
  label: string;
  value: string;
  limit?: number;
  unit?: 'chars' | 'bytes';
  /** How the platform counts: X counts a link as 23 characters. */
  counting?: 'x';
  note?: string;
}

export interface BoardPost {
  id: string;
  heading: string;
  /** From the calendar; absent for posts without a date. */
  at?: string;
  files: BoardFile[];
  fields: BoardField[];
  checklist: string[];
  /** Where the post sends people. */
  pointer?: string;
  /** Ask for the live URL once posted. */
  url?: boolean;
  /** A task to do (distributor, pitch, canvas, links), not a post to publish. */
  task?: boolean;
}

export interface BoardPlatform {
  id: 'youtube' | 'shorts' | 'tiktok' | 'instagram' | 'spotify' | 'x' | 'linkedin' | 'microsite';
  label: string;
  /** The channel's profile on the platform. */
  profile?: string;
  notes: string[];
  /** Why the platform is left out for this song. */
  skipped?: string;
  posts: BoardPost[];
}

/** Where one calendar event stands with the autopilot. */
export interface BoardAutopilotEvent {
  state: AutopilotEventPlan['state'];
  block?: AutopilotEventPlan['block'];
  /** The platform of the API action, when there is one. */
  platform?: AutopilotEventPlan['platform'];
  dueAt?: string;
  retryAt?: string;
  needsUser: boolean;
  attempts: number;
  error?: string;
  /** What the user still does by hand after the API step. */
  manualSteps: string[];
  /** The autopilot posted it. */
  byAutopilot: boolean;
}

export interface BoardAutopilot {
  approval?: { at: string; release_date: string };
  /** Why the release cannot be approved yet. */
  blockers: string[];
  ready: Record<AutopilotPlatform, boolean>;
  /** Tokens that expire soon and other setup notes. */
  notes: string[];
  /** When release-run last finished a round. */
  lastRun?: string;
  /** Events the autopilot posts, and events that stay manual. */
  automatic: number;
  manual: number;
  events: Record<string, BoardAutopilotEvent>;
}

export interface BoardProject {
  slug: string;
  title: string;
  artist?: string;
  language: string;
  kind: 'music-video' | 'episode';
  releaseDate?: string;
  proposed: boolean;
  hasRelease: boolean;
  todos: string[];
  platforms: BoardPlatform[];
  calendar: (CalendarEvent & { label: string })[];
  status: ReleaseStatus;
  microsite?: MicrositeSong;
  autopilot: BoardAutopilot;
}

const NOTES = {
  de: {
    youtube: [
      'Externe Links in der Beschreibung und ein angepinnter Kommentar brauchen „erweiterte Funktionen“ (Telefon-Verifizierung).',
      'Über dem Titel zeigt YouTube höchstens 3 Hashtags; ab 60 werden alle ignoriert.',
      'Abspann-Elemente in den letzten 5–20 s; Link-Karten und Link-Abspann nur im Partnerprogramm.',
    ],
    shorts: [
      'Links in Shorts-Beschreibungen sind nicht klickbar: der Weg zum Hauptvideo ist „Verwandtes Video“ (Studio → Inhalte → Short).',
      'Eigenes Thumbnail für Shorts nur in YouTube Studio am Desktop.',
    ],
    tiktok: [
      'KI-Label ist Pflicht bei realistischen KI-Bildern, -Videos oder -Stimmen.',
      'Links in Captions sind nicht klickbar; Bio-Link erst ab 1.000 Followern oder mit Business-Konto.',
      'Planen geht in TikTok Studio (Web) höchstens 10 Tage im Voraus.',
    ],
    instagram: [
      'Höchstens 5 Hashtags pro Post und Reel. Etwa 125 Zeichen der Caption sind vor „mehr“ sichtbar.',
      'Das Reel-Cover lässt sich nach dem Upload nicht mehr ändern; das Raster zeigt die mittleren 3:4.',
      'Klickbar ist nur der Link-Sticker in der Story und der Bio-Link (bis zu 5 Links).',
    ],
    spotify: [
      'Pitch mindestens 7 Tage vor dem Release; dann landet der Song auch im Release Radar der Follower.',
      'Canvas: 3–8 s, 9:16, keine URLs, Logos oder Aufrufe; Clips gibt es seit Juni 2026 nicht mehr.',
      'Spotify hat kein Feld für einen YouTube-Link: das Musikvideo selbst auf Spotify bringen (Beta) und als Artist Pick setzen.',
    ],
    x: ['Ohne Premium: 280 Zeichen (ein Link zählt 23) und 140 s Video.', 'Video direkt hochladen, den YouTube-Link in die erste Antwort.'],
    linkedin: ['Etwa 210 Zeichen sind vor „mehr anzeigen“ sichtbar; der erste Absatz muss tragen.', 'Video direkt hochladen; höchstens 3 Hashtags.'],
    microsite: ['Die Song-Seite baut die Microsite aus microsite/<slug>.json; Live-URLs aus dem Board kommen beim nächsten release dazu.'],
    legal: 'Impressum: ein kommerzielles Profil braucht ein Impressum mit Klarnamen, höchstens zwei Klicks entfernt (§ 5 DDG). KI-Inhalte kennzeichnen (EU AI Act Art. 50).',
  },
  en: {
    youtube: [
      'External links in the description and a pinned comment need advanced features (phone verification).',
      'YouTube shows at most 3 hashtags above the title; with more than 60 it ignores all.',
      'End screen elements in the last 5–20 s; link cards and link end screens only in the Partner Program.',
    ],
    shorts: [
      'Links in Shorts descriptions are not clickable: the way to the main video is the related video (Studio → Content → Short).',
      'A custom Shorts thumbnail only from YouTube Studio on desktop.',
    ],
    tiktok: [
      'The AI label is required for realistic AI images, video, or voices.',
      'Caption links are not clickable; a bio link needs 1,000 followers or a business account.',
      'TikTok Studio (web) schedules at most 10 days ahead.',
    ],
    instagram: [
      'At most 5 hashtags per post and Reel. About 125 characters of the caption show before "more".',
      'The Reel cover cannot be changed after upload; the grid shows the middle 3:4.',
      'Only the story link sticker and the bio links (up to 5) are clickable.',
    ],
    spotify: [
      'Pitch at least 7 days before the release; the song then also lands in followers’ Release Radar.',
      'Canvas: 3–8 s, 9:16, no URLs, logos, or calls to action; Clips ended in June 2026.',
      'Spotify has no YouTube link field: bring the music video itself to Spotify (beta) and make it the Artist Pick.',
    ],
    x: ['Without Premium: 280 characters (a link counts 23) and 140 s of video.', 'Upload the video natively and put the YouTube link in the first reply.'],
    linkedin: ['About 210 characters show before "see more"; the first paragraph has to carry.', 'Upload the video natively; at most 3 hashtags.'],
    microsite: ['The microsite builds the song page from microsite/<slug>.json; live URLs from the board join it on the next release run.'],
    legal: 'Impressum: a commercial profile needs a legal notice with the legal name, at most two clicks away (§ 5 DDG). Label AI content (EU AI Act Art. 50).',
  },
};

const BOARD = {
  de: {
    announceStory: 'Story-Bild mit Termin',
    announcePost: 'Post-Bild mit Termin',
    teaserFile: 'Teaser (10 s)',
    storyImage: 'Story-Bild',
    feedImageFile: 'Feed-Bild (4:5)',
    feedImageCheck: 'Feed-Bild als Beitrag',
    master: 'Hauptvideo',
    upload: 'Thumbnail (Upload)',
    alt: (n: number) => `Thumbnail ${n} (Testen und vergleichen)`,
    subtitles: 'Untertitel',
    video: 'Video',
    thumb: 'Thumbnail',
    tiktokCover: 'TikTok-Cover (3:4)',
    cover: 'Cover',
    canvas: 'Canvas',
    audio: 'Audio (WAV)',
    lyrics: 'Lyrics',
    lrc: 'Lyrics (synchron)',
    json: 'Microsite-Daten',
    title: 'Titel',
    description: 'Beschreibung',
    hashtags: 'Hashtags, kommagetrennt',
    tags: 'Tags',
    pinned: 'Angepinnter Kommentar',
    text: 'Text',
    caption: 'Caption',
    story: 'Story-Text',
    post: 'Post',
    reply: 'Antwort mit Link',
    pitch: 'Pitch',
    artistPick: 'Artist-Pick-Text',
    teaser: 'Teaser',
    pageText: 'Seitentext',
    quote: 'Zitat',
    reason: 'Begründung',
    related: 'Verwandtes Video = Hauptvideo',
    synthetic: '„Veränderte oder synthetische Inhalte“: Ja',
    kids: 'Zielgruppe: nicht speziell für Kinder',
    category: 'Kategorie Musik, Sprache und Untertitel gesetzt',
    endscreen: 'Abspann: Abo-Element und ein Short oder eine Playlist',
    premiere: 'Planen → „Als Premiere festlegen“',
    publish: 'Planen oder veröffentlichen zur Kalenderzeit',
    customThumb: 'Thumbnail in YouTube Studio (Desktop) hochladen',
    ttAi: '„KI-generierte Inhalte“ einschalten',
    ttCover: 'Cover bearbeiten → TikTok-Cover hochladen',
    ttPinned: 'Kommentar posten und anpinnen',
    igAi: '„KI-Info“ einschalten',
    igCover: (s?: number) => (s !== undefined ? `Titelbild: ${s.toFixed(1)} s ins Reel (oder Thumbnail hochladen)` : 'Titelbild mit sichtbarem Hook'),
    sticker: 'Link-Sticker zum Hauptvideo',
    feedImage: 'Bild: Streaming-Cover (4:5 zuschneiden)',
    feedVideo: 'Hauptvideo (Feed-Format)',
    feedVideoCheck: 'Hauptvideo im Feed-Format als Beitrag; das Cover-Bild als Titelbild',
    longReel: 'Länger als 3 min: Instagram empfiehlt das Video Nicht-Followern nicht; die Reels der Shorts tragen die Reichweite',
    canvasCheck: 'Canvas in Spotify for Artists hochladen (Song → Canvas)',
    spotifyUrl: 'Spotify-Link des Songs im Board eintragen, sobald er live ist',
    linksStep: 'Spotify-Link in YouTube-Beschreibung und angepinnten Kommentar',
    videoBeta: 'Musikvideo (Beta) hochladen und als Artist Pick setzen, falls verfügbar',
    pitchCheck: 'Spotify for Artists → Musik → Demnächst → Pitch',
    distributorCheck: 'Formular in dieser Reihenfolge ausfüllen; KI-Angaben setzen',
    xVideo: 'Video direkt hochladen',
    xReply: 'Antwort direkt nach dem Post setzen',
    liVideo: 'Video direkt hochladen',
    pageCheck: 'Song-Seite aus microsite/<slug>.json veröffentlichen',
    youtubePointer: 'Hauptvideo auf YouTube',
    noRelease: 'Noch kein Release-Paket: `npm run cli -- release projects/<slug>` ausführen.',
    skipLinkedin: 'Kein LinkedIn-Beitrag',
    noLinkedin: 'Noch keine Entscheidung: linkedin in review/upload.yaml',
  },
  en: {
    announceStory: 'Story image with the date',
    announcePost: 'Post image with the date',
    teaserFile: 'Teaser (10 s)',
    storyImage: 'Story image',
    feedImageFile: 'Feed image (4:5)',
    feedImageCheck: 'The feed image as the post',
    master: 'Main video',
    upload: 'Thumbnail (upload)',
    alt: (n: number) => `Thumbnail ${n} (Test & compare)`,
    subtitles: 'Subtitles',
    video: 'Video',
    thumb: 'Thumbnail',
    tiktokCover: 'TikTok cover (3:4)',
    cover: 'Cover',
    canvas: 'Canvas',
    audio: 'Audio (WAV)',
    lyrics: 'Lyrics',
    lrc: 'Lyrics (synced)',
    json: 'Microsite data',
    title: 'Title',
    description: 'Description',
    hashtags: 'Hashtags, comma-separated',
    tags: 'Tags',
    pinned: 'Pinned comment',
    text: 'Text',
    caption: 'Caption',
    story: 'Story text',
    post: 'Post',
    reply: 'Reply with the link',
    pitch: 'Pitch',
    artistPick: 'Artist Pick message',
    teaser: 'Teaser',
    pageText: 'Page text',
    quote: 'Quote',
    reason: 'Why',
    related: 'Related video = the main video',
    synthetic: '"Altered or synthetic content": Yes',
    kids: 'Audience: not made for kids',
    category: 'Category Music, language and subtitles set',
    endscreen: 'End screen: subscribe element and a Short or playlist',
    premiere: 'Schedule → "Set as Premiere"',
    publish: 'Schedule or publish at the calendar time',
    customThumb: 'Upload the thumbnail in YouTube Studio (desktop)',
    ttAi: 'Turn on "AI-generated content"',
    ttCover: 'Edit cover → upload the TikTok cover',
    ttPinned: 'Post the comment and pin it',
    igAi: 'Turn on "AI info"',
    igCover: (s?: number) => (s !== undefined ? `Cover: ${s.toFixed(1)} s into the Reel (or upload the thumbnail)` : 'Cover with the hook visible'),
    sticker: 'Link sticker to the main video',
    feedImage: 'Image: the streaming cover (crop to 4:5)',
    feedVideo: 'Main video (feed format)',
    feedVideoCheck: 'Main video in the feed format as the post; the cover image as its cover',
    longReel: 'Longer than 3 min: Instagram does not recommend it to non-followers; the Shorts’ Reels carry the reach',
    canvasCheck: 'Upload the Canvas in Spotify for Artists (song → Canvas)',
    spotifyUrl: 'Enter the song’s Spotify link in the board once it is live',
    linksStep: 'Spotify link into the YouTube description and the pinned comment',
    videoBeta: 'Upload the music video (beta) and make it the Artist Pick, if available',
    pitchCheck: 'Spotify for Artists → Music → Upcoming → Pitch',
    distributorCheck: 'Fill in the form in this order; set the AI credits',
    xVideo: 'Upload the video natively',
    xReply: 'Reply right after posting',
    liVideo: 'Upload the video natively',
    pageCheck: 'Publish the song page from microsite/<slug>.json',
    youtubePointer: 'Main video on YouTube',
    noRelease: 'No release package yet: run `npm run cli -- release projects/<slug>`.',
    skipLinkedin: 'No LinkedIn post',
    noLinkedin: 'No decision yet: linkedin in review/upload.yaml',
  },
};

/** The release-folder files the texts refer to, read back from manifest.json. */
export function filesFromManifest(manifest: ReleaseManifest | undefined, masterFormat: string): ReleaseTextInput['files'] {
  const files: ReleaseTextInput['files'] = { thumbnails: [], shorts: [] };
  if (!manifest) return files;
  const short = (name: string) => {
    let entry = files.shorts.find((item) => item.name === name);
    if (!entry) files.shorts.push((entry = { name, video: `shorts/${name}-9x16.mp4` }));
    return entry;
  };
  for (const file of manifest.files) {
    const name = /^shorts\/(.+?)-(9x16\.mp4|thumb\.jpg|tiktok\.jpg)$/.exec(file.path)?.[1];
    const format = file.kind === 'video' ? /-(\d+x\d+)\.mp4$/.exec(file.path)?.[1] : undefined;
    if (format) files.videos = { ...files.videos, [format]: file.path };
    if (file.kind === 'video' && file.path.endsWith(`-${masterFormat}.mp4`)) files.master = file.path;
    else if (file.kind === 'subtitles') files.subtitles = file.path;
    else if (file.kind === 'thumbnail') files.thumbnails.push(file.path);
    else if (file.kind === 'short' && name) short(name).video = file.path;
    else if (file.kind === 'short-thumbnail' && name) short(name).thumbnail = file.path;
    else if (file.kind === 'tiktok-cover' && name) short(name).tiktokCover = file.path;
    else if (file.kind === 'audio') files.audio = file.path;
    else if (file.kind === 'cover') files.cover = file.path;
    else if (file.kind === 'canvas') files.canvas = file.path;
    else if (file.kind === 'lyrics' && file.path.endsWith('.txt')) files.lyricsTxt = file.path;
    else if (file.kind === 'lyrics' && file.path.endsWith('.lrc')) files.lyricsLrc = file.path;
    else if (file.path === DERIVED_PATHS.announceStory) files.announceStory = file.path;
    else if (file.path === DERIVED_PATHS.announcePost) files.announcePost = file.path;
    else if (file.path === DERIVED_PATHS.teaser) files.teaser = file.path;
    else if (file.path === DERIVED_PATHS.story) files.story = file.path;
    else if (file.path === DERIVED_PATHS.feedImage) files.feedImage = file.path;
  }
  files.thumbnails.sort();
  files.shorts.sort((a, b) => a.name.localeCompare(b.name));
  return files;
}

const kindOf = (path: string): BoardFile['kind'] =>
  /\.(mp4|mov|webm)$/i.test(path) ? 'video' : /\.(jpe?g|png|webp)$/i.test(path) ? 'image' : /\.(wav|mp3|flac)$/i.test(path) ? 'audio' : /\.(txt|lrc|srt|md|json)$/i.test(path) ? 'text' : 'file';
const file = (label: string, path: string | undefined): BoardFile[] => (path ? [{ label, path, kind: kindOf(path) }] : []);
const field = (label: string, value: string | undefined, extra: Partial<BoardField> = {}): BoardField[] => (value?.trim() ? [{ label, value, ...extra }] : []);

/** Everything the release texts of a project are made from: the board and the autopilot read the same. */
export async function projectReleaseContext(projectRoot: string, root: string) {
  const project = await loadProject(projectRoot);
  const music = project.config.kind !== 'episode';
  const channel = await loadChannel(root);
  const limits = platformLimits(channel);
  const song = await songJson(project);
  const identity = releaseIdentity(project.config, song);
  const data: UploadData | undefined = existsSync(uploadPaths(project.paths.root).data) ? await loadUploadData(project.paths.root).catch(() => undefined) : undefined;
  const language = project.config.release?.language ?? (typeof song.language === 'string' ? song.language : undefined) ?? data?.language ?? channel?.language ?? 'en';
  const l = releaseLabels(language);
  const dir = releaseDir(project.paths.root);
  const manifestPath = join(dir, 'manifest.json');
  const manifest = existsSync(manifestPath) ? await readJsonFile(manifestPath, ReleaseManifestSchema).catch(() => undefined) : undefined;
  const files = filesFromManifest(manifest, formatId(project.config.formats.master.aspect));
  const calendar: ReleaseCalendar | undefined = await loadCalendar(project.paths.root).catch(() => undefined);
  const status = await loadStatus(project.paths.root);
  const schedule = await loadReleaseSchedule(root);
  const timing = project.effectiveTiming ?? project.timing;
  const input: ReleaseTextInput = {
    kind: music ? 'music-video' : 'episode',
    language,
    slug: project.config.slug,
    artist: identity.artist,
    title: identity.title,
    data,
    release: project.config.release,
    channel,
    limits,
    chapters: data?.main.chapters ?? (timing ? chaptersFromSections(timing) : []),
    files,
    calendar,
    premiere: schedule.release.premiere,
    durationSeconds: timing?.audio.duration,
  };
  return { project, music, channel, limits, identity, data, language, l, dir, manifest, files, calendar, status, schedule, input };
}

/** Build the board view of one project. */
export async function boardProject(projectRoot: string, root: string, options: { now?: Date } = {}): Promise<BoardProject> {
  const { project, music, channel, limits, identity, data, language, l, manifest, files, calendar, status, schedule, input } = await projectReleaseContext(projectRoot, root);
  const de = language.toLowerCase().startsWith('de');
  const b = de ? BOARD.de : BOARD.en;
  const notes = de ? NOTES.de : NOTES.en;
  const at = (id: string) => calendar?.events.find((event) => event.id === id)?.at;
  const heading = (id: string, fallback: string) => {
    const event = calendar?.events.find((entry) => entry.id === id);
    return event ? calendarEventLabel(event, l, schedule.release.premiere) : fallback;
  };
  const videoUrl = youtubeTarget(l, status.items.youtube?.url);
  const profile = (platform: string) => channel?.links[platform]?.url ?? channel?.links[platform]?.handle;
  const hashtagCount = (caption: string, tags: string[]) => tags.length + (caption.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0);
  const main = data?.main;
  const thumbs = files.thumbnails.map((path, index) => ({ label: index === 0 ? b.upload : b.alt(index + 1), path, kind: 'image' as const }));
  const announcement = announcementText(input);

  // YouTube
  const youtube: BoardPost[] = [];
  if (announcement) {
    youtube.push({ id: 'announce:youtube', heading: heading('announce:youtube', l.announce.heading), at: at('announce:youtube'), files: files.announcePost ? file(b.announcePost, files.announcePost) : file(b.cover, files.cover), fields: field(b.text, announcement), checklist: [], url: true });
  }
  const description = youtubeDescriptionText(input, l);
  youtube.push({
    id: 'youtube',
    heading: heading('youtube', b.master),
    at: at('youtube'),
    files: [...file(b.master, files.master), ...thumbs, ...file(b.subtitles, files.subtitles)],
    fields: [
      ...field(b.title, main?.title, { limit: limits.youtube.title, unit: 'chars' }),
      ...field(b.description, description, { limit: limits.youtube.description_bytes, unit: 'bytes' }),
      ...field(b.hashtags, main?.hashtags.join(', ')),
      ...field(b.tags, main?.tags.join(', '), { limit: limits.youtube.tags, unit: 'chars' }),
      ...field(b.pinned, main?.pinned_comment),
    ],
    checklist: [schedule.release.premiere ? b.premiere : b.publish, b.synthetic, b.kids, b.category, b.endscreen],
    url: true,
  });
  if (main?.community_post) youtube.push({ id: 'community', heading: heading('community', l.community), at: at('community'), files: file(b.upload, files.thumbnails[0]), fields: field(b.text, main.community_post), checklist: [], url: true });
  if (music) {
    youtube.push({
      id: 'links',
      heading: heading('links', b.linksStep),
      at: at('links'),
      files: [],
      fields: field('Spotify', status.items.song?.url),
      checklist: [b.linksStep],
      task: true,
    });
  }

  // Shorts, TikTok, Instagram, X per Short
  const shortsPosts: BoardPost[] = [];
  const tiktokPosts: BoardPost[] = [];
  const instagramPosts: BoardPost[] = [];
  const xPosts: BoardPost[] = [];
  if (announcement) {
    instagramPosts.push({
      id: 'announce:instagram',
      heading: heading('announce:instagram', l.announce.heading),
      at: at('announce:instagram'),
      files: files.announceStory ? [...file(b.announceStory, files.announceStory), ...file(b.teaserFile, files.teaser)] : file(b.cover, files.cover),
      fields: field(b.story, announcement),
      checklist: [],
      url: false,
    });
  }
  const firstStory = data?.shorts.find((short) => short.instagram?.story)?.instagram?.story;
  instagramPosts.push({
    id: 'story',
    heading: heading('story', l.ig.story),
    at: at('story'),
    files: [...(files.story ? file(b.storyImage, files.story) : file(b.thumb, files.shorts[0]?.thumbnail)), ...file(b.video, files.shorts[0]?.video)],
    fields: field(b.story, firstStory),
    checklist: [b.sticker],
    pointer: videoUrl,
  });
  if (data?.instagram_post) {
    const caption = [data.instagram_post.caption.trim(), data.instagram_post.hashtags.join(' ')].filter(Boolean).join('\n\n');
    instagramPosts.push({
      id: 'instagram-post',
      heading: heading('instagram-post', l.ig.post),
      at: at('instagram-post'),
      files: feedVideo(input)
        ? [...file(b.feedVideo, feedVideo(input)), ...file(b.cover, files.cover)]
        : files.feedImage
          ? file(b.feedImageFile, files.feedImage)
          : file(b.cover, files.cover),
      fields: field(b.caption, caption, { limit: limits.instagram.caption, unit: 'chars', note: `${hashtagCount(data.instagram_post.caption, data.instagram_post.hashtags)}/${limits.instagram.hashtags} Hashtags` }),
      checklist: [feedVideo(input) ? b.feedVideoCheck : files.feedImage ? b.feedImageCheck : b.feedImage, b.igAi, ...((input.durationSeconds ?? 0) > 180 ? [b.longReel] : [])],
      url: true,
    });
  }
  if (announcement && data?.x) {
    xPosts.push({ id: 'announce:x', heading: heading('announce:x', l.announce.heading), at: at('announce:x'), files: files.teaser ? file(b.teaserFile, files.teaser) : files.announcePost ? file(b.announcePost, files.announcePost) : file(b.cover, files.cover), fields: field(b.post, announcement, { limit: limits.x.post, unit: 'chars', counting: 'x' }), checklist: [], url: true });
  }
  if (data?.x) {
    const texts = xTexts(data.x, videoUrl);
    xPosts.push({
      id: 'x',
      heading: heading('x', l.x.post),
      at: at('x'),
      files: file(b.video, mediaFile(input, data.x.media ?? files.shorts[0]?.name)),
      fields: [...field(b.post, texts.post, { limit: limits.x.post, unit: 'chars', counting: 'x' }), ...field(b.reply, texts.reply, { limit: limits.x.post, unit: 'chars', counting: 'x' })],
      checklist: [b.xVideo, b.xReply],
      pointer: videoUrl,
      url: true,
    });
  }
  for (const entry of files.shorts) {
    const short = data?.shorts.find((item) => item.name === entry.name);
    const id = (platform: string) => `short:${entry.name}:${platform}`;
    shortsPosts.push({
      id: id('youtube'),
      heading: `${entry.name}${short?.moment ? ` — ${short.moment}` : ''}`,
      at: at(id('youtube')),
      files: [...file(b.video, entry.video), ...file(b.thumb, entry.thumbnail)],
      fields: [
        ...field(b.title, short?.title, { limit: limits.youtube.title, unit: 'chars' }),
        ...field(b.description, short ? [short.description.trim(), short.hashtags.join(' ')].join('\n\n') : undefined),
        ...field(b.hashtags, short?.hashtags.join(', ')),
      ],
      checklist: [b.related, b.customThumb, b.synthetic, b.kids, b.publish],
      pointer: b.youtubePointer,
      url: true,
    });
    if (short?.tiktok || !short) {
      const pointer = l.tt.overlayDefault(channel?.links.youtube?.handle ?? 'YouTube');
      tiktokPosts.push({
        id: id('tiktok'),
        heading: entry.name,
        at: at(id('tiktok')),
        files: [...file(b.video, entry.video), ...file(b.tiktokCover, entry.tiktokCover ?? entry.thumbnail)],
        fields: [
          ...field(b.description, short?.tiktok ? tiktokDescription(short.tiktok, pointer) : undefined, { limit: limits.tiktok.caption, unit: 'chars' }),
          ...field(b.pinned, short?.tiktok?.pinned_comment),
        ],
        checklist: [b.ttCover, b.ttAi, b.publish, ...(short?.tiktok?.pinned_comment ? [b.ttPinned] : [])],
        url: true,
      });
    }
    if (short?.instagram || !short) {
      const ig = short?.instagram;
      const caption = ig ? [ig.caption.trim(), ig.hashtags.join(' ')].filter(Boolean).join('\n\n') : undefined;
      instagramPosts.push({
        id: id('instagram'),
        heading: `${l.ig.reel}: ${entry.name}`,
        at: at(id('instagram')),
        files: [...file(b.video, entry.video), ...file(b.thumb, entry.thumbnail)],
        fields: field(b.caption, caption, { limit: limits.instagram.caption, unit: 'chars', note: ig ? `${hashtagCount(ig.caption, ig.hashtags)}/${limits.instagram.hashtags} Hashtags` : undefined }),
        checklist: [b.igCover(ig?.cover_frame), b.igAi, b.publish],
        url: true,
      });
    }
    if (short?.x) {
      const texts = xTexts({ ...short.x, reply: undefined }, videoUrl);
      xPosts.push({
        id: id('x'),
        heading: `${l.x.short}: ${entry.name}`,
        at: at(id('x')),
        files: file(b.video, entry.video),
        fields: [...field(b.post, texts.post, { limit: limits.x.post, unit: 'chars', counting: 'x' }), ...field(b.reply, texts.reply)],
        checklist: [b.xVideo, b.xReply],
        url: true,
      });
    }
  }
  const order = (posts: BoardPost[]) => posts.sort((a, c) => (a.at && c.at ? Date.parse(a.at) - Date.parse(c.at) : a.at ? -1 : c.at ? 1 : 0));

  // Spotify and the distributor
  const spotify: BoardPost[] = [];
  if (music) {
    spotify.push({
      id: 'distributor',
      heading: heading('distributor', l.sp.form(project.config.release?.distributor === 'distrokid' ? 'DistroKid' : 'Distributor')),
      at: at('distributor'),
      files: [...file(b.audio, files.audio), ...file(b.cover, files.cover), ...file(b.lyrics, files.lyricsTxt), ...file(b.lrc, files.lyricsLrc)],
      fields: distributorRows(input, l).map(([label, value]) => ({ label, value: value.replace(/`/g, '') })),
      checklist: [b.distributorCheck],
      task: true,
    });
    spotify.push({
      id: 'pitch',
      heading: heading('pitch', b.pitch),
      at: at('pitch'),
      files: [],
      fields: field(b.pitch, data?.spotify?.pitch, { limit: limits.spotify.pitch, unit: 'chars' }),
      checklist: [b.pitchCheck],
      task: true,
    });
    spotify.push({ id: 'canvas', heading: heading('canvas', b.canvas), at: at('canvas'), files: file(b.canvas, files.canvas), fields: [], checklist: [b.canvasCheck], task: true });
    spotify.push({ id: 'song', heading: heading('song', l.cal.steps.song), at: at('song'), files: [], fields: [], checklist: [b.spotifyUrl], url: true });
    spotify.push({
      id: 'artist-pick',
      heading: heading('artist-pick', b.artistPick),
      at: at('artist-pick'),
      files: [...file(b.master, files.master), ...file(b.cover, files.cover)],
      fields: field(b.artistPick, data?.spotify?.artist_pick),
      checklist: [b.videoBeta],
      task: true,
    });
  }

  // LinkedIn
  const li = data?.linkedin;
  const linkedin: BoardPost[] = [];
  if (li?.decision === 'post') {
    const text = linkedinPostText(li, videoUrl);
    linkedin.push({
      id: 'linkedin',
      heading: heading('linkedin', l.li.post),
      at: at('linkedin'),
      files: file(b.video, mediaFile(input, li.media)),
      fields: [...field(b.reason, li.reason), ...field(b.post, text, { limit: limits.linkedin.post, unit: 'chars', note: l.li.hook([...(li.post ?? '').split(/\n\s*\n/)[0]!].length, limits.linkedin.hook) })],
      checklist: [b.liVideo],
      pointer: videoUrl,
      url: true,
    });
  }

  // Microsite
  const lyrics = music && existsSync(project.paths.lyrics) ? plainLyrics(await readFile(project.paths.lyrics, 'utf8')) : undefined;
  const microsite = data?.microsite ? micrositeSong(input, { status, calendar, lyrics }) : undefined;
  const micrositePosts: BoardPost[] = data?.microsite
    ? [
        {
          id: 'microsite',
          heading: heading('microsite', l.cal.steps.page),
          at: at('microsite'),
          files: [...file(b.json, `microsite/${project.config.slug}.json`), ...file(b.cover, files.cover), ...file(b.upload, files.thumbnails[0])],
          fields: [...field(b.teaser, data.microsite.teaser), ...field(b.pageText, data.microsite.text), ...field(b.quote, data.microsite.quote)],
          checklist: [b.pageCheck],
          url: true,
        },
      ]
    : [];

  const platforms: BoardPlatform[] = [
    { id: 'youtube', label: 'YouTube', profile: profile('youtube'), notes: notes.youtube, posts: order(youtube) },
    { id: 'shorts', label: 'YouTube Shorts', profile: profile('youtube'), notes: notes.shorts, posts: order(shortsPosts) },
    { id: 'tiktok', label: 'TikTok', profile: profile('tiktok'), notes: [...notes.tiktok, notes.legal], posts: order(tiktokPosts) },
    { id: 'instagram', label: 'Instagram', profile: profile('instagram'), notes: [...notes.instagram, notes.legal], posts: order(instagramPosts) },
    ...(music ? [{ id: 'spotify' as const, label: 'Spotify & Distributor', profile: profile('spotify'), notes: notes.spotify, posts: spotify }] : []),
    { id: 'x', label: 'X', profile: profile('x'), notes: notes.x, posts: order(xPosts) },
    {
      id: 'linkedin',
      label: 'LinkedIn',
      profile: profile('linkedin'),
      notes: notes.linkedin,
      skipped: !li ? b.noLinkedin : li.decision === 'skip' ? `${b.skipLinkedin}: ${li.reason}` : undefined,
      posts: linkedin,
    },
    { id: 'microsite', label: 'Microsite', notes: notes.microsite, posts: micrositePosts },
  ];
  const autopilot = await boardAutopilot({ root, projectRoot: project.paths.root, calendar, status, schedule, manifest: Boolean(manifest), data: Boolean(data), now: options.now });
  return {
    autopilot,
    slug: project.config.slug,
    title: identity.title,
    artist: identity.artist,
    language,
    kind: input.kind,
    releaseDate: calendar?.release_date ?? project.config.release?.release_date,
    proposed: calendar?.proposed ?? !project.config.release?.release_date,
    hasRelease: Boolean(manifest),
    todos: manifest?.todos ?? [b.noRelease.replace('<slug>', project.config.slug)],
    platforms,
    calendar: (calendar?.events ?? []).map((event) => ({ ...event, label: calendarEventLabel(event, l, schedule.release.premiere) })),
    status,
    microsite,
  };
}

/** The autopilot's view of a project for the board: the approval, the credentials, and each event's state. */
export async function boardAutopilot(options: {
  root: string;
  projectRoot: string;
  calendar?: ReleaseCalendar;
  status: ReleaseStatus;
  schedule: Awaited<ReturnType<typeof loadReleaseSchedule>>;
  manifest: boolean;
  data: boolean;
  now?: Date;
  env?: NodeJS.ProcessEnv;
}): Promise<BoardAutopilot> {
  const now = options.now ?? new Date();
  const settings = options.schedule.autopilot;
  const { ready, notes } = autopilotReadiness(settings, options.env, now);
  const blockers: string[] = [];
  if (!options.manifest) blockers.push('no release package yet: run release');
  if (!options.data) blockers.push('review/upload.yaml is missing');
  if (!options.calendar) blockers.push('no release calendar yet: run release');
  const log = await loadAutopilotLog(options.projectRoot);
  const plans = options.calendar
    ? planAutopilot({ calendar: options.calendar, status: options.status, log, settings, now, ready, premiere: options.schedule.release.premiere })
    : [];
  const events: Record<string, BoardAutopilotEvent> = {};
  for (const plan of plans) {
    const failed = plan.last?.status === 'failed' ? plan.last.error : undefined;
    const steps = [...log.entries].reverse().find((entry) => entry.event === plan.id && entry.manual_steps.length)?.manual_steps ?? [];
    events[plan.id] = {
      state: plan.state,
      ...(plan.block ? { block: plan.block } : {}),
      ...(plan.platform ? { platform: plan.platform } : {}),
      ...(plan.dueAt ? { dueAt: plan.dueAt } : {}),
      ...(plan.retryAt ? { retryAt: plan.retryAt } : {}),
      needsUser: plan.needsUser,
      attempts: plan.attempts,
      ...(failed ? { error: failed } : {}),
      manualSteps: steps,
      byAutopilot: options.status.items[plan.id]?.by === 'autopilot',
    };
  }
  const automatic = plans.filter((plan) => plan.action && plan.state !== 'manual').length;
  return {
    ...(options.status.approval ? { approval: options.status.approval } : {}),
    blockers,
    ready,
    notes,
    lastRun: await lastRun(options.root),
    automatic,
    manual: plans.length - automatic,
    events,
  };
}
