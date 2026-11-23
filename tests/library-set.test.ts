import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LibrarySetSchema, SetBibleSchema, ValidationError } from '@coreslopper/core';
import { validateChangedFile } from '../packages/cli/src/validate-file.ts';

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const entry = {
  version: 1,
  id: 'neon-bar',
  name: 'Neon Bar',
  description: 'A narrow bar in blue neon.',
  prompt: 'narrow bar, blue neon, wet counter',
  refs: ['bar.png'],
  plates: [{ id: 'counter', angle: 'counter, frontal, waist height', file: 'counter.png' }],
  tags: ['bar', 'neon'],
  origin: 'projects/neon-rain',
  added: '2026-11-22T10:00:00.000Z',
};

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'coreslopper-set-library-'));
  temporary.push(root);
  return root;
}

async function putEntry(root: string, id: string, set: unknown): Promise<string> {
  const dir = join(root, 'library', 'sets', id);
  await mkdir(dir, { recursive: true });
  const file = join(dir, 'set.yaml');
  await writeFile(file, JSON.stringify(set));
  return file;
}

describe('library set entry', () => {
  it('accepts a valid entry and fills the empty lists', () => {
    expect(LibrarySetSchema.parse(entry)).toMatchObject(entry);
    expect(LibrarySetSchema.parse({ ...entry, refs: undefined, plates: undefined, tags: undefined, history: undefined })).toMatchObject({
      refs: [],
      plates: [],
      tags: [],
      history: [],
    });
  });

  it('refuses a plate without an angle', () => {
    expect(() => LibrarySetSchema.parse({ ...entry, plates: [{ id: 'counter', file: 'counter.png' }] })).toThrow(/angle/i);
  });

  it('refuses a duplicate plate id', () => {
    expect(() =>
      LibrarySetSchema.parse({
        ...entry,
        plates: [
          { id: 'counter', angle: 'counter, frontal' },
          { id: 'counter', angle: 'counter, from the door' },
        ],
      }),
    ).toThrow(/duplicate plate id \\"counter\\"/);
  });

  it('refuses a file name that is not a plain file of the entry folder', () => {
    expect(() => LibrarySetSchema.parse({ ...entry, refs: ['plates/bar.png'] })).toThrow(/plain file name/);
    expect(() => LibrarySetSchema.parse({ ...entry, plates: [{ id: 'counter', angle: 'frontal', file: '../counter.png' }] })).toThrow(/plain file name/);
  });
});

describe('set bible', () => {
  const setBible = {
    version: 1,
    sets: [{ id: 'neon-bar', name: 'Neon Bar', description: 'A narrow bar in blue neon.', prompt: 'narrow bar, blue neon' }],
  };

  it('accepts a library id on a set, as a character bible does', () => {
    const bible = SetBibleSchema.parse({ ...setBible, sets: [{ ...setBible.sets[0], library: 'neon-bar' }] });
    expect(bible.sets[0]).toMatchObject({ id: 'neon-bar', library: 'neon-bar' });
    expect(SetBibleSchema.parse(setBible).sets[0]!.library).toBeUndefined();
  });

  it('refuses a library id that is not a script id', () => {
    expect(() => SetBibleSchema.parse({ ...setBible, sets: [{ ...setBible.sets[0], library: 'Neon Bar' }] })).toThrow();
  });

  it('still refuses a duplicate plate id in a set', () => {
    expect(() =>
      SetBibleSchema.parse({
        ...setBible,
        sets: [
          {
            ...setBible.sets[0],
            library: 'neon-bar',
            plates: [
              { id: 'counter', angle: 'frontal' },
              { id: 'counter', angle: 'from the door' },
            ],
          },
        ],
      }),
    ).toThrow(/duplicate plate of \\"neon-bar\\" id \\"counter\\"/);
  });
});

describe('validate-file for a library set', () => {
  it('accepts a set whose id is its folder and whose files exist', async () => {
    const root = await workspace();
    const file = await putEntry(root, 'neon-bar', entry);
    const dir = join(root, 'library', 'sets', 'neon-bar');
    await writeFile(join(dir, 'bar.png'), 'bar');
    await writeFile(join(dir, 'counter.png'), 'counter');

    expect(await validateChangedFile(file)).toBe('library set');
  });

  it('refuses a set whose id is not its folder', async () => {
    const root = await workspace();
    const dir = join(root, 'library', 'sets', 'neon-bar');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'bar.png'), 'bar');
    await writeFile(join(dir, 'counter.png'), 'counter');
    const file = await putEntry(root, 'neon-bar', { ...entry, id: 'other-bar' });

    await expect(validateChangedFile(file)).rejects.toThrow(/other-bar.*folder is "neon-bar"/);
  });

  it('refuses a set that names a missing reference or plate file', async () => {
    const root = await workspace();
    const dir = join(root, 'library', 'sets', 'neon-bar');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'counter.png'), 'counter');
    const missingRef = await putEntry(root, 'neon-bar', entry);
    await expect(validateChangedFile(missingRef)).rejects.toThrow(/names files that are missing: bar\.png/);

    await writeFile(join(dir, 'bar.png'), 'bar');
    const missingPlate = await putEntry(root, 'neon-bar', { ...entry, plates: [{ id: 'counter', angle: 'frontal', file: 'door.png' }] });
    await expect(validateChangedFile(missingPlate)).rejects.toThrow(/names files that are missing: door\.png/);
  });

  it('refuses a set with a duplicate plate id or a plate without an angle', async () => {
    const root = await workspace();
    const dir = join(root, 'library', 'sets', 'neon-bar');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'bar.png'), 'bar');
    await writeFile(join(dir, 'counter.png'), 'counter');

    const duplicate = await putEntry(root, 'neon-bar', {
      ...entry,
      plates: [
        { id: 'counter', angle: 'frontal', file: 'counter.png' },
        { id: 'counter', angle: 'from the door', file: 'counter.png' },
      ],
    });
    try {
      await validateChangedFile(duplicate);
      expect.fail('a duplicate plate id must be refused');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).details.join('\n')).toMatch(/duplicate plate id "counter"/);
    }

    const noAngle = await putEntry(root, 'neon-bar', { ...entry, plates: [{ id: 'counter', file: 'counter.png' }] });
    try {
      await validateChangedFile(noAngle);
      expect.fail('a plate without an angle must be refused');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).details.join('\n')).toMatch(/angle/i);
    }
  });
});
