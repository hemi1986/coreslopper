import { afterEach, describe, expect, it, vi } from 'vitest';

// The release reads config/channel.yaml of the repo it runs in; a workspace's
// own channel must not change these results.
vi.mock('@coreslopper/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@coreslopper/core')>()),
  loadChannel: async () => undefined,
}));
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { ChannelConfigSchema, platformLimits } from '../packages/core/src/index.ts';
import { stringify } from 'yaml';
import { join } from 'node:path';
import { buildRelease, runRelease } from '../packages/cli/src/release.ts';
import { boardProject } from '../packages/cli/src/release-board-data.ts';
import { cleanupFixtures, episodeFixture, episodeUploadYaml, fakeDeps, fixture, jpeg, setReleaseDay, uploadYaml } from './helpers/release-fixture.ts';

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

describe('the caption of a story', () => {
  it('ST-044: A story with a video carries its caption', async () => {
    const { dir, root } = await episodeFixture();
    await mkdir(join(dir, 'renders', 'shorts'), { recursive: true });
    await writeFile(join(dir, 'renders', 'shorts', 'E1-hook-9x16.mp4'), 'short E1-hook');
    await writeFile(join(dir, 'renders', 'shorts', 'E1-hook-thumb.jpg'), jpeg(1080, 1920));
    const upload = episodeUploadYaml();
    await writeFile(
      join(dir, 'review', 'upload.yaml'),
      stringify({
        ...upload,
        shorts: [
          {
            name: 'E1-hook',
            file: 'renders/shorts/E1-hook-9x16.mp4',
            title: 'After Midnight #shorts',
            description: 'Der Anfang.',
            hashtags: ['#nightdesk', '#shorts'],
            instagram: { caption: 'Kurz vor Geschäftsschluss.', story: 'Neue Folge – jetzt auf YouTube' },
          },
        ],
      }),
    );

    const result = await buildRelease({ projectDir: dir, root, deps: fakeDeps(), render: false });

    expect(post(result, 'story').texts.caption).toMatchObject({ value: 'Neue Folge – jetzt auf YouTube', limit: { max: 120 } });
  });
});

describe('an optional caption', () => {
  it('ST-044: A story without a caption is complete', async () => {
    const dir = await fixture();
    const upload = uploadYaml();
    for (const short of upload.shorts) delete (short.instagram as { story?: string }).story;
    await writeFile(join(dir, 'review', 'upload.yaml'), stringify(upload));

    const result = await buildRelease({ projectDir: dir, deps: fakeDeps() });

    expect(result.manifest.plan!.problems.missing).not.toContain('shorts.Z1-intro.instagram.story');
  });
});

describe('the caption limit', () => {
  it('ST-044: A caption over 120 characters breaks a rule', async () => {
    const dir = await fixture();
    const upload = uploadYaml();
    upload.shorts[0]!.instagram.story = 'x'.repeat(121);
    await writeFile(join(dir, 'review', 'upload.yaml'), stringify(upload));

    const run = runRelease({ projectDir: dir, deps: fakeDeps({ log: () => undefined }) });

    await expect(run).rejects.toMatchObject({ details: expect.arrayContaining(['story: caption has 121 characters, limit 120']) });
  });

  it('takes the caption limit from the channel', () => {
    const channel = ChannelConfigSchema.parse({ version: 1, name: 'x', language: 'de', limits: { instagram: { story_caption: 200 } } });
    expect(platformLimits(channel).instagram.story_caption).toBe(200);
    expect(platformLimits().instagram.story_caption).toBe(120);
  });
});

describe('an image story', () => {
  it('ST-044: A story with only an image has no caption', async () => {
    const dir = await fixture();
    for (const name of ['Z1-intro', 'Z2-chorus', 'Z3-outro']) await rm(join(dir, 'renders', 'shorts', `${name}-9x16.mp4`));

    const result = await buildRelease({ projectDir: dir, deps: fakeDeps() });

    const story = post(result, 'story');
    expect(story.files.map((file) => file.role)).toEqual(['story-image']);
    expect(story.texts.caption).toBeUndefined();
  });

  it('gives the announcement story a caption only while it shows the teaser', async () => {
    const dir = await fixture();
    const result = await buildRelease({ projectDir: dir, deps: fakeDeps() });
    expect(post(result, 'announce:instagram').texts.caption).toMatchObject({ value: 'Freitag: Neon Rain.\n\n#synthwave', limit: { max: 120 } });

    // The release moves a week and the quick refresh composes nothing: the announcement story falls back to the cover.
    await setReleaseDay(dir, '2026-12-18');
    const moved = await buildRelease({ projectDir: dir, stills: false, deps: fakeDeps() });
    expect(post(moved, 'announce:instagram').files.map((file) => file.role)).toEqual(['cover']);
    expect(post(moved, 'announce:instagram').texts.caption).toBeUndefined();
  });
});

describe('the caption on the board and in the folder', () => {
  it('shows the caption as "Bildunterschrift" with its counter, and in texts/instagram.md', async () => {
    const dir = await fixture();
    const result = await buildRelease({ projectDir: dir, deps: fakeDeps() });

    const board = await boardProject(dir, join(dir, '..', '..'));
    const instagram = board.platforms.find((platform) => platform.id === 'instagram')!;
    const story = instagram.posts.find((entry) => entry.id === 'story')!;
    expect(story.fields).toEqual([{ label: 'Bildunterschrift', value: 'Neu: Teil 1', limit: 120, unit: 'chars' }]);
    const announce = instagram.posts.find((entry) => entry.id === 'announce:instagram')!;
    expect(announce.fields).toEqual([{ label: 'Bildunterschrift', value: 'Freitag: Neon Rain.\n\n#synthwave', limit: 120, unit: 'chars' }]);
    const reel = instagram.posts.find((entry) => entry.id === 'short:Z1-intro:instagram')!;
    expect(reel.fields.map((field) => field.label)).not.toContain('Bildunterschrift');

    const text = await readFile(join(result.dir, 'texts', 'instagram.md'), 'utf8');
    expect(text).toContain('### Bildunterschrift (11/120 Zeichen)\n\n```text\nNeu: Teil 1\n```');
    expect(text).not.toContain('shorts.Z1-intro.instagram.story');
  });
});
