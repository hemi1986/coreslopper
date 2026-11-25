import { afterEach, describe, expect, it } from 'vitest';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { LibraryCharacter, LibrarySet } from '@coreslopper/core';
import type { LibraryEntryBase } from '../../packages/cli/src/library-entry.ts';
import { createVideoProject } from '../../packages/cli/src/board-wizard.ts';
import {
  addLibraryCharacter,
  addLibraryFile,
  entryDir,
  importCharacters,
  listLibrary,
  loadLibraryCharacter,
  removeLibraryCharacter,
  removeLibraryFile,
  updateLibraryCharacter,
  useCharacter,
} from '../../packages/cli/src/character-library.ts';
import {
  addLibrarySet,
  addLibrarySetFile,
  importSets,
  listLibrarySets,
  loadLibrarySet,
  removeLibrarySet,
  removeLibrarySetFile,
  setEntryDir,
  updateLibrarySet,
  useSet,
} from '../../packages/cli/src/set-library.ts';

// The shared contract of the two bible libraries (ADR 0052, ADR 0056): one
// fixture per kind, so the lifecycle and route suites run the same scenarios
// for characters and sets. The kind-specific suites stay where they are; this
// file adds the common behaviour, it does not replace their oracle.

const temporary: string[] = [];

export async function cleanupLibraryFixtures(): Promise<void> {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
}

/** A file role as `add-file` names it, with the kind's extras. */
export interface LibraryFixtureFileOptions {
  role: string;
  angle?: unknown;
  plate?: unknown;
  transcript?: unknown;
}

export interface LibraryFixtureImportResult {
  sourceId: string;
  id?: string;
  created: boolean;
  skipped?: boolean;
  added: string[];
  missing: string[];
}

export interface LibraryFixtureUseResult {
  id: string;
  updated: boolean;
  files: string[];
  labels: string[];
}

export interface LibraryKindFixture<Entry extends LibraryEntryBase = LibraryEntryBase> {
  kind: 'characters' | 'sets';
  /** The entry file a file route never serves. */
  entryFile: string;
  /** The roles `add-file` and the board accept. */
  roles: readonly string[];
  /** The listing and bible key: `characters` / `sets`. */
  targetArray: string;
  entryDir: (root: string, id: string) => string;
  /** The board's URL family. */
  listPath: string;
  filePath: string;
  uploadPath: string;
  newInput: Record<string, unknown>;
  newId: string;
  updateInput: Record<string, unknown>;
  file: { role: string; name: string; content: string; options: LibraryFixtureFileOptions };
  upload: { role: string; name: string; content: string; invalidRole: string };
  importedId: string;
  makeWorkspace(): Promise<string>;
  makeTarget(ws: string, slug: string): Promise<string>;
  /** Write a source file for `add-file` and return its path. */
  writeSource(ws: string, name: string, content?: string): Promise<string>;
  /** Write a production with a bible of one item and its files; the folder `import` reads. */
  makeSource(ws: string, slug: string): Promise<string>;
  /** The names the entry currently holds. */
  fileNames(entry: Entry): string[];
  load(root: string, id: string): Promise<Entry>;
  list(root: string): Promise<{ entries: Entry[]; errors: { id: string; error: string }[] }>;
  add(root: string, input: Record<string, unknown>, now?: Date): Promise<Entry>;
  update(root: string, id: string, change: Record<string, unknown>): Promise<Entry>;
  addFile(root: string, id: string, source: string, options: LibraryFixtureFileOptions, now?: Date): Promise<Entry>;
  importFrom(root: string, sourceDir: string, options?: { sourceId?: string; into?: string; now?: Date }): Promise<LibraryFixtureImportResult[]>;
  useIn(root: string, targetDir: string, id: string, options?: { states?: string[] | 'all' }): Promise<LibraryFixtureUseResult>;
  removeFile(root: string, id: string, name: unknown): Promise<Entry>;
  remove(root: string, id: string): Promise<void>;
}

/** A workspace with the files `createVideoProject` reads. */
async function makeWorkspace(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'coreslopper-library-fixture-'));
  temporary.push(dir);
  for (const folder of ['config', 'templates', 'brand']) await cp(join(process.cwd(), folder), join(dir, folder), { recursive: true });
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'coreslopper', version: '0.0.0' }));
  return dir;
}

/** A music video, the target a use copies into. */
async function makeTarget(ws: string, slug: string): Promise<string> {
  return createVideoProject(ws, {
    slug,
    title: slug,
    artist: 'Test Artist',
    budget: 40,
    imageProvider: 'mock',
    videoProvider: 'mock',
    language: 'en',
    rights: 'own song',
    license: 'all rights reserved',
  });
}

async function writeSource(ws: string, name: string, content = name): Promise<string> {
  const path = join(ws, name);
  await writeFile(path, content);
  return path;
}

/** A production with one character: the sheet doubles as its reference. */
async function makeCharacterSource(ws: string, slug: string): Promise<string> {
  const dir = join(ws, 'projects', slug);
  await mkdir(join(dir, 'characters', 'fixture-muse'), { recursive: true });
  await writeFile(join(dir, 'characters', 'fixture-muse', 'sheet.png'), 'sheet');
  await writeFile(
    join(dir, 'characters.yaml'),
    [
      'version: 1',
      'characters:',
      '  - id: fixture-muse',
      '    name: Fixture Muse',
      '    description: A character from the shared fixture.',
      '    sheet: characters/fixture-muse/sheet.png',
      '    refs: [characters/fixture-muse/sheet.png]',
      '    prompt: fixture muse, shared',
      '',
    ].join('\n'),
  );
  return dir;
}

/** A production with one set: a reference and a plate in its nested folder. */
async function makeSetSource(ws: string, slug: string): Promise<string> {
  const dir = join(ws, 'projects', slug);
  await mkdir(join(dir, 'sets', 'fixture-stage', 'plates'), { recursive: true });
  await writeFile(join(dir, 'sets', 'fixture-stage', 'ref.png'), 'ref');
  await writeFile(join(dir, 'sets', 'fixture-stage', 'plates', 'front.png'), 'plate');
  await writeFile(
    join(dir, 'sets.yaml'),
    [
      'version: 1',
      'sets:',
      '  - id: fixture-stage',
      '    name: Fixture Stage',
      '    description: A set from the shared fixture.',
      '    prompt: empty stage, shared fixture',
      '    refs: [sets/fixture-stage/ref.png]',
      '    plates:',
      '      - id: front',
      '        angle: front, wide',
      '        ref: sets/fixture-stage/plates/front.png',
      '',
    ].join('\n'),
  );
  return dir;
}

const characterFileNames = (entry: LibraryCharacter): string[] =>
  [entry.sheet, ...entry.refs, entry.voice?.ref, ...entry.states.map((state) => state.ref)].filter((name): name is string => Boolean(name));

const setFileNames = (entry: LibrarySet): string[] =>
  [...entry.refs, ...entry.plates.map((plate) => plate.file)].filter((name): name is string => Boolean(name));

export const characterLibraryFixture: LibraryKindFixture<LibraryCharacter> = {
  kind: 'characters',
  entryFile: 'character.yaml',
  roles: ['ref', 'sheet', 'voice'],
  targetArray: 'characters',
  entryDir,
  listPath: '/api/library',
  filePath: '/library-files',
  uploadPath: '/api/upload/library',
  newInput: { name: 'Fixture Character', description: 'A character from the shared fixture.', prompt: 'fixture character' },
  newId: 'fixture-character',
  updateInput: { description: 'Updated from the shared fixture.' },
  file: { role: 'ref', name: 'fixture.png', content: 'fixture image', options: { role: 'ref' } },
  upload: { role: 'ref', name: 'fixture-upload.png', content: 'fixture upload', invalidRole: 'plate' },
  importedId: 'fixture-muse',
  makeWorkspace,
  makeTarget,
  writeSource,
  makeSource: makeCharacterSource,
  fileNames: characterFileNames,
  load: loadLibraryCharacter,
  list: async (root) => {
    const { characters, errors } = await listLibrary(root);
    return { entries: characters, errors };
  },
  add: async (root, input, now) => addLibraryCharacter(root, input as never, now),
  update: async (root, id, change) => updateLibraryCharacter(root, id, change as never),
  addFile: async (root, id, source, options, now) =>
    addLibraryFile(root, id, source, options.role as 'ref' | 'sheet' | 'voice', options.transcript as string | undefined, now),
  importFrom: async (root, sourceDir, options = {}) => {
    const results = await importCharacters(root, sourceDir, { character: options.sourceId, into: options.into, now: options.now });
    return results.map((result) => ({ sourceId: result.character, id: result.id, created: result.created, added: result.added, missing: result.missing }));
  },
  useIn: async (root, targetDir, id, options = {}) => {
    const result = await useCharacter(root, targetDir, id, options.states === undefined ? {} : { states: options.states });
    return { id: result.character, updated: result.updated, files: result.files, labels: result.states };
  },
  removeFile: removeLibraryFile,
  remove: async (root, id) => {
    await removeLibraryCharacter(root, id);
  },
};

export const setLibraryFixture: LibraryKindFixture<LibrarySet> = {
  kind: 'sets',
  entryFile: 'set.yaml',
  roles: ['ref', 'plate'],
  targetArray: 'sets',
  entryDir: setEntryDir,
  listPath: '/api/sets',
  filePath: '/set-files',
  uploadPath: '/api/upload/sets',
  newInput: { name: 'Fixture Set', description: 'A set from the shared fixture.', prompt: 'fixture set, empty' },
  newId: 'fixture-set',
  updateInput: { description: 'Updated from the shared fixture.' },
  file: { role: 'ref', name: 'fixture.png', content: 'fixture image', options: { role: 'ref' } },
  upload: { role: 'ref', name: 'fixture-upload.png', content: 'fixture upload', invalidRole: 'voice' },
  importedId: 'fixture-stage',
  makeWorkspace,
  makeTarget,
  writeSource,
  makeSource: makeSetSource,
  fileNames: setFileNames,
  load: loadLibrarySet,
  list: async (root) => {
    const { sets, errors } = await listLibrarySets(root);
    return { entries: sets, errors };
  },
  add: async (root, input, now) => addLibrarySet(root, input as never, now),
  update: async (root, id, change) => updateLibrarySet(root, id, change as never),
  addFile: async (root, id, source, options, now) =>
    (await addLibrarySetFile(root, id, source, { role: options.role as 'ref' | 'plate', angle: options.angle, plate: options.plate }, now)).entry,
  importFrom: async (root, sourceDir, options = {}) => {
    const results = await importSets(root, sourceDir, { set: options.sourceId, into: options.into, now: options.now });
    return results.map((result) => ({
      sourceId: result.set,
      id: result.id,
      created: result.created,
      ...(result.skipped ? { skipped: true } : {}),
      added: result.added,
      missing: result.missing,
    }));
  },
  useIn: async (root, targetDir, id) => {
    const result = await useSet(root, targetDir, id);
    return { id: result.set, updated: result.updated, files: result.files, labels: result.plates };
  },
  removeFile: removeLibrarySetFile,
  remove: async (root, id) => {
    await removeLibrarySet(root, id);
  },
};

/**
 * The lifecycle both libraries share: add, update, add-file, import, use,
 * remove-file and remove. Each scenario runs against one kind fixture; the
 * kind-specific rules stay in `character-library.test.ts` and
 * `set-library.test.ts`.
 */
export function describeLibraryLifecycle<Entry extends LibraryEntryBase>(fixture: LibraryKindFixture<Entry>): void {
  describe(`the ${fixture.kind} library lifecycle`, () => {
    afterEach(cleanupLibraryFixtures);

    it('adds an entry by hand and updates its words under the same id', async () => {
      const ws = await fixture.makeWorkspace();
      const added = await fixture.add(ws, fixture.newInput, new Date('2026-11-25T10:00:00Z'));

      expect(added).toMatchObject({ id: fixture.newId, origin: 'manual', added: '2026-11-25T10:00:00.000Z' });
      expect(existsSync(join(fixture.entryDir(ws, fixture.newId), fixture.entryFile))).toBe(true);
      expect(await fixture.load(ws, fixture.newId)).toMatchObject({ id: fixture.newId, origin: 'manual' });
      expect((await fixture.list(ws)).entries.map((entry) => entry.id)).toContain(fixture.newId);

      const updated = await fixture.update(ws, fixture.newId, fixture.updateInput);

      expect(updated).toMatchObject({ id: fixture.newId, ...fixture.updateInput });
      expect(await fixture.load(ws, fixture.newId)).toMatchObject({ id: fixture.newId, ...fixture.updateInput });
    });

    it('adds a file and takes it out again', async () => {
      const ws = await fixture.makeWorkspace();
      await fixture.add(ws, fixture.newInput);
      const source = await fixture.writeSource(ws, fixture.file.name, fixture.file.content);

      const added = await fixture.addFile(ws, fixture.newId, source, fixture.file.options, new Date('2026-11-25T11:00:00Z'));

      expect(fixture.fileNames(added)).toContain(fixture.file.name);
      expect(existsSync(join(fixture.entryDir(ws, fixture.newId), fixture.file.name))).toBe(true);
      expect(await readFile(join(fixture.entryDir(ws, fixture.newId), fixture.file.name), 'utf8')).toBe(fixture.file.content);

      const removed = await fixture.removeFile(ws, fixture.newId, fixture.file.name);

      expect(fixture.fileNames(removed)).not.toContain(fixture.file.name);
      expect(existsSync(join(fixture.entryDir(ws, fixture.newId), fixture.file.name))).toBe(false);
      expect(fixture.fileNames(await fixture.load(ws, fixture.newId))).not.toContain(fixture.file.name);
    });

    it('imports a production and copies the entry into a target', async () => {
      const ws = await fixture.makeWorkspace();
      const source = await fixture.makeSource(ws, 'fixture-source');

      const [imported] = await fixture.importFrom(ws, source, { now: new Date('2026-11-25T12:00:00Z') });

      expect(imported).toMatchObject({ sourceId: fixture.importedId, id: fixture.importedId, created: true });
      expect(await fixture.load(ws, fixture.importedId)).toMatchObject({ id: fixture.importedId, origin: 'projects/fixture-source' });
      expect((await fixture.list(ws)).entries.map((entry) => entry.id)).toContain(fixture.importedId);

      const target = await fixture.makeTarget(ws, 'fixture-target');
      const used = await fixture.useIn(ws, target, fixture.importedId);

      expect(used).toMatchObject({ id: fixture.importedId, updated: false });
      expect(used.files.length).toBeGreaterThan(0);
      for (const file of used.files) expect(existsSync(join(target, file))).toBe(true);
      const bible = parse(await readFile(join(target, `${fixture.targetArray}.yaml`), 'utf8'));
      expect(bible[fixture.targetArray]).toHaveLength(1);
      expect(bible[fixture.targetArray][0]).toMatchObject({ id: fixture.importedId, library: fixture.importedId });

      const again = await fixture.useIn(ws, target, fixture.importedId);

      expect(again).toMatchObject({ id: fixture.importedId, updated: true, files: [], labels: [] });
      expect(parse(await readFile(join(target, `${fixture.targetArray}.yaml`), 'utf8'))[fixture.targetArray]).toHaveLength(1);
    });

    it('removes an entry and its files', async () => {
      const ws = await fixture.makeWorkspace();
      await fixture.add(ws, fixture.newInput);
      const source = await fixture.writeSource(ws, fixture.file.name, fixture.file.content);
      await fixture.addFile(ws, fixture.newId, source, fixture.file.options);

      await fixture.remove(ws, fixture.newId);

      expect(existsSync(fixture.entryDir(ws, fixture.newId))).toBe(false);
      await expect(fixture.load(ws, fixture.newId)).rejects.toThrow();
      expect((await fixture.list(ws)).entries.map((entry) => entry.id)).not.toContain(fixture.newId);
    });
  });
}
