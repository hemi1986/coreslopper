import { afterEach, describe, expect, it, vi } from 'vitest';

// The release reads config/channel.yaml of the repo it runs in; a workspace's
// own channel must not change these results.
vi.mock('@coreslopper/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@coreslopper/core')>()),
  loadChannel: async () => undefined,
}));
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildRelease } from '../packages/cli/src/release.ts';
import { boardProject } from '../packages/cli/src/release-board-data.ts';
import { cleanupFixtures, fakeDeps, fixture } from './helpers/release-fixture.ts';

afterEach(cleanupFixtures);

const post = (result: Awaited<ReturnType<typeof buildRelease>>, id: string) => result.manifest.plan!.posts.find((entry) => entry.id === id)!;

describe('the stories of a release, as they are', () => {
  it('shows the story image and the first Short on the release-day story, with the link sticker', async () => {
    const dir = await fixture();
    const result = await buildRelease({ projectDir: dir, deps: fakeDeps() });

    expect(post(result, 'story').files.map((file) => [file.role, file.path])).toEqual([
      ['story-image', 'instagram/story-9x16.jpg'],
      ['video', 'shorts/Z1-intro-9x16.mp4'],
    ]);
    const board = await boardProject(dir, join(dir, '..', '..'));
    const story = board.platforms.find((platform) => platform.id === 'instagram')!.posts.find((entry) => entry.id === 'story')!;
    expect(story.files.map((file) => file.path)).toEqual(['instagram/story-9x16.jpg', 'shorts/Z1-intro-9x16.mp4']);
    expect(story.checklist.map((item) => item.label)).toEqual(['Link-Sticker zum Hauptvideo']);
  });

  it('shows the announcement story with its image and teaser in the folder text', async () => {
    const dir = await fixture();
    const result = await buildRelease({ projectDir: dir, deps: fakeDeps() });

    expect(post(result, 'announce:instagram').files.map((file) => file.path)).toEqual(['announce/teaser-9x16.mp4', 'announce/story-9x16.jpg']);
    const instagram = await readFile(join(result.dir, 'texts', 'instagram.md'), 'utf8');
    expect(instagram).toContain('Story: `announce/story-9x16.jpg`');
  });
});
