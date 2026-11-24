import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { basename, extname, join, resolve, sep } from 'node:path';
import { isMap, isSeq, parse as parseYaml, parseDocument, stringify, type YAMLMap, type YAMLSeq } from 'yaml';
import {
  CharacterBibleSchema,
  LibraryCharacterSchema,
  ValidationError,
  isScriptId,
  readYamlFile,
  writeTextAtomic,
  type Character,
  type LibraryCharacter,
} from '@coreslopper/core';
import { SLUG, projectDirs, seriesDirs } from './board-production.js';
import {
  LIBRARY_FILE_LIMITS,
  checkEntryFileName,
  checkLibraryId,
  copyByContent,
  entryText,
  fileHash,
  freeName,
  libraryEntryDir,
  libraryEntryFile,
  librarySourceLabel,
  libraryTargetKind,
  parseTags,
  safeName,
  slugOfName,
} from './library-entry.js';

// The workspace's character library: `library/characters/<id>/character.yaml`
// with the character's files next to it. Characters of finished
// style-character stages and series canons come in through `importCharacters`;
// the user adds others by hand (`addLibraryCharacter`, `addLibraryFile`). A
// project or canon takes a copy (`useCharacter`): identity and outfits always,
// each continuity state only when chosen. Nothing in a project points into
// the library, so a later change there never touches a finished video.

export const libraryRoot = (root: string) => join(root, 'library', 'characters');
export const entryDir = (root: string, id: string) => libraryEntryDir(root, 'characters', id);
const entryFile = (root: string, id: string) => libraryEntryFile(root, 'characters', id);

/** Where a library character is used: a project or series whose characters.yaml names it in `library`. */
export interface LibraryUse {
  scope: 'project' | 'series';
  slug: string;
  /** The character's id there (usually the library id). */
  character: string;
}

export interface LibraryEntry extends LibraryCharacter {
  /** The picture for cards: the sheet, else the first image reference. */
  cover?: string;
  usedIn: LibraryUse[];
}

export async function loadLibraryCharacter(root: string, id: string): Promise<LibraryCharacter> {
  const file = entryFile(root, id);
  if (!existsSync(file)) throw new ValidationError(`no library character "${id}" (${file})`);
  return readYamlFile(file, LibraryCharacterSchema);
}

async function saveLibraryCharacter(root: string, entry: LibraryCharacter): Promise<void> {
  const header = '# A character of the workspace library; its files lie next to this file. See docs/adr/0034-character-library.md.\n';
  await writeTextAtomic(entryFile(root, entry.id), header + stringify(LibraryCharacterSchema.parse(entry)));
}

/** Every project and series that uses a library character, by library id. */
export async function libraryUses(root: string): Promise<Map<string, LibraryUse[]>> {
  const uses = new Map<string, LibraryUse[]>();
  const scan = async (dirs: string[], scope: LibraryUse['scope']) => {
    for (const dir of dirs) {
      const file = join(dir, 'characters.yaml');
      if (!existsSync(file)) continue;
      const raw = await readFile(file, 'utf8')
        .then((content) => parseYaml(content) as { characters?: { id?: unknown; library?: unknown }[] } | null)
        // An unreadable characters.yaml shows up in the production view; here it uses nothing.
        .catch(() => null);
      for (const character of raw?.characters ?? []) {
        if (typeof character?.library !== 'string') continue;
        const list = uses.get(character.library) ?? [];
        list.push({ scope, slug: basename(dir), character: String(character.id) });
        uses.set(character.library, list);
      }
    }
  };
  await scan(await projectDirs(root), 'project');
  await scan(await seriesDirs(root), 'series');
  return uses;
}

const isImage = (file: string) => (LIBRARY_FILE_LIMITS.images as readonly string[]).includes(extname(file).toLowerCase());

/** The library, sorted by name, with where each character is used. Entries that do not load are skipped with a warning in `errors`. */
export async function listLibrary(root: string): Promise<{ characters: LibraryEntry[]; errors: { id: string; error: string }[] }> {
  const dirs = await readdir(libraryRoot(root), { withFileTypes: true }).catch(() => []);
  const uses = await libraryUses(root);
  const characters: LibraryEntry[] = [];
  const errors: { id: string; error: string }[] = [];
  for (const dir of dirs) {
    if (!dir.isDirectory() || !isScriptId(dir.name) || !existsSync(join(libraryRoot(root), dir.name, 'character.yaml'))) continue;
    try {
      const entry = await loadLibraryCharacter(root, dir.name);
      const cover = entry.sheet ?? entry.refs.find(isImage) ?? entry.states.find((state) => state.ref)?.ref;
      characters.push({ ...entry, ...(cover ? { cover } : {}), usedIn: uses.get(entry.id) ?? [] });
    } catch (error) {
      errors.push({ id: dir.name, error: (error as Error).message });
    }
  }
  characters.sort((a, b) => a.name.localeCompare(b.name));
  return { characters, errors };
}

// ------------------------------------------------------------------ files

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

type RawCharacter = Record<string, unknown> & { states?: Record<string, unknown>[] };

/**
 * Bring the characters of a project or series canon into the library. A
 * character already taken from the library (`library: <id>`) adds its new
 * files and states to that entry; so does one with the same id whose files
 * share content with the entry. Any other character becomes a new entry,
 * named `<id>-<slug>` if its id is taken. Identity fields of an existing entry
 * stay; only missing ones are filled in.
 */
export async function importCharacters(root: string, sourceDir: string, options: ImportOptions = {}): Promise<ImportResult[]> {
  const file = join(sourceDir, 'characters.yaml');
  if (!existsSync(file)) throw new ValidationError(`${librarySourceLabel(root, sourceDir)} has no characters.yaml`);
  const bible = await readYamlFile(file, CharacterBibleSchema);
  const raw = (parseYaml(await readFile(file, 'utf8')) as { characters?: RawCharacter[] } | null)?.characters ?? [];
  const from = librarySourceLabel(root, sourceDir);
  const slug = basename(sourceDir);
  const at = (options.now ?? new Date()).toISOString();
  if (options.character && !bible.characters.some((character) => character.id === options.character)) {
    throw new ValidationError(`${from} has no character "${options.character}"`);
  }
  if (options.into) await loadLibraryCharacter(root, options.into);
  const results: ImportResult[] = [];
  for (const [index, character] of bible.characters.entries()) {
    if (options.character && character.id !== options.character) continue;
    const local = (path: string | undefined) => (path ? resolve(sourceDir, path) : undefined);
    const exists = (path: string | undefined) => Boolean(path && existsSync(path) && resolve(path).startsWith(resolve(sourceDir) + sep));
    const named = [character.sheet, ...character.refs, character.voice?.ref, ...character.states.map((state) => state.ref)].filter(Boolean) as string[];
    const missing = named.filter((path) => !exists(local(path)));
    const files = named.map(local).filter(exists) as string[];
    if (!files.length) {
      if (options.character) throw new ValidationError(`${character.id} in ${from} has no files to take into the library`);
      continue;
    }
    const id = options.into ?? (await matchEntry(root, character, files, slug));
    const created = !existsSync(entryFile(root, id));
    const { names, added } = await copyByContent(files, entryDir(root, id), 'characters');
    const name = (path: string | undefined) => (path ? names.get(resolve(sourceDir, path)) : undefined);
    const entry: LibraryCharacter = created
      ? {
          version: 1,
          id,
          name: character.name,
          description: character.description,
          ...(character.prompt ? { prompt: character.prompt } : {}),
          face: character.face,
          refs: [],
          states: [],
          tags: [],
          origin: from,
          added: at,
          history: [],
        }
      : await loadLibraryCharacter(root, id);
    const sheet = name(character.sheet);
    if (sheet && !entry.sheet) entry.sheet = sheet;
    if (!entry.prompt && character.prompt) entry.prompt = character.prompt;
    const voice = name(character.voice?.ref);
    if (voice && character.voice && !entry.voice) entry.voice = { ref: voice, transcript: character.voice.transcript };
    for (const ref of character.refs) {
      const target = name(ref);
      if (target && target !== entry.sheet && !entry.refs.includes(target)) entry.refs.push(target);
    }
    const stateAdds: string[] = [];
    for (const [stateIndex, state] of character.states.entries()) {
      const ref = name(state.ref);
      const same = entry.states.find((existing) => existing.id === state.id);
      if (same && (same.ref === ref || !ref)) continue;
      const stateId = same ? `${state.id}-${slug}`.slice(0, 80) : state.id;
      if (entry.states.some((existing) => existing.id === stateId)) continue;
      // Keep the canon's extra notes on a state (use, expression, defect, note).
      const extras = { ...(raw[index]?.states?.[stateIndex] ?? {}) } as Record<string, unknown>;
      delete extras.ref;
      delete extras.from;
      entry.states.push({ ...extras, id: stateId, description: state.description, ...(state.prompt ? { prompt: state.prompt } : {}), ...(ref ? { ref } : {}), ...(state.from ? { from: state.from } : {}) });
      stateAdds.push(`state:${stateId}`);
    }
    const changes = [...added, ...stateAdds];
    if (!created && changes.length) entry.history.push({ at, from, added: changes });
    if (created || changes.length) await saveLibraryCharacter(root, entry);
    results.push({ character: character.id, id, created, added: changes, missing });
  }
  return results;
}

/** The library entry for an incoming character: its link, a same-id entry with shared content, or a new free id. */
async function matchEntry(root: string, character: Character, files: string[], slug: string): Promise<string> {
  if (character.library && existsSync(entryFile(root, character.library))) return character.library;
  const base = isScriptId(character.id) ? character.id : safeName(character.id).replace(/\./g, '-') || 'character';
  if (!existsSync(entryFile(root, base))) return base;
  const hashes = new Set<string>();
  for (const name of await readdir(entryDir(root, base))) if (name !== 'character.yaml') hashes.add(await fileHash(join(entryDir(root, base), name)));
  for (const file of files) if (hashes.has(await fileHash(file))) return base;
  for (let n = 1; ; n += 1) {
    const candidate = `${base}-${slug}${n === 1 ? '' : `-${n}`}`.slice(0, 80);
    if (!existsSync(entryFile(root, candidate))) return candidate;
  }
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
  const name = entryText(input.name, 'name', 200, true)!;
  const id = input.id ? checkLibraryId(input.id, 'characters') : slugOfName(name, 'character');
  if (existsSync(entryFile(root, id))) throw new ValidationError(`the library has a character "${id}" already`);
  const face = input.face ?? 'full';
  if (!['full', 'silhouette', 'screen-only', 'voice-only'].includes(String(face))) throw new ValidationError('face must be full, silhouette, screen-only, or voice-only');
  const tags = input.tags === undefined ? [] : parseTags(input.tags);
  const entry = LibraryCharacterSchema.parse({
    version: 1,
    id,
    name,
    description: entryText(input.description, 'description', 4000, true),
    ...(entryText(input.prompt, 'prompt', 4000) ? { prompt: entryText(input.prompt, 'prompt', 4000) } : {}),
    face,
    tags,
    origin: 'manual',
    added: now.toISOString(),
  });
  await mkdir(entryDir(root, id), { recursive: true });
  await saveLibraryCharacter(root, entry);
  return entry;
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
  if (role === 'voice') {
    entry.voice = { ref: name, transcript: entryText(transcript, 'transcript', 2000, true)! };
  } else if (role === 'sheet') {
    if (entry.sheet && !entry.refs.includes(entry.sheet)) entry.refs.unshift(entry.sheet);
    entry.sheet = name;
    entry.refs = entry.refs.filter((ref) => ref !== name);
  } else if (!entry.refs.includes(name)) {
    entry.refs.push(name);
  }
  entry.history.push({ at: now.toISOString(), from: 'manual', added: [name] });
  await saveLibraryCharacter(root, entry);
  return entry;
}

/** Copy a file from disk into an entry (the CLI's `character add-file`). */
export async function addLibraryFile(root: string, id: string, source: string, role: LibraryFileRole, transcript?: string, now = new Date()): Promise<LibraryCharacter> {
  if (!existsSync(source)) throw new ValidationError(`missing file: ${source}`);
  const target = await libraryFileTarget(root, id, source, role);
  await copyFile(source, target);
  try {
    return await recordLibraryFile(root, id, target, role, transcript, now);
  } catch (error) {
    await rm(target, { force: true });
    throw error;
  }
}

/** Change the words of an entry: name, description, prompt, tags. */
export async function updateLibraryCharacter(root: string, id: string, change: Partial<NewLibraryCharacter>): Promise<LibraryCharacter> {
  const entry = await loadLibraryCharacter(root, id);
  if (change.name !== undefined) entry.name = entryText(change.name, 'name', 200, true)!;
  if (change.description !== undefined) entry.description = entryText(change.description, 'description', 4000, true)!;
  if (change.prompt !== undefined) {
    const prompt = entryText(change.prompt, 'prompt', 4000);
    if (prompt) entry.prompt = prompt;
    else delete entry.prompt;
  }
  if (change.tags !== undefined) {
    entry.tags = parseTags(change.tags);
  }
  await saveLibraryCharacter(root, entry);
  return entry;
}

/** Take one file out of an entry (its reference, sheet, voice, or state image) and delete it. */
export async function removeLibraryFile(root: string, id: string, name: unknown): Promise<LibraryCharacter> {
  const entry = await loadLibraryCharacter(root, id);
  const file = checkEntryFileName('characters', name);
  if (entry.sheet === file) delete entry.sheet;
  entry.refs = entry.refs.filter((ref) => ref !== file);
  if (entry.voice?.ref === file) delete entry.voice;
  for (const state of entry.states) if (state.ref === file) delete state.ref;
  await saveLibraryCharacter(root, entry);
  await rm(join(entryDir(root, id), file), { force: true });
  return entry;
}

/** Delete an entry and its files. Projects keep their copies. */
export async function removeLibraryCharacter(root: string, id: string): Promise<void> {
  await loadLibraryCharacter(root, id);
  await rm(entryDir(root, id), { recursive: true, force: true });
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
  const entry = await loadLibraryCharacter(root, id);
  const kind = await libraryTargetKind(targetDir);
  if (kind === 'episode') throw new ValidationError('an episode takes its characters from the series canon; use the character in the series instead');
  if (!kind) throw new ValidationError(`${targetDir} is neither a project nor a series canon`);
  const wanted = options.states === 'all' ? entry.states.map((state) => state.id) : (options.states ?? []);
  const unknown = wanted.filter((state) => !entry.states.some((existing) => existing.id === state));
  if (unknown.length) throw new ValidationError(`${id} has no state ${unknown.join(', ')}; it has ${entry.states.map((state) => state.id).join(', ') || 'none'}`);
  const states = entry.states.filter((state) => wanted.includes(state.id));

  const source = (name: string) => join(entryDir(root, id), name);
  const names = [entry.sheet, ...entry.refs, entry.voice?.ref, ...states.map((state) => state.ref)].filter(Boolean) as string[];
  const absent = names.filter((name) => !existsSync(source(name)));
  if (absent.length) throw new ValidationError(`library files of ${id} are missing: ${absent.join(', ')}`);
  const folder = join(targetDir, 'characters', id);
  const { names: copied, added } = await copyByContent(names.map(source), folder, 'characters');
  const rel = (name: string | undefined) => (name ? `characters/${id}/${copied.get(source(name))}` : undefined);

  const file = join(targetDir, 'characters.yaml');
  const doc = existsSync(file) ? parseDocument(await readFile(file, 'utf8')) : parseDocument('version: 1\ncharacters: []\n');
  if (doc.errors.length) throw new ValidationError(`Invalid YAML in ${file}: ${doc.errors[0]!.message}`);
  if (!isSeq(doc.get('characters'))) doc.set('characters', doc.createNode([]));
  const list = doc.get('characters') as YAMLSeq;
  // `characters: []` parses as a flow sequence; entries go in block style like a hand-written bible.
  list.flow = false;
  const existing = list.items.find((item) => isMap(item) && item.get('id') === id) as YAMLMap | undefined;
  const stateNode = (state: (typeof states)[number]) => {
    const { ref, from, ...rest } = state;
    return { ...rest, ...(ref ? { ref: rel(ref) } : {}), ...(from && wanted.includes(from) ? { from } : {}) };
  };
  let updated = false;
  const takenStates: string[] = [];
  if (existing) {
    if (existing.get('library') !== id) {
      throw new ValidationError(`${basename(targetDir)} has its own character "${id}" already; rename it or remove it first`);
    }
    updated = true;
    const refs = existing.get('refs');
    const refList = isSeq(refs) ? refs : (existing.set('refs', doc.createNode([])), existing.get('refs') as YAMLSeq);
    const have = new Set(refList.items.map((item) => String((item as { value?: unknown }).value ?? item)));
    for (const name of entry.refs) if (!have.has(rel(name)!)) refList.add(doc.createNode(rel(name)));
    if (!existing.get('sheet') && entry.sheet) existing.set('sheet', rel(entry.sheet));
    if (!existing.get('voice') && entry.voice) existing.set('voice', doc.createNode({ ref: rel(entry.voice.ref), transcript: entry.voice.transcript }));
    const stateList = isSeq(existing.get('states')) ? (existing.get('states') as YAMLSeq) : (existing.set('states', doc.createNode([])), existing.get('states') as YAMLSeq);
    const haveStates = new Set(stateList.items.map((item) => (isMap(item) ? String(item.get('id')) : '')));
    for (const state of states) {
      if (haveStates.has(state.id)) continue;
      stateList.add(doc.createNode(stateNode(state)));
      takenStates.push(state.id);
    }
  } else {
    list.add(
      doc.createNode({
        id,
        name: entry.name,
        description: entry.description,
        ...(entry.sheet ? { sheet: rel(entry.sheet) } : {}),
        refs: entry.refs.map((name) => rel(name)),
        ...(entry.prompt ? { prompt: entry.prompt } : {}),
        ...(entry.voice ? { voice: { ref: rel(entry.voice.ref), transcript: entry.voice.transcript } } : {}),
        face: entry.face,
        ...(states.length ? { states: states.map(stateNode) } : {}),
        library: id,
      }),
    );
    takenStates.push(...states.map((state) => state.id));
  }
  const result = CharacterBibleSchema.safeParse(doc.toJS());
  if (!result.success) throw new ValidationError(`characters.yaml would be invalid: ${result.error.issues[0]?.message ?? 'unknown error'}`);
  await writeTextAtomic(file, doc.toString());
  return { character: id, updated, files: added.map((name) => `characters/${id}/${name}`), states: takenStates };
}

/** The project or series folder of a workspace for a slug, as `character` commands and the board take it. */
export async function libraryTarget(root: string, scope: unknown, slug: unknown): Promise<string> {
  if (scope !== 'project' && scope !== 'series') throw new ValidationError('scope must be project or series');
  if (typeof slug !== 'string' || !SLUG.test(slug)) throw new ValidationError(`unknown ${scope} ${String(slug)}`);
  const dirs = scope === 'series' ? await seriesDirs(root) : await projectDirs(root);
  const dir = dirs.find((entry) => basename(entry) === slug);
  if (!dir) throw new ValidationError(`unknown ${scope} ${slug}`);
  return dir;
}

/** Where a library character can go: music videos (not episodes) and series canons, with their titles. */
export async function libraryTargets(root: string): Promise<{ scope: 'project' | 'series'; slug: string; title: string }[]> {
  const targets: { scope: 'project' | 'series'; slug: string; title: string }[] = [];
  const head = async (file: string) =>
    readFile(file, 'utf8')
      .then((content) => (parseYaml(content) ?? {}) as { title?: unknown })
      .catch(() => ({}) as { title?: unknown });
  for (const dir of await projectDirs(root)) {
    // A broken project.yaml is no target; the board lists what it can read.
    const kind = await libraryTargetKind(dir).catch((error: unknown) => {
      if (error instanceof ValidationError) return undefined;
      throw error;
    });
    if (kind !== 'project') continue;
    const config = await head(join(dir, 'project.yaml'));
    targets.push({ scope: 'project', slug: basename(dir), title: typeof config.title === 'string' ? config.title : basename(dir) });
  }
  for (const dir of await seriesDirs(root)) {
    const series = await head(join(dir, 'series.yaml'));
    targets.push({ scope: 'series', slug: basename(dir), title: typeof series.title === 'string' ? series.title : basename(dir) });
  }
  return targets;
}
