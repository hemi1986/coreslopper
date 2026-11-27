import { afterEach, describe, expect, it, vi } from 'vitest';

// The release reads config/channel.yaml of the repo it runs in; a workspace's
// own channel must not change these results.
vi.mock('@coreslopper/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@coreslopper/core')>()),
  loadChannel: async () => undefined,
}));
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { ReleaseCalendarSchema } from '../packages/core/src/index.ts';
import { buildRelease } from '../packages/cli/src/release.ts';
import { cleanupFixtures, diskTree, fakeDeps, shortEpisodeFixture } from './helpers/release-fixture.ts';

afterEach(cleanupFixtures);

const release = (dir: string) => join(dir, 'renders', 'release');
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
});
