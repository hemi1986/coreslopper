import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { LibraryCharacterSchema, ReferencesSchema, type LoadedProject, type Shot } from '@coreslopper/core';
import { addLibraryCharacter, addLibraryFile, entryDir, removeLibraryFile } from '../packages/cli/src/character-library.ts';
import { shotReferences } from '../packages/cli/src/queue.ts';

// Characterization tests from the adoption of the bibles and the character library (2026-11-22).
// They pin what the code does today and the decided model keeps; they do not assert what it should do.

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function folder(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'coreslopper-character-'));
  temporary.push(dir);
  return dir;
}

async function put(dir: string, path: string, content = 'x'): Promise<string> {
  await mkdir(dirname(join(dir, path)), { recursive: true });
  await writeFile(join(dir, path), content);
  return join(dir, path);
}

const libraryCharacter = (files: Record<string, unknown>) => ({
  version: 1,
  id: 'nova',
  name: 'Nova',
  description: 'A singer in a silver coat.',
  origin: 'manual',
  added: '2026-11-22T00:00:00.000Z',
  ...files,
});

describe('character slice characterization', () => {
  it('keeps every file of a library character a plain file of its own folder', () => {
    expect(LibraryCharacterSchema.safeParse(libraryCharacter({ sheet: 'sheet.png', refs: ['face.png'], voice: { ref: 'voice.wav', transcript: 'Hello.' } })).success).toBe(true);
    for (const path of ['../other/sheet.png', 'states/open.png', '/tmp/sheet.png', '.hidden.png']) {
      expect(LibraryCharacterSchema.safeParse(libraryCharacter({ sheet: path })).success).toBe(false);
      expect(LibraryCharacterSchema.safeParse(libraryCharacter({ refs: [path] })).success).toBe(false);
      expect(LibraryCharacterSchema.safeParse(libraryCharacter({ states: [{ id: 'open', description: 'Hatch open.', ref: path }] })).success).toBe(false);
    }
  });

  it('takes a user reference as either a file in assets/references/ or a link, never both or neither', () => {
    const reference = (fields: Record<string, unknown>) =>
      ReferencesSchema.safeParse({ version: 1, references: [{ id: 'r1a2b3c', kind: 'look', added: '2026-11-22', ...fields }] }).success;
    expect(reference({ file: 'assets/references/mood.jpg' })).toBe(true);
    expect(reference({ url: 'https://example.com/board' })).toBe(true);
    expect(reference({ file: 'assets/references/mood.jpg', url: 'https://example.com/board' })).toBe(false);
    expect(reference({})).toBe(false);
    expect(reference({ file: 'assets/references/sub/mood.jpg' })).toBe(false);
    expect(reference({ file: 'characters/nova/sheet.png' })).toBe(false);
    expect(reference({ url: 'ftp://example.com/board' })).toBe(false);
  });

  it('orders a keyframe\'s references as the plate, then each character\'s state or sheet or first reference, then each prop\'s first reference', async () => {
    const dir = await folder();
    for (const path of ['sets/room/plates/wide.png', 'characters/nova/states/open.png', 'characters/kai/sheet.png', 'characters/kai/face.png', 'characters/ada/face.png', 'props/walkman/front.png', 'props/walkman/back.png']) {
      await put(dir, path);
    }
    const project = {
      paths: { root: dir },
      characters: {
        characters: [
          { id: 'nova', sheet: 'characters/nova/sheet.png', refs: [], states: [{ id: 'open', ref: 'characters/nova/states/open.png' }] },
          { id: 'kai', sheet: 'characters/kai/sheet.png', refs: ['characters/kai/face.png'], states: [] },
          { id: 'ada', refs: ['characters/ada/face.png'], states: [] },
        ],
      },
      sets: { sets: [{ id: 'room', plates: [{ id: 'wide', ref: 'sets/room/plates/wide.png' }] }], props: [{ id: 'walkman', refs: ['props/walkman/front.png', 'props/walkman/back.png'] }] },
    } as unknown as LoadedProject;
    const shot = { id: 's1', refs: { plate: 'room/wide', characters: ['nova', 'kai', 'ada'], states: { nova: 'open' }, props: ['walkman'] } } as unknown as Shot;
    expect(shotReferences(project, shot)).toEqual([
      'sets/room/plates/wide.png',
      'characters/nova/states/open.png',
      'characters/kai/sheet.png',
      'characters/ada/face.png',
      'props/walkman/front.png',
    ]);
    const missing = { ...shot, refs: { ...shot.refs, plate: 'room/close', props: ['radio'] } } as unknown as Shot;
    expect(() => shotReferences(project, missing)).toThrow(/create these references first/);
  });

  it('moves the old sheet into the references on a new sheet, and a removed file clears only the field that named it', async () => {
    const root = await folder();
    const source = await folder();
    await addLibraryCharacter(root, { name: 'Nova', description: 'A singer in a silver coat.' });
    await addLibraryFile(root, 'nova', await put(source, 'first.png'), 'sheet');
    const second = await addLibraryFile(root, 'nova', await put(source, 'second.png'), 'sheet');
    expect(second.sheet).toBe('second.png');
    expect(second.refs).toEqual(['first.png']);
    expect(second.history.map((entry) => entry.added)).toEqual([['first.png'], ['second.png']]);

    const removed = await removeLibraryFile(root, 'nova', 'second.png');
    expect(removed.sheet).toBeUndefined();
    expect(removed.refs).toEqual(['first.png']);
    expect(existsSync(join(entryDir(root, 'nova'), 'second.png'))).toBe(false);
    await expect(removeLibraryFile(root, 'nova', 'character.yaml')).rejects.toThrow(/name a file of the entry/);
    await expect(removeLibraryFile(root, 'nova', '../nova/first.png')).rejects.toThrow(/name a file of the entry/);
  });
});
