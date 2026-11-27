import { afterEach, describe, expect, it, vi } from 'vitest';

// The release reads config/channel.yaml of the repo it runs in; a workspace's
// own channel must not change these results.
vi.mock('@coreslopper/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@coreslopper/core')>()),
  loadChannel: async () => undefined,
}));
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { buildRelease } from '../packages/cli/src/release.ts';
import { loadCalendar, runCalendar } from '../packages/cli/src/release-calendar.ts';
import { releaseChecks } from '../packages/cli/src/release-qa.ts';
import { checkReleaseAssets } from '../packages/cli/src/qa.ts';
import { cleanupFixtures, diskTree, episodeFixture, episodeUploadYaml, fakeDeps, fixtureProbe, jpeg, videoProbe } from './helpers/release-fixture.ts';

afterEach(cleanupFixtures);

const release = (dir: string) => join(dir, 'renders', 'release');
const shortsIn = (files: string[]) => files.filter((file) => file.startsWith('shorts/') && file.endsWith('.mp4'));

/** A horizontal episode of `seconds` whose 9:16 render lasts as long. */
async function horizontalEpisode(seconds: number) {
  const fixture = await episodeFixture({ horizontal: true, seconds });
  const deps = fakeDeps({}, { '9x16.mp4': videoProbe(1080, 1920, seconds) });
  return { ...fixture, deps };
}

/** Two Shorts cut from the episode, in `renders/shorts/`. */
async function cutShorts(dir: string): Promise<void> {
  await mkdir(join(dir, 'renders', 'shorts'), { recursive: true });
  for (const name of ['E1-hook', 'E1-twist']) {
    await writeFile(join(dir, 'renders', 'shorts', `${name}-9x16.mp4`), `short ${name}`);
    await writeFile(join(dir, 'renders', 'shorts', `${name}-thumb.jpg`), Buffer.concat([jpeg(1080, 1920), Buffer.from(name)]));
  }
}

describe('the vertical version of a horizontal episode up to 3 minutes', () => {
  it('ST-049: The vertical version is the one Short', async () => {
    const { dir, root, deps } = await horizontalEpisode(150);

    const result = await buildRelease({ projectDir: dir, root, deps, render: false });

    expect(shortsIn(await diskTree(release(dir)))).toEqual(['shorts/demo-episode-9x16.mp4']);
    const short = result.manifest.files.find((file) => file.path === 'shorts/demo-episode-9x16.mp4');
    expect(short).toMatchObject({ kind: 'short', source: 'renders/9x16.mp4' });
    expect((short?.spec.measured as { duration: number }).duration).toBe(150);
  });

  it('ST-049: Cut Shorts stay out of the folder', async () => {
    const { dir, root, deps } = await horizontalEpisode(150);
    await cutShorts(dir);

    const result = await buildRelease({ projectDir: dir, root, deps, render: false });

    expect(shortsIn(await diskTree(release(dir)))).toEqual(['shorts/demo-episode-9x16.mp4']);
    expect(result.manifest.files.filter((file) => file.kind === 'short').map((file) => file.path)).toEqual(['shorts/demo-episode-9x16.mp4']);
  });

  it('ST-049: The main video keeps its three thumbnails', async () => {
    const { dir, root, deps } = await horizontalEpisode(150);

    const result = await buildRelease({ projectDir: dir, root, deps, render: false });

    const youtube = result.manifest.plan!.posts.find((post) => post.id === 'youtube');
    // The upload thumbnail first, then its two alternates for YouTube's Test & compare.
    expect(youtube?.files.filter((file) => file.role === 'thumbnail' || file.role === 'alt').map((file) => file.path)).toEqual([
      'thumbnails/thumb-1.jpg',
      'thumbnails/thumb-2.jpg',
      'thumbnails/thumb-3.jpg',
    ]);
  });

  it('ST-049: A horizontal episode over 3 minutes keeps its cut Shorts', async () => {
    const { dir, root, deps } = await horizontalEpisode(200);
    await cutShorts(dir);

    await buildRelease({ projectDir: dir, root, deps, render: false });

    expect(shortsIn(await diskTree(release(dir)))).toEqual(['shorts/E1-hook-9x16.mp4', 'shorts/E1-twist-9x16.mp4']);
  });

  it('plans the same Short events in the calendar command as release, and none before the vertical version is placed', async () => {
    const { dir, root, deps } = await horizontalEpisode(150);
    await cutShorts(dir);
    const now = new Date('2026-11-28T08:00:00Z');
    const shortItems = (events: { platform: string; item: string }[]) => [...new Set(events.filter((event) => event.platform === 'shorts').map((event) => event.item))];

    const before = await runCalendar({ projectDir: dir, root, now, log: () => undefined });
    expect(shortItems(before.events)).toEqual([]);

    await buildRelease({ projectDir: dir, root, deps: { ...deps, now: () => now }, render: false });
    const planned = (await loadCalendar(dir))!;
    const again = await runCalendar({ projectDir: dir, root, now, log: () => undefined });

    expect(shortItems(planned.events)).toEqual(['demo-episode']);
    expect(again.events.map((event) => event.id)).toEqual(planned.events.map((event) => event.id));
  });

  it('builds the Shorts posts from the vertical version only, never from cut-Short entries left in upload.yaml', async () => {
    const { dir, root, deps } = await horizontalEpisode(150);
    const entry = (name: string, file: string) => ({
      name,
      file,
      title: `${name} #shorts`,
      description: `Short ${name}.`,
      hashtags: ['#nightdesk'],
      tiktok: { caption: `TikTok ${name}`, hashtags: ['#nightdesk'] },
      instagram: { caption: `Reel ${name}`, hashtags: ['#nightdesk'] },
    });
    await writeFile(
      join(dir, 'review', 'upload.yaml'),
      stringify({ ...episodeUploadYaml(), shorts: [entry('E1-hook', 'renders/9x16.mp4'), entry('demo-episode', 'renders/9x16.mp4')] }),
    );

    const result = await buildRelease({ projectDir: dir, root, deps, render: false });

    const shortPosts = result.manifest.plan!.posts.filter((post) => post.id.startsWith('short:'));
    expect(new Set(shortPosts.map((post) => post.id.split(':')[1]))).toEqual(new Set(['demo-episode']));
    expect(shortPosts.find((post) => post.id === 'short:demo-episode:youtube')?.texts.title?.value).toBe('demo-episode #shorts');
    expect(result.warnings.join('\n')).toContain('E1-hook ignored');
  });

  it("passes release QA's Release Shorts row for a horizontal episode of 150 s", async () => {
    const { dir, root, deps } = await horizontalEpisode(150);
    await writeFile(join(dir, 'renders', 'cover-1080x1920.jpg'), jpeg(1080, 1920));
    await buildRelease({ projectDir: dir, root, deps, render: false });

    const checks = await releaseChecks(dir, fixtureProbe({ 'demo-episode-9x16.mp4': videoProbe(1080, 1920, 150) }), { root });

    expect(checks.find((check) => check.name === 'Release Shorts')).toMatchObject({ result: 'PASS' });
  });

  it('gives no hint to cut Shorts for a horizontal episode up to 3 minutes', async () => {
    const { dir } = await horizontalEpisode(150);
    const paths = { root: dir, renders: join(dir, 'renders') };

    const { checks } = await checkReleaseAssets(paths, { shape: 'episode', master: { width: 1920, height: 1080 }, shorts: 'vertical-version' });

    expect(checks.find((check) => check.name === 'Shorts')).toMatchObject({ result: 'N/A' });
    expect(checks.find((check) => check.name === 'Short thumbnails')).toMatchObject({ result: 'N/A' });
  });
});
