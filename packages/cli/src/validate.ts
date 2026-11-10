import {
  ValidationError,
  assertTimingMatchesScript,
  loadModelsConfig,
  loadProject,
  resolveStoryboard,
  validateScript,
  writeEffectiveTiming,
  type EpisodeContext,
  type LoadedProject,
  type ResolvedStoryboard,
  type State,
  type ProjectConfig,
} from '@coreslopper/core';
import { basename } from 'node:path';

/** state.json and project.yaml must agree on the project kind; a mismatch is an error, not a guess. */
export function assertKindMatches(state: Pick<State, 'kind'>, config: Pick<ProjectConfig, 'kind'>): void {
  const stateKind = state.kind ?? 'music-video';
  if (stateKind !== config.kind) {
    throw new ValidationError(
      `state.json is for a ${stateKind} project, but project.yaml says kind "${config.kind}". Fix project.yaml or recreate state.json.`,
    );
  }
}

/**
 * The episode checks: the canon is complete and belongs to the series named in
 * project.yaml, the script is valid against it, and timing was built from it.
 */
function validateEpisode(project: LoadedProject): EpisodeContext {
  const { config, paths, series, sets, script, characters, effectiveTiming } = project;
  if (series && series.slug !== config.series) {
    throw new ValidationError(
      `${paths.seriesConfig} has slug "${series.slug}", but project.yaml names series "${config.series}".`,
    );
  }
  if (!sets) throw new ValidationError(`sets.yaml is missing in the series canon ${paths.series}.`);
  if (!characters) throw new ValidationError(`characters.yaml is missing in the series canon ${paths.series}.`);
  if (!script) throw new ValidationError(`script.yaml is missing in ${paths.root}. Finish the script stage first.`);
  validateScript(script, { characters, sets });
  if (effectiveTiming) assertTimingMatchesScript(script, effectiveTiming);
  return { script, sets };
}

export interface ValidatedProject {
  project: LoadedProject;
  resolved: ResolvedStoryboard;
}

export async function validateProject(projectDir: string, options: { write?: boolean } = {}): Promise<ValidatedProject> {
  const project = await loadProject(projectDir);
  const { config, effectiveTiming, storyboard, style, characters, paths } = project;
  const episode = config.kind === 'episode';
  const canon = episode ? `the series canon ${paths.series}` : paths.root;

  assertKindMatches(project.state, config);
  const episodeContext = episode ? validateEpisode(project) : undefined;

  if (!effectiveTiming) {
    throw new ValidationError(
      `timing.json is missing in ${paths.root}. Run the ${episode ? 'episode-track' : 'audio-analysis'} stage before validating the storyboard.`,
    );
  }
  if (!storyboard) throw new ValidationError(`storyboard.yaml is missing in ${paths.root}.`);
  if (!style) throw new ValidationError(`style.yaml is missing in ${canon}.`);
  if (!characters) throw new ValidationError(`characters.yaml is missing in ${canon}.`);

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
    1,
    episodeContext,
  );

  if (options.write !== false) {
    await writeEffectiveTiming(project);
  }

  return { project, resolved };
}
