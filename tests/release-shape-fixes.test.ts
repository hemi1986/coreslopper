import { afterEach, describe, expect, it, vi } from 'vitest';

// The release reads config/channel.yaml of the repo it runs in; a workspace's
// own channel must not change these results.
vi.mock('@coreslopper/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@coreslopper/core')>()),
  loadChannel: async () => undefined,
}));
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { MockPublisher, MockSocialAdapter, type SocialPlatform } from '../packages/providers/src/index.ts';
import { UploadDataSchema } from '../packages/core/src/index.ts';
import { buildRelease, runRelease } from '../packages/cli/src/release.ts';
import { loadCalendar } from '../packages/cli/src/release-calendar.ts';
import { releaseChecks } from '../packages/cli/src/release-qa.ts';
import { publishProject } from '../packages/cli/src/publish.ts';
import { approveRelease, loadAutopilotLog, runAutopilot, type AutopilotDeps } from '../packages/cli/src/release-autopilot.ts';
import { autopilotView } from '../packages/cli/src/release-board-data.ts';
import { loadReleaseFacts } from '../packages/cli/src/release-facts.ts';
import {
  cleanupFixtures,
  episodeFixture,
  episodeUploadYaml,
  fakeDeps,
  fixture,
  fixtureProbe,
  shortEpisodeFixture,
  shortEpisodeUploadYaml,
  uploadYaml,
} from './helpers/release-fixture.ts';

afterEach(async () => {
  vi.unstubAllEnvs();
  await cleanupFixtures();
});

const post = (result: Awaited<ReturnType<typeof buildRelease>>, id: string) => result.manifest.plan!.posts.find((entry) => entry.id === id)!;

describe('the announcement story caption', () => {
  it('is announcement.story, not the announcement text', async () => {
    const dir = await fixture();
    const result = await buildRelease({ projectDir: dir, deps: fakeDeps() });

    expect(post(result, 'announce:instagram').texts.caption).toMatchObject({ value: 'Bald: Neon Rain', limit: { max: 120 } });
  });

  it('lets an announcement text over 120 characters through', async () => {
    const dir = await fixture();
    const upload = uploadYaml();
    await writeFile(join(dir, 'review', 'upload.yaml'), stringify({ ...upload, announcement: { text: 'x'.repeat(150), hashtags: ['#synthwave'] } }));

    const result = await runRelease({ projectDir: dir, deps: fakeDeps({ log: () => undefined }) });

    expect(result?.errors).toEqual([]);
    expect(post(result!, 'announce:instagram').texts.caption).toBeUndefined();
  });

  it('breaks a rule when announcement.story is over 120 characters', async () => {
    const dir = await fixture();
    const upload = uploadYaml();
    await writeFile(join(dir, 'review', 'upload.yaml'), stringify({ ...upload, announcement: { ...upload.announcement, story: 'x'.repeat(121) } }));

    const run = runRelease({ projectDir: dir, deps: fakeDeps({ log: () => undefined }) });

    await expect(run).rejects.toMatchObject({ details: expect.arrayContaining(['announcement story: caption has 121 characters, limit 120']) });
  });
});

describe('texts the release does not use', () => {
  it('QA warns about a story caption on a Short the release-day story does not show', async () => {
    const dir = await fixture();
    const upload = uploadYaml();
    upload.shorts[1]!.instagram = { ...upload.shorts[1]!.instagram, story: 'Teil 2 in der Story' } as typeof upload.shorts[1]['instagram'];
    await writeFile(join(dir, 'review', 'upload.yaml'), stringify(upload));
    await buildRelease({ projectDir: dir, deps: fakeDeps() });

    const checks = await releaseChecks(dir, fixtureProbe(), { root: join(dir, '..', '..') });

    const unused = checks.find((entry) => entry.name === 'Release unused texts');
    expect(unused).toMatchObject({ result: 'WARN', evidence: expect.stringContaining('shorts.Z2-chorus.instagram.story') });
    expect(unused!.evidence).toContain('shows Z1-intro');
    expect(unused!.evidence).not.toContain('Z1-intro.instagram.story');
  });

  it('QA has no warning when only the shown Short carries a story caption', async () => {
    const dir = await fixture();
    await buildRelease({ projectDir: dir, deps: fakeDeps() });

    const checks = await releaseChecks(dir, fixtureProbe(), { root: join(dir, '..', '..') });

    expect(checks.find((entry) => entry.name === 'Release unused texts')).toBeUndefined();
  });

  it('QA warns about instagram_post when the main video lasts over 3 minutes', async () => {
    const { dir, root } = await episodeFixture({ seconds: 200 });
    await writeFile(join(dir, 'review', 'upload.yaml'), stringify({ ...episodeUploadYaml(), instagram_post: { caption: 'Die ganze Folge.', hashtags: [] } }));
    await buildRelease({ projectDir: dir, root, deps: fakeDeps(), render: false });

    const checks = await releaseChecks(dir, fixtureProbe(), { root });

    expect(checks.find((entry) => entry.name === 'Release unused texts')).toMatchObject({ result: 'WARN', evidence: expect.stringContaining('instagram_post') });
  });
});

describe('a Short named main', () => {
  it('is invalid upload data', () => {
    const upload = uploadYaml();
    upload.shorts[0]!.name = 'main';

    const parsed = UploadDataSchema.safeParse(upload);

    expect(parsed.success).toBe(false);
    expect(parsed.error!.issues.map((issue) => issue.message)).toContain('a Short may not be named "main": main is the main video');
  });
});

describe('an episode without a built episode track', () => {
  it('gets the TODO that its release shape is provisional', async () => {
    const { dir, root } = await episodeFixture();
    await rm(join(dir, 'timing.json'), { force: true });

    const result = await buildRelease({ projectDir: dir, root, deps: fakeDeps(), render: false });

    expect(result.manifest.shape).toBe('episode');
    expect(result.todos.some((todo) => todo.startsWith('timing.json is missing: the release shape (episode) is provisional'))).toBe(true);
  });

  it('has no such TODO once the track exists', async () => {
    const { dir, root } = await episodeFixture();

    const result = await buildRelease({ projectDir: dir, root, deps: fakeDeps(), render: false });

    expect(result.todos.some((todo) => todo.includes('provisional'))).toBe(false);
  });
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
  INSTAGRAM_ACCESS_TOKEN: 'ig',
  INSTAGRAM_USER_ID: '1',
  INSTAGRAM_TOKEN_EXPIRES_AT: '2027-06-01T00:00:00Z',
};

describe('a short episode in publish and the autopilot', () => {
  it('publishes only its one video, reaches TikTok without tiktok in main.platforms, and gets no Premiere step or pinned comment', async () => {
    for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value);
    const { dir, root } = await shortEpisodeFixture();
    // Left over from an episode release: a cut Short, a pinned comment, and main.platforms without tiktok.
    const short = { name: 'E1-hook', file: 'renders/shorts/E1-hook-9x16.mp4', title: 'Hook #shorts', description: 'Der Anfang.', hashtags: ['#shorts'], platforms: ['youtube', 'tiktok'] };
    const upload = shortEpisodeUploadYaml();
    await writeFile(join(dir, 'review', 'upload.yaml'), stringify({ ...upload, main: { ...upload.main, pinned_comment: 'Was hättet ihr geantwortet?' }, shorts: [short] }));
    await buildRelease({ projectDir: dir, root, deps: fakeDeps(), render: false });
    const calendar = (await loadCalendar(dir))!;
    const at = (id: string) => Date.parse(calendar.events.find((event) => event.id === id)!.at);
    const clock = { now: new Date(at('youtube') - 24 * 3_600_000) };
    const youtube = new MockPublisher('youtube');
    const tiktok = new MockPublisher('tiktok');
    const social = new Map<SocialPlatform, MockSocialAdapter>(['x', 'linkedin', 'instagram'].map((platform) => [platform as SocialPlatform, new MockSocialAdapter(platform as SocialPlatform)]));
    const publishCalls: { platform?: string; only?: string }[] = [];
    const deps: Partial<AutopilotDeps> = {
      publish: (options) => {
        publishCalls.push({ platform: options.platform, only: options.only });
        return publishProject({ ...options, adapters: { youtube, tiktok }, probe: () => ({ width: 1080, height: 1920, duration: 22 }) });
      },
      youtube: () => youtube,
      social: (platform) => social.get(platform)!,
      runCommand: async () => undefined,
      env: ENV,
      now: () => clock.now,
      log: () => undefined,
    };
    await approveRelease(dir, { root, now: clock.now });

    for (const id of ['youtube', 'tiktok']) {
      clock.now = new Date(Math.max(clock.now.getTime(), at(id) + 60_000));
      await runAutopilot({ root, deps });
    }

    expect(publishCalls.map((call) => call.platform).sort()).toEqual(['tiktok', 'youtube']);
    expect(youtube.calls.map((call) => call.item.name)).toEqual(['main']);
    expect(tiktok.calls.map((call) => call.item.name)).toEqual(['main']);
    const view = await autopilotView(await loadReleaseFacts(dir, root), { now: clock.now });
    expect(view.events.youtube!.manualSteps.join(' ')).not.toContain('Premiere');

    // The Short goes public: the autopilot posts no pinned comment under it.
    const videoId = (await loadAutopilotLog(dir)).entries.find((entry) => entry.event === 'youtube' && entry.remote_id)!.remote_id!;
    youtube.statuses.set(videoId, { privacyStatus: 'public', uploadStatus: 'processed' });
    clock.now = new Date(at('x') + 5 * 60_000);
    await runAutopilot({ root, deps });
    expect(youtube.videoCalls.filter((call) => call.method === 'postComment')).toEqual([]);
  });
});
