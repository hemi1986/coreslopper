import { afterEach, describe, expect, it, vi } from 'vitest';

// The release reads config/channel.yaml of the repo it runs in; a workspace's
// own channel must not change these results.
vi.mock('@coreslopper/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@coreslopper/core')>()),
  loadChannel: async () => undefined,
}));
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { platformLimits, platformTextProblems, UploadDataSchema } from '../packages/core/src/index.ts';
import { buildRelease } from '../packages/cli/src/release.ts';
import { boardProject } from '../packages/cli/src/release-board-data.ts';
import { cleanupFixtures, diskTree, episodeFixture, episodeUploadYaml, fakeDeps, fixture, uploadYaml } from './helpers/release-fixture.ts';

afterEach(cleanupFixtures);

type Result = Awaited<ReturnType<typeof buildRelease>>;
const post = (result: Result, id: string) => result.manifest.plan!.posts.find((entry) => entry.id === id);

/** The main video's length: the audio duration of the project's timing. */
async function setDuration(dir: string, seconds: number): Promise<void> {
  const path = join(dir, 'timing.json');
  const timing = JSON.parse(await readFile(path, 'utf8')) as { audio: { duration: number }; sections: { end: number }[] };
  timing.audio.duration = seconds;
  timing.sections.at(-1)!.end = seconds;
  await writeFile(path, JSON.stringify(timing));
}

/** A music video of `seconds` with (or without) the Instagram post text. */
async function musicVideo(seconds: number, options: { instagramPost: boolean }): Promise<string> {
  const dir = await fixture();
  await setDuration(dir, seconds);
  const upload = uploadYaml() as Partial<ReturnType<typeof uploadYaml>>;
  if (!options.instagramPost) delete upload.instagram_post;
  await writeFile(join(dir, 'review', 'upload.yaml'), stringify(upload));
  return dir;
}

describe('the main video as a Reel', () => {
  it('ST-045: A main video of 2:30 gets its Reel', async () => {
    // A horizontal episode with its 9:16 render: a vertical one of 2:30 is a short episode, without a main video (ADR 0057).
    const { dir, root } = await episodeFixture({ horizontal: true });
    await setDuration(dir, 150);
    await writeFile(
      join(dir, 'review', 'upload.yaml'),
      stringify({ ...episodeUploadYaml(), instagram_post: { caption: 'Die ganze Folge als Reel.', hashtags: ['#nightdesk'] } }),
    );

    const result = await buildRelease({ projectDir: dir, root, deps: fakeDeps(), render: false });

    const reel = post(result, 'instagram-post');
    expect(reel?.media).toBe('video/demo-episode-9x16.mp4');
    expect(reel?.files.map((file) => [file.role, file.path])).toContainEqual(['video', 'video/demo-episode-9x16.mp4']);
    const events = await calendarEvents(dir);
    expect(events.find((event) => event.id === 'instagram-post')).toMatchObject({ step: 'reel', platform: 'instagram' });
    // The board names it as the main video's Reel.
    const board = await boardProject(dir, root);
    const card = board.platforms.find((platform) => platform.id === 'instagram')!.posts.find((entry) => entry.id === 'instagram-post')!;
    expect(card.heading).toBe('Reel: Hauptvideo');
    expect(card.files.map((file) => file.path)).toContain('video/demo-episode-9x16.mp4');
  });

  it('ST-045: A main video of exactly 3 minutes still gets its Reel', async () => {
    const dir = await musicVideo(180, { instagramPost: true });

    const result = await buildRelease({ projectDir: dir, deps: fakeDeps(), render: false });

    expect(post(result, 'instagram-post')).toBeDefined();
    expect(post(result, 'instagram-post')?.media).toBe('video/neon-9x16.mp4');
  });

  it('ST-045: A main video over 3 minutes gets no Instagram post', async () => {
    const dir = await musicVideo(181, { instagramPost: false });

    const result = await buildRelease({ projectDir: dir, deps: fakeDeps(), render: false });

    expect(post(result, 'instagram-post')).toBeUndefined();
    expect(result.manifest.plan!.problems.missing).not.toContain('instagram_post');
    expect(result.todos.some((todo) => todo.includes('instagram_post'))).toBe(false);
    expect((await calendarEvents(dir)).some((event) => event.id === 'instagram-post')).toBe(false);
  });

  it('ST-045: There is no image post in place of the Reel', async () => {
    const dir = await musicVideo(150, { instagramPost: true });
    for (const format of ['9x16', '1x1']) await rm(join(dir, 'renders', `${format}.mp4`));
    const config = parse(await readFile(join(dir, 'project.yaml'), 'utf8'));
    config.formats.derivatives = [];
    await writeFile(join(dir, 'project.yaml'), stringify(config));
    const deps = fakeDeps();

    const result = await buildRelease({ projectDir: dir, deps });

    expect(post(result, 'instagram-post')?.media).toBe('video/neon-16x9.mp4');
    expect(deps.thumbnails.some((call) => call.format === '4x5')).toBe(false);
    expect((await diskTree(result.dir)).filter((path) => path.startsWith('instagram/feed'))).toEqual([]);
    expect(result.manifest.files.some((file) => file.kind === 'feed-image')).toBe(false);
  });
});

describe('the checks of the Reel text', () => {
  it('ask for the Reel text only for a main video of at most 3 minutes', () => {
    const upload = uploadYaml() as Partial<ReturnType<typeof uploadYaml>>;
    delete upload.instagram_post;
    const data = UploadDataSchema.parse(upload);
    const missing = (durationSeconds?: number) => platformTextProblems(data, platformLimits(undefined), { shape: 'music-video', durationSeconds }).missing;
    expect(missing(180)).toContain('instagram_post');
    expect(missing(181)).not.toContain('instagram_post');
    // Without a timing the length is unknown: the Reel stays.
    expect(missing(undefined)).toContain('instagram_post');
  });
});

async function calendarEvents(dir: string): Promise<{ id: string; step: string; platform: string }[]> {
  const calendar = parse(await readFile(join(dir, 'review', 'calendar.yaml'), 'utf8')) as { events: { id: string; step: string; platform: string }[] };
  return calendar.events;
}
