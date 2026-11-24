import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, truncate, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse, stringify } from 'yaml';
import { loadProject } from '@coreslopper/core';
import { addLibrarySet, addLibrarySetFile, importSets, loadLibrarySet, setEntryDir, updateLibrarySet, useSet } from '../packages/cli/src/set-library.ts';
import { createProject } from '../packages/cli/src/new-project.ts';
import { createEpisode, createSeriesCanon } from '../packages/cli/src/board-wizard.ts';
import { validateChangedFile } from '../packages/cli/src/validate-file.ts';

const root = process.cwd();
const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function workspace(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'coreslopper-set-library-'));
  temporary.push(dir);
  return dir;
}

const neonBar = {
  name: 'Neon Bar',
  description: 'a narrow bar in blue neon',
  prompt: 'narrow bar, blue neon, wet counter',
};

describe('adding a library set by hand', () => {
  it('ST-024: A set is added by hand', async () => {
    const ws = await workspace();
    const entry = await addLibrarySet(ws, neonBar, new Date('2026-11-23T10:00:00Z'));

    expect(entry).toMatchObject({ id: 'neon-bar', name: 'Neon Bar', description: 'a narrow bar in blue neon', prompt: 'narrow bar, blue neon, wet counter', origin: 'manual', refs: [], plates: [] });
    expect(await loadLibrarySet(ws, 'neon-bar')).toMatchObject({ id: 'neon-bar', name: 'Neon Bar', description: 'a narrow bar in blue neon', prompt: 'narrow bar, blue neon, wet counter', origin: 'manual', added: '2026-11-23T10:00:00.000Z', refs: [], plates: [], tags: [], history: [] });
    expect(await validateChangedFile(join(setEntryDir(ws, 'neon-bar'), 'set.yaml'))).toBe('library set');
  });

  it('ST-024: A taken id is refused', async () => {
    const ws = await workspace();
    await addLibrarySet(ws, neonBar);
    await expect(addLibrarySet(ws, { name: 'Neon Bar', description: 'another bar', prompt: 'bar' })).rejects.toThrow(/already/);
    expect(await readdir(join(ws, 'library', 'sets'))).toEqual(['neon-bar']);
    expect((await loadLibrarySet(ws, 'neon-bar')).description).toBe('a narrow bar in blue neon');
  });

  it('refuses a folder with unnamed files, but reuses an empty one', async () => {
    const ws = await workspace();
    await mkdir(join(ws, 'library', 'sets', 'neon-bar'), { recursive: true });
    await expect(addLibrarySet(ws, neonBar)).resolves.toMatchObject({ id: 'neon-bar' });

    const other = await workspace();
    await mkdir(join(other, 'library', 'sets', 'neon-bar'), { recursive: true });
    await writeFile(join(other, 'library', 'sets', 'neon-bar', 'stray.png'), 'not named by set.yaml');
    await expect(addLibrarySet(other, neonBar)).rejects.toThrow(/holds files/);
  });

  it('ST-024: A set without a prompt is refused', async () => {
    const ws = await workspace();
    await expect(addLibrarySet(ws, { name: 'Neon Bar', description: 'a narrow bar in blue neon' })).rejects.toThrow(/prompt is required/);
    expect(existsSync(join(ws, 'library', 'sets', 'neon-bar'))).toBe(false);
  });
});

describe('updating a library set', () => {
  async function withBar(): Promise<string> {
    const ws = await workspace();
    await addLibrarySet(ws, { name: 'bar', description: 'a bar', prompt: 'narrow bar, blue neon' });
    return ws;
  }

  it('ST-029: The description is corrected', async () => {
    const ws = await withBar();

    const entry = await updateLibrarySet(ws, 'bar', { description: 'a narrow bar in blue neon' });

    expect(entry).toMatchObject({ id: 'bar', name: 'bar', description: 'a narrow bar in blue neon', prompt: 'narrow bar, blue neon' });
    expect(await loadLibrarySet(ws, 'bar')).toMatchObject({ id: 'bar', description: 'a narrow bar in blue neon' });
    expect(await validateChangedFile(join(setEntryDir(ws, 'bar'), 'set.yaml'))).toBe('library set');
  });
});

describe('adding a file to a library set', () => {
  async function withSet(): Promise<{ ws: string; dir: string; source: (name: string, content?: string) => Promise<string> }> {
    const ws = await workspace();
    await addLibrarySet(ws, neonBar);
    return {
      ws,
      dir: setEntryDir(ws, 'neon-bar'),
      async source(name, content = name) {
        const path = join(ws, name);
        await writeFile(path, content);
        return path;
      },
    };
  }

  it('ST-025: A plate is added with its angle', async () => {
    const { ws, dir, source } = await withSet();
    const image = await source('counter.png');

    await addLibrarySetFile(ws, 'neon-bar', image, { role: 'plate', angle: 'counter, frontal, waist height' });

    const entry = await loadLibrarySet(ws, 'neon-bar');
    expect(entry.plates).toEqual([{ id: 'counter-frontal-waist-height', angle: 'counter, frontal, waist height', file: 'counter.png' }]);
    expect(existsSync(join(dir, 'counter.png'))).toBe(true);
    expect(await validateChangedFile(join(dir, 'set.yaml'))).toBe('library set');
  });

  it('ST-025: A plate without an angle is refused', async () => {
    const { ws, dir, source } = await withSet();
    const image = await source('counter.png');

    await expect(addLibrarySetFile(ws, 'neon-bar', image, { role: 'plate' })).rejects.toThrow(/camera angle/);

    expect(await readdir(dir)).toEqual(['set.yaml']);
    expect((await loadLibrarySet(ws, 'neon-bar')).plates).toEqual([]);
  });

  it('ST-025: The same image twice is stored once', async () => {
    const { ws, dir, source } = await withSet();
    const original = await source('bar.jpg', 'the same bytes');
    const copy = await source('bar-copy.jpg', 'the same bytes');
    await addLibrarySetFile(ws, 'neon-bar', original, { role: 'ref' });

    await addLibrarySetFile(ws, 'neon-bar', copy, { role: 'ref' });

    expect((await loadLibrarySet(ws, 'neon-bar')).refs).toEqual(['bar.jpg']);
    expect((await readdir(dir)).sort()).toEqual(['bar.jpg', 'set.yaml']);
  });

  it('ST-025: A file of another type is refused', async () => {
    const { ws, dir, source } = await withSet();
    const animated = await source('bar.gif');

    await expect(addLibrarySetFile(ws, 'neon-bar', animated, { role: 'ref' })).rejects.toThrow(/\.png \.jpg \.jpeg \.webp/);

    expect((await loadLibrarySet(ws, 'neon-bar')).refs).toEqual([]);
    expect(await readdir(dir)).toEqual(['set.yaml']);
  });

  it('takes a plate id given with --plate', async () => {
    const { ws, source } = await withSet();
    const image = await source('counter.png');

    await addLibrarySetFile(ws, 'neon-bar', image, { role: 'plate', angle: 'counter, frontal', plate: 'wide-shot' });

    expect((await loadLibrarySet(ws, 'neon-bar')).plates).toMatchObject([{ id: 'wide-shot', angle: 'counter, frontal', file: 'counter.png' }]);
  });

  it('refuses a file over 512 MB', async () => {
    const { ws, dir } = await withSet();
    const huge = join(ws, 'huge.png');
    await writeFile(huge, '');
    await truncate(huge, 512 * 1024 * 1024 + 1);

    await expect(addLibrarySetFile(ws, 'neon-bar', huge, { role: 'ref' })).rejects.toThrow(/at most 512 MB/);

    expect(await readdir(dir)).toEqual(['set.yaml']);
  });

  it('stores a source name the entry schema accepts, not an unnamed file', async () => {
    const { ws, dir, source } = await withSet();
    const odd = await source('_bar.png');

    await addLibrarySetFile(ws, 'neon-bar', odd, { role: 'ref' });

    expect((await loadLibrarySet(ws, 'neon-bar')).refs).toEqual(['bar.png']);
    expect((await readdir(dir)).sort()).toEqual(['bar.png', 'set.yaml']);
    expect(await validateChangedFile(join(dir, 'set.yaml'))).toBe('library set');
    await expect(addLibrarySetFile(ws, 'neon-bar', odd, { role: 'ref' })).resolves.toMatchObject({ changed: false, added: [] });
  });

  it('refuses a source that is not a file', async () => {
    const { ws, dir } = await withSet();
    const folder = join(ws, 'bar.png');
    await mkdir(folder);

    await expect(addLibrarySetFile(ws, 'neon-bar', folder, { role: 'ref' })).rejects.toThrow(/not a file/);

    expect(await readdir(dir)).toEqual(['set.yaml']);
  });
});

const bar = (extra: Record<string, unknown> = {}) => ({
  id: 'bar',
  name: 'The bar',
  description: 'A narrow bar in blue neon.',
  prompt: 'narrow bar, blue neon, wet counter',
  ...extra,
});

/** A production in the workspace with a set bible and its files, as `set import <production>` finds it. */
async function production(ws: string, slug: string, sets: unknown[], files: Record<string, string>): Promise<string> {
  const dir = join(ws, 'projects', slug);
  await mkdir(dir, { recursive: true });
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), content);
  }
  await writeFile(join(dir, 'sets.yaml'), stringify({ version: 1, sets }));
  return dir;
}

/** The library holds "bar" with the plate "counter", its image the given bytes. */
async function libraryBar(ws: string, counter = 'counter'): Promise<void> {
  await addLibrarySet(ws, { name: 'Bar', description: 'A narrow bar in blue neon.', prompt: 'narrow bar, blue neon, wet counter' });
  const image = join(ws, 'counter.png');
  await writeFile(image, counter);
  await addLibrarySetFile(ws, 'bar', image, { role: 'plate', angle: 'counter, frontal', plate: 'counter' });
}

describe('taking sets into the library', () => {
  it('ST-026: The sets of a music video become library sets', async () => {
    const ws = await workspace();
    const dir = await production(
      ws,
      'neon-rain',
      [bar({ refs: ['sets/bar/start.png'], plates: [{ id: 'counter', angle: 'counter, frontal', ref: 'sets/bar/plates/counter.png' }] })],
      { 'sets/bar/start.png': 'start', 'sets/bar/plates/counter.png': 'counter' },
    );

    const results = await importSets(ws, dir, { now: new Date('2026-11-23T10:00:00Z') });

    expect(results).toEqual([{ set: 'bar', id: 'bar', created: true, added: ['start.png', 'counter.png', 'plate:counter'], missing: [] }]);
    expect(await loadLibrarySet(ws, 'bar')).toMatchObject({
      id: 'bar',
      name: 'The bar',
      description: 'A narrow bar in blue neon.',
      prompt: 'narrow bar, blue neon, wet counter',
      refs: ['start.png'],
      plates: [{ id: 'counter', angle: 'counter, frontal', file: 'counter.png' }],
      tags: [],
      origin: 'projects/neon-rain',
      added: '2026-11-23T10:00:00.000Z',
      history: [],
    });
    expect(await validateChangedFile(join(setEntryDir(ws, 'bar'), 'set.yaml'))).toBe('library set');
  });

  it('ST-026: A set taken from the library extends its entry', async () => {
    const ws = await workspace();
    await libraryBar(ws);
    const dir = await production(
      ws,
      'after-midnight',
      [
        bar({
          library: 'bar',
          plates: [
            { id: 'counter', angle: 'counter, frontal', ref: 'sets/bar/plates/counter.png' },
            { id: 'door', angle: 'door, from inside', ref: 'sets/bar/plates/door.png' },
          ],
        }),
      ],
      { 'sets/bar/plates/counter.png': 'counter', 'sets/bar/plates/door.png': 'door' },
    );

    const [result] = await importSets(ws, dir, { now: new Date('2026-11-23T11:00:00Z') });

    expect(result).toEqual({ set: 'bar', id: 'bar', created: false, added: ['door.png', 'plate:door'], missing: [] });
    const entry = await loadLibrarySet(ws, 'bar');
    expect(entry.name).toBe('Bar');
    expect(entry.description).toBe('A narrow bar in blue neon.');
    expect(entry.prompt).toBe('narrow bar, blue neon, wet counter');
    expect(entry.plates).toEqual([
      { id: 'counter', angle: 'counter, frontal', file: 'counter.png' },
      { id: 'door', angle: 'door, from inside', file: 'door.png' },
    ]);
    expect(entry.history.at(-1)).toEqual({ at: '2026-11-23T11:00:00.000Z', from: 'projects/after-midnight', added: ['door.png', 'plate:door'] });
  });

  it('ST-026: A plate id with another image is renamed', async () => {
    const ws = await workspace();
    await libraryBar(ws, 'counter');
    const dir = await production(
      ws,
      'after-midnight',
      [bar({ library: 'bar', plates: [{ id: 'counter', angle: 'counter, frontal', ref: 'sets/bar/plates/counter.png' }] })],
      { 'sets/bar/plates/counter.png': 'another image of the counter' },
    );

    await importSets(ws, dir);

    const entry = await loadLibrarySet(ws, 'bar');
    expect(entry.plates.map((plate) => plate.id)).toEqual(['counter', 'counter-after-midnight']);
    expect(entry.plates[1]).toMatchObject({ angle: 'counter, frontal' });
    expect(existsSync(join(setEntryDir(ws, 'bar'), entry.plates[1]!.file!))).toBe(true);
  });

  it('ST-026: A different set with a taken id becomes its own entry', async () => {
    const ws = await workspace();
    const first = await production(
      ws,
      'neon-rain',
      [bar({ refs: ['sets/bar/start.png'], plates: [{ id: 'counter', angle: 'counter, frontal', ref: 'sets/bar/plates/counter.png' }] })],
      { 'sets/bar/start.png': 'neon-start', 'sets/bar/plates/counter.png': 'neon-counter' },
    );
    await importSets(ws, first);
    const second = await production(
      ws,
      'after-midnight',
      [bar({ refs: ['sets/bar/start.png'], plates: [{ id: 'counter', angle: 'counter, frontal', ref: 'sets/bar/plates/counter.png' }] })],
      { 'sets/bar/start.png': 'midnight-start', 'sets/bar/plates/counter.png': 'midnight-counter' },
    );

    const [result] = await importSets(ws, second);

    expect(result).toMatchObject({ set: 'bar', id: 'bar-after-midnight', created: true });
    expect((await loadLibrarySet(ws, 'bar')).origin).toBe('projects/neon-rain');
    expect((await loadLibrarySet(ws, 'bar-after-midnight')).origin).toBe('projects/after-midnight');
    expect((await readdir(join(ws, 'library', 'sets'))).sort()).toEqual(['bar', 'bar-after-midnight']);
  });

  it('skips a set without files, but refuses it when it was named', async () => {
    const ws = await workspace();
    const dir = await production(
      ws,
      'neon-rain',
      [bar(), bar({ id: 'lobby', name: 'Lobby', refs: ['sets/lobby/start.png'] })],
      { 'sets/lobby/start.png': 'lobby' },
    );

    const results = await importSets(ws, dir);
    expect(results.find((result) => result.set === 'bar')).toMatchObject({ skipped: true, created: false, added: [] });
    expect(results.find((result) => result.set === 'lobby')).toMatchObject({ id: 'lobby', created: true });
    await expect(importSets(ws, dir, { set: 'bar' })).rejects.toThrow(/no files/);
    expect(existsSync(join(ws, 'library', 'sets', 'bar'))).toBe(false);
  });

  it('reports a missing file without failing the import', async () => {
    const ws = await workspace();
    const dir = await production(
      ws,
      'neon-rain',
      [bar({ refs: ['sets/bar/start.png'], plates: [{ id: 'counter', angle: 'counter, frontal', ref: 'sets/bar/plates/counter.png' }] })],
      { 'sets/bar/start.png': 'start' },
    );

    const [result] = await importSets(ws, dir);

    expect(result!.missing).toEqual(['sets/bar/plates/counter.png']);
    expect((await loadLibrarySet(ws, 'bar')).plates).toEqual([{ id: 'counter', angle: 'counter, frontal' }]);
  });

  it('refuses a set file outside the production', async () => {
    const ws = await workspace();
    await writeFile(join(ws, 'outside.png'), 'outside');
    const dir = await production(ws, 'neon-rain', [bar({ refs: ['../outside.png'] })], {});

    expect(await importSets(ws, dir)).toEqual([{ set: 'bar', created: false, skipped: true, added: [], missing: ['../outside.png'] }]);
    const named = await production(ws, 'named', [bar({ refs: ['../outside.png'] })], {});
    await expect(importSets(ws, named, { set: 'bar' })).rejects.toThrow(/no files/);
  });

  it('puts a set into the entry the user names', async () => {
    const ws = await workspace();
    await libraryBar(ws);
    const dir = await production(
      ws,
      'after-midnight',
      [bar({ plates: [{ id: 'door', angle: 'door, from inside', ref: 'sets/bar/plates/door.png' }] })],
      { 'sets/bar/plates/door.png': 'door' },
    );

    const [result] = await importSets(ws, dir, { set: 'bar', into: 'bar' });

    expect(result).toMatchObject({ id: 'bar', created: false, added: ['door.png', 'plate:door'] });
    await expect(importSets(ws, dir, { set: 'bar', into: 'no-such-set' })).rejects.toThrow(/no library set/);
    await expect(importSets(ws, dir, { into: 'bar' })).rejects.toThrow(/--id/);
  });

  it('matches a same-id entry that shares a file', async () => {
    const ws = await workspace();
    const first = await production(ws, 'neon-rain', [bar({ refs: ['sets/bar/start.png'] })], { 'sets/bar/start.png': 'the bar' });
    await importSets(ws, first);
    // The same place in a second video: no library link, but its start frame is the same image.
    const second = await production(
      ws,
      'after-midnight',
      [bar({ refs: ['sets/bar/start.png'], plates: [{ id: 'door', angle: 'door, from inside', ref: 'sets/bar/plates/door.png' }] })],
      { 'sets/bar/start.png': 'the bar', 'sets/bar/plates/door.png': 'door' },
    );

    const [result] = await importSets(ws, second);

    expect(result).toMatchObject({ set: 'bar', id: 'bar', created: false, added: ['door.png', 'plate:door'] });
    expect((await readdir(join(ws, 'library', 'sets'))).sort()).toEqual(['bar']);
  });

  it('adds a reference whose image the entry already holds', async () => {
    const ws = await workspace();
    await libraryBar(ws);
    const dir = await production(ws, 'after-midnight', [bar({ library: 'bar', refs: ['sets/bar/counter.png'] })], { 'sets/bar/counter.png': 'counter' });

    const [result] = await importSets(ws, dir, { now: new Date('2026-11-23T12:00:00Z') });

    expect(result).toMatchObject({ created: false, added: ['counter.png'] });
    const entry = await loadLibrarySet(ws, 'bar');
    expect(entry.refs).toEqual(['counter.png']);
    expect(entry.history.at(-1)).toEqual({ at: '2026-11-23T12:00:00.000Z', from: 'projects/after-midnight', added: ['counter.png'] });
  });

  it('fills the image of a plate the entry holds without one', async () => {
    const ws = await workspace();
    await addLibrarySet(ws, { name: 'Bar', description: 'A narrow bar in blue neon.', prompt: 'narrow bar, blue neon, wet counter' });
    await writeFile(
      join(setEntryDir(ws, 'bar'), 'set.yaml'),
      stringify({
        version: 1,
        id: 'bar',
        name: 'Bar',
        description: 'A narrow bar in blue neon.',
        prompt: 'narrow bar, blue neon, wet counter',
        plates: [{ id: 'counter', angle: 'counter, frontal' }],
        origin: 'manual',
        added: '2026-11-23T09:00:00.000Z',
      }),
    );
    const dir = await production(ws, 'neon-rain', [bar({ library: 'bar', plates: [{ id: 'counter', angle: 'counter, frontal', ref: 'sets/bar/plates/counter.png' }] })], {
      'sets/bar/plates/counter.png': 'counter',
    });

    const [result] = await importSets(ws, dir);

    expect(result).toMatchObject({ created: false, added: ['counter.png', 'plate:counter'] });
    expect((await loadLibrarySet(ws, 'bar')).plates).toEqual([{ id: 'counter', angle: 'counter, frontal', file: 'counter.png' }]);
  });

  it('repairs a plate whose named image is missing on disk', async () => {
    const ws = await workspace();
    await addLibrarySet(ws, { name: 'Bar', description: 'A narrow bar in blue neon.', prompt: 'narrow bar, blue neon, wet counter' });
    await writeFile(
      join(setEntryDir(ws, 'bar'), 'set.yaml'),
      stringify({
        version: 1,
        id: 'bar',
        name: 'Bar',
        description: 'A narrow bar in blue neon.',
        prompt: 'narrow bar, blue neon, wet counter',
        plates: [{ id: 'counter', angle: 'counter, frontal', file: 'gone.png' }],
        origin: 'manual',
        added: '2026-11-23T09:00:00.000Z',
      }),
    );
    const dir = await production(ws, 'neon-rain', [bar({ library: 'bar', plates: [{ id: 'counter', angle: 'counter, frontal', ref: 'sets/bar/plates/door.png' }] })], {
      'sets/bar/plates/door.png': 'door',
    });

    const [result] = await importSets(ws, dir);

    expect(result).toMatchObject({ created: false, added: ['door.png', 'plate:counter'] });
    expect((await loadLibrarySet(ws, 'bar')).plates).toEqual([{ id: 'counter', angle: 'counter, frontal', file: 'door.png' }]);
    expect(existsSync(join(setEntryDir(ws, 'bar'), 'door.png'))).toBe(true);
  });

  it('records every later import, even one that brings nothing new', async () => {
    const ws = await workspace();
    await libraryBar(ws);
    const dir = await production(ws, 'after-midnight', [bar({ library: 'bar', plates: [{ id: 'counter', angle: 'counter, frontal', ref: 'sets/bar/plates/counter.png' }] })], {
      'sets/bar/plates/counter.png': 'counter',
    });

    const [result] = await importSets(ws, dir, { now: new Date('2026-11-23T13:00:00Z') });

    expect(result).toMatchObject({ created: false, added: [] });
    expect((await loadLibrarySet(ws, 'bar')).history.at(-1)).toEqual({ at: '2026-11-23T13:00:00.000Z', from: 'projects/after-midnight', added: [] });
  });

  it('treats a folder named as a set file as missing', async () => {
    const ws = await workspace();
    const dir = await production(ws, 'neon-rain', [bar({ refs: ['sets/bar/start.png'] })], { 'sets/bar/start.png/keep': 'a folder, not an image' });

    const [result] = await importSets(ws, dir);

    expect(result).toMatchObject({ skipped: true, missing: ['sets/bar/start.png'] });
  });

  it('refuses a production without a set bible or an unknown set', async () => {
    const ws = await workspace();
    const dir = join(ws, 'projects', 'neon-rain');
    await mkdir(dir, { recursive: true });
    await expect(importSets(ws, dir)).rejects.toThrow(/no sets\.yaml/);

    const other = await production(ws, 'other', [bar()], {});
    await expect(importSets(ws, other, { set: 'lobby' })).rejects.toThrow(/no set "lobby"/);
  });
});

async function cliWorkspace(): Promise<string> {
  const ws = await workspace();
  for (const folder of ['config', 'templates', 'brand']) await cp(join(root, folder), join(ws, folder), { recursive: true });
  await writeFile(join(ws, 'package.json'), JSON.stringify({ name: 'coreslopper', version: '0.0.0' }));
  return ws;
}

async function video(ws: string, slug: string): Promise<string> {
  return createProject({ root: ws, slug, budget: 40 });
}

function stageDone(ws: string, dir: string) {
  return spawnSync(join(root, 'node_modules', '.bin', 'tsx'), [join(root, 'packages', 'cli', 'src', 'index.ts'), 'stage-done', dir, 'style-character'], {
    cwd: ws,
    encoding: 'utf8',
  });
}

describe('finished set bibles enter the library', () => {
  it('ST-027: Finishing style-character takes the sets in', async () => {
    const ws = await cliWorkspace();
    const dir = await video(ws, 'neon-rain');
    await production(
      ws,
      'neon-rain',
      [bar({ plates: [{ id: 'counter', angle: 'counter, frontal', ref: 'sets/bar/plates/counter.png' }] })],
      { 'sets/bar/plates/counter.png': 'counter' },
    );

    const result = stageDone(ws, dir);

    expect(result.status, result.stderr).toBe(0);
    expect((await loadProject(dir)).state.stages['style-character']?.status).toBe('done');
    expect(result.stdout).toMatch(/bar → new entry bar/);
    expect(await loadLibrarySet(ws, 'bar')).toMatchObject({
      id: 'bar',
      name: 'The bar',
      plates: [{ id: 'counter', angle: 'counter, frontal', file: 'counter.png' }],
      origin: 'projects/neon-rain',
    });
    expect(existsSync(join(setEntryDir(ws, 'bar'), 'counter.png'))).toBe(true);
  });

  it('ST-027: A failed import does not fail the stage', async () => {
    const ws = await cliWorkspace();
    const dir = await video(ws, 'neon-rain');
    await production(ws, 'neon-rain', [bar({ plates: [{ id: 'counter', angle: 'counter, frontal', ref: 'sets/bar/plates/counter.png' }] })], {});

    const result = stageDone(ws, dir);

    expect(result.status, result.stderr).toBe(0);
    expect((await loadProject(dir)).state.stages['style-character']?.status).toBe('done');
    expect(result.stderr).toMatch(/⚠.*bar.*sets\/bar\/plates\/counter\.png/);
    expect(existsSync(join(ws, 'library', 'sets', 'bar'))).toBe(false);
  });

  it('warns and keeps the stage done when the set import rejects', async () => {
    const ws = await cliWorkspace();
    const dir = await video(ws, 'neon-rain');
    await production(ws, 'neon-rain', [bar({ refs: ['sets/bar/start.png'] })], { 'sets/bar/start.png': 'start' });
    await mkdir(join(ws, 'library'), { recursive: true });
    await writeFile(join(ws, 'library', 'sets'), 'not a directory');

    const result = stageDone(ws, dir);

    expect(result.status, result.stderr).toBe(0);
    expect((await loadProject(dir)).state.stages['style-character']?.status).toBe('done');
    expect(result.stderr).toMatch(/⚠ set library:/);
    expect(await readFile(join(ws, 'library', 'sets'), 'utf8')).toBe('not a directory');
  });

  it('ST-027: A music video without a set bible takes nothing in', async () => {
    const ws = await cliWorkspace();
    await libraryBar(ws);
    const dir = await video(ws, 'neon-rain');
    const entryDir = setEntryDir(ws, 'bar');
    const before = await readFile(join(entryDir, 'set.yaml'), 'utf8');
    const beforeFiles = await readdir(entryDir);
    const beforeImage = await readFile(join(entryDir, 'counter.png'));
    expect(existsSync(join(dir, 'sets.yaml'))).toBe(false);

    const result = stageDone(ws, dir);

    expect(result.status, result.stderr).toBe(0);
    expect((await loadProject(dir)).state.stages['style-character']?.status).toBe('done');
    expect(await readFile(join(entryDir, 'set.yaml'), 'utf8')).toBe(before);
    expect(await readdir(entryDir)).toEqual(beforeFiles);
    expect(await readFile(join(entryDir, 'counter.png'))).toEqual(beforeImage);
    expect(await readdir(join(ws, 'library', 'sets'))).toEqual(['bar']);
  });
});

/** The library holds "bar" with the given references and plates, each image its own bytes. */
async function libraryBarWith(ws: string, refs: string[], plates: { id: string; angle: string }[]): Promise<void> {
  await addLibrarySet(ws, { name: 'Bar', description: 'A narrow bar in blue neon.', prompt: 'narrow bar, blue neon, wet counter' });
  for (const name of refs) {
    await writeFile(join(ws, name), `ref:${name}`);
    await addLibrarySetFile(ws, 'bar', join(ws, name), { role: 'ref' });
  }
  for (const plate of plates) {
    await writeFile(join(ws, `${plate.id}.png`), `plate:${plate.id}`);
    await addLibrarySetFile(ws, 'bar', join(ws, `${plate.id}.png`), { role: 'plate', angle: plate.angle, plate: plate.id });
  }
}

describe('using a library set', () => {
  it('ST-028: A library set is copied with every plate', async () => {
    const ws = await cliWorkspace();
    await libraryBarWith(ws, ['start.png'], [
      { id: 'counter', angle: 'counter, frontal' },
      { id: 'door', angle: 'door, from inside' },
    ]);
    const dir = await video(ws, 'neon-rain');
    expect(existsSync(join(dir, 'sets.yaml'))).toBe(false);

    const result = await useSet(ws, dir, 'bar');

    expect(result).toEqual({
      set: 'bar',
      updated: false,
      files: ['sets/bar/start.png', 'sets/bar/plates/counter.png', 'sets/bar/plates/door.png'],
      plates: ['counter', 'door'],
    });
    const bible = parse(await readFile(join(dir, 'sets.yaml'), 'utf8'));
    expect(bible.sets).toEqual([
      {
        id: 'bar',
        name: 'Bar',
        description: 'A narrow bar in blue neon.',
        prompt: 'narrow bar, blue neon, wet counter',
        refs: ['sets/bar/start.png'],
        plates: [
          { id: 'counter', angle: 'counter, frontal', ref: 'sets/bar/plates/counter.png' },
          { id: 'door', angle: 'door, from inside', ref: 'sets/bar/plates/door.png' },
        ],
        library: 'bar',
      },
    ]);
    expect(await readFile(join(dir, 'sets/bar/start.png'), 'utf8')).toBe('ref:start.png');
    expect(await readFile(join(dir, 'sets/bar/plates/counter.png'), 'utf8')).toBe('plate:counter');
    expect(await readFile(join(dir, 'sets/bar/plates/door.png'), 'utf8')).toBe('plate:door');
    expect(await validateChangedFile(join(dir, 'sets.yaml'))).toBe('sets');
  });

  it('ST-028: A second use adds only what is missing', async () => {
    const ws = await cliWorkspace();
    await libraryBarWith(ws, [], [{ id: 'counter', angle: 'counter, frontal' }]);
    const dir = await video(ws, 'neon-rain');
    await useSet(ws, dir, 'bar');
    await writeFile(join(ws, 'door.png'), 'plate:door');
    await addLibrarySetFile(ws, 'bar', join(ws, 'door.png'), { role: 'plate', angle: 'door, from inside', plate: 'door' });

    const result = await useSet(ws, dir, 'bar');

    expect(result).toEqual({ set: 'bar', updated: true, files: ['sets/bar/plates/door.png'], plates: ['door'] });
    const bible = parse(await readFile(join(dir, 'sets.yaml'), 'utf8'));
    expect(bible.sets).toHaveLength(1);
    expect(bible.sets[0].plates).toEqual([
      { id: 'counter', angle: 'counter, frontal', ref: 'sets/bar/plates/counter.png' },
      { id: 'door', angle: 'door, from inside', ref: 'sets/bar/plates/door.png' },
    ]);
    expect(await validateChangedFile(join(dir, 'sets.yaml'))).toBe('sets');
  });

  it('ST-028: A set of the same id that is not from the library refuses the use', async () => {
    const ws = await cliWorkspace();
    await libraryBarWith(ws, ['start.png'], []);
    const dir = await video(ws, 'neon-rain');
    await writeFile(
      join(dir, 'sets.yaml'),
      stringify({ version: 1, sets: [{ id: 'bar', name: 'Their bar', description: 'Their own bar, not the library.', prompt: 'their own bar' }] }),
    );
    const before = await readFile(join(dir, 'sets.yaml'), 'utf8');

    await expect(useSet(ws, dir, 'bar')).rejects.toThrow(/its own set "bar"/);

    expect(await readFile(join(dir, 'sets.yaml'), 'utf8')).toBe(before);
    expect(existsSync(join(dir, 'sets', 'bar'))).toBe(false);
  });

  it('ST-028: An episode refuses the use', async () => {
    const ws = await cliWorkspace();
    await libraryBarWith(ws, ['start.png'], []);
    await createSeriesCanon(ws, { slug: 'night-desk', title: 'Night Desk', budget: 50, format: '9x16', imageProvider: 'mock', videoProvider: 'mock', audioProvider: 'mock' } as never);
    const dir = await createEpisode(ws, { series: 'night-desk', episode: 2, slug: 'night-desk-02', budget: 10 });

    await expect(useSet(ws, dir, 'bar')).rejects.toThrow(/series canon/);

    expect(existsSync(join(dir, 'sets.yaml'))).toBe(false);
    expect(existsSync(join(dir, 'sets', 'bar'))).toBe(false);
  });

  it('leaves nothing behind when the target sets.yaml refuses the result', async () => {
    const ws = await cliWorkspace();
    await libraryBarWith(ws, ['start.png'], [{ id: 'counter', angle: 'counter, frontal' }]);
    const dir = await video(ws, 'neon-rain');
    await writeFile(join(dir, 'sets.yaml'), 'version: 2\nsets: []\n');
    const before = await readFile(join(dir, 'sets.yaml'), 'utf8');

    await expect(useSet(ws, dir, 'bar')).rejects.toThrow(/sets.yaml would be invalid/);

    expect(await readFile(join(dir, 'sets.yaml'), 'utf8')).toBe(before);
    expect(existsSync(join(dir, 'sets', 'bar'))).toBe(false);
  });

  it('copies a set into a series canon', async () => {
    const ws = await cliWorkspace();
    await libraryBarWith(ws, ['start.png'], [{ id: 'counter', angle: 'counter, frontal' }]);
    await createSeriesCanon(ws, { slug: 'harbor', title: 'Harbor', budget: 50, format: '9x16', imageProvider: 'mock', videoProvider: 'mock', audioProvider: 'mock' } as never);
    const dir = join(ws, 'projects', 'harbor');

    const result = await useSet(ws, dir, 'bar');

    expect(result).toMatchObject({ set: 'bar', updated: false, plates: ['counter'] });
    const bible = parse(await readFile(join(dir, 'sets.yaml'), 'utf8'));
    expect(bible.sets[0]).toMatchObject({ id: 'bar', library: 'bar', refs: ['sets/bar/start.png'] });
    expect(existsSync(join(dir, 'sets', 'bar', 'plates', 'counter.png'))).toBe(true);
  });
});
