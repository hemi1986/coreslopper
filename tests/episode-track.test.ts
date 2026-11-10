import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { parse, stringify } from 'yaml';
import {
  ScriptSchema,
  TakesSchema,
  TimingSchema,
  placeLines,
  readJsonFile,
  readYamlFile,
  rmsEnvelope,
  type Script,
} from '@coreslopper/core';
import { mockAudioSeconds } from '@coreslopper/providers';
import { blockingReason, takeStatus } from '../packages/cli/src/takes.ts';
import { resolveBinary } from '../packages/cli/src/media.ts';
import { importTakes } from '../packages/cli/src/media.ts';
import { voiceTrack } from '../packages/cli/src/voice-track.ts';
import { episodeTrack } from '../packages/cli/src/episode-track.ts';

const root = process.cwd();
const episodeDir = join(root, 'projects/demo-episode');

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function demoScript(): Promise<Script> {
  return readYamlFile(join(episodeDir, 'script.yaml'), ScriptSchema);
}

function hasFfmpeg(): boolean {
  try {
    resolveBinary('ffmpeg');
    resolveBinary('ffprobe');
    return true;
  } catch {
    return false;
  }
}

/** A 48 kHz mono 16-bit WAV with a 440 Hz tone. */
function toneWav(seconds: number): Buffer {
  const rate = 48_000;
  const frames = Math.round(seconds * rate);
  const data = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i += 1) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 12_000), i * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

describe('placeLines', () => {
  it('places lines one after another and scenes without gaps', async () => {
    const script = await demoScript();
    const placement = placeLines(script, { l01: 4.14, l03: 0.8, l04: 2.39, l05: 3.09, l07: 2.81, l08: 1.5 });
    const lines = Object.fromEntries(placement.lines.map((line) => [line.id, [line.start, line.end]]));
    expect(lines.l01).toEqual([0, 4.14]);
    // chat: 16 characters / 12 cps + 1.2 s hold, after l01's 0.6 s pause
    expect(lines.l02).toEqual([4.74, 7.273]);
    // sfx and pause last their duration, whatever the take says
    expect(lines.l03).toEqual([7.673, 8.473]);
    // a pause line has no pause_after
    expect(lines.l06).toEqual([15.653, 16.653]);
    expect(lines.l07).toEqual([16.653, 19.463]);
    expect(placement.sections.map((section) => [section.id, section.start, section.end])).toEqual([
      ['s01_office', 0, 11.963],
      ['s02_elevator', 11.963, 22.363],
    ]);
    expect(placement.duration).toBe(22.363);
    expect(placement.lines.find((line) => line.id === 'l03')!.text).toBe('');
    expect(placement.lines.find((line) => line.id === 'l02')!.text).toBe('Bist du noch da?');
  });

  it('needs a take for every spoken line', async () => {
    const script = await demoScript();
    expect(() => placeLines(script, { l01: 1 })).toThrow(/"l04" has no take duration/);
  });
});

describe('episode helpers', () => {
  it('gives mock speech a deterministic length from its text', () => {
    expect(mockAudioSeconds('Wer schreibt um diese Zeit?')).toBe(2.39);
    expect(mockAudioSeconds('Wer schreibt um diese Zeit?')).toBe(mockAudioSeconds('  Wer schreibt um diese Zeit?  '));
  });

  it('computes a peak-normalized RMS envelope', () => {
    const samples = new Float32Array(4096);
    samples.fill(0.5, 2048);
    const values = rmsEnvelope(samples, 512, 2048);
    expect(values).toHaveLength(9);
    expect(values[0]).toBe(0);
    expect(Math.max(...values)).toBe(1);
    expect(rmsEnvelope(new Float32Array(1024))).toEqual([0, 0, 0]);
  });

  it('tells current, stale, replaced, and unregistered takes apart', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'coreslopper-take-'));
    temporary.push(dir);
    const file = join(dir, 'l01.wav');
    expect(await takeStatus(undefined, file, 'h1')).toBe('missing');
    await writeFile(file, 'take');
    expect(await takeStatus(undefined, file, 'h1')).toBe('unregistered');
    const fileHash = execFileSync('sha256sum', [file], { encoding: 'utf8' }).split(' ')[0]!;
    const take = { source: 'generated' as const, duration: 1, text_hash: 'h1', file_hash: fileHash };
    expect(await takeStatus(take, file, 'h1')).toBe('current');
    expect(await takeStatus(take, file, 'h2')).toBe('stale');
    expect(blockingReason('stale', take, 'l01')).toBeUndefined();
    expect(blockingReason('stale', { ...take, source: 'imported' }, 'l01')).toMatch(/older text/);
    await writeFile(file, 'another take');
    expect(await takeStatus(take, file, 'h1')).toBe('replaced');
    expect(blockingReason('replaced', take, 'l01')).toMatch(/import-takes/);
  });
});

describe.skipIf(!hasFfmpeg())('voice-track and episode-track on the mock provider', () => {
  /** A workspace with the demo canon and episode, without generated audio or takes. */
  async function workspace(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'coreslopper-track-'));
    temporary.push(dir);
    await cp(join(root, 'series/demo-series'), join(dir, 'series/demo-series'), {
      recursive: true,
      filter: (source) => !source.endsWith('.wav'),
    });
    execFileSync('node', [join(root, 'scripts/fixtures/generate-voice-refs.mjs'), join(dir, 'series/demo-series')]);
    const project = join(dir, 'projects/demo-episode');
    await cp(episodeDir, project, {
      recursive: true,
      filter: (source) => !source.includes(`${sep}audio${sep}`) && !source.endsWith('takes.json'),
    });
    return project;
  }

  it('rebuilds the committed timing.json of the demo episode', async () => {
    const project = await workspace();
    await voiceTrack(project);
    const takes = await readJsonFile(join(project, 'takes.json'), TakesSchema);
    expect(Object.keys(takes.takes)).toEqual(['l01', 'l03', 'l04', 'l05', 'l07', 'l08']);
    expect(Object.keys(takes.ambience)).toEqual(['s01_office', 's02_elevator']);
    expect(takes.takes.l04).toMatchObject({ source: 'generated', duration: 2.39 });

    const timing = await episodeTrack(project);
    const committed = await readJsonFile(join(episodeDir, 'timing.json'), TimingSchema);
    expect(timing).toEqual(committed);
    expect(await readFile(join(project, 'timing.json'), 'utf8')).toBe(await readFile(join(episodeDir, 'timing.json'), 'utf8'));
  });

  it('regenerates only the takes whose text changed', async () => {
    const project = await workspace();
    await voiceTrack(project);
    const before = await readJsonFile(join(project, 'takes.json'), TakesSchema);
    const scriptPath = join(project, 'script.yaml');
    const script = parse(await readFile(scriptPath, 'utf8'));
    script.scenes[0].lines[3].text_de = 'Wer schreibt mir um diese Zeit noch?';
    await writeFile(scriptPath, stringify(script));
    await voiceTrack(project);
    const after = await readJsonFile(join(project, 'takes.json'), TakesSchema);
    expect(after.takes.l04!.text_hash).not.toBe(before.takes.l04!.text_hash);
    expect(after.takes.l04!.duration).toBe(mockAudioSeconds('Wer schreibt mir um diese Zeit noch?'));
    expect(after.takes.l01).toEqual(before.takes.l01);
    expect(after.ambience).toEqual(before.ambience);
  });

  it('imports a recording, protects it, and moves its sound with an override', async () => {
    const project = await workspace();
    await voiceTrack(project);
    // The user replaces the generated take with a recording.
    await writeFile(join(project, 'audio/lines/l01.wav'), toneWav(2));
    await expect(voiceTrack(project)).rejects.toThrow(/cannot continue/);
    await importTakes(project, { lines: ['l01'] });
    const takes = await readJsonFile(join(project, 'takes.json'), TakesSchema);
    expect(takes.takes.l01).toMatchObject({ source: 'imported', duration: 2 });

    const placed = await episodeTrack(project);
    const fps = placed.energy.fps;
    const at = (timing: typeof placed, seconds: number) => timing.energy.values[Math.round(seconds * fps)]!;
    expect(at(placed, 1)).toBeGreaterThan(0.5);
    expect(at(placed, 3)).toBe(0);

    // An override moves the line; the mix follows the effective timing.
    await writeFile(
      join(project, 'timing.overrides.json'),
      JSON.stringify({ version: 1, sections: [], lines: [{ id: 'l01', start: 1.5, end: 3.5 }], words: [] }),
    );
    const moved = await episodeTrack(project);
    expect(moved.lines.find((line) => line.id === 'l01')).toMatchObject({ start: 0, end: 2 });
    expect(at(moved, 0.5)).toBe(0);
    expect(at(moved, 3)).toBeGreaterThan(0.5);

    // The stem of the speaker carries the same take at the same place.
    const ffprobe = resolveBinary('ffprobe');
    const stem = execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', join(project, 'audio/stems/mara.wav')], {
      encoding: 'utf8',
    });
    expect(Number(stem)).toBeCloseTo(moved.audio.duration, 3);

    // A changed text makes the imported take stale; voice-track never overwrites it.
    const scriptPath = join(project, 'script.yaml');
    const script = parse(await readFile(scriptPath, 'utf8'));
    script.scenes[0].lines[0].text_de = 'Schon wieder so spät.';
    await writeFile(scriptPath, stringify(script));
    await expect(voiceTrack(project)).rejects.toThrow(/cannot continue/);
    await expect(episodeTrack(project)).rejects.toThrow(/current take/);
  });
});
