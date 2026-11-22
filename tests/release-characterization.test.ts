import { describe, expect, it } from 'vitest';
import {
  ReleaseScheduleSchema,
  UploadDataSchema,
  approvalHolds,
  buildCalendar,
  chapterProblems,
  platformLimits,
  platformTextProblems,
  type CalendarInput,
  type ReleaseCalendar,
} from '../packages/core/src/index.ts';
import { uploadYaml } from './helpers/release-fixture.ts';

// Characterization tests from the adoption of the release slice (2026-11-22).
// They pin what the code does today and the decided model keeps; they do not assert what it should do.

const schedule = ReleaseScheduleSchema.parse({ version: 1 });
const now = new Date('2026-11-21T09:00:00Z');
const limits = platformLimits();

const input = (extra: Partial<CalendarInput> = {}): CalendarInput => ({
  slug: 'alpha',
  title: 'Alpha',
  kind: 'music-video',
  shorts: [{ name: 'A1-hook', platforms: ['youtube'] }],
  announcement: false,
  communityPost: false,
  instagramPost: false,
  x: false,
  linkedin: false,
  microsite: false,
  ...extra,
});

const upload = (change: (data: ReturnType<typeof uploadYaml>) => void = () => undefined) => {
  const data = uploadYaml();
  change(data);
  return UploadDataSchema.parse(data);
};

describe('the release calendar', () => {
  it('keeps a proposed release day while no other release holds it', () => {
    const first = buildCalendar(input(), { schedule, now, others: [] });
    expect(first.proposed).toBe(true);
    const later = buildCalendar(input(), { schedule, now: new Date('2026-11-25T09:00:00Z'), existing: first, others: [] });
    expect(later.release_date).toBe(first.release_date);
    expect(later.proposed).toBe(true);
  });

  it('plans every event again when the release day moves, dropping the times the user moved', () => {
    const first = buildCalendar(input({ releaseDate: '2026-12-18' }), { schedule, now, others: [] });
    const moved: ReleaseCalendar = {
      ...first,
      events: first.events.map((event) => (event.id === 'youtube' ? { ...event, at: '2026-12-18T19:30:00+01:00' } : event)),
    };
    const sameDay = buildCalendar(input({ releaseDate: '2026-12-18' }), { schedule, now, existing: moved, others: [] });
    expect(sameDay.events.find((event) => event.id === 'youtube')?.at).toBe('2026-12-18T19:30:00+01:00');
    const newDay = buildCalendar(input({ releaseDate: '2027-01-08' }), { schedule, now, existing: moved, others: [] });
    expect(newDay.proposed).toBe(false);
    expect(newDay.events.find((event) => event.id === 'youtube')?.at).toBe('2027-01-08T18:00:00+01:00');
  });
});

describe('the release approval', () => {
  it('holds for the approved release day only, whatever the event times', () => {
    const approval = { at: '2026-11-21T10:00:00.000Z', release_date: '2026-12-18' };
    expect(approvalHolds({ approval }, { release_date: '2026-12-18' })).toBe(true);
    expect(approvalHolds({ approval }, { release_date: '2026-12-25' })).toBe(false);
    expect(approvalHolds({ approval: undefined }, { release_date: '2026-12-18' })).toBe(false);
  });
});

describe('the platform texts', () => {
  it('counts every link in an X post as 23 characters and adds 24 for the reply’s link', () => {
    const link = `https://example.com/${'a'.repeat(200)}`;
    expect(platformTextProblems(upload((data) => (data.x.post = `Out now ${link}`)), limits).errors).toEqual([]);
    const reply = upload((data) => (data.x.reply = 'x'.repeat(257)));
    expect(platformTextProblems(reply, limits).errors).toEqual(['x: reply with the link has 281 characters, limit 280']);
  });

  it('keeps the first LinkedIn paragraph within what shows before “see more”, and its media a Short or main', () => {
    const long = upload((data) => {
      data.linkedin.post = `${'w'.repeat(211)}\n\nMore.`;
      (data.linkedin as { media?: string }).media = 'Z9-missing';
    });
    expect(platformTextProblems(long, limits).errors).toEqual([
      'linkedin: the first paragraph has 211 characters; only 210 show before "see more"',
      'linkedin: media Z9-missing is not main or a Short',
    ]);
  });
});

describe('explicit chapters', () => {
  it('start at 0:00, number at least three, and last at least ten seconds each', () => {
    expect(chapterProblems([{ start: 0, title: 'Intro' }, { start: 10, title: 'Verse' }, { start: 20, title: 'Chorus' }], 30)).toEqual([]);
    expect(chapterProblems([{ start: 5, title: 'Intro' }, { start: 12, title: 'Verse' }], 30)).toEqual([
      'the first chapter must start at 0:00',
      '2 chapters; YouTube needs at least 3',
      'chapter "Intro" is shorter than 10 s',
    ]);
  });
});
