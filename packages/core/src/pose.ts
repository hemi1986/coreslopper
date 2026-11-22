/**
 * Pose tracks: the moves of one person in a reference clip as normalized COCO-17 keypoints
 * (`assets/poses/<id>.json`, written by `pose-extract`). A pose track is a motion source only;
 * it holds no pixels or sound of the clip. Browser-safe: Remotion components sample tracks with
 * these helpers.
 */
import { z } from 'zod';
import { ValidationError } from './errors.js';

export const POSE_KEYPOINTS = [
  'nose',
  'left_eye',
  'right_eye',
  'left_ear',
  'right_ear',
  'left_shoulder',
  'right_shoulder',
  'left_elbow',
  'right_elbow',
  'left_wrist',
  'right_wrist',
  'left_hip',
  'right_hip',
  'left_knee',
  'right_knee',
  'left_ankle',
  'right_ankle',
] as const;

export type PoseKeypoint = (typeof POSE_KEYPOINTS)[number];
/** COCO-17 plus the two points a rig hangs from: mid-shoulder (`neck`) and mid-hip. */
export type PoseJoint = PoseKeypoint | 'neck' | 'mid_hip';

/** Bones for drawing a skeleton. */
export const POSE_SKELETON: ReadonlyArray<readonly [PoseJoint, PoseJoint]> = [
  ['left_ankle', 'left_knee'],
  ['left_knee', 'left_hip'],
  ['right_ankle', 'right_knee'],
  ['right_knee', 'right_hip'],
  ['left_hip', 'right_hip'],
  ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'],
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_elbow'],
  ['right_shoulder', 'right_elbow'],
  ['left_elbow', 'left_wrist'],
  ['right_elbow', 'right_wrist'],
  ['nose', 'left_eye'],
  ['nose', 'right_eye'],
  ['left_eye', 'left_ear'],
  ['right_eye', 'right_ear'],
];

/** The segments a cut-out rig rotates: from the parent joint to the child joint. */
export const POSE_BONES = {
  torso: ['mid_hip', 'neck'],
  head: ['neck', 'nose'],
  shoulders: ['right_shoulder', 'left_shoulder'],
  hips: ['right_hip', 'left_hip'],
  leftUpperArm: ['left_shoulder', 'left_elbow'],
  leftForearm: ['left_elbow', 'left_wrist'],
  rightUpperArm: ['right_shoulder', 'right_elbow'],
  rightForearm: ['right_elbow', 'right_wrist'],
  leftThigh: ['left_hip', 'left_knee'],
  leftShin: ['left_knee', 'left_ankle'],
  rightThigh: ['right_hip', 'right_knee'],
  rightShin: ['right_knee', 'right_ankle'],
} as const satisfies Record<string, readonly [PoseJoint, PoseJoint]>;

export type PoseBone = keyof typeof POSE_BONES;

const coord = z.number();
/** x, y normalized to the source frame (0-1, a little outside when a limb leaves the frame) and confidence 0-1. */
const KeypointSchema = z.tuple([coord.min(-1).max(2), coord.min(-1).max(2), coord.min(0).max(1)]);

export const PoseFrameSchema = z.object({
  /** Seconds from the window start. */
  t: z.number().nonnegative(),
  /** One entry per name in `keypoints`, or null when the person is missing in this frame. */
  k: z.array(KeypointSchema).nullable(),
  /** Filled in between two found frames, not seen. */
  interpolated: z.literal(true).optional(),
});

export const PoseTrackSchema = z
  .object({
    version: z.literal(1),
    source: z.object({
      /** File name of the reference clip (no path). */
      file: z.string().min(1),
      /** The window of the clip, in clip seconds. */
      from: z.number().nonnegative(),
      to: z.number().positive(),
      fps: z.number().positive(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      aspect: z.number().positive(),
    }),
    engine: z
      .object({
        name: z.string().min(1),
        mode: z.string().optional(),
        detector: z.string().optional(),
        pose: z.string().optional(),
        device: z.string().optional(),
        upscale: z.number().positive().optional(),
      })
      .loose(),
    /** The person rule: largest, center, or the n-th person from the left. */
    person: z.string().min(1),
    smoothing: z
      .object({
        filter: z.literal('one-euro'),
        minCutoff: z.number().positive(),
        beta: z.number().nonnegative(),
        dCutoff: z.number().positive(),
        /** Forward and backward pass averaged: no lag. */
        zeroPhase: z.boolean().optional(),
        /** Gaps up to this many seconds were interpolated. */
        maxGap: z.number().nonnegative(),
      })
      .loose(),
    keypoints: z.array(z.enum(POSE_KEYPOINTS)).length(POSE_KEYPOINTS.length),
    frames: z.array(PoseFrameSchema).min(1),
    quality: z
      .object({
        frames: z.number().int().nonnegative(),
        detected: z.number().int().nonnegative(),
        interpolated: z.number().int().nonnegative(),
        missing: z.number().int().nonnegative(),
        detectionRate: z.number().min(0).max(1),
        meanConfidence: z.number().min(0).max(1),
        limbs: z.record(z.string(), z.number()),
        /** Mean frame-to-frame acceleration of visible keypoints in percent of the frame height, before and after smoothing. */
        jitterRaw: z.number().nonnegative(),
        jitter: z.number().nonnegative(),
        peopleMax: z.number().int().nonnegative(),
        severalPeople: z.number().min(0).max(1),
        /** Window seconds where a camera cut was detected. */
        cuts: z.array(z.number().nonnegative()),
        gaps: z.array(z.tuple([z.number(), z.number()])),
        warnings: z.array(z.string()),
        seconds: z.number().nonnegative().optional(),
      })
      .loose(),
  })
  .superRefine((track, ctx) => {
    let previous = -Infinity;
    track.frames.forEach((frame, index) => {
      if (frame.t <= previous) {
        ctx.addIssue({ code: 'custom', path: ['frames', index, 't'], message: 'frame times must increase' });
      }
      previous = frame.t;
      if (frame.k && frame.k.length !== track.keypoints.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['frames', index, 'k'],
          message: `expected ${track.keypoints.length} keypoints, got ${frame.k.length}`,
        });
      }
    });
  });

export type PoseTrack = z.infer<typeof PoseTrackSchema>;
export type PoseFrame = z.infer<typeof PoseFrameSchema>;

/** Validate a parsed pose track file; throws a ValidationError naming the first problems. */
export function parsePoseTrack(data: unknown, label = 'pose track'): PoseTrack {
  const result = PoseTrackSchema.safeParse(data);
  if (result.success) return result.data;
  throw new ValidationError(
    `Invalid ${label}`,
    result.error.issues.slice(0, 8).map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
  );
}

export interface PosePoint {
  /** Normalized to the source frame width (0-1). */
  x: number;
  /** Normalized to the source frame height (0-1). */
  y: number;
  /** Confidence 0-1. */
  c: number;
}

export type PoseSample = Record<PoseJoint, PosePoint | null>;

export interface SamplePoseOptions {
  /** Wrap around the end of the track instead of holding the last frame. */
  loop?: boolean;
  /** A keypoint below this confidence counts as unseen (null). Default 0.3. */
  minConfidence?: number;
}

/** Length of a track in seconds: one frame past the last frame time, so a loop wraps cleanly. */
export function poseTrackDuration(track: PoseTrack): number {
  const last = track.frames[track.frames.length - 1]!;
  return last.t + 1 / track.source.fps;
}

function point(frame: PoseFrame | undefined, index: number, gate: number): PosePoint | null {
  const entry = frame?.k?.[index];
  if (!entry || entry[2] < gate) return null;
  return { x: entry[0], y: entry[1], c: entry[2] };
}

function lerpPoint(a: PosePoint | null, b: PosePoint | null, w: number): PosePoint | null {
  if (a && b) return { x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w, c: a.c + (b.c - a.c) * w };
  // One side unseen: take the seen side only while it is the nearer frame.
  if (a) return w <= 0.5 ? a : null;
  if (b) return w >= 0.5 ? b : null;
  return null;
}

function midpoint(a: PosePoint | null, b: PosePoint | null): PosePoint | null {
  if (!a || !b) return null;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, c: Math.min(a.c, b.c) };
}

/**
 * The pose at `seconds` from the track start, linearly interpolated between the two nearest
 * frames. Keypoints below `minConfidence` are null, so a rig can hold or hide that limb.
 * Returns null when the person is missing on both sides of `seconds`.
 */
export function samplePoseTrack(track: PoseTrack, seconds: number, options: SamplePoseOptions = {}): PoseSample | null {
  const gate = options.minConfidence ?? 0.3;
  const frames = track.frames;
  const duration = poseTrackDuration(track);
  let t = Number.isFinite(seconds) ? seconds : 0;
  if (options.loop) t = ((t % duration) + duration) % duration;
  t = Math.max(frames[0]!.t, t);

  // Binary search for the last frame at or before t.
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid]!.t <= t) lo = mid;
    else hi = mid - 1;
  }
  const a = frames[lo]!;
  let b: PoseFrame | undefined = frames[lo + 1];
  let span = b ? b.t - a.t : 0;
  if (!b && options.loop && frames.length > 1) {
    b = frames[0];
    span = duration - a.t;
  }
  const w = b && span > 0 ? Math.min(1, Math.max(0, (t - a.t) / span)) : 0;
  if (!a.k && (!b || !b.k)) return null;

  const sample = {} as PoseSample;
  track.keypoints.forEach((name, index) => {
    sample[name] = lerpPoint(point(a, index, gate), b ? point(b, index, gate) : null, w);
  });
  sample.neck = midpoint(sample.left_shoulder, sample.right_shoulder);
  sample.mid_hip = midpoint(sample.left_hip, sample.right_hip);
  return sample;
}

export interface RelativePose {
  /** Torso length (mid-hip to neck) in source frame heights; the unit of `points`. */
  torso: number;
  /** The root (mid-hip) in normalized source coordinates. */
  root: PosePoint;
  /**
   * Every joint relative to the root, in torso lengths, x to the right and y down, with the
   * source aspect ratio undone (one unit is the same length on both axes).
   */
  points: Record<PoseJoint, { x: number; y: number; c: number } | null>;
}

/**
 * Root-relative pose: joints relative to mid-hip, measured in torso lengths. A rig with other
 * proportions (a big head on a small body) scales by its own torso length and moves its root.
 * Returns null without both hips and shoulders.
 */
export function relativePose(track: PoseTrack, sample: PoseSample | null): RelativePose | null {
  if (!sample?.mid_hip || !sample.neck) return null;
  const aspect = track.source.aspect;
  const root = sample.mid_hip;
  const torso = Math.hypot((sample.neck.x - root.x) * aspect, sample.neck.y - root.y);
  if (torso <= 1e-6) return null;
  const points = {} as RelativePose['points'];
  for (const name of Object.keys(sample) as PoseJoint[]) {
    const p = sample[name];
    points[name] = p ? { x: ((p.x - root.x) * aspect) / torso, y: (p.y - root.y) / torso, c: p.c } : null;
  }
  return { torso, root, points };
}

/** `samplePoseTrack` and `relativePose` in one call. */
export function samplePoseTrackRelative(track: PoseTrack, seconds: number, options: SamplePoseOptions = {}): RelativePose | null {
  return relativePose(track, samplePoseTrack(track, seconds, options));
}

/**
 * Angle of every bone in radians, aspect-corrected: 0 points right, π/2 down (screen
 * coordinates, as CSS `rotate()` turns). Null where a joint of the bone is unseen. A cut-out rig
 * rotates each part by its bone angle minus the angle the part is drawn at.
 */
export function poseBoneAngles(track: PoseTrack, sample: PoseSample | null): Record<PoseBone, number | null> {
  const aspect = track.source.aspect;
  const angles = {} as Record<PoseBone, number | null>;
  for (const [bone, [from, to]] of Object.entries(POSE_BONES) as [PoseBone, readonly [PoseJoint, PoseJoint]][]) {
    const a = sample?.[from];
    const b = sample?.[to];
    angles[bone] = a && b ? Math.atan2(b.y - a.y, (b.x - a.x) * aspect) : null;
  }
  return angles;
}
