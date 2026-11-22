import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  MEME_MAX_SECONDS,
  ValidationError,
  ambienceSource,
  ensureDir,
  isAudibleLine,
  isSpokenLine,
  loadDefaults,
  loadProject,
  mergeTiming,
  placeLines,
  rmsEnvelope,
  scriptLines,
  takeSource,
  validateScript,
  writeJsonAtomic,
  type Timing,
} from '@coreslopper/core';
import { probeDuration, resolveBinary } from './media.js';
import {
  ambiencePath,
  blockingReason,
  lineTakePath,
  loadTakes,
  requireEpisode,
  takeStatus,
  textHash,
  type EpisodeProject,
} from './takes.js';
import { scriptCanon } from './script-canon.js';

const SAMPLE_RATE = 48_000;
/** Energy frames like the music-video analysis: 512-sample hop, 2048-sample window. */
const ENERGY_HOP = 512;
/** Mix levels of the beds under the takes. */
const AMBIENCE_GAIN = 0.3;
const MUSIC_GAIN = 0.25;
/** The form every input enters the mix in: a mono take plays as dual mono, about 3 LU louder than the file reads. */
const MIX_FORMAT = `aformat=sample_rates=${SAMPLE_RATE}:channel_layouts=stereo`;
/** Integrated loudness needs 400 ms blocks; a shorter take is measured as played back to back for at least this long. */
const MIN_MEASURE_SECONDS = 3;

interface MixInput {
  file: string;
  start: number;
  /** Seconds of the input that play; longer inputs are trimmed. */
  length: number;
  gain?: number;
  /** Repeat a short input until it fills its length (ambience). */
  loop?: boolean;
}

/**
 * Mix inputs into one 48 kHz stereo WAV of exactly `duration` seconds. A silent
 * base input sets the length, so a mix without takes is valid silence. With a
 * loudness target the raw mix is brought to it by `levelToTarget`.
 */
function mix(inputs: MixInput[], duration: number, destination: string, loudness?: { lufs: number; peak: number }): void {
  const ffmpeg = resolveBinary('ffmpeg');
  const raw = loudness ? `${destination}.raw.wav` : destination;
  const args = ['-y', '-loglevel', 'error', '-f', 'lavfi', '-t', duration.toFixed(3), '-i', `anullsrc=r=${SAMPLE_RATE}:cl=stereo`];
  const filters: string[] = [];
  const labels = ['[0:a]'];
  for (const [index, input] of inputs.entries()) {
    if (input.loop) args.push('-stream_loop', '-1');
    args.push('-i', input.file);
    const label = `[a${index + 1}]`;
    filters.push(
      `[${index + 1}:a]${MIX_FORMAT},` +
        `atrim=0:${input.length.toFixed(3)},asetpts=PTS-STARTPTS,volume=${input.gain ?? 1},` +
        `adelay=${Math.round(input.start * 1000)}:all=1${label}`,
    );
    labels.push(label);
  }
  filters.push(`${labels.join('')}amix=inputs=${labels.length}:duration=first:normalize=0:dropout_transition=0[mix]`);
  filters.push(`[mix]${exactLength(duration)}[out]`);
  // The raw mix stays float: boosted takes may sum above full scale until levelToTarget limits them.
  const codec = loudness ? 'pcm_f32le' : 'pcm_s16le';
  args.push('-filter_complex', filters.join(';'), '-map', '[out]', '-ar', String(SAMPLE_RATE), '-ac', '2', '-c:a', codec, '-bitexact', raw);
  execFileSync(ffmpeg, args, { stdio: 'inherit' });
  if (loudness) {
    levelToTarget(raw, duration, destination, loudness);
    rmSync(raw, { force: true });
  }
}

/** Pad or trim to an exact sample count, so the length never drifts by a few milliseconds. */
function exactLength(duration: number): string {
  const samples = Math.round(duration * SAMPLE_RATE);
  return `aresample=${SAMPLE_RATE},asetpts=N/SR/TB,apad=whole_len=${samples},atrim=end_sample=${samples}`;
}

/**
 * Integrated loudness of a file in LUFS, from ffmpeg's loudnorm analysis.
 * `loops` plays the file that many extra times first: integrated loudness
 * needs 400 ms, so a short sound is measured as played back to back.
 * `filter` runs before the analysis, e.g. to measure a take in its mix format.
 */
export function measureLoudness(file: string, loops = 0, filter?: string): { lufs: number; truePeak: number } {
  const ffmpeg = resolveBinary('ffmpeg');
  const analysis = `${filter ? `${filter},` : ''}loudnorm=print_format=json`;
  const result = spawnSync(ffmpeg, ['-hide_banner', '-nostats', ...(loops > 0 ? ['-stream_loop', String(loops)] : []), '-i', file, '-af', analysis, '-f', 'null', '-'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const json = /\{[^{}]*"input_i"[^{}]*\}/.exec(result.stderr ?? '');
  if (!json) throw new ValidationError(`Could not measure the loudness of ${file}.`);
  const stats = JSON.parse(json[0]) as { input_i: string; input_tp: string };
  return { lufs: Number(stats.input_i), truePeak: Number(stats.input_tp) };
}

/**
 * Bring a mix to the loudness target with a static gain and a 4x-oversampled
 * peak limiter half a dB under the true-peak ceiling. Single-pass loudnorm
 * falls back to dynamic mode on wide-range episode mixes (sfx hits, quiet
 * pauses) and lands about 2 LU short; a measured gain does not. The limiter
 * eats a little loudness, so the gain is corrected until it is within 0.2 LU
 * (at most four passes).
 */
function levelToTarget(raw: string, duration: number, destination: string, target: { lufs: number; peak: number }): void {
  const ffmpeg = resolveBinary('ffmpeg');
  const measured = measureLoudness(raw).lufs;
  if (!Number.isFinite(measured)) {
    execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', raw, '-c:a', 'pcm_s16le', '-bitexact', destination], { stdio: 'inherit' });
    return;
  }
  const ceiling = Math.pow(10, (target.peak - 0.5) / 20).toFixed(4);
  const apply = (gain: number) =>
    execFileSync(
      ffmpeg,
      [
        '-y', '-loglevel', 'error', '-i', raw, '-af',
        `aresample=${SAMPLE_RATE * 4},volume=${gain.toFixed(2)}dB,alimiter=limit=${ceiling}:attack=2:release=50:level=false:asc=1,${exactLength(duration)}`,
        '-ar', String(SAMPLE_RATE), '-ac', '2', '-c:a', 'pcm_s16le', '-bitexact', destination,
      ],
      { stdio: 'inherit' },
    );
  let gain = target.lufs - measured;
  for (let pass = 0; pass < 4; pass += 1) {
    apply(gain);
    const error = target.lufs - measureLoudness(destination).lufs;
    if (Math.abs(error) <= 0.2) break;
    gain += error;
  }
}

/**
 * The linear gain that brings a speech take to `target` LUFS, measured in its
 * mix format. A silent take (loudness not measurable) keeps gain 1.
 */
function speechGain(file: string, duration: number, target: number): { lufs: number; gain: number } {
  const loops = duration > 0 && duration < MIN_MEASURE_SECONDS ? Math.ceil(MIN_MEASURE_SECONDS / duration) - 1 : 0;
  const lufs = measureLoudness(file, loops, MIX_FORMAT).lufs;
  if (!Number.isFinite(lufs)) return { lufs, gain: 1 };
  return { lufs, gain: Math.pow(10, (target - lufs) / 20) };
}

/** Mono samples of a WAV, decoded by ffmpeg. */
function decodeMono(file: string): Float32Array {
  const ffmpeg = resolveBinary('ffmpeg');
  const raw = execFileSync(
    ffmpeg,
    ['-loglevel', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(SAMPLE_RATE), '-'],
    { maxBuffer: 1024 * 1024 * 1024 },
  );
  return new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4));
}

/** Every audible line and every ambience must have a current take; returns the probed take lengths. */
async function checkTakes(project: EpisodeProject): Promise<Record<string, number>> {
  const takes = loadTakes(project);
  const issues: string[] = [];
  const durations: Record<string, number> = {};
  for (const { line } of scriptLines(project.script)) {
    if (!isAudibleLine(line)) continue;
    const file = lineTakePath(project, line.id);
    const take = takes.takes[line.id];
    const status = await takeStatus(take, file, textHash(takeSource(line)));
    if (status === 'current') durations[line.id] = probeDuration(file);
    else issues.push(blockingReason(status, take, `Line "${line.id}"`) ?? `Line "${line.id}": take is ${status}; run voice-track.`);
  }
  for (const scene of project.script.scenes) {
    if (!scene.atmo) continue;
    const take = takes.ambience[scene.id];
    const status = await takeStatus(take, ambiencePath(project, scene.id), textHash(ambienceSource(scene.atmo)));
    if (status !== 'current') {
      issues.push(
        blockingReason(status, take, `Ambience of scene "${scene.id}"`) ??
          `Ambience of scene "${scene.id}": ${status}; run voice-track.`,
      );
    }
  }
  if (issues.length > 0) throw new ValidationError('episode-track needs a current take for every audible line', issues);
  return durations;
}

/**
 * Place the takes, write timing.json, and mix audio/episode.wav plus one
 * speaker stem per character from the effective timing, so a timing override
 * moves sound and picture together. Deterministic; no speech recognition.
 */
export async function episodeTrack(projectDir: string): Promise<Timing> {
  const project = requireEpisode(await loadProject(projectDir), 'episode-track');
  validateScript(project.script, await scriptCanon(project, project.script));
  const durations = await checkTakes(project);
  const placement = placeLines(project.script, durations);

  const base: Timing = {
    version: 1,
    audio: { path: 'audio/episode.wav', duration: placement.duration, sampleRate: SAMPLE_RATE },
    beats: [],
    downbeats: [],
    onsets: [],
    // Replaced by the envelope of the finished mix below.
    energy: { hop: ENERGY_HOP, fps: SAMPLE_RATE / ENERGY_HOP, values: [0] },
    sections: placement.sections,
    lines: placement.lines,
    meta: { generator: 'episode-track' },
  };
  const effective = mergeTiming(base, project.overrides);
  // A meme lasts at most 30 seconds: a hard stop before anything is mixed (HS-264).
  if (project.config.kind === 'meme' && effective.audio.duration > MEME_MAX_SECONDS + 1e-9) {
    throw new ValidationError(
      `The meme's track lasts ${effective.audio.duration.toFixed(3)} s; a meme lasts at most ${MEME_MAX_SECONDS} s. Shorten the script, then run voice-track and episode-track again.`,
    );
  }

  // Inputs from the effective timing. Speech takes are levelled to one loudness
  // through their mix gain; the take files stay untouched. sfx keep gain 1.
  const defaults = await loadDefaults();
  const speechLevels: string[] = [];
  const lineInputs: Array<MixInput & { speaker?: string }> = [];
  for (const { line } of scriptLines(project.script)) {
    if (!isAudibleLine(line)) continue;
    const timed = effective.lines.find((candidate) => candidate.id === line.id)!;
    const file = lineTakePath(project, line.id);
    const input: MixInput & { speaker?: string } = { file, start: timed.start, length: timed.end - timed.start };
    if (isSpokenLine(line)) {
      const { lufs, gain } = speechGain(file, durations[line.id]!, defaults.render.speech_lufs);
      input.speaker = line.speaker;
      input.gain = gain;
      speechLevels.push(
        `  ${line.id} (${line.speaker}): ${Number.isFinite(lufs) ? `${lufs.toFixed(1)} LUFS` : 'silent'} → ${formatDb(20 * Math.log10(gain))}`,
      );
    }
    lineInputs.push(input);
  }
  const beds: MixInput[] = [];
  for (const scene of project.script.scenes) {
    if (!scene.atmo) continue;
    const section = effective.sections.find((candidate) => candidate.id === scene.id)!;
    beds.push({
      file: ambiencePath(project, scene.id),
      start: section.start,
      length: section.end - section.start,
      gain: AMBIENCE_GAIN,
      loop: true,
    });
  }
  const music = join(project.paths.root, 'audio', 'music.wav');
  if (existsSync(music)) beds.push({ file: music, start: 0, length: effective.audio.duration, gain: MUSIC_GAIN });

  const episodeWav = join(project.paths.root, base.audio.path);
  await ensureDir(join(project.paths.root, 'audio', 'stems'));
  mix([...beds, ...lineInputs], effective.audio.duration, episodeWav, {
    lufs: defaults.render.loudness_lufs,
    peak: defaults.render.true_peak_dbtp,
  });
  const speakers = [...new Set(lineInputs.flatMap((input) => (input.speaker ? [input.speaker] : [])))].sort();
  for (const speaker of speakers) {
    mix(
      lineInputs.filter((input) => input.speaker === speaker),
      effective.audio.duration,
      join(project.paths.root, 'audio', 'stems', `${speaker}.wav`),
    );
  }

  const timing: Timing = {
    ...base,
    energy: { ...base.energy, values: rmsEnvelope(decodeMono(episodeWav), ENERGY_HOP) },
  };
  await writeJsonAtomic(project.paths.timing, timing);
  await writeJsonAtomic(project.paths.effectiveTiming, mergeTiming(timing, project.overrides));
  if (speechLevels.length > 0) console.log(`Speech takes levelled to ${defaults.render.speech_lufs} LUFS:\n${speechLevels.join('\n')}`);
  console.log(
    `✔ ${base.audio.path}: ${placement.duration.toFixed(3)} s, ${placement.sections.length} scene(s), ${placement.lines.length} line(s); stems: ${speakers.join(', ') || 'none'}`,
  );
  console.log(`Timing written to ${project.paths.timing}`);
  return timing;
}

function formatDb(db: number): string {
  return `${db >= 0 ? '+' : ''}${db.toFixed(1)} dB`;
}
