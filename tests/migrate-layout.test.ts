import { afterEach, describe, expect, it } from 'vitest';
import { cp, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProject } from '@coreslopper/core';
import { createVideoProject } from '../packages/cli/src/board-wizard.ts';
import { legacySeries, migrateLayout, rewritePaths } from '../packages/cli/src/migrate-layout.ts';
import { createSeries } from '../packages/cli/src/new-series.ts';
import { seriesDirs } from '../packages/cli/src/board-production.ts';
import { collectSeriesStatus } from '../packages/cli/src/series.ts';

const root = process.cwd();
const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

/** A workspace in the old layout: series/demo-series beside projects/demo-episode, plus a video that borrows from the canon. */
async function legacyWorkspace(): Promise<string> {
  const ws = await mkdtemp(join(tmpdir(), 'coreslopper-layout-'));
  temporary.push(ws);
  for (const folder of ['config', 'templates', 'brand']) await cp(join(root, folder), join(ws, folder), { recursive: true });
  await writeFile(join(ws, 'package.json'), JSON.stringify({ name: 'coreslopper', version: '0.0.0' }));
  await cp(join(root, 'projects', 'demo-series'), join(ws, 'series', 'demo-series'), { recursive: true });
  await cp(join(root, 'projects', 'demo-episode'), join(ws, 'projects', 'demo-episode'), { recursive: true });
  await mkdir(join(ws, 'projects', 'demo-episode', 'assets'), { recursive: true });
  const abs = join(ws, 'series', 'demo-series', 'characters', 'mara', 'sheet.png');
  await writeFile(
    join(ws, 'projects', 'demo-episode', 'assets', 'queue.json'),
    JSON.stringify({ items: [{ id: 'state:mara/tired', out: '../../series/demo-series/characters/mara/states/tired.png', references: ['../../series/demo-series/characters/mara/sheet.png', abs] }] }, null, 2),
  );
  // media-link: the episode's assets/ live on a media drive behind a symlink.
  const media = await mkdtemp(join(tmpdir(), 'coreslopper-media-'));
  temporary.push(media);
  await rename(join(ws, 'projects', 'demo-episode', 'assets'), join(media, 'assets'));
  await symlink(join(media, 'assets'), join(ws, 'projects', 'demo-episode', 'assets'));
  await mkdir(join(ws, 'library', 'characters', 'mara'), { recursive: true });
  await writeFile(join(ws, 'library', 'characters', 'mara', 'character.yaml'), 'version: 1\nid: mara\nname: Mara\ndescription: d\norigin: series/demo-series\nadded: x\nhistory:\n  - at: y\n    from: series/demo-series\n    added: []\n');
  return ws;
}

describe('rewritePaths', () => {
  it('rewrites only paths into the moved canons', () => {
    const { text, count } = rewritePaths('a: ../../series/night/x.png\nb: ../../series/nightly/x.png\nc: "../../series/night"\nd: series/night/y\n', '/w', ['night']);
    expect(text).toBe('a: ../night/x.png\nb: ../../series/nightly/x.png\nc: "../night"\nd: series/night/y\n');
    expect(count).toBe(2);
    expect(rewritePaths('origin: series/night\n  - at: x\n    from: series/night\n', '/w', ['night'], true).text).toBe('origin: projects/night\n  - at: x\n    from: projects/night\n');
  });
});

describe('migrate-layout', () => {
  it('plans in a dry run, then moves the canon, rewrites the paths, and leaves a workspace that loads', async () => {
    const ws = await legacyWorkspace();
    expect(legacySeries(ws)).toEqual(['demo-series']);
    const plan = await migrateLayout(ws, { dryRun: true });
    expect(plan.moves).toEqual([{ from: 'series/demo-series', to: 'projects/demo-series' }]);
    expect(plan.rewrites).toEqual(expect.arrayContaining([
      { file: 'projects/demo-episode/assets/queue.json', count: 3 },
      { file: 'library/characters/mara/character.yaml', count: 2 },
    ]));
    expect(existsSync(join(ws, 'series', 'demo-series'))).toBe(true);

    await migrateLayout(ws);
    expect(existsSync(join(ws, 'series'))).toBe(false);
    expect(legacySeries(ws)).toEqual([]);
    expect((await seriesDirs(ws)).map((dir) => dir.split('/').at(-1))).toEqual(['demo-series']);
    const queue = JSON.parse(await readFile(join(ws, 'projects', 'demo-episode', 'assets', 'queue.json'), 'utf8'));
    expect(queue.items[0]).toMatchObject({ out: '../demo-series/characters/mara/states/tired.png', references: ['../demo-series/characters/mara/sheet.png', join(ws, 'projects', 'demo-series', 'characters', 'mara', 'sheet.png')] });
    expect(await readFile(join(ws, 'library', 'characters', 'mara', 'character.yaml'), 'utf8')).toContain('origin: projects/demo-series');
    // The episode finds its canon in projects/ and the series its episode.
    const episode = await loadProject(join(ws, 'projects', 'demo-episode'));
    expect(episode.characters?.characters.map((character) => character.id)).toContain('mara');
    expect((await collectSeriesStatus(join(ws, 'projects', 'demo-series'))).episodes.some((entry) => entry.slug === 'demo-episode')).toBe(true);
    // A second run has nothing left to do.
    expect((await migrateLayout(ws)).moves).toEqual([]);
  });

  it('stops before any change when a series slug is taken in projects/', async () => {
    const ws = await legacyWorkspace();
    await mkdir(join(ws, 'projects', 'demo-series'));
    await expect(migrateLayout(ws)).rejects.toThrow(/already has "demo-series".*Nothing was moved/s);
    expect(existsSync(join(ws, 'series', 'demo-series', 'series.yaml'))).toBe(true);
    expect(await readFile(join(ws, 'projects', 'demo-episode', 'assets', 'queue.json'), 'utf8')).toContain('../../series/demo-series');
  });

  it('keeps series and projects apart in one namespace', async () => {
    const ws = await legacyWorkspace();
    await migrateLayout(ws);
    await createSeries({ root: ws, slug: 'harbor', budget: 20 });
    expect(existsSync(join(ws, 'projects', 'harbor', 'series.yaml'))).toBe(true);
    await expect(createVideoProject(ws, { slug: 'harbor', title: 'Harbor', artist: 'A', budget: 40, imageProvider: 'mock', videoProvider: 'mock', language: 'en', rights: 'own', license: 'x' })).rejects.toThrow(/already exists/);
    await expect(createSeries({ root: ws, slug: 'demo-episode', budget: 20 })).rejects.toThrow(/share their slugs/);
  });
});
