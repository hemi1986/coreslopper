import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync, lstatSync, type Dirent } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { isMap, isSeq, parse as parseYaml, parseDocument, stringify, type Document, type YAMLMap, type YAMLSeq } from 'yaml';
import type { ZodType } from 'zod';
import { ProjectConfigSchema, ValidationError, isScriptId, readYamlFile, writeTextAtomic } from '@coreslopper/core';
import { SLUG, projectDirs, seriesDirs } from './workspace-dirs.js';

// What the character library and the set library share (ADR 0052, one
// BC-Library): the entry id and folder (`library/<kind>/<id>/`), the
// required/optional field text, tags, the id a name becomes, the file limits,
// where an import's source is recorded (`librarySourceLabel`), the guarded scan
// of an entry's files, the kind of target a copy may go into
// (`libraryTargetKind`), and the content-wise copy both use. The sound library
// stays its own context (ADR 0051) and keeps its own refusal type.

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

/** `projects/<slug>`, the source of an import as the library records it. */
export function librarySourceLabel(root: string, dir: string): string {
  return relative(resolve(root), resolve(dir)).split(sep).join('/');
}

/** Where a library copy can go: a music video or meme, a series canon, or an episode. */
export type LibraryTargetKind = 'project' | 'episode' | 'series';

/**
 * What a library copy can go into, read once for `character use`, `set use`
 * and the board's target list. An episode takes its characters and sets from
 * its series canon, so both uses refuse it. Undefined when the folder is
 * neither a project nor a series canon; a broken `project.yaml` is a
 * `ValidationError` naming the file.
 */
export async function libraryTargetKind(dir: string): Promise<LibraryTargetKind | undefined> {
  const projectFile = join(dir, 'project.yaml');
  if (existsSync(projectFile)) {
    const config = await readYamlFile(projectFile, ProjectConfigSchema);
    return config.kind === 'episode' ? 'episode' : 'project';
  }
  return existsSync(join(dir, 'series.yaml')) ? 'series' : undefined;
}

/** Where a library entry is used: a project or series canon whose bible names it in `library`. */
export type LibraryUseLink<Name extends string = string> = { scope: 'project' | 'series'; slug: string } & {
  [K in Name]: string;
};

/** The fields every bible entry shares, across characters and sets. */
export interface LibraryEntryBase {
  id: string;
  name: string;
  description: string;
  prompt?: string;
  tags: string[];
  origin: string;
  added: string;
  history: { at: string; from: string; added: string[] }[];
}

/** A manual add or update: the words a user gives an entry. */
export interface LibraryEntryInput {
  id?: unknown;
  name: unknown;
  description: unknown;
  prompt?: unknown;
  tags?: unknown;
}

/** A role a file can take in a kind, and the extensions it accepts. */
export interface LibraryFileRoleSpec {
  extensions: readonly string[];
  /** The noun of the refusal: `ref`, `voice`, `set image`. */
  label: string;
}

/** The options of `library add-file`: the role and the kind-specific extras. */
export interface LibraryFileOptions {
  role: string;
  angle?: unknown;
  plate?: unknown;
  transcript?: unknown;
}

export interface LibraryFileResult<Entry> {
  entry: Entry;
  /** The new file names and kind labels (`plate:<id>`), empty when the file was already stored. */
  added: string[];
  /** False when the entry did not change. */
  changed: boolean;
}

/** One item of a production's bible on its way into the library. */
export interface LibraryIncoming<Data = unknown> {
  /** The item's id in the production, e.g. `nova`. */
  sourceId: string;
  name: string;
  description: string;
  prompt?: string;
  /** What the item names, relative to the production. */
  named: (string | undefined)[];
  /** The kind's own parsed item. */
  data: Data;
}

/** What a kind's import merge needs from the lifecycle. */
export interface LibraryImportContext {
  /** The library entry the item went into. */
  id: string;
  /** The source's folder name, for a suffixed state or plate id. */
  slug: string;
  /** When the import runs, ISO. */
  at: string;
  /** The entry's folder. */
  dir: string;
  /** The stored name of a source path, when it was copied. */
  name: (path: string | undefined) => string | undefined;
}

/**
 * How one kind reads a production's bible and merges an item into an entry.
 * The lifecycle owns the loop, the file copies, the history row and the result;
 * the kind owns its fields, its matching rule and what an item means.
 */
export interface LibraryImportConfig<Entry, Data = unknown> {
  /** Read and validate the production's bible; refuses a missing one. */
  read: (root: string, sourceDir: string) => Promise<LibraryIncoming<Data>[]>;
  /** Whether the source names a file the import may take (inside the production, a plain file for sets). */
  present: (sourceDir: string, path: string) => boolean;
  /** The library entry an incoming item belongs in. */
  match: (root: string, incoming: LibraryIncoming<Data>, files: string[], slug: string) => Promise<string>;
  /** Fields a kind adds to a new entry (refs, states, plates, face). */
  fields: (incoming: LibraryIncoming<Data>) => Partial<Entry>;
  /** Merge an incoming item's words and files into an entry; return the labels added (`state:<id>`, `plate:<id>`). */
  merge: (entry: Entry, incoming: LibraryIncoming<Data>, context: LibraryImportContext) => string[] | Promise<string[]>;
  /** A source item without files is left out (`omit`), or reported as skipped (`report`). */
  skipWithoutFiles: 'omit' | 'report';
  /** The refusal when `--into` comes without naming the item (sets). */
  intoNeedsNamed?: string;
  /** Record a history row even when an import brings nothing (sets). */
  historyAlways?: boolean;
}

/** The options of `library import`: one item, or every item with files. */
export interface LibraryImportOptions {
  sourceId?: string;
  into?: string;
  now?: Date;
}

/** One import's result, before a kind maps it to its own words. */
export interface LibraryImportOutcome {
  sourceId: string;
  /** Absent when the item was skipped. */
  id?: string;
  created: boolean;
  skipped?: boolean;
  added: string[];
  missing: string[];
}

/** The options of `library use`: the character states to take along. */
export interface LibraryUseOptions {
  states?: string[] | 'all';
}

/** One file to copy into a target: its name in the entry's folder and the subfolder it goes to. */
export interface LibraryUseFile {
  name: string;
  /** `plates` for a set's plates; empty for the entry's own folder. */
  sub?: string;
}

/** What a kind takes from an entry, and what its row therefore knows. */
export interface LibraryUsePlan<Data = unknown> {
  files: LibraryUseFile[];
  /** The kind's chosen items (a character's chosen states), for the row and its labels. */
  data: Data;
  /** Whether the entry's own folder may hold a nested folder, like a set's `plates/`. */
  nestedFolders?: boolean;
}

/**
 * How one kind copies an entry into a production. The lifecycle owns the
 * target check, the staged copies, the bible document, the write and the
 * rollback; the kind owns what to take and how its row looks.
 */
export interface LibraryUseConfig<Entry, Data = unknown> {
  /** The refusal when the target is an episode. */
  episodeRefusal: string;
  /** The empty target bible when it has none yet. */
  empty: string;
  /** The bible schema the written document must satisfy. */
  schema: ZodType;
  /** What to copy, with the kind's choice rule; refuses missing or unknown files. */
  plan: (entry: Entry, options: LibraryUseOptions, dir: string) => Promise<LibraryUsePlan<Data>>;
  /** Refuse a target row of the same id that does not come from this entry. */
  refuse?: (existing: YAMLMap, targetDir: string) => void;
  /** The row for a target that takes the entry afresh. */
  row: (entry: Entry, plan: LibraryUsePlan<Data>, copied: (name: string) => string) => { node: Record<string, unknown>; labels: string[] };
  /** Add what the target lacks; the labels added and whether the row changed. */
  merge: (
    existing: YAMLMap,
    doc: Document,
    entry: Entry,
    plan: LibraryUsePlan<Data>,
    copied: (name: string) => string,
  ) => { labels: string[]; changed: boolean };
}

/** One use's result, before a kind maps it to its own words. */
export interface LibraryUseOutcome {
  id: string;
  updated: boolean;
  files: string[];
  labels: string[];
}

/**
 * The data and hooks that tell one bible library from another (ADR 0056). The
 * lifecycle owns add/update/file/remove; a kind supplies only what is genuinely
 * its semantics: the entry's fields, its file roles and strategy, its plate or
 * state rules.
 */
export interface LibraryKindConfig<
  Entry extends LibraryEntryBase,
  UseName extends string = string,
  NewEntry extends LibraryEntryInput = LibraryEntryInput,
  ImportData = unknown,
  UseData = unknown,
> {
  kind: LibraryEntryKind;
  noun: string;
  entryFile: string;
  header: string;
  schema: ZodType<Entry>;
  /** `characters.yaml` / `sets.yaml` in a project or series canon. */
  useFile: string;
  /** The key of a use row: `character` / `set`. */
  useName: UseName;
  /** The picture for an entry's card. */
  cover: (entry: Entry) => string | undefined;
  /** Whether an update must keep a prompt (`sets`) or may clear it (`characters`). */
  promptRequired?: boolean;
  /** Whether the add accepts an explicit `id` (`characters`) or derives it from the name (`sets`). */
  acceptsId?: boolean;
  /** The id for a name without letters or digits. */
  fallbackId: string;
  entryTakenMessage: (id: string) => string;
  filesTakenMessage?: (id: string) => string;
  /** Whether the folder is taken by an entry or by files no entry names (`sets`); the default checks the entry file. */
  idTaken?: (root: string, id: string) => Promise<'entry' | 'files' | undefined>;
  /** Fields a kind adds to a new entry (the character's face). */
  newFields?: (input: NewEntry) => Partial<Entry>;
  /** `copy`: copy then record (`characters`); `stage`: stage the copy then commit (`sets`). */
  fileMode: 'copy' | 'stage';
  /** The roles the kind takes, as `add-file` and the board name them. */
  roles: readonly string[];
  /** The role and its extensions, or undefined when the kind does not take it. */
  role: (role: string) => LibraryFileRoleSpec | undefined;
  /** The refusal for a role a kind does not take. */
  roleMessage?: string;
  /** Kind rules before a staged copy (plate angle, id and collision; file size). */
  prepareFile?: (entry: Entry, options: LibraryFileOptions, source: string, dir: string) => Promise<unknown> | unknown;
  /** Record the stored file in the entry; return the labels added (`name`, `plate:<id>`). */
  recordFile: (entry: Entry, name: string, options: LibraryFileOptions, now: Date, prepared: unknown) => string[];
  /** Remove a name from the entry; true when the entry named it. */
  unnameFile: (entry: Entry, name: string) => boolean;
  /** Refuse a name the entry does not name (`sets`); a character delete repairs nothing and refuses nothing. */
  refuseUnnamed?: boolean;
  /** `strict`: load first (`characters`); `tolerant`: the folder decides (`sets`). */
  removeMode: 'strict' | 'tolerant';
  /** How the kind reads a production's bible and merges its items. */
  importSource: LibraryImportConfig<Entry, ImportData>;
  /** What the kind takes from an entry into a production. */
  use: LibraryUseConfig<Entry, UseData>;
}

export type LibraryListEntry<Entry, Name extends string> = Entry & { cover?: string; usedIn: LibraryUseLink<Name>[] };

/**
 * One lifecycle for a bible library: paths, load/save, list/uses, the manual
 * add/update/file/remove verbs and the card cover. A kind supplies its data and
 * hooks; the sound library stays its own context (ADR 0051).
 */
export function defineLibraryKind<
  Entry extends LibraryEntryBase,
  UseName extends string,
  NewEntry extends LibraryEntryInput = LibraryEntryInput,
  ImportData = unknown,
  UseData = unknown,
>(config: LibraryKindConfig<Entry, UseName, NewEntry, ImportData, UseData>) {
  const libraryRoot = (root: string) => join(root, 'library', config.kind);
  const entryDir = (root: string, id: string) => libraryEntryDir(root, config.kind, id);
  const entryFile = (root: string, id: string) => libraryEntryFile(root, config.kind, id);

  const load = async (root: string, id: string): Promise<Entry> => {
    const file = entryFile(root, id);
    if (!existsSync(file)) throw new ValidationError(`no library ${config.noun} "${id}" (${file})`);
    return readYamlFile(file, config.schema);
  };

  const save = async (root: string, entry: Entry): Promise<void> => {
    await writeTextAtomic(entryFile(root, entry.id), config.header + stringify(config.schema.parse(entry)));
  };

  /** Every project and series that uses an entry, by library id. */
  const uses = async (root: string): Promise<Map<string, LibraryUseLink<UseName>[]>> => {
    const found = new Map<string, LibraryUseLink<UseName>[]>();
    const scan = async (dirs: string[], scope: LibraryUseLink<UseName>['scope']) => {
      for (const dir of dirs) {
        const file = join(dir, config.useFile);
        if (!existsSync(file)) continue;
        const raw = await readFile(file, 'utf8')
          .then((content) => parseYaml(content) as { [key: string]: { id?: unknown; library?: unknown }[] | undefined } | null)
          // An unreadable bible shows up in the production view; here it uses nothing.
          .catch(() => null);
        for (const row of raw?.[config.kind] ?? []) {
          if (typeof row?.library !== 'string') continue;
          const list = found.get(row.library) ?? [];
          list.push({ scope, slug: basename(dir), [config.useName]: String(row.id) } as LibraryUseLink<UseName>);
          found.set(row.library, list);
        }
      }
    };
    await scan(await projectDirs(root), 'project');
    await scan(await seriesDirs(root), 'series');
    return found;
  };

  /** The library, sorted by name, with where each entry is used. Entries that do not load are skipped with a warning in `errors`. */
  const list = async (root: string): Promise<{ entries: LibraryListEntry<Entry, UseName>[]; errors: { id: string; error: string }[] }> => {
    const dirs = await readdir(libraryRoot(root), { withFileTypes: true }).catch(() => [] as Dirent[]);
    const used = await uses(root);
    const entries: LibraryListEntry<Entry, UseName>[] = [];
    const errors: { id: string; error: string }[] = [];
    for (const dir of dirs) {
      if (!dir.isDirectory() || !isScriptId(dir.name) || !existsSync(join(libraryRoot(root), dir.name, config.entryFile))) continue;
      try {
        const entry = await load(root, dir.name);
        const cover = config.cover(entry);
        entries.push({ ...entry, ...(cover ? { cover } : {}), usedIn: used.get(entry.id) ?? [] });
      } catch (error) {
        errors.push({ id: dir.name, error: (error as Error).message });
      }
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    return { entries, errors };
  };

  const idTaken = async (root: string, id: string): Promise<'entry' | 'files' | undefined> => {
    if (config.idTaken) return config.idTaken(root, id);
    return existsSync(entryFile(root, id)) ? 'entry' : undefined;
  };

  /** Add an entry by hand: words now, files as they come. */
  const add = async (root: string, input: NewEntry, now = new Date()): Promise<Entry> => {
    const name = entryText(input.name, 'name', 200, true)!;
    const id = config.acceptsId && input.id ? checkLibraryId(input.id, config.kind) : slugOfName(name, config.fallbackId);
    const taken = await idTaken(root, id);
    if (taken === 'entry') throw new ValidationError(config.entryTakenMessage(id));
    if (taken === 'files') throw new ValidationError(config.filesTakenMessage!(id));
    const prompt = entryText(input.prompt, 'prompt', 4000, config.promptRequired === true);
    const entry = config.schema.parse({
      version: 1,
      id,
      name,
      description: entryText(input.description, 'description', 4000, true),
      ...(prompt ? { prompt } : {}),
      tags: input.tags === undefined ? [] : parseTags(input.tags),
      origin: 'manual',
      added: now.toISOString(),
      ...config.newFields?.(input),
    });
    await mkdir(entryDir(root, id), { recursive: true });
    await save(root, entry);
    return entry;
  };

  /** Change the words of an entry: name, description, prompt, tags. The id stays. */
  const update = async (root: string, id: string, change: Partial<NewEntry>): Promise<Entry> => {
    if (change === null || typeof change !== 'object') throw new ValidationError('an update takes name, description, prompt or tags');
    const entry = await load(root, id);
    if (change.name !== undefined) entry.name = entryText(change.name, 'name', 200, true)!;
    if (change.description !== undefined) entry.description = entryText(change.description, 'description', 4000, true)!;
    if (change.prompt !== undefined) {
      const prompt = entryText(change.prompt, 'prompt', 4000, config.promptRequired === true);
      if (prompt) entry.prompt = prompt;
      else delete entry.prompt;
    }
    if (change.tags !== undefined) entry.tags = parseTags(change.tags);
    await save(root, entry);
    return entry;
  };

  /** Copy a file into an entry, by content; the kind's strategy decides copy-then-record or stage-then-commit. */
  const addFile = async (root: string, id: string, source: string, options: LibraryFileOptions, now = new Date()): Promise<LibraryFileResult<Entry>> => {
    if (!existsSync(source)) throw new ValidationError(`missing file: ${source}`);
    const spec = config.role(options.role);
    if (!spec) throw new ValidationError(config.roleMessage ?? `role must be ${String(options.role)}`);
    const extension = extname(source).toLowerCase();
    if (!spec.extensions.includes(extension)) throw new ValidationError(`a ${spec.label} takes ${spec.extensions.join(' ')}; got ${extension || 'no extension'}`);
    const entry = await load(root, id);
    const dir = entryDir(root, id);

    if (config.fileMode === 'copy') {
      const target = join(dir, freeName(dir, source, new Set()));
      await copyFile(source, target);
      const name = basename(target);
      try {
        const copied = await load(root, id);
        const added = config.recordFile(copied, name, options, now, undefined);
        const labels = added.length ? added : [name];
        copied.history.push({ at: now.toISOString(), from: 'manual', added: labels });
        await save(root, copied);
        return { entry: copied, added: labels, changed: true };
      } catch (error) {
        await rm(target, { force: true });
        throw error;
      }
    }

    if (!(await stat(source)).isFile()) throw new ValidationError(`not a file: ${source}`);
    const before = structuredClone(entry);
    const prepared = await config.prepareFile?.(entry, options, source, dir);
    if ((prepared as { noop?: boolean } | undefined)?.noop) return { entry, added: [], changed: false };
    const { names, added: copied, staged } = await copyByContent([source], dir, config.kind, { stage: true });
    const name = names.get(source)!;
    const changes = [...new Set([...copied, ...config.recordFile(entry, name, options, now, prepared)])];
    if (!changes.length) {
      await discardCopies(staged);
      return { entry, added: [], changed: false };
    }
    entry.history.push({ at: now.toISOString(), from: 'manual', added: changes });
    try {
      await save(root, entry);
    } catch (error) {
      await discardCopies(staged);
      throw error;
    }
    try {
      await commitCopies(staged);
    } catch (error) {
      await save(root, before);
      await discardCopies(staged);
      throw error;
    }
    return { entry, added: changes, changed: true };
  };

  /** Take one file out of an entry and delete it; the entry stops naming it first. */
  const removeFile = async (root: string, id: string, name: unknown): Promise<Entry> => {
    const entry = await load(root, id);
    const file = checkEntryFileName(config.kind, name);
    const named = config.unnameFile(entry, file);
    if (config.refuseUnnamed && !named) throw new ValidationError(`the ${config.noun} "${id}" has no file "${file}"`);
    const dir = entryDir(root, id);
    const path = join(dir, file);
    // The file goes out of sight first: a dot name is a staged copy, ignored by
    // the entry's scan, so a failed write never leaves a plain file the entry does not name.
    const staged = join(dir, `.removed-${randomUUID()}${extname(file)}`);
    const moved = existsSync(path);
    if (moved) await rename(path, staged);
    try {
      await save(root, entry);
    } catch (error) {
      if (moved) await rename(staged, path).catch(() => undefined);
      throw error;
    }
    if (moved) await rm(staged, { force: true });
    return entry;
  };

  /** Delete an entry and its files. Projects keep their copies. */
  const remove = async (root: string, id: string): Promise<{ id: string; entry?: Entry }> => {
    const folder = entryDir(root, id);
    if (config.removeMode === 'strict') {
      const entry = await load(root, id);
      await rm(folder, { recursive: true, force: true });
      return { id, entry };
    }
    // The directory entry decides, so a dangling link or a stray file is not
    // mistaken for a missing entry (and a file is not silently deleted).
    const present = lstatSync(folder, { throwIfNoEntry: false });
    if (!present) throw new ValidationError(`no library ${config.noun} "${id}" (${folder})`);
    if (!present.isDirectory() && !present.isSymbolicLink()) {
      throw new ValidationError(`the library ${config.noun} "${id}" is not a folder (${folder}); move it away`);
    }
    let entry: Entry | undefined;
    try {
      entry = await load(root, id);
    } catch (error) {
      // A broken document is removed all the same; an I/O error is not swallowed.
      if (!(error instanceof ValidationError)) throw error;
    }
    const trash = join(libraryRoot(root), `.removing-${randomUUID()}`);
    try {
      await rename(folder, trash);
    } catch (error) {
      // A concurrent delete between the check and the rename reads as unknown.
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new ValidationError(`no library ${config.noun} "${id}" (${folder})`);
      throw new ValidationError(`could not remove library ${config.noun} "${id}": ${(error as Error).message}`);
    }
    try {
      await rm(trash, { recursive: true, force: true });
    } catch (error) {
      throw new ValidationError(
        `library ${config.noun} "${id}" left the library, but its folder ${relative(root, trash)} could not be deleted: ${(error as Error).message}; delete it by hand`,
      );
    }
    return { id, ...(entry ? { entry } : {}) };
  };

  /**
   * Bring the items of a production or series canon into the library. The
   * kind reads its bible, says which entry an item belongs in and merges it;
   * the lifecycle copies the files, keeps the history and maps the results.
   * A file mode of `stage` makes the entry's write and the copies one step:
   * a failed write leaves neither.
   */
  const importFrom = async (root: string, sourceDir: string, options: LibraryImportOptions = {}): Promise<LibraryImportOutcome[]> => {
    const incoming = await config.importSource.read(root, sourceDir);
    const from = librarySourceLabel(root, sourceDir);
    const slug = basename(sourceDir);
    const at = (options.now ?? new Date()).toISOString();
    if (options.sourceId && !incoming.some((item) => item.sourceId === options.sourceId)) {
      throw new ValidationError(`${from} has no ${config.noun} "${options.sourceId}"`);
    }
    if (options.into && config.importSource.intoNeedsNamed && !options.sourceId) throw new ValidationError(config.importSource.intoNeedsNamed);
    if (options.into) await load(root, options.into);
    const outcomes: LibraryImportOutcome[] = [];
    for (const item of incoming) {
      if (options.sourceId && item.sourceId !== options.sourceId) continue;
      const named = item.named.filter((path): path is string => Boolean(path));
      const missing = named.filter((path) => !config.importSource.present(sourceDir, path));
      const files = named.filter((path) => config.importSource.present(sourceDir, path)).map((path) => resolve(sourceDir, path));
      if (!files.length) {
        if (options.sourceId) throw new ValidationError(`${item.sourceId} in ${from} has no files to take into the library`);
        if (config.importSource.skipWithoutFiles === 'report') outcomes.push({ sourceId: item.sourceId, created: false, skipped: true, added: [], missing });
        continue;
      }
      const id = options.into ?? (await config.importSource.match(root, item, files, slug));
      const created = !existsSync(entryFile(root, id));
      const dir = entryDir(root, id);
      const copies = await copyByContent(files, dir, config.kind, config.fileMode === 'stage' ? { stage: true } : {});
      const context: LibraryImportContext = {
        id,
        slug,
        at,
        dir,
        name: (path) => (path ? copies.names.get(resolve(sourceDir, path)) : undefined),
      };
      const before = created ? undefined : await load(root, id);
      const entry: Entry = before
        ? structuredClone(before)
        : config.schema.parse({
            version: 1,
            id,
            name: item.name,
            description: item.description,
            ...(item.prompt ? { prompt: item.prompt } : {}),
            tags: [],
            origin: from,
            added: at,
            history: [],
            ...config.importSource.fields(item),
          });
      let changes = copies.added;
      let saved = false;
      try {
        changes = [...new Set([...copies.added, ...(await config.importSource.merge(entry, item, context))])];
        if (!created && (changes.length || config.importSource.historyAlways)) entry.history.push({ at, from, added: changes });
        if (created || changes.length || config.importSource.historyAlways) {
          await save(root, entry);
          saved = true;
        }
        if (copies.staged.length) await commitCopies(copies.staged);
        outcomes.push({ sourceId: item.sourceId, id, created, added: changes, missing });
      } catch (error) {
        if (copies.staged.length) {
          if (saved) {
            if (before) await save(root, before);
            else await rm(entryFile(root, id), { force: true });
          }
          await discardCopies(copies.staged);
        }
        throw error;
      }
    }
    return outcomes;
  };

  /**
   * Copy an entry into a music video or a series canon: the files to
   * `<kind>/<id>/` (staged until the bible names them), the row into its bible
   * with `library: <id>`. Taking the same entry again adds what the target
   * lacks. The kind says what to take and how its row looks; the lifecycle
   * checks the target, copies, validates, writes and rolls back.
   */
  const useIn = async (root: string, targetDir: string, id: string, options: LibraryUseOptions = {}): Promise<LibraryUseOutcome> => {
    const entry = await load(root, id);
    const target = await libraryTargetKind(targetDir);
    if (target === 'episode') throw new ValidationError(config.use.episodeRefusal);
    if (!target) throw new ValidationError(`${targetDir} is neither a project nor a series canon`);

    const sourceDir = entryDir(root, id);
    const plan = await config.use.plan(entry, options, sourceDir);
    const folder = join(targetDir, config.kind, id);
    const folderExisted = existsSync(folder);
    const subs = [...new Set(plan.files.map((file) => file.sub ?? ''))];
    const copies = new Map<string, Awaited<ReturnType<typeof copyByContent>>>();
    for (const sub of subs) {
      const sources = plan.files.filter((file) => (file.sub ?? '') === sub).map((file) => join(sourceDir, file.name));
      const copyOptions: CopyOptions = { stage: true, ...(plan.nestedFolders && !sub ? { nestedFolders: true as const } : {}) };
      copies.set(sub, await copyByContent(sources, sub ? join(folder, sub) : folder, config.kind, copyOptions));
    }
    const staged = [...copies.values()].flatMap((copy) => copy.staged);
    /** Discard the staged copies; a folder this use created goes with them. */
    const cleanup = async () => {
      await discardCopies(staged);
      if (!folderExisted) await rm(folder, { recursive: true, force: true });
    };
    const copied = (name: string) => {
      const sub = plan.files.find((file) => file.name === name)?.sub ?? '';
      const target = copies.get(sub)!.names.get(join(sourceDir, name));
      if (!target) throw new ValidationError(`the library ${config.noun} "${id}" lost ${name} during the copy`);
      return `${config.kind}/${id}/${sub ? `${sub}/` : ''}${target}`;
    };
    const files = subs.flatMap((sub) => copies.get(sub)!.added.map((name) => `${config.kind}/${id}/${sub ? `${sub}/` : ''}${name}`));

    try {
      const file = join(targetDir, config.useFile);
      const doc = parseDocument(existsSync(file) ? await readFile(file, 'utf8') : config.use.empty);
      if (doc.errors.length) throw new ValidationError(`Invalid YAML in ${file}: ${doc.errors[0]!.message}`);
      if (!isSeq(doc.get(config.kind))) doc.set(config.kind, doc.createNode([]));
      const list = doc.get(config.kind) as YAMLSeq;
      // `characters: []` parses as a flow sequence; entries go in block style like a hand-written bible.
      list.flow = false;
      const existing = list.items.find((item) => isMap(item) && item.get('id') === id) as YAMLMap | undefined;
      let updated = false;
      let labels: string[] = [];
      let changed = false;
      if (existing) {
        updated = true;
        config.use.refuse?.(existing, targetDir);
        const merged = config.use.merge(existing, doc, entry, plan, copied);
        labels = merged.labels;
        changed = merged.changed;
      } else {
        const row = config.use.row(entry, plan, copied);
        labels = row.labels;
        list.add(doc.createNode(row.node));
        changed = true;
      }
      if (updated && !changed) {
        // Nothing to add to the bible; the copies above only restore files the target lost.
        await commitCopies(staged);
        return { id, updated, files, labels: [] };
      }
      const parsed = config.use.schema.safeParse(doc.toJS());
      if (!parsed.success) throw new ValidationError(`${config.useFile} would be invalid: ${parsed.error.issues[0]?.message ?? 'unknown error'}`);
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
      return { id, updated, files, labels };
    } catch (error) {
      await cleanup();
      throw error;
    }
  };

  return {
    kind: config.kind,
    noun: config.noun,
    /** The entry file's name, which a file route never serves. */
    entryName: config.entryFile,
    /** The roles a file may take. */
    roles: config.roles,
    /** The row key of a use and the import body's field. */
    useName: config.useName,
    root: libraryRoot,
    entryDir,
    entryFile,
    load,
    save,
    uses,
    list,
    add,
    update,
    addFile,
    recordFile: config.recordFile,
    removeFile,
    remove,
    importFrom,
    useIn,
    targetKind: libraryTargetKind,
  };
}

/** The project or series folder of a workspace for a slug, as `character` and `set` commands and the board take it. */
export async function libraryTarget(root: string, scope: unknown, slug: unknown): Promise<string> {
  if (scope !== 'project' && scope !== 'series') throw new ValidationError('scope must be project or series');
  if (typeof slug !== 'string' || !SLUG.test(slug)) throw new ValidationError(`unknown ${scope} ${String(slug)}`);
  const dirs = scope === 'series' ? await seriesDirs(root) : await projectDirs(root);
  const dir = dirs.find((entry) => basename(entry) === slug);
  if (!dir) throw new ValidationError(`unknown ${scope} ${slug}`);
  return dir;
}

/** Where a library entry can go: music videos (not episodes) and series canons, with their titles. */
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

/**
 * A name that may be taken out of an entry (`character remove-file`, `set
 * remove --file`): a plain file of the entry's folder, never its entry file or
 * a staged copy (a dot file).
 */
export function checkEntryFileName(kind: LibraryEntryKind, name: unknown): string {
  if (typeof name !== 'string' || name !== basename(name) || name === KINDS[kind].file || name.startsWith('.')) {
    throw new ValidationError('name a file of the entry');
  }
  return name;
}

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
  /**
   * Copy into a target folder that may hold a nested one, like a production's
   * `sets/<id>/` with `plates/` beside its references. Only a copy into a
   * production may set this; a library entry's folder never nests.
   */
  nestedFolders?: true;
}

/**
 * The files of an entry's folder by content hash, each mapped to its name. The
 * entry file and dot files (a staged copy) are skipped; a link or non-file is
 * refused, since the entry may only name plain files of its folder.
 */
export const entryFileHashes = (dir: string, kind: LibraryEntryKind) => scanFileHashes(dir, kind, false);

/** `entryFileHashes`, or with a production target's nested folder skipped (`nestedFolders`). */
async function scanFileHashes(dir: string, kind: LibraryEntryKind, nestedFolders: boolean): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();
  for (const item of await readdir(dir, { withFileTypes: true }).catch(() => [] as Dirent[])) {
    if (item.name === KINDS[kind].file || item.name.startsWith('.')) continue;
    if (!item.isFile()) {
      if (nestedFolders && item.isDirectory()) continue;
      throw new ValidationError(`the library ${KINDS[kind].noun} folder holds a ${item.isSymbolicLink() ? 'link' : 'non-file'} "${item.name}"; move it away`);
    }
    hashes.set(await fileHash(join(dir, item.name)), item.name);
  }
  return hashes;
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
  const known = await scanFileHashes(dir, kind, options.nestedFolders === true);
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
