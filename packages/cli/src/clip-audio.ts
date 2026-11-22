import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ValidationError, ensureDir, loadProject, resolveAnchor, scriptLines, type Shot } from '@coreslopper/core';
import { measureLoudness } from './episode-track.js';
import { mediaInfo } from './image-ops.js';
import { importTakes, resolveBinary } from './media.js';
import { lineTakePath, requireEpisode } from './takes.js';

/** Loudness the clip sound of an sfx take is brought to; generated sfx takes sit around -16 to -25 LUFS. */
export const CLIP_AUDIO_LUFS = -20;

export interface ClipAudioOptions {
  /** The sfx line whose take is replaced. */
  line: string;
  /** Shots whose clip sound is used; default every shot with a clip that overlaps the line. */
  shots?: string[];
  /** Target loudness of the take in LUFS. */
  lufs?: number;
}

export interface ClipAudioPiece {
  shot: string;
  clip: string;
  /** Where the piece starts in the take, in seconds. */
  offset: number;
  /** Where the piece starts in the clip, in clip seconds. */
  from: number;
  /** Length of the piece in the take, in seconds. */
  length: number;
  speed: number;
}

export interface ClipAudioResult {
  line: string;
  file: string;
  duration: number;
  pieces: ClipAudioPiece[];
  skipped: string[];
}

function numberProp(shot: Shot, key: string, fallback: number): number {
  const value = (shot.motion?.props as Record<string, unknown> | undefined)?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** atempo takes 0.5..2 per stage; chain stages for speeds outside that range. */
export function atempoChain(speed: number): string[] {
  const stages: string[] = [];
  let rest = speed;
  while (rest > 2) {
    stages.push('atempo=2');
    rest /= 2;
  }
  while (rest < 0.5) {
    stages.push('atempo=0.5');
    rest /= 0.5;
  }
  if (Math.abs(rest - 1) > 1e-6) stages.push(`atempo=${rest.toFixed(6)}`);
  return stages;
}

/**
 * The pieces of clip sound that fill a line's slot: for every shot that overlaps
 * the slot, the overlapping span, read from the clip at `clipFrom` and `speed`
 * as the composition plays it.
 */
export function clipAudioPieces(
  slot: { start: number; end: number },
  shots: Array<{ id: string; clip: string; start: number; end: number; clipFrom: number; speed: number }>,
): ClipAudioPiece[] {
  const pieces: ClipAudioPiece[] = [];
  for (const shot of shots) {
    const start = Math.max(slot.start, shot.start);
    const end = Math.min(slot.end, shot.end);
    if (end - start < 0.02) continue;
    pieces.push({
      shot: shot.id,
      clip: shot.clip,
      offset: Number((start - slot.start).toFixed(3)),
      from: Number((shot.clipFrom + (start - shot.start) * shot.speed).toFixed(3)),
      length: Number((end - start).toFixed(3)),
      speed: shot.speed,
    });
  }
  return pieces;
}

/**
 * Replace the take of an sfx line with the sound of the clips that play during
 * it, so the sound comes from the same generation as the picture. The pieces are
 * cut at the shots' clip positions, placed at their offsets in the line's slot,
 * brought to a common loudness, written as `audio/lines/<line>.wav`, and
 * registered with `import-takes`. Re-run `episode-track` afterwards.
 */
export async function clipAudioTake(projectDir: string, options: ClipAudioOptions): Promise<ClipAudioResult> {
  const project = requireEpisode(await loadProject(projectDir), 'clip-audio');
  const timing = project.effectiveTiming ?? project.timing;
  if (!timing) throw new ValidationError('clip-audio needs timing.json; run episode-track first.');
  if (!project.storyboard) throw new ValidationError('clip-audio needs storyboard.yaml.');
  const entry = scriptLines(project.script).find(({ line }) => line.id === options.line);
  if (!entry) throw new ValidationError(`No script line "${options.line}".`);
  if (entry.line.kind !== 'sfx') throw new ValidationError(`Line "${options.line}" is a ${entry.line.kind} line; clip-audio replaces sfx takes only.`);

  const slot = {
    start: resolveAnchor({ type: 'line', id: options.line, edge: 'start', offset: 0 }, timing),
    end: resolveAnchor({ type: 'line', id: options.line, edge: 'end', offset: 0 }, timing),
  };
  const wanted = options.shots?.length ? new Set(options.shots) : undefined;
  const skipped: string[] = [];
  const candidates: Array<{ id: string; clip: string; start: number; end: number; clipFrom: number; speed: number; seconds: number }> = [];
  for (const shot of project.storyboard.shots) {
    if (wanted && !wanted.has(shot.id)) continue;
    const start = resolveAnchor(shot.start, timing);
    const end = resolveAnchor(shot.end, timing);
    if (!wanted && (end <= slot.start || start >= slot.end)) continue;
    const asset = shot.asset;
    if (!asset || !/\.(mp4|mov|webm|mkv)$/i.test(asset)) {
      skipped.push(`${shot.id}: no clip`);
      continue;
    }
    const clip = join(project.paths.root, asset);
    if (!existsSync(clip)) {
      skipped.push(`${shot.id}: missing ${asset}`);
      continue;
    }
    const info = mediaInfo(clip);
    if (!info.audioCodec) {
      skipped.push(`${shot.id}: the clip has no sound`);
      continue;
    }
    candidates.push({
      id: shot.id,
      clip,
      start,
      end,
      clipFrom: numberProp(shot, 'clipFrom', 0),
      speed: numberProp(shot, 'speed', 1),
      seconds: info.seconds ?? Number.POSITIVE_INFINITY,
    });
  }
  if (wanted) for (const id of wanted) if (!project.storyboard.shots.some((shot) => shot.id === id)) throw new ValidationError(`No shot "${id}".`);

  // A shot can outlast its clip (the picture holds the last frame); its sound ends with the clip.
  const pieces = clipAudioPieces(slot, candidates).flatMap((piece) => {
    const seconds = candidates.find((shot) => shot.id === piece.shot)?.seconds ?? Number.POSITIVE_INFINITY;
    const available = (seconds - piece.from) / piece.speed;
    if (available < 0.05) {
      skipped.push(`${piece.shot}: the line plays after the end of its clip`);
      return [];
    }
    return [available < piece.length ? { ...piece, length: Number(available.toFixed(3)) } : piece];
  });
  if (pieces.length === 0) {
    throw new ValidationError(
      `No clip sound overlaps line "${options.line}" (${slot.start.toFixed(2)}-${slot.end.toFixed(2)} s)${skipped.length ? `: ${skipped.join('; ')}` : ''}.`,
    );
  }

  const duration = Number((slot.end - slot.start).toFixed(3));
  const output = lineTakePath(project, options.line);
  await ensureDir(join(project.paths.root, 'audio', 'lines'));
  const raw = join(project.paths.root, '.cache', 'clip-audio', `${options.line}.wav`);
  await ensureDir(join(project.paths.root, '.cache', 'clip-audio'));

  const inputs: string[] = [];
  const filters: string[] = [];
  pieces.forEach((piece, index) => {
    inputs.push('-ss', piece.from.toFixed(3), '-t', (piece.length * piece.speed).toFixed(3), '-i', piece.clip);
    const chain = [`[${index}:a]aresample=48000`, 'aformat=channel_layouts=mono', ...atempoChain(piece.speed), `adelay=${Math.round(piece.offset * 1000)}:all=1`];
    filters.push(`${chain.join(',')}[p${index}]`);
  });
  const labels = pieces.map((_, index) => `[p${index}]`).join('');
  filters.push(
    `${labels}amix=inputs=${pieces.length}:normalize=0:dropout_transition=0,apad,atrim=0:${duration.toFixed(3)},` +
      `afade=t=in:d=0.02,afade=t=out:st=${Math.max(0, duration - 0.05).toFixed(3)}:d=0.05[out]`,
  );
  const ffmpeg = resolveBinary('ffmpeg');
  execFileSync(ffmpeg, ['-y', '-v', 'error', '-threads', '6', ...inputs, '-filter_complex', filters.join(';'), '-map', '[out]', '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', raw], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });

  const measured = measureLoudness(raw).lufs;
  const target = options.lufs ?? CLIP_AUDIO_LUFS;
  const gain = Number.isFinite(measured) && measured > -70 ? target - measured : 0;
  execFileSync(
    ffmpeg,
    ['-y', '-v', 'error', '-threads', '6', '-i', raw, '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=0.89:level=false`, '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', output],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );

  await importTakes(projectDir, { lines: [options.line] });
  return { line: options.line, file: relative(project.paths.root, output), duration, pieces, skipped };
}
