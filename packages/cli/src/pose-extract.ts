import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { ValidationError, loadProject, parsePoseTrack, repoRoot, type PoseTrack } from '@coreslopper/core';
import { resolveBinary } from './media.js';

export const POSE_MODES = ['lightweight', 'balanced', 'performance'] as const;
export type PoseMode = (typeof POSE_MODES)[number];

export interface PoseExtractOptions {
  input: string;
  /** Track id: the file is assets/poses/<name>.json. */
  name: string;
  /** Window start and end in clip seconds or m:ss. */
  from?: string;
  to?: string;
  /** largest | center | n (1-based, from the left). */
  person?: string;
  preview?: boolean;
  /** Write the track here instead of assets/poses/<name>.json (the preview goes beside it). */
  out?: string;
  mode?: PoseMode;
  /** onnxruntime device: cpu (default) or cuda with onnxruntime-gpu installed. */
  device?: string;
}

export interface PoseExtractorCall {
  command: string;
  args: string[];
  cwd: string;
}

export interface PoseExtractDeps {
  /** Run the Python extractor; resolves once it exited, rejects on failure. */
  runExtractor?: (call: PoseExtractorCall) => Promise<void>;
  ffmpeg?: () => string;
  root?: string;
  log?: (line: string) => void;
}

export interface PoseExtractResult {
  track: PoseTrack;
  output: string;
  preview?: string;
}

/** Seconds from `12.5`, `1:05`, `1:05.5`, or `0:01:05`. */
export function parseClock(value: string, flag: string): number {
  const text = value.trim();
  if (!/^\d+(\.\d+)?(:\d+(\.\d+)?){0,2}$/.test(text)) {
    throw new ValidationError(`${flag} takes seconds or m:ss, e.g. 12.5 or 1:05.5, not "${value}".`);
  }
  const parts = text.split(':').map(Number);
  if (parts.slice(1).some((part) => part >= 60)) {
    throw new ValidationError(`${flag} "${value}": minutes and seconds go up to 59.`);
  }
  return parts.reduce((total, part) => total * 60 + part, 0);
}

export function parsePersonRule(value: string | undefined): string {
  const text = (value ?? 'largest').trim().toLowerCase();
  if (text === 'largest' || text === 'center') return text;
  if (/^[1-9]\d*$/.test(text)) return text;
  throw new ValidationError(`--person takes largest, center, or a number from 1 (counted from the left), not "${value}".`);
}

const NAME = /^[a-z0-9][a-z0-9-]*$/;

/** Build the extractor call: `uv run` in scripts/pose with the engine extra. */
export function extractorCall(
  root: string,
  input: { clip: string; output: string; from?: number; to?: number; person: string; preview?: string; ffmpeg?: string; mode: PoseMode; device: string },
): PoseExtractorCall {
  const project = join(root, 'scripts', 'pose');
  const args = [
    'run', '--project', project, '--extra', 'engine', 'python', join(project, 'extract.py'),
    '--input', input.clip,
    '--output', input.output,
    '--person', input.person,
    '--mode', input.mode,
    '--device', input.device,
    '--model-dir', join(root, '.cache', 'pose', 'models'),
  ];
  if (input.from !== undefined) args.push('--from', String(input.from));
  if (input.to !== undefined) args.push('--to', String(input.to));
  if (input.preview) args.push('--preview', input.preview, '--ffmpeg', input.ffmpeg ?? 'ffmpeg');
  return { command: 'uv', args, cwd: project };
}

async function spawnExtractor(call: PoseExtractorCall): Promise<void> {
  const result = spawnSync(call.command, call.args, { cwd: call.cwd, stdio: ['ignore', 'inherit', 'inherit'] });
  if (result.error) {
    const missing = (result.error as NodeJS.ErrnoException).code === 'ENOENT';
    throw new ValidationError(
      missing ? 'uv is not installed; pose-extract runs the Python extractor with uv (see docs/onboarding.md).' : result.error.message,
    );
  }
  if (result.status !== 0) throw new ValidationError(`The pose extractor failed (exit ${result.status}); see the output above.`);
}

/**
 * Extract a pose track of one person from a reference clip into `assets/poses/<name>.json`
 * (and `<name>.preview.mp4` with `preview`). The clip is a motion source only.
 */
export async function poseExtract(projectDir: string, options: PoseExtractOptions, deps: PoseExtractDeps = {}): Promise<PoseExtractResult> {
  if (!NAME.test(options.name)) throw new ValidationError('--name must be lowercase letters, digits, and dashes, e.g. ballmer-monkey-dance.');
  const clip = resolve(options.input);
  if (!existsSync(clip)) throw new ValidationError(`Missing clip: ${clip}`);
  const from = options.from === undefined ? undefined : parseClock(options.from, '--from');
  const to = options.to === undefined ? undefined : parseClock(options.to, '--to');
  if (from !== undefined && to !== undefined && to <= from) {
    throw new ValidationError(`--to (${to} s) must be after --from (${from} s).`);
  }
  const person = parsePersonRule(options.person);
  const mode = options.mode ?? 'balanced';
  if (!POSE_MODES.includes(mode)) throw new ValidationError(`--mode takes ${POSE_MODES.join(', ')}.`);

  const output = options.out
    ? resolve(options.out)
    : join((await loadProject(projectDir)).paths.assets, 'poses', `${options.name}.json`);
  const preview = options.preview ? join(dirname(output), `${options.name}.preview.mp4`) : undefined;
  await mkdir(dirname(output), { recursive: true });
  const root = deps.root ?? repoRoot();
  const call = extractorCall(root, {
    clip,
    output,
    from,
    to,
    person,
    preview,
    ffmpeg: preview ? (deps.ffmpeg ?? (() => resolveBinary('ffmpeg')))() : undefined,
    mode,
    device: options.device ?? 'cpu',
  });
  await (deps.runExtractor ?? spawnExtractor)(call);
  if (!existsSync(output)) throw new ValidationError(`The pose extractor wrote no track at ${output}.`);
  const track = parsePoseTrack(JSON.parse(await readFile(output, 'utf8')), relative(process.cwd(), output));
  const log = deps.log ?? ((line: string) => console.log(line));
  log(formatPoseReport(track, { output, preview }));
  return { track, output, ...(preview ? { preview } : {}) };
}

/** The compact quality report `pose-extract` prints. */
function shown(path: string): string {
  const rel = relative(process.cwd(), path);
  return rel.startsWith('..') ? path : rel;
}

export function formatPoseReport(track: PoseTrack, files: { output?: string; preview?: string } = {}): string {
  const q = track.quality;
  const s = track.source;
  const pct = (value: number) => `${Math.round(value * 100)}%`;
  const limbs = Object.entries(q.limbs)
    .map(([name, value]) => `${name} ${value.toFixed(2)}`)
    .join(', ');
  const lines = [
    `Pose track ${files.output ? shown(files.output) : ''}`.trimEnd(),
    `  source   ${s.file} ${s.width}x${s.height} @ ${s.fps} fps, window ${s.from.toFixed(2)}-${s.to.toFixed(2)} s` +
      (track.engine.upscale && track.engine.upscale > 1 ? `, upscaled x${track.engine.upscale}` : ''),
    `  frames   ${q.frames}: detected ${q.detected} (${pct(q.detectionRate)}), interpolated ${q.interpolated}, missing ${q.missing}`,
    `  conf     mean ${q.meanConfidence.toFixed(2)}; ${limbs}`,
    `  jitter   ${q.jitterRaw.toFixed(2)} raw -> ${q.jitter.toFixed(2)} smoothed (% of frame height per frame²)`,
    `  people   up to ${q.peopleMax}, several in ${pct(q.severalPeople)} of frames; rule ${track.person}`,
  ];
  if (files.preview) lines.push(`  preview  ${shown(files.preview)} (review only, never in a render)`);
  if (q.warnings.length === 0) lines.push('  ✔ no warnings');
  for (const warning of q.warnings) lines.push(`  ⚠ ${warning}`);
  return lines.join('\n');
}
