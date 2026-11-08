import {
  ValidationError,
  loadModelsConfig,
  loadProject,
  resolveStoryboard,
  writeEffectiveTiming,
  type LoadedProject,
  type ResolvedStoryboard,
} from '@coreslopper/core';
import { basename } from 'node:path';

export interface ValidatedProject {
  project: LoadedProject;
  resolved: ResolvedStoryboard;
}

export async function validateProject(projectDir: string, options: { write?: boolean } = {}): Promise<ValidatedProject> {
  const project = await loadProject(projectDir);
  const { config, effectiveTiming, storyboard, style, characters, paths } = project;

  if (!effectiveTiming) {
    throw new ValidationError(
      `timing.json is missing in ${paths.root}. Run the audio-analysis stage before validating the storyboard.`,
    );
  }
  if (!storyboard) throw new ValidationError(`storyboard.yaml is missing in ${paths.root}.`);
  if (!style) throw new ValidationError(`style.yaml is missing in ${paths.root}.`);
  if (!characters) throw new ValidationError(`characters.yaml is missing in ${paths.root}.`);

  const expectedSlug = basename(paths.root);
  if (config.slug !== expectedSlug) {
    throw new ValidationError(
      `project.yaml slug "${config.slug}" does not match the project folder "${expectedSlug}".`,
    );
  }

  if (Math.abs(project.state.budget.totalUsd - config.budget_usd) > 1e-9) {
    throw new ValidationError(
      `state.json budget (${project.state.budget.totalUsd}) does not match project.yaml budget_usd (${config.budget_usd}).`,
    );
  }

  try {
    await loadModelsConfig();
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new ValidationError('config/models.yaml is invalid', error.details);
    }
    throw error;
  }

  const resolved = resolveStoryboard(
    storyboard,
    effectiveTiming,
    style,
    characters,
    config.formats.master.fps,
  );

  if (options.write !== false) {
    await writeEffectiveTiming(project);
  }

  return { project, resolved };
}
