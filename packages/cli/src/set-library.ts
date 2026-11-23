import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { LibrarySetSchema, ValidationError, readYamlFile, writeTextAtomic, type LibrarySet } from '@coreslopper/core';

// The workspace's set library: `library/sets/<id>/set.yaml` with the set's
// files next to it (ADR 0052). The user adds sets by hand (`addLibrarySet`);
// a project or series canon takes a copy of the entry, with every reference
// and every plate. Nothing in a production points into the library, so a later
// change there never touches a finished video.

const ID = /^[a-z0-9][a-z0-9_-]*$/;

export const libraryRoot = (root: string) => join(root, 'library', 'sets');
export const entryDir = (root: string, id: string) => join(libraryRoot(root), checkId(id));
const entryFile = (root: string, id: string) => join(entryDir(root, id), 'set.yaml');

function checkId(id: unknown): string {
  if (typeof id !== 'string' || !ID.test(id) || id.length > 80) throw new ValidationError(`not a library set id: ${String(id)}`);
  return id;
}

function text(value: unknown, field: string, max: number, required = false): string | undefined {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ValidationError(`${field} is required`);
    return undefined;
  }
  if (typeof value !== 'string' || value.length > max) throw new ValidationError(`${field} must be text up to ${max} characters`);
  const trimmed = value.trim();
  if (!trimmed && required) throw new ValidationError(`${field} is required`);
  return trimmed || undefined;
}

function parseTags(value: unknown): string[] {
  const tags = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : null;
  if (!tags) throw new ValidationError('tags must be a list or comma-separated text');
  return tags.map((tag) => String(tag).trim().slice(0, 60)).filter(Boolean);
}

function slugOf(name: string): string {
  return name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'set';
}

export async function loadLibrarySet(root: string, id: string): Promise<LibrarySet> {
  const file = entryFile(root, id);
  if (!existsSync(file)) throw new ValidationError(`no library set "${id}" (${file})`);
  return readYamlFile(file, LibrarySetSchema);
}

async function saveLibrarySet(root: string, entry: LibrarySet): Promise<void> {
  const header = '# A set of the workspace library; its files lie next to this file. See docs/adr/0052-set-library.md.\n';
  await writeTextAtomic(entryFile(root, entry.id), header + stringify(LibrarySetSchema.parse(entry)));
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
  const name = text(input.name, 'name', 200, true)!;
  const id = slugOf(name);
  if (existsSync(entryFile(root, id))) throw new ValidationError(`the library has a set "${id}" already`);
  const entry = LibrarySetSchema.parse({
    version: 1,
    id,
    name,
    description: text(input.description, 'description', 4000, true),
    prompt: text(input.prompt, 'prompt', 4000, true),
    tags: input.tags === undefined ? [] : parseTags(input.tags),
    origin: 'manual',
    added: now.toISOString(),
  });
  await mkdir(entryDir(root, id), { recursive: true });
  await saveLibrarySet(root, entry);
  return entry;
}
