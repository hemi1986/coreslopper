import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rename, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { stringify } from 'yaml';
import {
  LIBRARY_SOUND_ENTRY,
  LIBRARY_SOUND_FILE,
  LibrarySoundSchema,
  ValidationError,
  hashFileStream,
  librarySoundTimeProblems,
  libraryTakeSoundId,
  readYamlFile,
  writeTextAtomic,
  type LibrarySound,
} from '@coreslopper/core';
import { projectDirs } from './board-production.js';
import { measureLoudness } from './episode-track.js';
import { probeDuration, resolveBinary } from './media.js';

// The workspace's sound library (BC-SoundLibrary, ADR 0051):
// `library/sounds/<id>/sound.yaml` next to one WAV, `sound.wav`. The user owns
// it; update and init never touch it. The WAV is gitignored, sound.yaml stays
// tracked. A meme takes a copy of a sound as a take, never a link.

const ID = /^[a-z0-9][a-z0-9_-]*$/;

export const soundLibraryRoot = (root: string) => join(root, 'library', 'sounds');
export const soundDir = (root: string, id: string) => join(soundLibraryRoot(root), checkId(id));
const soundFile = (root: string, id: string) => join(soundDir(root, id), LIBRARY_SOUND_ENTRY);
/** Integrated loudness needs 400 ms; a shorter sound is measured looped to at least this many seconds. */
const LOUDNESS_WINDOW = 3;

function checkId(id: unknown): string {
  if (typeof id !== 'string' || !ID.test(id) || id.length > 80) throw new ValidationError(`not a library sound id: ${String(id)}`);
  return id;
}

export type SoundRefusal = 'id-taken' | 'duplicate' | 'not-audio' | 'silent' | 'outside' | 'invalid';

/** EVT-LibrarySoundRefused: why a sound did not go into the library, and the entry it collided with. */
export class SoundRefused extends ValidationError {
  constructor(
    message: string,
    readonly reason: SoundRefusal,
    readonly existing?: string,
    /** The id the refused sound would have had, once it is known. */
    readonly sound?: string,
  ) {
    super(message);
    this.name = 'SoundRefused';
  }
}

export async function loadLibrarySound(root: string, id: string): Promise<LibrarySound> {
  const file = soundFile(root, id);
  if (!existsSync(file)) throw new ValidationError(`no library sound "${id}" (${file})`);
  return readYamlFile(file, LibrarySoundSchema);
}

/** `library/sounds/<id>/sound.yaml` of the workspace's sound library. */
export function isLibrarySoundFile(file: string): boolean {
  const dir = dirname(resolve(file));
  return basename(file) === LIBRARY_SOUND_ENTRY && basename(dirname(dir)) === 'sounds' && basename(dirname(dirname(dir))) === 'library';
}

/**
 * CMD-ValidateLibrarySound: the user's own edit of a sound.yaml, checked by the
 * workspace hook (POL-ValidateEverySoundEntryEdit). The schema keeps title and
 * use when filled and a cue and a trim inside the sound; the id is the folder's
 * name and the folder's WAV exists. A failing edit is refused (EVT-LibrarySoundRefused).
 */
export async function validateLibrarySoundEntry(file: string): Promise<LibrarySound> {
  const path = resolve(file);
  const folder = basename(dirname(path));
  let sound: LibrarySound;
  try {
    sound = await readYamlFile(path, LibrarySoundSchema);
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    throw new SoundRefused([error.message, ...error.details].join('; '), 'invalid', undefined, folder);
  }
  if (sound.id !== folder) throw new SoundRefused(`sound.yaml says id "${sound.id}", but the id must be the folder name "${folder}"`, 'invalid', undefined, folder);
  if (!existsSync(join(dirname(path), LIBRARY_SOUND_FILE))) throw new SoundRefused(`library sound ${folder}: ${LIBRARY_SOUND_FILE} does not exist next to its sound.yaml`, 'invalid', undefined, folder);
  return sound;
}

/** Write an entry its caller has parsed with LibrarySoundSchema. */
async function writeSound(file: string, sound: LibrarySound): Promise<void> {
  const header = '# A sound of the workspace library; its audio is sound.wav next to this file. See docs/adr/0051-memes-and-the-sound-library.md.\n';
  await writeTextAtomic(file, header + stringify(sound));
}

/** Every readable entry's id and hashes; a broken entry is skipped here and reported by `sound check`. */
async function storedHashes(root: string): Promise<{ id: string; hashes: string[] }[]> {
  const dir = soundLibraryRoot(root);
  if (!existsSync(dir)) return [];
  const entries: { id: string; hashes: string[] }[] = [];
  for (const name of await readdir(dir)) {
    if (!ID.test(name) || !existsSync(soundFile(root, name))) continue;
    try {
      const sound = await loadLibrarySound(root, name);
      entries.push({ id: name, hashes: [sound.hash, ...(sound.original_hash ? [sound.original_hash] : [])] });
    } catch {
      // not this command's business
    }
  }
  return entries;
}

export interface NewLibrarySound {
  /** A local audio or video file in any format ffmpeg reads. */
  file: string;
  title: unknown;
  useWhen: unknown;
  id?: unknown;
  tags?: unknown;
  cue?: unknown;
  /** `{ start, end }` in seconds, or `"<a>-<b>"`. */
  trim?: unknown;
  source?: unknown;
  licence?: unknown;
  credit?: unknown;
}

function text(value: unknown, field: string, max: number, required = false): string | undefined {
  if (value === undefined || value === null || value === '') {
    if (required) throw new SoundRefused(`a library sound needs a ${field}`, 'invalid');
    return undefined;
  }
  if (typeof value !== 'string' || value.length > max) throw new SoundRefused(`${field} must be text up to ${max} characters`, 'invalid');
  const trimmed = value.trim();
  if (!trimmed && required) throw new SoundRefused(`a library sound needs a ${field}`, 'invalid');
  return trimmed || undefined;
}

function seconds(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
  if (!Number.isFinite(number) || number < 0) throw new SoundRefused(`${field} must be seconds, 0 or more; got ${String(value)}`, 'invalid');
  return number;
}

function parseTrim(value: unknown): { start: number; end: number } | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'object') {
    const { start, end } = value as { start?: unknown; end?: unknown };
    const to = seconds(end, 'trim end');
    if (to === undefined) throw new SoundRefused('trim needs an end in seconds', 'invalid');
    return { start: seconds(start, 'trim start') ?? 0, end: to };
  }
  const match = /^\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*$/.exec(String(value));
  if (!match) throw new SoundRefused(`trim must be <start>-<end> in seconds, like 0.1-1.2; got ${String(value)}`, 'invalid');
  return { start: Number(match[1]), end: Number(match[2]) };
}

function parseTags(value: unknown): string[] {
  if (value === undefined || value === null || value === '') return [];
  const tags = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : null;
  if (!tags) throw new SoundRefused('tags must be a list or comma-separated text', 'invalid');
  return [...new Set(tags.map((tag) => String(tag).trim().slice(0, 60)).filter(Boolean))];
}

function slugOf(title: string): string {
  return title.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'sound';
}

/**
 * Convert any file ffmpeg reads into a 16-bit PCM WAV at 48 kHz, without
 * metadata and bit-exact, so the same input gives the same bytes and hash.
 * No gain, no normalisation.
 */
function convertToWav(source: string, target: string): void {
  const result = spawnSync(
    resolveBinary('ffmpeg'),
    ['-y', '-v', 'error', '-protocol_whitelist', 'file', '-i', `file:${resolve(source)}`, '-vn', '-map', '0:a:0', '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', '-c:a', 'pcm_s16le', '-ar', '48000', target],
    { encoding: 'utf8' },
  );
  if (result.status !== 0 || !existsSync(target)) {
    throw new SoundRefused(`${source} is not an audio file ffmpeg can read${result.stderr ? `: ${result.stderr.trim().split('\n').pop()}` : ''}`, 'not-audio');
  }
}

/**
 * CMD-AddLibrarySound (`sound add`): store a local file as a WAV in
 * `library/sounds/<id>/`, measure its length and loudness, and write its
 * `sound.yaml` (EVT-LibrarySoundAdded). A taken id, the content of an existing
 * entry, a file that is not audio, or a cue or trim outside the sound is
 * refused (EVT-LibrarySoundRefused) and leaves the library as it was.
 */
export async function addLibrarySound(root: string, input: NewLibrarySound, now = new Date()): Promise<LibrarySound> {
  const title = text(input.title, 'title', 200, true)!;
  const useWhen = text(input.useWhen, 'use when', 1000, true)!;
  const id = input.id !== undefined && input.id !== '' ? checkId(input.id) : slugOf(title);
  const taken = () => new SoundRefused(`the id "${id}" is taken; choose another with --id`, 'id-taken', id, id);
  if (existsSync(soundDir(root, id))) throw taken();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input.file)) throw new SoundRefused('sound add takes a local file, not a URL; download it first', 'invalid');
  if (!existsSync(input.file) || !statSync(input.file).isFile()) throw new SoundRefused(`missing file: ${input.file}`, 'invalid');
  const fields = {
    tags: parseTags(input.tags),
    cue: seconds(input.cue, 'cue'),
    trim: parseTrim(input.trim),
    source: text(input.source, 'source', 2000),
    licence: text(input.licence, 'licence', 200) ?? 'unknown',
    credit: text(input.credit, 'credit', 1000),
  };

  await mkdir(soundLibraryRoot(root), { recursive: true });
  const incoming = await mkdtemp(join(soundLibraryRoot(root), '.incoming-'));
  try {
    const wav = join(incoming, LIBRARY_SOUND_FILE);
    convertToWav(input.file, wav);
    const length = Math.round(probeDuration(wav) * 1000) / 1000;
    const problems = librarySoundTimeProblems({ length, cue: fields.cue, trim: fields.trim });
    if (problems.length) throw new SoundRefused(problems.map((problem) => problem.message).join('; '), 'outside', undefined, id);
    const hash = await hashFileStream(wav);
    const originalHash = await hashFileStream(input.file);
    const same = (await storedHashes(root)).find((entry) => entry.hashes.includes(hash) || entry.hashes.includes(originalHash));
    if (same) throw new SoundRefused(`this file is already stored as "${same.id}"`, 'duplicate', same.id, id);
    const loops = length < LOUDNESS_WINDOW ? Math.ceil(LOUDNESS_WINDOW / length) - 1 : 0;
    const loudness = Math.round(measureLoudness(wav, loops).lufs * 10) / 10;
    if (!Number.isFinite(loudness)) throw new SoundRefused(`${input.file} is silent; its loudness cannot be measured`, 'silent', undefined, id);

    const sound = LibrarySoundSchema.parse({
      version: 1,
      id,
      title,
      use_when: useWhen,
      tags: fields.tags,
      length,
      loudness,
      ...(fields.cue !== undefined ? { cue: fields.cue } : {}),
      ...(fields.trim ? { trim: fields.trim } : {}),
      ...(fields.source ? { source: fields.source } : {}),
      licence: fields.licence,
      ...(fields.credit ? { credit: fields.credit } : {}),
      hash,
      original_hash: originalHash,
      added: now.toISOString(),
    });
    await writeSound(join(incoming, LIBRARY_SOUND_ENTRY), sound);
    try {
      await rename(incoming, soundDir(root, id));
    } catch (error) {
      // another add took the id in the meantime
      if (existsSync(soundDir(root, id))) throw taken();
      throw error;
    }
    return sound;
  } finally {
    await rm(incoming, { recursive: true, force: true });
  }
}

/** What `sound edit` may change; undefined keeps a field, an empty value clears an optional one. */
export interface LibrarySoundChanges {
  title?: unknown;
  useWhen?: unknown;
  tags?: unknown;
  cue?: unknown;
  /** `{ start, end }` in seconds, or `"<a>-<b>"`. */
  trim?: unknown;
  source?: unknown;
  licence?: unknown;
  credit?: unknown;
  /** Measured from the file, never typed: any value is refused. */
  length?: unknown;
  /** Measured from the file, never typed: any value is refused. */
  loudness?: unknown;
}

const cleared = (value: unknown) => value === null || value === '';

/**
 * CMD-UpdateLibrarySound (`sound edit`): change a library sound's metadata,
 * never its file (EVT-LibrarySoundUpdated). Title and use when stay filled; a
 * cue and a trim stay inside the sound, the cue inside the trim; length and
 * loudness are measured and cannot be typed. A refused edit, or one that
 * changes nothing, leaves the entry as it was and writes nothing.
 */
export async function updateLibrarySound(root: string, id: string, changes: LibrarySoundChanges): Promise<{ sound: LibrarySound; changed: boolean }> {
  for (const measured of ['length', 'loudness'] as const) {
    if (changes[measured] !== undefined) throw new SoundRefused(`the ${measured} is measured from the file and cannot be typed`, 'invalid', undefined, id);
  }
  const current = await loadLibrarySound(root, id);
  const required = (value: unknown, field: string, max: number, keep: string) => (value === undefined ? keep : text(value, field, max, true)!);
  const optional = <T>(value: unknown, keep: T | undefined, parse: (value: unknown) => T | undefined) => (value === undefined ? keep : cleared(value) ? undefined : parse(value));

  const next = {
    title: required(changes.title, 'title', 200, current.title),
    use_when: required(changes.useWhen, 'use when', 1000, current.use_when),
    tags: changes.tags === undefined ? current.tags : parseTags(changes.tags),
    cue: optional(changes.cue, current.cue, (value) => seconds(value, 'cue')),
    trim: optional(changes.trim, current.trim, parseTrim),
    source: optional(changes.source, current.source, (value) => text(value, 'source', 2000)),
    licence: optional(changes.licence, current.licence, (value) => text(value, 'licence', 200)) ?? 'unknown',
    credit: optional(changes.credit, current.credit, (value) => text(value, 'credit', 1000)),
  };
  // The cue counts from the trim's start: a new trim without a new cue keeps the moment the sound lands in the file.
  if (changes.trim !== undefined && changes.cue === undefined && current.cue !== undefined) {
    const cue = Math.round((current.cue + (current.trim?.start ?? 0) - (next.trim?.start ?? 0)) * 1000) / 1000;
    if (cue < 0) throw new SoundRefused(`the cue lands at ${current.cue + (current.trim?.start ?? 0)} s of the file, before the trim; give a new --cue`, 'outside', undefined, id);
    next.cue = cue;
  }
  const problems = librarySoundTimeProblems({ length: current.length, cue: next.cue, trim: next.trim });
  if (problems.length) throw new SoundRefused(problems.map((problem) => problem.message).join('; '), 'outside', undefined, id);

  const sound: Record<string, unknown> = { ...current, ...next };
  for (const field of ['cue', 'trim', 'source', 'credit'] as const) if (next[field] === undefined) delete sound[field];
  const updated = LibrarySoundSchema.parse(sound);
  if (JSON.stringify(updated) === JSON.stringify(current)) return { sound: current, changed: false };
  await writeSound(soundFile(root, id), updated);
  return { sound: updated, changed: true };
}

/** RM-SoundLibrary: a library sound and the projects whose takes came from it. */
export interface LibrarySoundListing extends LibrarySound {
  /** Slugs of the memes whose take registry has a take of source `library:<id>`, sorted. */
  used_in: string[];
}

/** Every project whose takes.json has a take copied from a library sound, by sound id. */
export async function soundUses(root: string): Promise<Map<string, string[]>> {
  const uses = new Map<string, Set<string>>();
  for (const dir of await projectDirs(root)) {
    const file = join(dir, 'takes.json');
    if (!existsSync(file)) continue;
    const raw = await readFile(file, 'utf8')
      .then((content) => JSON.parse(content) as { takes?: Record<string, { source?: unknown }>; ambience?: Record<string, { source?: unknown }> } | null)
      // An unreadable takes.json is the voice track's business; here it uses nothing.
      .catch(() => null);
    for (const take of [...Object.values(raw?.takes ?? {}), ...Object.values(raw?.ambience ?? {})]) {
      const id = typeof take?.source === 'string' ? libraryTakeSoundId(take.source) : undefined;
      if (!id) continue;
      const slugs = uses.get(id) ?? new Set<string>();
      slugs.add(basename(dir));
      uses.set(id, slugs);
    }
  }
  return new Map([...uses].map(([id, slugs]) => [id, [...slugs].sort()]));
}

/**
 * RM-SoundLibrary (`sound list`): every library sound, sorted by id, with the
 * memes that took it; `tag` keeps only the sounds with that tag (any case).
 * An entry that does not load is skipped and named in `errors`.
 */
export async function listLibrarySounds(root: string, options: { tag?: string } = {}): Promise<{ sounds: LibrarySoundListing[]; errors: { id: string; error: string }[] }> {
  const dir = soundLibraryRoot(root);
  const names = existsSync(dir) ? (await readdir(dir)).filter((name) => ID.test(name) && existsSync(soundFile(root, name))).sort() : [];
  const uses = await soundUses(root);
  const tag = options.tag?.trim().toLowerCase();
  const sounds: LibrarySoundListing[] = [];
  const errors: { id: string; error: string }[] = [];
  for (const name of names) {
    try {
      const sound = await loadLibrarySound(root, name);
      if (tag && !sound.tags.some((candidate) => candidate.toLowerCase() === tag)) continue;
      sounds.push({ ...sound, used_in: uses.get(sound.id) ?? [] });
    } catch (error) {
      errors.push({ id: name, error: (error as Error).message });
    }
  }
  return { sounds, errors };
}

/** The table of `sound list`: one row per sound, then one per entry that did not load; a hint when nothing is there. */
export function soundListLines(listing: { sounds: LibrarySoundListing[]; errors: { id: string; error: string }[] }, tag?: string): string[] {
  if (!listing.sounds.length && !listing.errors.length) {
    return [tag ? `No library sound has the tag "${tag}".` : 'The library has no sounds yet. `sound add <file> --title <title> --use-when <text>` adds one.'];
  }
  return [
    ...listing.sounds.map((sound) =>
      [
        `${sound.id.padEnd(20)} ${sound.title} – ${sound.use_when}`,
        `${sound.length} s`,
        `${sound.loudness} LUFS`,
        sound.cue !== undefined ? `cue ${sound.cue}` : '',
        sound.trim ? `trim ${sound.trim.start}-${sound.trim.end}` : '',
        `licence ${sound.licence}`,
        sound.tags.length ? `tags: ${sound.tags.join(', ')}` : '',
        sound.used_in.length ? `used in ${sound.used_in.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
    ),
    ...listing.errors.map((error) => `✖ ${error.id}: ${error.error}`),
  ];
}
