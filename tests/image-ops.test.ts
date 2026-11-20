import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { imageSize } from '../packages/cli/src/clip-options.ts';
import {
  clipFrames,
  editSize,
  formatMediaInfo,
  imagePsnr,
  makeSheet,
  mediaInfo,
  parseBox,
  pasteFilter,
  sheetLayout,
} from '../packages/cli/src/image-ops.ts';
import { resolveBinary } from '../packages/cli/src/media.ts';
import { reviewImage } from '../packages/cli/src/review-image.ts';

let ffmpeg: string | undefined;
try {
  ffmpeg = resolveBinary('ffmpeg');
  resolveBinary('ffprobe');
} catch {
  ffmpeg = undefined;
}

const temporary: string[] = [];
afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'coreslopper-image-ops-'));
  temporary.push(dir);
  return dir;
}

function demoProject(): string {
  const project = join(tempDir(), 'demo');
  cpSync(join(process.cwd(), 'projects/demo'), project, {
    recursive: true,
    filter: (source) => !/\/(assets|renders|\.cache)(\/|$)/.test(source),
  });
  mkdirSync(join(project, 'assets', 'keyframes'), { recursive: true });
  return project;
}

/** A solid-colour PNG, or a test clip that fades from red to blue. */
function solid(path: string, color: string, size = '320x180'): string {
  execFileSync(ffmpeg!, ['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=${color}:s=${size}`, '-frames:v', '1', path]);
  return path;
}

function fadeClip(path: string): string {
  execFileSync(ffmpeg!, [
    '-y', '-v', 'error',
    '-f', 'lavfi', '-i', 'color=red:s=320x180:d=2:r=24',
    '-f', 'lavfi', '-i', 'color=blue:s=320x180:d=2:r=24',
    '-filter_complex', '[0:v][1:v]blend=all_expr=A*(1-T/2)+B*(T/2)',
    '-pix_fmt', 'yuv420p', path,
  ]);
  return path;
}

/** Mean RGB of a region, read from raw pixels. */
function pixel(path: string, x: number, y: number): number[] {
  const raw = execFileSync(ffmpeg!, ['-v', 'error', '-i', path, '-vf', `crop=2:2:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-frames:v', '1', '-']);
  return [raw[0]!, raw[1]!, raw[2]!];
}

describe('parseBox', () => {
  const image = { width: 1000, height: 2000 };
  it('reads fractions and pixels, clamped to the image with even sizes', () => {
    expect(parseBox('0.1,0.25,0.5,0.25', image)).toEqual({ x: 100, y: 500, width: 500, height: 500 });
    expect(parseBox('300,820,401,333', image)).toEqual({ x: 300, y: 820, width: 400, height: 332 });
    expect(parseBox('900,1900,400,400', image)).toEqual({ x: 900, y: 1900, width: 100, height: 100 });
  });
  it('rejects a malformed box', () => {
    expect(() => parseBox('1,2,3', image)).toThrow(/x,y,w,h/);
    expect(() => parseBox('0.1,0.1,0,0.2', image)).toThrow(/no area/);
    expect(() => parseBox('a,b,c,d', image)).toThrow(/x,y,w,h/);
  });
});

describe('edit and sheet geometry', () => {
  it('scales the long side of a crop to the edit size in multiples of 16', () => {
    expect(editSize({ width: 500, height: 250 })).toEqual({ width: 1024, height: 512 });
    expect(editSize({ width: 360, height: 420 }, 1024)).toEqual({ width: 880, height: 1024 });
  });

  it('feathers only the sides that lie inside the image', () => {
    const image = { width: 1000, height: 1000 };
    const inner = pasteFilter({ x: 100, y: 100, width: 200, height: 200 }, image, 24);
    expect(inner).toContain("a='255*clip(min(min(min((X+1)/24,(Y+1)/24),(W-X)/24),(H-Y)/24),0,1)'");
    expect(inner).toContain('overlay=100:100:format=rgb');
    const corner = pasteFilter({ x: 0, y: 0, width: 200, height: 200 }, image, 24);
    expect(corner).toContain("a='255*clip(min((W-X)/24,(H-Y)/24),0,1)'");
    expect(pasteFilter({ x: 0, y: 0, width: 1000, height: 1000 }, image, 24)).toContain("a='255'");
  });

  it('lays tiles out left to right, then the next row', () => {
    const layout = sheetLayout(5, { width: 1080, height: 1920 }, { height: 640, columns: 3 });
    expect(layout).toMatchObject({ cell: { width: 360, height: 640 }, columns: 3, rows: 2 });
    expect(layout.positions).toEqual(['0_0', '360_0', '720_0', '0_640', '360_640']);
    expect(sheetLayout(2, { width: 16, height: 9 }).columns).toBe(2);
  });
});

describe.skipIf(!ffmpeg)('with ffmpeg', () => {
  it('probes an image and a clip', () => {
    const dir = tempDir();
    const png = solid(join(dir, 'a.png'), 'red');
    const clip = fadeClip(join(dir, 'c.mp4'));
    expect(mediaInfo(png)).toMatchObject({ kind: 'image', width: 320, height: 180 });
    const info = mediaInfo(clip);
    expect(info).toMatchObject({ kind: 'video', width: 320, height: 180, fps: 24, frames: 48 });
    expect(formatMediaInfo(info)).toMatch(/video · 320x180 · 2\.00 s · 24 fps · 48 frames · h264 · no audio/);
    expect(() => mediaInfo(join(dir, 'missing.png'))).toThrow(/Missing file/);
  });

  it('extracts the first, middle, and last frame of a clip', async () => {
    const dir = tempDir();
    const frames = await clipFrames(fadeClip(join(dir, 'shot-001-a1.mp4')), join(dir, 'frames'));
    expect(frames.map((frame) => frame.slice(dir.length + 1))).toEqual([
      'frames/shot-001-a1-first.png',
      'frames/shot-001-a1-middle.png',
      'frames/shot-001-a1-last.png',
    ]);
    const [first, , last] = frames.map((frame) => pixel(frame, 100, 100));
    expect(first![0]).toBeGreaterThan(200);
    expect(first![2]).toBeLessThan(60);
    expect(last![2]).toBeGreaterThan(200);
    expect(last![0]).toBeLessThan(60);
  });

  it('measures how far an image is from a reference', () => {
    const dir = tempDir();
    const red = solid(join(dir, 'red.png'), 'red');
    expect(imagePsnr(red, solid(join(dir, 'red-large.png'), 'red', '640x360'))).toBeGreaterThan(40);
    expect(imagePsnr(red, solid(join(dir, 'blue.png'), 'blue'))).toBeLessThan(10);
  });

  it('writes a sheet of the expected size, also zoomed', async () => {
    const dir = tempDir();
    const images = ['red', 'green', 'blue'].map((color) => solid(join(dir, `${color}.png`), color));
    const sheet = await makeSheet(images, join(dir, 'sheets', 'all.png'), { height: 90 });
    expect(imageSize(sheet)).toEqual({ width: 480, height: 90 });
    expect(pixel(sheet, 200, 40)[1]).toBeGreaterThan(100);
    const zoom = await makeSheet(images.slice(0, 2), join(dir, 'zoom.png'), { height: 100, box: '0,0,0.5,0.5', columns: 1 });
    expect(imageSize(zoom)).toEqual({ width: 178, height: 200 });
    await expect(makeSheet([], join(dir, 'none.png'))).rejects.toThrow(/at least one/);
  });

  it('reviews a clip by its frames and measures the start frame against the keyframe', async () => {
    const project = demoProject();
    const shot = 'shot-001';
    solid(join(project, `assets/keyframes/${shot}.png`), 'blue');
    mkdirSync(join(project, 'assets/clips/attempts'), { recursive: true });
    const clip = fadeClip(join(project, `assets/clips/attempts/${shot}-a1.mp4`));
    let prompt = '';
    const verdict = await reviewImage(project, {
      clip,
      shot,
      runner: async (text) => {
        prompt = text;
        return JSON.stringify({ structured_output: { verdict: 'fail', score: 3, issues: ['framing drifted -> hold the keyframe'], fix_prompt: 'none' } });
      },
    });
    expect(prompt).toContain('by exactly these frames (first, middle, last)');
    expect(prompt).toContain(`${shot}-a1-first.png`);
    expect(prompt).toMatch(/first frame differs from it \(PSNR [\d.]+ dB\)/);
    expect(verdict).toMatchObject({ verdict: 'fail', subject: shot, clip: expect.stringContaining(`${shot}-a1.mp4`) });
    expect(verdict.startFramePsnr).toBeLessThan(15);
    expect(verdict.image).toContain(`review/frames/${shot}-a1-first.png`);

    // A clip that starts on its keyframe is not flagged.
    solid(join(project, `assets/keyframes/${shot}.png`), 'red');
    await reviewImage(project, {
      clip,
      shot,
      attempt: 2,
      runner: async (text) => {
        prompt = text;
        return JSON.stringify({ structured_output: { verdict: 'pass', score: 8, issues: [], fix_prompt: 'none' } });
      },
    });
    expect(prompt).toContain('starts from the approved keyframe');
  });
});

describe('reviewImage arguments', () => {
  it('needs an image or a clip, and a shot for a clip', async () => {
    const project = demoProject();
    await expect(reviewImage(project, { shot: 'shot-001', runner: async () => '' })).rejects.toThrow(/--image <png> or --clip/);
    await expect(reviewImage(project, { clip: 'x.mp4', ref: 'prop:x', runner: async () => '' })).rejects.toThrow(/needs --shot/);
    await expect(reviewImage(project, { clip: 'x.mp4', images: ['y.png'], shot: 'shot-001', runner: async () => '' })).rejects.toThrow(/not both/);
  });
});
