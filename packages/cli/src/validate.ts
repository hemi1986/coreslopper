import {
  ValidationError,
  assertTimingMatchesScript,
  loadModelsConfig,
  providerForRole,
  resolveModelRole,
  loadProject,
  lineCues,
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
import { scriptCanon, scriptLibrarySounds } from './script-canon.js';

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
function validateEpisode(project: LoadedProject, lipsyncMaxDuration?: number): EpisodeContext {
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
  return { script, sets, lipsyncMaxDuration, lipsyncSecondsMax: series?.limits.lipsync_seconds_max };
}

export interface ValidatedProject {
  project: LoadedProject;
  resolved: ResolvedStoryboard;
}

/** `maxDuration` of `video.lipsync` for the project's lip-sync provider, from config/models.yaml. */
async function lipsyncMaxDuration(config: ProjectConfig): Promise<number | undefined> {
  const role = (await loadModelsConfig()).roles['video.lipsync'];
  if (!role) return undefined;
  const override = config.models['video.lipsync'];
  return resolveModelRole(
    role,
    providerForRole(config, 'video.lipsync'),
    override && typeof override === 'object' && !Array.isArray(override) ? (override as Record<string, unknown>) : {},
    'video.lipsync',
  ).maxDuration;
}

export async function validateProject(projectDir: string, options: { write?: boolean } = {}): Promise<ValidatedProject> {
  const project = await loadProject(projectDir);
  const { config, effectiveTiming, storyboard, style, characters, paths } = project;
  const episode = config.kind === 'episode';
  const canon = episode ? `the series canon ${paths.series}` : paths.root;

  assertKindMatches(project.state, config);
  const episodeContext = episode ? validateEpisode(project, await lipsyncMaxDuration(config)) : undefined;
  // A meme's script against the sound library and, once style-character wrote them, its own bibles (HS-262).
  // After that stage the bibles must exist, so every speaker and set is checked against them (ST-013).
  if (config.kind === 'meme' && project.state.stages['style-character']?.status === 'done') {
    if (!characters) throw new ValidationError(`characters.yaml is missing in ${paths.root}, but the style-character stage is done.`);
    if (!project.sets) throw new ValidationError(`sets.yaml is missing in ${paths.root}, but the style-character stage is done.`);
  }
  if (config.kind === 'meme' && project.script) validateScript(project.script, await scriptCanon(project, project.script));
  // A meme's `cue` anchors resolve against the sound lines of its script and the cues in the library.
  const cues =
    config.kind === 'meme' && project.script
      ? lineCues(project.script, await scriptLibrarySounds(project.paths.root, project.script))
      : undefined;

  if (!effectiveTiming) {
    throw new ValidationError(
      `timing.json is missing in ${paths.root}. Run the ${episode || config.kind === 'meme' ? 'episode-track' : 'audio-analysis'} stage before validating the storyboard.`,
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
    project.sets,
    cues,
  );

  if (options.write !== false) {
    await writeEffectiveTiming(project);
  }

  return { project, resolved };
}
