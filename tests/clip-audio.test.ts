import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';
import { atempoChain, clipAudioPieces, clipAudioTake } from '../packages/cli/src/clip-audio.ts';
import { measureLoudness } from '../packages/cli/src/episode-track.ts';
import { mediaInfo } from '../packages/cli/src/image-ops.ts';
import { resolveBinary } from '../packages/cli/src/media.ts';
import { voiceTrack } from '../packages/cli/src/voice-track.ts';

const root = process.cwd();
let ffmpeg: string | undefined;
try {
  ffmpeg = resolveBinary('ffmpeg');
} catch {
  ffmpeg = undefined;
}

const temporary: string[] = [];
afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true });
});

describe('clip audio pieces', () => {
  const clip = 'c.mp4';
  it('cuts the overlap of every shot with the line slot at the clip position', () => {
    const pieces = clipAudioPieces({ start: 10, end: 13 }, [
      { id: 'a', clip, start: 8, end: 11, clipFrom: 0.5, speed: 1 },
      { id: 'b', clip, start: 11, end: 15, clipFrom: 0, speed: 2 },
      { id: 'c', clip, start: 15, end: 16, clipFrom: 0, speed: 1 },
    ]);
    expect(pieces).toEqual([
      { shot: 'a', clip, offset: 0, from: 2.5, length: 1, speed: 1 },
      { shot: 'b', clip, offset: 1, from: 0, length: 2, speed: 2 },
    ]);
  });

  it('chains atempo stages for speeds outside 0.5..2', () => {
    expect(atempoChain(1)).toEqual([]);
    expect(atempoChain(1.5)).toEqual(['atempo=1.500000']);
    expect(atempoChain(3)).toEqual(['atempo=2', 'atempo=1.500000']);
    expect(atempoChain(0.25)).toEqual(['atempo=0.5', 'atempo=0.500000']);
  });
});

describe.skipIf(!ffmpeg)('clip-audio on the demo episode', () => {
  async function workspace(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'coreslopper-clip-audio-'));
    temporary.push(dir);
    await cp(join(root, 'projects/demo-series'), join(dir, 'projects/demo-series'), {
      recursive: true,
      filter: (source) => !source.endsWith('.wav'),
    });
    execFileSync('node', [join(root, 'scripts/fixtures/generate-voice-refs.mjs'), join(dir, 'projects/demo-series')]);
    const project = join(dir, 'projects/demo-episode');
    await cp(join(root, 'projects/demo-episode'), project, {
      recursive: true,
      filter: (source) => !source.includes(`${sep}audio${sep}`) && !source.endsWith('takes.json'),
    });
    return project;
  }

  it('replaces an sfx take with the sound of the clip under it', async () => {
    const project = await workspace();
    await voiceTrack(project);
    await mkdir(join(project, 'assets/clips'), { recursive: true });
    // A 12 s clip whose sound is a loud tone: the take must carry it, levelled.
    execFileSync(ffmpeg!, [
      '-y', '-v', 'error',
      '-f', 'lavfi', '-i', 'color=gray:s=320x568:d=12:r=24',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=12:sample_rate=32000',
      '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
      join(project, 'assets/clips/shot-004.mp4'),
    ]);
    const storyboardPath = join(project, 'storyboard.yaml');
    const storyboard = parse(await readFile(storyboardPath, 'utf8'));
    storyboard.shots.find((shot: { id: string }) => shot.id === 'shot-004').asset = 'assets/clips/shot-004.mp4';
    await writeFile(storyboardPath, stringify(storyboard));

    const result = await clipAudioTake(project, { line: 'l08' });
    expect(result.pieces).toHaveLength(1);
    expect(result.pieces[0]).toMatchObject({ shot: 'shot-004', speed: 1 });
    expect(result.file).toBe('audio/lines/l08.wav');
    const info = mediaInfo(join(project, result.file));
    expect(info.seconds).toBeCloseTo(result.duration, 1);
    expect(measureLoudness(join(project, result.file)).lufs).toBeCloseTo(-20, 0);
    const takes = JSON.parse(await readFile(join(project, 'takes.json'), 'utf8'));
    expect(takes.takes.l08.source).toBe('imported');

    await expect(clipAudioTake(project, { line: 'l04' })).rejects.toThrow(/sfx takes only/);
    await expect(clipAudioTake(project, { line: 'l03' })).rejects.toThrow(/No clip sound overlaps/);
  });
});
