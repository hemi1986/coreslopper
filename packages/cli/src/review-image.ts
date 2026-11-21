import { spawn } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { appendFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { ValidationError, ensureDir, loadProject } from '@coreslopper/core';
import { clipFrames, imagePsnr } from './image-ops.js';

/**
 * One art-director verdict on one image, as written to `assets/review/verdicts.jsonl`.
 * The review runs headless (`claude -p --agent art-director`) in its own context, so the
 * caller (a stage runner in a generate → review → fix loop) only ever sees this line.
 */
export interface ImageVerdict {
  image: string;
  /** Shot id for a keyframe or clip frame, or a label like `state:hf7/walkman-shared` for a reference. */
  subject: string;
  attempt: number;
  verdict: 'pass' | 'fail';
  score: number;
  issues: string[];
  fix_prompt: string;
  reviewedAt: string;
  /** A clip review: the clip the frames came from. */
  clip?: string;
  /** A clip review: PSNR in dB of the first frame against the start keyframe (see START_DRIFT_DB). */
  startFramePsnr?: number;
}

/** Below this PSNR the first frame of a clip no longer shows its start keyframe; the reviewer is told to compare them. */
export const START_DRIFT_DB = 20;

/**
 * The only reasons to fail an image. A loop that fails on taste never converges, so every
 * other finding is a note and the image passes.
 */
export const BLOCKING_DEFECTS =
  'a wrong or drifted character identity; a wrong number of arms, hands, legs, or other anatomy; a character in the wrong continuity state, a prop or cable attached wrong, or something physically impossible; a missing or wrong prop, character, or plate the shot names; misspelled screen text; a break with an approved neighbouring frame in layout, facing, or design; a recognizable real person or trademark';

export const VERDICT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    score: { type: 'number', minimum: 0, maximum: 10 },
    issues: { type: 'array', items: { type: 'string' } },
    fix_prompt: { type: 'string' },
  },
  required: ['verdict', 'score', 'issues', 'fix_prompt'],
  additionalProperties: false,
} as const;

export interface ReviewImageOptions {
  /** Image(s) to judge. */
  images?: string[];
  /** A clip to judge instead: its first, middle, and last frame are extracted and reviewed. */
  clip?: string;
  /** The keyframe a clip starts from; default `assets/keyframes/<shot>.png` (or its chain start frame). */
  startFrame?: string;
  /** Replaces the frame extraction of a clip review; used by tests. */
  frames?: (clip: string, directory: string) => Promise<string[]>;
  shot?: string;
  /** Reference under review instead of a shot, e.g. `state:hf7/walkman-shared`, `plate:house-ruin/yard-wide`, `prop:scarf`. */
  ref?: string;
  attempt?: number;
  /** Extra checks for this image, e.g. the issues a previous attempt failed on. */
  focus?: string;
  /** Replaces the `claude` call; used by tests. */
  runner?: (prompt: string) => Promise<string>;
}

export function buildReviewPrompt(input: {
  projectDir: string;
  images: string[];
  shot?: string;
  ref?: string;
  neighbours: string[];
  focus?: string;
  attempt?: number;
  /** A clip review: the clip, its start keyframe, and how far the first frame is from it. */
  clip?: { path: string; startFrame?: string; psnr?: number };
}): string {
  const lines = [
    input.clip
      ? `Review the clip ${input.clip.path} of ${input.projectDir} by exactly these frames (first, middle, last): ${input.images.join(', ')}.`
      : `Review exactly these image(s) of ${input.projectDir}: ${input.images.join(', ')}.`,
  ];
  if (input.clip?.startFrame) {
    lines.push(
      input.clip.psnr !== undefined && input.clip.psnr < START_DRIFT_DB
        ? `The clip starts from the keyframe ${input.clip.startFrame}, but its first frame differs from it (PSNR ${input.clip.psnr.toFixed(1)} dB): compare the two, and fail the clip when the framing, the set, or a character's design changed.`
        : `The clip starts from the approved keyframe ${input.clip.startFrame}; judge what the motion did to it, not the keyframe itself.`,
    );
  }
  if (input.shot) {
    lines.push(
      `They belong to storyboard shot ${input.shot}: read that shot in ${input.projectDir}/storyboard.yaml (keyframe prompt, refs.plate, refs.props, refs.states) and check the image against it and against those reference images.`,
    );
  }
  if (input.ref) {
    lines.push(
      `The image is the continuity reference ${input.ref}: check it against its entry in the canon (characters.yaml states, sets.yaml plates or props) and the character sheets.`,
    );
  }
  if (input.neighbours.length > 0) {
    lines.push(`Neighbouring frames already approved, for continuity: ${input.neighbours.join(', ')}.`);
  }
  lines.push(
    `Fail only for a blocking defect: ${BLOCKING_DEFECTS}. Everything else (light, texture, small artefacts, taste, anything a clip, crop, or the edit hides) is a note: the verdict stays pass and the note goes into issues prefixed "note:".`,
  );
  if ((input.attempt ?? 1) > 1) {
    lines.push(
      `This is attempt ${input.attempt}, regenerated to fix the previous blocking defects${input.focus ? `: ${input.focus}` : ''}. Check that those are fixed and that no new blocking defect appeared; raise no new notes.`,
    );
  } else if (input.focus) {
    lines.push(`Check in particular: ${input.focus}`);
  }
  lines.push(
    'Judge only these image(s). Answer with the structured verdict: verdict, score 0-10, issues (each "<issue> -> <fix>"), and fix_prompt (a complete corrected edit prompt for the next attempt that fixes only the blocking defects, or "none").',
  );
  return lines.join('\n');
}

/** Extract the verdict from `claude -p --output-format json` output (structured or text fallback). */
export function parseVerdict(raw: string): Pick<ImageVerdict, 'verdict' | 'score' | 'issues' | 'fix_prompt'> {
  let payload: unknown = raw;
  try {
    payload = JSON.parse(raw);
  } catch {
    // plain text output
  }
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (record.is_error === true) {
      throw new ValidationError(`Art-director review failed: ${String(record.result ?? 'unknown error')}`);
    }
    const structured = record.structured_output ?? ('verdict' in record ? record : undefined);
    if (structured && typeof structured === 'object' && 'verdict' in structured) {
      return normalise(structured as Record<string, unknown>);
    }
    if (typeof record.result === 'string') payload = record.result;
  }
  const text = String(payload);
  const embedded = text.match(/\{[\s\S]*"verdict"[\s\S]*\}/);
  if (embedded) {
    try {
      return normalise(JSON.parse(embedded[0]) as Record<string, unknown>);
    } catch {
      // fall through to the text format
    }
  }
  const verdict = text.match(/VERDICT:\s*(pass|fail)/i)?.[1]?.toLowerCase();
  if (!verdict) throw new ValidationError(`No verdict in art-director output: ${text.slice(0, 200)}`);
  const score = Number(text.match(/SCORE:\s*([\d.]+)/i)?.[1] ?? 0);
  const issues = [...text.matchAll(/^\s*-\s+(.+)$/gm)].map((match) => (match[1] ?? '').trim());
  const fix = text.match(/FIX_PROMPT:\s*([\s\S]*)$/i)?.[1]?.trim() ?? 'none';
  return { verdict: verdict as 'pass' | 'fail', score, issues, fix_prompt: fix };
}

/** A fail whose issues are all notes is a pass: only blocking defects stop an image. */
export function notesOnlyPass<T extends { verdict: 'pass' | 'fail'; issues: string[]; fix_prompt: string }>(verdict: T): T {
  if (verdict.verdict === 'fail' && verdict.issues.length > 0 && verdict.issues.every((issue) => /^\W*note\b/i.test(issue))) {
    return { ...verdict, verdict: 'pass', fix_prompt: 'none' };
  }
  return verdict;
}

function normalise(value: Record<string, unknown>): Pick<ImageVerdict, 'verdict' | 'score' | 'issues' | 'fix_prompt'> {
  const verdict = String(value.verdict).toLowerCase();
  if (verdict !== 'pass' && verdict !== 'fail') throw new ValidationError(`Unknown verdict "${verdict}".`);
  return {
    verdict,
    score: Number(value.score ?? 0),
    issues: Array.isArray(value.issues) ? value.issues.map(String) : [],
    fix_prompt: String(value.fix_prompt ?? 'none'),
  };
}

function claudeRunner(cwd: string, extraDirs: string[]): (prompt: string) => Promise<string> {
  return (prompt) =>
    new Promise((resolvePromise, reject) => {
      const bin = process.env.CORESLOPPER_CLAUDE_BIN ?? 'claude';
      const child = spawn(
        bin,
        [
          '-p',
          prompt,
          '--agent',
          'art-director',
          '--output-format',
          'json',
          '--json-schema',
          JSON.stringify(VERDICT_JSON_SCHEMA),
          '--allowedTools',
          'Read,Glob,Grep,Bash',
          ...extraDirs.flatMap((dir) => ['--add-dir', dir]),
        ],
        { cwd, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let out = '';
      let err = '';
      const timeoutMs = Number(process.env.CORESLOPPER_REVIEW_TIMEOUT_MS ?? 10 * 60_000);
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new ValidationError(`Art-director review timed out after ${Math.round(timeoutMs / 1000)} s.`));
      }, timeoutMs);
      child.stdout.on('data', (chunk) => (out += chunk));
      child.stderr.on('data', (chunk) => (err += chunk));
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(new ValidationError(`Could not start "${bin}" for the art-director review: ${error.message}`));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0 && !out.trim()) reject(new ValidationError(`Art-director review exited ${code}: ${err.slice(0, 300)}`));
        else resolvePromise(out);
      });
    });
}

/** Neighbouring keyframes of a shot that exist on disk (previous and next shot). */
function neighbourKeyframes(shotIds: string[], shot: string, keyframesDir: string): string[] {
  const index = shotIds.indexOf(shot);
  if (index < 0) return [];
  return [shotIds[index - 1], shotIds[index + 1]]
    .filter((id): id is string => Boolean(id))
    .map((id) => join(keyframesDir, `${id}.png`))
    .filter((path) => existsSync(path));
}

export async function reviewImage(projectDir: string, options: ReviewImageOptions): Promise<ImageVerdict> {
  if (!options.shot && !options.ref) throw new ValidationError('Pass --shot <id> or --ref <kind:id>.');
  if (options.clip && options.images?.length) throw new ValidationError('Pass --image or --clip, not both.');
  if (!options.clip && !options.images?.length) throw new ValidationError('Pass --image <png> or --clip <mp4>.');
  if (options.clip && !options.shot) throw new ValidationError('A clip review needs --shot <id>.');
  // A series canon (projects/<slug>/series.yaml) has no storyboard; its verdicts go to review/.
  const isSeries = existsSync(join(projectDir, 'series.yaml'));
  if (isSeries && options.shot) throw new ValidationError('A series canon has no shots; pass --ref.');
  const project = isSeries ? undefined : await loadProject(projectDir);
  const root = process.cwd();
  const clip = options.clip ? resolve(options.clip) : undefined;
  if (clip && !existsSync(clip)) throw new ValidationError(`Missing clip: ${clip}`);
  const images = clip
    ? await (options.frames ?? clipFrames)(clip, join(project?.paths.assets ?? projectDir, 'review', 'frames'))
    : (options.images ?? []).map((image) => resolve(image));
  for (const image of images) if (!existsSync(image)) throw new ValidationError(`Missing image: ${image}`);

  const shotIds = (project?.storyboard?.shots ?? []).map((shot) => shot.id);
  if (options.shot && project?.storyboard && !shotIds.includes(options.shot)) {
    throw new ValidationError(`Shot ${options.shot} is not in storyboard.yaml.`);
  }
  const keyframesDir = join(project?.paths.assets ?? projectDir, 'keyframes');
  const neighbours = options.shot ? neighbourKeyframes(shotIds, options.shot, keyframesDir) : [];
  const rel = (path: string) => relative(root, path) || path;
  // A clip is also measured against the keyframe it starts from: a model that lets go of the start frame shows here.
  let startFrame: string | undefined;
  let startFramePsnr: number | undefined;
  if (clip && options.shot) {
    const candidates = options.startFrame
      ? [resolve(options.startFrame)]
      : [join(keyframesDir, 'chain', `${options.shot}-start.png`), join(keyframesDir, `${options.shot}.png`)];
    startFrame = candidates.find((path) => existsSync(path));
    if (options.startFrame && !startFrame) throw new ValidationError(`Missing start frame: ${candidates[0]}`);
    if (startFrame && !options.frames) {
      const psnr = imagePsnr(images[0]!, startFrame);
      startFramePsnr = Number.isFinite(psnr) ? Number(psnr.toFixed(1)) : 99;
    }
  }
  const prompt = buildReviewPrompt({
    projectDir: rel(resolve(projectDir)),
    images: images.map(rel),
    shot: options.shot,
    ref: options.ref,
    neighbours: neighbours.filter((path) => !images.includes(path)).map(rel),
    focus: options.focus,
    attempt: options.attempt,
    ...(clip ? { clip: { path: rel(clip), ...(startFrame ? { startFrame: rel(startFrame) } : {}), ...(startFramePsnr !== undefined ? { psnr: startFramePsnr } : {}) } } : {}),
  });

  // Media linked to CORESLOPPER_MEDIA_DIR lives outside the workspace; let the reviewer read it.
  const extraDirs = [...new Set([...images, ...(startFrame ? [startFrame] : [])].map((image) => dirname(realpathSync(image))))].filter(
    (dir) => relative(root, dir).startsWith('..'),
  );
  const run = options.runner ?? claudeRunner(root, extraDirs);
  let parsed: ReturnType<typeof parseVerdict>;
  try {
    parsed = parseVerdict(await run(prompt));
  } catch (error) {
    // The reviewer sometimes answers in prose without a verdict; one rerun fixes that.
    if (!(error instanceof ValidationError) || !error.message.startsWith('No verdict')) throw error;
    parsed = parseVerdict(await run(prompt));
  }
  const verdict: ImageVerdict = {
    image: rel(images[0] ?? ''),
    subject: options.shot ?? options.ref ?? '',
    attempt: options.attempt ?? 1,
    ...notesOnlyPass(parsed),
    reviewedAt: new Date().toISOString(),
    ...(clip ? { clip: rel(clip) } : {}),
    ...(startFramePsnr !== undefined ? { startFramePsnr } : {}),
  };
  const log = project ? join(project.paths.assets, 'review', 'verdicts.jsonl') : join(projectDir, 'review', 'verdicts.jsonl');
  await ensureDir(dirname(log));
  await appendFile(log, `${JSON.stringify(verdict)}\n`);
  return verdict;
}
