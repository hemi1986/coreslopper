import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  LIBRARY_SOUND_ENTRY,
  LibrarySoundSchema,
  librarySoundSeconds,
  readYamlFile,
  scriptLines,
  type LoadedProject,
  type Script,
  type ScriptCanon,
} from '@coreslopper/core';
import { findWorkspaceRoot } from './workspace.js';

/** The workspace a project belongs to: the marked root above it, or the folder above `projects/`. */
function workspaceOf(projectDir: string): string {
  return findWorkspaceRoot(projectDir) ?? resolve(projectDir, '..', '..');
}

/**
 * The library sounds a script names, by id, with the seconds each plays. A
 * sound the library does not hold is left out, so validateScript names it; an
 * entry that does not load fails with its own message.
 */
export async function scriptSounds(projectDir: string, script: Script): Promise<Record<string, number>> {
  const root = workspaceOf(projectDir);
  const ids = new Set(scriptLines(script).flatMap(({ line }) => (line.kind === 'sfx' && line.sound !== undefined ? [line.sound] : [])));
  const sounds: Record<string, number> = {};
  for (const id of ids) {
    const file = join(root, 'library', 'sounds', id, LIBRARY_SOUND_ENTRY);
    if (existsSync(file)) sounds[id] = librarySoundSeconds(await readYamlFile(file, LibrarySoundSchema));
  }
  return sounds;
}

/** What a project's script is validated against: its kind, its bibles and, for a meme, the library sounds it names. */
export async function scriptCanon(project: LoadedProject, script: Script): Promise<ScriptCanon> {
  const { config, characters, sets, paths } = project;
  if (config.kind !== 'meme') return { kind: config.kind, characters, sets };
  return { kind: 'meme', characters, sets, sounds: await scriptSounds(paths.root, script) };
}
