import { afterEach, describe, expect, it, vi } from 'vitest';

// The release reads config/channel.yaml of the repo it runs in; a workspace's
// own channel must not change these results.
vi.mock('@coreslopper/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@coreslopper/core')>()),
  loadChannel: async () => undefined,
}));
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildRelease } from '../packages/cli/src/release.ts';
import { boardProject } from '../packages/cli/src/release-board-data.ts';
import { loadReleaseFacts, releasePlan, releaseProjectDirs } from '../packages/cli/src/release-facts.ts';
import { cleanupFixtures, fakeDeps, fixture } from './helpers/release-fixture.ts';

afterEach(cleanupFixtures);

describe('release facts', () => {
  it('loads one project\'s release facts with the workspace root it was given', async () => {
    const dir = await fixture();
    const root = join(dir, '..', '..');
    await buildRelease({ projectDir: dir, root, deps: fakeDeps() });

    const facts = await loadReleaseFacts(dir, root);

    expect(facts.root).toBe(root);
    expect(facts.project.config.slug).toBe('neon');
    expect(facts.identity).toMatchObject({ artist: 'Neon Static', title: 'Neon Rain' });
    expect(facts.data?.main.title).toContain('Neon Rain');
    expect(facts.manifest?.files.map((file) => file.path)).toContain('video/neon-16x9.mp4');
    expect(facts.files.master).toBe('video/neon-16x9.mp4');
    expect(facts.calendar).toMatchObject({ release_date: '2026-12-11', proposed: false });
    expect(facts.status).toMatchObject({ items: {} });
    expect(facts.schedule.version).toBe(1);
    expect(facts.plan.posts.find((post) => post.id === 'short:Z1-intro:tiktok')?.texts.caption?.value).toBe(
      'Teil 1 im Regen\n\nGanzes Video auf YouTube: @neonstatic\n\n#synthwave',
    );
  });

  it('fills a live URL from a fresh status without loading the project again', async () => {
    const dir = await fixture();
    const root = join(dir, '..', '..');
    await buildRelease({ projectDir: dir, root, deps: fakeDeps() });
    const facts = await loadReleaseFacts(dir, root);

    const live = releasePlan(facts, {
      ...facts.status,
      items: {
        youtube: { done: true, url: 'https://youtu.be/abc' },
        song: { done: true, url: 'https://open.spotify.com/track/1' },
      },
    });

    expect(live.posts.find((post) => post.id === 'x')?.texts.reply?.value).toBe('Ganzes Video: https://youtu.be/abc');
    // The facts' own plan keeps its slots: only the status changed.
    expect(facts.plan.posts.find((post) => post.id === 'x')?.texts.reply?.value).toBe('Ganzes Video: {youtube}');
  });

  it('builds the board posts from the same facts', async () => {
    const dir = await fixture();
    const root = join(dir, '..', '..');
    await buildRelease({ projectDir: dir, root, deps: fakeDeps() });
    const facts = await loadReleaseFacts(dir, root);

    const board = await boardProject(dir, root);
    const tiktok = board.platforms.find((platform) => platform.id === 'tiktok')!.posts.find((post) => post.id === 'short:Z1-intro:tiktok')!;
    const caption = facts.plan.posts.find((post) => post.id === 'short:Z1-intro:tiktok')!.texts.caption!.value;

    expect(tiktok.fields.find((field) => field.label === 'Beschreibung')?.value).toBe(caption);
    expect(tiktok.files.map((file) => file.path)).toEqual([facts.files.shorts[0]!.video, facts.files.shorts[0]!.tiktokCover]);
    expect(board.status).toEqual(facts.status);
    expect(board.calendar.map((event) => event.id)).toEqual(facts.calendar!.events.map((event) => event.id));
  });

  it('discovers the projects that have a release folder or a calendar', async () => {
    const dir = await fixture();
    const root = join(dir, '..', '..');
    await buildRelease({ projectDir: dir, root, deps: fakeDeps() });

    const plain = join(root, 'projects', 'plain');
    await mkdir(plain, { recursive: true });
    await writeFile(join(plain, 'project.yaml'), 'version: 1\nslug: plain\n');
    const calendarOnly = join(root, 'projects', 'calendar-only');
    await mkdir(join(calendarOnly, 'review'), { recursive: true });
    await writeFile(join(calendarOnly, 'project.yaml'), 'version: 1\nslug: calendar-only\n');
    await writeFile(join(calendarOnly, 'review', 'calendar.yaml'), 'version: 1\nproject: calendar-only\n');

    expect(await releaseProjectDirs(root)).toEqual([calendarOnly, dir]);
  });
});
