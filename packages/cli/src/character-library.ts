import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { basename, extname, join, resolve, sep } from 'node:path';
import { isMap, isSeq, parse as parseYaml, type YAMLSeq } from 'yaml';
import {
  CharacterBibleSchema,
  LibraryCharacterSchema,
  ValidationError,
  isScriptId,
  readYamlFile,
  type Character,
  type LibraryCharacter,
} from '@coreslopper/core';
import {
  LIBRARY_FILE_LIMITS,
  defineLibraryKind,
  entryText,
  fileHash,
  freeName,
  libraryEntryDir,
  libraryEntryFile,
  librarySourceLabel,
  safeName,
  type LibraryIncoming,
} from './library-entry.js';

export { libraryTarget, libraryTargets, libraryTargetKind } from './library-entry.js';

// The workspace's character library: `library/characters/<id>/character.yaml`
// with the character's files next to it. Characters of finished
// style-character stages and series canons come in through `importCharacters`;
// the user adds others by hand (`addLibraryCharacter`, `addLibraryFile`). A
// project or canon takes a copy (`useCharacter`): identity and outfits always,
// each continuity state only when chosen. Nothing in a project points into
// the library, so a later change there never touches a finished video.

const isImage = (file: string) => (LIBRARY_FILE_LIMITS.images as readonly string[]).includes(extname(file).toLowerCase());

type RawCharacter = Record<string, unknown> & { states?: Record<string, unknown>[] };

/** The characters of a production or canon, with the notes the schema keeps out of `states`. */
async function readBible(root: string, sourceDir: string): Promise<LibraryIncoming<{ character: Character; raw?: RawCharacter }>[]> {
  const file = join(sourceDir, 'characters.yaml');
  if (!existsSync(file)) throw new ValidationError(`${librarySourceLabel(root, sourceDir)} has no characters.yaml`);
  const bible = await readYamlFile(file, CharacterBibleSchema);
  const raw = (parseYaml(await readFile(file, 'utf8')) as { characters?: RawCharacter[] } | null)?.characters ?? [];
  return bible.characters.map((character, index) => ({
    sourceId: character.id,
    name: character.name,
    description: character.description,
    prompt: character.prompt,
    named: [character.sheet, ...character.refs, character.voice?.ref, ...character.states.map((state) => state.ref)],
    data: { character, raw: raw[index] },
  }));
}

/** The library entry for an incoming character: its link, a same-id entry with shared content, or a new free id. */
async function matchEntry(root: string, character: Character, files: string[], slug: string): Promise<string> {
  if (character.library && existsSync(libraryEntryFile(root, 'characters', character.library))) return character.library;
  const base = isScriptId(character.id) ? character.id : safeName(character.id).replace(/\./g, '-') || 'character';
  if (!existsSync(libraryEntryFile(root, 'characters', base))) return base;
  const hashes = new Set<string>();
  for (const name of await readdir(libraryEntryDir(root, 'characters', base))) if (name !== 'character.yaml') hashes.add(await fileHash(join(libraryEntryDir(root, 'characters', base), name)));
  for (const file of files) if (hashes.has(await fileHash(file))) return base;
  for (let n = 1; ; n += 1) {
    const candidate = `${base}-${slug}${n === 1 ? '' : `-${n}`}`.slice(0, 80);
    if (!existsSync(libraryEntryFile(root, 'characters', candidate))) return candidate;
  }
}

/** The state's row in a target's characters.yaml: its file path, and `from` only when that state came too. */
const stateNode = (state: LibraryCharacter['states'][number], taken: string[], copied: (name: string) => string) => {
  const { ref, from, ...rest } = state;
  return { ...rest, ...(ref ? { ref: copied(ref) } : {}), ...(from && taken.includes(from) ? { from } : {}) };
};

const kind = defineLibraryKind<LibraryCharacter, 'character', NewLibraryCharacter, { character: Character; raw?: RawCharacter }, LibraryCharacter['states']>({
  kind: 'characters',
  noun: 'character',
  entryFile: 'character.yaml',
  header: '# A character of the workspace library; its files lie next to this file. See docs/adr/0034-character-library.md.\n',
  schema: LibraryCharacterSchema,
  useFile: 'characters.yaml',
  useName: 'character',
  cover: (entry) => entry.sheet ?? entry.refs.find(isImage) ?? entry.states.find((state) => state.ref)?.ref,
  acceptsId: true,
  fallbackId: 'character',
  entryTakenMessage: (id) => `the library has a character "${id}" already`,
  newFields: (input) => {
    const face = input.face ?? 'full';
    if (!['full', 'silhouette', 'screen-only', 'voice-only'].includes(String(face))) throw new ValidationError('face must be full, silhouette, screen-only, or voice-only');
    return { face: face as LibraryCharacter['face'] };
  },
  fileMode: 'copy',
  roles: ['ref', 'sheet', 'voice'],
  role: (role) => ({ extensions: role === 'voice' ? LIBRARY_FILE_LIMITS.audio : LIBRARY_FILE_LIMITS.images, label: role }),
  recordFile: (entry, name, options) => {
    if (options.role === 'voice') {
      entry.voice = { ref: name, transcript: entryText(options.transcript, 'transcript', 2000, true)! };
    } else if (options.role === 'sheet') {
      if (entry.sheet && !entry.refs.includes(entry.sheet)) entry.refs.unshift(entry.sheet);
      entry.sheet = name;
      entry.refs = entry.refs.filter((ref) => ref !== name);
    } else if (!entry.refs.includes(name)) {
      entry.refs.push(name);
    }
    return [name];
  },
  unnameFile: (entry, file) => {
    let named = false;
    if (entry.sheet === file) {
      delete entry.sheet;
      named = true;
    }
    if (entry.refs.includes(file)) {
      entry.refs = entry.refs.filter((ref) => ref !== file);
      named = true;
    }
    if (entry.voice?.ref === file) {
      delete entry.voice;
      named = true;
    }
    for (const state of entry.states) {
      if (state.ref === file) {
        delete state.ref;
        named = true;
      }
    }
    return named;
  },
  removeMode: 'strict',
  importSource: {
    read: readBible,
    present: (sourceDir, path) => {
      const resolved = resolve(sourceDir, path);
      return existsSync(resolved) && resolved.startsWith(resolve(sourceDir) + sep);
    },
    match: (root, incoming, files, slug) => matchEntry(root, incoming.data.character, files, slug),
    fields: (incoming) => ({ face: incoming.data.character.face, refs: [], states: [] }),
    merge: (entry, incoming, context) => {
      const { character, raw } = incoming.data;
      const sheet = context.name(character.sheet);
      if (sheet && !entry.sheet) entry.sheet = sheet;
      if (!entry.prompt && character.prompt) entry.prompt = character.prompt;
      const voice = context.name(character.voice?.ref);
      if (voice && character.voice && !entry.voice) entry.voice = { ref: voice, transcript: character.voice.transcript };
      for (const ref of character.refs) {
        const target = context.name(ref);
        if (target && target !== entry.sheet && !entry.refs.includes(target)) entry.refs.push(target);
      }
      const adds: string[] = [];
      for (const [stateIndex, state] of character.states.entries()) {
        const ref = context.name(state.ref);
        const same = entry.states.find((existing) => existing.id === state.id);
        if (same && (same.ref === ref || !ref)) continue;
        const stateId = same ? `${state.id}-${context.slug}`.slice(0, 80) : state.id;
        if (entry.states.some((existing) => existing.id === stateId)) continue;
        // Keep the canon's extra notes on a state (use, expression, defect, note).
        const extras = { ...(raw?.states?.[stateIndex] ?? {}) } as Record<string, unknown>;
        delete extras.ref;
        delete extras.from;
        entry.states.push({ ...extras, id: stateId, description: state.description, ...(state.prompt ? { prompt: state.prompt } : {}), ...(ref ? { ref } : {}), ...(state.from ? { from: state.from } : {}) });
        adds.push(`state:${stateId}`);
      }
      return adds;
    },
    skipWithoutFiles: 'omit',
  },
  use: {
    episodeRefusal: 'an episode takes its characters from the series canon; use the character in the series instead',
    empty: 'version: 1\ncharacters: []\n',
    schema: CharacterBibleSchema,
    plan: async (entry, options, dir) => {
      const wanted = options.states === 'all' ? entry.states.map((state) => state.id) : (options.states ?? []);
      const unknown = wanted.filter((state) => !entry.states.some((existing) => existing.id === state));
      if (unknown.length) throw new ValidationError(`${entry.id} has no state ${unknown.join(', ')}; it has ${entry.states.map((state) => state.id).join(', ') || 'none'}`);
      const states = entry.states.filter((state) => wanted.includes(state.id));
      const names = [entry.sheet, ...entry.refs, entry.voice?.ref, ...states.map((state) => state.ref)].filter(Boolean) as string[];
      const absent = names.filter((name) => !existsSync(join(dir, name)));
      if (absent.length) throw new ValidationError(`library files of ${entry.id} are missing: ${absent.join(', ')}`);
      return { files: names.map((name) => ({ name })), data: states };
    },
    refuse: (existing, targetDir) => {
      const target = String(existing.get('id'));
      if (existing.get('library') !== target) throw new ValidationError(`${basename(targetDir)} has its own character "${target}" already; rename it or remove it first`);
    },
    row: (entry, plan, copied) => ({
      labels: plan.data.map((state) => state.id),
      node: {
        id: entry.id,
        name: entry.name,
        description: entry.description,
        ...(entry.sheet ? { sheet: copied(entry.sheet) } : {}),
        refs: entry.refs.map((name) => copied(name)),
        ...(entry.prompt ? { prompt: entry.prompt } : {}),
        ...(entry.voice ? { voice: { ref: copied(entry.voice.ref), transcript: entry.voice.transcript } } : {}),
        face: entry.face,
        ...(plan.data.length ? { states: plan.data.map((state) => stateNode(state, plan.data.map((taken) => taken.id), copied)) } : {}),
        library: entry.id,
      },
    }),
    merge: (existing, doc, entry, plan, copied) => {
      const refs = existing.get('refs');
      const refList = isSeq(refs) ? refs : (existing.set('refs', doc.createNode([])), existing.get('refs') as YAMLSeq);
      const have = new Set(refList.items.map((item) => String((item as { value?: unknown }).value ?? item)));
      for (const name of entry.refs) if (!have.has(copied(name))) refList.add(doc.createNode(copied(name)));
      if (!existing.get('sheet') && entry.sheet) existing.set('sheet', copied(entry.sheet));
      if (!existing.get('voice') && entry.voice) existing.set('voice', doc.createNode({ ref: copied(entry.voice.ref), transcript: entry.voice.transcript }));
      const stateList = isSeq(existing.get('states')) ? (existing.get('states') as YAMLSeq) : (existing.set('states', doc.createNode([])), existing.get('states') as YAMLSeq);
      const haveStates = new Set(stateList.items.map((item) => (isMap(item) ? String(item.get('id')) : '')));
      const labels: string[] = [];
      const taken = plan.data.map((state) => state.id);
      for (const state of plan.data) {
        if (haveStates.has(state.id)) continue;
        stateList.add(doc.createNode(stateNode(state, taken, copied)));
        labels.push(state.id);
      }
      return { labels, changed: true };
    },
  },
});

/** The lifecycle descriptor the board's character routes are driven by. */
export const libraryKind = kind;

export const libraryRoot = kind.root;
export const entryDir = kind.entryDir;

/** Where a library character is used: a project or series whose characters.yaml names it in `library`. */
export interface LibraryUse {
  scope: 'project' | 'series';
  slug: string;
  /** True when the production is a demo production; absent otherwise. */
  demo?: true;
  /** The character's id there (usually the library id). */
  character: string;
}

export interface LibraryEntry extends LibraryCharacter {
  /** The picture for cards: the sheet, else the first image reference. */
  cover?: string;
  usedIn: LibraryUse[];
}

export const loadLibraryCharacter = kind.load;
const saveLibraryCharacter = kind.save;

/** Every project and series that uses a library character, by library id. */
export async function libraryUses(root: string): Promise<Map<string, LibraryUse[]>> {
  return kind.uses(root);
}

/** The library, sorted by name, with where each character is used. Entries that do not load are skipped with a warning in `errors`. */
export async function listLibrary(root: string): Promise<{ characters: LibraryEntry[]; errors: { id: string; error: string }[] }> {
  const { entries, errors } = await kind.list(root);
  return { characters: entries, errors };
}

// ----------------------------------------------------------------- import

export interface ImportResult {
  /** The character's id in the project or canon. */
  character: string;
  /** The library entry it went into. */
  id: string;
  created: boolean;
  /** New files and `state:<id>` entries. */
  added: string[];
  /** Files the character names that do not exist. */
  missing: string[];
}

export interface ImportOptions {
  /** Only this character of the source; all with at least one file otherwise. */
  character?: string;
  /** Put it into this library entry (an earlier copy of the same character). */
  into?: string;
  now?: Date;
}

/**
 * Bring the characters of a project or series canon into the library. A
 * character already taken from the library (`library: <id>`) adds its new
 * files and states to that entry; so does one with the same id whose files
 * share content with the entry. Any other character becomes a new entry,
 * named `<id>-<slug>` if its id is taken. Identity fields of an existing entry
 * stay; only missing ones are filled in.
 */
export async function importCharacters(root: string, sourceDir: string, options: ImportOptions = {}): Promise<ImportResult[]> {
  const outcomes = await kind.importFrom(root, sourceDir, { sourceId: options.character, into: options.into, now: options.now });
  return outcomes.map((outcome) => ({ character: outcome.sourceId, id: outcome.id!, created: outcome.created, added: outcome.added, missing: outcome.missing }));
}

// ------------------------------------------------------------ manual entry

export interface NewLibraryCharacter {
  id?: unknown;
  name: unknown;
  description: unknown;
  prompt?: unknown;
  face?: unknown;
  tags?: unknown;
}

/** A new library character without files yet; files follow through `addLibraryFile`. */
export async function addLibraryCharacter(root: string, input: NewLibraryCharacter, now = new Date()): Promise<LibraryCharacter> {
  return kind.add(root, input, now);
}

export type LibraryFileRole = 'ref' | 'sheet' | 'voice';

/** A free path in the entry's folder for an incoming file of a role. */
export async function libraryFileTarget(root: string, id: string, name: string, role: LibraryFileRole): Promise<string> {
  await loadLibraryCharacter(root, id);
  const extension = extname(name).toLowerCase();
  const allowed: readonly string[] = role === 'voice' ? LIBRARY_FILE_LIMITS.audio : LIBRARY_FILE_LIMITS.images;
  if (!allowed.includes(extension)) throw new ValidationError(`a ${role} takes ${allowed.join(' ')}; got ${extension || 'no extension'}`);
  return join(entryDir(root, id), freeName(entryDir(root, id), name, new Set()));
}

/** Record a file that is in the entry's folder as its sheet, a reference, or its voice. */
export async function recordLibraryFile(root: string, id: string, file: string, role: LibraryFileRole, transcript?: unknown, now = new Date()): Promise<LibraryCharacter> {
  const entry = await loadLibraryCharacter(root, id);
  const name = basename(file);
  if (resolve(entryDir(root, id), name) !== resolve(file)) throw new ValidationError(`${file} is not in the folder of ${id}`);
  kind.recordFile(entry, name, { role, transcript }, now, undefined);
  entry.history.push({ at: now.toISOString(), from: 'manual', added: [name] });
  await saveLibraryCharacter(root, entry);
  return entry;
}

/** Copy a file from disk into an entry (the CLI's `character add-file`). */
export async function addLibraryFile(root: string, id: string, source: string, role: LibraryFileRole, transcript?: string, now = new Date()): Promise<LibraryCharacter> {
  return (await kind.addFile(root, id, source, { role, transcript }, now)).entry;
}

/** Change the words of an entry: name, description, prompt, tags. */
export async function updateLibraryCharacter(root: string, id: string, change: Partial<NewLibraryCharacter>): Promise<LibraryCharacter> {
  return kind.update(root, id, change);
}

/** Take one file out of an entry (its reference, sheet, voice, or state image) and delete it. */
export async function removeLibraryFile(root: string, id: string, name: unknown): Promise<LibraryCharacter> {
  return kind.removeFile(root, id, name);
}

/** Delete an entry and its files. Projects keep their copies. */
export async function removeLibraryCharacter(root: string, id: string): Promise<void> {
  await kind.remove(root, id);
}

// -------------------------------------------------------------------- use

export interface UseOptions {
  /** State ids to take along, or 'all'. Identity and outfit references always come. */
  states?: string[] | 'all';
}

export interface UseResult {
  /** The character id in the target's characters.yaml. */
  character: string;
  /** True when the target had the character from the library already and only gained files or states. */
  updated: boolean;
  /** Paths written, relative to the target. */
  files: string[];
  states: string[];
}

/**
 * Copy a library character into a music video or a series canon: its files to
 * `characters/<id>/`, its entry to characters.yaml with `library: <id>`. Taking
 * the same character again adds the files and states the target lacks.
 */
export async function useCharacter(root: string, targetDir: string, id: string, options: UseOptions = {}): Promise<UseResult> {
  const result = await kind.useIn(root, targetDir, id, { states: options.states });
  return { character: result.id, updated: result.updated, files: result.files, states: result.labels };
}
