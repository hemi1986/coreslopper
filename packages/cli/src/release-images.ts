import type { Timing } from '@coreslopper/core';
import { THUMBNAIL_MAX_LINES, THUMBNAIL_MAX_WORDS } from '../../remotion/src/lib/thumbnail.js';

// The images and the teaser `release` derives from the cover's still for the
// posts of the calendar: the announcement a week before (story and post, with
// the release date on them), the release-day story, and the feed image when
// there is no feed-format render. Pure: what to compose; release.ts renders.

export type DerivedKind = 'announcement' | 'story' | 'feed-image';

export interface DerivedImage {
  /** Path inside the release folder. */
  path: string;
  kind: DerivedKind;
  format: '9x16' | '16x9' | '4x5';
  /** Hook lines separated by `|`, as `thumbnail --text` takes them. */
  text: string;
  tag: string;
  layout?: 'left';
}

export const DERIVED_PATHS = {
  announceStory: 'announce/story-9x16.jpg',
  announcePost: 'announce/post-16x9.jpg',
  teaser: 'announce/teaser-9x16.mp4',
  story: 'instagram/story-9x16.jpg',
  feedImage: 'instagram/feed-4x5.jpg',
} as const;

/** Length of the announcement teaser in seconds. */
export const TEASER_SECONDS = 10;

const WORDS = {
  de: { days: ['SO', 'MO', 'DI', 'MI', 'DO', 'FR', 'SA'], newSong: 'NEUER SONG', now: 'JETZT', onYouTube: 'AUF YOUTUBE', fresh: 'NEU' },
  en: { days: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], newSong: 'NEW SONG', now: 'OUT NOW', onYouTube: 'ON YOUTUBE', fresh: 'NEW' },
};
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const words = (language: string) => (language.toLowerCase().startsWith('de') ? WORDS.de : WORDS.en);

/** The release time as one hook line in the local time of the calendar: `FR 11.12. 18 UHR`, `FRI DEC 11 6PM`. */
export function releaseDateLine(at: string, language: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(at);
  if (!match) throw new Error(`not a calendar time: ${at}`);
  const [, year, month, day, hour, minute] = match as unknown as [string, string, string, string, string, string];
  const weekday = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).getUTCDay();
  const w = words(language);
  if (w === WORDS.de) {
    const time = minute === '00' ? `${Number(hour)} UHR` : `${Number(hour)}:${minute} UHR`;
    return `${w.days[weekday]} ${day}.${month}. ${time}`;
  }
  const h = Number(hour) % 12 || 12;
  const suffix = Number(hour) < 12 ? 'AM' : 'PM';
  const time = minute === '00' ? `${h}${suffix}` : `${h}:${minute}${suffix}`;
  return `${w.days[weekday]} ${MONTHS[Number(month) - 1]} ${Number(day)} ${time}`;
}

/** The title as hook lines of at most four words, in at most `maxLines` lines; undefined when it does not fit. */
export function titleLines(title: string, maxLines: number): string[] | undefined {
  const all = title.toUpperCase().replace(/\|/g, ' ').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  for (let index = 0; index < all.length; index += THUMBNAIL_MAX_WORDS) lines.push(all.slice(index, index + THUMBNAIL_MAX_WORDS).join(' '));
  return lines.length > 0 && lines.length <= maxLines ? lines : undefined;
}

/** The images to compose for a release: the announcement (with the date of the main video), the release-day story, the feed image. */
export function derivedImages(options: {
  title: string;
  language: string;
  /** Calendar time of the main video. */
  releaseAt?: string;
  announcement: boolean;
  story: boolean;
  /** The project has a 4:5 or 1:1 render for the feed post: no feed image needed. */
  feedVideo: boolean;
  feedPost: boolean;
}): DerivedImage[] {
  const w = words(options.language);
  const images: DerivedImage[] = [];
  const title = (room: number) => titleLines(options.title, room) ?? [];
  if (options.announcement && options.releaseAt) {
    const date = releaseDateLine(options.releaseAt, options.language);
    const text = [...title(THUMBNAIL_MAX_LINES - 1), date].join('|');
    images.push({ path: DERIVED_PATHS.announceStory, kind: 'announcement', format: '9x16', text, tag: w.newSong });
    images.push({ path: DERIVED_PATHS.announcePost, kind: 'announcement', format: '16x9', text, tag: w.newSong, layout: 'left' });
  }
  if (options.story) {
    images.push({ path: DERIVED_PATHS.story, kind: 'story', format: '9x16', text: [...title(THUMBNAIL_MAX_LINES - 1), w.onYouTube].join('|'), tag: w.now });
  }
  if (options.feedPost && !options.feedVideo) {
    const lines = title(THUMBNAIL_MAX_LINES);
    images.push({ path: DERIVED_PATHS.feedImage, kind: 'feed-image', format: '4x5', text: lines.length ? lines.join('|') : w.fresh, tag: w.now });
  }
  return images;
}

/** Where the teaser starts: the first chorus (or refrain, hook), else the start of the second section, else 0. */
export function teaserWindow(timing: Pick<Timing, 'sections' | 'audio'>, length = TEASER_SECONDS): { start: number; duration: number } {
  const chorus = timing.sections.find((section) => /chorus|refrain|hook/i.test(`${section.id} ${section.label ?? ''}`));
  const start = chorus?.start ?? timing.sections[1]?.start ?? 0;
  const duration = Math.max(1, Math.min(length, timing.audio.duration - start));
  return { start: Math.max(0, Math.min(start, Math.max(0, timing.audio.duration - duration))), duration };
}
