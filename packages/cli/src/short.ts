import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  ValidationError,
  ensureDir,
  loadProject,
  resolveAnchor,
  type Anchor,
  type Timing,
} from '@coreslopper/core';
import { resolveBinary } from './media.js';
import {
  SHORT_MAX_SECONDS,
  SHORT_TARGET_SECONDS,
  shortPaths,
  shortProblems,
  shortsDir,
  type ShortProbe,
} from './release-files.js';

/** Audio fades of a Short, in seconds: a soft start and a longer tail so the cut never clicks. */
export const SHORT_FADE_IN = 0.15;
export const SHORT_FADE_OUT = 0.4;

const EDGE_OFFSET = /^(start|end|\d+)([+-]\d+(?:\.\d+)?)?$/;

/**
 * Parse a Short boundary: seconds (`42.5`) or a symbolic anchor of the timing,
 * the same kinds the storyboard uses:
 *
 * - `section:<id>[:start|end]`, `line:<id>[:start|end]`
 * - `word:<line>:<index>[:start|end]`
 * - `beat:<n>`, `downbeat:<n>`
 *
 * An offset in seconds may follow the last part: `section:chorus_1:end-0.5`,
 * `beat:64+0.1`. The edge defaults to `start`.
 */
export function parseTimePoint(value: string): Anchor {
  const text = value.trim();
  if (/^\d+(\.\d+)?$/.test(text)) return { type: 'time', seconds: Number(text) };
  const parts = text.split(':');
  const type = parts[0];
  const usage = `Invalid time "${value}". Use seconds or section:<id>[:start|end], line:<id>[:start|end], word:<line>:<n>[:start|end], beat:<n>, downbeat:<n>, with an optional offset such as :end-0.5.`;
  // Split an offset off the last part, but only after an edge or an index, so ids with dashes stay whole.
  let offset = 0;
  const last = parts[parts.length - 1] ?? '';
  const match = EDGE_OFFSET.exec(last);
  if (parts.length > 1 && match) {
    parts[parts.length - 1] = match[1]!;
    offset = match[2] ? Number(match[2]) : 0;
  }
  const edge = (part: string | undefined): 'start' | 'end' => {
    if (part === undefined || part === 'start') return 'start';
    if (part === 'end') return 'end';
    throw new ValidationError(usage);
  };
  const index = (part: string | undefined): number => {
    if (part === undefined || !/^\d+$/.test(part)) throw new ValidationError(usage);
    return Number(part);
  };
  switch (type) {
    case 'section':
    case 'line': {
      if (parts.length < 2 || parts.length > 3 || !parts[1]) throw new ValidationError(usage);
      return { type, id: parts[1], edge: edge(parts[2]), offset };
    }
    case 'word': {
      if (parts.length < 3 || parts.length > 4 || !parts[1]) throw new ValidationError(usage);
      return { type, line: parts[1], index: index(parts[2]), edge: edge(parts[3]), offset };
    }
    case 'beat':
    case 'downbeat': {
      if (parts.length !== 2) throw new ValidationError(usage);
      return { type, index: index(parts[1]), offset };
    }
    default:
      throw new ValidationError(usage);
  }
}

export interface ShortWindow {
  start: number;
  end: number;
  duration: number;
  warnings: string[];
}

/**
 * Resolve `--from` and `--to` against the timing and snap both to whole video
 * frames. Fails when the window is empty or longer than 60 s; warns outside the
 * 30–50 s target.
 */
export function shortWindow(from: string, to: string, timing: Timing | undefined, fps: number): ShortWindow {
  const resolvePoint = (value: string) => {
    const anchor = parseTimePoint(value);
    if (anchor.type === 'time') return anchor.seconds;
    if (!timing) throw new ValidationError(`"${value}" is an anchor, but the project has no timing.json; use seconds.`);
    return resolveAnchor(anchor, timing);
  };
  const snap = (seconds: number) => Math.round(seconds * fps) / fps;
  const start = snap(resolvePoint(from));
  const end = snap(resolvePoint(to));
  const duration = Number((end - start).toFixed(6));
  if (duration <= 0) {
    throw new ValidationError(`The Short ends before it starts: ${start.toFixed(3)} s to ${end.toFixed(3)} s.`);
  }
  if (duration > SHORT_MAX_SECONDS) {
    throw new ValidationError(`The Short is ${duration.toFixed(2)} s long; the limit is ${SHORT_MAX_SECONDS} s. Pick a later --from or an earlier --to.`);
  }
  const warnings =
    duration < SHORT_TARGET_SECONDS.min || duration > SHORT_TARGET_SECONDS.max
      ? [`${duration.toFixed(1)} s is outside the ${SHORT_TARGET_SECONDS.min}–${SHORT_TARGET_SECONDS.max} s target.`]
      : [];
  return { start, end, duration, warnings };
}

/**
 * The audio fade as a frame-evaluated `volume` expression. The `afade` filter
 * is missing from some bundled ffmpeg builds; `volume` is in all of them.
 */
export function shortFadeFilter(duration: number, fadeIn = SHORT_FADE_IN, fadeOut = SHORT_FADE_OUT): string {
  const d = duration.toFixed(3);
  return `asetpts=PTS-STARTPTS,volume=volume='min(1,t/${fadeIn})*min(1,max(0,(${d}-t)/${fadeOut}))':eval=frame`;
}

/**
 * ffmpeg arguments for a frame-accurate re-encode of one Short: input seek,
 * the render's frame rate and an exact frame count, H.264 crf 18, AAC 192k,
 * 6 threads.
 */
export function shortFfmpegArgs(
  input: string,
  output: string,
  window: Pick<ShortWindow, 'start' | 'duration'>,
  fps: number,
): string[] {
  return [
    '-y',
    '-loglevel',
    'error',
    '-ss',
    window.start.toFixed(3),
    '-i',
    input,
    '-t',
    window.duration.toFixed(3),
    '-vf',
    'setpts=PTS-STARTPTS',
    '-r',
    String(fps),
    '-frames:v',
    String(Math.round(window.duration * fps)),
    '-af',
    shortFadeFilter(window.duration),
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-threads',
    '6',
    '-movflags',
    '+faststart',
    output,
  ];
}

/** Width, height, and duration of a video file through ffprobe. */
export function probeVideo(path: string): Omit<ShortProbe, 'name'> {
  const ffprobe = resolveBinary('ffprobe');
  const raw = execFileSync(
    ffprobe,
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', path],
    { encoding: 'utf8' },
  );
  const data = JSON.parse(raw) as { streams?: { width?: number; height?: number }[]; format?: { duration?: string } };
  return {
    width: data.streams?.[0]?.width ?? 0,
    height: data.streams?.[0]?.height ?? 0,
    duration: Number(data.format?.duration ?? 0),
  };
}

export interface ShortOptions {
  projectDir: string;
  from: string;
  to: string;
  name: string;
}

/** Cut one Short from `renders/9x16.mp4` into `renders/shorts/<name>-9x16.mp4`. */
export async function cutShort(options: ShortOptions): Promise<string> {
  const project = await loadProject(options.projectDir);
  const name = options.name.replace(/-9x16(\.mp4)?$/, '');
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(name)) {
    throw new ValidationError('A Short name is letters, digits, and dashes, e.g. Z1-intro.');
  }
  const source = join(project.paths.renders, '9x16.mp4');
  if (!existsSync(source)) {
    throw new ValidationError(
      `${relative(project.paths.root, source)} is missing. Shorts are cut from the 9:16 render: add 9:16 to formats in project.yaml and run render --format 9x16 first.`,
    );
  }
  const vertical = [project.config.formats.master, ...project.config.formats.derivatives].find((format) => format.aspect === '9:16');
  const fps = vertical?.fps ?? project.config.formats.master.fps;
  const window = shortWindow(options.from, options.to, project.effectiveTiming, fps);
  const probe = probeVideo(source);
  const sourceProblems = shortProblems({ name: '9x16', ...probe, duration: 0 });
  if (sourceProblems.length) throw new ValidationError(`${relative(project.paths.root, source)} is not a 9:16 render`, sourceProblems);
  if (window.end > probe.duration + 1 / fps) {
    throw new ValidationError(`The Short ends at ${window.end.toFixed(2)} s; the render is ${probe.duration.toFixed(2)} s long.`);
  }

  const output = shortPaths(project.paths.renders, name).video;
  await ensureDir(shortsDir(project.paths.renders));
  execFileSync(resolveBinary('ffmpeg'), shortFfmpegArgs(source, output, window, fps), { stdio: 'inherit' });
  const result = probeVideo(output);
  const problems = shortProblems({ name, ...result });
  if (problems.length) throw new ValidationError(`Short ${output} failed its checks`, problems);
  for (const warning of window.warnings) console.warn(`Warning: ${warning}`);
  console.log(
    `Short ${window.start.toFixed(2)}–${window.end.toFixed(2)} s (${result.duration.toFixed(1)} s) written to ${relative(process.cwd(), output) || output}`,
  );
  return output;
}
