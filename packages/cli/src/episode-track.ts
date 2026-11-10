import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
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

const SAMPLE_RATE = 48_000;
/** Energy frames like the music-video analysis: 512-sample hop, 2048-sample window. */
const ENERGY_HOP = 512;
/** Mix levels of the beds under the takes. */
const AMBIENCE_GAIN = 0.3;
const MUSIC_GAIN = 0.25;

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
 * base input sets the length, so a mix without takes is valid silence.
 */
function mix(inputs: MixInput[], duration: number, destination: string, loudness?: { lufs: number; peak: number }): void {
  const ffmpeg = resolveBinary('ffmpeg');
  const args = ['-y', '-loglevel', 'error', '-f', 'lavfi', '-t', duration.toFixed(3), '-i', `anullsrc=r=${SAMPLE_RATE}:cl=stereo`];
  const filters: string[] = [];
  const labels = ['[0:a]'];
  for (const [index, input] of inputs.entries()) {
    if (input.loop) args.push('-stream_loop', '-1');
    args.push('-i', input.file);
    const label = `[a${index + 1}]`;
    filters.push(
      `[${index + 1}:a]aformat=sample_rates=${SAMPLE_RATE}:channel_layouts=stereo,` +
        `atrim=0:${input.length.toFixed(3)},asetpts=PTS-STARTPTS,volume=${input.gain ?? 1},` +
        `adelay=${Math.round(input.start * 1000)}:all=1${label}`,
    );
    labels.push(label);
  }
  filters.push(`${labels.join('')}amix=inputs=${labels.length}:duration=first:normalize=0:dropout_transition=0[mix]`);
  const tail = loudness ? `loudnorm=I=${loudness.lufs}:TP=${loudness.peak}:LRA=11,` : '';
  // loudnorm shifts timestamps and drops a few milliseconds at the end, so the
  // exact length is set by sample count, not by time.
  const samples = Math.round(duration * SAMPLE_RATE);
  filters.push(
    `[mix]${tail}aresample=${SAMPLE_RATE},asetpts=N/SR/TB,apad=whole_len=${samples},atrim=end_sample=${samples}[out]`,
  );
  args.push('-filter_complex', filters.join(';'), '-map', '[out]', '-ar', String(SAMPLE_RATE), '-ac', '2', '-c:a', 'pcm_s16le', '-bitexact', destination);
  execFileSync(ffmpeg, args, { stdio: 'inherit' });
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
  validateScript(project.script, project);
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

  // Inputs from the effective timing.
  const lineInputs: Array<MixInput & { speaker?: string }> = [];
  for (const { line } of scriptLines(project.script)) {
    if (!isAudibleLine(line)) continue;
    const timed = effective.lines.find((candidate) => candidate.id === line.id)!;
    lineInputs.push({
      file: lineTakePath(project, line.id),
      start: timed.start,
      length: timed.end - timed.start,
      ...(isSpokenLine(line) ? { speaker: line.speaker } : {}),
    });
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

  const defaults = await loadDefaults();
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
  console.log(
    `✔ ${base.audio.path}: ${placement.duration.toFixed(3)} s, ${placement.sections.length} scene(s), ${placement.lines.length} line(s); stems: ${speakers.join(', ') || 'none'}`,
  );
  console.log(`Timing written to ${project.paths.timing}`);
  return timing;
}
