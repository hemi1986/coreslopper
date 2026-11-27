import { afterEach, describe, expect, it, vi } from 'vitest';

// The release reads config/channel.yaml of the repo it runs in; a workspace's
// own channel must not change these results.
vi.mock('@coreslopper/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@coreslopper/core')>()),
  loadChannel: async () => undefined,
}));
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { ReleaseCalendarSchema } from '../packages/core/src/index.ts';
import { buildRelease, runRelease } from '../packages/cli/src/release.ts';
import { releaseChecks } from '../packages/cli/src/release-qa.ts';
import { cleanupFixtures, diskTree, fakeDeps, fixtureProbe, shortEpisodeFixture, shortEpisodeUploadYaml } from './helpers/release-fixture.ts';

afterEach(cleanupFixtures);

const release = (dir: string) => join(dir, 'renders', 'release');
/** The short episode's upload data with an announcement a week before. */
async function announce(dir: string): Promise<void> {
  await writeFile(join(dir, 'review', 'upload.yaml'), stringify({ ...shortEpisodeUploadYaml(), announcement: { text: 'Freitag: After Midnight.', hashtags: ['#nightdesk'] } }));
}

/** The text files of the release folder, by name. */
async function textsOf(dir: string): Promise<Record<string, string>> {
  const names = (await diskTree(join(release(dir), 'texts'))).sort();
  return Object.fromEntries(await Promise.all(names.map(async (name) => [name, await readFile(join(release(dir), 'texts', name), 'utf8')] as const)));
}

const calendarOf = async (dir: string) => ReleaseCalendarSchema.parse(parse(await readFile(join(dir, 'review', 'calendar.yaml'), 'utf8')));

describe('the release of a short episode', () => {
  it("ST-048: A short episode's folder holds one video and its covers", async () => {
    const { dir, root } = await shortEpisodeFixture();

    const result = await buildRelease({ projectDir: dir, root, deps: fakeDeps(), render: false });

    const files = await diskTree(release(dir));
    expect(files).toContain('video/demo-episode-9x16.mp4');
    expect(files).toContain('cover/demo-episode-1080x1920.jpg');
    expect(result.manifest.files.find((file) => file.kind === 'tiktok-cover')).toMatchObject({ path: 'cover/demo-episode-1080x1440.jpg', spec: { width: 1080, height: 1440 } });
    expect(files.filter((file) => file.startsWith('thumbnails/') || file.startsWith('shorts/'))).toEqual([]);
    expect(files.filter((file) => file.endsWith('.mp4'))).toEqual(['video/demo-episode-9x16.mp4']);
  });

  it('ST-048: A short episode is planned on five platforms on the release day', async () => {
    const { dir, root } = await shortEpisodeFixture();

    await buildRelease({ projectDir: dir, root, deps: fakeDeps(), render: false });

    const calendar = await calendarOf(dir);
    const ids = calendar.events.map((event) => event.id);
    expect([...ids].sort()).toEqual(['instagram', 'microsite', 'tiktok', 'x', 'youtube']);
    expect(calendar.events.every((event) => event.at.startsWith(calendar.release_date))).toBe(true);
    expect(ids).not.toContain('story');
    expect(ids).not.toContain('linkedin');
  });

  it("ST-048: A short episode's teaser is cut from its master", async () => {
    const { dir, root } = await shortEpisodeFixture();
    await announce(dir);
    const deps = fakeDeps();

    const result = await buildRelease({ projectDir: dir, root, deps, render: false });

    const teaser = result.manifest.files.find((file) => file.path === 'announce/teaser-9x16.mp4');
    expect(teaser?.source).toBe('renders/9x16.mp4');
    const cut = deps.ffmpegCalls.find((args) => args.at(-1)?.endsWith('teaser-9x16.mp4'));
    expect(cut?.[cut.indexOf('-i') + 1]).toBe(join(dir, 'renders', '9x16.mp4'));
    // Its announcement images are vertical: no 16:9 post image, and no release-day story image.
    expect(deps.thumbnails.map((image) => image.format)).toEqual(['9x16']);
    expect(await diskTree(release(dir))).not.toContain('announce/post-16x9.jpg');
  });

  it("cuts a 4:5 short episode's teaser from its 4:5 master", async () => {
    const { dir, root } = await shortEpisodeFixture();
    await announce(dir);
    const projectPath = join(dir, 'project.yaml');
    const config = parse(await readFile(projectPath, 'utf8')) as { formats: { master: Record<string, unknown> } };
    config.formats.master = { ...config.formats.master, aspect: '4:5', width: 1080, height: 1350 };
    await writeFile(projectPath, stringify(config));
    await rename(join(dir, 'renders', '9x16.mp4'), join(dir, 'renders', '4x5.mp4'));

    const result = await buildRelease({ projectDir: dir, root, deps: fakeDeps(), render: false });

    expect(result.manifest.shape).toBe('short-episode');
    expect(result.manifest.files.find((file) => file.path === 'announce/teaser-4x5.mp4')?.source).toBe('renders/4x5.mp4');
  });

  it('ST-048: A missing TikTok text is a TODO', async () => {
    const { dir, root } = await shortEpisodeFixture();
    const { tiktok: _, ...upload } = shortEpisodeUploadYaml();
    await writeFile(join(dir, 'review', 'upload.yaml'), stringify(upload));

    const result = await runRelease({ projectDir: dir, root, deps: fakeDeps(), render: false });

    expect(result?.manifest.plan?.problems.missing).toContain('tiktok');
    expect(result?.todos).toContain('tiktok is missing in review/upload.yaml');
    expect(result?.errors).toEqual([]);
  });
});

describe("a short episode's release plan", () => {
  it('posts its one video with a text per platform, and no main-video extras', async () => {
    const { dir, root } = await shortEpisodeFixture();

    const result = await buildRelease({ projectDir: dir, root, deps: fakeDeps(), render: false });

    const plan = result.manifest.plan!;
    expect(plan.posts.map((post) => post.id)).toEqual(['youtube', 'tiktok', 'instagram', 'x', 'microsite', 'announcement']);
    const post = (id: string) => plan.posts.find((entry) => entry.id === id)!;
    expect(post('youtube').texts.title?.value).toBe('After Midnight #shorts');
    expect(post('youtube').texts.description?.value).toBe('Eine Nachricht kurz vor Geschäftsschluss.\n\n#nightdesk #shorts');
    expect(post('youtube').texts.hashtags?.value).toBe('nightdesk, shorts');
    expect(post('youtube').texts.pinned).toBeUndefined();
    expect(post('youtube').files.map((file) => file.path)).toEqual(['video/demo-episode-9x16.mp4', 'cover/demo-episode-1080x1920.jpg']);
    expect(post('tiktok').texts.caption?.value).toBe('Kurz vor Geschäftsschluss kommt noch eine Nachricht.\n\n#nightdesk');
    expect(post('tiktok').files.map((file) => [file.role, file.path])).toEqual([
      ['video', 'video/demo-episode-9x16.mp4'],
      ['tiktok-cover', 'cover/demo-episode-1080x1440.jpg'],
    ]);
    expect(post('instagram').texts.caption?.value).toBe('Folge 1: die letzte Nachricht des Tages.\n\n#nightdesk');
    expect(post('x').media).toBe('video/demo-episode-9x16.mp4');
    expect(plan.premiere).toBe(false);
    expect(plan.problems).toEqual({ errors: [], missing: ['announcement'] });
    expect(Object.keys(await textsOf(dir))).toEqual(['instagram.md', 'release-plan.md', 'tiktok.md', 'x.md', 'youtube.md']);
  });

  it('is an error when the TikTok and Instagram captions are the same', async () => {
    const { dir, root } = await shortEpisodeFixture();
    const upload = shortEpisodeUploadYaml();
    await writeFile(join(dir, 'review', 'upload.yaml'), stringify({ ...upload, instagram: { caption: upload.tiktok.caption, hashtags: [] } }));

    const result = await buildRelease({ projectDir: dir, root, deps: fakeDeps(), render: false });

    expect(result.errors).toContain('the Instagram and TikTok captions are identical; write one per platform');
  });

  it('ignores the Shorts of the upload data', async () => {
    const { dir, root } = await shortEpisodeFixture();
    const short = { name: 'E1-hook', file: 'renders/shorts/E1-hook-9x16.mp4', title: 'Hook #shorts', description: 'Der Anfang.', hashtags: ['#shorts'] };
    await writeFile(join(dir, 'review', 'upload.yaml'), stringify({ ...shortEpisodeUploadYaml(), shorts: [short] }));

    const result = await buildRelease({ projectDir: dir, root, deps: fakeDeps(), render: false });

    expect(result.manifest.plan!.posts.filter((post) => post.id.startsWith('short:'))).toEqual([]);
    expect((await calendarOf(dir)).events.filter((event) => event.step === 'short')).toEqual([]);
  });

  it("QA reads the short episode's texts: no shorts.md is expected", async () => {
    const { dir, root } = await shortEpisodeFixture();
    await buildRelease({ projectDir: dir, root, deps: fakeDeps(), render: false });

    const checks = await releaseChecks(dir, fixtureProbe(), { root });

    const texts = checks.find((entry) => entry.name === 'Release texts')!;
    expect(texts.result).not.toBe('FAIL');
  });
});
