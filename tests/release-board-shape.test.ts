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
import { boardProject, type BoardProject } from '../packages/cli/src/release-board-data.ts';
import { cleanupFixtures, episodeFixture, fakeDeps, fixture, shortEpisodeFixture, shortEpisodeUploadYaml } from './helpers/release-fixture.ts';

afterEach(cleanupFixtures);

/** The project's release language in project.yaml. */
async function language(dir: string, value: string): Promise<void> {
  const path = join(dir, 'project.yaml');
  const config = parse(await readFile(path, 'utf8')) as { release?: Record<string, unknown> };
  config.release = { ...config.release, language: value };
  await writeFile(path, stringify(config));
}

/** An English episode of `seconds`, vertical unless `horizontal`, with the short episode's upload data. */
async function episode(seconds: number, options: { horizontal?: boolean; lang?: string } = {}): Promise<{ dir: string; root: string }> {
  const project = await episodeFixture({ seconds, horizontal: options.horizontal });
  await writeFile(join(project.dir, 'review', 'upload.yaml'), stringify(shortEpisodeUploadYaml()));
  await language(project.dir, options.lang ?? 'en');
  return project;
}

const tab = (board: BoardProject, id: string) => board.platforms.find((platform) => platform.id === id);

describe('the release shape on the release board', () => {
  it('names a short episode with its format and length', async () => {
    const { dir, root } = await episode(161);
    const board = await boardProject(dir, root);
    expect(board.shape).toBe('short-episode');
    expect(board.shapeLine).toBe('Short episode · 9:16 · 2:41');
  });

  it('names a vertical episode over 3 minutes and why', async () => {
    const { dir, root } = await episode(192);
    const board = await boardProject(dir, root);
    expect(board.shape).toBe('episode');
    expect(board.shapeLine).toBe('Episode · 9:16 · 3:12 · over 3 min');
  });

  it('names a horizontal episode up to 3 minutes and its vertical version, in German too', async () => {
    const { dir, root } = await episode(150, { horizontal: true, lang: 'de' });
    expect((await boardProject(dir, root)).shapeLine).toBe('Folge · 16:9 · 2:30 · Hochkant-Fassung als Short');
    await language(dir, 'en');
    expect((await boardProject(dir, root)).shapeLine).toBe('Episode · 16:9 · 2:30 · vertical version as its Short');
    const short = await episode(161, { lang: 'de' });
    expect((await boardProject(short.dir, short.root)).shapeLine).toBe('Short-Folge · 9:16 · 2:41');
  });

  it('shows no shape line for a music video', async () => {
    const dir = await fixture();
    const board = await boardProject(dir, join(dir, '..', '..'));
    expect(board.shape).toBe('music-video');
    expect(board.shapeLine).toBeUndefined();
  });
});

describe("a short episode's platforms on the release board", () => {
  it('shows YouTube, TikTok, Instagram, X and the microsite, and no Spotify or LinkedIn', async () => {
    const { dir, root } = await shortEpisodeFixture();
    await buildRelease({ projectDir: dir, root, deps: fakeDeps(), render: false });
    const board = await boardProject(dir, root);
    expect(board.platforms.map((platform) => platform.id)).toEqual(['youtube', 'tiktok', 'instagram', 'x', 'microsite']);
  });

  it('heads its YouTube post "Short" with the cover, title, description and hashtags', async () => {
    const { dir, root } = await shortEpisodeFixture();
    await buildRelease({ projectDir: dir, root, deps: fakeDeps(), render: false });
    const youtube = tab(await boardProject(dir, root), 'youtube')!.posts.find((post) => post.id === 'youtube')!;
    expect(youtube.heading).toBe('Short');
    expect(youtube.files.map((file) => file.path)).toEqual(expect.arrayContaining(['video/demo-episode-9x16.mp4', 'cover/demo-episode-1080x1920.jpg']));
    expect(youtube.fields.map((field) => field.label)).toEqual(expect.arrayContaining(['Titel', 'Beschreibung', 'Hashtags, kommagetrennt']));
    expect(youtube.fields.find((field) => field.label === 'Hashtags, kommagetrennt')?.value).toBe('nightdesk, shorts');
  });

  it("shows the plan's TikTok and Instagram posts, and no Story card", async () => {
    const { dir, root } = await shortEpisodeFixture();
    await buildRelease({ projectDir: dir, root, deps: fakeDeps(), render: false });
    const board = await boardProject(dir, root);
    const tiktok = tab(board, 'tiktok')!.posts;
    expect(tiktok.map((post) => post.id)).toEqual(['tiktok']);
    expect(tiktok[0]!.files.map((file) => file.path)).toEqual(['video/demo-episode-9x16.mp4', 'cover/demo-episode-1080x1440.jpg']);
    expect(tiktok[0]!.fields[0]!.value).toContain('Kurz vor Geschäftsschluss kommt noch eine Nachricht.');
    expect(tiktok[0]!.fields[0]!.value).toContain('#nightdesk');
    const instagram = tab(board, 'instagram')!.posts;
    expect(instagram.map((post) => post.id)).toEqual(['instagram']);
    expect(instagram[0]!.fields[0]!.value).toContain('Folge 1: die letzte Nachricht des Tages.');
    expect(instagram.some((post) => post.id === 'story')).toBe(false);
  });
});
