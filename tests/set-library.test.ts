import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addLibrarySet, addLibrarySetFile, loadLibrarySet, setEntryDir } from '../packages/cli/src/set-library.ts';
import { validateChangedFile } from '../packages/cli/src/validate-file.ts';

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

    await expect(addLibrarySetFile(ws, 'neon-bar', animated, { role: 'ref' })).rejects.toThrow(/png, jpg or webp/);

    expect((await loadLibrarySet(ws, 'neon-bar')).refs).toEqual([]);
    expect(await readdir(dir)).toEqual(['set.yaml']);
  });
});
