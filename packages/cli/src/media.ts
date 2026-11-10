import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import {
  ensureDir,
  hashFile,
  isAudibleLine,
  loadProject,
  repoRoot,
  scriptLines,
  takeSource,
  ValidationError,
  writeJsonAtomic,
} from '@coreslopper/core';
import { lineTakePath, loadTakes, requireEpisode, saveTakes, textHash } from './takes.js';

export function resolveBinary(name: 'ffmpeg' | 'ffprobe'): string {
  const local = join(repoRoot(), '.tools', 'ffmpeg', name);
  if (existsSync(local)) return local;
  try {
    execFileSync('which', [name], { stdio: 'ignore' });
    return name;
  } catch {
    throw new ValidationError(
      `${name} is not on PATH and ${local} is missing. Run ./scripts/install-ffmpeg.sh on Linux x64, or install ffmpeg with your package manager.`,
    );
  }
}

export function probeDuration(path: string): number {
  const ffprobe = resolveBinary('ffprobe');
  const duration = Number(
    execFileSync(
      ffprobe,
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path],
      { encoding: 'utf8' },
    ).trim(),
  );
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new ValidationError(`Could not read the duration of ${path}.`);
  }
  return duration;
}

/**
 * The audio a lip-sync segment is cut from: an explicit source, else the
 * speaker stem of an episode character, else the vocal stem of a music video.
 */
export function segmentSource(
  kind: 'music-video' | 'episode',
  options: { source?: string; character?: string },
): string {
  if (options.source) return options.source;
  if (kind === 'episode') {
    if (!options.character) {
      throw new ValidationError('An episode cuts lip-sync audio from a speaker stem. Pass --character <id> or --source <path>.');
    }
    return `audio/stems/${options.character}.wav`;
  }
  return 'audio/stems/vocals.wav';
}

/**
 * Cut a time range from the vocal stem (or the mix) for a lip-sync shot.
 * Output is a small mono MP3 under assets/audio-segments/<name>.mp3, so the
 * generated clip lines up exactly with the song at the shot's start time.
 */
export async function extractAudioSegment(
  projectDir: string,
  start: number,
  end: number,
  name: string,
  options: { source?: string; character?: string } = {},
): Promise<string> {
  const ffmpeg = resolveBinary('ffmpeg');
  const project = await loadProject(projectDir);
  const source = segmentSource(project.config.kind, options);
  if (!(Number.isFinite(start) && Number.isFinite(end)) || start < 0 || end <= start) {
    throw new ValidationError(`Invalid segment ${start}s–${end}s.`);
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    throw new ValidationError('Segment name must be lowercase letters, digits, and dashes.');
  }
  const input = resolve(project.paths.root, source);
  if (!existsSync(input)) throw new ValidationError(`Missing audio source: ${input}`);
  const destination = resolve(project.paths.assets, 'audio-segments', `${name}.mp3`);
  await ensureDir(dirname(destination));
  execFileSync(
    ffmpeg,
    [
      '-y',
      '-loglevel',
      'error',
      '-ss',
      start.toFixed(3),
      '-t',
      (end - start).toFixed(3),
      '-i',
      input,
      '-ac',
      '1',
      '-ar',
      '44100',
      '-b:a',
      '128k',
      destination,
    ],
    { stdio: 'inherit' },
  );
  console.log(`Audio segment ${start.toFixed(3)}s–${end.toFixed(3)}s written to ${destination}`);
  return destination;
}

export async function normalizeAudio(projectDir: string, input: string, output?: string): Promise<string> {
  const ffmpeg = resolveBinary('ffmpeg');
  const project = await loadProject(projectDir);
  const source = resolve(input);
  if (!existsSync(source)) throw new ValidationError(`Missing audio input: ${source}`);
  const destination = output ? resolve(output) : resolve(project.paths.root, 'audio', 'song.wav');
  await ensureDir(dirname(destination));
  execFileSync(
    ffmpeg,
    [
      '-y',
      '-i',
      source,
      '-af',
      'loudnorm=I=-14:TP=-1:LRA=11',
      '-ar',
      '48000',
      '-ac',
      '2',
      destination,
    ],
    { stdio: 'inherit' },
  );
  console.log(`Normalized audio written to ${destination}`);
  return destination;
}

const AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.flac', '.aif', '.aiff', '.m4a', '.ogg', '.opus']);

/**
 * Find `<dir>/<stem>.<ext>`. A `<stem>.wav` always wins; otherwise exactly one
 * file in another audio format may exist, and it will be converted to WAV.
 */
export function findSourceAudio(dir: string, stem: 'song' | 'vocals'): string | undefined {
  if (!existsSync(dir)) return undefined;
  const matches = readdirSync(dir).filter((file) => {
    const extension = extname(file).toLowerCase();
    return AUDIO_EXTENSIONS.has(extension) && basename(file, extname(file)).toLowerCase() === stem;
  });
  const wav = matches.find((file) => file === `${stem}.wav`);
  if (wav) return join(dir, wav);
  if (matches.length > 1) {
    throw new ValidationError(`More than one ${stem} file in ${dir}: ${matches.join(', ')}. Keep exactly one.`);
  }
  return matches[0] ? join(dir, matches[0]) : undefined;
}

export interface ImportSongOptions {
  song?: string;
  vocals?: string;
}

/** Convert an audio file to a 48 kHz WAV with the given channel count. */
export function convertAudio(source: string, destination: string, channels: 1 | 2): void {
  if (resolve(source) === resolve(destination)) {
    throw new ValidationError(`Cannot convert ${source} onto itself.`);
  }
  const ffmpeg = resolveBinary('ffmpeg');
  execFileSync(
    ffmpeg,
    ['-y', '-loglevel', 'error', '-i', source, '-ar', '48000', '-ac', String(channels), '-c:a', 'pcm_s16le', '-bitexact', destination],
    { stdio: 'inherit' },
  );
}

/** Bring an audio file to `destination` as 48 kHz stereo WAV; a file already there is left untouched. */
function toWav(ffmpeg: string, source: string, destination: string): void {
  if (resolve(source) === resolve(destination)) return;
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', source, '-ar', '48000', '-ac', '2', destination], {
    stdio: 'inherit',
  });
  console.log(`Converted ${basename(source)} to ${destination}`);
}

/**
 * Register the finished song. The user puts the mix at audio/song.wav and the
 * vocal stem at audio/stems/vocals.wav; another audio format (song.mp3,
 * stems/vocals.flac, ...) is converted to those paths. A WAV is used as is,
 * without loudness changes. The result is merged into song.json, keeping the
 * metadata the setup skill wrote.
 */
export async function importSong(projectDir: string, options: ImportSongOptions = {}): Promise<void> {
  const ffmpeg = resolveBinary('ffmpeg');
  const project = await loadProject(projectDir);
  const audioDir = join(project.paths.root, 'audio');
  const stemsDir = join(audioDir, 'stems');
  const songWav = join(audioDir, 'song.wav');
  const vocalsWav = join(stemsDir, 'vocals.wav');

  const song = options.song ? resolve(options.song) : findSourceAudio(audioDir, 'song');
  if (!song || !existsSync(song)) {
    throw new ValidationError(
      `No song found. Put the finished mix at ${songWav} (or song.mp3/.flac/.aiff/.m4a/.ogg next to it) or pass --song <file>.`,
    );
  }
  const vocals = options.vocals ? resolve(options.vocals) : findSourceAudio(stemsDir, 'vocals');
  if (vocals && !existsSync(vocals)) throw new ValidationError(`Missing vocal stem: ${vocals}`);

  await ensureDir(audioDir);
  toWav(ffmpeg, song, songWav);
  const duration = probeDuration(songWav);

  if (vocals) {
    await ensureDir(stemsDir);
    toWav(ffmpeg, vocals, vocalsWav);
    const vocalsDuration = probeDuration(vocalsWav);
    if (Math.abs(vocalsDuration - duration) > 0.5) {
      console.warn(
        `Warning: the vocal stem is ${vocalsDuration.toFixed(2)} s, the song ${duration.toFixed(2)} s. Export both from the same session so they line up.`,
      );
    }
  } else {
    console.warn(`No vocal stem at ${vocalsWav}; audio analysis will separate vocals with Demucs.`);
  }

  let existing: Record<string, unknown> = {};
  if (existsSync(project.paths.song)) {
    try {
      existing = JSON.parse(await readFile(project.paths.song, 'utf8')) as Record<string, unknown>;
    } catch {
      throw new ValidationError(`song.json is not valid JSON: ${project.paths.song}`);
    }
  }
  await writeJsonAtomic(project.paths.song, {
    ...existing,
    source: 'import',
    path: 'audio/song.wav',
    duration: Number(duration.toFixed(3)),
    stems: Boolean(vocals),
    ...(vocals ? { vocals: 'audio/stems/vocals.wav' } : {}),
    sourceFiles: {
      song: basename(song),
      ...(vocals ? { vocals: basename(vocals) } : {}),
    },
  });
  console.log(`Song registered: ${duration.toFixed(2)} s${vocals ? ' with vocal stem' : ''}. song.json updated.`);
}

export async function importFootage(
  projectDir: string,
  input: string,
  name: string,
  width = 1920,
  height = 1080,
  fps = 30,
): Promise<string> {
  const ffmpeg = resolveBinary('ffmpeg');
  const project = await loadProject(projectDir);
  const source = resolve(input);
  if (!existsSync(source)) throw new ValidationError(`Missing footage input: ${source}`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    throw new ValidationError('Footage name must be lowercase letters, digits, and dashes.');
  }
  const destination = resolve(project.paths.assets, 'footage', `${name}.mp4`);
  await ensureDir(dirname(destination));
  execFileSync(
    ffmpeg,
    [
      '-y',
      '-i',
      source,
      '-vf',
      `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=${fps}`,
      '-an',
      '-c:v',
      'libx264',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
      destination,
    ],
    { stdio: 'inherit' },
  );
  console.log(`Footage proxy written to ${destination}`);
  return destination;
}

export async function extractFrame(
  projectDir: string,
  input: string,
  position: 'first' | 'middle' | 'last',
  output?: string,
): Promise<string> {
  const ffmpeg = resolveBinary('ffmpeg');
  const ffprobe = resolveBinary('ffprobe');
  const project = await loadProject(projectDir);
  const source = resolve(input);
  if (!existsSync(source)) throw new ValidationError(`Missing clip: ${source}`);
  const duration = Number(
    execFileSync(
      ffprobe,
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', source],
      { encoding: 'utf8' },
    ).trim(),
  );
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new ValidationError(`Could not read the duration of ${source}.`);
  }
  const timestamp = position === 'first' ? 0.05 : position === 'middle' ? duration / 2 : Math.max(0, duration - 0.05);
  const destination = output
    ? resolve(output)
    : resolve(project.paths.assets, 'frames', `${basename(source, extname(source))}-${position}.png`);
  await ensureDir(dirname(destination));
  execFileSync(
    ffmpeg,
    ['-y', '-ss', timestamp.toFixed(3), '-i', source, '-frames:v', '1', destination],
    { stdio: 'inherit' },
  );
  console.log(`Frame written to ${destination}`);
  return destination;
}

export interface ImportTakesOptions {
  /** Only these line IDs; default: every take file in audio/lines/. */
  lines?: string[];
}

/**
 * Register the user's recordings as takes. A recording goes to
 * audio/lines/<line-id>.wav (or <line-id>.mp3/.flac/..., converted to a 48 kHz
 * mono WAV next to it); a WAV is used as is. Files already registered with the
 * same content are skipped. takes.json records each as `imported`, with the
 * duration and the hash of the line's current text.
 */
export async function importTakes(projectDir: string, options: ImportTakesOptions = {}): Promise<void> {
  const project = requireEpisode(await loadProject(projectDir), 'import-takes');
  const linesDir = join(project.paths.root, 'audio', 'lines');
  const lines = new Map(scriptLines(project.script).map(({ line }) => [line.id, line]));
  const takes = loadTakes(project);

  const stems = new Map<string, string[]>();
  if (existsSync(linesDir)) {
    for (const file of readdirSync(linesDir)) {
      const extension = extname(file).toLowerCase();
      if (!AUDIO_EXTENSIONS.has(extension)) continue;
      const stem = basename(file, extname(file));
      stems.set(stem, [...(stems.get(stem) ?? []), file]);
    }
  }

  const wanted = options.lines?.length ? options.lines : [...stems.keys()].sort();
  const issues: string[] = [];
  let imported = 0;
  let unchanged = 0;
  for (const id of wanted) {
    const line = lines.get(id);
    const files = stems.get(id) ?? [];
    if (!line) {
      issues.push(`${id}: no script line with this id`);
      continue;
    }
    if (!isAudibleLine(line)) {
      issues.push(`${id}: a ${line.kind} line has no take`);
      continue;
    }
    if (files.length === 0) {
      issues.push(`${id}: no recording in ${linesDir}`);
      continue;
    }
    const destination = lineTakePath(project, id);
    const others = files.filter((file) => file !== `${id}.wav`);
    if (others.length > 1) {
      issues.push(`${id}: more than one recording (${others.join(', ')}); keep exactly one`);
      continue;
    }
    // A recording in another format is new; it replaces the WAV.
    if (others[0]) {
      convertAudio(join(linesDir, others[0]), destination, 1);
      console.log(`Converted ${others[0]} to ${basename(destination)}`);
    }
    const fileHash = await hashFile(destination);
    const existing = takes.takes[id];
    if (!others[0] && existing?.file_hash === fileHash) {
      unchanged += 1;
      continue;
    }
    takes.takes[id] = {
      source: 'imported',
      duration: Number(probeDuration(destination).toFixed(3)),
      text_hash: textHash(takeSource(line)),
      file_hash: fileHash,
    };
    imported += 1;
  }
  if (issues.length > 0) throw new ValidationError('import-takes cannot register every take', issues);
  await saveTakes(project, takes);
  console.log(`✔ Imported ${imported} take(s); ${unchanged} already registered. takes.json updated.`);
}
