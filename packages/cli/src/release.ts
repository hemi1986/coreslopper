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
  buildReleasePlan,
  chapterProblems,
  chaptersFromSections,
  channelTodos,
  formatId,
  calendarIcs,
  hashFileStream,
  loadChannel,
  loadReleaseSchedule,
  loadProject,
  libraryTakeSoundId,
  notReleasedPublicly,
  platformLimits,
  plainLyrics,
  readJsonFile,
  releaseIdentity,
  releaseTodos,
  releasedPublicly,
  keptShapeProblem,
  manifestShape,
  releaseShape,
  postsVerticalVersion,
  SHORT_FORM_MAX_SECONDS,
  releaseStart,
  loadDefaults,
  repoRoot,
  resolveAnchor,
  safeFileName,
  sha256,
  soundLicenceTodos,
  withReleaseDefaults,
  writeJsonAtomic,
  writeTextAtomic,
  type Chapter,
  type LoadedProject,
  type Timing,
  type ReleaseFile,
  type ReleaseFileKind,
  type ReleaseManifest,
  type ReleaseCalendar,
  type ReleasePlan,
  type UploadData,
  type UsedSound,
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
import { readmeText, releaseLabels, releaseTexts, calendarEventLabel, type ReleaseTextInput } from './release-texts.js';
import { calendarInput, planCalendar } from './release-calendar.js';
import { loadStatus, withReleaseLock } from './release-records.js';
import { micrositeSong } from './release-microsite.js';
import { TIKTOK_COVER_SOURCE, VERTICAL_COVER_SOURCE, listThumbnails } from './thumbnail-files.js';
import { readRecipe, recipePath } from './thumbnail-recipe.js';
import { DERIVED_PATHS, derivedImages, teaserPathOf, teaserWindow } from './release-images.js';
import { shortFfmpegArgs } from './short.js';
import type { ThumbnailOptions } from './thumbnail.js';
import { loadUploadData, uploadPaths } from './upload-text.js';
import { parseTimePoint } from './short.js';
import { loadLibrarySound } from './sound-library.js';

/** The release folder of a project; on CORESLOPPER_MEDIA_DIR when `renders/` is linked there. */
export function releaseDir(projectDir: string): string {
  return join(resolve(projectDir), 'renders', 'release');
}

/** The plan `release` wrote into `manifest.json`, or undefined before the first release. */
export async function loadReleasePlan(projectDir: string): Promise<ReleasePlan | undefined> {
  const path = join(releaseDir(projectDir), 'manifest.json');
  if (!existsSync(path)) return undefined;
  return readJsonFile(path, ReleaseManifestSchema)
    .then((manifest) => manifest.plan)
    .catch(() => undefined);
}

/** The cover source the skill composes with `thumbnail --format 1x1`. */
export const COVER_SOURCE = 'renders/cover-3000x3000.jpg';
/** The cover of a meme or a short episode: the skill composes it with `thumbnail --format 9x16`. */
export const MEME_COVER_SOURCE = VERTICAL_COVER_SOURCE;

export interface ReleaseDeps {
  probe: Prober;
  ffmpeg: FfmpegRunner;
  /** Render one format (segment render with the usual limits); returns the file. */
  render: (projectDir: string, format: string) => Promise<string>;
  /** The current inputs hash of a format's render; undefined when it cannot be computed. */
  inputsHash: (projectDir: string, format: string) => Promise<string | undefined>;
  /** Compose one thumbnail (the Remotion still); returns the file. */
  thumbnail: (options: ThumbnailOptions) => Promise<string>;
  now: () => Date;
  log: (line: string) => void;
}

export interface ReleaseOptions {
  projectDir: string;
  /** The workspace root: the channel, the release schedule, and the sound library. Defaults to the repository root. */
  root?: string;
  /** Render missing or stale formats (default). `false` lists them as TODOs. */
  render?: boolean;
  /** Canvas start: seconds or an anchor such as `section:chorus_1`. */
  canvasFrom?: string;
  canvasSeconds?: number;
  /** Plan the release calendar again instead of keeping the times it holds. */
  replan?: boolean;
  /** Compose the announcement and story images (default). `false` keeps the ones already in the folder: the board's quick refresh. */
  stills?: boolean;
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
    thumbnail: async (thumbnailOptions) => (await import('./thumbnail.js')).renderThumbnail(thumbnailOptions),
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

  /** Carry the previous manifest's entry over unchanged, so the clean-up keeps its file. */
  keep(entry: ReleaseFile): void {
    this.files.push(entry);
  }

  /** The previous manifest's entry, when its file is still on disk unchanged. */
  async unchanged(path: string, match: (entry: ReleaseFile) => boolean): Promise<ReleaseFile | undefined> {
    const entry = this.previous.get(path);
    const target = join(this.dir, path);
    if (!entry || !match(entry) || !existsSync(target)) return undefined;
    return (await hashFileStream(target)) === entry.sha256 ? entry : undefined;
  }
}

/** The format of a horizontal episode's vertical version. */
const VERTICAL_VERSION_FORMAT = '9x16';

/**
 * Place a horizontal episode's vertical version – the 9:16 render of the whole
 * episode – as its one Short `shorts/<slug>-9x16.mp4`, named by the slug, with
 * the vertical cover as its thumbnail and the TikTok cover (ADR 0057). Without
 * a current 9:16 render it keeps the earlier copy (HS-167) and the format loop
 * has reported the TODO; a project without a 9:16 format gets a TODO.
 */
async function placeVerticalVersion(input: {
  writer: ReleaseWriter;
  project: LoadedProject;
  slug: string;
  source: string | undefined;
  timing: Timing | undefined;
  deps: ReleaseDeps;
  todos: string[];
}): Promise<ReleaseTextInput['files']['shorts']> {
  const { writer, project, slug, source, timing, deps, todos } = input;
  const entry: ReleaseTextInput['files']['shorts'][number] = { name: slug, video: `shorts/${slug}-9x16.mp4` };
  if (source) {
    await writer.place(source, entry.video, 'short', {
      aspect: '9:16',
      maxSeconds: SHORT_FORM_MAX_SECONDS,
      wholeEpisode: true,
      duration: timing?.audio.duration,
      measured: videoFacts(deps.probe(source)),
    });
  } else {
    const earlier = await writer.unchanged(entry.video, (file) => file.kind === 'short');
    if (earlier) writer.keep(earlier);
    if (!projectFormats(project).some((format) => format.id === VERTICAL_VERSION_FORMAT)) {
      todos.push('the vertical version needs a 9:16 render: add 9:16 to formats.derivatives in project.yaml');
    }
    if (!earlier) return [];
  }
  const thumbnail = join(project.paths.root, VERTICAL_COVER_SOURCE);
  if (existsSync(thumbnail)) {
    entry.thumbnail = `shorts/${slug}-thumb.jpg`;
    await writer.place(thumbnail, entry.thumbnail, 'short-thumbnail', { width: 1080, height: 1920 });
  } else todos.push(`${VERTICAL_COVER_SOURCE} is missing: compose the vertical version's thumbnail with thumbnail --format 9x16 --out ${VERTICAL_COVER_SOURCE}`);
  const tiktok = join(project.paths.root, TIKTOK_COVER_SOURCE);
  if (existsSync(tiktok)) {
    entry.tiktokCover = `shorts/${slug}-tiktok.jpg`;
    await writer.place(tiktok, entry.tiktokCover, 'tiktok-cover', { width: 1080, height: 1440 });
  } else todos.push(`${TIKTOK_COVER_SOURCE} is missing: compose the vertical version's TikTok cover with thumbnail --format 3x4 --out ${TIKTOK_COVER_SOURCE}`);
  return [entry];
}

/** song.json as written by setup and import-song; empty when missing or unreadable. */
export async function songJson(project: LoadedProject): Promise<Record<string, unknown>> {
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
 * The library sounds the project's platform texts must credit: one per sound a
 * take was copied from (HS-261, HS-265). A sound whose entry is gone carries
 * only its id, so the release check can report its unknown licence.
 */
export async function usedLibrarySounds(project: Pick<LoadedProject, 'takes' | 'paths'>, root: string): Promise<UsedSound[]> {
  const ids = new Set<string>();
  for (const take of [...Object.values(project.takes?.takes ?? {}), ...Object.values(project.takes?.ambience ?? {})]) {
    const id = libraryTakeSoundId(take.source);
    if (id) ids.add(id);
  }
  const sounds: UsedSound[] = [];
  for (const id of [...ids].sort()) {
    const sound = await loadLibrarySound(root, id).catch(() => undefined);
    sounds.push(sound ? { id, licence: sound.licence, credit: sound.credit } : { id });
  }
  return sounds;
}

/**
 * The credit texts the project's platform texts must carry: one per library
 * sound a take was copied from (HS-261, HS-265). A sound without a credit adds
 * none; a missing entry or an unknown licence is the release check's business.
 */
export async function usedSoundCredits(project: Pick<LoadedProject, 'takes' | 'paths'>, root: string): Promise<string[]> {
  const sounds = await usedLibrarySounds(project, root);
  return sounds.map((sound) => sound.credit).filter((credit): credit is string => Boolean(credit));
}

/**
 * Build `renders/release/`: collect the renders, thumbnails, and Shorts; make
 * the WAV, canvas, lyrics, and texts; write README.md and manifest.json.
 * Re-running changes only what changed and removes only files it wrote before.
 */
export async function buildRelease(options: ReleaseOptions): Promise<ReleaseResult> {
  const deps = { ...(await defaultDeps()), ...options.deps };
  const project = await loadProject(options.projectDir);
  if (!releasedPublicly(project.config)) {
    throw new ValidationError(`${notReleasedPublicly(project.config.slug)}: it gets no release package.`);
  }
  const root = options.root ?? repoRoot();
  const kind = project.config.kind;
  // A music video releases a song; an episode and a meme release a video only.
  const music = kind === 'music-video';
  const meme = kind === 'meme';
  const timing = project.effectiveTiming ?? project.timing;
  const shape = releaseShape({ kind, master: project.config.formats.master, durationSeconds: timing?.audio.duration });
  // A short episode is one video, as a meme is: no main video, thumbnails or Shorts (ADR 0057).
  const shortEpisode = shape === 'short-episode';
  const oneVideo = meme || shortEpisode;
  // A horizontal episode up to 3 minutes posts its vertical version as its one Short, not cut Shorts (ADR 0057).
  const verticalVersion = postsVerticalVersion({ kind, master: project.config.formats.master, durationSeconds: timing?.audio.duration });
  const usedSounds = meme ? await usedLibrarySounds(project, root) : [];
  const credits = usedSounds.map((sound) => sound.credit).filter((credit): credit is string => Boolean(credit));
  const dir = releaseDir(project.paths.root);
  const manifestPath = join(dir, 'manifest.json');
  const manifestOnDisk = existsSync(manifestPath);
  const previous = manifestOnDisk ? await readJsonFile(manifestPath, ReleaseManifestSchema).catch(() => undefined) : undefined;
  // Once a post went out, the shape is kept: a run with another shape fails before it writes anything (HS-268).
  if (manifestOnDisk) {
    const status = await withReleaseLock(project.paths.root, () => loadStatus(project.paths.root));
    const start = releaseStart(status);
    // A started release whose manifest cannot be read has lost the shape it must keep: refuse rather than guess.
    if (!previous && start) {
      throw new ValidationError(`${project.config.slug}: ${relative(project.paths.root, manifestPath)} cannot be read, and the release started (${start}): release changes nothing until the manifest is repaired.`);
    }
    const problem = previous && keptShapeProblem({ recorded: manifestShape(previous, kind), derived: shape, start });
    if (problem) throw new ValidationError(`${project.config.slug}: ${problem}`);
  }
  const writer = new ReleaseWriter(dir, project.paths.root, new Map((previous?.files ?? []).map((file) => [file.path, file])));
  const channel = await loadChannel(root);
  const limits = platformLimits(channel);
  const song = await songJson(project);
  // The channel's release defaults fill what the project leaves out, also the artist.
  const releaseFacts = withReleaseDefaults(project.config.release, channel);
  const identity = releaseIdentity({ ...project.config, release: releaseFacts }, song);
  const slug = project.config.slug;
  const todos: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  let data: UploadData | undefined;
  if (existsSync(uploadPaths(project.paths.root).data)) data = await loadUploadData(project.paths.root);
  else todos.push('review/upload.yaml is missing: write the platform texts (video-qa release.md)');
  const language = project.config.release?.language ?? (typeof song.language === 'string' ? song.language : undefined) ?? data?.language ?? channel?.language ?? 'en';

  if (music) todos.push(...releaseTodos(releaseFacts, channel, identity));
  if (meme) todos.push(...soundLicenceTodos(usedSounds));
  todos.push(...channelTodos(channel));
  await mkdir(dir, { recursive: true });

  // video/: every configured format, rendered only when missing or stale; a short episode's one master.
  const files: ReleaseTextInput['files'] = { thumbnails: [], shorts: [] };
  const formats = projectFormats(project);
  // The vertical version's source: the 9:16 render placed by this run, if it was current or rendered.
  let verticalSource: string | undefined;
  for (const format of shortEpisode ? formats.slice(0, 1) : formats) {
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
    const path = `video/${slug}-${format.id}.mp4`;
    if (stale) {
      if (options.render === false) {
        todos.push(`${rel} is ${reason}: npm run cli -- render projects/${slug} --format ${format.id}`);
        // The quick refresh keeps the earlier copy: the user may still be posting it on another platform.
        const earlier = await writer.unchanged(path, (entry) => entry.kind === 'video');
        if (earlier) {
          writer.keep(earlier);
          if (format.id === formatId(project.config.formats.master.aspect)) files.master = path;
          files.videos = { ...files.videos, [format.id]: path };
        }
        continue;
      }
      deps.log(`Rendering ${format.id} (${reason})...`);
      await deps.render(project.paths.root, format.id);
    }
    const recordedFile = loadedArtifact(await loadProject(project.paths.root), `render:${rel}:sha256`);
    const facts = videoFacts(deps.probe(source));
    const hash = await writer.place(source, path, 'video', { ...format, duration: timing?.audio.duration, measured: facts });
    if (recordedFile && recordedFile !== hash) warnings.push(`${rel} differs from the render recorded in state.json`);
    if (format.id === formatId(project.config.formats.master.aspect)) files.master = path;
    files.videos = { ...files.videos, [format.id]: path };
    if (format.id === VERTICAL_VERSION_FORMAT) verticalSource = source;
  }

  // Subtitles: the episode's English subtitles, or a music video's lyrics as SRT. A meme has its subtitles burned in.
  if (kind === 'episode' && project.script && timing) {
    files.subtitles = `video/${slug}.en.srt`;
    await writer.text(files.subtitles, buildSrt(project.script, timing), 'subtitles', { language: 'en' });
  } else if (music && timing?.lines.some((line) => line.text.trim())) {
    files.subtitles = `video/${slug}.${language}.srt`;
    await writer.text(files.subtitles, buildLyricsSrt(timing), 'subtitles', { language, lines: timing.lines.length });
  }

  // thumbnails/: the upload thumbnail first, then the alternates (or the folder's order). A meme and a short episode have a 9:16 cover instead.
  if (!oneVideo) {
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
  } else {
    const cover = join(project.paths.root, MEME_COVER_SOURCE);
    if (existsSync(cover)) {
      files.cover = `cover/${slug}-1080x1920.jpg`;
      await writer.place(cover, files.cover, 'cover', { width: 1080, height: 1920, format: 'jpeg', color: 'rgb' });
    } else todos.push(`${MEME_COVER_SOURCE} is missing: compose it with thumbnail --format 9x16 --out ${MEME_COVER_SOURCE}`);
  }
  if (shortEpisode) {
    const tiktok = join(project.paths.root, TIKTOK_COVER_SOURCE);
    if (existsSync(tiktok)) {
      files.tiktokCover = `cover/${slug}-1080x1440.jpg`;
      await writer.place(tiktok, files.tiktokCover, 'tiktok-cover', { width: 1080, height: 1440 });
    } else todos.push(`${TIKTOK_COVER_SOURCE} is missing: compose it with thumbnail --format 3x4 --out ${TIKTOK_COVER_SOURCE}`);
  }

  // shorts/: the vertical version as the one Short, with the vertical cover as its thumbnail and the TikTok cover.
  if (verticalVersion) files.shorts.push(...(await placeVerticalVersion({ writer, project, slug, source: verticalSource, timing, deps, todos })));

  // shorts/: each Short with its vertical thumbnail. A meme and a short episode are one video, not a set of Shorts.
  if (!oneVideo && !verticalVersion) {
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
  }

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
        await deps.ffmpeg(canvasArgs(vertical, join(dir, files.canvas), window, project.config.formats.master.fps, (await loadDefaults()).render.true_peak_dbtp));
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
  if (oneVideo) chapters = [];
  else if (data?.main.chapters) {
    chapters = data.main.chapters;
    const problems = timing ? chapterProblems(chapters, timing.audio.duration) : [];
    errors.push(...problems.map((problem) => `youtube chapters: ${problem}`));
  } else if (timing) chapters = chaptersFromSections(timing);
  const input: ReleaseTextInput = {
    kind,
    shape,
    masterFormat: formatId(project.config.formats.master.aspect),
    language,
    slug,
    artist: identity.artist,
    title: identity.title,
    data,
    release: releaseFacts,
    channel,
    limits,
    chapters,
    credits,
    files,
    durationSeconds: timing?.audio.duration,
  };
  // The calendar: the next free slots under config/release-schedule.yaml; kept times stay.
  const schedule = await loadReleaseSchedule(root);
  // A meme and a short episode are Shorts, never a Premiere.
  input.premiere = !oneVideo && schedule.release.premiere;
  input.calendar = await planCalendar(
    project.paths.root,
    calendarInput({
      slug,
      title: identity.title,
      kind: input.kind,
      shape,
      releaseDate: project.config.release?.release_date,
      data,
      shorts: files.shorts.map((short) => short.name),
      durationSeconds: input.durationSeconds,
    }),
    { root, now: deps.now(), replan: options.replan, schedule },
  );
  if (!meme) {
    await deriveReleaseMedia({ project, dir, writer, files, data, calendar: input.calendar, language, title: identity.title, deps, todos, stills: options.stills !== false, shortEpisode });
  }
  const youtubeHandle = channel?.links.youtube?.handle;
  const plan = buildReleasePlan({
    ...input,
    tiktokPointer: releaseLabels(language).tt.overlayDefault(youtubeHandle && !/<ID>/.test(youtubeHandle) ? youtubeHandle : 'YouTube'),
  });
  if (data) {
    errors.push(...plan.problems.errors);
    todos.push(...plan.problems.missing.map((field) => `${field} is missing in review/upload.yaml`));
  }
  const labels = releaseLabels(language);
  const ics = calendarIcs([input.calendar], (calendar, event) => `${calendar.title}: ${calendarEventLabel(event, labels, input.premiere, shape)}`);
  await writer.text('calendar.ics', ics, 'calendar', { events: input.calendar.events.length, release_date: input.calendar.release_date });
  if (data?.microsite && !meme) {
    const lyrics = existsSync(project.paths.lyrics) ? plainLyrics(await readFile(project.paths.lyrics, 'utf8')) : undefined;
    const song = micrositeSong(input, { status: await loadStatus(project.paths.root), calendar: input.calendar, lyrics: music ? lyrics : undefined });
    await writer.text(`microsite/${slug}.json`, `${JSON.stringify(song, null, 2)}\n`, 'microsite', {});
  }
  const texts = releaseTexts(plan, input);
  for (const [name, content] of Object.entries(texts)) await writer.text(`texts/${name}`, content, 'text', { limits });

  await writer.text('README.md', readmeText(input, [...new Set(todos)]), 'readme');

  // Remove files an earlier run wrote that this run did not.
  const current = new Set(writer.files.map((file) => file.path));
  for (const old of previous?.files ?? []) {
    if (!current.has(old.path)) await unlink(join(dir, old.path)).catch(() => undefined);
  }
  const manifest: ReleaseManifest = {
    version: 1,
    project: slug,
    shape,
    generated_at: deps.now().toISOString(),
    files: writer.files,
    plan,
    todos: [...new Set(todos)],
  };
  await writeJsonAtomic(manifestPath, ReleaseManifestSchema.parse(manifest));
  return { dir, manifest, todos: manifest.todos, errors, warnings };
}

/**
 * The announcement images and teaser and the release-day story image: composed
 * from the announcement still or the cover's recipe, again only when the text (the release date) or the still
 * changed. The teaser is cut from the 9:16 render.
 */
async function deriveReleaseMedia(context: {
  project: LoadedProject;
  dir: string;
  writer: ReleaseWriter;
  files: ReleaseTextInput['files'];
  data?: UploadData;
  calendar: ReleaseCalendar;
  language: string;
  title: string;
  deps: ReleaseDeps;
  todos: string[];
  stills: boolean;
  /** A short episode's announcement images are vertical, its teaser is cut from its master, and it has no story (ADR 0057). */
  shortEpisode: boolean;
}): Promise<void> {
  const { project, dir, writer, files, data, calendar, deps, todos, shortEpisode } = context;
  const releaseAt = calendar.events.find((event) => event.id === 'youtube')?.at;
  const images = derivedImages({
    title: context.title,
    language: context.language,
    releaseAt,
    announcement: Boolean(data?.announcement),
    story: Boolean(data) && !shortEpisode,
    episode: project.config.kind === 'episode',
    vertical: shortEpisode,
  });
  if (images.length) {
    const recipe = data?.announcement?.image
      ? { still: data.announcement.image.still, focus: data.announcement.image.focus }
      : ((shortEpisode ? await readRecipe(join(project.paths.root, MEME_COVER_SOURCE)) : undefined) ??
        (await readRecipe(join(project.paths.root, COVER_SOURCE))) ??
        (data?.main.thumbnail ? await readRecipe(resolve(project.paths.root, data.main.thumbnail)) : undefined));
    const stillPath = recipe ? [resolve(project.paths.root, recipe.still), resolve(recipe.still)].find((path) => existsSync(path)) : undefined;
    if (!recipe || !stillPath) {
      todos.push(
        recipe
          ? `the still of the announcement images is missing: ${recipe.still}`
          : 'the announcement and story images need a still: set announcement.image in review/upload.yaml, or compose the cover again with thumbnail (it records its recipe)',
      );
    } else {
      const stillHash = await hashFileStream(stillPath);
      for (const image of images) {
        // The scrim belongs to the still and carries over; a text offset belongs to the cover's layout and does not.
        const scrim = 'scrim' in recipe && recipe.scrim !== undefined ? recipe.scrim : undefined;
        const spec = { format: image.format, text: image.text, tag: image.tag, still: recipe.still, stillSha256: stillHash, focus: recipe.focus ?? null, ...(scrim !== undefined ? { scrim } : {}) };
        const key = sha256(JSON.stringify(spec));
        const same = await writer.unchanged(image.path, (entry) => entry.spec.key === key);
        if (!same && !context.stills) {
          // An image whose date or title no longer matches is dropped, never posted: the post falls back to the cover until a full release composes it again.
          todos.push(`${image.path} is not composed for the current date and title yet: run release`);
          continue;
        }
        if (!same) {
          deps.log(`Composing ${image.path} (${image.text.replace(/\|/g, ' / ')})...`);
          await mkdir(dirname(join(dir, image.path)), { recursive: true });
          await deps.thumbnail({
            projectDir: project.paths.root,
            still: stillPath,
            text: image.text,
            tag: image.tag,
            format: image.format,
            ...(image.layout ? { layout: image.layout } : {}),
            ...(recipe.focus ? { focus: recipe.focus } : {}),
            ...('accent' in recipe && recipe.accent ? { accent: recipe.accent } : {}),
            ...('font' in recipe && recipe.font ? { font: recipe.font } : {}),
            ...(scrim !== undefined ? { scrim } : {}),
            out: join(dir, image.path),
          });
          await rm(recipePath(join(dir, image.path)), { force: true });
        }
        await writer.generated(image.path, image.kind, { ...spec, key }, recipe.still);
      }
    }
  }
  for (const image of images) {
    if (!writer.files.some((file) => file.path === image.path)) continue;
    if (image.path === DERIVED_PATHS.announceStory) files.announceStory = image.path;
    if (image.path === DERIVED_PATHS.announcePost) files.announcePost = image.path;
    if (image.path === DERIVED_PATHS.story) files.story = image.path;
  }

  // The teaser: ten seconds from the first chorus of the 9:16 render, with sound, for the announcement.
  // A short episode's teaser is cut from its master and named by its format.
  const timing = project.effectiveTiming ?? project.timing;
  const masterFormat = formatId(project.config.formats.master.aspect);
  const sourceRel = shortEpisode ? `renders/${masterFormat}.mp4` : 'renders/9x16.mp4';
  const teaserPath = shortEpisode ? teaserPathOf(masterFormat) : DERIVED_PATHS.teaser;
  const vertical = join(project.paths.root, sourceRel);
  if (data?.announcement && timing && existsSync(vertical)) {
    const window = teaserWindow(timing);
    const sourceHash = await hashFileStream(vertical);
    const spec = { start: Number(window.start.toFixed(3)), seconds: Number(window.duration.toFixed(3)), audio: true, sourceSha256: sourceHash };
    const same = await writer.unchanged(teaserPath, (entry) => entry.spec.sourceSha256 === sourceHash && entry.spec.start === spec.start && entry.spec.seconds === spec.seconds);
    if (!same) {
      deps.log(`Cutting the teaser: ${spec.seconds} s from ${spec.start.toFixed(2)} s...`);
      await mkdir(join(dir, 'announce'), { recursive: true });
      await deps.ffmpeg(shortFfmpegArgs(vertical, join(dir, teaserPath), window, project.config.formats.master.fps));
    }
    await writer.generated(teaserPath, 'announcement', spec, sourceRel);
    files.teaser = teaserPath;
  }
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

/**
 * Run `release` and print the summary; returns the result for the caller. An
 * internal project builds and plans nothing (undefined), and an earlier folder
 * or calendar is left as it is.
 */
export async function runRelease(options: ReleaseOptions): Promise<ReleaseResult | undefined> {
  const log = options.deps?.log ?? ((line: string) => console.log(line));
  const { config } = await loadProject(options.projectDir);
  if (!releasedPublicly(config)) {
    log(`${notReleasedPublicly(config.slug)}: no release folder, no release calendar.`);
    return undefined;
  }
  const result = await buildRelease(options);
  log(`Release folder: ${result.dir} (${result.manifest.files.length} files)`);
  for (const warning of result.warnings) log(`! ${warning}`);
  for (const todo of result.todos) log(`TODO ${todo}`);
  if (result.errors.length) {
    throw new ValidationError(`The release package breaks ${result.errors.length} rule(s); fix review/upload.yaml and run release again.`, result.errors);
  }
  return result;
}
