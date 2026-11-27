import {
  TODO,
  type CalendarEvent,
  type ChannelConfig,
  type PlanText,
  type ReleasePlan,
  type ReleaseShape,
  type ReleasePlanInput,
} from '@coreslopper/core';

// The copy-and-paste texts of the release folder, laid out from the release
// plan: the plan holds every exact platform text and its limit, this module only
// adds the folder's headings, counters, checklists, and the language's labels.

/** The plan's input: what `buildReleasePlan` turns into the plan. */
export type ReleaseTextInput = ReleasePlanInput & {
  /** The master's format id (`9x16`, `4x5`, ...), for the TODO of a missing master render. */
  masterFormat?: string;
};

const postOf = (plan: ReleasePlan, id: string) => plan.posts.find((post) => post.id === id);
const textOf = (plan: ReleasePlan, id: string, key: string): PlanText | undefined => postOf(plan, id)?.texts[key];
const valueOf = (plan: ReleasePlan, id: string, key: string): string | undefined => textOf(plan, id, key)?.value;
const postsOf = (plan: ReleasePlan, platform: ReleasePlan['posts'][number]['platform']) => plan.posts.filter((post) => post.platform === platform);
const shortNameOf = (id: string) => /^short:(.+):(?:youtube|tiktok|instagram|x)$/.exec(id)?.[1];

/** The text with its live-URL slots shown as the folder's placeholders. */
const display = (value: string, l: Labels): string => value.replaceAll('{youtube}', `[${l.videoLink}]`).replaceAll('{spotify}', l.todo('the Spotify link'));

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
    storyCaption: string;
    sticker: string;
    post: string;
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
    steps: Record<'distributor' | 'pitch' | 'canvas' | 'song' | 'artist-pick' | 'youtube' | 'youtube-short' | 'premiere' | 'community' | 'story' | 'reel' | 'main-reel' | 'page' | 'links', string>;
    announce: Record<'instagram' | 'youtube' | 'x', string>;
    post: Record<'instagram' | 'tiktok' | 'x' | 'linkedin', string>;
    short: (name: string, platform: string) => string;
    platforms: Record<'distributor' | 'spotify' | 'youtube' | 'shorts' | 'tiktok' | 'instagram' | 'x' | 'linkedin' | 'microsite', string>;
  };
  announce: { heading: string; image: string; files: (story?: string, post?: string, teaser?: string) => string };
  meme: { youtube: string; tiktok: string; instagram: string; cover: (file: string) => string; visibility: string };
  videoLink: string;
  x: { heading: string; post: string; reply: string; media: (file: string) => string; replyNote: string; short: string };
  li: { heading: string; skipped: (reason: string) => string; reason: string; post: string; hook: (n: number, limit: number) => string; media: (file: string) => string; noLinkNote: string };
  readme: {
    heading: string;
    folders: Record<'video' | 'cover' | 'thumbnails' | 'shorts' | 'audio' | 'streaming' | 'texts', string>;
    order: string;
    steps: string[];
    memeSteps: string[];
    shortEpisodeSteps: string[];
    todos: string;
    none: string;
    manifest: string;
  };
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
    storyCaption: 'Caption',
    sticker: 'Add a link sticker to the YouTube video (or the Spotify link after release)',
    post: 'Reel: main video',
    postVideo: (file) => `Video: \`${file}\` (the main video, as vertical as there is)`,
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
      'youtube-short': 'Post the video as a YouTube Short (texts/youtube.md)',
      premiere: 'Main video as a YouTube Premiere (youtube.md)',
      community: 'YouTube post about the video',
      story: 'Instagram story with a link sticker to the video',
      reel: 'Post the video as an Instagram Reel (texts/instagram.md)',
      'main-reel': 'Reel: main video',
      page: 'Publish the song page on the microsite',
      links: 'Add the Spotify link to the YouTube description and the pinned comment',
    },
    announce: { instagram: 'Announcement: Instagram story', youtube: 'Announcement: YouTube post', x: 'Announcement on X' },
    post: { instagram: 'Instagram feed post', tiktok: 'Post the video on TikTok (texts/tiktok.md)', x: 'Post on X with the video (texts/x.md)', linkedin: 'LinkedIn post' },
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
    shortEpisodeSteps: [
      'Post the video on YouTube Shorts, TikTok, Instagram Reels, and X on the release day, and publish its microsite page (texts/youtube.md, texts/tiktok.md, texts/instagram.md, texts/x.md).',
      'Set the 1080x1920 cover on YouTube and Instagram, and the 1080x1440 cover on TikTok.',
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
    storyCaption: 'Bildunterschrift',
    sticker: 'Link-Sticker zum YouTube-Video setzen (nach dem Release: Spotify-Link)',
    post: 'Reel: Hauptvideo',
    postVideo: (file) => `Video: \`${file}\` (das Hauptvideo, so hochkant wie vorhanden)`,
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
      'youtube-short': 'Das Video als YouTube Short posten (texts/youtube.md)',
      premiere: 'Hauptvideo als YouTube-Premiere (youtube.md)',
      community: 'YouTube-Post zum Video',
      story: 'Instagram-Story mit Link-Sticker zum Video',
      reel: 'Das Video als Instagram Reel posten (texts/instagram.md)',
      'main-reel': 'Reel: Hauptvideo',
      page: 'Song-Seite auf der Microsite veröffentlichen',
      links: 'Spotify-Link in YouTube-Beschreibung und angepinnten Kommentar eintragen',
    },
    announce: { instagram: 'Ankündigung: Instagram-Story', youtube: 'Ankündigung: YouTube-Post', x: 'Ankündigung auf X' },
    post: { instagram: 'Instagram-Feed-Post', tiktok: 'Das Video auf TikTok posten (texts/tiktok.md)', x: 'Post auf X mit Video (texts/x.md)', linkedin: 'LinkedIn-Beitrag' },
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
    shortEpisodeSteps: [
      'Das Video am Release-Tag auf YouTube Shorts, TikTok, Instagram Reels und X posten und die Microsite-Seite veröffentlichen (texts/youtube.md, texts/tiktok.md, texts/instagram.md, texts/x.md).',
      'Auf YouTube und Instagram das Cover 1080x1920 setzen, auf TikTok das Cover 1080x1440.',
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

/** The channel handle (or URL) of a platform, with a TODO while it holds `<ID>`. */
function channelLinkOf(channel: ChannelConfig | undefined, platform: string, l: Labels): string | undefined {
  const link = channel?.links[platform];
  const value = link?.handle ?? link?.url;
  if (!value) return undefined;
  return /<ID>/.test(value) ? `${value} ${l.todo(`links.${platform} in config/channel.yaml`)}` : value;
}

const counter = (text: PlanText | undefined, l: Labels, fallback = 0): string => {
  const value = text?.value ?? '';
  const max = text?.limit?.max ?? fallback;
  return text?.limit?.unit === 'bytes' ? l.bytes(Buffer.byteLength(value), max) : l.chars(count(value), max);
};

const hashtagNote = (text: PlanText | undefined, l: Labels): string | undefined =>
  text?.hashtags ? `${text.hashtags.count}/${text.hashtags.max} ${l.hashtags}` : undefined;

/** The text a post's field carries, with the folder's TODO when it is absent. */
const show = (plan: ReleasePlan, id: string, key: string, l: Labels, todo: string): string => {
  const value = valueOf(plan, id, key);
  return value === undefined ? l.todo(todo) : display(value, l);
};

/** The YouTube description of the plan: body, chapters, footer, hashtags. */
export function youtubeDescriptionText(plan: ReleasePlan, l: Labels): string {
  return display(valueOf(plan, 'youtube', 'description') ?? l.todo('main.description in review/upload.yaml'), l);
}

function youtubeText(plan: ReleasePlan, input: ReleaseTextInput, l: Labels): string {
  const post = postOf(plan, 'youtube');
  const title = post?.texts.title;
  const description = post?.texts.description;
  const tags = post?.texts.tags;
  const hashtags = post?.texts.hashtags;
  const lines = [`# ${l.yt.heading}`, ''];
  lines.push(`**${l.file}:** \`${input.files.master ?? l.todo('master render')}\``);
  lines.push(`**${l.thumbnail}:** \`${input.files.thumbnails[0] ?? l.todo('thumbnail 1')}\``);
  if (input.files.thumbnails.length > 1) lines.push(`**${l.yt.testCompare}:** ${input.files.thumbnails.map((file) => `\`${file}\``).join(', ')}`);
  lines.push('', `## ${l.title} (${counter(title, l, input.limits.youtube.title)})`, '', ...block(title?.value ?? l.todo('main.title')));
  lines.push('', `## ${l.description} (${counter(description, l, input.limits.youtube.description_bytes)})`, '', ...block(description?.value ?? l.todo('main.description in review/upload.yaml')));
  // A link still holding <ID> is not platform text: it stays a TODO beside the description.
  const unresolved = footerLines(input, l).filter((line) => line.includes(TODO));
  if (unresolved.length) lines.push('', `## ${TODO}`, '', ...block(unresolved.join('\n')));
  if (!input.chapters.length) lines.push('', `_${l.noChapters}_`);
  if (hashtags?.value) lines.push('', `## ${l.hashtagsComma}`, '', ...block(hashtags.value));
  lines.push('', `## ${l.tags} (${counter(tags, l, input.limits.youtube.tags)})`, '', ...block(tags?.value ?? l.todo('main.tags')));
  lines.push('', `## ${l.pinned}`, '', ...block(show(plan, 'youtube', 'pinned', l, 'main.pinned_comment in review/upload.yaml')));
  lines.push('', `## ${l.community}`, '', ...block(show(plan, 'youtube', 'community', l, 'main.community_post in review/upload.yaml')));
  const announcement = valueOf(plan, 'announce:youtube', 'text');
  if (announcement) lines.push('', `## ${l.announce.heading}`, '', announceImageLine(input, l), '', ...block(display(announcement, l)));
  if (post?.english) lines.push('', `## ${l.english}`, '', ...block(`${post.english.title}\n\n${post.english.description}`));
  lines.push('', `## ${l.checklist}`, '');
  lines.push(checkbox(l.yt.visibility), checkbox(l.yt.synthetic(post?.syntheticMedia ?? plan.settings.youtubeSynthetic)), checkbox(l.yt.kids(post?.madeForKids ?? false)));
  lines.push(checkbox(l.yt.category(post?.language ?? input.language)), checkbox(l.yt.endscreen));
  if (input.files.subtitles) lines.push(checkbox(l.yt.subtitles(input.files.subtitles)));
  return `${lines.join('\n')}\n`;
}

function shortsText(plan: ReleasePlan, input: ReleaseTextInput, l: Labels): string {
  const lines = [`# ${l.shorts.heading}`, ''];
  for (const post of postsOf(plan, 'shorts')) {
    const name = shortNameOf(post.id)!;
    const file = input.files.shorts.find((short) => short.name === name);
    lines.push(`## ${name}${post.moment ? ` — ${post.moment}` : ''}`, '');
    lines.push(`**${l.file}:** \`${file?.video ?? l.todo('Short video')}\``, `**${l.thumbnail}:** \`${file?.thumbnail ?? l.todo('Short thumbnail')}\``, '');
    lines.push(`### ${l.title} (${counter(post.texts.title, l, input.limits.youtube.title)})`, '', ...block(post.texts.title?.value ?? l.todo(`shorts.${name}.title`)), '');
    lines.push(`### ${l.description}`, '', ...block(post.texts.description ? display(post.texts.description.value, l) : l.todo(`shorts.${name} in review/upload.yaml`)), '');
    if (post.texts.hashtags?.value) lines.push(`### ${l.hashtagsComma}`, '', ...block(post.texts.hashtags.value), '');
    lines.push(`### ${l.checklist}`, '', checkbox(l.shorts.relatedStep), checkbox(l.yt.synthetic(post.syntheticMedia ?? plan.settings.youtubeSynthetic)), checkbox(l.yt.kids(post.madeForKids ?? false)), '');
  }
  if (postsOf(plan, 'shorts').length === 0) lines.push(l.todo('no Shorts in renders/shorts/'), '');
  return `${lines.join('\n').trimEnd()}\n`;
}

function instagramText(plan: ReleasePlan, input: ReleaseTextInput, l: Labels): string {
  const lines = [`# ${l.ig.heading}`, ''];
  const youtube = channelLinkOf(input.channel, 'youtube', l);
  const announcement = postOf(plan, 'announce:instagram');
  if (announcement) {
    const caption = announcement.texts.caption;
    lines.push(`## ${l.announce.heading} (${l.ig.story})`, '', announceImageLine(input, l), '');
    if (caption) lines.push(`### ${l.ig.storyCaption} (${counter(caption, l, input.limits.instagram.story_caption)})`, '', ...block(display(caption.value, l)), '');
  }
  const storyCaption = postOf(plan, 'story')?.texts.caption;
  if (storyCaption) {
    lines.push(`## ${l.ig.story}`, '', `### ${l.ig.storyCaption} (${counter(storyCaption, l, input.limits.instagram.story_caption)})`, '', ...block(display(storyCaption.value, l)), '');
  }
  for (const post of postsOf(plan, 'instagram')) {
    const name = shortNameOf(post.id);
    if (!name) continue;
    const file = input.files.shorts.find((short) => short.name === name);
    lines.push(`## ${l.ig.reel}: ${name}`, '', `**${l.file}:** \`${file?.video ?? l.todo('Short video')}\``, '');
    const caption = post.texts.caption;
    const note = hashtagNote(caption, l);
    lines.push(`### ${l.ig.caption} (${counter(caption, l, input.limits.instagram.caption)}${note ? `, ${note}` : ''})`, '', ...block(caption ? display(caption.value, l) : l.todo(`shorts.${name}.instagram in review/upload.yaml`)), '');
    lines.push(`### ${l.checklist}`, '', checkbox(l.ig.cover(post.coverFrame)));
    if (plan.settings.instagramAiLabel) lines.push(checkbox(l.ig.aiLabel));
    lines.push(checkbox(youtube ? `${l.ig.sticker} — ${youtube}` : l.ig.sticker), '');
  }
  const reel = postOf(plan, 'instagram-post');
  if (reel?.texts.caption) {
    const video = reel.media ?? l.todo('main video');
    lines.push(`## ${l.ig.post}`, '', `_${l.ig.postVideo(video)}_`, '', ...block(display(reel.texts.caption.value, l)), '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

function tiktokText(plan: ReleasePlan, input: ReleaseTextInput, l: Labels): string {
  const lines = [`# ${l.tt.heading}`, ''];
  for (const post of postsOf(plan, 'tiktok')) {
    const name = shortNameOf(post.id);
    if (!name) continue;
    const file = input.files.shorts.find((short) => short.name === name);
    lines.push(`## ${name}`, '', `**${l.file}:** \`${file?.video ?? l.todo('Short video')}\``, '');
    const caption = post.texts.caption;
    lines.push(`### ${l.tt.description} (${counter(caption, l, input.limits.tiktok.caption)})`, '', ...block(caption ? display(caption.value, l) : l.todo(`shorts.${name}.tiktok in review/upload.yaml`)), '');
    const cover = file?.tiktokCover ?? file?.thumbnail;
    lines.push(`### ${l.tt.cover}`, '', cover ? l.tt.coverUpload(cover) : l.tt.coverFrame, '');
    lines.push(`### ${l.tt.settings}`, '', checkbox(l.tt.visibility));
    if (plan.settings.tiktokAiLabel) lines.push(checkbox(l.tt.aiLabel));
    lines.push(checkbox(l.tt.schedule), '');
    if (post.texts.pinned?.value) lines.push(`### ${l.tt.afterPost}`, '', checkbox(l.tt.pinned), '', ...block(post.texts.pinned.value), '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
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

function spotifyText(plan: ReleasePlan, input: ReleaseTextInput, l: Labels): string {
  const release = input.release;
  const distributor = release?.distributor === 'distrokid' ? 'DistroKid' : 'Distributor';
  const rows = distributorRows(input, l);
  const pitch = postOf(plan, 'pitch')?.texts.pitch;
  const artistPick = postOf(plan, 'artist-pick')?.texts.artistPick;
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
    ...block(artistPick?.value ?? l.todo('spotify.artist_pick in review/upload.yaml')),
    '',
    `### ${l.sp.pitch} (${counter(pitch, l, input.limits.spotify.pitch)})`,
    '',
    ...block(pitch?.value ?? l.todo('spotify.pitch in review/upload.yaml')),
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
export function calendarEventLabel(
  event: Pick<CalendarEvent, 'step' | 'platform' | 'item'>,
  l: Labels,
  premiere = true,
  shape: ReleaseShape = 'music-video',
): string {
  if (event.step === 'short') return l.cal.short(event.item, l.cal.platforms[event.platform]);
  if (event.step === 'announce') return l.cal.announce[event.platform as 'instagram' | 'youtube' | 'x'] ?? `${l.announce.heading}: ${l.cal.platforms[event.platform]}`;
  if (event.step === 'post') return l.cal.post[event.platform as 'instagram' | 'tiktok' | 'x' | 'linkedin'] ?? l.cal.platforms[event.platform];
  // A meme's and a short episode's one video is its Short and its Reel; everywhere else the Reel step is the main video's (ADR 0057).
  const oneVideo = shape === 'meme' || shape === 'short-episode';
  if (event.step === 'youtube' && oneVideo) return l.cal.steps['youtube-short'];
  if (event.step === 'reel' && !oneVideo) return l.cal.steps['main-reel'];
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
    lines.push(`| ${offset > 0 ? `+${offset}` : offset} | ${when.weekday} ${when.date} | ${when.time} | ${calendarEventLabel(event, l, input.premiere ?? true, input.shape ?? input.kind)} |`);
  }
  lines.push('', `_${l.plan.ics}_`);
  return `${lines.join('\n')}\n`;
}

/** Which files the announcement uses: the composed images and teaser, or the cover before they exist. */
function announceImageLine(input: ReleaseTextInput, l: Labels): string {
  const { announceStory, announcePost, teaser } = input.files;
  return announceStory || announcePost || teaser ? l.announce.files(announceStory, announcePost, teaser) : `_${l.announce.image}_`;
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

function xText(plan: ReleasePlan, input: ReleaseTextInput, l: Labels): string {
  const lines = [`# ${l.x.heading}`, ''];
  const announcement = valueOf(plan, 'announce:x', 'post');
  if (announcement) lines.push(`## ${l.announce.heading}`, '', announceImageLine(input, l), '', ...block(display(announcement, l)), '');
  const post = postOf(plan, 'x');
  if (post?.texts.post) {
    const media = post.media;
    lines.push(`## ${l.x.post} (${counter(post.texts.post, l, input.limits.x.post)})`, '');
    if (media) lines.push(l.x.media(media), '');
    lines.push(...block(display(post.texts.post.value, l)), '');
    if (post.texts.reply) lines.push(`### ${l.x.reply}`, '', ...block(display(post.texts.reply.value, l)), '', `_${l.x.replyNote}_`, '');
  } else lines.push(l.todo('x in review/upload.yaml'), '');
  for (const short of postsOf(plan, 'x')) {
    const name = shortNameOf(short.id);
    if (!name) continue;
    const file = input.files.shorts.find((entry) => entry.name === name);
    lines.push(`## ${l.x.short}: ${name}`, '', file ? l.x.media(file.video) : '', '', ...block(display(short.texts.post?.value ?? '', l)), '', `### ${l.x.reply}`, '', ...block(display(short.texts.reply?.value ?? '', l)), '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

function linkedinText(plan: ReleasePlan, input: ReleaseTextInput, l: Labels): string {
  const lines = [`# ${l.li.heading}`, ''];
  const decision = plan.settings.linkedin;
  if (!decision) return `${[...lines, l.todo('linkedin in review/upload.yaml (decision post or skip)')].join('\n')}\n`;
  if (decision.decision === 'skip') return `${[...lines, l.li.skipped(decision.reason)].join('\n')}\n`;
  const post = postOf(plan, 'linkedin');
  const text = post?.texts.post;
  const file = post?.media ?? mediaFile(input, 'main');
  lines.push(`**${l.li.reason}:** ${post?.texts.reason?.value ?? decision.reason}`, '');
  if (file) lines.push(l.li.media(file), '');
  lines.push(
    `## ${l.li.post} (${counter(text, l, input.limits.linkedin.post)}; ${l.li.hook(post?.hook?.count ?? 0, post?.hook?.max ?? input.limits.linkedin.hook)})`,
    '',
    ...block(text ? display(text.value, l) : l.todo('linkedin.post in review/upload.yaml')),
    '',
    `_${l.li.noLinkNote}_`,
  );
  return `${lines.join('\n')}\n`;
}

/** The one video's file in the folder (a meme or a short episode): its master, else its 9:16 render. */
function memeFile(input: ReleaseTextInput, l: Labels): string {
  return input.files.master ?? input.files.videos?.['9x16'] ?? l.todo(`renders/${input.masterFormat ?? '9x16'}.mp4`);
}

/** The YouTube Short of a meme or a short episode; a short episode's also carries its hashtags and announcement. */
function memeYoutubeText(plan: ReleasePlan, input: ReleaseTextInput, l: Labels): string {
  const post = postOf(plan, 'youtube');
  const title = post?.texts.title;
  const description = post?.texts.description;
  const tags = post?.texts.tags;
  const hashtags = post?.texts.hashtags;
  const lines = [`# ${l.meme.youtube}`, '', `**${l.file}:** \`${memeFile(input, l)}\``];
  if (input.files.cover) lines.push(l.meme.cover(input.files.cover));
  lines.push('', `## ${l.title} (${counter(title, l, input.limits.youtube.title)})`, '', ...block(title?.value ?? l.todo('main.title')));
  lines.push('', `## ${l.description} (${counter(description, l, input.limits.youtube.description_bytes)})`, '', ...block(description?.value ?? l.todo('main.description')));
  if (hashtags?.value) lines.push('', `## ${l.hashtagsComma}`, '', ...block(hashtags.value));
  lines.push('', `## ${l.tags} (${counter(tags, l, input.limits.youtube.tags)})`, '', ...block(tags?.value ?? l.todo('main.tags')));
  const announcement = valueOf(plan, 'announce:youtube', 'text');
  if (announcement) lines.push('', `## ${l.announce.heading}`, '', announceImageLine(input, l), '', ...block(display(announcement, l)));
  lines.push('', `## ${l.checklist}`, '', checkbox(l.meme.visibility), checkbox(l.yt.synthetic(post?.syntheticMedia ?? plan.settings.youtubeSynthetic)), checkbox(l.yt.kids(post?.madeForKids ?? false)));
  return `${lines.join('\n')}\n`;
}

/** The TikTok post of a meme or a short episode; a short episode has its own text and TikTok cover. */
function memeTiktokText(plan: ReleasePlan, input: ReleaseTextInput, l: Labels, missing = 'main.description'): string {
  const caption = postOf(plan, 'tiktok')?.texts.caption;
  const lines = [`# ${l.meme.tiktok}`, '', `**${l.file}:** \`${memeFile(input, l)}\``];
  const cover = input.files.tiktokCover ?? input.files.cover;
  if (cover) lines.push(l.tt.coverUpload(cover));
  lines.push('', `### ${l.description} (${counter(caption, l, input.limits.tiktok.caption)})`, '', ...block(caption?.value ?? l.todo(missing)));
  lines.push('', `### ${l.tt.settings}`, '', checkbox(l.tt.visibility));
  if (plan.settings.tiktokAiLabel) lines.push(checkbox(l.tt.aiLabel));
  return `${lines.join('\n')}\n`;
}

/** The Reel of a meme or a short episode; a short episode has its own text and, optionally, the announcement story. */
function memeInstagramText(plan: ReleasePlan, input: ReleaseTextInput, l: Labels, missing = 'main.description'): string {
  const caption = postOf(plan, 'instagram')?.texts.caption;
  const lines = [`# ${l.meme.instagram}`, '', `**${l.file}:** \`${memeFile(input, l)}\``];
  if (input.files.cover) lines.push(l.meme.cover(input.files.cover));
  const announcement = postOf(plan, 'announce:instagram');
  if (announcement) {
    const story = announcement.texts.caption;
    lines.push('', `## ${l.announce.heading} (${l.ig.story})`, '', announceImageLine(input, l));
    if (story) lines.push('', `### ${l.ig.storyCaption} (${counter(story, l, input.limits.instagram.story_caption)})`, '', ...block(display(story.value, l)));
  }
  const note = hashtagNote(caption, l);
  lines.push('', `### ${l.ig.caption} (${counter(caption, l, input.limits.instagram.caption)}${note ? `, ${note}` : ''})`, '', ...block(caption?.value ?? l.todo(missing)));
  lines.push('', `### ${l.checklist}`, '', checkbox(l.ig.cover(undefined)));
  if (plan.settings.instagramAiLabel) lines.push(checkbox(l.ig.aiLabel));
  return `${lines.join('\n')}\n`;
}

/** The README of the release folder: what lies where, the order, and the open TODOs. */
export function readmeText(input: ReleaseTextInput, todos: string[]): string {
  const l = releaseLabels(input.language);
  const oneVideo = input.kind === 'meme' || input.shape === 'short-episode';
  const folders = (
    oneVideo
      ? (['video', 'cover', 'texts'] as const)
      : (['video', 'thumbnails', 'shorts', ...(input.kind === 'music-video' ? (['audio', 'streaming'] as const) : []), 'texts'] as const)
  ).map((folder) => `- \`${folder}/\` — ${l.readme.folders[folder]}`);
  const steps = input.kind === 'meme' ? l.readme.memeSteps : input.shape === 'short-episode' ? l.readme.shortEpisodeSteps : input.kind === 'music-video' ? l.readme.steps : l.readme.steps.slice(1);
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
export function releaseTexts(plan: ReleasePlan, input: ReleaseTextInput): Record<string, string> {
  const l = releaseLabels(input.language);
  if (input.kind === 'meme') {
    return {
      'youtube.md': memeYoutubeText(plan, input, l),
      'tiktok.md': memeTiktokText(plan, input, l),
      'instagram.md': memeInstagramText(plan, input, l),
      'release-plan.md': planText(input, l),
    };
  }
  // A short episode is one video on five platforms: YouTube Shorts, TikTok, Instagram Reels, X and the microsite (ADR 0057).
  if (input.shape === 'short-episode') {
    return {
      'youtube.md': memeYoutubeText(plan, input, l),
      'tiktok.md': memeTiktokText(plan, input, l, 'tiktok in review/upload.yaml'),
      'instagram.md': memeInstagramText(plan, input, l, 'instagram in review/upload.yaml'),
      'x.md': xText(plan, input, l),
      'release-plan.md': planText(input, l),
    };
  }
  return {
    'youtube.md': youtubeText(plan, input, l),
    'shorts.md': shortsText(plan, input, l),
    'instagram.md': instagramText(plan, input, l),
    'tiktok.md': tiktokText(plan, input, l),
    ...(input.kind === 'music-video' ? { 'spotify.md': spotifyText(plan, input, l) } : {}),
    'x.md': xText(plan, input, l),
    ...(postOf(plan, 'linkedin') ? { 'linkedin.md': linkedinText(plan, input, l) } : {}),
    'release-plan.md': planText(input, l),
  };
}
