import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync, type Dirent } from 'node:fs';
import { copyFile, mkdir, readdir, rename, rm } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { ValidationError, isScriptId } from '@coreslopper/core';

// What the character library and the set library share (ADR 0052, one
// BC-Library): the entry id and folder (`library/<kind>/<id>/`), the
// required/optional field text, tags, the id a name becomes, the file limits,
// and the content-wise copy both use. The sound library stays its own context
// (ADR 0051) and keeps its own refusal type.

const MB = 1024 * 1024;

/** What a library entry's files may be (CMD-AddLibraryCharacter, CMD-AddLibrarySetFile). */
export const LIBRARY_FILE_LIMITS = {
  bytes: 512 * MB,
  images: ['.png', '.jpg', '.jpeg', '.webp'],
  audio: ['.wav'],
} as const;

const KINDS = {
  characters: { noun: 'character', file: 'character.yaml' },
  sets: { noun: 'set', file: 'set.yaml' },
} as const;

export type LibraryEntryKind = keyof typeof KINDS;

/** 80 characters keeps an entry id safe as a folder name on every filesystem. */
const MAX_ID = 80;

export function checkLibraryId(id: unknown, kind: LibraryEntryKind): string {
  if (typeof id !== 'string' || id.length > MAX_ID || !isScriptId(id)) throw new ValidationError(`not a library ${KINDS[kind].noun} id: ${String(id)}`);
  return id;
}

export const libraryEntryDir = (root: string, kind: LibraryEntryKind, id: string) => join(root, 'library', kind, checkLibraryId(id, kind));

export const libraryEntryFile = (root: string, kind: LibraryEntryKind, id: string) => join(libraryEntryDir(root, kind, id), KINDS[kind].file);

export function entryText(value: unknown, field: string, max: number, required = false): string | undefined {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ValidationError(`${field} is required`);
    return undefined;
  }
  if (typeof value !== 'string' || value.length > max) throw new ValidationError(`${field} must be text up to ${max} characters`);
  const trimmed = value.trim();
  if (!trimmed && required) throw new ValidationError(`${field} is required`);
  return trimmed || undefined;
}

export function parseTags(value: unknown): string[] {
  const tags = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : null;
  if (!tags) throw new ValidationError('tags must be a list or comma-separated text');
  return tags.map((tag) => String(tag).trim().slice(0, 60)).filter(Boolean);
}

/** The entry id a name becomes: "Neon Bar" → "neon-bar", or the fallback for a name without letters or digits. */
export function slugOfName(name: string, fallback: string): string {
  return name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || fallback;
}

// ------------------------------------------------------------------ files

export async function fileHash(path: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

/**
 * A safe file name: letters, digits, dot, dash, underscore, starting and
 * ending with a letter or digit so it passes the entry schema's file name.
 */
export function safeName(name: string): string {
  const base = basename(name)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\w.-]+/g, '-')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
  return base || 'file';
}

/** A name in `dir` that is free: `face.png`, then `face-2.png`. */
export function freeName(dir: string, name: string, taken: Set<string>): string {
  const extension = extname(name).toLowerCase();
  const stem = safeName(basename(name, extname(name)));
  for (let n = 1; ; n += 1) {
    const candidate = `${stem}${n === 1 ? '' : `-${n}`}${extension}`;
    if (!taken.has(candidate) && !existsSync(join(dir, candidate))) return candidate;
  }
}

/** A file copied to a hidden staging name, waiting for the entry that will name it. */
export interface StagedCopy {
  from: string;
  to: string;
}

export interface CopyOptions {
  /**
   * Copy new files to hidden staging names first. The caller writes the entry
   * that names them, then `commitCopies`; on failure it `discardCopies`, so an
   * interrupted copy never leaves a plain file the entry does not name.
   */
  stage?: boolean;
}

/**
 * Copy files into an entry's folder, once each by content: a file whose bytes
 * are already there maps to the existing name. Returns the target name per
 * source, the names that are new, and the copies still staged (empty unless
 * `stage` was asked for).
 */
export async function copyByContent(
  sources: string[],
  dir: string,
  kind: LibraryEntryKind,
  options: CopyOptions = {},
): Promise<{ names: Map<string, string>; added: string[]; staged: StagedCopy[] }> {
  await mkdir(dir, { recursive: true });
  const known = new Map<string, string>();
  for (const item of await readdir(dir, { withFileTypes: true }).catch(() => [] as Dirent[])) {
    if (item.name === KINDS[kind].file || item.name.startsWith('.')) continue;
    if (!item.isFile()) throw new ValidationError(`the library ${KINDS[kind].noun} folder holds a ${item.isSymbolicLink() ? 'link' : 'non-file'} "${item.name}"; move it away`);
    known.set(await fileHash(join(dir, item.name)), item.name);
  }
  const names = new Map<string, string>();
  const added: string[] = [];
  const staged: StagedCopy[] = [];
  const taken = new Set<string>();
  for (const source of sources) {
    if (names.has(source)) continue;
    const hash = await fileHash(source);
    const existing = known.get(hash);
    if (existing) {
      names.set(source, existing);
      continue;
    }
    const name = freeName(dir, source, taken);
    taken.add(name);
    if (options.stage) {
      const from = join(dir, `.incoming-${randomUUID()}${extname(name)}`);
      await copyFile(source, from);
      staged.push({ from, to: join(dir, name) });
    } else {
      await copyFile(source, join(dir, name));
    }
    known.set(hash, name);
    names.set(source, name);
    added.push(name);
  }
  return { names, added, staged };
}

/** Rename staged copies onto the names the written entry holds. */
export async function commitCopies(staged: StagedCopy[]): Promise<void> {
  for (const copy of staged) await rename(copy.from, copy.to);
}

/** Remove staged copies that no entry will name. */
export async function discardCopies(staged: StagedCopy[]): Promise<void> {
  for (const copy of staged) await rm(copy.from, { force: true });
}
