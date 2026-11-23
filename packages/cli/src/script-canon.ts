import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  LIBRARY_SOUND_ENTRY,
  LIBRARY_SOUND_FILE,
  LibrarySoundSchema,
  librarySoundTakeSource,
  takeSource,
  librarySoundSeconds,
  readYamlFile,
  scriptLines,
  soundCuesByLine,
  type LibrarySound,
  type LoadedProject,
  type Script,
  type ScriptCanon,
  type SoundCues,
} from '@coreslopper/core';
import { lineTakePath, takeStatus, textHash } from './takes.js';
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
 * meme still has (HS-260), by id, with the take's seconds: every line naming
 * the sound has its own current take – its registered copy (`library:<id>`)
 * or the user's import. One line without one leaves the sound out, so
 * validateScript stops on it.
 */
export async function keptSounds(project: LoadedProject, script: Script, library: Record<string, LibrarySound>): Promise<Record<string, number>> {
  const kept: Record<string, number> = {};
  const lost = new Set<string>();
  for (const { line } of scriptLines(script)) {
    if (line.kind !== 'sfx' || line.sound === undefined || library[line.sound] || lost.has(line.sound)) continue;
    const take = project.takes?.takes[line.id];
    const expected = take?.source === librarySoundTakeSource(line.sound) ? take.text_hash : take?.source === 'imported' ? textHash(takeSource(line)) : undefined;
    if (take && expected && (await takeStatus(take, lineTakePath(project, line.id), expected)) === 'current') {
      kept[line.sound] ??= take.duration;
    } else {
      lost.add(line.sound);
      delete kept[line.sound];
    }
  }
  return kept;
}

/** The library entries a project's script names: a meme's, or none for an episode. */
export async function projectLibrarySounds(project: LoadedProject & { script: Script }): Promise<Record<string, LibrarySound>> {
  return project.config.kind === 'meme' ? scriptLibrarySounds(project.paths.root, project.script) : {};
}

/**
 * The sound cues a project's shot anchors resolve against, by script line id: a meme's script lines and library
 * sounds. Another kind has none, so a `cue` anchor there is refused (CMD-ValidateStoryboard).
 */
export async function projectSoundCues(project: LoadedProject): Promise<SoundCues | undefined> {
  if (project.config.kind !== 'meme' || !project.script) return undefined;
  return soundCuesByLine(project.script, await scriptLibrarySounds(project.paths.root, project.script));
}

/**
 * What a project's script is validated against: its kind, its bibles and, for
 * a meme, the library sounds it names – a removed one the meme already took
 * counts with its take's length. A meme's bibles count once style-character has
 * started: before, characters.yaml holds just the library characters taken at
 * setup, and the script's other speakers are ids that stage invents (HS-262).
 */
export async function scriptCanon(project: LoadedProject, script: Script, library?: Record<string, LibrarySound>): Promise<ScriptCanon> {
  const { config, characters, sets, paths, state } = project;
  if (config.kind !== 'meme') return { kind: config.kind, characters, sets };
  const held = library ?? (await scriptLibrarySounds(paths.root, script));
  const sounds = Object.fromEntries(Object.entries(held).map(([id, sound]) => [id, librarySoundSeconds(sound)]));
  const bibles = (state.stages['style-character']?.status ?? 'pending') === 'pending' ? {} : { characters, sets };
  return { kind: 'meme', ...bibles, sounds: { ...(await keptSounds(project, script, held)), ...sounds } };
}
