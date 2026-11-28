import { afterEach, describe, expect, it, vi } from 'vitest';

// The release reads config/channel.yaml of the repo it runs in; a workspace's
// own channel must not change these results.
vi.mock('@coreslopper/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@coreslopper/core')>()),
  loadChannel: async () => undefined,
}));
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MicrositeSongSchema } from '../packages/core/src/index.ts';
import { buildRelease } from '../packages/cli/src/release.ts';
import { cleanupFixtures, fakeDeps, fixture, shortEpisodeFixture } from './helpers/release-fixture.ts';

afterEach(cleanupFixtures);

/** The microsite data of the release folder, checked against its published schema. */
async function micrositeOf(dir: string, slug: string) {
  const raw: unknown = JSON.parse(await readFile(join(dir, 'renders', 'release', 'microsite', `${slug}.json`), 'utf8'));
  return MicrositeSongSchema.parse(raw);
}

describe('the microsite data names the video aspect', () => {
  it("names a short episode's 9:16 aspect and shows its cover as the image", async () => {
    const { dir, root } = await shortEpisodeFixture();

    await buildRelease({ projectDir: dir, root, deps: fakeDeps(), render: false });

    const site = await micrositeOf(dir, 'demo-episode');
    expect(site.aspect).toBe('9:16');
    expect(site.images.thumbnail).toBe('cover/demo-episode-1080x1920.jpg');
    expect(site.images.cover).toBe('cover/demo-episode-1080x1920.jpg');
  });

  it("names a music video's 16:9 aspect and keeps its first thumbnail as the image", async () => {
    const dir = await fixture();

    await buildRelease({ projectDir: dir, deps: fakeDeps() });

    const site = await micrositeOf(dir, 'neon');
    expect(site.aspect).toBe('16:9');
    expect(site.images.thumbnail).toBe('thumbnails/thumb-1.jpg');
  });

  it('still validates microsite data written without an aspect', () => {
    const older = {
      version: 1,
      slug: 'neon',
      title: 'Neon Rain',
      language: 'en',
      images: { cover: 'streaming/cover-3000x3000.jpg', thumbnail: 'thumbnails/thumb-1.jpg', shorts: [] },
      links: {},
      shorts: [],
      profiles: {},
      disclosure: 'Song and video were made with AI.',
      credits: [],
    };

    const parsed = MicrositeSongSchema.parse(older);

    expect(parsed.aspect).toBeUndefined();
    expect(parsed.version).toBe(1);
  });

  it('rejects an aspect outside the release formats', () => {
    const result = MicrositeSongSchema.safeParse({ version: 1, slug: 'neon', title: 'Neon', language: 'en', images: { shorts: [] }, aspect: '21:9', links: {}, shorts: [], profiles: {}, disclosure: '', credits: [] });
    expect(result.success).toBe(false);
  });
});
