import { existsSync } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { LibrarySetSchema, ValidationError, isScriptId, readYamlFile, writeTextAtomic, type LibrarySet } from '@coreslopper/core';
import { copyByContent, entryText, fileHash, libraryEntryDir, libraryEntryFile, parseTags, slugOfName } from './library-entry.js';

// The workspace's set library: `library/sets/<id>/set.yaml` with the set's
// files next to it (ADR 0052). The user adds sets and their files by hand
// (`addLibrarySet`, `addLibrarySetFile`); a project or series canon takes a
// copy of the entry, with every reference and every plate. Nothing in a
// production points into the library, so a later change there never touches a
// finished video.

export const setEntryDir = (root: string, id: string) => libraryEntryDir(root, 'sets', id);
const setEntryFile = (root: string, id: string) => libraryEntryFile(root, 'sets', id);

export async function loadLibrarySet(root: string, id: string): Promise<LibrarySet> {
  const file = setEntryFile(root, id);
  if (!existsSync(file)) throw new ValidationError(`no library set "${id}" (${file})`);
  return readYamlFile(file, LibrarySetSchema);
}

async function saveLibrarySet(root: string, entry: LibrarySet): Promise<void> {
  const header = '# A set of the workspace library; its files lie next to this file. See docs/adr/0052-set-library.md.\n';
  await writeTextAtomic(setEntryFile(root, entry.id), header + stringify(LibrarySetSchema.parse(entry)));
}

/**
 * Whether the id is taken: its entry exists, or its folder holds files the
 * entry would not name (the aggregate's "every file in the entry's folder is
 * named by set.yaml"). An empty folder left by an interrupted write is reused.
 */
async function idTaken(root: string, id: string): Promise<'entry' | 'files' | undefined> {
  const dir = setEntryDir(root, id);
  if (!existsSync(dir)) return undefined;
  if (existsSync(setEntryFile(root, id))) return 'entry';
  return (await readdir(dir)).length > 0 ? 'files' : undefined;
}

export interface NewLibrarySet {
  name: unknown;
  description: unknown;
  prompt?: unknown;
  tags?: unknown;
}

/**
 * CMD-AddLibrarySet (`set new`): add a set to the library by hand. The id
 * comes from the name (kebab-case); a taken id is refused. Name, description
 * and prompt are required, as in a set bible. Origin is `manual`; the files
 * follow through `set add-file` (ST-025).
 */
export async function addLibrarySet(root: string, input: NewLibrarySet, now = new Date()): Promise<LibrarySet> {
  const name = entryText(input.name, 'name', 200, true)!;
  const id = slugOfName(name, 'set');
  const taken = await idTaken(root, id);
  if (taken === 'entry') throw new ValidationError(`the library has a set "${id}" already`);
  if (taken === 'files') throw new ValidationError(`the library folder for "${id}" holds files a set.yaml would not name; move them or choose another name`);
  const entry = LibrarySetSchema.parse({
    version: 1,
    id,
    name,
    description: entryText(input.description, 'description', 4000, true),
    prompt: entryText(input.prompt, 'prompt', 4000, true),
    tags: input.tags === undefined ? [] : parseTags(input.tags),
    origin: 'manual',
    added: now.toISOString(),
  });
  await mkdir(setEntryDir(root, id), { recursive: true });
  await saveLibrarySet(root, entry);
  return entry;
}

export type SetFileRole = 'ref' | 'plate';

export interface SetFileOptions {
  role: SetFileRole;
  /** plate: camera position and framing, e.g. "counter, frontal, waist height". */
  angle?: unknown;
  /** plate: its id; default from the angle (kebab-case). */
  plate?: unknown;
}

/**
 * CMD-AddLibrarySetFile (`set add-file`): copy an image into a set as a
 * reference or a plate (EVT-LibrarySetFileAdded). A plate needs its camera
 * angle; its id comes from `--plate` or the angle. A file is stored once by
 * its content, so adding the same image again changes nothing.
 */
export async function addLibrarySetFile(root: string, id: string, source: string, options: SetFileOptions, now = new Date()): Promise<LibrarySet> {
  const entry = await loadLibrarySet(root, id);
  if (!existsSync(source)) throw new ValidationError(`missing file: ${source}`);
  const { role } = options;
  if (role !== 'ref' && role !== 'plate') throw new ValidationError('role must be ref or plate');
  if (role === 'ref' && (options.angle !== undefined || options.plate !== undefined)) {
    throw new ValidationError('--angle and --plate belong to a plate; add --role plate');
  }
  const dir = setEntryDir(root, id);
  let angle: string | undefined;
  let plateId: string | undefined;
  if (role === 'plate') {
    angle = entryText(options.angle, 'camera angle', 200, true)!;
    plateId = options.plate === undefined ? slugOfName(angle, 'plate') : String(options.plate);
    if (!isScriptId(plateId)) throw new ValidationError(`not a plate id: ${plateId}`);
    const existing = entry.plates.find((plate) => plate.id === plateId);
    if (existing) {
      const same = existing.file !== undefined && existsSync(join(dir, existing.file)) && (await fileHash(join(dir, existing.file))) === (await fileHash(source));
      if (same) return entry;
      throw new ValidationError(`the set "${id}" has the plate "${plateId}" with another image; name another plate id with --plate`);
    }
  }
  const { names, added } = await copyByContent([source], dir, 'set.yaml');
  const name = names.get(source)!;
  const changes = [...added];
  if (role === 'ref') {
    if (!entry.refs.includes(name)) {
      entry.refs.push(name);
      if (!changes.includes(name)) changes.push(name);
    }
  } else {
    entry.plates.push({ id: plateId!, angle: angle!, file: name });
    changes.push(`plate:${plateId}`);
  }
  if (changes.length) {
    entry.history.push({ at: now.toISOString(), from: 'manual', added: changes });
    await saveLibrarySet(root, entry);
  }
  return entry;
}
