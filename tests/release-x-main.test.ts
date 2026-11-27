import { afterEach, describe, expect, it, vi } from 'vitest';

// The release reads config/channel.yaml of the repo it runs in; a workspace's
// own channel must not change these results.
vi.mock('@coreslopper/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@coreslopper/core')>()),
  loadChannel: async () => undefined,
}));
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { buildRelease } from '../packages/cli/src/release.ts';
import { boardProject } from '../packages/cli/src/release-board-data.ts';
import { cleanupFixtures, fakeDeps, fixture, uploadYaml } from './helpers/release-fixture.ts';

afterEach(cleanupFixtures);

type Result = Awaited<ReturnType<typeof buildRelease>>;
const post = (result: Result, id: string) => result.manifest.plan!.posts.find((entry) => entry.id === id);
type XUpload = { post: string; hashtags: string[]; reply?: string; media?: string };

/** A music video whose X post is changed by `edit`. */
async function musicVideo(edit: (x: XUpload) => void): Promise<string> {
  const dir = await fixture();
  const upload = uploadYaml();
  edit(upload.x as XUpload);
  await writeFile(join(dir, 'review', 'upload.yaml'), stringify(upload));
  return dir;
}

/** The main video's length: the audio duration of the project's timing. */
async function setDuration(dir: string, seconds: number): Promise<void> {
  const path = join(dir, 'timing.json');
  const timing = JSON.parse(await readFile(path, 'utf8')) as { audio: { duration: number }; sections: { end: number }[] };
  timing.audio.duration = seconds;
  timing.sections.at(-1)!.end = seconds;
  await writeFile(path, JSON.stringify(timing));
}

describe('the X post', () => {
  it('ST-046: The X post takes the main video when no media is named', async () => {
    const dir = await musicVideo((x) => delete x.media);

    const result = await buildRelease({ projectDir: dir, deps: fakeDeps(), render: false });

    const x = post(result, 'x');
    expect(x?.media).toBe('video/neon-16x9.mp4');
    expect(x?.files.map((file) => [file.role, file.path])).toEqual([['video', 'video/neon-16x9.mp4']]);
    expect(x?.errors).toEqual([]);
    expect(await readFile(join(result.dir, 'texts', 'x.md'), 'utf8')).toContain('video/neon-16x9.mp4');
    // `main` names the same video.
    const named = await buildRelease({ projectDir: await musicVideo((entry) => (entry.media = 'main')), deps: fakeDeps(), render: false });
    expect(post(named, 'x')?.media).toBe('video/neon-16x9.mp4');
    expect(named.manifest.plan!.problems.errors).toEqual([]);
  });

  it("ST-046: A named Short stays the X post's video", async () => {
    const dir = await musicVideo((x) => (x.media = 'Z2-chorus'));

    const result = await buildRelease({ projectDir: dir, deps: fakeDeps(), render: false });

    expect(post(result, 'x')?.media).toBe('shorts/Z2-chorus-9x16.mp4');
    const board = await boardProject(dir, join(dir, '..', '..'));
    const card = board.platforms.find((platform) => platform.id === 'x')!.posts.find((entry) => entry.id === 'x')!;
    expect(card.files.map((file) => file.path)).toEqual(['shorts/Z2-chorus-9x16.mp4']);
  });

  it('ST-046: An X post without a reply is complete', async () => {
    const dir = await musicVideo((x) => delete x.reply);

    const result = await buildRelease({ projectDir: dir, deps: fakeDeps(), render: false });

    const x = post(result, 'x');
    expect(x?.texts.reply).toBeUndefined();
    expect(x?.needsYoutube).toBeUndefined();
    expect(result.manifest.plan!.problems.missing).not.toContain('x');
    expect(await readFile(join(result.dir, 'texts', 'x.md'), 'utf8')).not.toContain('{youtube}');
    const board = await boardProject(dir, join(dir, '..', '..'));
    const card = board.platforms.find((platform) => platform.id === 'x')!.posts.find((entry) => entry.id === 'x')!;
    expect(card.fields.map((field) => field.label)).toEqual(['Post']);
    expect(card.checklist.map((line) => line.label)).toEqual(['Video direkt hochladen']);
  });

  it('ST-046: A main video over 140 seconds notes X Premium', async () => {
    const dir = await musicVideo((x) => delete x.media);
    await setDuration(dir, 200);
    const config = parse(await readFile(join(dir, 'project.yaml'), 'utf8'));
    config.release.language = 'en';
    await writeFile(join(dir, 'project.yaml'), stringify(config));
    await buildRelease({ projectDir: dir, deps: fakeDeps(), render: false });

    const board = await boardProject(dir, join(dir, '..', '..'));

    const card = board.platforms.find((platform) => platform.id === 'x')!.posts.find((entry) => entry.id === 'x')!;
    expect(card.files.map((file) => file.path)).toEqual(['video/neon-16x9.mp4']);
    expect(card.fields.find((field) => field.label === 'Post')?.note).toBe('Over 140 s only with X Premium');
  });

  it('notes X Premium neither for a main video of 140 s nor for a Short', async () => {
    const short = await musicVideo((x) => (x.media = 'Z1-intro'));
    await setDuration(short, 200);
    await buildRelease({ projectDir: short, deps: fakeDeps(), render: false });
    const main = await musicVideo((x) => delete x.media);
    await setDuration(main, 140);
    await buildRelease({ projectDir: main, deps: fakeDeps(), render: false });

    for (const dir of [short, main]) {
      const board = await boardProject(dir, join(dir, '..', '..'));
      const card = board.platforms.find((platform) => platform.id === 'x')!.posts.find((entry) => entry.id === 'x')!;
      expect(card.fields.find((field) => field.label === 'Post')?.note).toBeUndefined();
    }
  });
});
