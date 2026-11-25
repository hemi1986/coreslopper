import { existsSync, statSync } from 'node:fs';
import { readFile, readdir, rm, stat } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
import { isMap, isSeq, parse as parseYaml, parseDocument, type YAMLMap, type YAMLSeq } from 'yaml';
import { LibrarySetSchema, SetBibleSchema, ValidationError, isScriptId, readYamlFile, writeTextAtomic, type LibrarySet, type SetDefinition } from '@coreslopper/core';
import {
  LIBRARY_FILE_LIMITS,
  commitCopies,
  copyByContent,
  defineLibraryKind,
  discardCopies,
  entryFileHashes,
  entryText,
  fileHash,
  librarySourceLabel,
  libraryTargetKind,
  slugOfName,
} from './library-entry.js';

// The workspace's set library: `library/sets/<id>/set.yaml` with the set's
// files next to it (ADR 0052). The user adds sets and their files by hand
// (`addLibrarySet`, `addLibrarySetFile`), corrects an entry's words
// (`updateLibrarySet`), takes a reference or a plate out again
// (`removeLibrarySetFile`) and deletes an entry (`removeLibrarySet`); the sets
// of a project or series canon come in through `importSets`; a project or
// series canon takes a copy of the entry, with every reference and every plate.
// Nothing in a production points into the library, so a later change there
// never touches a finished video. The board's Sets view reads `listLibrarySets`
// (RM-SetLibrary) and writes through the same commands.

// ------------------------------------------------------------- read model

const kind = defineLibraryKind<LibrarySet, 'set', NewLibrarySet>({
  kind: 'sets',
  noun: 'set',
  entryFile: 'set.yaml',
  header: '# A set of the workspace library; its files lie next to this file. See docs/adr/0052-set-library.md.\n',
  schema: LibrarySetSchema,
  useFile: 'sets.yaml',
  useName: 'set',
  cover: (entry) => entry.plates.find((plate) => plate.file)?.file ?? entry.refs[0],
  promptRequired: true,
  fallbackId: 'set',
  entryTakenMessage: (id) => `the library has a set "${id}" already`,
  filesTakenMessage: (id) => `the library folder for "${id}" holds files a set.yaml would not name; move them or choose another name`,
  idTaken,
  fileMode: 'stage',
  role: (role) => (role === 'ref' || role === 'plate' ? { extensions: LIBRARY_FILE_LIMITS.images, label: 'set image' } : undefined),
  roleMessage: 'role must be ref or plate',
  prepareFile: async (entry, options, source, dir) => {
    const { role } = options;
    if (role === 'ref' && (options.angle !== undefined || options.plate !== undefined)) {
      throw new ValidationError('--angle and --plate belong to a plate; add --role plate');
    }
    const bytes = (await stat(source)).size;
    if (bytes > LIBRARY_FILE_LIMITS.bytes) {
      throw new ValidationError(`a set file is at most ${LIBRARY_FILE_LIMITS.bytes / (1024 * 1024)} MB; ${basename(source)} is ${(bytes / (1024 * 1024)).toFixed(1)} MB`);
    }
    if (role === 'plate') {
      const angle = entryText(options.angle, 'camera angle', 200, true)!;
      const plateId = options.plate === undefined ? slugOfName(angle, 'plate') : String(options.plate);
      if (!isScriptId(plateId)) throw new ValidationError(`not a plate id: ${plateId}`);
      const existing = entry.plates.find((plate) => plate.id === plateId);
      if (existing) {
        if (!existing.file || !existsSync(join(dir, existing.file))) throw new ValidationError(`the plate "${plateId}" of "${entry.id}" has no image on disk; remove the plate or restore its file`);
        if ((await fileHash(join(dir, existing.file))) === (await fileHash(source))) return { noop: true };
        throw new ValidationError(`the set "${entry.id}" has the plate "${plateId}" with another image; name another plate id with --plate`);
      }
      return { angle, plateId };
    }
    return {};
  },
  recordFile: (entry, name, options, _now, prepared) => {
    if (options.role === 'ref') {
      if (entry.refs.includes(name)) return [];
      entry.refs.push(name);
      return [name];
    }
    const { angle, plateId } = prepared as { angle?: string; plateId?: string };
    entry.plates.push({ id: plateId!, angle: angle!, file: name });
    return [`plate:${plateId}`];
  },
  unnameFile: (entry, file) => {
    const named = entry.refs.includes(file) || entry.plates.some((plate) => plate.file === file);
    entry.refs = entry.refs.filter((ref) => ref !== file);
    entry.plates = entry.plates.filter((plate) => plate.file !== file);
    return named;
  },
  refuseUnnamed: true,
  removeMode: 'tolerant',
});

export const setEntryDir = kind.entryDir;
const setEntryFile = kind.entryFile;
const setLibraryRoot = kind.root;

export const loadLibrarySet = kind.load;
const saveLibrarySet = kind.save;

/** Where a library set is used: a project or series canon whose sets.yaml names it in `library`. */
export interface LibrarySetUse {
  scope: 'project' | 'series';
  slug: string;
  /** The set's id there (usually the library id). */
  set: string;
}

export interface LibrarySetEntry extends LibrarySet {
  /** The picture for cards: the first plate with an image, else the first reference. */
  cover?: string;
  usedIn: LibrarySetUse[];
}

/** Every project and series that uses a library set, by library id. */
export async function setLibraryUses(root: string): Promise<Map<string, LibrarySetUse[]>> {
  return kind.uses(root);
}

/** The library (RM-SetLibrary), sorted by name, with where each set is used. Entries that do not load are skipped with a warning in `errors`. */
export async function listLibrarySets(root: string): Promise<{ sets: LibrarySetEntry[]; errors: { id: string; error: string }[] }> {
  const { entries, errors } = await kind.list(root);
  return { sets: entries, errors };
}

/** The table of `set list`: one block per set (what it is, its files, where it is used), then the entries that did not load; a hint when nothing is there. */
export function setListLines(listing: { sets: LibrarySetEntry[]; errors: { id: string; error: string }[] }): string[] {
  if (!listing.sets.length && !listing.errors.length) {
    return ['The library has no sets yet. `set import <project>` takes a set bible in, or `set new` adds one by hand.'];
  }
  const lines: string[] = [];
  for (const set of listing.sets) {
    const plates = set.plates.map((plate) => plate.id).join(', ');
    const used = set.usedIn.map((use) => `${use.scope === 'series' ? 'series/' : ''}${use.slug}`).join(', ');
    lines.push(
      `${set.id.padEnd(20)} ${set.name}`,
      `  ${[
        set.description,
        `${set.refs.length} ${set.refs.length === 1 ? 'ref' : 'refs'}`,
        `${set.plates.length} ${set.plates.length === 1 ? 'plate' : 'plates'}${plates ? `: ${plates}` : ''}`,
        set.tags.length ? `tags: ${set.tags.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join(' · ')}`,
      `  from ${set.origin}${used ? ` · used in ${used}` : ''}`,
    );
  }
  for (const error of listing.errors) lines.push(`✖ ${error.id}: ${error.error}`);
  return lines;
}

/**
 * Whether the id is taken: its entry exists, or its folder holds files the
 * entry would not name (the aggregate's "every file in the entry's folder is
 * named by set.yaml"). An empty folder, or one left holding only staged
 * copies by an interrupted write, is reused.
 */
async function idTaken(root: string, id: string): Promise<'entry' | 'files' | undefined> {
  const dir = setEntryDir(root, id);
  if (!existsSync(dir)) return undefined;
  if (existsSync(setEntryFile(root, id))) return 'entry';
  return (await readdir(dir)).some((name) => !name.startsWith('.')) ? 'files' : undefined;
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
  return kind.add(root, input, now);
}

/**
 * CMD-UpdateLibrarySet (the board's form): change a set's name, description,
 * prompt and tags (EVT-LibrarySetUpdated). The id stays, so productions that
 * took the set keep their `library` link; name, description and prompt stay
 * required, as in a set bible.
 */
export async function updateLibrarySet(root: string, id: string, change: Partial<NewLibrarySet>): Promise<LibrarySet> {
  return kind.update(root, id, change);
}

export type SetFileRole = 'ref' | 'plate';

export interface SetFileOptions {
  role: SetFileRole;
  /** plate: camera position and framing, e.g. "counter, frontal, waist height". */
  angle?: unknown;
  /** plate: its id; default from the angle (kebab-case). */
  plate?: unknown;
}

export interface AddLibrarySetFileResult {
  entry: LibrarySet;
  /** The new file name and `plate:<id>`, empty when the set already had the file. */
  added: string[];
  /** False when the image was already stored and the entry did not change. */
  changed: boolean;
}

/**
 * CMD-AddLibrarySetFile (`set add-file`): copy an image into a set as a
 * reference or a plate (EVT-LibrarySetFileAdded). Images are png, jpg or webp,
 * at most 512 MB. A plate needs its camera angle; its id comes from `--plate`
 * or the angle. A file is stored once by its content, so adding the same image
 * again changes nothing. The copy is staged, so a failed write never leaves a
 * file the entry does not name.
 */
export async function addLibrarySetFile(root: string, id: string, source: string, options: SetFileOptions, now = new Date()): Promise<AddLibrarySetFileResult> {
  return kind.addFile(root, id, source, { role: options.role, angle: options.angle, plate: options.plate }, now);
}

/**
 * CMD-RemoveLibrarySetFile (`set remove --file`): take a file out of a set
 * (EVT-LibrarySetFileRemoved). The entry stops naming it – every reference and
 * every plate that names it, which content dedupe can make more than one – and
 * the file itself is deleted, so the aggregate's "every file in the entry's
 * folder is named by set.yaml" holds again.
 *
 * A name the entry does not name is refused, so a typo never deletes another
 * file. A name it does name whose file is already gone is repaired: removing
 * it is the only way back to a consistent entry. No history row is written –
 * history records imports, as it does for a removed character.
 */
export async function removeLibrarySetFile(root: string, id: string, name: unknown): Promise<LibrarySet> {
  return kind.removeFile(root, id, name);
}

/** EVT-LibrarySetDeleted: the entry that left the library, when its set.yaml still loaded. */
export interface RemovedLibrarySet {
  id: string;
  /** The entry as it was; absent when a hand edit broke it or the folder never held one. */
  set?: LibrarySet;
}

/**
 * CMD-DeleteLibrarySet (`set remove <id>`): delete the entry and its files
 * (EVT-LibrarySetDeleted). Productions keep their copies and their
 * `library: <id>`; nothing outside the library is touched. The board's set
 * page names the productions that use the set before it calls this (ST-032).
 *
 * The folder's presence decides, not its `set.yaml`: an entry a hand edit broke,
 * or a folder a failed write left, is removed all the same. The folder is
 * renamed into a hidden `.removing-` first, so a failed delete leaves a hidden
 * leftover instead of a half-deleted entry; the gitignore keeps that leftover
 * out of a commit.
 */
export async function removeLibrarySet(root: string, id: string): Promise<RemovedLibrarySet> {
  const removed = await kind.remove(root, id);
  return { id: removed.id, ...(removed.entry ? { set: removed.entry } : {}) };
}

// ----------------------------------------------------------------- import
export interface ImportSetResult {
  /** The set's id in the project or canon. */
  set: string;
  /** The library entry it went into; absent when the set was skipped. */
  id?: string;
  created: boolean;
  /** True when the set names no file that exists; nothing was taken in. */
  skipped?: boolean;
  /** New files, references appended from a file the entry already held, and `plate:<id>` entries. */
  added: string[];
  /** Files the set names that do not exist. */
  missing: string[];
}

export interface ImportSetsOptions {
  /** Only this set of the source; all with at least one file otherwise. */
  set?: string;
  /** Put the named set into this library entry (an earlier copy of the same set); needs `set`. */
  into?: string;
  now?: Date;
}

/** `base`, or `base-2`, `base-3` …, within 80 characters so a counter is never cut away. */
function numbered(base: string, n: number, max = 80): string {
  const suffix = n === 1 ? '' : `-${n}`;
  return `${base.slice(0, Math.max(1, max - suffix.length))}${suffix}`;
}

/** A plate id free in the entry, `<plate>-<slug>` with a counter when that too is taken. */
function freePlateId(entry: LibrarySet, base: string): string {
  for (let n = 1; ; n += 1) {
    const candidate = numbered(base, n);
    if (!entry.plates.some((plate) => plate.id === candidate)) return candidate;
  }
}

/**
 * Bring the sets of a project or series canon into the library (CMD-ImportSets).
 * A set already taken from the library (`library: <id>`) adds its new files
 * and plates to that entry; so does one with the same id whose files share
 * content with the entry. Any other set becomes a new entry, named
 * `<id>-<slug>` if its id is taken. Name, description and prompt of an existing
 * entry stay, a plate without an image gains it, and every later import is
 * recorded in the history. A set without a file is skipped with its missing
 * files reported; one named with `set` is refused instead.
 */
export async function importSets(root: string, sourceDir: string, options: ImportSetsOptions = {}): Promise<ImportSetResult[]> {
  const file = join(sourceDir, 'sets.yaml');
  if (!existsSync(file)) throw new ValidationError(`${librarySourceLabel(root, sourceDir)} has no sets.yaml`);
  const bible = await readYamlFile(file, SetBibleSchema);
  const from = librarySourceLabel(root, sourceDir);
  const slug = basename(sourceDir);
  const at = (options.now ?? new Date()).toISOString();
  if (options.into && !options.set) throw new ValidationError('--into names one entry; name the set with --id as well');
  if (options.set && !bible.sets.some((set) => set.id === options.set)) {
    throw new ValidationError(`${from} has no set "${options.set}"`);
  }
  if (options.into) await loadLibrarySet(root, options.into);
  const results: ImportSetResult[] = [];
  for (const set of bible.sets) {
    if (options.set && set.id !== options.set) continue;
    const local = (path: string | undefined) => (path ? resolve(sourceDir, path) : undefined);
    // A plain file inside the source; a folder, a link out of the source, or nothing is reported as missing.
    const exists = (path: string | undefined) => Boolean(path && resolve(path).startsWith(resolve(sourceDir) + sep) && statSync(path, { throwIfNoEntry: false })?.isFile());
    const named = [...set.refs, ...set.plates.map((plate) => plate.ref)].filter(Boolean) as string[];
    const missing = named.filter((path) => !exists(local(path)));
    const files = named.map(local).filter(exists) as string[];
    if (!files.length) {
      if (options.set) throw new ValidationError(`${set.id} in ${from} has no files to take into the library`);
      results.push({ set: set.id, created: false, skipped: true, added: [], missing });
      continue;
    }
    const id = options.into ?? (await matchSetEntry(root, set, files, slug));
    const created = !existsSync(setEntryFile(root, id));
    const { names, added, staged } = await copyByContent(files, setEntryDir(root, id), 'sets', { stage: true });
    const name = (path: string | undefined) => (path ? names.get(resolve(sourceDir, path)) : undefined);
    const entry: LibrarySet = created
      ? {
          version: 1,
          id,
          name: set.name,
          description: set.description,
          prompt: set.prompt,
          refs: [],
          plates: [],
          tags: [],
          origin: from,
          added: at,
          history: [],
        }
      : await loadLibrarySet(root, id);
    const before = created ? undefined : structuredClone(entry);
    const refAdds: string[] = [];
    for (const ref of set.refs) {
      const target = name(ref);
      if (target && !entry.refs.includes(target)) {
        entry.refs.push(target);
        refAdds.push(target);
      }
    }
    const plateAdds: string[] = [];
    for (const plate of set.plates) {
      const target = name(plate.ref);
      const same = entry.plates.find((existing) => existing.id === plate.id);
      if (!same) {
        entry.plates.push({ id: plate.id, angle: plate.angle, ...(plate.prompt ? { prompt: plate.prompt } : {}), ...(target ? { file: target } : {}) });
        plateAdds.push(`plate:${plate.id}`);
        continue;
      }
      const onDisk = same.file !== undefined && existsSync(join(setEntryDir(root, id), same.file));
      if (same.file && target && same.file !== target && onDisk) {
        // The same plate id with another image becomes a new plate, never an overwrite.
        const plateId = freePlateId(entry, `${plate.id}-${slug}`);
        entry.plates.push({ id: plateId, angle: plate.angle, ...(plate.prompt ? { prompt: plate.prompt } : {}), file: target });
        plateAdds.push(`plate:${plateId}`);
        continue;
      }
      let filled = false;
      if ((!same.file || !onDisk) && target) {
        same.file = target;
        filled = true;
      }
      if (!same.prompt && plate.prompt) {
        same.prompt = plate.prompt;
        filled = true;
      }
      if (filled) plateAdds.push(`plate:${same.id}`);
    }
    const changes = [...new Set([...added, ...refAdds, ...plateAdds])];
    if (!created) entry.history.push({ at, from, added: changes });
    try {
      await saveLibrarySet(root, entry);
    } catch (error) {
      await discardCopies(staged);
      throw error;
    }
    try {
      await commitCopies(staged);
    } catch (error) {
      if (before) await saveLibrarySet(root, before);
      else await rm(setEntryFile(root, id), { force: true });
      await discardCopies(staged);
      throw error;
    }
    results.push({ set: set.id, id, created, added: changes, missing });
  }
  return results;
}

// -------------------------------------------------------------------- use

export interface UseSetResult {
  /** The set's id in the target's sets.yaml; the library id, as the story keeps it. */
  set: string;
  /** True when the target had the set from the library already and only gained files or plates. */
  updated: boolean;
  /** Paths written, relative to the target. */
  files: string[];
  /** Plates added to the target's set. */
  plates: string[];
}

/**
 * CMD-UseLibrarySet (`set use`): copy a library set into a music video or a
 * series canon (EVT-LibrarySetUsed). Its references and every plate come along
 * – there is no choice of plates – to `sets/<id>/` and `sets/<id>/plates/`, and
 * the entry goes into the target's sets.yaml with `library: <id>`.
 */
export async function useSet(root: string, targetDir: string, id: string): Promise<UseSetResult> {
  const entry = await loadLibrarySet(root, id);
  const target = await libraryTargetKind(targetDir);
  // EVT-LibrarySetUseRefused: the target is an episode; it takes its sets from the series canon.
  if (target === 'episode') throw new ValidationError('an episode takes its sets from the series canon; use the set in the series instead');
  if (!target) throw new ValidationError(`${targetDir} is neither a project nor a series canon`);

  const source = (name: string) => join(setEntryDir(root, id), name);
  // The guarded scan: a link or non-file in the entry's folder is refused, never copied out.
  const present = new Set((await entryFileHashes(setEntryDir(root, id), 'sets')).values());
  const named = [...entry.refs, ...entry.plates.flatMap((plate) => (plate.file ? [plate.file] : []))];
  const absent = named.filter((name) => !present.has(name));
  if (absent.length) throw new ValidationError(`library files of ${id} are missing: ${absent.join(', ')}`);

  const file = join(targetDir, 'sets.yaml');
  const doc = parseDocument(existsSync(file) ? await readFile(file, 'utf8') : 'version: 1\nsets: []\n');
  if (doc.errors.length) throw new ValidationError(`Invalid YAML in ${file}: ${doc.errors[0]!.message}`);
  if (!isSeq(doc.get('sets'))) doc.set('sets', doc.createNode([]));
  const list = doc.get('sets') as YAMLSeq;
  // `sets: []` parses as a flow sequence; entries go in block style like a hand-written bible.
  list.flow = false;
  const existing = list.items.find((item) => isMap(item) && item.get('id') === id) as YAMLMap | undefined;
  if (existing && existing.get('library') !== id) {
    // EVT-LibrarySetUseRefused: the target has a set of that id that is not linked to the entry.
    const linked = existing.get('library');
    throw new ValidationError(
      typeof linked === 'string'
        ? `${basename(targetDir)} has the set "${id}" from another library set ("${linked}"); remove it first`
        : `${basename(targetDir)} has its own set "${id}" already; rename it or remove it first`,
    );
  }

  const folder = join(targetDir, 'sets', id);
  const folderExisted = existsSync(folder);
  const refCopies = await copyByContent(entry.refs.map(source), folder, 'sets', { stage: true, nestedFolders: true });
  const plateSources = entry.plates.flatMap((plate) => (plate.file ? [source(plate.file)] : []));
  const plateCopies = plateSources.length
    ? await copyByContent(plateSources, join(folder, 'plates'), 'sets', { stage: true })
    : { names: new Map<string, string>(), added: [], staged: [] };
  const staged = [...refCopies.staged, ...plateCopies.staged];
  /** Discard the staged copies; a folder this use created goes with them. */
  const cleanup = async () => {
    await discardCopies(staged);
    if (!folderExisted) await rm(folder, { recursive: true, force: true });
  };
  const ref = (name: string) => `sets/${id}/${refCopies.names.get(source(name))!}`;
  const plateRef = (name: string) => `sets/${id}/plates/${plateCopies.names.get(source(name))!}`;
  const plateNode = (plate: (typeof entry.plates)[number]) => ({
    id: plate.id,
    angle: plate.angle,
    ...(plate.prompt ? { prompt: plate.prompt } : {}),
    ...(plate.file ? { ref: plateRef(plate.file) } : {}),
  });

  const addedRefs: string[] = [];
  const addedPlates: string[] = [];
  if (existing) {
    const refsNode = existing.get('refs');
    const refList = isSeq(refsNode) ? refsNode : (existing.set('refs', doc.createNode([])), existing.get('refs') as YAMLSeq);
    const haveRefs = new Set(refList.items.map((item) => String((item as { value?: unknown }).value ?? item)));
    for (const name of entry.refs) {
      const path = ref(name);
      if (haveRefs.has(path)) continue;
      refList.add(doc.createNode(path));
      addedRefs.push(path);
    }
    const platesNode = existing.get('plates');
    const plateList = isSeq(platesNode) ? platesNode : (existing.set('plates', doc.createNode([])), existing.get('plates') as YAMLSeq);
    const havePlates = new Set(plateList.items.map((item) => (isMap(item) ? String(item.get('id')) : '')));
    for (const plate of entry.plates) {
      if (havePlates.has(plate.id)) continue;
      plateList.add(doc.createNode(plateNode(plate)));
      addedPlates.push(plate.id);
    }
  } else {
    addedRefs.push(...entry.refs.map(ref));
    addedPlates.push(...entry.plates.map((plate) => plate.id));
    list.add(
      doc.createNode({
        id,
        name: entry.name,
        description: entry.description,
        prompt: entry.prompt,
        refs: addedRefs,
        plates: entry.plates.map(plateNode),
        library: id,
      }),
    );
  }
  const files = [...refCopies.added.map((name) => `sets/${id}/${name}`), ...plateCopies.added.map((name) => `sets/${id}/plates/${name}`)];
  if (existing && !addedRefs.length && !addedPlates.length) {
    // Nothing to add to the bible; the copies above only restore files the target lost.
    try {
      await commitCopies(staged);
    } catch (error) {
      await cleanup();
      throw error;
    }
    return { set: id, updated: true, files, plates: [] };
  }
  const result = SetBibleSchema.safeParse(doc.toJS());
  if (!result.success) {
    await cleanup();
    throw new ValidationError(`sets.yaml would be invalid: ${result.error.issues[0]?.message ?? 'unknown error'}`);
  }
  const before = existsSync(file) ? await readFile(file, 'utf8') : undefined;
  try {
    await writeTextAtomic(file, doc.toString());
  } catch (error) {
    await cleanup();
    throw error;
  }
  try {
    await commitCopies(staged);
  } catch (error) {
    if (before !== undefined) await writeTextAtomic(file, before);
    else await rm(file, { force: true });
    await cleanup();
    throw error;
  }
  return { set: id, updated: Boolean(existing), files, plates: addedPlates };
}

/** The library entry for an incoming set: its link, a same-id entry with shared content, or a new free id. */
async function matchSetEntry(root: string, set: SetDefinition, files: string[], slug: string): Promise<string> {
  if (set.library && existsSync(setEntryFile(root, set.library))) return set.library;
  const base = set.id;
  const taken = await idTaken(root, base);
  if (!taken) return base;
  if (taken === 'entry') {
    const known = await entryFileHashes(setEntryDir(root, base), 'sets');
    for (const file of files) if (known.has(await fileHash(file))) return base;
  }
  for (let n = 1; ; n += 1) {
    const candidate = numbered(`${base}-${slug}`, n);
    if (!(await idTaken(root, candidate))) return candidate;
  }
}
