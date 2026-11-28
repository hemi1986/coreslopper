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
import { SeriesSchema } from '../packages/core/src/index.ts';
import { buildRelease } from '../packages/cli/src/release.ts';
import { boardProject } from '../packages/cli/src/release-board-data.ts';
import { releaseChecks } from '../packages/cli/src/release-qa.ts';
import { cleanupFixtures, fakeDeps, fixture, fixtureProbe, shortEpisodeFixture } from './helpers/release-fixture.ts';

afterEach(cleanupFixtures);

const PLAYLIST_URL = 'https://www.youtube.com/playlist?list=PL-night-desk';

/** Set (or remove, with undefined) the demo series' youtube_playlist in the fixture's workspace. */
async function playlistOf(root: string, playlist: { title?: string; url?: string } | undefined): Promise<void> {
  const path = join(root, 'projects', 'demo-series', 'series.yaml');
  const series = parse(await readFile(path, 'utf8')) as Record<string, unknown>;
  if (playlist) series.youtube_playlist = playlist;
  else delete series.youtube_playlist;
  await writeFile(path, stringify(series));
}

const youtubeText = (dir: string) => readFile(join(dir, 'renders', 'release', 'texts', 'youtube.md'), 'utf8');

describe("a series' YouTube playlist", () => {
  it('validates series.yaml with youtube_playlist, and without it', async () => {
    const series = parse(await readFile(join(process.cwd(), 'projects', 'demo-series', 'series.yaml'), 'utf8')) as Record<string, unknown>;

    expect(SeriesSchema.parse(series).youtube_playlist).toBeUndefined();
    expect(SeriesSchema.parse({ ...series, youtube_playlist: { title: 'Night Desk – all episodes', url: PLAYLIST_URL } }).youtube_playlist).toEqual({ title: 'Night Desk – all episodes', url: PLAYLIST_URL });
    expect(SeriesSchema.parse({ ...series, youtube_playlist: {} }).youtube_playlist).toEqual({});
    expect(SeriesSchema.safeParse({ ...series, youtube_playlist: { url: 'not a url' } }).success).toBe(false);
    expect(SeriesSchema.safeParse({ ...series, youtube_playlist: { title: '' } }).success).toBe(false);
  });

  it("gives a short episode's YouTube post the checklist line with the playlist title and its link", async () => {
    const { dir, root } = await shortEpisodeFixture();
    await playlistOf(root, { title: 'Night Desk – all episodes', url: PLAYLIST_URL });

    const result = await buildRelease({ projectDir: dir, root, deps: fakeDeps(), render: false });

    expect(await youtubeText(dir)).toContain(`- [ ] In die Playlist „Night Desk – all episodes“ aufnehmen — ${PLAYLIST_URL}`);
    expect(result.todos.some((todo) => todo.includes('YouTube playlist of the series'))).toBe(false);
    const board = await boardProject(dir, root);
    const post = board.platforms.find((platform) => platform.id === 'youtube')!.posts.find((entry) => entry.id === 'youtube')!;
    expect(post.checklist.at(-1)).toEqual({ key: 'youtube#In die Playlist „Night Desk – all episodes“ aufnehmen', label: 'In die Playlist „Night Desk – all episodes“ aufnehmen', href: PLAYLIST_URL });
    const checks = await releaseChecks(dir, fixtureProbe(), { root });
    expect(checks.find((entry) => entry.name === 'Release playlist')).toMatchObject({ result: 'PASS' });
  });

  it("names the playlist after the series' title without a title, in English too", async () => {
    const { dir, root } = await shortEpisodeFixture();
    const projectPath = join(dir, 'project.yaml');
    const config = parse(await readFile(projectPath, 'utf8')) as { release?: Record<string, unknown> };
    config.release = { ...config.release, language: 'en' };
    await writeFile(projectPath, stringify(config));
    await playlistOf(root, { url: PLAYLIST_URL });

    await buildRelease({ projectDir: dir, root, deps: fakeDeps(), render: false });

    expect(await youtubeText(dir)).toContain(`- [ ] Add to the playlist "Night Desk" — ${PLAYLIST_URL}`);
  });

  it('gives a short episode the TODO "YouTube playlist of the series" while its series has no playlist URL', async () => {
    const { dir, root } = await shortEpisodeFixture();
    await playlistOf(root, undefined);

    const result = await buildRelease({ projectDir: dir, root, deps: fakeDeps(), render: false });

    const todo = 'YouTube playlist of the series: set youtube_playlist.url in projects/demo-series/series.yaml';
    expect(result.todos).toContain(todo);
    expect(result.errors).toEqual([]);
    expect(await readFile(join(dir, 'renders', 'release', 'README.md'), 'utf8')).toContain(`- [ ] TODO: ${todo}`);
    const text = await youtubeText(dir);
    expect(text).toContain('- [ ] In die Playlist „Night Desk“ aufnehmen\n');
    const board = await boardProject(dir, root);
    const line = board.platforms.find((platform) => platform.id === 'youtube')!.posts.find((entry) => entry.id === 'youtube')!.checklist.at(-1)!;
    expect(line.href).toBeUndefined();
    const checks = await releaseChecks(dir, fixtureProbe(), { root });
    expect(checks.find((entry) => entry.name === 'Release playlist')).toEqual({ name: 'Release playlist', result: 'TODO', evidence: todo });
  });

  it("gives a music video's YouTube post no playlist line", async () => {
    const dir = await fixture();

    await buildRelease({ projectDir: dir, deps: fakeDeps(), render: false });

    const text = await youtubeText(dir);
    expect(text).not.toContain('In die Playlist');
    expect(text).not.toContain('Add to the playlist');
    const checks = await releaseChecks(dir, fixtureProbe());
    expect(checks.find((entry) => entry.name === 'Release playlist')).toBeUndefined();
  });
});
