import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addLibrarySet, entryDir, loadLibrarySet } from '../packages/cli/src/set-library.ts';
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
    expect(await loadLibrarySet(ws, 'neon-bar')).toEqual(entry);
    expect(await validateChangedFile(join(entryDir(ws, 'neon-bar'), 'set.yaml'))).toBe('library set');
  });
});
