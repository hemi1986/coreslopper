import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync, lstatSync, type Dirent } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { parse as parseYaml, stringify } from 'yaml';
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

/**
 * The data and hooks that tell one bible library from another (ADR 0056). The
 * lifecycle owns add/update/file/remove; a kind supplies only what is genuinely
 * its semantics: the entry's fields, its file roles and strategy, its plate or
 * state rules.
 */
export interface LibraryKindConfig<Entry extends LibraryEntryBase, UseName extends string = string, NewEntry extends LibraryEntryInput = LibraryEntryInput> {
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
}

export type LibraryListEntry<Entry, Name extends string> = Entry & { cover?: string; usedIn: LibraryUseLink<Name>[] };

/**
 * One lifecycle for a bible library: paths, load/save, list/uses, the manual
 * add/update/file/remove verbs and the card cover. A kind supplies its data and
 * hooks; the sound library stays its own context (ADR 0051).
 */
export function defineLibraryKind<Entry extends LibraryEntryBase, UseName extends string, NewEntry extends LibraryEntryInput = LibraryEntryInput>(
  config: LibraryKindConfig<Entry, UseName, NewEntry>,
) {
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

  return {
    kind: config.kind,
    noun: config.noun,
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
