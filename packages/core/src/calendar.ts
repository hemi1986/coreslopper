import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readYamlFile } from './project.js';
import {
  ReleaseScheduleSchema,
  type CalendarEvent,
  type CalendarPlatform,
  type ReleaseCalendar,
  type ReleaseSchedule,
} from './schema.js';

// The release calendar: when what goes online where. Pure date arithmetic in
// the schedule's time zone; no file writes. A project's calendar takes the
// next free release day and Short slots under config/release-schedule.yaml,
// so releases and Shorts of different songs never collide, and an event it
// already holds keeps its time (the user may have moved it).

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
type Weekday = (typeof WEEKDAYS)[number];

/** The schedule's time zone: the configured one, else the computer's. */
export function scheduleZone(schedule: Pick<ReleaseSchedule, 'timezone'>): string {
  return schedule.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
}

/**
 * A warning when release times would be planned in UTC only because no zone is configured – the board container's
 * default (`TZ` unset in compose.yaml). Undefined when the schedule names a zone or the computer is not on UTC.
 */
export function scheduleZoneWarning(
  schedule: Pick<ReleaseSchedule, 'timezone'>,
  computerZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
): string | undefined {
  if (schedule.timezone || !/^(Etc\/)?(UTC|GMT|Universal|Zulu)$/i.test(computerZone)) return undefined;
  return 'Release times are planned in UTC: set timezone in config/release-schedule.yaml (or TZ for the board container)';
}

/** `config/release-schedule.yaml` of the workspace, or the defaults when there is none. */
export async function loadReleaseSchedule(root: string): Promise<ReleaseSchedule> {
  const path = join(root, 'config', 'release-schedule.yaml');
  return existsSync(path) ? readYamlFile(path, ReleaseScheduleSchema) : ReleaseScheduleSchema.parse({ version: 1 });
}

/** `YYYY-MM-DD` plus `days`. */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function weekdayOf(day: string): Weekday {
  return WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()]!;
}

/** Days from `a` to `b`. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/** The Monday of a day's week, as the key of the week. */
function weekOf(day: string): string {
  const index = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(day, -index);
}

/** Offset of a time zone at an instant, in minutes east of UTC. */
function offsetMinutes(instant: number, timeZone: string): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(new Date(instant))
    .find((part) => part.type === 'timeZoneName')?.value;
  const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name ?? '');
  if (!match) return 0;
  return (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] ?? 0));
}

/** A local date and time in a zone as ISO 8601 with its offset: `2026-12-11T18:00:00+01:00`. */
export function zonedIso(day: string, time: string, timeZone: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const [h, min] = time.split(':').map(Number) as [number, number];
  const wall = Date.UTC(y, m - 1, d, h, min);
  let offset = offsetMinutes(wall, timeZone);
  offset = offsetMinutes(wall - offset * 60_000, timeZone);
  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  return `${day}T${time}:00${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/** Today's date in a zone. */
export function zonedToday(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** The local date of an event's `at`. */
export const eventDay = (event: Pick<CalendarEvent, 'at'>) => event.at.slice(0, 10);

const STEP_ORDER = ['distributor', 'pitch', 'canvas', 'announce', 'song', 'artist-pick', 'youtube', 'community', 'story', 'post', 'page', 'short', 'links'];

/** What the calendar needs to know about the project. */
export interface CalendarInput {
  slug: string;
  title: string;
  kind: 'music-video' | 'episode' | 'meme';
  /** `release.release_date` from project.yaml: the user's date always wins. */
  releaseDate?: string;
  /** Shorts in their order, with the platforms each one goes to. */
  shorts: { name: string; platforms: ('youtube' | 'tiktok' | 'instagram' | 'x')[] }[];
  announcement: boolean;
  communityPost: boolean;
  instagramPost: boolean;
  x: boolean;
  linkedin: boolean;
  microsite: boolean;
}

export interface CalendarContext {
  schedule: ReleaseSchedule;
  now: Date;
  /** The project's current calendar, whose event times are kept. */
  existing?: ReleaseCalendar;
  /** Every other project's calendar in the workspace. */
  others: ReleaseCalendar[];
  /** Ignore the existing calendar and plan again from scratch. */
  replan?: boolean;
}

/** A day the schedule keeps free of releases and tasks (holidays). */
export function skippedDay(schedule: ReleaseSchedule, day: string): boolean {
  return schedule.release.skip.some((pattern) => (pattern.length === 5 ? day.slice(5) === pattern : day === pattern));
}

/** The first release day on the schedule's weekday at least `lead_days` from today and `min_gap_weeks` from every other release. */
export function nextReleaseDay(schedule: ReleaseSchedule, now: Date, taken: string[]): string {
  const earliest = addDays(zonedToday(now, scheduleZone(schedule)), schedule.release.lead_days);
  const gap = schedule.release.min_gap_weeks * 7;
  let day = earliest;
  while (weekdayOf(day) !== schedule.release.weekday) day = addDays(day, 1);
  for (let guard = 0; guard < 520; guard += 1) {
    if (!skippedDay(schedule, day) && taken.every((other) => Math.abs(daysBetween(other, day)) >= Math.max(gap, 1))) return day;
    day = addDays(day, 7);
  }
  return day;
}

/** Build or update a project's release calendar. */
export function buildCalendar(input: CalendarInput, context: CalendarContext): ReleaseCalendar {
  const { schedule } = context;
  const tz = scheduleZone(schedule);
  const existing = context.replan ? undefined : context.existing;
  const takenReleases = [
    ...context.others.map((calendar) => calendar.release_date),
    ...schedule.booked.filter((slot) => slot.kind === 'release').map((slot) => slot.date),
  ];
  const releaseDate =
    input.releaseDate ?? (existing && !takenReleases.includes(existing.release_date) ? existing.release_date : undefined) ?? nextReleaseDay(schedule, context.now, takenReleases);
  // A new release date moves every event; the user's date in project.yaml wins over kept times.
  const keep = existing && existing.release_date === releaseDate ? new Map(existing.events.map((event) => [event.id, event])) : new Map<string, CalendarEvent>();
  const events: CalendarEvent[] = [];
  // A step before or after the release day that lands on a holiday moves away from the release (earlier before it, later after it).
  const at = (day: number, time: string) => {
    let date = addDays(releaseDate, day);
    while (day !== 0 && skippedDay(schedule, date)) date = addDays(date, day < 0 ? -1 : 1);
    return zonedIso(date, time, tz);
  };
  const push = (id: string, platform: CalendarPlatform, step: string, when: string, item = 'main') => {
    const kept = keep.get(id);
    events.push({ id, platform, step, item, at: kept?.at ?? when });
  };
  const music = input.kind === 'music-video';
  const { steps, release, posts } = schedule;

  if (music) {
    push('distributor', 'distributor', 'distributor', at(steps.distributor, steps.task_time));
    push('pitch', 'spotify', 'pitch', at(steps.pitch, steps.task_time));
    push('canvas', 'spotify', 'canvas', at(steps.canvas, steps.task_time));
  }
  if (input.announcement) {
    push('announce:instagram', 'instagram', 'announce', at(steps.announce, posts.instagram), 'announcement');
    push('announce:youtube', 'youtube', 'announce', at(steps.announce, release.video_time), 'announcement');
    if (input.x) push('announce:x', 'x', 'announce', at(steps.announce, posts.x), 'announcement');
  }
  if (music) {
    push('song', 'spotify', 'song', at(0, release.song_time));
    push('artist-pick', 'spotify', 'artist-pick', at(0, steps.task_time));
  }
  push('youtube', 'youtube', 'youtube', at(0, release.video_time));
  if (input.communityPost) push('community', 'youtube', 'community', at(0, release.video_time));
  push('story', 'instagram', 'story', at(0, release.video_time));
  if (input.instagramPost) push('instagram-post', 'instagram', 'post', at(0, posts.instagram));
  if (input.x) push('x', 'x', 'post', at(0, posts.x));
  if (input.microsite) push('microsite', 'microsite', 'page', at(0, release.video_time));
  if (music) push('links', 'youtube', 'links', at(steps.links, steps.task_time));
  if (input.linkedin) {
    let day = 1;
    while (weekdayOf(addDays(releaseDate, day)) !== posts.linkedin_weekday) day += 1;
    push('linkedin', 'linkedin', 'post', at(day, posts.linkedin_time));
  }

  // Shorts: one per slot day across all projects, at most per_song_per_week of this song a week,
  // never before today (a song released earlier gets its open Shorts from now on).
  const shortTimes = schedule.shorts.times;
  const occupied = new Set([
    ...context.others.flatMap((calendar) => calendar.events.filter((event) => event.step === 'short').map(eventDay)),
    ...schedule.booked.filter((slot) => slot.kind === 'short').map((slot) => slot.date),
  ]);
  const placed = new Map<string, string>();
  for (const short of input.shorts) {
    const kept = short.platforms.map((platform) => keep.get(`short:${short.name}:${platform}`)).find(Boolean);
    if (kept) placed.set(short.name, eventDay(kept));
  }
  const perWeek = (day: string) => [...placed.values()].filter((other) => weekOf(other) === weekOf(day)).length;
  const usedDays = () => new Set(placed.values());
  const today = zonedToday(context.now, tz);
  for (const [index, short] of input.shorts.entries()) {
    if (placed.has(short.name)) continue;
    let day = releaseDate < today ? today : releaseDate;
    for (let guard = 0; guard < 400; guard += 1) {
      const releaseSlot = index === 0 && day === releaseDate && schedule.shorts.first_on_release_day;
      const slotDay = schedule.shorts.weekdays.includes(weekdayOf(day)) || releaseSlot;
      if (slotDay && !occupied.has(day) && !usedDays().has(day) && perWeek(day) < schedule.shorts.per_song_per_week) break;
      day = addDays(day, 1);
    }
    placed.set(short.name, day);
  }
  for (const short of input.shorts) {
    const day = placed.get(short.name)!;
    for (const platform of short.platforms) {
      const id = `short:${short.name}:${platform}`;
      const kept = keep.get(id);
      events.push({ id, platform: platform === 'youtube' ? 'shorts' : platform, step: 'short', item: short.name, at: kept?.at ?? zonedIso(day, shortTimes[platform], tz) });
    }
  }

  // At the same time, the main video first, then the posts pointing to it, then the Shorts.
  const rank = (event: CalendarEvent) => STEP_ORDER.indexOf(event.step) + 1 || STEP_ORDER.length + 1;
  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || rank(a) - rank(b) || a.id.localeCompare(b.id));
  return { version: 1, project: input.slug, title: input.title, release_date: releaseDate, proposed: input.releaseDate === undefined, timezone: tz, events };
}

const icsText = (text: string) => text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (char) => `\\${char}`);
const icsStamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** An iCalendar file of calendars, one 15-minute event per step; `summary` names each step. Stable: no wall clock. */
export function calendarIcs(calendars: ReleaseCalendar[], summary: (calendar: ReleaseCalendar, event: CalendarEvent) => string): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//coreslopper//release calendar//EN', 'CALSCALE:GREGORIAN'];
  for (const calendar of calendars) {
    for (const event of calendar.events) {
      lines.push(
        'BEGIN:VEVENT',
        `UID:${calendar.project}-${event.id.replace(/[^A-Za-z0-9-]/g, '-')}@coreslopper`,
        `DTSTAMP:${icsStamp(event.at)}`,
        `DTSTART:${icsStamp(event.at)}`,
        'DURATION:PT15M',
        `SUMMARY:${icsText(summary(calendar, event))}`,
        'END:VEVENT',
      );
    }
  }
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}
