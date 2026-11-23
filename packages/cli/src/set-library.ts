import { existsSync } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';
import { stringify } from 'yaml';
import { LibrarySetSchema, ValidationError, readYamlFile, writeTextAtomic, type LibrarySet } from '@coreslopper/core';
import { entryText, libraryEntryDir, libraryEntryFile, parseTags, slugOfName } from './library-entry.js';

// The workspace's set library: `library/sets/<id>/set.yaml` with the set's
// files next to it (ADR 0052). The user adds sets by hand (`addLibrarySet`);
// a project or series canon takes a copy of the entry, with every reference
// and every plate. Nothing in a production points into the library, so a later
// change there never touches a finished video.

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
