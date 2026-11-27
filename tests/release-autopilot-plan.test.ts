import { describe, expect, it } from 'vitest';
import {
  ReleaseScheduleSchema,
  autopilotAction,
  buildCalendar,
  mainVideoId,
  planAutopilot,
  type AutopilotEntry,
  type AutopilotLog,
  type CalendarInput,
  type ReleaseStatus,
} from '../packages/core/src/index.ts';

const schedule = ReleaseScheduleSchema.parse({ version: 1, timezone: 'Europe/Berlin' });
const settings = schedule.autopilot;
const planned = new Date('2026-11-21T09:00:00Z');

const input: CalendarInput = {
  slug: 'neon',
  title: 'Neon',
  kind: 'music-video',
  releaseDate: '2026-12-11',
  shorts: [{ name: 'N1-hook', platforms: ['youtube', 'tiktok', 'instagram', 'x'] }],
  announcement: true,
  communityPost: true,
  instagramPost: true,
  x: true,
  linkedin: true,
  microsite: true,
};
const calendar = buildCalendar(input, { schedule, now: planned, others: [] });
const approved: ReleaseStatus = { version: 1, approval: { at: '2026-11-22T10:00:00Z', release_date: '2026-12-11' }, items: {} };
const emptyLog: AutopilotLog = { version: 1, entries: [] };
const entry = (event: string, status: AutopilotEntry['status'], at: string, extra: Partial<AutopilotEntry> = {}): AutopilotEntry => ({
  event,
  status,
  at,
  warnings: [],
  manual_steps: [],
  mock: false,
  ...extra,
});
const plan = (now: string, status: ReleaseStatus = approved, log: AutopilotLog = emptyLog, extra = {}) =>
  new Map(planAutopilot({ calendar, status, log, settings, now: new Date(now), ...extra }).map((item) => [item.id, item]));

describe('autopilot actions', () => {
  it('maps API-capable events and leaves the rest manual', () => {
    const actions = Object.fromEntries(calendar.events.map((event) => [event.id, autopilotAction(event, settings)?.kind ?? 'manual']));
    expect(actions).toMatchObject({
      distributor: 'manual',
      pitch: 'manual',
      canvas: 'manual',
      'announce:instagram': 'instagram',
      'announce:youtube': 'manual',
      'announce:x': 'x',
      song: 'manual',
      'artist-pick': 'manual',
      youtube: 'youtube',
      community: 'manual',
      story: 'manual',
      'instagram-post': 'instagram',
      x: 'x',
      links: 'links',
      linkedin: 'linkedin',
      'short:N1-hook:youtube': 'youtube',
      'short:N1-hook:tiktok': 'tiktok',
      'short:N1-hook:instagram': 'instagram',
      'short:N1-hook:x': 'x',
    });
    // Without a microsite directory the page stays manual.
    expect(actions.microsite).toBe('manual');
    const withSite = calendar.events.find((event) => event.id === 'microsite')!;
    expect(autopilotAction(withSite, { microsite: { dir: '../site' } })?.kind).toBe('microsite');
  });
});

describe('autopilot plan', () => {
  it('does nothing before the approval, nor after the release day moved', () => {
    const states = plan('2026-12-11T17:30:00Z', { version: 1, items: {} });
    expect(states.get('x')!.state).toBe('unapproved');
    expect(states.get('pitch')!.state).toBe('manual');
    const moved = plan('2026-12-11T17:30:00Z', { ...approved, approval: { at: '2026-11-22T10:00:00Z', release_date: '2026-12-04' } });
    expect(moved.get('x')!.state).toBe('unapproved');
  });

  it('uploads YouTube videos ahead of their time and posts the rest at it', () => {
    // Thursday 10 December 2026, 18:30 in Berlin: the main video (Friday 18:00) is due a day ahead.
    const states = plan('2026-12-10T17:30:00Z');
    expect(states.get('youtube')!.state).toBe('due');
    expect(states.get('youtube')!.dueAt).toBe('2026-12-10T17:00:00.000Z');
    expect(states.get('instagram-post')!.state).toBe('waiting');
    expect(states.get('announce:x')!.state).toBe('missed');
  });

  it('holds posts that link to the main video until it is public', () => {
    const atRelease = '2026-12-11T17:05:00Z';
    expect(plan(atRelease).get('x')!).toMatchObject({ state: 'blocked', block: 'youtube', needsUser: false });
    const live: ReleaseStatus = { ...approved, items: { youtube: { done: true, url: 'https://youtu.be/abcdefghijk', by: 'autopilot' } } };
    expect(plan(atRelease, live).get('x')!.state).toBe('due');
  });

  it('posts an X release post without a reply without waiting for the main video', () => {
    const atRelease = '2026-12-11T17:05:00Z';
    const post = (needsYoutube?: boolean) => ({ id: 'x', platform: 'x' as const, task: false, texts: {}, files: [], errors: [], missing: [], ...(needsYoutube ? { needsYoutube } : {}) });
    // Without a reply the plan's post carries no link: it is due, with no YouTube URL yet.
    expect(plan(atRelease, approved, emptyLog, { plan: { posts: [post()] } }).get('x')!.state).toBe('due');
    // With the reply it still waits; so does LinkedIn, which the plan here does not name.
    expect(plan(atRelease, approved, emptyLog, { plan: { posts: [post(true)] } }).get('x')!).toMatchObject({ state: 'blocked', block: 'youtube' });
    const linkedinAt = calendar.events.find((event) => event.id === 'linkedin')!.at;
    expect(plan(new Date(Date.parse(linkedinAt) + 60_000).toISOString(), approved, emptyLog, { plan: { posts: [post()] } }).get('linkedin')!).toMatchObject({ state: 'blocked', block: 'youtube' });
  });

  it('waits for the user on a private upload, a premiere, and a draft', () => {
    const log: AutopilotLog = {
      version: 1,
      entries: [
        entry('youtube', 'scheduled', '2026-12-10T17:01:00Z', { remote_id: 'abcdefghijk', publish_at: '2026-12-11T17:00:00Z' }),
        entry('short:N1-hook:youtube', 'uploaded', '2026-12-10T17:02:00Z', { remote_id: 'bcdefghijkl' }),
        entry('short:N1-hook:tiktok', 'draft', '2026-12-11T19:00:00Z', { remote_id: 'v_pub_1' }),
      ],
    };
    const states = plan('2026-12-11T19:10:00Z', approved, log, { premiere: true });
    expect(states.get('youtube')!).toMatchObject({ state: 'pending', needsUser: true });
    expect(states.get('short:N1-hook:youtube')!).toMatchObject({ state: 'pending', needsUser: true });
    expect(states.get('short:N1-hook:tiktok')!).toMatchObject({ state: 'pending', needsUser: true });
    // Audited and no premiere: the scheduled video goes public on its own.
    expect(plan('2026-12-11T19:10:00Z', approved, log, { premiere: false }).get('youtube')!.needsUser).toBe(false);
  });

  it('shows what went out, or may have, after the approval is withdrawn', () => {
    const withdrawn: ReleaseStatus = { version: 1, items: {} };
    const log: AutopilotLog = {
      version: 1,
      entries: [
        entry('youtube', 'scheduled', '2026-12-10T17:01:00Z', { remote_id: 'abcdefghijk', publish_at: '2026-12-11T17:00:00Z' }),
        entry('short:N1-hook:instagram', 'running', '2026-12-11T19:00:00Z'),
        entry('short:N1-hook:x', 'failed', '2026-12-11T19:00:00Z', { error: 'HTTP 502', uncertain: true }),
        entry('announce:x', 'failed', '2026-12-04T17:00:00Z', { error: 'HTTP 500' }),
      ],
    };
    const states = plan('2026-12-11T20:30:00Z', withdrawn, log, { premiere: false });
    // The scheduled upload still goes public: the user changes it in Studio if it should not.
    expect(states.get('youtube')!).toMatchObject({ state: 'pending', needsUser: true });
    expect(states.get('short:N1-hook:instagram')!).toMatchObject({ state: 'stuck', needsUser: true });
    expect(states.get('short:N1-hook:x')!).toMatchObject({ state: 'stuck', needsUser: true });
    // A certain failure has not gone out: it waits for a new approval.
    expect(states.get('announce:x')!.state).toBe('unapproved');
  });

  it('retries with a back-off, then waits for the user; a retry starts over', () => {
    const failed = (count: number): AutopilotLog => ({
      version: 1,
      entries: Array.from({ length: count }, (_, index) => entry('short:N1-hook:instagram', 'failed', `2026-12-11T19:0${index}:00Z`, { error: 'HTTP 500' })),
    });
    const id = 'short:N1-hook:instagram';
    expect(plan('2026-12-11T19:05:00Z', approved, failed(1)).get(id)!).toMatchObject({ state: 'waiting', retryAt: '2026-12-11T19:10:00.000Z' });
    expect(plan('2026-12-11T19:30:00Z', approved, failed(2)).get(id)!.state).toBe('due');
    expect(plan('2026-12-11T19:30:00Z', approved, failed(3)).get(id)!).toMatchObject({ state: 'failed', needsUser: true });
    const retried = failed(3);
    retried.entries.push(entry(id, 'retry', '2026-12-11T20:00:00Z'));
    expect(plan('2026-12-11T20:01:00Z', approved, retried).get(id)!).toMatchObject({ state: 'due', attempts: 0 });
  });

  it('marks a stuck attempt and a missed post for the user; force posts late', () => {
    const id = 'short:N1-hook:instagram';
    const running: AutopilotLog = { version: 1, entries: [entry(id, 'running', '2026-12-11T19:00:00Z')] };
    expect(plan('2026-12-11T19:20:00Z', approved, running).get(id)!.state).toBe('running');
    expect(plan('2026-12-11T20:30:00Z', approved, running).get(id)!).toMatchObject({ state: 'stuck', needsUser: true });
    // The Reel was due Friday 20:00; the computer comes back Saturday noon.
    expect(plan('2026-12-12T11:00:00Z').get(id)!).toMatchObject({ state: 'missed', needsUser: true });
    const unsure: AutopilotLog = { version: 1, entries: [entry(id, 'failed', '2026-12-11T19:00:00Z', { error: 'HTTP 502', uncertain: true })] };
    expect(plan('2026-12-11T19:20:00Z', approved, unsure).get(id)!).toMatchObject({ state: 'stuck', needsUser: true });
    const forced: AutopilotLog = { version: 1, entries: [entry(id, 'force', '2026-12-12T11:05:00Z')] };
    expect(plan('2026-12-12T11:06:00Z', approved, forced).get(id)!.state).toBe('due');
    // "Try again" on a late post that failed asks for one more attempt, not for "Post now" as well.
    const failedLate: AutopilotLog = { version: 1, entries: [entry(id, 'failed', '2026-12-11T19:01:00Z', { fatal: true, error: 'token expired' }), entry(id, 'retry', '2026-12-12T11:05:00Z')] };
    expect(plan('2026-12-12T11:06:00Z', approved, failedLate).get(id)!.state).toBe('due');
  });

  it('runs the links step once the Spotify link is on the board, however late', () => {
    const live: ReleaseStatus = { ...approved, items: { youtube: { done: true, url: 'https://youtu.be/abcdefghijk' } } };
    expect(plan('2026-12-14T12:00:00Z', live).get('links')!).toMatchObject({ state: 'blocked', block: 'spotify', needsUser: true });
    const withSong: ReleaseStatus = { ...live, items: { ...live.items, song: { done: true, url: 'https://open.spotify.com/track/1' } } };
    expect(plan('2026-12-14T12:00:00Z', withSong).get('links')!.state).toBe('due');
  });

  it('leaves events alone that the user took over, are done, lack credentials, or whose platform is off', () => {
    const status: ReleaseStatus = { ...approved, items: { 'short:N1-hook:x': { done: false, manual: true }, 'short:N1-hook:tiktok': { done: true } } };
    const states = plan('2026-12-11T19:30:00Z', status, emptyLog, { ready: { instagram: false } });
    expect(states.get('short:N1-hook:x')!.state).toBe('manual');
    expect(states.get('short:N1-hook:tiktok')!.state).toBe('done');
    expect(states.get('short:N1-hook:instagram')!).toMatchObject({ state: 'blocked', block: 'credentials', needsUser: true });
    // Before the Reel's time (20:00 in Berlin) it shows as blocked, but is not yet the user's problem.
    const early = planAutopilot({ calendar, status, log: emptyLog, settings, now: new Date('2026-12-11T18:30:00Z'), ready: { instagram: false } });
    expect(early.find((item) => item.id === 'short:N1-hook:instagram')!).toMatchObject({ state: 'blocked', needsUser: false });
    const off = planAutopilot({ calendar, status: approved, log: emptyLog, settings: { ...settings, platforms: ['youtube'] }, now: new Date('2026-12-11T19:30:00Z') });
    expect(off.find((item) => item.id === 'linkedin')!.state).toBe('manual');
  });

  it('plans a meme on YouTube Shorts, TikTok, and Instagram Reels', () => {
    const meme = buildCalendar(
      { ...input, kind: 'meme', shorts: [], announcement: false, communityPost: false, instagramPost: false, x: false, linkedin: false, microsite: false },
      { schedule, now: planned, others: [] },
    );
    expect(meme.events.map((event) => event.id)).toEqual(['youtube', 'tiktok', 'instagram']);
    expect(meme.events.map((event) => autopilotAction(event, settings))).toEqual([
      { kind: 'youtube', item: 'main' },
      { kind: 'tiktok', item: 'main' },
      { kind: 'instagram', placement: 'reel', item: 'main' },
    ]);
  });

  it('finds the main video ID in the log or the board URL', () => {
    expect(mainVideoId({ version: 1, items: { youtube: { done: true, url: 'https://www.youtube.com/watch?v=abcdefghijk' } } }, emptyLog)).toBe('abcdefghijk');
    expect(mainVideoId({ version: 1, items: {} }, { version: 1, entries: [entry('youtube', 'uploaded', '2026-12-10T17:00:00Z', { remote_id: 'zyxwvutsrqp' })] })).toBe('zyxwvutsrqp');
  });
});
