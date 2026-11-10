import { join } from 'node:path';
import { ValidationError, buildSrt, writeTextAtomic } from '@coreslopper/core';
import { validateProject } from './validate.js';

/** The path of an episode's English subtitles: `renders/<slug>.en.srt`. */
export function subtitlesPath(renders: string, slug: string): string {
  return join(renders, `${slug}.en.srt`);
}

/** Write the English subtitles of an episode from its script and effective timing. */
export async function writeSubtitles(projectDir: string): Promise<string> {
  const { project } = await validateProject(projectDir);
  if (project.config.kind !== 'episode' || !project.script || !project.effectiveTiming) {
    throw new ValidationError('Subtitles come from an episode script; this project has none.');
  }
  const path = subtitlesPath(project.paths.renders, project.config.slug);
  await writeTextAtomic(path, buildSrt(project.script, project.effectiveTiming));
  console.log(`Subtitles written to ${path}`);
  return path;
}
