import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  TakesSchema,
  ValidationError,
  hashFile,
  hashObject,
  writeJsonAtomic,
  type LoadedProject,
  type Script,
  type SetBible,
  type CharacterBible,
  type Take,
  type Takes,
} from '@coreslopper/core';

/** A loaded episode with everything the take commands need. */
export interface EpisodeProject extends LoadedProject {
  script: Script;
  characters: CharacterBible;
  sets: SetBible;
}

export function requireEpisode(project: LoadedProject, command: string): EpisodeProject {
  const { config, paths, script, characters, sets } = project;
  if (config.kind !== 'episode') {
    throw new ValidationError(`${command} works on episode projects; ${paths.root} is a ${config.kind}.`);
  }
  if (!script) throw new ValidationError(`script.yaml is missing in ${paths.root}. Finish the script stage first.`);
  if (!characters) throw new ValidationError(`characters.yaml is missing in the series canon ${paths.series}.`);
  if (!sets) throw new ValidationError(`sets.yaml is missing in the series canon ${paths.series}.`);
  return { ...project, script, characters, sets };
}

export function lineTakePath(project: LoadedProject, lineId: string): string {
  return join(project.paths.root, 'audio', 'lines', `${lineId}.wav`);
}

export function ambiencePath(project: LoadedProject, sceneId: string): string {
  return join(project.paths.root, 'audio', 'ambience', `${sceneId}.wav`);
}

export function loadTakes(project: LoadedProject): Takes {
  return project.takes ? structuredClone(project.takes) : TakesSchema.parse({});
}

function sortedRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

export async function saveTakes(project: LoadedProject, takes: Takes): Promise<void> {
  await writeJsonAtomic(project.paths.takes, {
    version: 1,
    takes: sortedRecord(takes.takes),
    ambience: sortedRecord(takes.ambience),
  });
}

export function textHash(source: Record<string, unknown>): string {
  return hashObject(source);
}

/**
 * - `current`: registered, the file is the registered one, and the text has not changed.
 * - `missing`: no file.
 * - `stale`: the registered file is there, but the text or prompt changed.
 * - `replaced`: a file is registered, but someone swapped it for another one.
 * - `unregistered`: a file is there without an entry in takes.json.
 */
export type TakeStatus = 'current' | 'missing' | 'stale' | 'replaced' | 'unregistered';

export async function takeStatus(take: Take | undefined, file: string, expectedHash: string): Promise<TakeStatus> {
  if (!existsSync(file)) return 'missing';
  if (!take) return 'unregistered';
  if (take.file_hash && take.file_hash !== (await hashFile(file))) return 'replaced';
  return take.text_hash === expectedHash ? 'current' : 'stale';
}

/** Why a take blocks the pipeline, or undefined when a generation may (re)create it. */
export function blockingReason(status: TakeStatus, take: Take | undefined, label: string): string | undefined {
  if (status === 'replaced' || status === 'unregistered') {
    return `${label}: the file is not the registered take. Run import-takes to register it, or delete it to generate a new one.`;
  }
  if (status === 'stale' && take?.source === 'imported') {
    return `${label}: the imported take was recorded for an older text. Record it again and run import-takes, or delete it to generate one.`;
  }
  return undefined;
}
