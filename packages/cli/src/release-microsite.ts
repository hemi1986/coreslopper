import type { ReleaseCalendar, ReleaseStatus } from '@coreslopper/core';
import { footerLines, releaseLabels, type ReleaseTextInput } from './release-texts.js';

// The song page of the artist microsite as data: `release` writes it to
// renders/release/microsite/<slug>.json, and the microsite builds its page from
// it. Live URLs come from the release board's status once the user has posted.

export interface MicrositeSong {
  version: 1;
  slug: string;
  artist?: string;
  title: string;
  language: string;
  release_date?: string;
  teaser?: string;
  text?: string;
  quote?: string;
  /** Plain lyrics, stanzas separated by blank lines. */
  lyrics?: string;
  /** Files of the release folder, relative to it. */
  images: { cover?: string; thumbnail?: string; shorts: string[] };
  /** Live URLs, filled in as the user posts. */
  links: Partial<Record<'youtube' | 'spotify' | 'tiktok' | 'instagram' | 'x' | 'linkedin', string>>;
  shorts: { name: string; title?: string; links: Partial<Record<'youtube' | 'tiktok' | 'instagram' | 'x', string>> }[];
  /** The channel's profile links, for the page footer. */
  profiles: Record<string, string>;
  /** The AI disclosure line (EU AI Act Art. 50) and the credits. */
  disclosure: string;
  credits: string[];
}

const DISCLOSURE = {
  de: { both: 'Song und Video wurden mit KI erstellt.', video: 'Das Video wurde mit KI erstellt.' },
  en: { both: 'Song and video were made with AI.', video: 'The video was made with AI.' },
};

export function micrositeSong(input: ReleaseTextInput, options: { status: ReleaseStatus; calendar?: ReleaseCalendar; lyrics?: string }): MicrositeSong {
  const site = input.data?.microsite;
  const url = (id: string) => options.status.items[id]?.url;
  const de = input.language.toLowerCase().startsWith('de');
  const songAi = Object.values(input.release?.ai_credits ?? {}).some((share) => share && share !== 'none');
  const profiles = Object.fromEntries(
    Object.entries(input.channel?.links ?? {})
      .map(([platform, link]) => [platform, link.url ?? link.handle] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1]) && !/<ID>/.test(entry[1]!)),
  );
  const links: MicrositeSong['links'] = {
    youtube: url('youtube'),
    spotify: url('song'),
    instagram: url('instagram-post'),
    x: url('x'),
    linkedin: url('linkedin'),
  };
  return {
    version: 1,
    slug: input.slug,
    artist: input.artist,
    title: input.title,
    language: input.language,
    release_date: input.release?.release_date ?? options.calendar?.release_date,
    teaser: site?.teaser,
    text: site?.text,
    quote: site?.quote,
    lyrics: options.lyrics?.trim() || undefined,
    images: { cover: input.files.cover, thumbnail: input.files.thumbnails[0], shorts: input.files.shorts.flatMap((short) => (short.thumbnail ? [short.thumbnail] : [])) },
    links: Object.fromEntries(Object.entries(links).filter(([, value]) => value)) as MicrositeSong['links'],
    shorts: input.files.shorts.map((short) => {
      const upload = input.data?.shorts.find((entry) => entry.name === short.name);
      const shortLinks = Object.fromEntries(
        (['youtube', 'tiktok', 'instagram', 'x'] as const).map((platform) => [platform, url(`short:${short.name}:${platform}`)]).filter(([, value]) => value),
      );
      return { name: short.name, title: upload?.title, links: shortLinks };
    }),
    profiles,
    disclosure: (de ? DISCLOSURE.de : DISCLOSURE.en)[songAi ? 'both' : 'video'],
    credits: footerLines(input, releaseLabels(input.language)).filter((line) => !Object.values(profiles).some((profile) => line.endsWith(profile))),
  };
}
