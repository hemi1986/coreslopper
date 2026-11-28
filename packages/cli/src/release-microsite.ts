import { MicrositeAspectSchema, type MicrositeAspect, type MicrositeSong, type ReleaseCalendar, type ReleaseStatus } from '@coreslopper/core';
import { footerLines, releaseLabels, type ReleaseTextInput } from './release-texts.js';

// The song page of the artist microsite as data: `release` writes it to
// renders/release/microsite/<slug>.json, and the microsite builds its page from
// it. Live URLs come from the release board's status once the user has posted.

export type { MicrositeSong } from '@coreslopper/core';

/** The master's aspect (`9x16` → `9:16`); none for a master outside the release formats. */
function micrositeAspect(masterFormat: string | undefined): MicrositeAspect | undefined {
  const parsed = MicrositeAspectSchema.safeParse(masterFormat?.replace('x', ':'));
  return parsed.success ? parsed.data : undefined;
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
    // A short episode has no thumbnails: its page shows the episode's cover (ST-054).
    images: {
      cover: input.files.cover,
      thumbnail: input.shape === 'short-episode' ? input.files.cover : input.files.thumbnails[0],
      shorts: input.files.shorts.flatMap((short) => (short.thumbnail ? [short.thumbnail] : [])),
    },
    aspect: micrositeAspect(input.masterFormat),
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
