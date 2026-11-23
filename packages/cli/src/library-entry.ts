import { join } from 'node:path';
import { ValidationError, isScriptId } from '@coreslopper/core';

// What the character library and the set library share (ADR 0052, one
// BC-Library): the entry id and folder (`library/<kind>/<id>/`), the
// required/optional field text, tags, and the id a name becomes. The sound
// library stays its own context (ADR 0051) and keeps its own refusal type.

export type LibraryEntryKind = 'characters' | 'sets';

const KINDS = {
  characters: { noun: 'character', file: 'character.yaml' },
  sets: { noun: 'set', file: 'set.yaml' },
} as const;

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
