import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  LIBRARY_SOUND_ENTRY,
  LIBRARY_SOUND_FILE,
  LibrarySoundSchema,
  librarySoundTakeSource,
  librarySoundSeconds,
  readYamlFile,
  scriptLines,
  type LibrarySound,
  type LoadedProject,
  type Script,
  type ScriptCanon,
} from '@coreslopper/core';
import { lineTakePath, takeStatus } from './takes.js';
import { findWorkspaceRoot } from './workspace.js';

/** The workspace a project belongs to: the marked root above it, or the folder above `projects/`. */
function workspaceOf(projectDir: string): string {
  return findWorkspaceRoot(projectDir) ?? resolve(projectDir, '..', '..');
}

/** The library entries a script names, by id. A sound the library does not hold is left out; an entry that does not load fails with its own message. */
export async function scriptLibrarySounds(projectDir: string, script: Script): Promise<Record<string, LibrarySound>> {
  const root = workspaceOf(projectDir);
  const ids = new Set(scriptLines(script).flatMap(({ line }) => (line.kind === 'sfx' && line.sound !== undefined ? [line.sound] : [])));
  const sounds: Record<string, LibrarySound> = {};
  for (const id of ids) {
    const file = join(root, 'library', 'sounds', id, LIBRARY_SOUND_ENTRY);
    if (existsSync(file)) sounds[id] = await readYamlFile(file, LibrarySoundSchema);
  }
  return sounds;
}

/** `library/sounds/<id>/sound.wav` of the workspace a project belongs to. */
export function librarySoundWav(projectDir: string, id: string): string {
  return join(workspaceOf(projectDir), 'library', 'sounds', id, LIBRARY_SOUND_FILE);
}

/**
 * The library sounds a script names, by id, with the seconds each plays. A
 * sound the library does not hold is left out, so validateScript names it; an
 * entry that does not load fails with its own message.
 */
export async function scriptSounds(projectDir: string, script: Script): Promise<Record<string, number>> {
  const library = await scriptLibrarySounds(projectDir, script);
  return Object.fromEntries(Object.entries(library).map(([id, sound]) => [id, librarySoundSeconds(sound)]));
}

/**
 * The sounds a meme's script names that the library no longer holds but the
 * meme already took (HS-260): a line naming the sound has its registered copy,
 * of source `library:<id>`. By id, with the take's seconds.
 */
export async function keptSounds(project: LoadedProject, script: Script, library: Record<string, LibrarySound>): Promise<Record<string, number>> {
  const kept: Record<string, number> = {};
  for (const { line } of scriptLines(script)) {
    if (line.kind !== 'sfx' || line.sound === undefined || library[line.sound] || kept[line.sound] !== undefined) continue;
    const take = project.takes?.takes[line.id];
    if (take?.source !== librarySoundTakeSource(line.sound)) continue;
    if ((await takeStatus(take, lineTakePath(project, line.id), take.text_hash)) === 'current') kept[line.sound] = take.duration;
  }
  return kept;
}

/**
 * What a project's script is validated against: its kind, its bibles and, for
 * a meme, the library sounds it names – a removed one the meme already took
 * counts with its take's length.
 */
export async function scriptCanon(project: LoadedProject, script: Script, library?: Record<string, LibrarySound>): Promise<ScriptCanon> {
  const { config, characters, sets, paths } = project;
  if (config.kind !== 'meme') return { kind: config.kind, characters, sets };
  const held = library ?? (await scriptLibrarySounds(paths.root, script));
  const sounds = Object.fromEntries(Object.entries(held).map(([id, sound]) => [id, librarySoundSeconds(sound)]));
  return { kind: 'meme', characters, sets, sounds: { ...(await keptSounds(project, script, held)), ...sounds } };
}
