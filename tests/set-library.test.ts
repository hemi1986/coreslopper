import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, truncate, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { stringify } from 'yaml';
import { loadProject } from '@coreslopper/core';
import { addLibrarySet, addLibrarySetFile, importSets, loadLibrarySet, setEntryDir } from '../packages/cli/src/set-library.ts';
import { createProject } from '../packages/cli/src/new-project.ts';
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
  it('ST-027: A music video without a set bible takes nothing in', async () => {
    const ws = await cliWorkspace();
    await libraryBar(ws);
    const dir = await video(ws, 'neon-rain');
    const before = await readFile(join(setEntryDir(ws, 'bar'), 'set.yaml'), 'utf8');
    expect(existsSync(join(dir, 'sets.yaml'))).toBe(false);

    const result = stageDone(ws, dir);

    expect(result.status, result.stderr).toBe(0);
    expect((await loadProject(dir)).state.stages['style-character']?.status).toBe('done');
    expect(await readFile(join(setEntryDir(ws, 'bar'), 'set.yaml'), 'utf8')).toBe(before);
    expect(await readdir(join(ws, 'library', 'sets'))).toEqual(['bar']);
  });
});
