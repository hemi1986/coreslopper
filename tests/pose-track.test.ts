import { mkdtempSync, rmSync, writeFileSync, cpSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  POSE_KEYPOINTS,
  PoseTrackSchema,
  ValidationError,
  parsePoseTrack,
  poseBoneAngles,
  poseTrackDuration,
  samplePoseTrack,
  samplePoseTrackRelative,
  type PoseTrack,
} from '../packages/core/src/index.ts';
import * as browser from '../packages/core/src/browser.ts';
import { extractorCall, formatPoseReport, parseClock, parsePersonRule, poseExtract } from '../packages/cli/src/pose-extract.ts';

type Joint = [number, number, number];

/** A standing figure whose left wrist moves right over time. */
function figure(shift: number, conf = 0.9): Joint[] {
  const base: Record<string, [number, number]> = {
    nose: [0.5, 0.2], left_eye: [0.51, 0.19], right_eye: [0.49, 0.19], left_ear: [0.52, 0.2], right_ear: [0.48, 0.2],
    left_shoulder: [0.55, 0.3], right_shoulder: [0.45, 0.3], left_elbow: [0.6, 0.4], right_elbow: [0.4, 0.4],
    left_wrist: [0.62 + shift, 0.5], right_wrist: [0.38, 0.5], left_hip: [0.53, 0.5], right_hip: [0.47, 0.5],
    left_knee: [0.53, 0.7], right_knee: [0.47, 0.7], left_ankle: [0.53, 0.9], right_ankle: [0.47, 0.9],
  };
  return POSE_KEYPOINTS.map((name) => [base[name]![0], base[name]![1], conf]);
}

function track(frames: PoseTrack['frames'], aspect = 1): PoseTrack {
  return PoseTrackSchema.parse({
    version: 1,
    source: { file: 'clip.mp4', from: 0, to: frames.length / 10, fps: 10, width: Math.round(1000 * aspect), height: 1000, aspect },
    engine: { name: 'rtmlib', mode: 'balanced', upscale: 1 },
    person: 'largest',
    smoothing: { filter: 'one-euro', minCutoff: 1.2, beta: 0.4, dCutoff: 1, maxGap: 0.3 },
    keypoints: [...POSE_KEYPOINTS],
    frames,
    quality: {
      frames: frames.length, detected: frames.length, interpolated: 0, missing: 0, detectionRate: 1, meanConfidence: 0.9,
      limbs: { head: 0.9, torso: 0.9 }, jitterRaw: 0.8, jitter: 0.3, peopleMax: 1, severalPeople: 0, cuts: [], gaps: [],
      warnings: [],
    },
  });
}

const temporary: string[] = [];
afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('pose track schema', () => {
  it('accepts a track and exports from the browser entry', () => {
    const t = track([{ t: 0, k: figure(0) }, { t: 0.1, k: null }]);
    expect(t.frames[1]!.k).toBeNull();
    expect(browser.samplePoseTrack).toBe(samplePoseTrack);
    expect(browser.PoseTrackSchema).toBe(PoseTrackSchema);
  });

  it('rejects wrong keypoint counts, falling times, and out-of-range confidence', () => {
    const good = track([{ t: 0, k: figure(0) }, { t: 0.1, k: figure(0) }]);
    const shortFrame = { ...good, frames: [{ t: 0, k: figure(0).slice(0, 5) }] };
    expect(() => parsePoseTrack(shortFrame)).toThrow(ValidationError);
    const backwards = { ...good, frames: [{ t: 0.2, k: figure(0) }, { t: 0.1, k: figure(0) }] };
    expect(() => parsePoseTrack(backwards)).toThrow(/Invalid pose track/);
    const badConf = { ...good, frames: [{ t: 0, k: figure(0, 1.5) }] };
    expect(PoseTrackSchema.safeParse(badConf).success).toBe(false);
  });
});

describe('samplePoseTrack', () => {
  const t = track([
    { t: 0, k: figure(0) },
    { t: 0.1, k: figure(0.1) },
    { t: 0.2, k: figure(0.2) },
    { t: 0.3, k: null },
    { t: 0.4, k: figure(0.2) },
  ]);

  it('interpolates linearly between frames and derives neck and mid-hip', () => {
    const sample = samplePoseTrack(t, 0.05)!;
    expect(sample.left_wrist!.x).toBeCloseTo(0.67, 6);
    expect(sample.neck).toEqual({ x: 0.5, y: 0.3, c: 0.9 });
    expect(sample.mid_hip!.y).toBeCloseTo(0.5, 6);
  });

  it('clamps outside the track without loop and wraps with loop', () => {
    expect(poseTrackDuration(t)).toBeCloseTo(0.5, 6);
    expect(samplePoseTrack(t, -1)!.left_wrist!.x).toBeCloseTo(0.62, 6);
    expect(samplePoseTrack(t, 10)!.left_wrist!.x).toBeCloseTo(0.82, 6);
    // 0.72 s loops to 0.22: between frame 0.2 and the missing frame 0.3, nearer to 0.2.
    expect(samplePoseTrack(t, 0.72, { loop: true })!.left_wrist!.x).toBeCloseTo(0.82, 6);
    // Between the last frame (0.4) and the wrap to frame 0 (at 0.5).
    expect(samplePoseTrack(t, 0.45, { loop: true })!.left_wrist!.x).toBeCloseTo(0.72, 6);
  });

  it('gates low-confidence keypoints and missing frames', () => {
    const low = track([{ t: 0, k: figure(0, 0.2) }, { t: 0.1, k: null }, { t: 0.2, k: null }]);
    expect(samplePoseTrack(low, 0)!.nose).toBeNull();
    expect(samplePoseTrack(low, 0, { minConfidence: 0.1 })!.nose).not.toBeNull();
    expect(samplePoseTrack(low, 0.15)).toBeNull();
    // Just after the missing frame the nearer side is unseen: null, not a held stale point.
    expect(samplePoseTrack(t, 0.33)!.left_wrist).toBeNull();
  });
});

describe('relative pose and bone angles', () => {
  it('measures joints from mid-hip in torso lengths with the aspect undone', () => {
    const wide = track([{ t: 0, k: figure(0) }], 16 / 9);
    const rel = samplePoseTrackRelative(wide, 0)!;
    expect(rel.torso).toBeCloseTo(0.2, 6);
    expect(rel.points.mid_hip).toEqual({ x: 0, y: 0, c: 0.9 });
    expect(rel.points.neck!.y).toBeCloseTo(-1, 6);
    expect(rel.points.nose!.y).toBeCloseTo(-1.5, 6);
    // Ankle at x 0.53 vs root 0.5, scaled by 16/9 and divided by the torso.
    expect(rel.points.left_ankle!.x).toBeCloseTo((0.03 * 16) / 9 / 0.2, 6);
  });

  it('gives bone angles in screen coordinates', () => {
    const angles = poseBoneAngles(track([{ t: 0, k: figure(0) }]), samplePoseTrack(track([{ t: 0, k: figure(0) }]), 0));
    expect(angles.torso).toBeCloseTo(-Math.PI / 2, 6); // mid-hip up to the neck
    expect(angles.leftShin).toBeCloseTo(Math.PI / 2, 6); // knee down to the ankle
    expect(angles.shoulders).toBeCloseTo(0, 6);
    expect(poseBoneAngles(track([{ t: 0, k: figure(0) }]), null).head).toBeNull();
  });
});

describe('pose-extract command', () => {
  it('parses clock times and person rules', () => {
    expect(parseClock('12.5', '--from')).toBe(12.5);
    expect(parseClock('1:05.5', '--from')).toBe(65.5);
    expect(parseClock('0:01:05', '--to')).toBe(65);
    expect(() => parseClock('1:75', '--to')).toThrow(ValidationError);
    expect(() => parseClock('-3', '--from')).toThrow(ValidationError);
    expect(parsePersonRule(undefined)).toBe('largest');
    expect(parsePersonRule('Center')).toBe('center');
    expect(parsePersonRule('2')).toBe('2');
    expect(() => parsePersonRule('0')).toThrow(ValidationError);
  });

  it('runs the extractor with uv in scripts/pose and caches models in the workspace', () => {
    const call = extractorCall('/ws', {
      clip: '/clips/a.mp4', output: '/out/a.json', from: 1, to: 3, person: 'center', preview: '/out/a.preview.mp4',
      ffmpeg: '/bin/ffmpeg', mode: 'balanced', device: 'cpu',
    });
    expect(call.command).toBe('uv');
    expect(call.args.slice(0, 7)).toEqual(['run', '--project', '/ws/scripts/pose', '--extra', 'engine', 'python', '/ws/scripts/pose/extract.py']);
    expect(call.args).toEqual(expect.arrayContaining(['--model-dir', '/ws/.cache/pose/models', '--from', '1', '--to', '3', '--preview', '/out/a.preview.mp4', '--ffmpeg', '/bin/ffmpeg']));
  });

  it('writes into assets/poses/<name>.json and reports the quality', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'coreslopper-pose-'));
    temporary.push(dir);
    const project = join(dir, 'demo');
    cpSync(join(process.cwd(), 'projects/demo'), project, {
      recursive: true,
      filter: (source) => !/\/(assets|renders|\.cache)(\/|$)/.test(source),
    });
    const clip = join(dir, 'clip.mp4');
    writeFileSync(clip, 'not really a video');
    const lines: string[] = [];
    let seen: string[] = [];
    const result = await poseExtract(
      project,
      { input: clip, name: 'dance-a', from: '0:01', to: '2.5', person: '2', preview: true },
      {
        root: dir,
        ffmpeg: () => 'ffmpeg',
        log: (line) => lines.push(line),
        runExtractor: async (call) => {
          seen = call.args;
          const output = call.args[call.args.indexOf('--output') + 1]!;
          const t = track([{ t: 0, k: figure(0) }, { t: 0.1, k: null }]);
          t.quality.warnings = ['camera cut(s) at 0.10 s'];
          writeFileSync(output, JSON.stringify(t));
        },
      },
    );
    expect(result.output).toBe(join(project, 'assets', 'poses', 'dance-a.json'));
    expect(result.preview).toBe(join(project, 'assets', 'poses', 'dance-a.preview.mp4'));
    expect(seen).toEqual(expect.arrayContaining(['--from', '1', '--to', '2.5', '--person', '2']));
    expect(existsSync(result.output)).toBe(true);
    expect(JSON.parse(readFileSync(result.output, 'utf8')).version).toBe(1);
    expect(lines.join('\n')).toMatch(/detected 2 \(100%\)/);
    expect(lines.join('\n')).toMatch(/⚠ camera cut/);
  });

  it('refuses bad names, missing clips, empty windows, and a broken track', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'coreslopper-pose-'));
    temporary.push(dir);
    const clip = join(dir, 'clip.mp4');
    writeFileSync(clip, 'x');
    const out = join(dir, 'out', 'a.json');
    const deps = { root: dir, log: () => undefined };
    await expect(poseExtract(dir, { input: clip, name: 'Bad Name', out }, deps)).rejects.toThrow(/--name/);
    await expect(poseExtract(dir, { input: join(dir, 'nope.mp4'), name: 'a', out }, deps)).rejects.toThrow(/Missing clip/);
    await expect(poseExtract(dir, { input: clip, name: 'a', out, from: '5', to: '4' }, deps)).rejects.toThrow(/after --from/);
    await expect(
      poseExtract(dir, { input: clip, name: 'a', out }, {
        ...deps,
        runExtractor: async () => {
          const { mkdirSync } = await import('node:fs');
          mkdirSync(join(dir, 'out'), { recursive: true });
          writeFileSync(out, JSON.stringify({ version: 1, frames: [] }));
        },
      }),
    ).rejects.toThrow(/Invalid/);
  });

  it('formats a report without warnings', () => {
    const text = formatPoseReport(track([{ t: 0, k: figure(0) }]));
    expect(text).toMatch(/✔ no warnings/);
    expect(text).toMatch(/jitter {3}0\.80 raw -> 0\.30 smoothed/);
  });
});
