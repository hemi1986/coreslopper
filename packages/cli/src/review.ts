import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { ValidationError, loadProject, repoRoot } from '@coreslopper/core';
import { masterFormatId } from './render.js';
import { commandExists } from './tools.js';

export interface ReviewOptions {
  projectDir: string;
  video?: string;
  format?: string;
  frame?: number;
}

/**
 * The render to review: `--video` if given, else the newer of
 * `renders/preview-<format>.mp4` and `renders/<format>.mp4`.
 */
export function reviewVideoPath(renders: string, format: string, video?: string): string {
  if (video !== undefined) {
    const path = resolve(video);
    if (!existsSync(path)) throw new ValidationError(`The video ${path} does not exist.`);
    return path;
  }
  const candidates = [join(renders, `preview-${format}.mp4`), join(renders, `${format}.mp4`)].filter((path) => existsSync(path));
  if (candidates.length === 0) {
    throw new ValidationError(`No render of ${format} in ${renders}. Render a preview first, or pass --video <file>.`);
  }
  return candidates.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]!;
}

/** Review notes of a video: `review/notes/<video-stem>.json`, in the project even when `renders/` is linked to a media drive. */
export function reviewNotesPath(reviewDir: string, video: string): string {
  return join(reviewDir, 'notes', `${basename(video, extname(video))}.json`);
}

/** Open the review player (`scripts/review-player`) on a render; blocks until the window closes. */
export async function openReview(options: ReviewOptions): Promise<void> {
  const project = await loadProject(options.projectDir);
  const format = options.format ?? masterFormatId(project.config);
  const video = reviewVideoPath(project.paths.renders, format, options.video);
  const notes = reviewNotesPath(project.paths.review, video);
  if (!commandExists('uv')) throw new ValidationError('uv is missing; the review player runs in its own uv environment. Run `npx coreslopper doctor`.');

  const playerDir = join(repoRoot(), 'scripts', 'review-player');
  const args = ['run', '--project', playerDir, 'python', join(playerDir, 'review_player.py'), video, '--notes', notes];
  if (options.frame !== undefined) args.push('--frame', String(options.frame));
  console.log(`→ Reviewing ${video}`);
  console.log(`  Notes: ${notes}`);
  const result = spawnSync('uv', args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new ValidationError(`The review player exited with code ${result.status}.`);
}
