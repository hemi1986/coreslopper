import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import {
  ProjectConfigSchema,
  SeriesSchema,
  SetBibleSchema,
  StateSchema,
  StyleBibleSchema,
  CharacterBibleSchema,
  ValidationError,
  loadProject,
  loadDefaults,
  readJsonFile,
  readYamlFile,
  seriesDir,
  validateScript,
} from '@coreslopper/core';
import { assertKindMatches, validateProject } from './validate.js';

interface ArtifactRoot {
  /** A project folder (has project.yaml) or a series canon folder (has series.yaml). */
  type: 'project' | 'series';
  dir: string;
}

function findArtifactRoot(file: string): ArtifactRoot {
  let current = dirname(resolve(file));
  while (true) {
    if (existsSync(join(current, 'project.yaml'))) return { type: 'project', dir: current };
    if (existsSync(join(current, 'series.yaml'))) return { type: 'series', dir: current };
    const parent = dirname(current);
    if (parent === current) {
      throw new ValidationError(`No project.yaml or series.yaml found above ${file}.`);
    }
    current = parent;
  }
}

/** Canon files of a series: series.yaml, sets.yaml, style.yaml, characters.yaml. */
async function validateSeriesFile(seriesRoot: string, name: string): Promise<string | undefined> {
  if (name === 'series.yaml') {
    const series = await readYamlFile(join(seriesRoot, 'series.yaml'), SeriesSchema);
    if (series.slug !== basename(seriesRoot)) {
      throw new ValidationError(
        `series.yaml slug "${series.slug}" does not match the series folder "${basename(seriesRoot)}".`,
      );
    }
    return 'series';
  }
  if (name === 'sets.yaml') {
    await readYamlFile(join(seriesRoot, 'sets.yaml'), SetBibleSchema);
    return 'sets';
  }
  if (name === 'style.yaml') {
    await readYamlFile(join(seriesRoot, 'style.yaml'), StyleBibleSchema);
    return 'style';
  }
  if (name === 'characters.yaml') {
    await readYamlFile(join(seriesRoot, 'characters.yaml'), CharacterBibleSchema);
    return 'characters';
  }
  return undefined;
}

export async function validateChangedFile(file: string): Promise<string | undefined> {
  const root = findArtifactRoot(file);
  const name = basename(file);
  if (root.type === 'series') return validateSeriesFile(root.dir, name);
  const projectDir = root.dir;

  if (name === 'storyboard.yaml') {
    await validateProject(projectDir);
    return 'storyboard';
  }
  if (name === 'timing.json' || name === 'timing.overrides.json') {
    const project = await loadProject(projectDir);
    if (!project.timing) throw new ValidationError(`timing.json is missing in ${projectDir}.`);
    await validateProject(projectDir);
    return 'timing';
  }
  if (name === 'script.yaml') {
    // Only the script against the canon: timing is rebuilt from the script by
    // episode-track, so it is expected to be stale right after a script edit.
    const project = await loadProject(projectDir);
    if (project.config.kind !== 'episode') {
      throw new ValidationError(`script.yaml belongs to episode projects; ${projectDir} is a ${project.config.kind}.`);
    }
    if (!project.script) throw new ValidationError(`script.yaml is missing in ${projectDir}.`);
    if (!project.characters) throw new ValidationError(`characters.yaml is missing in ${project.paths.series}.`);
    if (!project.sets) throw new ValidationError(`sets.yaml is missing in ${project.paths.series}.`);
    validateScript(project.script, { characters: project.characters, sets: project.sets });
    return 'script';
  }
  if (name === 'project.yaml') {
    const config = await readYamlFile(join(projectDir, 'project.yaml'), ProjectConfigSchema);
    const defaults = await loadDefaults();
    if (config.budget_usd < defaults.budget.minimum_usd) {
      throw new ValidationError(
        `budget_usd must be at least $${defaults.budget.minimum_usd.toFixed(2)}.`,
      );
    }
    if (config.slug !== basename(projectDir)) {
      throw new ValidationError(
        `project.yaml slug "${config.slug}" does not match the project folder "${basename(projectDir)}".`,
      );
    }
    if (config.kind === 'episode' && config.series) {
      const series = join(seriesDir(projectDir, config.series), 'series.yaml');
      if (!existsSync(series)) throw new ValidationError(`Series "${config.series}" not found: ${series} does not exist.`);
    }
    if (existsSync(join(projectDir, 'state.json'))) {
      const state = await readJsonFile(join(projectDir, 'state.json'), StateSchema);
      if (Math.abs(state.budget.totalUsd - config.budget_usd) > 1e-9) {
        throw new ValidationError(
          `state.json budget (${state.budget.totalUsd}) does not match project.yaml budget_usd (${config.budget_usd}). Update both together.`,
        );
      }
      if (state.kind !== undefined) assertKindMatches(state, config);
    }
    return 'project';
  }
  if (name === 'state.json') {
    const state = await readJsonFile(join(projectDir, 'state.json'), StateSchema);
    if (state.kind !== undefined) {
      assertKindMatches(state, await readYamlFile(join(projectDir, 'project.yaml'), ProjectConfigSchema));
    }
    return 'state';
  }
  if (name === 'style.yaml') {
    await readYamlFile(join(projectDir, 'style.yaml'), StyleBibleSchema);
    return 'style';
  }
  if (name === 'characters.yaml') {
    await readYamlFile(join(projectDir, 'characters.yaml'), CharacterBibleSchema);
    return 'characters';
  }
  return undefined;
}
