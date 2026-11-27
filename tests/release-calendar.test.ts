import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { readYamlFile } from '../packages/core/src/index.ts';
import { validateChangedFile } from '../packages/cli/src/validate-file.ts';
import {
  ReleaseScheduleSchema,
  buildCalendar,
  calendarIcs,
  scheduleZone,
  scheduleZoneWarning,
  eventDay,
  nextReleaseDay,
  weekdayOf,
  zonedIso,
  type CalendarInput,
  type ReleaseCalendar,
} from '../packages/core/src/index.ts';

const schedule = ReleaseScheduleSchema.parse({ version: 1 });
// Saturday, 21 November 2026, 10:00 in Berlin.
const now = new Date('2026-11-21T09:00:00Z');

const input = (slug: string, shorts = ['A1-hook', 'A2-chorus', 'A3-drop'], extra: Partial<CalendarInput> = {}): CalendarInput => ({
  slug,
  title: slug,
  kind: 'music-video',
  shorts: shorts.map((name) => ({ name, platforms: ['youtube', 'tiktok', 'instagram'] })),
  announcement: true,
  communityPost: true,
  instagramPost: true,
  x: true,
  linkedin: false,
  microsite: true,
  ...extra,
  shape: extra.shape ?? extra.kind ?? 'music-video',
});

const shortDays = (calendar: ReleaseCalendar) =>
  [...new Set(calendar.events.filter((event) => event.step === 'short').map((event) => `${event.item}@${eventDay(event)}`))];

describe('release schedule', () => {
  it('defaults to a Friday release in the computer’s time zone', () => {
    expect(schedule.timezone).toBeUndefined();
    expect(scheduleZone(schedule)).toBe('Europe/Berlin');
    expect(schedule.release).toMatchObject({ weekday: 'fri', song_time: '00:00', video_time: '18:00', premiere: true, min_gap_weeks: 1, lead_days: 21 });
    expect(schedule.shorts.weekdays).toEqual(['mon', 'wed', 'fri']);
    expect(schedule.steps).toMatchObject({ distributor: -21, pitch: -14, announce: -7 });
  });

  it('accepts the template, which spells out the defaults', async () => {
    const path = join(process.cwd(), 'templates', 'channel', 'release-schedule.yaml');
    expect(await readYamlFile(path, ReleaseScheduleSchema)).toEqual(schedule);
    expect(await readFile(path, 'utf8')).not.toMatch(/^timezone:/m);
  });

  it('is validated by the hook as workspace config', async () => {
    const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const base = await mkdtemp(join(tmpdir(), 'coreslopper-schedule-'));
    await mkdir(join(base, 'config'));
    await writeFile(join(base, 'config', 'release-schedule.yaml'), 'version: 1\nrelease: { weekday: fri, video_time: "18:00" }\n');
    expect(await validateChangedFile(join(base, 'config', 'release-schedule.yaml'))).toBe('release schedule');
    await writeFile(join(base, 'config', 'release-schedule.yaml'), 'version: 1\nrelease: { video_time: "6pm" }\n');
    await expect(validateChangedFile(join(base, 'config', 'release-schedule.yaml'))).rejects.toThrow();
  });

  it('writes local times with the Berlin offset, also across daylight saving', () => {
    expect(zonedIso('2026-12-11', '18:00', 'Europe/Berlin')).toBe('2026-12-11T18:00:00+01:00');
    expect(zonedIso('2027-07-02', '00:00', 'Europe/Berlin')).toBe('2027-07-02T00:00:00+02:00');
    expect(new Date(zonedIso('2027-03-28', '18:00', 'Europe/Berlin')).toISOString()).toBe('2027-03-28T16:00:00.000Z');
  });
});

describe('release calendar', () => {
  it('proposes the first free Friday three weeks out and dates every step from it', () => {
    const calendar = buildCalendar(input('alpha'), { schedule, now, others: [] });
    expect(calendar.release_date).toBe('2026-12-18');
    expect(weekdayOf(calendar.release_date)).toBe('fri');
    expect(calendar.proposed).toBe(true);
    const at = (id: string) => calendar.events.find((event) => event.id === id)?.at;
    expect(at('distributor')).toBe('2026-11-27T10:00:00+01:00');
    expect(at('pitch')).toBe('2026-12-04T10:00:00+01:00');
    expect(at('announce:instagram')).toBe('2026-12-11T20:00:00+01:00');
    expect(at('song')).toBe('2026-12-18T00:00:00+01:00');
    expect(at('youtube')).toBe('2026-12-18T18:00:00+01:00');
    expect(at('links')).toBe('2026-12-19T10:00:00+01:00');
    expect(at('linkedin')).toBeUndefined();
    // Sorted by time.
    expect(calendar.events.map((event) => Date.parse(event.at))).toEqual([...calendar.events.map((event) => Date.parse(event.at))].sort((a, b) => a - b));
  });

  it('puts Short 1 on the release day and one Short per week after it on Mo/We/Fr', () => {
    const calendar = buildCalendar(input('alpha'), { schedule, now, others: [] });
    expect(shortDays(calendar)).toEqual(['A1-hook@2026-12-18', 'A2-chorus@2026-12-21', 'A3-drop@2026-12-28']);
    const tiktok = calendar.events.find((event) => event.id === 'short:A1-hook:tiktok');
    expect(tiktok).toMatchObject({ platform: 'tiktok', at: '2026-12-18T20:00:00+01:00' });
    expect(calendar.events.find((event) => event.id === 'short:A1-hook:youtube')?.platform).toBe('shorts');
  });

  it('keeps releases a week apart and interleaves Shorts of different songs', () => {
    const alpha = buildCalendar(input('alpha'), { schedule, now, others: [] });
    const beta = buildCalendar(input('beta', ['B1-hook', 'B2-chorus', 'B3-drop']), { schedule, now, others: [alpha] });
    // 25 December is a holiday and 1 January too: the next Friday is 8 January.
    expect(beta.release_date).toBe('2027-01-08');
    const gamma = buildCalendar(input('gamma', ['C1-hook', 'C2-chorus']), { schedule, now, others: [alpha, beta] });
    expect(gamma.release_date).toBe('2027-01-15');
    const taken = new Set([...shortDays(alpha), ...shortDays(beta)].map((entry) => entry.split('@')[1]));
    for (const entry of shortDays(gamma)) expect(taken.has(entry.split('@')[1]!)).toBe(false);
    expect(shortDays(beta)).toEqual(['B1-hook@2027-01-08', 'B2-chorus@2027-01-11', 'B3-drop@2027-01-18']);
    expect(shortDays(gamma)).toEqual(['C1-hook@2027-01-15', 'C2-chorus@2027-01-20']);
  });

  it('honours booked slots and the user’s release date', () => {
    const booked = ReleaseScheduleSchema.parse({ version: 1, booked: [{ date: '2026-12-18', kind: 'release', label: 'other song' }, { date: '2027-01-11', label: 'K1' }] });
    expect(buildCalendar(input('alpha'), { schedule: booked, now, others: [] }).release_date).toBe('2027-01-08');
    const fixed = buildCalendar(input('alpha', ['A1-hook', 'A2-chorus', 'A3-drop'], { releaseDate: '2027-01-08' }), { schedule: booked, now, others: [] });
    expect(fixed).toMatchObject({ release_date: '2027-01-08', proposed: false });
    expect(shortDays(fixed)).toEqual(['A1-hook@2027-01-08', 'A2-chorus@2027-01-13', 'A3-drop@2027-01-18']);
  });

  it('keeps times the user moved, adds new Shorts, and plans again on request', () => {
    const first = buildCalendar(input('alpha', ['A1-hook']), { schedule, now, others: [] });
    const moved: ReleaseCalendar = {
      ...first,
      events: first.events.map((event) => (event.id === 'youtube' ? { ...event, at: '2026-12-18T19:30:00+01:00' } : event)),
    };
    const again = buildCalendar(input('alpha', ['A1-hook', 'A2-chorus']), { schedule, now: new Date('2026-12-01T09:00:00Z'), existing: moved, others: [] });
    expect(again.release_date).toBe('2026-12-18');
    expect(again.events.find((event) => event.id === 'youtube')?.at).toBe('2026-12-18T19:30:00+01:00');
    expect(shortDays(again)).toEqual(['A1-hook@2026-12-18', 'A2-chorus@2026-12-21']);
    const replanned = buildCalendar(input('alpha', ['A1-hook']), { schedule, now, existing: moved, others: [], replan: true });
    expect(replanned.events.find((event) => event.id === 'youtube')?.at).toBe('2026-12-18T18:00:00+01:00');
  });

  it('dates LinkedIn on the next Tuesday morning and leaves streaming steps out of episodes', () => {
    const withLinkedin = buildCalendar(input('alpha', [], { linkedin: true }), { schedule, now, others: [] });
    expect(withLinkedin.events.find((event) => event.id === 'linkedin')?.at).toBe('2026-12-22T09:00:00+01:00');
    const episode = buildCalendar(input('ep1', ['E1-cold'], { kind: 'episode' }), { schedule, now, others: [] });
    expect(episode.events.map((event) => event.id)).not.toEqual(expect.arrayContaining(['distributor']));
    expect(episode.events.some((event) => ['distributor', 'pitch', 'song', 'links'].includes(event.id))).toBe(false);
  });

  it('moves tasks off holidays, earlier before the release and later after it', () => {
    const calendar = buildCalendar(input('alpha', [], { releaseDate: '2027-01-08' }), { schedule, now, others: [] });
    const day = (id: string) => calendar.events.find((event) => event.id === id)?.at.slice(0, 10);
    expect(day('announce:instagram')).toBe('2026-12-30');
    expect(day('distributor')).toBe('2026-12-18');
    const late = buildCalendar(input('beta', [], { releaseDate: '2026-12-23' }), { schedule, now, others: [] });
    expect(late.events.find((event) => event.id === 'links')?.at.slice(0, 10)).toBe('2026-12-27');
  });

  it('plans the open Shorts of a song released earlier from today on', () => {
    const calendar = buildCalendar(input('old', ['O1-hook', 'O2-chorus'], { releaseDate: '2026-10-02' }), { schedule, now, others: [] });
    expect(calendar.events.find((event) => event.id === 'youtube')?.at).toBe('2026-10-02T18:00:00+02:00');
    expect(shortDays(calendar)).toEqual(['O1-hook@2026-11-23', 'O2-chorus@2026-11-30']);
  });

  it('skips a release day another project holds', () => {
    expect(nextReleaseDay(schedule, now, ['2026-12-18', '2027-01-08'])).toBe('2027-01-15');
    const noHolidays = ReleaseScheduleSchema.parse({ version: 1, release: { skip: [] } });
    expect(nextReleaseDay(noHolidays, now, ['2026-12-18'])).toBe('2026-12-25');
  });

  it('exports an iCalendar file in UTC', () => {
    const calendar = buildCalendar(input('alpha', ['A1-hook']), { schedule, now, others: [] });
    const ics = calendarIcs([calendar], (cal, event) => `${cal.title}: ${event.step}, ok; done`);
    expect(ics).toContain('BEGIN:VCALENDAR\r\n');
    expect(ics).toContain('DTSTART:20261218T170000Z');
    expect(ics).toContain('UID:alpha-short-A1-hook-tiktok@coreslopper');
    expect(ics).toContain('SUMMARY:alpha: youtube\\, ok\\; done');
    expect(calendarIcs([calendar], () => 'x')).toBe(calendarIcs([calendar], () => 'x'));
  });
});

describe('the release time zone warning', () => {
  it('warns only when no zone is configured and the computer runs on UTC, as the board container does by default', () => {
    expect(scheduleZoneWarning({}, 'UTC')).toContain('timezone');
    expect(scheduleZoneWarning({}, 'Etc/UTC')).toContain('timezone');
    expect(scheduleZoneWarning({ timezone: 'UTC' }, 'UTC')).toBeUndefined();
    expect(scheduleZoneWarning({}, 'America/New_York')).toBeUndefined();
  });
});
