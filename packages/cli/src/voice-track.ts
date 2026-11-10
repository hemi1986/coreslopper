import { join, resolve } from 'node:path';
import {
  ValidationError,
  ambienceSource,
  ensureDir,
  hashFile,
  isAudibleLine,
  isSpokenLine,
  loadModelsConfig,
  loadProject,
  placeLines,
  providerForRole,
  resolveModelRole,
  scriptLines,
  takeSource,
  validateScript,
  type ScriptLine,
  type Take,
} from '@coreslopper/core';
import { runBatch, type BatchItem } from './generate.js';
import { convertAudio, probeDuration } from './media.js';
import {
  ambiencePath,
  blockingReason,
  lineTakePath,
  loadTakes,
  requireEpisode,
  saveTakes,
  takeStatus,
  textHash,
  type EpisodeProject,
} from './takes.js';

export interface VoiceTrackOptions {
  dryRun?: boolean;
}

/** Longest generation the role allows on the project's provider, from config/models.yaml. */
async function roleMaxDuration(project: EpisodeProject, role: string): Promise<number | undefined> {
  const models = await loadModelsConfig();
  const definition = models.roles[role];
  if (!definition) throw new ValidationError(`Unknown model role "${role}". Add it to config/models.yaml.`);
  const override = project.config.models[role];
  return resolveModelRole(
    definition,
    providerForRole(project.config, role),
    override && typeof override === 'object' && !Array.isArray(override) ? (override as Record<string, unknown>) : {},
    role,
  ).maxDuration;
}

function lineItem(project: EpisodeProject, line: ScriptLine): BatchItem {
  if (isSpokenLine(line)) {
    const speaker = project.characters.characters.find((character) => character.id === line.speaker);
    if (!speaker?.voice) {
      throw new ValidationError(
        `Line "${line.id}": speaker "${line.speaker}" has no reference voice in characters.yaml. Add voice.ref and voice.transcript, or record the line and run import-takes.`,
      );
    }
    return {
      operation: 'generateAudio',
      role: 'audio.voice',
      prompt: line.text_de,
      references: [],
      audio: resolve(project.paths.series!, speaker.voice.ref),
      params: { transcript: speaker.voice.transcript },
    };
  }
  if (line.kind === 'sfx') {
    return {
      operation: 'generateAudio',
      role: 'audio.sfx',
      prompt: line.prompt,
      references: [],
      durationSeconds: line.duration,
      params: {},
    };
  }
  throw new ValidationError(`Line "${line.id}" (${line.kind}) has no take.`);
}

/** Bring a generated file to its take path as 48 kHz mono WAV and describe it. */
async function registerGenerated(source: string, destination: string, hash: string): Promise<Take> {
  await ensureDir(join(destination, '..'));
  convertAudio(source, destination, 1);
  return {
    source: 'generated',
    duration: Number(probeDuration(destination).toFixed(3)),
    text_hash: hash,
    file_hash: await hashFile(destination),
  };
}

/**
 * Produce a take for every audible script line without a current one (speech
 * through `audio.voice`, effects through `audio.sfx`), then an ambience for
 * every scene with an `atmo` prompt. Imported takes are never overwritten.
 */
export async function voiceTrack(projectDir: string, options: VoiceTrackOptions = {}): Promise<void> {
  const project = requireEpisode(await loadProject(projectDir), 'voice-track');
  validateScript(project.script, project);
  const takes = loadTakes(project);
  const blocked: string[] = [];

  // 1. Script lines.
  const pending: Array<{ line: ScriptLine; hash: string; item: BatchItem }> = [];
  let current = 0;
  const sfxMax = await roleMaxDuration(project, 'audio.sfx');
  for (const { line } of scriptLines(project.script)) {
    if (!isAudibleLine(line)) continue;
    const hash = textHash(takeSource(line));
    const take = takes.takes[line.id];
    const status = await takeStatus(take, lineTakePath(project, line.id), hash);
    const reason = blockingReason(status, take, `Line "${line.id}"`);
    if (reason) {
      blocked.push(reason);
      continue;
    }
    if (status === 'current') {
      current += 1;
      continue;
    }
    if (line.kind === 'sfx' && sfxMax !== undefined && line.duration > sfxMax) {
      blocked.push(`Line "${line.id}": the effect is ${line.duration} s; role "audio.sfx" allows at most ${sfxMax} s.`);
      continue;
    }
    try {
      pending.push({ line, hash, item: lineItem(project, line) });
    } catch (error) {
      blocked.push((error as Error).message);
    }
  }
  if (blocked.length > 0) throw new ValidationError('voice-track cannot continue', blocked);

  console.log(`Takes: ${current} current, ${pending.length} to generate.`);
  if (pending.length > 0) {
    const results = await runBatch(project, pending.map((entry) => entry.item), { dryRun: options.dryRun });
    if (!options.dryRun) {
      for (const [index, { line, hash }] of pending.entries()) {
        const file = results[index]?.result?.files[0];
        if (!file) throw new ValidationError(`The generation for line "${line.id}" returned no file.`);
        takes.takes[line.id] = await registerGenerated(file, lineTakePath(project, line.id), hash);
      }
      await saveTakes(project, takes);
    }
  }
  if (options.dryRun) {
    if (project.script.scenes.some((scene) => scene.atmo)) {
      console.log('Ambience is estimated after the takes exist, because its length follows the scene.');
    }
    return;
  }

  // 2. Scene ambience, as long as the scene on its first generation; the mix
  //    loops or trims it, so a later change of the scene length keeps it.
  const durations: Record<string, number> = {};
  for (const [id, take] of Object.entries(takes.takes)) durations[id] = take.duration;
  const placement = placeLines(project.script, durations);
  const ambienceMax = sfxMax;
  const ambience: Array<{ scene: string; hash: string; item: BatchItem }> = [];
  for (const scene of project.script.scenes) {
    if (!scene.atmo) continue;
    const hash = textHash(ambienceSource(scene.atmo));
    const take = takes.ambience[scene.id];
    const status = await takeStatus(take, ambiencePath(project, scene.id), hash);
    const reason = blockingReason(status, take, `Ambience of scene "${scene.id}"`);
    if (reason) {
      blocked.push(reason);
      continue;
    }
    if (status === 'current') continue;
    const section = placement.sections.find((candidate) => candidate.id === scene.id)!;
    const length = Math.ceil(section.end - section.start);
    ambience.push({
      scene: scene.id,
      hash,
      item: {
        operation: 'generateAudio',
        role: 'audio.sfx',
        prompt: scene.atmo,
        references: [],
        durationSeconds: Math.max(1, ambienceMax === undefined ? length : Math.min(length, ambienceMax)),
        params: {},
      },
    });
  }
  if (blocked.length > 0) throw new ValidationError('voice-track cannot continue', blocked);

  if (ambience.length > 0) {
    console.log(`Ambience: ${ambience.length} scene(s) to generate.`);
    const results = await runBatch(project, ambience.map((entry) => entry.item));
    for (const [index, { scene, hash }] of ambience.entries()) {
      const file = results[index]?.result?.files[0];
      if (!file) throw new ValidationError(`The ambience generation for scene "${scene}" returned no file.`);
      takes.ambience[scene] = await registerGenerated(file, ambiencePath(project, scene), hash);
    }
  }
  await saveTakes(project, takes);
  console.log(`✔ takes.json: ${Object.keys(takes.takes).length} take(s), ${Object.keys(takes.ambience).length} ambience(s).`);
}
