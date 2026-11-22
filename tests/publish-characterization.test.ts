// Characterization tests from the adoption of the publish slice (2026-11-22).
// They pin what the release autopilot's plan does today; they do not assert what it should do.
import { describe, expect, it } from 'vitest';
import {
  ReleaseScheduleSchema,
  buildCalendar,
  planAutopilot,
  type AutopilotEntry,
  type AutopilotLog,
  type CalendarInput,
  type ReleaseStatus,
} from '../packages/core/src/index.ts';

const schedule = ReleaseScheduleSchema.parse({ version: 1, timezone: 'UTC' });
const input: CalendarInput = {
  slug: 'song',
  title: 'Song',
  kind: 'music-video',
  releaseDate: '2026-12-11',
  shorts: [],
  announcement: true,
  communityPost: false,
  instagramPost: false,
  x: true,
  linkedin: false,
  microsite: false,
};
const calendar = buildCalendar(input, { schedule, now: new Date('2026-11-01T09:00:00Z'), others: [] });
const approved: ReleaseStatus = { version: 1, approval: { at: '2026-11-02T10:00:00Z', release_date: '2026-12-11' }, items: {} };
const unapproved: ReleaseStatus = { version: 1, items: {} };
const emptyLog: AutopilotLog = { version: 1, entries: [] };
const HOUR = 3_600_000;
const eventAt = (id: string) => Date.parse(calendar.events.find((event) => event.id === id)!.at);
const failure = (event: string, at: number): AutopilotEntry => ({
  event,
  status: 'failed',
  at: new Date(at).toISOString(),
  warnings: [],
  manual_steps: [],
  mock: false,
});
const state = (id: string, now: number, options: { status?: ReleaseStatus; log?: AutopilotLog; settings?: Partial<typeof schedule.autopilot> } = {}) =>
  planAutopilot({
    calendar,
    status: options.status ?? approved,
    log: options.log ?? emptyLog,
    settings: { ...schedule.autopilot, ...options.settings },
    now: new Date(now),
  }).find((plan) => plan.id === id)!;

describe('publish characterization', () => {
  it('ships the documented autopilot defaults', () => {
    expect(ReleaseScheduleSchema.parse({ version: 1 }).autopilot).toEqual({
      platforms: ['youtube', 'tiktok', 'instagram', 'x', 'linkedin', 'microsite'],
      youtube_ahead_hours: 24,
      youtube_audited: false,
      tiktok_direct: false,
      late_hours: 12,
      retries: 3,
    });
  });

  it('uploads YouTube a day ahead but counts lateness from the calendar time', () => {
    const at = eventAt('youtube');
    expect(state('youtube', at - 25 * HOUR).state).toBe('waiting');
    expect(state('youtube', at - 23 * HOUR)).toMatchObject({ state: 'due', dueAt: new Date(at - 24 * HOUR).toISOString() });
    expect(state('youtube', at + 11 * HOUR).state).toBe('due');
    expect(state('youtube', at + 13 * HOUR)).toMatchObject({ state: 'missed', needsUser: true });
  });

  it('counts failed attempts against retries: with retries 1 the first failure waits for the user', () => {
    const at = eventAt('announce:x');
    const log: AutopilotLog = { version: 1, entries: [failure('announce:x', at + 60_000)] };
    // Back-off: 10 minutes per failed attempt, then due again.
    expect(state('announce:x', at + 5 * 60_000, { log })).toMatchObject({ state: 'waiting', attempts: 1 });
    expect(state('announce:x', at + 2 * HOUR, { log })).toMatchObject({ state: 'due', attempts: 1 });
    expect(state('announce:x', at + 2 * HOUR, { log, settings: { retries: 1 } })).toMatchObject({ state: 'failed', needsUser: true });
  });

  it('lets a done mark and a take-over win before the approval is checked', () => {
    const at = eventAt('announce:x');
    expect(state('announce:x', at, { status: unapproved }).state).toBe('unapproved');
    expect(state('announce:x', at, { status: { ...unapproved, items: { 'announce:x': { done: true } } } }).state).toBe('done');
    expect(state('announce:x', at, { status: { ...unapproved, items: { 'announce:x': { done: false, manual: true } } } }).state).toBe('manual');
  });
});
