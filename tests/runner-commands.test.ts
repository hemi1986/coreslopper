import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { imageSize } from '../packages/cli/src/clip-options.ts';
import { comfyStatus, formatComfyStatus } from '../packages/cli/src/comfy.ts';
import { resolveBinary } from '../packages/cli/src/media.ts';
import { patchImage } from '../packages/cli/src/patch.ts';
import { formatVerdicts, latestVerdicts, summarizeVerdicts } from '../packages/cli/src/verdicts.ts';

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

/** Mean RGB of a region, read from raw pixels. */
function pixel(path: string, x: number, y: number): number[] {
  const raw = execFileSync(ffmpeg!, ['-v', 'error', '-i', path, '-vf', `crop=2:2:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-frames:v', '1', '-']);
  return [raw[0]!, raw[1]!, raw[2]!];
}

describe.skipIf(!ffmpeg)('patch', () => {
  it('patches a region and leaves the rest of the image untouched', async () => {
    const project = demoProject();
    const image = solid(join(project, 'assets/keyframes/shot-001.png'), 'red', '400x400');
    const blue = solid(join(project, 'assets/edit.png'), 'blue', '512x512');
    let seen: { crop: string; prompt: string } | undefined;
    const result = await patchImage(project, {
      image,
      box: '100,100,200,200',
      prompt: 'Fix the treads.',
      subject: 'shot-001',
      feather: 20,
      edit: async (crop, prompt) => {
        seen = { crop, prompt };
        return blue;
      },
    });
    expect(result).toMatchObject({
      image: 'assets/keyframes/shot-001.png',
      out: 'assets/keyframes/attempts/shot-001-a2.png',
      attempt: 2,
      box: { x: 100, y: 100, width: 200, height: 200 },
      replaced: false,
    });
    expect(imageSize(seen!.crop)).toEqual({ width: 1024, height: 1024 });
    const out = join(project, result.out);
    expect(imageSize(out)).toEqual({ width: 400, height: 400 });
    const inner = pixel(out, 200, 200);
    expect(inner[0]).toBeLessThan(3);
    expect(inner[2]).toBeGreaterThan(250);
    // Outside the box every pixel is the original's.
    expect(pixel(out, 40, 40)).toEqual(pixel(image, 40, 40));
    expect(pixel(out, 340, 200)).toEqual(pixel(image, 340, 200));
    expect(pixel(out, 40, 40)[0]).toBeGreaterThan(250);
    // The soft edge: a mix of both right inside the box border.
    const edge = pixel(out, 104, 200);
    expect(edge[0]).toBeGreaterThan(60);
    expect(edge[2]).toBeGreaterThan(20);
    // The original is untouched until --replace.
    expect(pixel(image, 200, 200)[2]).toBe(0);
    expect(JSON.parse(readFileSync(join(project, 'assets/review/patches.jsonl'), 'utf8').trim())).toMatchObject({
      subject: 'shot-001',
      prompt: 'Fix the treads.',
      attempt: 2,
    });

    const replaced = await patchImage(project, { image, box: '0,0,0.5,0.5', prompt: 'Again.', attempt: 3, replace: true, edit: async () => blue });
    expect(replaced).toMatchObject({ out: 'assets/keyframes/attempts/shot-001-a3.png', replaced: true });
    expect(pixel(image, 50, 50)[2]).toBeGreaterThan(250);
    expect(pixel(join(project, 'assets/keyframes/attempts/shot-001-a2.png'), 200, 200)[2]).toBeGreaterThan(250);
  });
});

describe('verdicts', () => {
  it('keeps the last verdict per subject and lists the blocking issues of a fail', () => {
    const dir = tempDir();
    const log = join(dir, 'verdicts.jsonl');
    const line = (subject: string, verdict: string, attempt: number, issues: string[] = [], extra = {}) =>
      JSON.stringify({ image: `${subject}.png`, subject, attempt, verdict, score: verdict === 'pass' ? 8 : 3, issues, fix_prompt: 'none', ...extra });
    writeFileSync(
      log,
      [
        line('shot-001', 'fail', 1, ['third arm -> two arms']),
        line('shot-001', 'pass', 2),
        line('shot-002', 'fail', 1, ['wrong prop -> the scarf', 'note: dark']),
        '{"torn":',
        line('shot-001', 'fail', 1, ['hangs in the air'], { clip: 'assets/clips/attempts/shot-001-a1.mp4' }),
      ].join('\n'),
    );
    const latest = latestVerdicts(log);
    expect([...latest.keys()]).toEqual(['shot-001', 'shot-002', 'shot-001 (clip)']);
    expect(latest.get('shot-001')).toMatchObject({ verdict: 'pass', attempt: 2 });
    expect(latestVerdicts(join(dir, 'none.jsonl')).size).toBe(0);
    const text = formatVerdicts(
      [...latest.entries()].map(([subject, verdict]) => ({ subject, verdict: verdict.verdict, score: verdict.score, attempt: verdict.attempt, image: verdict.image, issues: verdict.issues })),
    );
    expect(text).toContain('shot-002         fail   3  a1 · wrong prop -> the scarf');
    expect(text).not.toContain('note: dark');
    expect(text).toContain('1 pass, 2 fail');
  });

  it('summarizes the verdict log of a project', async () => {
    const project = demoProject();
    mkdirSync(join(project, 'assets/review'), { recursive: true });
    writeFileSync(
      join(project, 'assets/review/verdicts.jsonl'),
      `${JSON.stringify({ image: 'f.png', subject: 'shot-001', attempt: 2, verdict: 'fail', score: 4, issues: ['x -> y'], fix_prompt: 'none', clip: 'assets/clips/attempts/shot-001-a2.mp4' })}\n`,
    );
    expect(await summarizeVerdicts(project)).toEqual([
      { subject: 'shot-001 (clip)', verdict: 'fail', score: 4, attempt: 2, image: 'assets/clips/attempts/shot-001-a2.mp4', issues: ['x -> y'] },
    ]);
    expect(await summarizeVerdicts(project, { failed: true })).toHaveLength(1);
  });
});

describe('comfy status', () => {
  it('reports queue, VRAM, and the last prompts', async () => {
    const fetchImpl = (async (url: string | URL) => {
      const path = String(url).replace('http://comfy.test', '');
      const body: Record<string, unknown> = {
        '/system_stats': { system: { comfyui_version: '0.9.1' }, devices: [{ name: 'cuda:0', vram_total: 16 * 1024 ** 3, vram_free: 4 * 1024 ** 3 }] },
        '/queue': { queue_running: [[1]], queue_pending: [[2], [3]] },
        '/history?max_items=5': { 'aaaaaaaa-1': { status: { status_str: 'success' } }, 'bbbbbbbb-2': { status: { status_str: 'error' } } },
      };
      return new Response(JSON.stringify(body[path] ?? {}), { status: path in body ? 200 : 404 });
    }) as typeof fetch;
    const status = await comfyStatus(fetchImpl, 'http://comfy.test');
    expect(status).toMatchObject({ ok: true, running: 1, pending: 2, vram: { usedGb: 12, totalGb: 16 } });
    expect(status.recent).toEqual([{ id: 'bbbbbbbb', status: 'error' }, { id: 'aaaaaaaa', status: 'success' }]);
    expect(formatComfyStatus(status)).toContain('Queue: 1 running, 2 pending');
    const down = await comfyStatus((async () => Promise.reject(new Error('ECONNREFUSED'))) as typeof fetch, 'http://comfy.test');
    expect(formatComfyStatus(down)).toMatch(/does not answer: ECONNREFUSED/);
  });
});
