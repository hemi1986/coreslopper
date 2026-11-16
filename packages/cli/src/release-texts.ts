import {
  RELEASE_PLAN,
  TODO,
  chapterTime,
  planDate,
  type ChannelConfig,
  type Chapter,
  type PlatformLimits,
  type ReleaseMetadata,
  type UploadData,
  type UploadShort,
} from '@coreslopper/core';

// The copy-and-paste texts of the release folder. The skill writes the
// creative texts into review/upload.yaml; this module lays them out per
// platform with the facts (files, chapters, credits, links, limits) and marks
// every gap with TODO. Labels follow the project's language.

export interface ReleaseTextInput {
  kind: 'music-video' | 'episode';
  language: string;
  slug: string;
  artist?: string;
  title: string;
  data?: UploadData;
  release?: ReleaseMetadata;
  channel?: ChannelConfig;
  limits: PlatformLimits;
  chapters: Chapter[];
  /** Paths inside the release folder. */
  files: {
    master?: string;
    subtitles?: string;
    thumbnails: string[];
    shorts: { name: string; video: string; thumbnail?: string }[];
    audio?: string;
    cover?: string;
    canvas?: string;
    lyricsTxt?: string;
    lyricsLrc?: string;
  };
  durationSeconds?: number;
}

interface Labels {
  todo: (what: string) => string;
  file: string;
  thumbnail: string;
  thumbnails: string;
  title: string;
  description: string;
  hashtags: string;
  tags: string;
  chapters: string;
  noChapters: string;
  pinned: string;
  community: string;
  english: string;
  checklist: string;
  chars: (n: number, limit: number) => string;
  bytes: (n: number, limit: number) => string;
  yt: {
    heading: string;
    visibility: string;
    synthetic: (yes: boolean) => string;
    kids: (yes: boolean) => string;
    category: (language: string) => string;
    endscreen: string;
    subtitles: (file: string) => string;
    testCompare: string;
  };
  shorts: { heading: string; related: string; relatedStep: string };
  ig: {
    heading: string;
    reel: string;
    caption: string;
    cover: (seconds?: number) => string;
    aiLabel: string;
    story: string;
    sticker: string;
    post: string;
    postImage: string;
  };
  tt: { heading: string; description: string; cover: string; coverUpload: (file: string) => string; coverFrame: string; settings: string; visibility: string; aiLabel: string; schedule: string; overlayDefault: (handle: string) => string; afterPost: string; pinned: string };
  sp: {
    heading: string;
    form: (distributor: string) => string;
    fields: Record<'artist' | 'featured' | 'title' | 'genres' | 'language' | 'explicit' | 'songwriters' | 'producer' | 'label' | 'isrc' | 'ai' | 'date' | 'cover' | 'audio' | 'lyrics', string>;
    yes: string;
    no: string;
    aiShare: Record<'none' | 'partial' | 'full', string>;
    aiParts: Record<'lyrics' | 'music' | 'vocals' | 'instrumental', string>;
    afterUpload: string;
    s4a: string;
    canvas: string;
    artistPick: string;
    pitch: string;
    pitchNote: string;
    links: string;
    leadTime: string;
  };
  plan: {
    heading: string;
    day: string;
    date: string;
    step: string;
    noDate: string;
    steps: Record<(typeof RELEASE_PLAN)[number]['key'], string>;
  };
  readme: { heading: string; folders: Record<'video' | 'thumbnails' | 'shorts' | 'audio' | 'streaming' | 'texts', string>; order: string; steps: string[]; todos: string; none: string; manifest: string };
}

const EN: Labels = {
  todo: (what) => `${TODO}: ${what}`,
  file: 'File',
  thumbnail: 'Thumbnail',
  thumbnails: 'Thumbnails',
  title: 'Title',
  description: 'Description',
  hashtags: 'Hashtags',
  tags: 'Tags',
  chapters: 'Chapters',
  noChapters: 'No chapters: YouTube needs at least three of at least 10 s each.',
  pinned: 'Pinned comment',
  community: 'Community post',
  english: 'English version',
  checklist: 'Checklist',
  chars: (n, limit) => `${n}/${limit} characters`,
  bytes: (n, limit) => `${n}/${limit} bytes`,
  yt: {
    heading: 'YouTube — main video',
    visibility: 'Upload as private; publish (or premiere) on the release day',
    synthetic: (yes) => `"Altered or synthetic content": ${yes ? 'Yes' : 'No'}`,
    kids: (yes) => (yes ? 'Audience: made for kids' : 'Audience: not made for kids'),
    category: (language) => `Category Music, video language ${language}`,
    endscreen: 'End screen: subscribe element and a Short or playlist',
    subtitles: (file) => `Subtitles: upload ${file}`,
    testCompare: 'Thumbnail Test & compare',
  },
  shorts: { heading: 'YouTube Shorts', related: 'Related video', relatedStep: 'Related video = the main video (set in YouTube Studio after both are up)' },
  ig: {
    heading: 'Instagram',
    reel: 'Reel',
    caption: 'Caption',
    cover: (seconds) => (seconds !== undefined ? `Cover frame: ${seconds.toFixed(1)} s into the Reel` : 'Cover frame: pick one with the hook visible'),
    aiLabel: 'Turn on "AI info" (made with AI) under Advanced settings',
    story: 'Story',
    sticker: 'Add a link sticker to the YouTube video (or the Spotify link after release)',
    post: 'Feed post for the release',
    postImage: 'Image: the streaming cover or thumbnail 1',
  },
  tt: {
    heading: 'TikTok',
    description: 'Description',
    cover: 'Cover',
    coverUpload: (file) => `Edit cover → Upload: \`${file}\``,
    coverFrame: 'Edit cover → pick the frame with the hook',
    settings: 'Settings',
    visibility: 'Who can watch: Everyone',
    aiLabel: 'Show more → turn on "AI-generated content"',
    schedule: 'When to post: now, or scheduled as in release-plan.md',
    overlayDefault: (handle) => (handle === 'YouTube' ? 'Full video on YouTube' : `Full video on YouTube: ${handle}`),
    afterPost: 'After posting',
    pinned: 'Post this comment and pin it',
  },
  sp: {
    heading: 'Streaming release',
    form: (distributor) => `${distributor} upload form, in its order`,
    fields: {
      artist: 'Artist',
      featured: 'Featured artists',
      title: 'Song title',
      genres: 'Primary / secondary genre',
      language: 'Lyrics language',
      explicit: 'Explicit lyrics',
      songwriters: 'Songwriters (legal names)',
      producer: 'Producer',
      label: 'Label',
      isrc: 'ISRC',
      ai: 'AI credits',
      date: 'Release date',
      cover: 'Cover art',
      audio: 'Audio file',
      lyrics: 'Lyrics',
    },
    yes: 'yes',
    no: 'no',
    aiShare: { none: 'none', partial: 'partly AI', full: 'fully AI' },
    aiParts: { lyrics: 'Lyrics', music: 'Music', vocals: 'Vocals', instrumental: 'Instrumental' },
    afterUpload: 'leave empty for a new ISRC',
    s4a: 'Spotify for Artists',
    canvas: 'Canvas (upload once the song is in Spotify for Artists)',
    artistPick: 'Artist Pick message',
    pitch: 'Editorial pitch (mood, genre, instruments, story)',
    pitchNote: 'Pitch at least 7 days, better 3 weeks before the release date; only unreleased songs can be pitched.',
    links: 'After release: add the Spotify link to the YouTube description, the pinned comment, and the bios',
    leadTime: 'A fixed release date and an editorial pitch need at least three weeks; on DistroKid a chosen date needs Musician Plus or higher.',
  },
  plan: {
    heading: 'Release plan',
    day: 'Day',
    date: 'Date',
    step: 'Step',
    noDate: 'No release date yet: days are relative to the release day (day 0).',
    steps: {
      distributor: 'Upload audio, cover, and metadata to the distributor (spotify.md)',
      pitch: 'Pitch the song in Spotify for Artists (spotify.md)',
      canvas: 'Upload the Canvas and set the Artist Pick in Spotify for Artists',
      youtube: 'Publish or premiere the main video on YouTube (youtube.md)',
      short1: 'Post Short 1 on YouTube, Instagram, and TikTok (shorts.md, instagram.md, tiktok.md)',
      social: 'Story with link sticker; community post; feed post',
      links: 'Add the Spotify link to the YouTube description, the pinned comment, and the bios',
      short2: 'Post Short 2 on all three platforms',
      short3: 'Post Short 3 on all three platforms',
    },
  },
  readme: {
    heading: 'Release package',
    folders: {
      video: 'the video in every format, and the subtitles',
      thumbnails: 'three 1280x720 thumbnails for the main video (1 = upload, 2 and 3 = Test & compare)',
      shorts: 'three Shorts with their 1080x1920 thumbnails, for YouTube, Instagram Reels, and TikTok',
      audio: 'the song as WAV for the distributor',
      streaming: 'cover (3000x3000), Spotify Canvas, lyrics (plain and synchronised)',
      texts: 'the texts to copy, one file per platform, and the release plan',
    },
    order: 'Order',
    steps: [
      'Distributor first (texts/spotify.md), at least three weeks before the release date when you want a pitch.',
      'YouTube main video on the release day (texts/youtube.md).',
      'Shorts, Reels, and TikToks staggered over the following days (texts/release-plan.md).',
    ],
    todos: 'Open TODOs',
    none: 'None.',
    manifest: 'manifest.json lists every file with its size, SHA-256, specification, and source.',
  },
};

const DE: Labels = {
  ...EN,
  todo: (what) => `${TODO}: ${what}`,
  file: 'Datei',
  thumbnail: 'Thumbnail',
  thumbnails: 'Thumbnails',
  title: 'Titel',
  description: 'Beschreibung',
  hashtags: 'Hashtags',
  tags: 'Tags',
  chapters: 'Kapitel',
  noChapters: 'Keine Kapitel: YouTube braucht mindestens drei mit je mindestens 10 s.',
  pinned: 'Angepinnter Kommentar',
  community: 'Community-Post',
  english: 'Englische Fassung',
  checklist: 'Checkliste',
  chars: (n, limit) => `${n}/${limit} Zeichen`,
  bytes: (n, limit) => `${n}/${limit} Bytes`,
  yt: {
    heading: 'YouTube — Hauptvideo',
    visibility: 'Als privat hochladen; am Release-Tag veröffentlichen (oder als Premiere)',
    synthetic: (yes) => `„Veränderte oder synthetische Inhalte“: ${yes ? 'Ja' : 'Nein'}`,
    kids: (yes) => (yes ? 'Zielgruppe: speziell für Kinder' : 'Zielgruppe: nicht speziell für Kinder'),
    category: (language) => `Kategorie Musik, Videosprache ${language}`,
    endscreen: 'Abspann: Abo-Element und ein Short oder eine Playlist',
    subtitles: (file) => `Untertitel: ${file} hochladen`,
    testCompare: 'Thumbnail-Test („Testen und vergleichen“)',
  },
  shorts: { heading: 'YouTube Shorts', related: 'Verwandtes Video', relatedStep: 'Verwandtes Video = Hauptvideo (in YouTube Studio, wenn beide online sind)' },
  ig: {
    heading: 'Instagram',
    reel: 'Reel',
    caption: 'Caption',
    cover: (seconds) => (seconds !== undefined ? `Titelbild: ${seconds.toFixed(1)} s ins Reel` : 'Titelbild: ein Frame mit sichtbarem Hook'),
    aiLabel: '„KI-Info“ (Mit KI erstellt) unter Erweiterte Einstellungen einschalten',
    story: 'Story',
    sticker: 'Link-Sticker zum YouTube-Video setzen (nach dem Release: Spotify-Link)',
    post: 'Feed-Post zum Release',
    postImage: 'Bild: das Streaming-Cover oder Thumbnail 1',
  },
  tt: {
    heading: 'TikTok',
    description: 'Beschreibung',
    cover: 'Cover',
    coverUpload: (file) => `Cover bearbeiten → Hochladen: \`${file}\``,
    coverFrame: 'Cover bearbeiten → das Bild mit dem Hook wählen',
    settings: 'Einstellungen',
    visibility: 'Wer kann das ansehen: Alle',
    aiLabel: '„Mehr anzeigen“ → „KI-generierte Inhalte“ einschalten',
    schedule: 'Veröffentlichen: sofort oder geplant laut release-plan.md',
    overlayDefault: (handle) => (handle === 'YouTube' ? 'Ganzes Video auf YouTube' : `Ganzes Video auf YouTube: ${handle}`),
    afterPost: 'Nach dem Posten',
    pinned: 'Diesen Kommentar posten und anpinnen',
  },
  sp: {
    heading: 'Streaming-Release',
    form: (distributor) => `Upload-Formular von ${distributor}, in dessen Reihenfolge`,
    fields: {
      artist: 'Künstler',
      featured: 'Featured Artists',
      title: 'Songtitel',
      genres: 'Primäres / sekundäres Genre',
      language: 'Sprache der Lyrics',
      explicit: 'Explizite Inhalte',
      songwriters: 'Songwriter (bürgerliche Namen)',
      producer: 'Produzent',
      label: 'Label',
      isrc: 'ISRC',
      ai: 'KI-Angaben',
      date: 'Release-Datum',
      cover: 'Cover',
      audio: 'Audiodatei',
      lyrics: 'Lyrics',
    },
    yes: 'ja',
    no: 'nein',
    aiShare: { none: 'keine', partial: 'teilweise KI', full: 'vollständig KI' },
    aiParts: { lyrics: 'Text', music: 'Musik', vocals: 'Gesang', instrumental: 'Instrumental' },
    afterUpload: 'leer lassen für einen neuen ISRC',
    s4a: 'Spotify for Artists',
    canvas: 'Canvas (hochladen, sobald der Song in Spotify for Artists auftaucht)',
    artistPick: 'Artist-Pick-Text',
    pitch: 'Pitch an die Redaktion (Stimmung, Genre, Instrumente, Story)',
    pitchNote: 'Pitch mindestens 7 Tage, besser 3 Wochen vor dem Release; nur unveröffentlichte Songs lassen sich pitchen.',
    links: 'Nach dem Release: Spotify-Link in YouTube-Beschreibung, angepinnten Kommentar und Bios eintragen',
    leadTime: 'Ein fester Release-Termin und ein Pitch brauchen mindestens drei Wochen Vorlauf; bei DistroKid braucht ein Wunschtermin Musician Plus oder höher.',
  },
  plan: {
    heading: 'Release-Plan',
    day: 'Tag',
    date: 'Datum',
    step: 'Schritt',
    noDate: 'Noch kein Release-Datum: Tage relativ zum Release-Tag (Tag 0).',
    steps: {
      distributor: 'Audio, Cover und Metadaten beim Distributor hochladen (spotify.md)',
      pitch: 'Song in Spotify for Artists pitchen (spotify.md)',
      canvas: 'Canvas hochladen und Artist Pick setzen (Spotify for Artists)',
      youtube: 'Hauptvideo auf YouTube veröffentlichen oder als Premiere (youtube.md)',
      short1: 'Short 1 auf YouTube, Instagram und TikTok (shorts.md, instagram.md, tiktok.md)',
      social: 'Story mit Link-Sticker; Community-Post; Feed-Post',
      links: 'Spotify-Link in YouTube-Beschreibung, angepinnten Kommentar und Bios eintragen',
      short2: 'Short 2 auf allen drei Plattformen',
      short3: 'Short 3 auf allen drei Plattformen',
    },
  },
  readme: {
    heading: 'Release-Paket',
    folders: {
      video: 'das Video in jedem Format und die Untertitel',
      thumbnails: 'drei Thumbnails 1280x720 fürs Hauptvideo (1 = Upload, 2 und 3 = Testen und vergleichen)',
      shorts: 'drei Shorts mit Thumbnails 1080x1920, für YouTube, Instagram Reels und TikTok',
      audio: 'der Song als WAV für den Distributor',
      streaming: 'Cover (3000x3000), Spotify Canvas, Lyrics (einfach und synchron)',
      texts: 'die Texte zum Kopieren, eine Datei pro Plattform, und der Release-Plan',
    },
    order: 'Reihenfolge',
    steps: [
      'Zuerst der Distributor (texts/spotify.md), mindestens drei Wochen vor dem Release-Datum, wenn ein Pitch gewünscht ist.',
      'YouTube-Hauptvideo am Release-Tag (texts/youtube.md).',
      'Shorts, Reels und TikToks gestaffelt in den Tagen danach (texts/release-plan.md).',
    ],
    todos: 'Offene TODOs',
    none: 'Keine.',
    manifest: 'manifest.json listet jede Datei mit Größe, SHA-256, Spezifikation und Quelle.',
  },
};

export function releaseLabels(language: string): Labels {
  return language.toLowerCase().startsWith('de') ? DE : EN;
}

const count = (text: string) => [...text].length;
const block = (text: string) => ['```text', text.trimEnd(), '```'];
const checkbox = (text: string) => `- [ ] ${text}`;

/**
 * The channel handle (or URL) of a platform, with a TODO while it holds `<ID>`.
 * Undefined without config/channel.yaml or without that platform: texts then go without the link.
 */
function channelLink(channel: ChannelConfig | undefined, platform: string, l: Labels): string | undefined {
  const link = channel?.links[platform];
  const value = link?.handle ?? link?.url;
  if (!value) return undefined;
  return /<ID>/.test(value) ? `${value} ${l.todo(`links.${platform} in config/channel.yaml`)}` : value;
}

/** Footer lines from config/channel.yaml: song credit, tool credit, links. */
export function footerLines(input: Pick<ReleaseTextInput, 'channel' | 'artist' | 'title' | 'release'>, l: Labels): string[] {
  const channel = input.channel;
  if (!channel) return [];
  const lines: string[] = [];
  if (channel.footer.song_credit) {
    lines.push(
      channel.footer.song_credit
        .replaceAll('{artist}', input.artist ?? l.todo('artist'))
        .replaceAll('{title}', input.title)
        .replaceAll('{ai_tool}', input.release?.ai_tool ?? l.todo('release.ai_tool')),
    );
  }
  if (channel.footer.tool_credit) lines.push(channel.footer.tool_credit);
  for (const key of channel.footer.links) {
    const link = channel.links[key];
    const value = link?.url ?? link?.handle;
    if (!value) continue;
    lines.push(/<ID>/.test(value) ? `${key}: ${value} ${l.todo(`links.${key}`)}` : `${key}: ${value}`);
  }
  return lines;
}

/** The YouTube description: body, chapters, footer, hashtags. */
export function youtubeDescriptionText(input: ReleaseTextInput, l: Labels): string {
  const main = input.data?.main;
  const parts = [main?.description.trim() ?? l.todo('main.description in review/upload.yaml')];
  if (input.chapters.length) parts.push(input.chapters.map((chapter) => `${chapterTime(chapter.start)} ${chapter.title}`).join('\n'));
  const footer = footerLines(input, l);
  if (footer.length) parts.push(footer.join('\n'));
  if (main?.hashtags.length) parts.push(main.hashtags.join(' '));
  return parts.join('\n\n');
}

function youtubeText(input: ReleaseTextInput, l: Labels): string {
  const main = input.data?.main;
  const synthetic = main?.synthetic_media ?? input.channel?.disclosure.youtube_synthetic ?? true;
  const description = youtubeDescriptionText(input, l);
  const tags = main?.tags.join(', ') ?? '';
  const lines = [`# ${l.yt.heading}`, ''];
  lines.push(`**${l.file}:** \`${input.files.master ?? l.todo('master render')}\``);
  lines.push(`**${l.thumbnail}:** \`${input.files.thumbnails[0] ?? l.todo('thumbnail 1')}\``);
  if (input.files.thumbnails.length > 1) lines.push(`**${l.yt.testCompare}:** ${input.files.thumbnails.map((file) => `\`${file}\``).join(', ')}`);
  lines.push('', `## ${l.title} (${l.chars(count(main?.title ?? ''), input.limits.youtube.title)})`, '', ...block(main?.title ?? l.todo('main.title')));
  lines.push('', `## ${l.description} (${l.bytes(Buffer.byteLength(description), input.limits.youtube.description_bytes)})`, '', ...block(description));
  if (!input.chapters.length) lines.push('', `_${l.noChapters}_`);
  lines.push('', `## ${l.tags} (${l.chars(tags.length, input.limits.youtube.tags)})`, '', ...block(tags || l.todo('main.tags')));
  lines.push('', `## ${l.pinned}`, '', ...block(main?.pinned_comment ?? l.todo('main.pinned_comment in review/upload.yaml')));
  lines.push('', `## ${l.community}`, '', ...block(main?.community_post ?? l.todo('main.community_post in review/upload.yaml')));
  if (main?.summary_en) lines.push('', `## ${l.english}`, '', ...block(`${main.summary_en.title}\n\n${main.summary_en.description}`));
  lines.push('', `## ${l.checklist}`, '');
  lines.push(checkbox(l.yt.visibility), checkbox(l.yt.synthetic(synthetic)), checkbox(l.yt.kids(main?.made_for_kids ?? false)));
  lines.push(checkbox(l.yt.category(main?.language ?? input.language)), checkbox(l.yt.endscreen));
  if (input.files.subtitles) lines.push(checkbox(l.yt.subtitles(input.files.subtitles)));
  return `${lines.join('\n')}\n`;
}

function shortFor(input: ReleaseTextInput, name: string): UploadShort | undefined {
  return input.data?.shorts.find((short) => short.name === name);
}

function shortsText(input: ReleaseTextInput, l: Labels): string {
  const lines = [`# ${l.shorts.heading}`, ''];
  for (const file of input.files.shorts) {
    const short = shortFor(input, file.name);
    const synthetic = short?.synthetic_media ?? input.channel?.disclosure.youtube_synthetic ?? true;
    lines.push(`## ${file.name}${short?.moment ? ` — ${short.moment}` : ''}`, '');
    lines.push(`**${l.file}:** \`${file.video}\``, `**${l.thumbnail}:** \`${file.thumbnail ?? l.todo('Short thumbnail')}\``, '');
    lines.push(`### ${l.title} (${l.chars(count(short?.title ?? ''), input.limits.youtube.title)})`, '', ...block(short?.title ?? l.todo(`shorts.${file.name}.title`)), '');
    const description = short ? [short.description.trim(), short.hashtags.join(' ')].join('\n\n') : l.todo(`shorts.${file.name} in review/upload.yaml`);
    lines.push(`### ${l.description}`, '', ...block(description), '');
    lines.push(`### ${l.checklist}`, '', checkbox(l.shorts.relatedStep), checkbox(l.yt.synthetic(synthetic)), checkbox(l.yt.kids(short?.made_for_kids ?? false)), '');
  }
  if (input.files.shorts.length === 0) lines.push(l.todo('no Shorts in renders/shorts/'), '');
  return `${lines.join('\n').trimEnd()}\n`;
}

function instagramText(input: ReleaseTextInput, l: Labels): string {
  const lines = [`# ${l.ig.heading}`, ''];
  const youtube = channelLink(input.channel, 'youtube', l);
  for (const file of input.files.shorts) {
    const ig = shortFor(input, file.name)?.instagram;
    lines.push(`## ${l.ig.reel}: ${file.name}`, '', `**${l.file}:** \`${file.video}\``, '');
    const caption = ig ? [ig.caption.trim(), ig.hashtags.join(' ')].filter(Boolean).join('\n\n') : l.todo(`shorts.${file.name}.instagram in review/upload.yaml`);
    const tags = ig ? ig.hashtags.length + (ig.caption.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0) : 0;
    lines.push(`### ${l.ig.caption} (${l.chars(count(caption), input.limits.instagram.caption)}, ${tags}/${input.limits.instagram.hashtags} ${l.hashtags})`, '', ...block(caption), '');
    lines.push(`### ${l.ig.story}`, '', ...block(ig?.story ?? l.todo(`shorts.${file.name}.instagram.story`)), '');
    lines.push(`### ${l.checklist}`, '', checkbox(l.ig.cover(ig?.cover_frame)));
    if (input.channel?.disclosure.instagram_ai_label ?? true) lines.push(checkbox(l.ig.aiLabel));
    lines.push(checkbox(youtube ? `${l.ig.sticker} — ${youtube}` : l.ig.sticker), '');
  }
  const post = input.data?.instagram_post;
  if (post) {
    lines.push(`## ${l.ig.post}`, '', `_${l.ig.postImage}_`, '', ...block([post.caption.trim(), post.hashtags.join(' ')].filter(Boolean).join('\n\n')), '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

function tiktokText(input: ReleaseTextInput, l: Labels): string {
  // Laid out like the TikTok Studio upload form: description, cover, settings.
  const lines = [`# ${l.tt.heading}`, ''];
  const youtube = channelLink(input.channel, 'youtube', l);
  for (const file of input.files.shorts) {
    const tt = shortFor(input, file.name)?.tiktok;
    lines.push(`## ${file.name}`, '', `**${l.file}:** \`${file.video}\``, '');
    const description = tt
      ? tiktokDescription(tt, l.tt.overlayDefault(youtube ?? 'YouTube'))
      : l.todo(`shorts.${file.name}.tiktok in review/upload.yaml`);
    lines.push(`### ${l.tt.description} (${l.chars(count(description), input.limits.tiktok.caption)})`, '', ...block(description), '');
    lines.push(`### ${l.tt.cover}`, '', file.thumbnail ? l.tt.coverUpload(file.thumbnail) : l.tt.coverFrame, '');
    lines.push(`### ${l.tt.settings}`, '', checkbox(l.tt.visibility));
    if (input.channel?.disclosure.tiktok_ai_label ?? true) lines.push(checkbox(l.tt.aiLabel));
    lines.push(checkbox(l.tt.schedule), '');
    if (tt?.pinned_comment) lines.push(`### ${l.tt.afterPost}`, '', checkbox(l.tt.pinned), '', ...block(tt.pinned_comment), '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

/** The TikTok description: caption, the pointer to the full video (TikTok Studio has no text overlay), hashtags. */
export function tiktokDescription(tt: { caption: string; hashtags: string[]; overlay?: string }, pointer: string): string {
  return [tt.caption.trim(), (tt.overlay ?? pointer).trim(), tt.hashtags.join(' ')].filter(Boolean).join('\n\n');
}

function spotifyText(input: ReleaseTextInput, l: Labels): string {
  const release = input.release;
  const distributor = release?.distributor === 'distrokid' ? 'DistroKid' : 'Distributor';
  const value = (given: string | undefined, field: string) => given ?? l.todo(`release.${field} in project.yaml`);
  const yesNo = (given: boolean | undefined) => (given === undefined ? l.todo('release.explicit in project.yaml') : given ? l.sp.yes : l.sp.no);
  const ai = release?.ai_credits;
  const aiLine = (['lyrics', 'music', 'vocals', 'instrumental'] as const)
    .map((part) => `${l.sp.aiParts[part]}: ${ai?.[part] ? l.sp.aiShare[ai[part]] : l.todo(`release.ai_credits.${part}`)}`)
    .join(' · ');
  const f = l.sp.fields;
  const rows: [string, string][] = [
    [f.artist, input.artist ?? l.todo('release.artist in project.yaml')],
    [f.featured, release?.featured_artists.length ? release.featured_artists.join(', ') : '—'],
    [f.title, input.title],
    [f.genres, `${value(release?.primary_genre, 'primary_genre')} / ${release?.secondary_genre ?? '—'}`],
    [f.language, value(release?.language, 'language')],
    [f.explicit, yesNo(release?.explicit)],
    [f.songwriters, release?.songwriters.length ? release.songwriters.join(', ') : l.todo('release.songwriters (legal names) in project.yaml')],
    [f.producer, release?.producer ?? '—'],
    [f.label, release?.label ?? '—'],
    [f.isrc, release?.isrc ?? `— (${l.sp.afterUpload})`],
    [f.ai, `${aiLine}${release?.ai_tool ? ` (${release.ai_tool})` : ''}${release?.license_note ? ` — ${release.license_note}` : ''}`],
    [f.date, value(release?.release_date, 'release_date')],
    [f.cover, input.files.cover ? `\`${input.files.cover}\`` : l.todo('streaming/cover-3000x3000.jpg')],
    [f.audio, input.files.audio ? `\`${input.files.audio}\`` : l.todo('audio WAV')],
    [f.lyrics, input.files.lyricsTxt ? `\`${input.files.lyricsTxt}\`` : '—'],
  ];
  const pitch = input.data?.spotify?.pitch;
  const lines = [
    `# ${l.sp.heading}`,
    '',
    `## ${l.sp.form(distributor)}`,
    '',
    ...rows.map(([label, given], index) => `${index + 1}. **${label}:** ${given}`),
    '',
    `_${l.sp.leadTime}_`,
    '',
    `## ${l.sp.s4a}`,
    '',
    `### ${l.sp.canvas}`,
    '',
    input.files.canvas ? `\`${input.files.canvas}\`` : l.todo('streaming/canvas-9x16.mp4'),
    '',
    `### ${l.sp.artistPick}`,
    '',
    ...block(input.data?.spotify?.artist_pick ?? l.todo('spotify.artist_pick in review/upload.yaml')),
    '',
    `### ${l.sp.pitch} (${l.chars(count(pitch ?? ''), input.limits.spotify.pitch)})`,
    '',
    ...block(pitch ?? l.todo('spotify.pitch in review/upload.yaml')),
    '',
    `_${l.sp.pitchNote}_`,
    '',
    `## ${l.checklist}`,
    '',
    checkbox(l.sp.links),
  ];
  return `${lines.join('\n')}\n`;
}

function planText(input: ReleaseTextInput, l: Labels): string {
  const date = input.release?.release_date;
  const steps = RELEASE_PLAN.filter((step) => input.kind === 'music-video' || !['distributor', 'pitch', 'canvas', 'links'].includes(step.key));
  const lines = [`# ${l.plan.heading}`, ''];
  if (!date) lines.push(`_${l.plan.noDate}_`, '');
  else lines.push(`_${l.sp.leadTime}_`, '');
  lines.push(`| ${l.plan.day} | ${l.plan.date} | ${l.plan.step} |`, '|---|---|---|');
  for (const step of steps) {
    lines.push(`| ${step.day > 0 ? `+${step.day}` : step.day} | ${date ? planDate(date, step.day) : '—'} | ${l.plan.steps[step.key]} |`);
  }
  return `${lines.join('\n')}\n`;
}

/** The README of the release folder: what lies where, the order, and the open TODOs. */
export function readmeText(input: ReleaseTextInput, todos: string[]): string {
  const l = releaseLabels(input.language);
  const folders = (['video', 'thumbnails', 'shorts', ...(input.kind === 'music-video' ? (['audio', 'streaming'] as const) : []), 'texts'] as const).map(
    (folder) => `- \`${folder}/\` — ${l.readme.folders[folder]}`,
  );
  const lines = [
    `# ${l.readme.heading} — ${input.artist ? `${input.artist} – ` : ''}${input.title}`,
    '',
    ...folders,
    '',
    `## ${l.readme.order}`,
    '',
    ...(input.kind === 'music-video' ? l.readme.steps : l.readme.steps.slice(1)).map((step, index) => `${index + 1}. ${step}`),
    '',
    `## ${l.readme.todos}`,
    '',
    ...(todos.length ? todos.map((todo) => checkbox(`${TODO}: ${todo}`)) : [l.readme.none]),
    '',
    `_${l.readme.manifest}_`,
  ];
  return `${lines.join('\n')}\n`;
}

/** Every text file of `texts/`, keyed by file name. Episodes have no streaming release. */
export function releaseTexts(input: ReleaseTextInput): Record<string, string> {
  const l = releaseLabels(input.language);
  return {
    'youtube.md': youtubeText(input, l),
    'shorts.md': shortsText(input, l),
    'instagram.md': instagramText(input, l),
    'tiktok.md': tiktokText(input, l),
    ...(input.kind === 'music-video' ? { 'spotify.md': spotifyText(input, l) } : {}),
    'release-plan.md': planText(input, l),
  };
}
