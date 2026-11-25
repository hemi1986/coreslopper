import { existsSync, statSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
import { isMap, isSeq, type YAMLSeq } from 'yaml';
import { LibrarySetSchema, SetBibleSchema, ValidationError, isScriptId, readYamlFile, type LibrarySet, type SetDefinition } from '@coreslopper/core';
import {
  LIBRARY_FILE_LIMITS,
  defineLibraryKind,
  entryFileHashes,
  entryText,
  fileHash,
  libraryEntryDir,
  libraryEntryFile,
  librarySourceLabel,
  slugOfName,
  type LibraryIncoming,
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

/** The sets of a production or canon, as the bible names them. */
async function readBible(root: string, sourceDir: string): Promise<LibraryIncoming<SetDefinition>[]> {
  const file = join(sourceDir, 'sets.yaml');
  if (!existsSync(file)) throw new ValidationError(`${librarySourceLabel(root, sourceDir)} has no sets.yaml`);
  const bible = await readYamlFile(file, SetBibleSchema);
  return bible.sets.map((set) => ({
    sourceId: set.id,
    name: set.name,
    description: set.description,
    prompt: set.prompt,
    named: [...set.refs, ...set.plates.map((plate) => plate.ref)],
    data: set,
  }));
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

/** The library entry for an incoming set: its link, a same-id entry with shared content, or a new free id. */
async function matchSetEntry(root: string, set: SetDefinition, files: string[], slug: string): Promise<string> {
  if (set.library && existsSync(libraryEntryFile(root, 'sets', set.library))) return set.library;
  const base = set.id;
  const taken = await idTaken(root, base);
  if (!taken) return base;
  if (taken === 'entry') {
    const known = await entryFileHashes(libraryEntryDir(root, 'sets', base), 'sets');
    for (const file of files) if (known.has(await fileHash(file))) return base;
  }
  for (let n = 1; ; n += 1) {
    const candidate = numbered(`${base}-${slug}`, n);
    if (!(await idTaken(root, candidate))) return candidate;
  }
}

/** The plate's row in a target's sets.yaml, with its copied image. */
const plateNode = (plate: LibrarySet['plates'][number], copied: (name: string) => string) => ({
  id: plate.id,
  angle: plate.angle,
  ...(plate.prompt ? { prompt: plate.prompt } : {}),
  ...(plate.file ? { ref: copied(plate.file) } : {}),
});

const kind = defineLibraryKind<LibrarySet, 'set', NewLibrarySet, SetDefinition, undefined>({
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
  importSource: {
    read: readBible,
    present: (sourceDir, path) => {
      const resolved = resolve(sourceDir, path);
      return resolved.startsWith(resolve(sourceDir) + sep) && statSync(resolved, { throwIfNoEntry: false })?.isFile() === true;
    },
    match: (root, incoming, files, slug) => matchSetEntry(root, incoming.data, files, slug),
    fields: () => ({ refs: [], plates: [] }),
    merge: (entry, incoming, context) => {
      const set = incoming.data;
      const refAdds: string[] = [];
      for (const ref of set.refs) {
        const target = context.name(ref);
        if (target && !entry.refs.includes(target)) {
          entry.refs.push(target);
          refAdds.push(target);
        }
      }
      const plateAdds: string[] = [];
      for (const plate of set.plates) {
        const target = context.name(plate.ref);
        const same = entry.plates.find((existing) => existing.id === plate.id);
        if (!same) {
          entry.plates.push({ id: plate.id, angle: plate.angle, ...(plate.prompt ? { prompt: plate.prompt } : {}), ...(target ? { file: target } : {}) });
          plateAdds.push(`plate:${plate.id}`);
          continue;
        }
        const onDisk = same.file !== undefined && existsSync(join(context.dir, same.file));
        if (same.file && target && same.file !== target && onDisk) {
          // The same plate id with another image becomes a new plate, never an overwrite.
          const plateId = freePlateId(entry, `${plate.id}-${context.slug}`);
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
      return [...refAdds, ...plateAdds];
    },
    skipWithoutFiles: 'report',
    intoNeedsNamed: '--into names one entry; name the set with --id as well',
    historyAlways: true,
  },
  use: {
    episodeRefusal: 'an episode takes its sets from the series canon; use the set in the series instead',
    empty: 'version: 1\nsets: []\n',
    schema: SetBibleSchema,
    plan: async (entry, _options, dir) => {
      // The guarded scan: a link or non-file in the entry's folder is refused, never copied out.
      const present = new Set((await entryFileHashes(dir, 'sets')).values());
      const named = [...entry.refs, ...entry.plates.flatMap((plate) => (plate.file ? [plate.file] : []))];
      const absent = named.filter((name) => !present.has(name));
      if (absent.length) throw new ValidationError(`library files of ${entry.id} are missing: ${absent.join(', ')}`);
      return {
        files: [...entry.refs.map((name) => ({ name })), ...entry.plates.flatMap((plate) => (plate.file ? [{ name: plate.file, sub: 'plates' }] : []))],
        data: undefined,
        nestedFolders: true,
      };
    },
    refuse: (existing, targetDir) => {
      const target = String(existing.get('id'));
      if (existing.get('library') !== target) {
        // EVT-LibrarySetUseRefused: the target has a set of that id that is not linked to the entry.
        const linked = existing.get('library');
        throw new ValidationError(
          typeof linked === 'string'
            ? `${basename(targetDir)} has the set "${target}" from another library set ("${linked}"); remove it first`
            : `${basename(targetDir)} has its own set "${target}" already; rename it or remove it first`,
        );
      }
    },
    row: (entry, _plan, copied) => ({
      labels: entry.plates.map((plate) => plate.id),
      node: {
        id: entry.id,
        name: entry.name,
        description: entry.description,
        prompt: entry.prompt,
        refs: entry.refs.map((name) => copied(name)),
        plates: entry.plates.map((plate) => plateNode(plate, copied)),
        library: entry.id,
      },
    }),
    merge: (existing, doc, entry, _plan, copied) => {
      const addedRefs: string[] = [];
      const addedPlates: string[] = [];
      const refsNode = existing.get('refs');
      const refList = isSeq(refsNode) ? refsNode : (existing.set('refs', doc.createNode([])), existing.get('refs') as YAMLSeq);
      const haveRefs = new Set(refList.items.map((item) => String((item as { value?: unknown }).value ?? item)));
      for (const name of entry.refs) {
        const path = copied(name);
        if (haveRefs.has(path)) continue;
        refList.add(doc.createNode(path));
        addedRefs.push(path);
      }
      const platesNode = existing.get('plates');
      const plateList = isSeq(platesNode) ? platesNode : (existing.set('plates', doc.createNode([])), existing.get('plates') as YAMLSeq);
      const havePlates = new Set(plateList.items.map((item) => (isMap(item) ? String(item.get('id')) : '')));
      for (const plate of entry.plates) {
        if (havePlates.has(plate.id)) continue;
        plateList.add(doc.createNode(plateNode(plate, copied)));
        addedPlates.push(plate.id);
      }
      return { labels: addedPlates, changed: addedRefs.length > 0 || addedPlates.length > 0 };
    },
  },
});

export const setEntryDir = kind.entryDir;

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
  const dir = libraryEntryDir(root, 'sets', id);
  if (!existsSync(dir)) return undefined;
  if (existsSync(libraryEntryFile(root, 'sets', id))) return 'entry';
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
  const outcomes = await kind.importFrom(root, sourceDir, { sourceId: options.set, into: options.into, now: options.now });
  return outcomes.map((outcome) => ({
    set: outcome.sourceId,
    ...(outcome.id ? { id: outcome.id } : {}),
    created: outcome.created,
    ...(outcome.skipped ? { skipped: true } : {}),
    added: outcome.added,
    missing: outcome.missing,
  }));
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
  const result = await kind.useIn(root, targetDir, id);
  return { set: result.id, updated: result.updated, files: result.files, plates: result.labels };
}
