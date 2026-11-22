import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify } from 'yaml';
import {
  LIBRARY_SOUND_FILE,
  LibrarySoundSchema,
  ValidationError,
  hashFileStream,
  librarySoundTimeProblems,
  readYamlFile,
  writeTextAtomic,
  type LibrarySound,
} from '@coreslopper/core';
import { measureLoudness } from './episode-track.js';
import { probeDuration, resolveBinary } from './media.js';

// The workspace's sound library (BC-SoundLibrary, ADR 0051):
// `library/sounds/<id>/sound.yaml` next to one WAV, `sound.wav`. The user owns
// it; update and init never touch it. The WAV is gitignored, sound.yaml stays
// tracked. A meme takes a copy of a sound as a take, never a link.

const ID = /^[a-z0-9][a-z0-9_-]*$/;

export const soundLibraryRoot = (root: string) => join(root, 'library', 'sounds');
export const soundDir = (root: string, id: string) => join(soundLibraryRoot(root), checkId(id));
const soundFile = (root: string, id: string) => join(soundDir(root, id), 'sound.yaml');

function checkId(id: unknown): string {
  if (typeof id !== 'string' || !ID.test(id) || id.length > 80) throw new ValidationError(`not a library sound id: ${String(id)}`);
  return id;
}

/** EVT-LibrarySoundRefused: why a sound did not go into the library, and the entry it collided with. */
export class SoundRefused extends ValidationError {
  constructor(
    message: string,
    readonly reason: 'id-taken' | 'duplicate' | 'not-audio' | 'outside' | 'invalid',
    readonly existing?: string,
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

async function writeSound(file: string, sound: LibrarySound): Promise<void> {
  const header = '# A sound of the workspace library; its audio is sound.wav next to this file. See docs/adr/0051-memes-and-the-sound-library.md.\n';
  await writeTextAtomic(file, header + stringify(LibrarySoundSchema.parse(sound)));
}

/** Every readable entry's id and file hash; a broken entry is skipped here and reported by `sound check`. */
async function storedHashes(root: string): Promise<{ id: string; hash: string }[]> {
  const dir = soundLibraryRoot(root);
  if (!existsSync(dir)) return [];
  const entries: { id: string; hash: string }[] = [];
  for (const name of await readdir(dir)) {
    if (!ID.test(name) || !existsSync(soundFile(root, name))) continue;
    try {
      entries.push({ id: name, hash: (await loadLibrarySound(root, name)).hash });
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
    if (required) throw new SoundRefused(`${field} is required`, 'invalid');
    return undefined;
  }
  if (typeof value !== 'string' || value.length > max) throw new SoundRefused(`${field} must be text up to ${max} characters`, 'invalid');
  const trimmed = value.trim();
  if (!trimmed && required) throw new SoundRefused(`${field} is required`, 'invalid');
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
    return { start: seconds(start, 'trim start') ?? 0, end: seconds(end, 'trim end')! };
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
    ['-y', '-v', 'error', '-i', source, '-vn', '-map', '0:a:0', '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', '-c:a', 'pcm_s16le', '-ar', '48000', target],
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
  if (existsSync(soundDir(root, id))) throw new SoundRefused(`the id "${id}" is taken; choose another with --id`, 'id-taken', id);
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
    if (problems.length) throw new SoundRefused(problems.map((problem) => problem.message).join('; '), 'outside');
    const hash = await hashFileStream(wav);
    const same = (await storedHashes(root)).find((entry) => entry.hash === hash);
    if (same) throw new SoundRefused(`this file is already stored as "${same.id}"`, 'duplicate', same.id);
    const loudness = Math.round(measureLoudness(wav).lufs * 10) / 10;
    if (!Number.isFinite(loudness)) throw new SoundRefused(`${input.file} is silent; its loudness cannot be measured`, 'not-audio');

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
      added: now.toISOString(),
    });
    await writeSound(join(incoming, 'sound.yaml'), sound);
    await rename(incoming, soundDir(root, id));
    return sound;
  } finally {
    await rm(incoming, { recursive: true, force: true });
  }
}
