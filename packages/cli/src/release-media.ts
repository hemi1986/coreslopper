import { execFile, execFileSync } from 'node:child_process';
import { CANVAS_SPEC } from '@coreslopper/core';
import { resolveBinary } from './media.js';

// Media specifications of the release folder as pure checks on ffprobe JSON,
// plus the two ffmpeg jobs `release` runs (WAV conversion, canvas loop). Every
// ffmpeg call runs on its own, with six threads.

export interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  sample_rate?: string;
  channels?: number;
  sample_fmt?: string;
  bits_per_sample?: number;
  bits_per_raw_sample?: string;
}

/** The parts of `ffprobe -show_streams -show_format -of json` the checks read. */
export interface MediaProbe {
  streams: ProbeStream[];
  format: { duration?: string; format_name?: string };
}

export type Prober = (path: string) => MediaProbe;
export type FfmpegRunner = (args: string[]) => Promise<string>;

export function probeMedia(path: string): MediaProbe {
  const raw = execFileSync(resolveBinary('ffprobe'), ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  const data = JSON.parse(raw) as Partial<MediaProbe>;
  return { streams: data.streams ?? [], format: data.format ?? {} };
}

/** Run ffmpeg (quiet, overwrite) and resolve with its stderr. */
export const runFfmpeg: FfmpegRunner = (args) =>
  new Promise((resolve, reject) => {
    execFile(resolveBinary('ffmpeg'), ['-hide_banner', '-nostdin', '-y', ...args], { maxBuffer: 64 * 1024 * 1024 }, (error, _stdout, stderr) => {
      if (error) reject(new Error(`ffmpeg failed: ${stderr.split('\n').filter(Boolean).slice(-3).join(' ') || error.message}`));
      else resolve(stderr);
    });
  });

const video = (probe: MediaProbe) => probe.streams.find((stream) => stream.codec_type === 'video');
const audio = (probe: MediaProbe) => probe.streams.find((stream) => stream.codec_type === 'audio');
export const duration = (probe: MediaProbe) => Number(probe.format.duration ?? 0);

function fps(stream: ProbeStream | undefined): number {
  const [num, den] = (stream?.avg_frame_rate && stream.avg_frame_rate !== '0/0' ? stream.avg_frame_rate : stream?.r_frame_rate ?? '0/1')
    .split('/')
    .map(Number);
  return den ? num! / den : 0;
}

export interface VideoFacts {
  width: number;
  height: number;
  fps: number;
  duration: number;
  audio: boolean;
}

export function videoFacts(probe: MediaProbe): VideoFacts {
  const stream = video(probe);
  return { width: stream?.width ?? 0, height: stream?.height ?? 0, fps: Number(fps(stream).toFixed(3)), duration: duration(probe), audio: Boolean(audio(probe)) };
}

/** A format render: exact size and frame rate, the timing's length (±0.1 s), with sound. */
export function videoProblems(probe: MediaProbe, expected: { width: number; height: number; fps: number; duration?: number }): string[] {
  const facts = videoFacts(probe);
  const problems: string[] = [];
  if (facts.width !== expected.width || facts.height !== expected.height) problems.push(`${facts.width}x${facts.height}, expected ${expected.width}x${expected.height}`);
  if (Math.abs(facts.fps - expected.fps) > 0.01) problems.push(`${facts.fps} fps, expected ${expected.fps}`);
  if (expected.duration !== undefined && Math.abs(facts.duration - expected.duration) > 0.1) {
    problems.push(`${facts.duration.toFixed(2)} s, expected ${expected.duration.toFixed(2)} s`);
  }
  if (!facts.audio) problems.push('no audio track');
  return problems;
}

export interface AudioFacts {
  codec: string;
  sampleRate: number;
  channels: number;
  bits: number;
  duration: number;
}

export function audioFacts(probe: MediaProbe): AudioFacts {
  const stream = audio(probe);
  const bits = stream?.bits_per_sample || Number(stream?.bits_per_raw_sample ?? 0) || (stream?.codec_name?.match(/(\d+)/)?.[1] ? Number(stream.codec_name.match(/(\d+)/)![1]) : 0);
  return {
    codec: stream?.codec_name ?? 'none',
    sampleRate: Number(stream?.sample_rate ?? 0),
    channels: stream?.channels ?? 0,
    bits,
    duration: duration(probe),
  };
}

/** What a distributor accepts: WAV, PCM 16 or 24 bit, at least 44.1 kHz, stereo. */
export const WAV_SPEC = { codecs: ['pcm_s16le', 'pcm_s24le'], minSampleRate: 44_100, channels: 2, maxSilence: 2 } as const;

export function wavProblems(probe: MediaProbe, expectedDuration?: number): string[] {
  const facts = audioFacts(probe);
  const problems: string[] = [];
  if (!/wav/.test(probe.format.format_name ?? '')) problems.push(`container ${probe.format.format_name ?? 'unknown'}, expected WAV`);
  if (!(WAV_SPEC.codecs as readonly string[]).includes(facts.codec)) problems.push(`${facts.codec}, expected PCM 16 or 24 bit`);
  if (facts.sampleRate < WAV_SPEC.minSampleRate) problems.push(`${facts.sampleRate} Hz, at least ${WAV_SPEC.minSampleRate}`);
  if (facts.channels !== WAV_SPEC.channels) problems.push(`${facts.channels} channel(s), expected stereo`);
  if (expectedDuration !== undefined && Math.abs(facts.duration - expectedDuration) > 0.05) {
    problems.push(`${facts.duration.toFixed(3)} s, song.json says ${expectedDuration.toFixed(3)} s`);
  }
  return problems;
}

/** Whether a WAV can go to the distributor as is (no conversion). */
export function wavIsDeliverable(probe: MediaProbe): boolean {
  return wavProblems(probe).length === 0;
}

/** ffmpeg arguments that turn any song file into a deliverable WAV without touching its loudness. */
export function wavConvertArgs(source: string, output: string, facts: AudioFacts): string[] {
  const codec = facts.bits > 16 || /f32|f64|s32|flt|dbl/.test(facts.codec) ? 'pcm_s24le' : 'pcm_s16le';
  const rate = facts.sampleRate >= WAV_SPEC.minSampleRate ? facts.sampleRate : 48_000;
  return ['-threads', '6', '-i', source, '-map', '0:a:0', '-c:a', codec, '-ar', String(rate), '-ac', '2', output];
}

/** Leading and trailing silence (below -60 dB) in seconds, parsed from silencedetect. */
export function parseSilence(stderr: string, total: number): { lead: number; tail: number } {
  const starts = [...stderr.matchAll(/silence_start: (-?[\d.]+)/g)].map((match) => Number(match[1]));
  const ends = [...stderr.matchAll(/silence_end: ([\d.]+)/g)].map((match) => Number(match[1]));
  const lead = starts.length && starts[0]! <= 0.01 ? (ends[0] ?? total) : 0;
  const lastStart = starts.at(-1);
  const tail = lastStart !== undefined && (ends.length < starts.length || (ends.at(-1) ?? 0) >= total - 0.01) ? total - lastStart : 0;
  return { lead, tail };
}

export async function measureSilence(path: string, total: number, ffmpeg: FfmpegRunner = runFfmpeg): Promise<{ lead: number; tail: number }> {
  const stderr = await ffmpeg(['-threads', '6', '-i', path, '-af', 'silencedetect=noise=-60dB:d=0.5', '-f', 'null', '-']);
  return parseSilence(stderr, total);
}

/** Spotify Canvas: 3–8 s, 9:16, at least 720 px high, no audio track. */
export function canvasProblems(probe: MediaProbe): string[] {
  const facts = videoFacts(probe);
  const problems: string[] = [];
  if (facts.duration < CANVAS_SPEC.minSeconds - 0.05 || facts.duration > CANVAS_SPEC.maxSeconds + 0.05) {
    problems.push(`${facts.duration.toFixed(2)} s, expected ${CANVAS_SPEC.minSeconds}–${CANVAS_SPEC.maxSeconds} s`);
  }
  if (facts.height <= 0 || Math.abs(facts.width / facts.height - 9 / 16) > 0.01) problems.push(`${facts.width}x${facts.height}, expected 9:16`);
  if (facts.height < CANVAS_SPEC.minHeight) problems.push(`${facts.height} px high, at least ${CANVAS_SPEC.minHeight}`);
  if (facts.audio) problems.push('has an audio track; a canvas is silent');
  return problems;
}

/**
 * The canvas loop from the 9:16 render: `length` seconds starting `crossfade`
 * seconds into the window, with the last `crossfade` seconds dissolving into
 * the window's head, so the last frame flows into the first. Silent, H.264.
 */
export function canvasArgs(
  source: string,
  output: string,
  window: { start: number; length: number },
  fps = 30,
  crossfade: number = CANVAS_SPEC.crossfade,
): string[] {
  const { start, length } = window;
  // xfade needs a constant frame rate on both inputs.
  const filter = [
    '[0:v]split[a][b]',
    `[a]trim=start=${crossfade}:end=${length + crossfade},setpts=PTS-STARTPTS,fps=${fps}[body]`,
    `[b]trim=start=0:end=${crossfade},setpts=PTS-STARTPTS,fps=${fps}[head]`,
    `[body][head]xfade=transition=fade:duration=${crossfade}:offset=${(length - crossfade).toFixed(3)},format=yuv420p[v]`,
  ].join(';');
  return [
    '-threads', '6',
    '-ss', start.toFixed(3), '-t', (length + crossfade).toFixed(3), '-i', source,
    '-filter_complex', filter,
    '-map', '[v]', '-an',
    '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    output,
  ];
}
