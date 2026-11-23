import {
  TODO,
  chapterTime,
  type CalendarEvent,
  type ChannelConfig,
  type Chapter,
  type ReleaseCalendar,
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
  kind: 'music-video' | 'episode' | 'meme';
  language: string;
  slug: string;
  artist?: string;
  title: string;
  data?: UploadData;
  release?: ReleaseMetadata;
  /** The release calendar; the plan lists its events. */
  calendar?: ReleaseCalendar;
  /** The main video goes out as a YouTube Premiere (config/release-schedule.yaml). */
  premiere?: boolean;
  channel?: ChannelConfig;
  limits: PlatformLimits;
  chapters: Chapter[];
  /** Credit texts the platform texts must carry, from the library sounds the project took (HS-261, HS-265). */
  credits?: string[];
  /** Paths inside the release folder. */
  files: {
    master?: string;
    /** Every format's video, by format id (`16x9`, `9x16`, `1x1`, ...). */
    videos?: Record<string, string>;
    subtitles?: string;
    thumbnails: string[];
    shorts: { name: string; video: string; thumbnail?: string; tiktokCover?: string }[];
    audio?: string;
    cover?: string;
    canvas?: string;
    lyricsTxt?: string;
    lyricsLrc?: string;
    /** The announcement a week before: the 9:16 story and the 16:9 post image with the release date, and the teaser. */
    announceStory?: string;
    announcePost?: string;
    teaser?: string;
    /** The release-day story image. */
    story?: string;
    /** The 4:5 feed image, when there is no feed-format render. */
    feedImage?: string;
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
  hashtagsComma: string;
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
    postVideo: (file: string) => string;
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
    video: (file: string) => string;
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
    time: string;
    step: string;
    proposed: (date: string) => string;
    fixed: (date: string) => string;
    ics: string;
  };
  cal: {
    steps: Record<'distributor' | 'pitch' | 'canvas' | 'song' | 'artist-pick' | 'youtube' | 'premiere' | 'community' | 'story' | 'page' | 'links', string>;
    announce: Record<'instagram' | 'youtube' | 'x', string>;
    post: Record<'instagram' | 'x' | 'linkedin', string>;
    short: (name: string, platform: string) => string;
    platforms: Record<'distributor' | 'spotify' | 'youtube' | 'shorts' | 'tiktok' | 'instagram' | 'x' | 'linkedin' | 'microsite', string>;
  };
  announce: { heading: string; image: string; files: (story?: string, post?: string, teaser?: string) => string };
  meme: { youtube: string; tiktok: string; instagram: string; cover: (file: string) => string; visibility: string };
  credits: string;
  videoLink: string;
  x: { heading: string; post: string; reply: string; media: (file: string) => string; replyNote: string; short: string };
  li: { heading: string; skipped: (reason: string) => string; reason: string; post: string; hook: (n: number, limit: number) => string; media: (file: string) => string; noLinkNote: string };
  readme: { heading: string; folders: Record<'video' | 'cover' | 'thumbnails' | 'shorts' | 'audio' | 'streaming' | 'texts', string>; order: string; steps: string[]; memeSteps: string[]; todos: string; none: string; manifest: string };
}

const EN: Labels = {
  todo: (what) => `${TODO}: ${what}`,
  file: 'File',
  thumbnail: 'Thumbnail',
  thumbnails: 'Thumbnails',
  title: 'Title',
  description: 'Description',
  hashtags: 'Hashtags',
  hashtagsComma: 'Hashtags, comma-separated',
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
    postVideo: (file) => `Video: \`${file}\` (the main video in the feed format)`,
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
    video: (file) => `Music video (beta, if your account has it): upload \`${file}\` under Music → the song → Video, then make it the Artist Pick`,
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
    time: 'Time',
    step: 'Step',
    proposed: (date) => `Proposed release day ${date}: set release.release_date in project.yaml to fix it (the distributor needs it).`,
    fixed: (date) => `Release day ${date}. A fixed release date and an editorial pitch need at least three weeks.`,
    ics: 'Import calendar.ics into your calendar app; release-board shows the calendar of every project.',
  },
  cal: {
    steps: {
      distributor: 'Upload audio, cover, and metadata to the distributor (spotify.md)',
      pitch: 'Pitch the song in Spotify for Artists (spotify.md)',
      canvas: 'Upload the Canvas in Spotify for Artists',
      song: 'The song goes live on the streaming services',
      'artist-pick': 'Set the Artist Pick (the music video or the song)',
      youtube: 'Publish the main video on YouTube (youtube.md)',
      premiere: 'Main video as a YouTube Premiere (youtube.md)',
      community: 'YouTube post about the video',
      story: 'Instagram story with a link sticker to the video',
      page: 'Publish the song page on the microsite',
      links: 'Add the Spotify link to the YouTube description and the pinned comment',
    },
    announce: { instagram: 'Announcement: Instagram story', youtube: 'Announcement: YouTube post', x: 'Announcement on X' },
    post: { instagram: 'Instagram feed post', x: 'Post on X with the video; YouTube link in the reply', linkedin: 'LinkedIn post' },
    short: (name, platform) => `${name} on ${platform}`,
    platforms: { distributor: 'Distributor', spotify: 'Spotify', youtube: 'YouTube', shorts: 'YouTube Shorts', tiktok: 'TikTok', instagram: 'Instagram', x: 'X', linkedin: 'LinkedIn', microsite: 'Microsite' },
  },
  announce: {
    heading: 'Announcement',
    image: 'Image: the streaming cover',
    files: (story, post, teaser) =>
      [story && `Story: \`${story}\``, post && `post image: \`${post}\``, teaser && `teaser for X: \`${teaser}\``].filter(Boolean).join(' · '),
  },
  videoLink: 'link to the main video',
  meme: {
    youtube: 'YouTube Shorts',
    tiktok: 'TikTok',
    instagram: 'Instagram Reels',
    cover: (file) => `Cover: \`${file}\` (the video's cover on the platform)`,
    visibility: 'Public: upload the video as a Short',
  },
  credits: 'Credits',
  x: {
    heading: 'X',
    post: 'Post',
    reply: 'Reply with the link',
    media: (file) => `Video: \`${file}\` (native upload)`,
    replyNote: 'Post the reply right after the post: links in the post itself reach fewer people.',
    short: 'Short',
  },
  li: {
    heading: 'LinkedIn',
    skipped: (reason) => `No LinkedIn post for this song: ${reason}`,
    reason: 'Why',
    post: 'Post',
    hook: (n, limit) => `first paragraph ${n}/${limit} characters before "see more"`,
    media: (file) => `Video: \`${file}\` (native upload)`,
    noLinkNote: 'Upload the video natively; put the YouTube link at the end of the post.',
  },
  readme: {
    heading: 'Release package',
    folders: {
      video: 'the video in every format, and the subtitles',
      cover: 'the 1080x1920 cover the platforms show',
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
    memeSteps: [
      'Post the video on YouTube Shorts, TikTok, and Instagram Reels on the release day (texts/youtube.md, texts/tiktok.md, texts/instagram.md).',
      'Set the 1080x1920 cover as the cover on every platform.',
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
  hashtagsComma: 'Hashtags, kommagetrennt',
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
    postVideo: (file) => `Video: \`${file}\` (das Hauptvideo im Feed-Format)`,
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
    video: (file) => `Musikvideo (Beta, falls dein Konto es hat): \`${file}\` unter Musik → Song → Video hochladen und als Artist Pick setzen`,
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
    time: 'Uhrzeit',
    step: 'Schritt',
    proposed: (date) => `Vorgeschlagener Release-Tag ${date}: release.release_date in project.yaml setzen, um ihn festzulegen (der Distributor braucht ihn).`,
    fixed: (date) => `Release-Tag ${date}. Ein fester Release-Termin und ein Pitch brauchen mindestens drei Wochen Vorlauf.`,
    ics: 'calendar.ics in die Kalender-App importieren; release-board zeigt den Kalender aller Projekte.',
  },
  cal: {
    steps: {
      distributor: 'Audio, Cover und Metadaten beim Distributor hochladen (spotify.md)',
      pitch: 'Song in Spotify for Artists pitchen (spotify.md)',
      canvas: 'Canvas in Spotify for Artists hochladen',
      song: 'Der Song geht auf den Streamingdiensten online',
      'artist-pick': 'Artist Pick setzen (Musikvideo oder Song)',
      youtube: 'Hauptvideo auf YouTube veröffentlichen (youtube.md)',
      premiere: 'Hauptvideo als YouTube-Premiere (youtube.md)',
      community: 'YouTube-Post zum Video',
      story: 'Instagram-Story mit Link-Sticker zum Video',
      page: 'Song-Seite auf der Microsite veröffentlichen',
      links: 'Spotify-Link in YouTube-Beschreibung und angepinnten Kommentar eintragen',
    },
    announce: { instagram: 'Ankündigung: Instagram-Story', youtube: 'Ankündigung: YouTube-Post', x: 'Ankündigung auf X' },
    post: { instagram: 'Instagram-Feed-Post', x: 'Post auf X mit Video; YouTube-Link als Antwort', linkedin: 'LinkedIn-Beitrag' },
    short: (name, platform) => `${name} auf ${platform}`,
    platforms: { distributor: 'Distributor', spotify: 'Spotify', youtube: 'YouTube', shorts: 'YouTube Shorts', tiktok: 'TikTok', instagram: 'Instagram', x: 'X', linkedin: 'LinkedIn', microsite: 'Microsite' },
  },
  announce: {
    heading: 'Ankündigung',
    image: 'Bild: das Streaming-Cover',
    files: (story, post, teaser) =>
      [story && `Story: \`${story}\``, post && `Post-Bild: \`${post}\``, teaser && `Teaser für X: \`${teaser}\``].filter(Boolean).join(' · '),
  },
  videoLink: 'Link zum Hauptvideo',
  meme: {
    youtube: 'YouTube Shorts',
    tiktok: 'TikTok',
    instagram: 'Instagram Reels',
    cover: (file) => `Cover: \`${file}\` (das Cover des Videos auf der Plattform)`,
    visibility: 'Öffentlich: das Video als Short hochladen',
  },
  credits: 'Credits',
  x: {
    heading: 'X',
    post: 'Post',
    reply: 'Antwort mit Link',
    media: (file) => `Video: \`${file}\` (direkt hochladen)`,
    replyNote: 'Die Antwort direkt nach dem Post setzen: Links im Post selbst erreichen weniger Leute.',
    short: 'Short',
  },
  li: {
    heading: 'LinkedIn',
    skipped: (reason) => `Kein LinkedIn-Beitrag zu diesem Song: ${reason}`,
    reason: 'Begründung',
    post: 'Beitrag',
    hook: (n, limit) => `erster Absatz ${n}/${limit} Zeichen vor „mehr anzeigen“`,
    media: (file) => `Video: \`${file}\` (direkt hochladen)`,
    noLinkNote: 'Video direkt hochladen; den YouTube-Link ans Ende des Beitrags.',
  },
  readme: {
    heading: 'Release-Paket',
    folders: {
      video: 'das Video in jedem Format und die Untertitel',
      cover: 'das Cover 1080x1920, das die Plattformen zeigen',
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
    memeSteps: [
      'Das Video am Release-Tag auf YouTube Shorts, TikTok und Instagram Reels posten (texts/youtube.md, texts/tiktok.md, texts/instagram.md).',
      'Auf jeder Plattform das Cover 1080x1920 setzen.',
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

/** Footer lines from config/channel.yaml: song credit (music videos only; an episode has no song), tool credit, links. */
export function footerLines(
  input: Pick<ReleaseTextInput, 'channel' | 'artist' | 'title' | 'release'> & { kind?: ReleaseTextInput['kind'] },
  l: Labels,
): string[] {
  const channel = input.channel;
  if (!channel) return [];
  const lines: string[] = [];
  if (channel.footer.song_credit && input.kind !== 'episode') {
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
  if (main?.hashtags.length) lines.push('', `## ${l.hashtagsComma}`, '', ...block(main.hashtags.join(', ')));
  lines.push('', `## ${l.tags} (${l.chars(tags.length, input.limits.youtube.tags)})`, '', ...block(tags || l.todo('main.tags')));
  lines.push('', `## ${l.pinned}`, '', ...block(main?.pinned_comment ?? l.todo('main.pinned_comment in review/upload.yaml')));
  lines.push('', `## ${l.community}`, '', ...block(main?.community_post ?? l.todo('main.community_post in review/upload.yaml')));
  const announcement = announcementText(input);
  if (announcement) lines.push('', `## ${l.announce.heading}`, '', announceImageLine(input, l), '', ...block(announcement));
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
    if (short?.hashtags.length) lines.push(`### ${l.hashtagsComma}`, '', ...block(short.hashtags.join(', ')), '');
    lines.push(`### ${l.checklist}`, '', checkbox(l.shorts.relatedStep), checkbox(l.yt.synthetic(synthetic)), checkbox(l.yt.kids(short?.made_for_kids ?? false)), '');
  }
  if (input.files.shorts.length === 0) lines.push(l.todo('no Shorts in renders/shorts/'), '');
  return `${lines.join('\n').trimEnd()}\n`;
}

function instagramText(input: ReleaseTextInput, l: Labels): string {
  const lines = [`# ${l.ig.heading}`, ''];
  const youtube = channelLink(input.channel, 'youtube', l);
  const announcement = announcementText(input);
  if (announcement) lines.push(`## ${l.announce.heading} (${l.ig.story})`, '', announceImageLine(input, l), '', ...block(announcement), '');
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
    const video = feedVideo(input);
    lines.push(`## ${l.ig.post}`, '', `_${video ? l.ig.postVideo(video) : l.ig.postImage}_`, '', ...block([post.caption.trim(), post.hashtags.join(' ')].filter(Boolean).join('\n\n')), '');
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
    const cover = file.tiktokCover ?? file.thumbnail;
    lines.push(`### ${l.tt.cover}`, '', cover ? l.tt.coverUpload(cover) : l.tt.coverFrame, '');
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

/** The distributor form, field by field in its order: label and the value to paste. */
export function distributorRows(input: ReleaseTextInput, l: Labels): [string, string][] {
  const release = input.release;
  const value = (given: string | undefined, field: string) => given ?? l.todo(`release.${field} in project.yaml`);
  const yesNo = (given: boolean | undefined) => (given === undefined ? l.todo('release.explicit in project.yaml') : given ? l.sp.yes : l.sp.no);
  const ai = release?.ai_credits;
  const aiLine = (['lyrics', 'music', 'vocals', 'instrumental'] as const)
    .map((part) => `${l.sp.aiParts[part]}: ${ai?.[part] ? l.sp.aiShare[ai[part]] : l.todo(`release.ai_credits.${part}`)}`)
    .join(' · ');
  const f = l.sp.fields;
  return [
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
    [f.date, value(release?.release_date ?? (input.calendar ? `${input.calendar.release_date}${input.calendar.proposed ? ` (${l.todo('proposed, set release.release_date')})` : ''}` : undefined), 'release_date')],
    [f.cover, input.files.cover ? `\`${input.files.cover}\`` : l.todo('streaming/cover-3000x3000.jpg')],
    [f.audio, input.files.audio ? `\`${input.files.audio}\`` : l.todo('audio WAV')],
    [f.lyrics, input.files.lyricsTxt ? `\`${input.files.lyricsTxt}\`` : '—'],
  ];
}

function spotifyText(input: ReleaseTextInput, l: Labels): string {
  const release = input.release;
  const distributor = release?.distributor === 'distrokid' ? 'DistroKid' : 'Distributor';
  const rows = distributorRows(input, l);
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
    ...(input.files.master ? [checkbox(l.sp.video(input.files.master)), ''] : []),
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

/** One line naming a calendar event, in the labels' language. */
export function calendarEventLabel(event: Pick<CalendarEvent, 'step' | 'platform' | 'item'>, l: Labels, premiere = true): string {
  if (event.step === 'short') return l.cal.short(event.item, l.cal.platforms[event.platform]);
  if (event.step === 'announce') return l.cal.announce[event.platform as 'instagram' | 'youtube' | 'x'] ?? `${l.announce.heading}: ${l.cal.platforms[event.platform]}`;
  if (event.step === 'post') return l.cal.post[event.platform as 'instagram' | 'x' | 'linkedin'] ?? l.cal.platforms[event.platform];
  if (event.step === 'youtube' && premiere) return l.cal.steps.premiere;
  return l.cal.steps[event.step as keyof Labels['cal']['steps']] ?? event.step;
}

/** Weekday, date, and time of an event's local `at`, e.g. `Fr 11.12.2026 18:00`. */
export function calendarWhen(at: string, language: string): { weekday: string; date: string; time: string } {
  const day = at.slice(0, 10);
  const weekday = new Intl.DateTimeFormat(language, { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
  const [y, m, d] = day.split('-');
  return { weekday, date: language.toLowerCase().startsWith('de') ? `${d}.${m}.${y}` : day, time: at.slice(11, 16) };
}

function planText(input: ReleaseTextInput, l: Labels): string {
  const calendar = input.calendar;
  const lines = [`# ${l.plan.heading}`, ''];
  if (!calendar) return `${[...lines, l.todo('no release calendar')].join('\n')}\n`;
  lines.push(`_${calendar.proposed ? l.plan.proposed(calendar.release_date) : l.plan.fixed(calendar.release_date)}_`, '');
  lines.push(`| ${l.plan.day} | ${l.plan.date} | ${l.plan.time} | ${l.plan.step} |`, '|---|---|---|---|');
  for (const event of calendar.events) {
    const when = calendarWhen(event.at, input.language);
    const offset = Math.round((Date.parse(`${event.at.slice(0, 10)}T12:00:00Z`) - Date.parse(`${calendar.release_date}T12:00:00Z`)) / 86_400_000);
    lines.push(`| ${offset > 0 ? `+${offset}` : offset} | ${when.weekday} ${when.date} | ${when.time} | ${calendarEventLabel(event, l, input.premiere ?? true)} |`);
  }
  lines.push('', `_${l.plan.ics}_`);
  return `${lines.join('\n')}\n`;
}

/** The release announcement, the same text on every platform it goes to. */
/** Which files the announcement uses: the composed images and teaser, or the cover before they exist. */
function announceImageLine(input: ReleaseTextInput, l: Labels): string {
  const { announceStory, announcePost, teaser } = input.files;
  return announceStory || announcePost || teaser ? l.announce.files(announceStory, announcePost, teaser) : `_${l.announce.image}_`;
}

export function announcementText(input: ReleaseTextInput): string | undefined {
  const a = input.data?.announcement;
  return a ? [a.text.trim(), a.hashtags.join(' ')].filter(Boolean).join('\n\n') : undefined;
}

/** The X post with its hashtags, and the reply that carries the YouTube link. */
export function xTexts(post: { post: string; hashtags: string[]; reply?: string }, youtubeUrl: string): { post: string; reply: string } {
  return {
    post: [post.post.trim(), post.hashtags.join(' ')].filter(Boolean).join('\n\n'),
    reply: [post.reply?.trim() ?? '', youtubeUrl].filter(Boolean).join(' '),
  };
}

/** The main video's URL once it is live; before that a bracketed slot the user fills in (the release board does it). */
export function youtubeTarget(l: Labels, live?: string): string {
  return live ?? `[${l.videoLink}]`;
}

function xText(input: ReleaseTextInput, l: Labels): string {
  const lines = [`# ${l.x.heading}`, ''];
  const youtube = youtubeTarget(l);
  const announcement = announcementText(input);
  if (announcement) lines.push(`## ${l.announce.heading}`, '', announceImageLine(input, l), '', ...block(announcement), '');
  const x = input.data?.x;
  if (x) {
    const texts = xTexts(x, youtube);
    const media = input.files.shorts.find((short) => short.name === (x.media ?? input.files.shorts[0]?.name));
    lines.push(`## ${l.x.post} (${l.chars(count(texts.post), input.limits.x.post)})`, '');
    if (media) lines.push(l.x.media(media.video), '');
    lines.push(...block(texts.post), '', `### ${l.x.reply}`, '', ...block(texts.reply), '', `_${l.x.replyNote}_`, '');
  } else lines.push(l.todo('x in review/upload.yaml'), '');
  for (const file of input.files.shorts) {
    const post = shortFor(input, file.name)?.x;
    if (!post) continue;
    const texts = xTexts({ ...post, reply: undefined }, youtube);
    lines.push(`## ${l.x.short}: ${file.name}`, '', l.x.media(file.video), '', ...block(texts.post), '', `### ${l.x.reply}`, '', ...block(texts.reply), '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

/** The LinkedIn post with its hashtags and the link at the end. */
export function linkedinPostText(post: { post?: string; hashtags: string[] }, youtubeUrl: string): string {
  return [post.post?.trim() ?? '', youtubeUrl, post.hashtags.join(' ')].filter(Boolean).join('\n\n');
}

/** The feed version of the main video: the 4:5 render, else the 1:1 render; undefined without either. */
export function feedVideo(input: Pick<ReleaseTextInput, 'files'>): string | undefined {
  return input.files.videos?.['4x5'] ?? input.files.videos?.['1x1'];
}

/** The release file a post's `media` names: for `main` the feed version (4:5 or 1:1), else the master; or a Short. */
export function mediaFile(input: Pick<ReleaseTextInput, 'files'>, media: string | undefined): string | undefined {
  if (!media || media === 'main') return feedVideo(input) ?? input.files.master;
  return input.files.shorts.find((short) => short.name === media)?.video;
}

function linkedinText(input: ReleaseTextInput, l: Labels): string {
  const lines = [`# ${l.li.heading}`, ''];
  const li = input.data?.linkedin;
  if (!li) return `${[...lines, l.todo('linkedin in review/upload.yaml (decision post or skip)')].join('\n')}\n`;
  if (li.decision === 'skip') return `${[...lines, l.li.skipped(li.reason)].join('\n')}\n`;
  const text = linkedinPostText(li, youtubeTarget(l));
  const hook = (li.post ?? '').split(/\n\s*\n/)[0] ?? '';
  const file = mediaFile(input, li.media);
  lines.push(`**${l.li.reason}:** ${li.reason}`, '');
  if (file) lines.push(l.li.media(file), '');
  lines.push(`## ${l.li.post} (${l.chars(count(text), input.limits.linkedin.post)}; ${l.li.hook(count(hook), input.limits.linkedin.hook)})`, '', ...block(text), '', `_${l.li.noLinkNote}_`);
  return `${lines.join('\n')}\n`;
}

/** The meme's one caption: its description, the credits of the library sounds it took, and the hashtags. */
export function memeCaption(input: Pick<ReleaseTextInput, 'data' | 'credits'>): string {
  const main = input.data?.main;
  return [main?.description.trim() ?? '', ...(input.credits ?? []), main?.hashtags.join(' ') ?? ''].filter(Boolean).join('\n\n');
}

/** The meme video's file in the folder: its one 9:16 render, or the master when the format list names it. */
function memeFile(input: ReleaseTextInput, l: Labels): string {
  return input.files.master ?? input.files.videos?.['9x16'] ?? l.todo('renders/9x16.mp4');
}

function memeYoutubeText(input: ReleaseTextInput, l: Labels): string {
  const main = input.data?.main;
  const caption = memeCaption(input);
  const synthetic = main?.synthetic_media ?? input.channel?.disclosure.youtube_synthetic ?? true;
  const lines = [`# ${l.meme.youtube}`, '', `**${l.file}:** \`${memeFile(input, l)}\``];
  if (input.files.cover) lines.push(l.meme.cover(input.files.cover));
  lines.push('', `## ${l.title} (${l.chars(count(main?.title ?? ''), input.limits.youtube.title)})`, '', ...block(main?.title ?? l.todo('main.title')));
  lines.push('', `## ${l.description} (${l.bytes(Buffer.byteLength(caption), input.limits.youtube.description_bytes)})`, '', ...block(caption || l.todo('main.description')));
  const tags = main?.tags.join(', ') ?? '';
  lines.push('', `## ${l.tags} (${l.chars(tags.length, input.limits.youtube.tags)})`, '', ...block(tags || l.todo('main.tags')));
  lines.push('', `## ${l.checklist}`, '', checkbox(l.meme.visibility), checkbox(l.yt.synthetic(synthetic)), checkbox(l.yt.kids(main?.made_for_kids ?? false)));
  return `${lines.join('\n')}\n`;
}

function memeTiktokText(input: ReleaseTextInput, l: Labels): string {
  const caption = memeCaption(input);
  const lines = [`# ${l.meme.tiktok}`, '', `**${l.file}:** \`${memeFile(input, l)}\``];
  if (input.files.cover) lines.push(l.tt.coverUpload(input.files.cover));
  lines.push('', `### ${l.description} (${l.chars(count(caption), input.limits.tiktok.caption)})`, '', ...block(caption || l.todo('main.description')));
  lines.push('', `### ${l.tt.settings}`, '', checkbox(l.tt.visibility));
  if (input.channel?.disclosure.tiktok_ai_label ?? true) lines.push(checkbox(l.tt.aiLabel));
  return `${lines.join('\n')}\n`;
}

function memeInstagramText(input: ReleaseTextInput, l: Labels): string {
  const main = input.data?.main;
  const caption = memeCaption(input);
  const tags = (main?.hashtags.length ?? 0) + (caption.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0);
  const lines = [`# ${l.meme.instagram}`, '', `**${l.file}:** \`${memeFile(input, l)}\``];
  if (input.files.cover) lines.push(l.meme.cover(input.files.cover));
  lines.push('', `### ${l.ig.caption} (${l.chars(count(caption), input.limits.instagram.caption)}, ${tags}/${input.limits.instagram.hashtags} ${l.hashtags})`, '', ...block(caption || l.todo('main.description')));
  lines.push('', `### ${l.checklist}`, '', checkbox(l.ig.cover(undefined)));
  if (input.channel?.disclosure.instagram_ai_label ?? true) lines.push(checkbox(l.ig.aiLabel));
  return `${lines.join('\n')}\n`;
}

/** The README of the release folder: what lies where, the order, and the open TODOs. */
export function readmeText(input: ReleaseTextInput, todos: string[]): string {
  const l = releaseLabels(input.language);
  const folders = (
    input.kind === 'meme'
      ? (['video', 'cover', 'texts'] as const)
      : (['video', 'thumbnails', 'shorts', ...(input.kind === 'music-video' ? (['audio', 'streaming'] as const) : []), 'texts'] as const)
  ).map((folder) => `- \`${folder}/\` — ${l.readme.folders[folder]}`);
  const steps = input.kind === 'meme' ? l.readme.memeSteps : input.kind === 'music-video' ? l.readme.steps : l.readme.steps.slice(1);
  const lines = [
    `# ${l.readme.heading} — ${input.artist ? `${input.artist} – ` : ''}${input.title}`,
    '',
    ...folders,
    '',
    `## ${l.readme.order}`,
    '',
    ...steps.map((step, index) => `${index + 1}. ${step}`),
    '',
    `## ${l.readme.todos}`,
    '',
    ...(todos.length ? todos.map((todo) => checkbox(`${TODO}: ${todo}`)) : [l.readme.none]),
    '',
    `_${l.readme.manifest}_`,
  ];
  return `${lines.join('\n')}\n`;
}

/** Every text file of `texts/`, keyed by file name. Episodes have no streaming release; a meme has three posts. */
export function releaseTexts(input: ReleaseTextInput): Record<string, string> {
  const l = releaseLabels(input.language);
  if (input.kind === 'meme') {
    return {
      'youtube.md': memeYoutubeText(input, l),
      'tiktok.md': memeTiktokText(input, l),
      'instagram.md': memeInstagramText(input, l),
      'release-plan.md': planText(input, l),
    };
  }
  return {
    'youtube.md': youtubeText(input, l),
    'shorts.md': shortsText(input, l),
    'instagram.md': instagramText(input, l),
    'tiktok.md': tiktokText(input, l),
    ...(input.kind === 'music-video' ? { 'spotify.md': spotifyText(input, l) } : {}),
    'x.md': xText(input, l),
    ...(input.data?.linkedin?.decision === 'post' ? { 'linkedin.md': linkedinText(input, l) } : {}),
    'release-plan.md': planText(input, l),
  };
}
