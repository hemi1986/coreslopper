import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import {
  ProjectConfigSchema,
  StateSchema,
  StyleBibleSchema,
  CharacterBibleSchema,
  ValidationError,
  loadProject,
  loadDefaults,
  readJsonFile,
  readYamlFile,
} from '@coreslopper/core';
import { validateProject } from './validate.js';

function findProjectRoot(file: string): string {
  let current = dirname(resolve(file));
  while (true) {
    if (existsSync(join(current, 'project.yaml'))) return current;
    const parent = dirname(current);
    if (parent === current) {
      throw new ValidationError(`No project.yaml found above ${file}.`);
    }
    current = parent;
  }
}

export async function validateChangedFile(file: string): Promise<string | undefined> {
  const projectDir = findProjectRoot(file);
  const name = basename(file);

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
    if (existsSync(join(projectDir, 'state.json'))) {
      const state = await readJsonFile(join(projectDir, 'state.json'), StateSchema);
      if (Math.abs(state.budget.totalUsd - config.budget_usd) > 1e-9) {
        throw new ValidationError(
          `state.json budget (${state.budget.totalUsd}) does not match project.yaml budget_usd (${config.budget_usd}). Update both together.`,
        );
      }
    }
    return 'project';
  }
  if (name === 'state.json') {
    await readJsonFile(join(projectDir, 'state.json'), StateSchema);
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
