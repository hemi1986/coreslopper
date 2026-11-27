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
import { buildRelease } from '../packages/cli/src/release.ts';
import { cleanupFixtures, diskTree, fakeDeps, shortEpisodeFixture, shortEpisodeUploadYaml } from './helpers/release-fixture.ts';

afterEach(cleanupFixtures);

const release = (dir: string) => join(dir, 'renders', 'release');
/** The short episode's upload data with an announcement a week before. */
async function announce(dir: string): Promise<void> {
  await writeFile(join(dir, 'review', 'upload.yaml'), stringify({ ...shortEpisodeUploadYaml(), announcement: { text: 'Freitag: After Midnight.', hashtags: ['#nightdesk'] } }));
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
});
