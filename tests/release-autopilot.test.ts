import { afterEach, describe, expect, it, vi } from 'vitest';

// The release reads config/channel.yaml of the repo it runs in; a workspace's
// own channel must not change these results.
vi.mock('@coreslopper/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@coreslopper/core')>()),
  loadChannel: async () => undefined,
}));
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { MockPublisher, MockSocialAdapter, PublishError, markUncertain, tiktokCaption, type SocialPlatform } from '../packages/providers/src/index.ts';
import { buildRelease } from '../packages/cli/src/release.ts';
import { loadCalendar, loadStatus, updateStatus } from '../packages/cli/src/release-calendar.ts';
import { publishProject, youtubeDescription } from '../packages/cli/src/publish.ts';
import {
  approveRelease,
  loadAutopilotLog,
  retryEvent,
  revokeApproval,
  runAutopilot,
  setEventManual,
  type AutopilotDeps,
} from '../packages/cli/src/release-autopilot.ts';
import { boardProject } from '../packages/cli/src/release-board-data.ts';
import { appendAutopilotEntry } from '../packages/cli/src/autopilot-state.ts';
import { boardHandler } from '../packages/cli/src/release-board.ts';
import { timerPlan } from '../packages/cli/src/release-timer.ts';
import { cleanupFixtures, fakeDeps, fixture, memeFixture } from './helpers/release-fixture.ts';

afterEach(async () => {
  vi.unstubAllEnvs();
  await cleanupFixtures();
});

const ENV = {
  YOUTUBE_CLIENT_ID: 'id',
  YOUTUBE_CLIENT_SECRET: 'secret',
  YOUTUBE_REFRESH_TOKEN: 'refresh',
  TIKTOK_CLIENT_KEY: 'key',
  TIKTOK_CLIENT_SECRET: 'secret',
  TIKTOK_REFRESH_TOKEN: 'refresh',
  X_CLIENT_ID: 'x',
  X_CLIENT_SECRET: 'x',
  X_REFRESH_TOKEN: 'x',
  LINKEDIN_ACCESS_TOKEN: 'li',
  LINKEDIN_TOKEN_EXPIRES_AT: '2027-06-01T00:00:00Z',
  LINKEDIN_MEMBER_URN: 'urn:li:person:1',
  INSTAGRAM_ACCESS_TOKEN: 'ig',
  INSTAGRAM_USER_ID: '1',
  INSTAGRAM_TOKEN_EXPIRES_AT: '2027-06-01T00:00:00Z',
  FAL_KEY: 'fal',
};

/** An approved release with the mock adapters and a clock the test moves. */
async function setup(options: { env?: Record<string, string>; meme?: boolean | { licence?: string; credit?: string } } = {}) {
  // The board reads the credentials from the environment, like the workspace's .env.
  for (const [key, value] of Object.entries({ ...ENV, ...options.env })) vi.stubEnv(key, value);
  const made = options.meme ? await memeFixture(typeof options.meme === 'object' ? options.meme : {}) : undefined;
  const dir = made ? made.dir : await fixture();
  const root = made ? made.root : join(dir, '..', '..');
  await buildRelease({ projectDir: dir, root, deps: fakeDeps() });
  const calendar = (await loadCalendar(dir))!;
  const at = (id: string) => Date.parse(calendar.events.find((event) => event.id === id)!.at);
  const clock = { now: new Date(calendar.events[0]!.at) };
  const youtube = new MockPublisher('youtube');
  const tiktok = new MockPublisher('tiktok');
  const social = new Map<SocialPlatform, MockSocialAdapter>(['x', 'linkedin', 'instagram'].map((platform) => [platform as SocialPlatform, new MockSocialAdapter(platform as SocialPlatform)]));
  const failures = new Map<string, Error>();
  const lines: string[] = [];
  const publishCalls: { platform?: string; only?: string; schedule?: string }[] = [];
  const deps: Partial<AutopilotDeps> = {
    publish: (publishOptions) => {
      publishCalls.push({ platform: publishOptions.platform, only: publishOptions.only, schedule: publishOptions.schedule });
      return publishProject({
        ...publishOptions,
        adapters: { youtube, tiktok },
        probe: (path) => (/9x16/.test(path) ? { width: 1080, height: 1920, duration: 40 } : { width: 1920, height: 1080, duration: 12 }),
      });
    },
    youtube: () => youtube,
    social: (platform) => {
      const adapter = social.get(platform)!;
      return {
        platform,
        mock: false,
        post: async (request) => {
          const failure = failures.get(request.event);
          if (failure) throw failure;
          return adapter.post(request);
        },
      };
    },
    runCommand: async () => undefined,
    env: { ...ENV, ...options.env },
    now: () => clock.now,
    log: (line) => void lines.push(line),
  };
  const run = (extra: { dryRun?: boolean } = {}) => runAutopilot({ root, deps, ...extra });
  const moveTo = (id: string, minutes = 1) => {
    clock.now = new Date(at(id) + minutes * 60_000);
  };
  return { dir, root, calendar, at, clock, youtube, tiktok, social, failures, lines, publishCalls, run, moveTo };
}

describe('release autopilot', () => {
  it('posts nothing before the approval and stops again after a revoke', async () => {
    const t = await setup();
    t.moveTo('announce:x');
    expect((await t.run()).projects[0]).toMatchObject({ approved: false, acted: [] });
    await approveRelease(t.dir, { root: t.root, now: t.clock.now });
    await revokeApproval(t.dir);
    expect((await t.run()).projects[0]!.acted).toEqual([]);
    expect(t.social.get('x')!.calls).toEqual([]);
  });

  it('tells the user after a withdrawal that a scheduled upload still goes public', async () => {
    const t = await setup();
    await approveRelease(t.dir, { root: t.root, now: new Date(t.at('distributor')) });
    await appendAutopilotEntry(t.dir, { event: 'youtube', status: 'scheduled', remote_id: 'abcdefghijk', publish_at: '2026-12-11T17:00:00.000Z', at: t.clock.now.toISOString() });
    await revokeApproval(t.dir);
    const youtube = (await boardProject(t.dir, t.root, { now: t.clock.now })).autopilot.events['youtube']!;
    expect(youtube).toMatchObject({ state: 'pending', needsUser: true });
    expect(youtube.manualSteps[0]).toMatch(/still makes it public at 2026-12-11T17:00:00.000Z.*studio\.youtube\.com\/video\/abcdefghijk/);
  });

  it('posts a meme as a YouTube Short, a TikTok, and an Instagram Reel', async () => {
    const credit = 'Boom by Jane Doe (CC BY 4.0)';
    const t = await setup({ meme: { licence: 'cc-by', credit } });
    await approveRelease(t.dir, { root: t.root, now: new Date(t.at('youtube')) });
    t.moveTo('youtube');
    await t.run();
    expect(t.publishCalls.map((call) => call.platform).sort()).toEqual(['tiktok', 'youtube']);
    // The uploads carry the release caption with the credit, not just the folder's text.
    expect(youtubeDescription(t.youtube.calls.find((call) => call.item.name === 'main')!.item)).toContain(credit);
    expect(tiktokCaption(t.tiktok.calls.find((call) => call.item.name === 'main')!.item)).toContain(credit);
    t.moveTo('instagram');
    await t.run();
    const reel = t.social.get('instagram')!.calls.find((call) => call.event === 'instagram')!;
    expect(reel).toMatchObject({ placement: 'reel' });
    expect(reel.text).toContain('He printed the report anyway.');
    expect(reel.text).toContain(credit);
    expect(reel.media?.path).toMatch(/video\/office-prank-9x16\.mp4$/);
  });

  it('runs a whole release: announcement, uploads ahead, posts after the video is public, the links step', async () => {
    const t = await setup();
    await approveRelease(t.dir, { root: t.root, now: new Date(t.at('distributor')) });

    // A week before: the announcement on X with the teaser, and the story with the dated image.
    t.moveTo('announce:x');
    await t.run();
    const announceX = t.social.get('x')!.calls[0]!;
    expect(announceX).toMatchObject({ event: 'announce:x', text: expect.stringContaining('Freitag: Neon Rain.') });
    expect(announceX.media?.path).toMatch(/announce\/teaser-9x16\.mp4$/);
    t.moveTo('announce:instagram');
    await t.run();
    expect(t.social.get('instagram')!.calls[0]).toMatchObject({ event: 'announce:instagram', placement: 'story' });
    expect(t.social.get('instagram')!.calls[0]!.media?.path).toMatch(/announce\/story-9x16\.jpg$/);
    let status = await loadStatus(t.dir);
    expect(status.items['announce:x']).toMatchObject({ done: true, by: 'autopilot', url: expect.stringContaining('x.com') });

    // The day before 18:00: the main video goes up, privately (no audited API project).
    t.clock.now = new Date(t.at('youtube') - 23 * 3_600_000);
    await t.run();
    expect(t.publishCalls).toContainEqual({ platform: 'youtube', only: 'main', schedule: undefined });
    const board = await boardProject(t.dir, t.root, { now: t.clock.now });
    expect(board.autopilot.events.youtube).toMatchObject({ state: 'pending', needsUser: true });
    expect(board.autopilot.events.youtube!.manualSteps.join(' ')).toContain('Premiere');

    // Release time: the X post waits for the public video; the first Short goes up.
    t.moveTo('youtube', 2);
    await t.run();
    expect(t.social.get('x')!.calls.map((call) => call.event)).toEqual(['announce:x']);
    expect((await boardProject(t.dir, t.root, { now: t.clock.now })).autopilot.events.x).toMatchObject({ state: 'blocked', block: 'youtube' });

    // The user starts the Premiere in Studio; the next round sees it public and posts what links to it.
    const log = await loadAutopilotLog(t.dir);
    const videoId = log.entries.find((entry) => entry.event === 'youtube' && entry.remote_id)!.remote_id!;
    t.youtube.statuses.set(videoId, { privacyStatus: 'public', uploadStatus: 'processed' });
    t.moveTo('x', 5);
    await t.run();
    status = await loadStatus(t.dir);
    expect(status.items.youtube).toMatchObject({ done: true, by: 'autopilot' });
    const releasePost = t.social.get('x')!.calls.find((call) => call.event === 'x')!;
    expect(releasePost.reply).toContain(`https://youtu.be/${videoId}`);
    expect(t.youtube.videoCalls).toContainEqual({ method: 'postComment', videoId, text: 'Welcher Moment ist eurer?' });

    // The Reel of the first Short at its slot, with its cover frame.
    t.moveTo('short:Z1-intro:instagram');
    await t.run();
    expect(t.social.get('instagram')!.calls.find((call) => call.event === 'short:Z1-intro:instagram')).toMatchObject({ placement: 'reel', coverOffsetMs: 1500 });

    // TikTok lands as a draft: that one is yours.
    t.moveTo('short:Z1-intro:tiktok');
    await t.run();
    expect((await boardProject(t.dir, t.root, { now: t.clock.now })).autopilot.events['short:Z1-intro:tiktok']).toMatchObject({ state: 'pending', needsUser: true });

    // The day after: the links step waits for the Spotify link, then appends it.
    t.moveTo('links');
    await t.run();
    expect((await boardProject(t.dir, t.root, { now: t.clock.now })).autopilot.events.links).toMatchObject({ state: 'blocked', block: 'spotify' });
    await updateStatus(t.dir, 'song', { done: true, url: 'https://open.spotify.com/track/abc' }, t.clock.now);
    t.moveTo('links', 10);
    await t.run();
    expect(t.youtube.videoCalls).toContainEqual({ method: 'appendToDescription', videoId, text: '🎧 Spotify: https://open.spotify.com/track/abc' });
    expect((await loadStatus(t.dir)).items.links).toMatchObject({ done: true, by: 'autopilot' });
  });

  it('retries a failure, asks the user after an uncertain one, and leaves taken-over posts alone', async () => {
    const t = await setup();
    await approveRelease(t.dir, { root: t.root, now: new Date(t.at('distributor')) });
    t.failures.set('announce:x', new PublishError('HTTP 500'));
    t.moveTo('announce:x');
    await t.run();
    expect((await boardProject(t.dir, t.root, { now: t.clock.now })).autopilot.events['announce:x']).toMatchObject({ state: 'waiting', attempts: 1, error: 'HTTP 500' });
    t.failures.set('announce:x', markUncertain(new PublishError('X answered HTTP 503; the post may exist anyway.')) as Error);
    t.moveTo('announce:x', 15);
    await t.run();
    expect((await boardProject(t.dir, t.root, { now: t.clock.now })).autopilot.events['announce:x']).toMatchObject({ state: 'stuck', needsUser: true });
    // The user checked X: not there. Try again.
    t.failures.delete('announce:x');
    await retryEvent(t.dir, 'announce:x', t.clock.now);
    await t.run();
    expect((await loadStatus(t.dir)).items['announce:x']).toMatchObject({ done: true });

    await setEventManual(t.dir, 'announce:instagram', true);
    t.moveTo('announce:instagram');
    await t.run();
    expect(t.social.get('instagram')!.calls).toEqual([]);
  });

  it('treats a missing credential as a blocked post and a missed post as the user\'s call', async () => {
    const t = await setup({ env: { X_REFRESH_TOKEN: '' } });
    await approveRelease(t.dir, { root: t.root, now: new Date(t.at('distributor')) });
    t.moveTo('announce:x');
    await t.run();
    expect((await boardProject(t.dir, t.root, { now: t.clock.now })).autopilot.events['announce:x']).toMatchObject({ state: 'blocked', block: 'credentials' });
    // The computer was off for a day: the story is missed, and goes out only on "post now".
    t.moveTo('announce:instagram', 26 * 60);
    await t.run();
    expect((await boardProject(t.dir, t.root, { now: t.clock.now })).autopilot.events['announce:instagram']).toMatchObject({ state: 'missed', needsUser: true });
    await retryEvent(t.dir, 'announce:instagram', t.clock.now, true);
    await t.run();
    expect(t.social.get('instagram')!.calls.map((call) => call.event)).toEqual(['announce:instagram']);
  });

  it('asks again when the release day moved after the approval', async () => {
    const t = await setup();
    await approveRelease(t.dir, { root: t.root, now: new Date(t.at('distributor')) });
    const path = join(t.dir, 'project.yaml');
    const config = parse(await readFile(path, 'utf8'));
    config.release.release_date = '2026-12-18';
    await writeFile(path, stringify(config));
    await buildRelease({ projectDir: t.dir, deps: fakeDeps() });
    const moved = (await loadCalendar(t.dir))!;
    t.clock.now = new Date(Date.parse(moved.events.find((event) => event.id === 'announce:x')!.at) + 60_000);
    expect((await t.run()).projects[0]!.approved).toBe(false);
    expect(t.social.get('x')!.calls).toEqual([]);
    expect((await boardProject(t.dir, t.root, { now: t.clock.now })).autopilot).toMatchObject({ approvalStale: true });
    expect(t.lines.join('\n')).toContain('approve it again');
  });

  it('posts the pinned comment once when the user ticks the main video off first', async () => {
    const t = await setup();
    await approveRelease(t.dir, { root: t.root, now: new Date(t.at('distributor')) });
    t.clock.now = new Date(t.at('youtube') - 23 * 3_600_000);
    await t.run();
    const videoId = (await loadAutopilotLog(t.dir)).entries.find((entry) => entry.event === 'youtube' && entry.remote_id)!.remote_id!;
    // The user starts the Premiere and ticks the video off on the board, before a round saw it public.
    t.youtube.statuses.set(videoId, { privacyStatus: 'public', uploadStatus: 'processed' });
    await updateStatus(t.dir, 'youtube', { done: true, url: `https://youtu.be/${videoId}`, by: 'user' }, t.clock.now);
    t.moveTo('youtube', 3);
    await t.run();
    await t.run();
    const comments = t.youtube.videoCalls.filter((call) => call.method === 'postComment');
    expect(comments).toEqual([{ method: 'postComment', videoId, text: 'Welcher Moment ist eurer?' }]);
  });

  it('asks the user after a TikTok post that may have gone out, and never posts it again by itself', async () => {
    const t = await setup({ env: { TIKTOK_DIRECT_POST: '1' } });
    await approveRelease(t.dir, { root: t.root, now: new Date(t.at('distributor')) });
    let calls = 0;
    Object.defineProperty(t.tiktok, 'publish', {
      value: () => {
        calls += 1;
        return Promise.reject(markUncertain(new PublishError('TikTok status query failed: fetch failed')));
      },
    });
    t.moveTo('short:Z1-intro:tiktok');
    await t.run();
    t.moveTo('short:Z1-intro:tiktok', 15);
    await t.run();
    expect(calls).toBe(1);
    expect((await boardProject(t.dir, t.root, { now: t.clock.now })).autopilot.events['short:Z1-intro:tiktok']).toMatchObject({ state: 'stuck', needsUser: true });
  });

  it('records a direct TikTok post that is still processing as live, without an inbox step', async () => {
    const t = await setup({ env: { TIKTOK_DIRECT_POST: '1' } });
    await approveRelease(t.dir, { root: t.root, now: new Date(t.at('distributor')) });
    await runAutopilot({
      root: t.root,
      deps: {
        publish: async () =>
          ({ plan: { steps: [] }, manualSteps: [], entries: [{ platform: 'tiktok', item: 'Z1-intro', file: 'x', file_hash: 'a'.repeat(64), status: 'processing', remote_id: 'p1', mock: false, warnings: ['TikTok was still processing the post; it goes live once done.'], at: 'now' }] }) as never,
        youtube: () => t.youtube,
        social: () => new MockSocialAdapter('x'),
        env: { ...ENV, TIKTOK_DIRECT_POST: '1' },
        now: () => new Date(t.at('short:Z1-intro:tiktok') + 60_000),
        log: () => undefined,
      },
      project: 'neon',
    });
    const log = await loadAutopilotLog(t.dir);
    expect(log.entries.filter((entry) => entry.event === 'short:Z1-intro:tiktok').map((entry) => entry.status)).toEqual(['running', 'posted']);
    expect(log.entries.find((entry) => entry.event === 'short:Z1-intro:tiktok' && entry.status === 'posted')!.manual_steps).toEqual([]);
    expect((await loadStatus(t.dir)).items['short:Z1-intro:tiktok']).toMatchObject({ done: true, by: 'autopilot' });
  });

  it('treats X without its client secret as not set up', async () => {
    const t = await setup({ env: { X_CLIENT_SECRET: '' } });
    await approveRelease(t.dir, { root: t.root, now: new Date(t.at('distributor')) });
    t.moveTo('announce:x');
    expect((await boardProject(t.dir, t.root, { now: t.clock.now })).autopilot.events['announce:x']).toMatchObject({ state: 'blocked', block: 'credentials' });
  });

  it('writes nothing on a dry run and keeps a second run out while one holds the lock', async () => {
    const t = await setup();
    await approveRelease(t.dir, { root: t.root, now: new Date(t.at('distributor')) });
    t.moveTo('announce:x');
    const dry = await t.run({ dryRun: true });
    expect(dry.projects[0]!.acted.map((item) => item.id)).toContain('announce:x');
    expect((await loadAutopilotLog(t.dir)).entries).toEqual([]);
    expect(t.social.get('x')!.calls).toEqual([]);
    await mkdir(join(t.root, '.cache'), { recursive: true });
    await writeFile(join(t.root, '.cache', 'release-run.lock'), JSON.stringify({ pid: process.pid }));
    expect((await t.run()).locked).toBe(true);
    // A lock caught before its holder wrote its PID is held, not taken over.
    await writeFile(join(t.root, '.cache', 'release-run.lock'), '');
    expect((await t.run()).locked).toBe(true);
    // The lock of a process that died is taken over.
    await writeFile(join(t.root, '.cache', 'release-run.lock'), JSON.stringify({ pid: 2 ** 22 + 12345 }));
    expect((await t.run()).locked).toBeUndefined();
  });

  it('fixes a proposed release day in project.yaml on approval, keeping its comments', async () => {
    const t = await setup();
    const path = join(t.dir, 'project.yaml');
    const config = parse(await readFile(path, 'utf8'));
    delete config.release.release_date;
    await writeFile(path, `# my project\n${stringify(config)}`);
    await buildRelease({ projectDir: t.dir, deps: fakeDeps() });
    const proposed = (await loadCalendar(t.dir))!;
    expect(proposed.proposed).toBe(true);
    const handler = boardHandler({ root: t.root, refresh: async () => undefined });
    const response = await call(handler, 'POST', '/api/projects/neon/approve', { release_date: proposed.release_date });
    expect(response.status).toBe(200);
    const text = await readFile(path, 'utf8');
    expect(text.startsWith('# my project')).toBe(true);
    expect(parse(text).release.release_date).toBe(proposed.release_date);
    expect((await loadCalendar(t.dir))!.proposed).toBe(false);
    expect((await loadStatus(t.dir)).approval?.release_date).toBe(proposed.release_date);
    // A board on an old page cannot approve another day than the calendar holds.
    const stale = await call(handler, 'POST', '/api/projects/neon/approve', { release_date: '2030-01-04' });
    expect(stale.status).toBe(400);
    const takeover = await call(handler, 'POST', '/api/projects/neon/autopilot', { id: 'x', action: 'manual' });
    expect(JSON.parse(takeover.body).autopilot.events.x.state).toBe('manual');
  });

  it('refuses writes from any page but the board itself', async () => {
    const t = await setup();
    const handler = boardHandler({ root: t.root, refresh: async () => undefined });
    // A foreign page's simple POST (no preflight): text/plain, its own origin.
    const foreign = await call(handler, 'POST', '/api/projects/neon/approve', '{}', { host: '127.0.0.1:4848', origin: 'https://evil.example', 'content-type': 'text/plain' });
    expect(foreign.status).toBe(403);
    expect((await call(handler, 'POST', '/api/projects/neon/approve', {}, { host: '127.0.0.1:4848', 'content-type': 'text/plain' })).status).toBe(403);
    expect((await call(handler, 'POST', '/api/projects/neon/approve', {}, { ...BOARD_HEADERS, origin: 'http://127.0.0.1:9999' })).status).toBe(403);
    // DNS rebinding: a foreign host name that resolves to 127.0.0.1.
    expect((await call(handler, 'POST', '/api/projects/neon/approve', {}, { ...BOARD_HEADERS, host: 'evil.example:4848', origin: 'http://evil.example:4848' })).status).toBe(403);
    expect((await call(handler, 'POST', '/api/projects/neon/approve', {}, { ...BOARD_HEADERS, 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await loadStatus(t.dir)).approval).toBeUndefined();
    expect((await call(handler, 'POST', '/api/projects/neon/approve', {})).status).toBe(200);
  });
});

describe('release timer', () => {
  it('runs one short script from the Windows Task Scheduler under WSL, with the installing Node on PATH', () => {
    const plan = timerPlan({ root: "/home/me/it's my video", kind: 'windows-task', env: { WSL_DISTRO_NAME: 'Ubuntu' }, home: '/home/me', nodeBin: '/home/me/.nvm/versions/node/v24/bin', everyMinutes: 10 });
    expect(plan.install[0]!.slice(0, 9)).toEqual(['schtasks.exe', '/Create', '/F', '/SC', 'MINUTE', '/MO', '10', '/TN', 'coreslopper-release-run']);
    expect(plan.install[0]!.at(-1)).toBe('conhost.exe --headless wsl.exe -d Ubuntu -- /bin/bash /home/me/.coreslopper/release-run.sh');
    const script = plan.files[0]!;
    expect(script).toMatchObject({ path: '/home/me/.coreslopper/release-run.sh', mode: 0o755 });
    expect(script.content).toContain(`export PATH='/home/me/.nvm/versions/node/v24/bin':"$PATH"`);
    expect(script.content).toContain('export CORESLOPPER_TIMER_EVERY=10');
    expect(script.content).toContain(`cd '/home/me/it'\\''s my video' || exit 1`);
    expect(script.content).toContain('npm run --silent cli -- watch >> .cache/watch.log 2>&1');
    expect(() => timerPlan({ root: '/w', kind: 'windows-task', env: { WSL_DISTRO_NAME: 'Ubuntu' }, home: `/home/${'x'.repeat(250)}` })).toThrow(/261/);
  });

  it('writes a systemd user timer and a launchd agent around the same script', () => {
    const systemd = timerPlan({ root: '/w', kind: 'systemd', home: '/home/me', everyMinutes: 10, nodeBin: '/usr/bin' });
    expect(systemd.files.map((file) => file.path)).toEqual([
      '/home/me/.coreslopper/release-run.sh',
      '/home/me/.config/systemd/user/coreslopper-release-run.service',
      '/home/me/.config/systemd/user/coreslopper-release-run.timer',
    ]);
    expect(systemd.files[1]!.content).toContain('ExecStart=/bin/bash /home/me/.coreslopper/release-run.sh');
    expect(systemd.files[2]!.content).toContain('OnUnitActiveSec=10min');
    const launchd = timerPlan({ root: '/w', kind: 'launchd', home: '/Users/me', nodeBin: '/opt/homebrew/bin' });
    expect(launchd.files[1]!.content).toContain('<integer>300</integer>');
    expect(launchd.files[1]!.content).toContain('<string>/Users/me/.coreslopper/release-run.sh</string>');
    expect(() => timerPlan({ root: '/w', kind: 'systemd', everyMinutes: 0 })).toThrow(/minutes/);
  });
});

/** What the board page sends with a write. */
const BOARD_HEADERS = { host: '127.0.0.1:4848', origin: 'http://127.0.0.1:4848', 'content-type': 'application/json' };

async function call(handler: ReturnType<typeof boardHandler>, method: string, url: string, body?: unknown, headers: Record<string, string> = BOARD_HEADERS) {
  const { Readable } = await import('node:stream');
  const req = Readable.from(body === undefined ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]) as unknown as import('node:http').IncomingMessage;
  Object.assign(req, { method, url, headers });
  let status = 0;
  let text = '';
  const res = {
    writeHead: (code: number) => {
      status = code;
      return res;
    },
    setHeader: () => undefined,
    end: (chunk?: string | Buffer) => {
      text += chunk ? chunk.toString() : '';
    },
  } as unknown as import('node:http').ServerResponse;
  await handler(req, res);
  return { status, body: text };
}

void existsSync;
