import { randomBytes } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { basename, extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { stringify } from 'yaml';
import {
  ReferencesSchema,
  ValidationError,
  loadDefaults,
  loadProject,
  lyricsSections,
  pathExists,
  readYamlFile,
  saveState,
  setStageDone,
  stageDefinition,
  writeJsonAtomic,
  writeTextAtomic,
  type ImageProviderKind,
  type Reference,
  type ReferenceKind,
  type References,
  type VideoProviderKind,
} from '@coreslopper/core';
import { resolveHiggsfieldCredentials, resolveTopviewApiKey } from '@coreslopper/providers';
import { createProject } from './new-project.js';
import { FORMAT_SIZES, createSeries, type NewSeriesOptions } from './new-series.js';
import { collectSeriesStatus } from './series.js';
import { productionSeries, projectDirs, seriesDirs } from './board-production.js';

// The board's wizard for a new music video, series, or episode. Every step is
// a function here that the CLI can run as well: project creation through
// `createProject` / `createSeries`, lyrics with confirmed section tags, the
// song through `import-song`, and the user's references in references.yaml.
// The grilling (brief, treatment, bible, script) stays in Claude Code.

export const REFERENCE_KINDS: ReferenceKind[] = ['look', 'character', 'location', 'storyboard', 'concept', 'footage', 'voice', 'other'];
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const MB = 1024 * 1024;

export const UPLOAD_LIMITS = {
  audio: { bytes: 1024 * MB, extensions: ['.wav', '.mp3', '.flac', '.aif', '.aiff', '.m4a', '.ogg', '.opus'] },
  reference: {
    bytes: 4096 * MB,
    extensions: [
      '.png', '.jpg', '.jpeg', '.webp', '.gif',
      '.mp4', '.mov', '.webm', '.mkv',
      '.wav', '.mp3', '.flac', '.m4a', '.aiff', '.ogg',
      '.pdf', '.md', '.txt', '.docx', '.pptx', '.odt',
    ],
  },
} as const;

/** A file name that is safe on every system: letters, digits, dot, dash, underscore. */
export function safeFileName(name: string): string {
  const base = basename(name).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '-').replace(/^[-.]+|-+(?=\.)|[-.]+$/g, '').toLowerCase();
  return base || 'file';
}

// ---------------------------------------------------------------- references

export const referencesPath = (dir: string) => join(dir, 'references.yaml');
const referencesDir = (dir: string) => join(dir, 'assets', 'references');

export async function loadReferences(dir: string): Promise<References> {
  return pathExists(referencesPath(dir)) ? readYamlFile(referencesPath(dir), ReferencesSchema) : { version: 1, references: [] };
}

async function saveReferences(dir: string, references: References): Promise<void> {
  const header = '# The user\'s references for the grilling and the bibles; files are in assets/references/.\n';
  await writeTextAtomic(referencesPath(dir), header + stringify(ReferencesSchema.parse(references)));
}

function checkKind(kind: unknown): ReferenceKind {
  if (typeof kind !== 'string' || !REFERENCE_KINDS.includes(kind as ReferenceKind)) throw new ValidationError(`kind must be one of ${REFERENCE_KINDS.join(', ')}`);
  return kind as ReferenceKind;
}

function optionalText(value: unknown, name: string, max = 2000): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > max) throw new ValidationError(`${name} must be text up to ${max} characters`);
  return value.trim() || undefined;
}

export interface ReferenceInput {
  kind: unknown;
  subject?: unknown;
  note?: unknown;
}

/** Record a reference file that is already in assets/references/. */
export async function recordReferenceFile(dir: string, file: string, title: string, input: ReferenceInput, now = new Date()): Promise<Reference> {
  const references = await loadReferences(dir);
  const reference: Reference = {
    id: `r${randomBytes(4).toString('hex')}`,
    kind: checkKind(input.kind),
    file: `assets/references/${basename(file)}`,
    title,
    ...(optionalText(input.subject, 'subject', 200) ? { subject: optionalText(input.subject, 'subject', 200) } : {}),
    ...(optionalText(input.note, 'note') ? { note: optionalText(input.note, 'note') } : {}),
    added: now.toISOString(),
  };
  references.references.push(reference);
  await saveReferences(dir, references);
  return reference;
}

/** A free name in assets/references/ for an incoming file: `moodboard.jpg`, then `moodboard-2.jpg`. */
export async function referenceTarget(dir: string, name: string): Promise<string> {
  const extension = extname(name).toLowerCase();
  if (!(UPLOAD_LIMITS.reference.extensions as readonly string[]).includes(extension)) {
    throw new ValidationError(`references take ${UPLOAD_LIMITS.reference.extensions.join(' ')}; got ${extension || 'no extension'}`);
  }
  await mkdir(referencesDir(dir), { recursive: true });
  const stem = safeFileName(basename(name, extname(name)));
  for (let n = 1; ; n += 1) {
    const candidate = join(referencesDir(dir), `${stem}${n === 1 ? '' : `-${n}`}${extension}`);
    if (!existsSync(candidate)) return candidate;
  }
}

/** Copy a file from disk into the references (the CLI's `reference add`). */
export async function addReferenceFromPath(dir: string, source: string, input: ReferenceInput, now = new Date()): Promise<Reference> {
  if (!existsSync(source)) throw new ValidationError(`missing file: ${source}`);
  const target = await referenceTarget(dir, source);
  const { copyFile } = await import('node:fs/promises');
  await copyFile(source, target);
  return recordReferenceFile(dir, target, basename(source), input, now);
}

export async function addReferenceLink(dir: string, input: ReferenceInput & { url: unknown; title?: unknown }, now = new Date()): Promise<Reference> {
  if (typeof input.url !== 'string' || !/^https?:\/\/\S+$/.test(input.url) || input.url.length > 2000) throw new ValidationError('a link starts with http:// or https://');
  const references = await loadReferences(dir);
  const reference: Reference = {
    id: `r${randomBytes(4).toString('hex')}`,
    kind: checkKind(input.kind),
    url: input.url,
    ...(optionalText(input.title, 'title', 300) ? { title: optionalText(input.title, 'title', 300) } : {}),
    ...(optionalText(input.subject, 'subject', 200) ? { subject: optionalText(input.subject, 'subject', 200) } : {}),
    ...(optionalText(input.note, 'note') ? { note: optionalText(input.note, 'note') } : {}),
    added: now.toISOString(),
  };
  references.references.push(reference);
  await saveReferences(dir, references);
  return reference;
}

export async function updateReference(dir: string, id: unknown, input: Partial<ReferenceInput>): Promise<Reference> {
  const references = await loadReferences(dir);
  const reference = references.references.find((entry) => entry.id === id);
  if (!reference) throw new ValidationError('unknown reference');
  if (input.kind !== undefined) reference.kind = checkKind(input.kind);
  if (input.subject !== undefined) {
    const subject = optionalText(input.subject, 'subject', 200);
    if (subject) reference.subject = subject;
    else delete reference.subject;
  }
  if (input.note !== undefined) {
    const note = optionalText(input.note, 'note');
    if (note) reference.note = note;
    else delete reference.note;
  }
  await saveReferences(dir, references);
  return reference;
}

/** Remove a reference and its file. */
export async function removeReference(dir: string, id: unknown): Promise<void> {
  const references = await loadReferences(dir);
  const index = references.references.findIndex((entry) => entry.id === id);
  if (index < 0) throw new ValidationError('unknown reference');
  const [reference] = references.references.splice(index, 1);
  if (reference?.file) await rm(join(dir, reference.file), { force: true });
  await saveReferences(dir, references);
}

// ------------------------------------------------------------------- uploads

/**
 * Stream a request body into `target` (through a `.part` file), refusing more
 * than `maxBytes`. The file appears only complete.
 */
export async function receiveUpload(req: IncomingMessage, target: string, maxBytes: number): Promise<number> {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > maxBytes) throw new ValidationError(`the file is larger than ${Math.round(maxBytes / MB)} MB`);
  const part = `${target}.part`;
  let size = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      size += chunk.length;
      if (size > maxBytes) done(new ValidationError(`the file is larger than ${Math.round(maxBytes / MB)} MB`));
      else done(null, chunk);
    },
  });
  try {
    await pipeline(req, limit, createWriteStream(part));
    if (size === 0) throw new ValidationError('the file is empty');
    await rename(part, target);
    return size;
  } catch (error) {
    await rm(part, { force: true });
    throw error;
  }
}

// ---------------------------------------------------------------- music video

export interface NewVideoInput {
  slug: unknown;
  title: unknown;
  artist: unknown;
  budget: unknown;
  imageProvider: unknown;
  videoProvider: unknown;
  language: unknown;
  rights: unknown;
  license: unknown;
  /** `true`: never released publicly (`distribution: internal`). */
  internal?: unknown;
}

const IMAGE_PROVIDERS = ['mock', 'fal', 'higgsfield', 'topview', 'comfyui'] as const;
const VIDEO_PROVIDERS = ['mock', 'fal', 'higgsfield', 'topview', 'comfyui'] as const;

function required(value: unknown, name: string, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new ValidationError(`${name} is required (up to ${max} characters)`);
  return value.trim();
}

function choice<T extends string>(value: unknown, options: readonly T[], name: string): T {
  if (typeof value !== 'string' || !options.includes(value as T)) throw new ValidationError(`${name} must be one of ${options.join(', ')}`);
  return value as T;
}

function budget(value: unknown): number {
  const number = typeof value === 'string' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number) || number <= 0) throw new ValidationError('the budget is required, in USD');
  return number;
}

/** The wizard's "not released publicly" box: `internal`, or nothing written. */
function distribution(internal: unknown): { distribution?: 'internal' } {
  if (internal === undefined || internal === false) return {};
  if (internal === true) return { distribution: 'internal' };
  throw new ValidationError('internal is true or false');
}

function slugOf(value: unknown): string {
  const slug = required(value, 'slug', 80);
  if (!SLUG.test(slug)) throw new ValidationError('the slug takes lowercase letters, digits, and dashes');
  return slug;
}

/** `new` plus song.json's metadata: step 1 of the music-video wizard. */
export async function createVideoProject(root: string, input: NewVideoInput): Promise<string> {
  const language = required(input.language, 'language', 12);
  if (!/^[a-z]{2,3}(-[A-Za-z]{2})?$/.test(language)) throw new ValidationError('the language is an ISO code like en, de, or pt-BR');
  const dir = await createProject({
    root,
    slug: slugOf(input.slug),
    title: required(input.title, 'title'),
    budget: budget(input.budget),
    imageProvider: choice(input.imageProvider, IMAGE_PROVIDERS, 'image provider') as ImageProviderKind,
    videoProvider: choice(input.videoProvider, VIDEO_PROVIDERS, 'video provider') as VideoProviderKind,
    ...distribution(input.internal),
  });
  await writeJsonAtomic(join(dir, 'song.json'), {
    title: required(input.title, 'title'),
    artist: required(input.artist, 'artist'),
    language,
    license: required(input.license, 'license', 500),
    rights: required(input.rights, 'rights', 500),
  });
  return dir;
}

/** Write lyrics.txt as given, once every sung line sits under a section tag. */
export async function writeLyrics(projectDir: string, text: unknown): Promise<void> {
  if (typeof text !== 'string' || !text.trim()) throw new ValidationError('paste the lyrics first');
  if (text.length > 100_000) throw new ValidationError('the lyrics are longer than 100,000 characters');
  const { sections, untagged } = lyricsSections(text);
  if (untagged.length) throw new ValidationError(`lines before the first section tag: "${untagged[0]}". Put a tag like [Intro] or [Verse 1] above them.`);
  if (!sections.some((section) => section.lines.length)) throw new ValidationError('the lyrics have section tags but no lines');
  await writeTextAtomic(join(projectDir, 'lyrics.txt'), text.replace(/\r\n?/g, '\n').replace(/\s*$/, '\n'));
}

/** Store an uploaded song or vocal stem in audio/, replacing an earlier one of any format. */
export async function audioTarget(projectDir: string, target: 'song' | 'vocals', name: string): Promise<string> {
  const extension = extname(name).toLowerCase();
  if (!(UPLOAD_LIMITS.audio.extensions as readonly string[]).includes(extension)) {
    throw new ValidationError(`audio takes ${UPLOAD_LIMITS.audio.extensions.join(' ')}; got ${extension || 'no extension'}`);
  }
  const dir = target === 'song' ? join(projectDir, 'audio') : join(projectDir, 'audio', 'stems');
  await mkdir(dir, { recursive: true });
  for (const file of await readdir(dir)) {
    if (basename(file, extname(file)).toLowerCase() === target && (UPLOAD_LIMITS.audio.extensions as readonly string[]).includes(extname(file).toLowerCase())) {
      await rm(join(dir, file), { force: true });
    }
  }
  return join(dir, `${target}${extension}`);
}

/** Register the song (and the stem, if there is one) with `import-song`. */
export async function importUploadedSong(projectDir: string): Promise<{ warnings: string[] }> {
  const warnings: string[] = [];
  const { importSong } = await import('./media.js');
  const audioDir = join(projectDir, 'audio');
  const songs = (await readdir(audioDir).catch(() => [] as string[])).filter(
    (file) => basename(file, extname(file)).toLowerCase() === 'song' && (UPLOAD_LIMITS.audio.extensions as readonly string[]).includes(extname(file).toLowerCase()),
  );
  if (!songs.length) return { warnings };
  // The uploaded original, not the song.wav an earlier import converted from it.
  const original = songs.find((file) => extname(file).toLowerCase() !== '.wav') ?? songs[0]!;
  await importSong(projectDir, { song: join(audioDir, original), warn: (message) => warnings.push(message) });
  return { warnings };
}

export interface VideoWizardState {
  slug: string;
  title: string;
  song: { title?: string; artist?: string; language?: string; rights?: string; license?: string; duration?: number; stems?: boolean; sourceFiles?: Record<string, string> };
  lyrics: { text: string; written: boolean };
  references: Reference[];
  setupDone: boolean;
  /** What still keeps the setup from being done. */
  missing: string[];
}

export async function videoWizardState(projectDir: string): Promise<VideoWizardState> {
  const project = await loadProject(projectDir);
  if (project.config.kind === 'episode') throw new ValidationError(`${project.config.slug} is an episode`);
  const song = existsSync(project.paths.song) ? (JSON.parse(await readFile(project.paths.song, 'utf8')) as VideoWizardState['song']) : {};
  const text = await readFile(project.paths.lyrics, 'utf8').catch(() => '');
  const template = await readFile(join(projectDir, '..', '..', 'templates', 'project', 'lyrics.txt'), 'utf8').catch(() => '');
  const written = Boolean(text.trim()) && text.trim() !== template.trim() && lyricsSections(text).sections.some((section) => section.lines.length);
  const missing: string[] = [];
  if (!written) missing.push('lyrics');
  if (typeof song.duration !== 'number') missing.push('song');
  return {
    slug: project.config.slug,
    title: project.config.title,
    song,
    lyrics: { text: written ? text : '', written },
    references: (await loadReferences(projectDir)).references,
    setupDone: project.state.stages.setup?.status === 'done',
    missing,
  };
}

/**
 * Mark `setup` done: a music video once the lyrics and the song are in, so `/new-video <slug>` starts with the
 * brief; a meme once its pitch holds the idea, so `/new-meme <slug>` starts with the script.
 */
export async function finishSetup(projectDir: string): Promise<void> {
  const project = await loadProject(projectDir);
  if (project.config.kind === 'meme') {
    const pitch = await readFile(join(projectDir, 'pitch.md'), 'utf8').catch(() => '');
    if (!pitch.trim()) throw new ValidationError('still missing: the idea in pitch.md');
  } else if (project.config.kind !== 'episode') {
    const state = await videoWizardState(projectDir);
    if (state.missing.length) throw new ValidationError(`still missing: ${state.missing.join(', ')}`);
  }
  const outputs = stageDefinition('setup', project.config.kind)?.outputs ?? [];
  setStageDone(project.state, 'setup', outputs);
  await saveState(project.paths.state, project.state);
}

// --------------------------------------------------------- series and episode

export interface NewSeriesInput {
  slug: unknown;
  title: unknown;
  budget: unknown;
  format: unknown;
  imageProvider: unknown;
  videoProvider: unknown;
  audioProvider: unknown;
}

export async function createSeriesCanon(root: string, input: NewSeriesInput): Promise<string> {
  return createSeries({
    root,
    slug: slugOf(input.slug),
    title: required(input.title, 'title'),
    budget: budget(input.budget),
    format: choice(input.format, Object.keys(FORMAT_SIZES) as (keyof typeof FORMAT_SIZES)[], 'format'),
    providers: {
      image: choice(input.imageProvider, IMAGE_PROVIDERS, 'image provider'),
      video: choice(input.videoProvider, VIDEO_PROVIDERS, 'video provider'),
      audio: choice(input.audioProvider, ['comfyui', 'mock'] as const, 'audio provider'),
    } as NewSeriesOptions['providers'],
  });
}

export interface NewEpisodeInput {
  series: unknown;
  episode: unknown;
  slug: unknown;
  budget: unknown;
  /** `true`: never released publicly (`distribution: internal`). */
  internal?: unknown;
}

/** `new --kind episode`, then `setup` done: `/new-episode <slug>` starts with the script. */
export async function createEpisode(root: string, input: NewEpisodeInput): Promise<string> {
  const series = slugOf(input.series);
  const episode = typeof input.episode === 'string' ? Number(input.episode) : input.episode;
  if (typeof episode !== 'number' || !Number.isInteger(episode) || episode < 1) throw new ValidationError('the episode number is a whole number from 1');
  const dir = await createProject({ root, slug: slugOf(input.slug), kind: 'episode', series, episode, budget: budget(input.budget), ...distribution(input.internal) });
  await finishSetup(dir);
  return dir;
}

// ---------------------------------------------------------------------- meme

export interface NewMemeInput {
  slug: unknown;
  title: unknown;
  /** Defaults to `MEME_DEFAULT_BUDGET_USD`. */
  budget?: unknown;
  imageProvider: unknown;
  videoProvider: unknown;
  /** Required: what the meme is about, in the user's words. */
  idea: unknown;
  setting?: unknown;
  /** Library character ids to copy in; none is valid. */
  characters?: unknown;
  /** `true`: never released publicly (`distribution: internal`). */
  internal?: unknown;
}

export const MEME_DEFAULT_BUDGET_USD = 10;

/** pitch.md: the idea and the setting in the user's words, where the grilling starts (ADR 0051). */
export function memePitch(idea: string, setting?: string): string {
  return ['# Pitch', '', '## Idea', '', idea, ...(setting ? ['', '## Setting', '', setting] : []), ''].join('\n');
}

function characterIds(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string' || !SLUG.test(id))) {
    throw new ValidationError('characters is a list of library character ids');
  }
  return [...new Set(value as string[])];
}

/**
 * CMD-CreateMeme: a project of kind meme in its one 9:16 format, `pitch.md` from the idea and the setting, the
 * chosen library characters copied in through `useCharacter`, and `setup` done, so `/new-meme <slug>` starts
 * with the script. Every check runs before the folder exists; a later failure removes the folder again.
 */
export async function createMeme(root: string, input: NewMemeInput): Promise<string> {
  const idea = typeof input.idea === 'string' ? input.idea.trim() : '';
  if (!idea) throw new ValidationError('the meme needs an idea');
  if (idea.length > 2000) throw new ValidationError('the idea is longer than 2000 characters');
  const setting = optionalText(input.setting, 'setting');
  const slug = slugOf(input.slug);
  if (existsSync(join(root, 'projects', slug))) throw new ValidationError(`the slug "${slug}" is taken`);
  const characters = characterIds(input.characters);
  const { loadLibraryCharacter, useCharacter } = await import('./character-library.js');
  for (const id of characters) await loadLibraryCharacter(root, id);

  const dir = await createProject({
    root,
    slug,
    kind: 'meme',
    title: required(input.title, 'title'),
    budget: input.budget === undefined || input.budget === '' ? MEME_DEFAULT_BUDGET_USD : budget(input.budget),
    imageProvider: choice(input.imageProvider, IMAGE_PROVIDERS, 'image provider') as ImageProviderKind,
    videoProvider: choice(input.videoProvider, VIDEO_PROVIDERS, 'video provider') as VideoProviderKind,
    ...distribution(input.internal),
  });
  try {
    await writeTextAtomic(join(dir, 'pitch.md'), memePitch(idea, setting));
    for (const id of characters) await useCharacter(root, dir, id);
    await finishSetup(dir);
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
  return dir;
}

// ------------------------------------------------------------------- options

export interface WizardOptions {
  providers: Record<'fal' | 'higgsfield' | 'topview' | 'comfyui', boolean>;
  minimumBudgetUsd: number;
  formats: string[];
  series: Array<{ slug: string; title: string; canonReady: boolean; remainingUsd?: number; next?: { episode: number; title: string }; created: number[] }>;
  slugs: string[];
}

/** What the wizard offers: providers with credentials, the series with their next planned episode, and the slugs in use. */
export async function wizardOptions(root: string, env: NodeJS.ProcessEnv = process.env): Promise<WizardOptions> {
  const series: WizardOptions['series'] = [];
  for (const dir of await seriesDirs(root)) {
    const view = await productionSeries(dir);
    if ('error' in view) continue;
    const status = await collectSeriesStatus(dir);
    const next = status.episodes.find((episode) => !episode.slug);
    series.push({
      slug: view.slug,
      title: view.title,
      canonReady: view.canonGaps.length === 0,
      ...(view.budget.remainingUsd !== undefined ? { remainingUsd: view.budget.remainingUsd } : {}),
      ...(next ? { next: { episode: next.episode, title: next.title } } : {}),
      created: status.episodes.filter((episode) => episode.slug).map((episode) => episode.episode),
    });
  }
  return {
    providers: {
      fal: Boolean(env.FAL_KEY),
      higgsfield: Boolean(resolveHiggsfieldCredentials(env)),
      topview: Boolean(resolveTopviewApiKey(env)),
      comfyui: Boolean(env.COMFYUI_URL) || existsSync(join(root, 'comfyui', 'workflows')),
    },
    minimumBudgetUsd: (await loadDefaults(root)).budget.minimum_usd,
    formats: Object.keys(FORMAT_SIZES),
    series,
    slugs: [...(await projectDirs(root)), ...(await seriesDirs(root))].map((dir) => basename(dir)),
  };
}

