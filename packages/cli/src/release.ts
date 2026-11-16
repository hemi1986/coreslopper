import { existsSync } from 'node:fs';
import { copyFile, link, mkdir, readFile, rm, stat, unlink } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import {
  CANVAS_SPEC,
  ReleaseManifestSchema,
  ValidationError,
  buildLrc,
  buildLyricsSrt,
  buildSrt,
  canvasWindow,
  chapterProblems,
  chaptersFromSections,
  channelTodos,
  formatId,
  hashFileStream,
  loadChannel,
  loadProject,
  platformLimits,
  platformTextProblems,
  plainLyrics,
  readJsonFile,
  releaseIdentity,
  releaseTodos,
  repoRoot,
  resolveAnchor,
  safeFileName,
  sha256,
  writeJsonAtomic,
  writeTextAtomic,
  type Chapter,
  type LoadedProject,
  type ReleaseFile,
  type ReleaseFileKind,
  type ReleaseManifest,
  type UploadData,
} from '@coreslopper/core';
import { listShorts, shortName, shortPaths } from './release-files.js';
import {
  audioFacts,
  canvasArgs,
  measureSilence,
  probeMedia,
  runFfmpeg,
  videoFacts,
  wavConvertArgs,
  wavIsDeliverable,
  WAV_SPEC,
  type FfmpegRunner,
  type Prober,
} from './release-media.js';
import { readmeText, releaseLabels, releaseTexts, youtubeDescriptionText, type ReleaseTextInput } from './release-texts.js';
import { listThumbnails } from './thumbnail-files.js';
import { loadUploadData, uploadPaths } from './upload-text.js';
import { parseTimePoint } from './short.js';

/** The release folder of a project; on CORESLOPPER_MEDIA_DIR when `renders/` is linked there. */
export function releaseDir(projectDir: string): string {
  return join(resolve(projectDir), 'renders', 'release');
}

/** The cover source the skill composes with `thumbnail --format 1x1`. */
export const COVER_SOURCE = 'renders/cover-3000x3000.jpg';

export interface ReleaseDeps {
  probe: Prober;
  ffmpeg: FfmpegRunner;
  /** Render one format (segment render with the usual limits); returns the file. */
  render: (projectDir: string, format: string) => Promise<string>;
  /** The current inputs hash of a format's render; undefined when it cannot be computed. */
  inputsHash: (projectDir: string, format: string) => Promise<string | undefined>;
  now: () => Date;
  log: (line: string) => void;
}

export interface ReleaseOptions {
  projectDir: string;
  /** Render missing or stale formats (default). `false` lists them as TODOs. */
  render?: boolean;
  /** Canvas start: seconds or an anchor such as `section:chorus_1`. */
  canvasFrom?: string;
  canvasSeconds?: number;
  deps?: Partial<ReleaseDeps>;
}

export interface ReleaseResult {
  dir: string;
  manifest: ReleaseManifest;
  todos: string[];
  /** Broken limits and invalid files: the package is not ready. */
  errors: string[];
  warnings: string[];
}

async function defaultDeps(): Promise<ReleaseDeps> {
  const { renderProject, buildVideoProps, renderInputsHash } = await import('./render.js');
  return {
    probe: probeMedia,
    ffmpeg: runFfmpeg,
    render: (projectDir, format) => renderProject({ projectDir, format: format as never, requireAudio: true }),
    inputsHash: async (projectDir, format) => {
      try {
        const { props } = await buildVideoProps({ projectDir, format: format as never });
        return await renderInputsHash(props);
      } catch {
        return undefined;
      }
    },
    now: () => new Date(),
    log: (line) => console.log(line),
  };
}

/** Writes into the release folder and remembers each file for the manifest. */
class ReleaseWriter {
  readonly files: ReleaseFile[] = [];

  constructor(
    readonly dir: string,
    private readonly projectRoot: string,
    private readonly previous: Map<string, ReleaseFile>,
  ) {}

  private sourceName(path: string): string {
    const rel = relative(this.projectRoot, path);
    return rel.startsWith('..') ? path : rel.split(sep).join('/');
  }

  /** Hardlink (or copy) a source file; untouched when the release copy already has the same content. */
  async place(source: string, path: string, kind: ReleaseFileKind, spec: Record<string, unknown> = {}): Promise<string> {
    const target = join(this.dir, path);
    const hash = await hashFileStream(source);
    const current = existsSync(target) ? await hashFileStream(target) : undefined;
    if (current !== hash) {
      await mkdir(dirname(target), { recursive: true });
      await rm(target, { force: true });
      try {
        await link(source, target);
      } catch {
        await copyFile(source, target);
      }
    }
    this.files.push({ path, kind, bytes: (await stat(target)).size, sha256: hash, spec, source: this.sourceName(source) });
    return hash;
  }

  /** Write a generated text file; untouched when the content is the same. */
  async text(path: string, content: string, kind: ReleaseFileKind, spec: Record<string, unknown> = {}): Promise<void> {
    const target = join(this.dir, path);
    const existing = existsSync(target) ? await readFile(target, 'utf8') : undefined;
    if (existing !== content) await writeTextAtomic(target, content);
    this.files.push({ path, kind, bytes: Buffer.byteLength(content), sha256: sha256(content), spec, source: 'generated' });
  }

  /** Register a file a job wrote into the folder. */
  async generated(path: string, kind: ReleaseFileKind, spec: Record<string, unknown>, source = 'generated'): Promise<void> {
    const target = join(this.dir, path);
    this.files.push({ path, kind, bytes: (await stat(target)).size, sha256: await hashFileStream(target), spec, source });
  }

  /** The previous manifest's entry, when its file is still on disk unchanged. */
  async unchanged(path: string, match: (entry: ReleaseFile) => boolean): Promise<ReleaseFile | undefined> {
    const entry = this.previous.get(path);
    const target = join(this.dir, path);
    if (!entry || !match(entry) || !existsSync(target)) return undefined;
    return (await hashFileStream(target)) === entry.sha256 ? entry : undefined;
  }
}

/** song.json as written by setup and import-song; empty when missing or unreadable. */
async function songJson(project: LoadedProject): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(project.paths.song, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Formats of the project: the master first, then each derivative, with size and frame rate. */
export function projectFormats(project: Pick<LoadedProject, 'config'>): { id: string; width: number; height: number; fps: number }[] {
  const { master, derivatives } = project.config.formats;
  return [master, ...derivatives].map((format) => ({ id: formatId(format.aspect), width: format.width, height: format.height, fps: master.fps }));
}

/**
 * Build `renders/release/`: collect the renders, thumbnails, and Shorts; make
 * the WAV, canvas, lyrics, and texts; write README.md and manifest.json.
 * Re-running changes only what changed and removes only files it wrote before.
 */
export async function buildRelease(options: ReleaseOptions): Promise<ReleaseResult> {
  const deps = { ...(await defaultDeps()), ...options.deps };
  const project = await loadProject(options.projectDir);
  const root = repoRoot();
  const music = project.config.kind !== 'episode';
  const dir = releaseDir(project.paths.root);
  const manifestPath = join(dir, 'manifest.json');
  const previous = existsSync(manifestPath) ? await readJsonFile(manifestPath, ReleaseManifestSchema).catch(() => undefined) : undefined;
  const writer = new ReleaseWriter(dir, project.paths.root, new Map((previous?.files ?? []).map((file) => [file.path, file])));
  const channel = await loadChannel(root);
  const limits = platformLimits(channel);
  const song = await songJson(project);
  const identity = releaseIdentity(project.config, song);
  const slug = project.config.slug;
  const todos: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const timing = project.effectiveTiming ?? project.timing;

  let data: UploadData | undefined;
  if (existsSync(uploadPaths(project.paths.root).data)) data = await loadUploadData(project.paths.root);
  else todos.push('review/upload.yaml is missing: write the platform texts (video-qa release.md)');
  const language = project.config.release?.language ?? (typeof song.language === 'string' ? song.language : undefined) ?? data?.language ?? channel?.language ?? 'en';

  if (music) todos.push(...releaseTodos(project.config.release, channel, identity));
  todos.push(...channelTodos(channel));
  await mkdir(dir, { recursive: true });

  // video/: every configured format, rendered only when missing or stale.
  const files: ReleaseTextInput['files'] = { thumbnails: [], shorts: [] };
  for (const format of projectFormats(project)) {
    const rel = `renders/${format.id}.mp4`;
    const source = join(project.paths.root, rel);
    const recorded = project.state.artifacts[`render:${rel}:inputs`];
    let stale = !existsSync(source);
    let reason = 'missing';
    if (!stale && recorded) {
      const current = await deps.inputsHash(project.paths.root, format.id);
      if (current && current !== recorded) {
        stale = true;
        reason = 'stale (storyboard, timing, assets, or song changed since it was rendered)';
      }
    } else if (!stale) {
      warnings.push(`${rel} has no recorded render hash; assumed current (renders made before release tracking)`);
    }
    if (stale) {
      if (options.render === false) {
        todos.push(`${rel} is ${reason}: npm run cli -- render projects/${slug} --format ${format.id}`);
        continue;
      }
      deps.log(`Rendering ${format.id} (${reason})...`);
      await deps.render(project.paths.root, format.id);
    }
    const recordedFile = loadedArtifact(await loadProject(project.paths.root), `render:${rel}:sha256`);
    const path = `video/${slug}-${format.id}.mp4`;
    const facts = videoFacts(deps.probe(source));
    const hash = await writer.place(source, path, 'video', { ...format, duration: timing?.audio.duration, measured: facts });
    if (recordedFile && recordedFile !== hash) warnings.push(`${rel} differs from the render recorded in state.json`);
    if (format.id === formatId(project.config.formats.master.aspect)) files.master = path;
  }

  // Subtitles: the episode's English subtitles, or the lyrics as SRT.
  if (!music && project.script && timing) {
    files.subtitles = `video/${slug}.en.srt`;
    await writer.text(files.subtitles, buildSrt(project.script, timing), 'subtitles', { language: 'en' });
  } else if (music && timing?.lines.some((line) => line.text.trim())) {
    files.subtitles = `video/${slug}.${language}.srt`;
    await writer.text(files.subtitles, buildLyricsSrt(timing), 'subtitles', { language, lines: timing.lines.length });
  }

  // thumbnails/: the upload thumbnail first, then the alternates (or the folder's order).
  const available = await listThumbnails(project.paths.renders);
  const ordered = data?.main.thumbnail
    ? [data.main.thumbnail, ...data.main.alternate_thumbnails].map((file) => resolve(project.paths.root, file)).filter((file) => existsSync(file))
    : available;
  for (const [index, source] of ordered.slice(0, 3).entries()) {
    const path = `thumbnails/thumb-${index + 1}.jpg`;
    await writer.place(source, path, 'thumbnail', { width: 1280, height: 720, maxBytes: 2 * 1024 * 1024 });
    files.thumbnails.push(path);
  }
  if (ordered.length < 3) todos.push(`${ordered.length} of 3 thumbnails: make them with thumbnail (thumbnails.md)`);

  // shorts/: each Short with its vertical thumbnail.
  const shorts = await listShorts(project.paths.renders);
  for (const video of shorts) {
    const name = shortName(video)!;
    const entry: (typeof files.shorts)[number] = { name, video: `shorts/${name}-9x16.mp4` };
    await writer.place(video, entry.video, 'short', { aspect: '9:16', maxSeconds: 60, measured: videoFacts(deps.probe(video)) });
    const thumb = shortPaths(project.paths.renders, name).thumbnail;
    if (existsSync(thumb)) {
      entry.thumbnail = `shorts/${name}-thumb.jpg`;
      await writer.place(thumb, entry.thumbnail, 'short-thumbnail', { width: 1080, height: 1920 });
    } else todos.push(`Short ${name} has no thumbnail: thumbnail --format 9x16`);
    const tiktok = shortPaths(project.paths.renders, name).tiktok;
    if (existsSync(tiktok)) {
      entry.tiktokCover = `shorts/${name}-tiktok.jpg`;
      await writer.place(tiktok, entry.tiktokCover, 'tiktok-cover', { width: 1080, height: 1440 });
    } else todos.push(`Short ${name} has no TikTok cover: thumbnail --format 3x4 --out renders/shorts/${name}-tiktok.jpg`);
    files.shorts.push(entry);
  }
  if (shorts.length < 3) todos.push(`${shorts.length} of 3 Shorts: cut them with short (release.md)`);

  if (music) {
    // audio/: the song as a deliverable WAV, converted only when it is not one already.
    const songPath = join(project.paths.root, 'audio', 'song.wav');
    if (!existsSync(songPath)) todos.push('audio/song.wav is missing: import the song');
    else {
      const name = `${safeFileName(identity.artist ?? 'TODO artist')} - ${safeFileName(identity.title)}.wav`;
      files.audio = `audio/${name}`;
      const probe = deps.probe(songPath);
      const facts = audioFacts(probe);
      const sourceHash = await hashFileStream(songPath);
      const spec = { codecs: WAV_SPEC.codecs, minSampleRate: WAV_SPEC.minSampleRate, channels: 2, duration: song.duration, sourceSha256: sourceHash };
      if (wavIsDeliverable(probe)) await writer.place(songPath, files.audio, 'audio', spec);
      else if (await writer.unchanged(files.audio, (entry) => entry.spec.sourceSha256 === sourceHash)) {
        await writer.generated(files.audio, 'audio', spec, 'audio/song.wav');
      } else {
        deps.log(`Converting the song to ${files.audio} (${facts.codec}, ${facts.sampleRate} Hz, ${facts.channels} ch)...`);
        await mkdir(join(dir, 'audio'), { recursive: true });
        await deps.ffmpeg(wavConvertArgs(songPath, join(dir, files.audio), facts));
        await writer.generated(files.audio, 'audio', spec, 'audio/song.wav');
      }
      const silence = await measureSilence(join(dir, files.audio), facts.duration, deps.ffmpeg).catch(() => undefined);
      if (silence && (silence.lead > WAV_SPEC.maxSilence || silence.tail > WAV_SPEC.maxSilence)) {
        warnings.push(
          `the song has ${silence.lead.toFixed(1)} s of silence at the start and ${silence.tail.toFixed(1)} s at the end; distributors want at most ${WAV_SPEC.maxSilence} s (trim the master, then import it again)`,
        );
      }
    }

    // streaming/: cover, canvas, lyrics.
    const cover = join(project.paths.root, COVER_SOURCE);
    if (existsSync(cover)) {
      files.cover = 'streaming/cover-3000x3000.jpg';
      await writer.place(cover, files.cover, 'cover', { width: 3000, height: 3000, format: 'jpeg', color: 'rgb' });
    } else todos.push(`${COVER_SOURCE} is missing: thumbnail --format 1x1 --text "ARTIST|TITLE" --out ${COVER_SOURCE}`);

    const vertical = join(project.paths.root, 'renders', '9x16.mp4');
    if (!timing) todos.push('no timing: the canvas and the lyrics need timing.json');
    else if (!existsSync(vertical)) todos.push('renders/9x16.mp4 is missing: the canvas is cut from it');
    else {
      const start = options.canvasFrom !== undefined ? resolveCanvasStart(options.canvasFrom, timing) : undefined;
      const window = canvasWindow(timing, { start, length: options.canvasSeconds });
      if (!window.textFree) todos.push(`the canvas window at ${window.start.toFixed(1)} s shows lyrics; choose a quiet part with --canvas-from`);
      files.canvas = 'streaming/canvas-9x16.mp4';
      const sourceHash = await hashFileStream(vertical);
      const spec = { seconds: window.length, start: Number(window.start.toFixed(3)), crossfade: CANVAS_SPEC.crossfade, reason: window.reason, audio: false, sourceSha256: sourceHash };
      const same = await writer.unchanged(files.canvas, (entry) => entry.spec.sourceSha256 === sourceHash && entry.spec.start === spec.start && entry.spec.seconds === spec.seconds);
      if (!same) {
        deps.log(`Cutting the canvas: ${window.length} s from ${window.start.toFixed(2)} s (${window.reason})...`);
        await mkdir(join(dir, 'streaming'), { recursive: true });
        await deps.ffmpeg(canvasArgs(vertical, join(dir, files.canvas), window, project.config.formats.master.fps));
      }
      await writer.generated(files.canvas, 'canvas', spec, 'renders/9x16.mp4');
    }

    if (existsSync(project.paths.lyrics)) {
      files.lyricsTxt = 'streaming/lyrics.txt';
      await writer.text(files.lyricsTxt, plainLyrics(await readFile(project.paths.lyrics, 'utf8')), 'lyrics', { tags: false });
    } else todos.push('lyrics.txt is missing');
    if (timing?.lines.some((line) => line.text.trim())) {
      files.lyricsLrc = 'streaming/lyrics.lrc';
      await writer.text(files.lyricsLrc, buildLrc(timing, { artist: identity.artist, title: identity.title, length: timing.audio.duration }), 'lyrics', { synced: 'line' });
    }
  }

  // texts/: one file per platform, from upload.yaml plus the facts.
  let chapters: Chapter[] = [];
  if (data?.main.chapters) {
    chapters = data.main.chapters;
    const problems = timing ? chapterProblems(chapters, timing.audio.duration) : [];
    errors.push(...problems.map((problem) => `youtube chapters: ${problem}`));
  } else if (timing) chapters = chaptersFromSections(timing);
  const input: ReleaseTextInput = {
    kind: music ? 'music-video' : 'episode',
    language,
    slug,
    artist: identity.artist,
    title: identity.title,
    data,
    release: project.config.release,
    channel,
    limits,
    chapters,
    files,
    durationSeconds: timing?.audio.duration,
  };
  if (data) {
    const problems = platformTextProblems(data, limits, { music });
    errors.push(...problems.errors);
    todos.push(...problems.missing.map((field) => `${field} is missing in review/upload.yaml`));
  }
  const texts = releaseTexts(input);
  for (const [name, content] of Object.entries(texts)) await writer.text(`texts/${name}`, content, 'text', { limits });
  const youtubeBytes = Buffer.byteLength(youtubeDescriptionText(input, releaseLabels(language)));
  if (youtubeBytes > limits.youtube.description_bytes) errors.push(`youtube main: description with chapters and footer has ${youtubeBytes} bytes, limit ${limits.youtube.description_bytes}`);

  await writer.text('README.md', readmeText(input, [...new Set(todos)]), 'readme');

  // Remove files an earlier run wrote that this run did not.
  const current = new Set(writer.files.map((file) => file.path));
  for (const old of previous?.files ?? []) {
    if (!current.has(old.path)) await unlink(join(dir, old.path)).catch(() => undefined);
  }
  const manifest: ReleaseManifest = {
    version: 1,
    project: slug,
    generated_at: deps.now().toISOString(),
    files: writer.files,
    todos: [...new Set(todos)],
  };
  await writeJsonAtomic(manifestPath, ReleaseManifestSchema.parse(manifest));
  return { dir, manifest, todos: manifest.todos, errors, warnings };
}

function loadedArtifact(project: LoadedProject, key: string): string | undefined {
  return project.state.artifacts[key];
}

function resolveCanvasStart(value: string, timing: NonNullable<LoadedProject['effectiveTiming']>): number {
  try {
    return resolveAnchor(parseTimePoint(value), timing);
  } catch (error) {
    throw new ValidationError(`--canvas-from ${value}: ${(error as Error).message}`);
  }
}

/** Run `release` and print the summary; returns the result for the caller. */
export async function runRelease(options: ReleaseOptions): Promise<ReleaseResult> {
  const result = await buildRelease(options);
  const log = options.deps?.log ?? ((line: string) => console.log(line));
  log(`Release folder: ${result.dir} (${result.manifest.files.length} files)`);
  for (const warning of result.warnings) log(`! ${warning}`);
  for (const todo of result.todos) log(`TODO ${todo}`);
  if (result.errors.length) {
    throw new ValidationError(`The release package breaks ${result.errors.length} rule(s); fix review/upload.yaml and run release again.`, result.errors);
  }
  return result;
}
