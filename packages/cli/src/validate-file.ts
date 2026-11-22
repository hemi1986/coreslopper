import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import {
  ProjectConfigSchema,
  PublishLogSchema,
  SeriesSchema,
  SeriesStateSchema,
  SetBibleSchema,
  StateSchema,
  StyleBibleSchema,
  CharacterBibleSchema,
  LibraryCharacterSchema,
  ChannelConfigSchema,
  ReleaseCalendarSchema,
  ReleaseScheduleSchema,
  ReferencesSchema,
  ReviewRepliesSchema,
  ReviewRoundSchema,
  ValidationError,
  loadProject,
  loadDefaults,
  readJsonFile,
  readYamlFile,
  seriesDir,
  validateScript,
} from '@coreslopper/core';
import { isLibrarySoundFile, validateLibrarySoundEntry } from './sound-library.js';
import { loadUploadData } from './upload-text.js';
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

/** series.yaml budget_usd and state.json must agree, like a project's budget and state. */
async function checkSeriesBudget(seriesRoot: string): Promise<void> {
  const statePath = join(seriesRoot, 'state.json');
  if (!existsSync(statePath)) return;
  const series = await readYamlFile(join(seriesRoot, 'series.yaml'), SeriesSchema);
  const state = await readJsonFile(statePath, SeriesStateSchema);
  if (state.series !== series.slug) {
    throw new ValidationError(`state.json is for series "${state.series}", but series.yaml says "${series.slug}".`);
  }
  if (Math.abs(state.budget.totalUsd - (series.budget_usd ?? 0)) > 1e-9) {
    throw new ValidationError(
      `state.json budget (${state.budget.totalUsd}) does not match series.yaml budget_usd (${series.budget_usd ?? 'none'}). Update both together.`,
    );
  }
}

/** Canon files of a series: series.yaml, state.json, sets.yaml, style.yaml, characters.yaml. */
async function validateSeriesFile(seriesRoot: string, name: string): Promise<string | undefined> {
  if (name === 'references.yaml') {
    await validateReferences(seriesRoot);
    return 'references';
  }
  if (name === 'series.yaml') {
    const series = await readYamlFile(join(seriesRoot, 'series.yaml'), SeriesSchema);
    if (series.slug !== basename(seriesRoot)) {
      throw new ValidationError(
        `series.yaml slug "${series.slug}" does not match the series folder "${basename(seriesRoot)}".`,
      );
    }
    await checkSeriesBudget(seriesRoot);
    return 'series';
  }
  if (name === 'state.json') {
    await readJsonFile(join(seriesRoot, 'state.json'), SeriesStateSchema);
    await checkSeriesBudget(seriesRoot);
    return 'series state';
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
  // The workspace's channel configuration lives outside projects and series.
  if (basename(file) === 'channel.yaml' && basename(dirname(resolve(file))) === 'config') {
    await readYamlFile(resolve(file), ChannelConfigSchema);
    return 'channel';
  }
  if (basename(file) === 'release-schedule.yaml' && basename(dirname(resolve(file))) === 'config') {
    await readYamlFile(resolve(file), ReleaseScheduleSchema);
    return 'release schedule';
  }
  if (isLibraryCharacterFile(file)) {
    await validateLibraryCharacter(resolve(file));
    return 'library character';
  }
  if (isLibrarySoundFile(file)) {
    await validateLibrarySoundEntry(file);
    return 'library sound';
  }
  const root = findArtifactRoot(file);
  const name = basename(file);
  if (root.type === 'series') return validateSeriesFile(root.dir, name);
  const projectDir = root.dir;

  if (name === 'references.yaml') {
    await validateReferences(projectDir);
    return 'references';
  }
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
  if (name === 'upload.yaml' && basename(dirname(resolve(file))) === 'review') {
    await loadUploadData(projectDir);
    return 'upload data';
  }
  if (name === 'calendar.yaml' && basename(dirname(resolve(file))) === 'review') {
    await readYamlFile(join(projectDir, 'review', 'calendar.yaml'), ReleaseCalendarSchema);
    return 'release calendar';
  }
  if (/^\d{3,}\.replies\.json$/.test(name) && basename(dirname(resolve(file))) === 'rounds') {
    await validateReplies(projectDir, resolve(file));
    return 'review replies';
  }
  if (/^\d{3,}\.json$/.test(name) && basename(dirname(resolve(file))) === 'rounds') {
    await readJsonFile(resolve(file), ReviewRoundSchema);
    return 'review round';
  }
  if (name === 'publish.json' && basename(dirname(resolve(file))) === 'review') {
    await readJsonFile(join(projectDir, 'review', 'publish.json'), PublishLogSchema);
    return 'publish log';
  }
  if (name === 'characters.yaml') {
    await readYamlFile(join(projectDir, 'characters.yaml'), CharacterBibleSchema);
    return 'characters';
  }
  if (name === 'sets.yaml') {
    // A music video's own sets, plates, and props (an episode uses the canon's).
    await readYamlFile(join(projectDir, 'sets.yaml'), SetBibleSchema);
    return 'sets';
  }
  return undefined;
}

/** The agent's replies answer every note of their round, and only those. */
async function validateReplies(projectDir: string, path: string): Promise<void> {
  const replies = await readJsonFile(path, ReviewRepliesSchema);
  const number = Number(basename(path).split('.')[0]);
  if (replies.round !== number) throw new ValidationError(`${basename(path)} answers round ${replies.round}; its file name says round ${number}.`);
  const roundPath = join(projectDir, 'review', 'rounds', `${basename(path).split('.')[0]}.json`);
  if (!existsSync(roundPath)) throw new ValidationError(`round ${number} does not exist (${roundPath}).`);
  const round = await readJsonFile(roundPath, ReviewRoundSchema);
  const asked = new Set(round.notes.map((note) => note.id));
  const answered = new Set(replies.notes.map((note) => note.id));
  const unknown = [...answered].filter((id) => !asked.has(id));
  const missing = [...asked].filter((id) => !answered.has(id));
  if (unknown.length) throw new ValidationError(`replies to notes that round ${number} does not have: ${unknown.join(', ')}`);
  if (missing.length) throw new ValidationError(`round ${number} has notes without a reply: ${missing.join(', ')}. Answer every note, with status not-fixed or question where needed.`);
}

/** references.yaml: the schema, unique ids, and every listed file present. */
async function validateReferences(dir: string): Promise<void> {
  const references = await readYamlFile(join(dir, 'references.yaml'), ReferencesSchema);
  const seen = new Set<string>();
  for (const reference of references.references) {
    if (seen.has(reference.id)) throw new ValidationError(`reference id ${reference.id} appears twice`);
    seen.add(reference.id);
    if (reference.file && !existsSync(join(dir, reference.file))) throw new ValidationError(`reference ${reference.id}: ${reference.file} is missing`);
  }
}

/** `library/characters/<id>/character.yaml` of the workspace's character library. */
export function isLibraryCharacterFile(file: string): boolean {
  const dir = dirname(resolve(file));
  return basename(file) === 'character.yaml' && basename(dirname(dir)) === 'characters' && basename(dirname(dirname(dir))) === 'library';
}

/** A library character: the schema, its id matching its folder, and every named file present. */
async function validateLibraryCharacter(path: string): Promise<void> {
  const entry = await readYamlFile(path, LibraryCharacterSchema);
  const dir = dirname(path);
  if (entry.id !== basename(dir)) throw new ValidationError(`character.yaml says id "${entry.id}", but its folder is "${basename(dir)}".`);
  const files = [entry.sheet, ...entry.refs, entry.voice?.ref, ...entry.states.map((state) => state.ref)].filter(Boolean) as string[];
  const missing = files.filter((file) => !existsSync(join(dir, file)));
  if (missing.length) throw new ValidationError(`library character ${entry.id} names files that are missing: ${missing.join(', ')}`);
}
