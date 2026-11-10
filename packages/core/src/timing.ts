import {
  type Anchor,
  type CharacterBible,
  type Line,
  type Script,
  type SetBible,
  type Section,
  type Shot,
  type Storyboard,
  type StyleBible,
  type Timing,
  type TimingOverrides,
} from './schema.js';
import { ValidationError } from './errors.js';

export const TIMING_TOLERANCE_SECONDS = 0.05;

export const MOTION_COMPONENTS = new Set([
  'TitleCard',
  'LyricCard',
  'GlitchBackdrop',
  'ParticleField',
  'Grid',
  'Scanlines',
  'NeonTorus',
]);

export interface ResolvedShot extends Shot {
  startSeconds: number;
  endSeconds: number;
  startFrame: number;
  endFrame: number;
  durationInFrames: number;
}

export interface ResolvedStoryboard {
  fps: number;
  durationSeconds: number;
  durationInFrames: number;
  shots: ResolvedShot[];
  warnings: string[];
}

function findSection(timing: Timing, id: string): Section {
  const section = timing.sections.find((candidate) => candidate.id === id);
  if (!section) {
    throw new ValidationError(`Unknown section "${id}". Known sections: ${timing.sections.map((s) => s.id).join(', ')}`);
  }
  return section;
}

function findLine(timing: Timing, id: string): Line {
  const line = timing.lines.find((candidate) => candidate.id === id);
  if (!line) {
    throw new ValidationError(`Unknown lyric line "${id}".`);
  }
  return line;
}

export function mergeTiming(base: Timing, overrides: TimingOverrides): Timing {
  const merged = structuredClone(base);

  if (overrides.bpm !== undefined) merged.bpm = overrides.bpm;
  if (overrides.beats !== undefined) merged.beats = [...overrides.beats];
  if (overrides.downbeats !== undefined) merged.downbeats = [...overrides.downbeats];

  for (const override of overrides.sections) {
    const section = findSection(merged, override.id);
    section.start = override.start;
    section.end = override.end;
  }

  for (const override of overrides.lines) {
    const line = findLine(merged, override.id);
    line.start = override.start;
    line.end = override.end;
  }

  for (const override of overrides.words) {
    const line = findLine(merged, override.line);
    const word = line.words[override.index];
    if (!word) {
      throw new ValidationError(
        `Word override references missing word ${override.index} on line "${override.line}".`,
      );
    }
    word.start = override.start;
    word.end = override.end;
  }

  assertTiming(merged);
  return merged;
}

export function assertTiming(timing: Timing): void {
  const issues: string[] = [];
  const duration = timing.audio.duration;

  if (timing.sections.length === 0) {
    issues.push('timing.sections must not be empty');
  }

  const sections = [...timing.sections].sort((a, b) => a.start - b.start);
  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index]!;
    if (section.end <= section.start) {
      issues.push(`section "${section.id}" has end <= start`);
    }
    if (section.start < -TIMING_TOLERANCE_SECONDS || section.end > duration + TIMING_TOLERANCE_SECONDS) {
      issues.push(`section "${section.id}" is outside the audio duration`);
    }
    if (index === 0 && Math.abs(section.start) > TIMING_TOLERANCE_SECONDS) {
      issues.push(`sections must start at 0; first section starts at ${section.start.toFixed(3)}s`);
    }
    const previous = sections[index - 1];
    if (previous) {
      const gap = section.start - previous.end;
      if (Math.abs(gap) > TIMING_TOLERANCE_SECONDS) {
        issues.push(`sections "${previous.id}" and "${section.id}" have a gap or overlap of ${gap.toFixed(3)}s`);
      }
    }
  }
  const last = sections[sections.length - 1];
  if (last && Math.abs(last.end - duration) > TIMING_TOLERANCE_SECONDS) {
    issues.push(`last section ends at ${last.end.toFixed(3)}s; audio duration is ${duration.toFixed(3)}s`);
  }

  for (const line of timing.lines) {
    if (line.end <= line.start) issues.push(`line "${line.id}" has end <= start`);
    if (line.start < -TIMING_TOLERANCE_SECONDS || line.end > duration + TIMING_TOLERANCE_SECONDS) {
      issues.push(`line "${line.id}" is outside the audio duration`);
    }
    if (!timing.sections.some((section) => section.id === line.section)) {
      issues.push(`line "${line.id}" references unknown section "${line.section}"`);
    }
    let previousEnd = -Infinity;
    for (const [index, word] of line.words.entries()) {
      if (word.end < word.start) issues.push(`line "${line.id}" word ${index} has end < start`);
      if (word.start < previousEnd - TIMING_TOLERANCE_SECONDS) {
        issues.push(`line "${line.id}" word ${index} starts before the previous word ends`);
      }
      previousEnd = word.end;
    }
  }

  for (const [label, values] of [
    ['beats', timing.beats],
    ['downbeats', timing.downbeats],
    ['onsets', timing.onsets],
  ] as const) {
    for (const value of values) {
      if (value < -TIMING_TOLERANCE_SECONDS || value > duration + TIMING_TOLERANCE_SECONDS) {
        issues.push(`${label} contains ${value.toFixed(3)}s, outside the audio duration`);
      }
    }
  }

  if (timing.energy.values.length === 0) issues.push('energy.values must not be empty');
  if (timing.energy.fps <= 0) issues.push('energy.fps must be positive');

  if (issues.length > 0) {
    throw new ValidationError('Invalid timing', issues);
  }
}

function ensureTime(value: number, timing: Timing, label: string): number {
  if (!Number.isFinite(value)) {
    throw new ValidationError(`${label} resolved to a non-finite time`);
  }
  if (value < -TIMING_TOLERANCE_SECONDS || value > timing.audio.duration + TIMING_TOLERANCE_SECONDS) {
    throw new ValidationError(
      `${label} resolved to ${value.toFixed(3)}s, outside 0..${timing.audio.duration.toFixed(3)}s`,
    );
  }
  return Math.max(0, Math.min(timing.audio.duration, value));
}

export function resolveAnchor(anchor: Anchor, timing: Timing): number {
  switch (anchor.type) {
    case 'section': {
      const section = findSection(timing, anchor.id);
      const base = anchor.edge === 'start' ? section.start : section.end;
      return ensureTime(base + anchor.offset, timing, `section "${anchor.id}" ${anchor.edge}`);
    }
    case 'line': {
      const line = findLine(timing, anchor.id);
      const base = anchor.edge === 'start' ? line.start : line.end;
      return ensureTime(base + anchor.offset, timing, `line "${anchor.id}" ${anchor.edge}`);
    }
    case 'word': {
      const line = findLine(timing, anchor.line);
      const word = line.words[anchor.index];
      if (!word) {
        throw new ValidationError(`Word anchor references missing word ${anchor.index} on line "${anchor.line}".`);
      }
      const base = anchor.edge === 'start' ? word.start : word.end;
      return ensureTime(base + anchor.offset, timing, `word "${anchor.line}"[${anchor.index}] ${anchor.edge}`);
    }
    case 'beat': {
      const beat = timing.beats[anchor.index];
      if (beat === undefined) {
        throw new ValidationError(`Beat anchor references missing beat ${anchor.index}.`);
      }
      return ensureTime(beat + anchor.offset, timing, `beat ${anchor.index}`);
    }
    case 'downbeat': {
      const downbeat = timing.downbeats[anchor.index];
      if (downbeat === undefined) {
        throw new ValidationError(`Downbeat anchor references missing downbeat ${anchor.index}.`);
      }
      return ensureTime(downbeat + anchor.offset, timing, `downbeat ${anchor.index}`);
    }
    case 'time':
      return ensureTime(anchor.seconds, timing, 'time anchor');
  }
}

function getPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (current && typeof current === 'object' && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, value);
}

function validateRefs(shot: Shot, style: StyleBible, characters: CharacterBible): void {
  for (const ref of shot.refs.style) {
    if (getPath(style, ref) === undefined) {
      throw new ValidationError(`Shot "${shot.id}" references missing style token "${ref}".`);
    }
  }
  for (const character of shot.refs.characters) {
    if (!characters.characters.some((candidate) => candidate.id === character)) {
      throw new ValidationError(`Shot "${shot.id}" references missing character "${character}".`);
    }
  }
}

/** What an episode adds to storyboard validation: its script and the series' sets. */
export interface EpisodeContext {
  script: Script;
  sets: SetBible;
}

/**
 * A shot may name sets of the canon. Each named set must exist and be the set
 * of the shot's scene; a cutaway to another place is its own scene.
 */
function validateSets(shot: Shot, episode: EpisodeContext | undefined): void {
  if (shot.refs.sets.length === 0) return;
  if (!episode) {
    throw new ValidationError(`Shot "${shot.id}" names sets in refs.sets; sets exist only in episode projects.`);
  }
  const scene = episode.script.scenes.find((candidate) => candidate.id === shot.section);
  for (const set of shot.refs.sets) {
    if (!episode.sets.sets.some((candidate) => candidate.id === set)) {
      throw new ValidationError(
        `Shot "${shot.id}" references missing set "${set}". Known sets: ${episode.sets.sets.map((s) => s.id).join(', ') || 'none'}.`,
      );
    }
    if (!scene) {
      throw new ValidationError(`Shot "${shot.id}" is in section "${shot.section}", which is no scene of the script.`);
    }
    if (scene.set !== set) {
      throw new ValidationError(
        `Shot "${shot.id}" references set "${set}", but its scene "${scene.id}" plays in set "${scene.set}". A cutaway to another set is its own scene.`,
      );
    }
  }
}

function validateSource(shot: Shot): void {
  if (shot.source === 'motion') {
    if (!shot.motion?.component) {
      throw new ValidationError(`Motion shot "${shot.id}" must set motion.component.`);
    }
    if (!MOTION_COMPONENTS.has(shot.motion.component)) {
      throw new ValidationError(
        `Motion shot "${shot.id}" uses unknown component "${shot.motion.component}". Known: ${[...MOTION_COMPONENTS].join(', ')}.`,
      );
    }
  }
  if (shot.source === 'ai-clip') {
    if (!shot.prompts?.keyframe || !shot.prompts.video) {
      throw new ValidationError(`AI clip shot "${shot.id}" must set prompts.keyframe and prompts.video.`);
    }
  }
  if (shot.source === 'footage' && !shot.asset) {
    throw new ValidationError(`Footage shot "${shot.id}" must set asset.`);
  }
  if (shot.source === 'mixed') {
    if (!shot.layers || shot.layers.length < 2) {
      throw new ValidationError(`Mixed shot "${shot.id}" must have at least two layers.`);
    }
    for (const [index, layer] of shot.layers.entries()) {
      if (layer.type === 'footage' && !layer.asset) {
        throw new ValidationError(`Mixed shot "${shot.id}" layer ${index} is footage but has no asset.`);
      }
      if (layer.type === 'motion') {
        if (!layer.component) {
          throw new ValidationError(`Mixed shot "${shot.id}" layer ${index} is motion but has no component.`);
        }
        if (!MOTION_COMPONENTS.has(layer.component)) {
          throw new ValidationError(
            `Mixed shot "${shot.id}" layer ${index} uses unknown component "${layer.component}".`,
          );
        }
      }
      if (layer.type === 'ai-clip' && !layer.asset && !shot.prompts?.video) {
        throw new ValidationError(
          `Mixed shot "${shot.id}" layer ${index} is ai-clip but has neither asset nor prompts.video.`,
        );
      }
    }
  }
}

function validateText(shot: Shot): void {
  if (shot.highlights.length === 0) return;
  if (!shot.text) {
    throw new ValidationError(`Shot "${shot.id}" has highlights but no text.`);
  }
  const normalized = shot.text.toLowerCase();
  for (const highlight of shot.highlights) {
    if (!normalized.includes(highlight.toLowerCase())) {
      throw new ValidationError(`Shot "${shot.id}" highlight "${highlight}" is not part of its text.`);
    }
  }
}

export function resolveStoryboard(
  storyboard: Storyboard,
  timing: Timing,
  style: StyleBible,
  characters: CharacterBible,
  fps: number,
  toleranceFrames = 1,
  episode?: EpisodeContext,
): ResolvedStoryboard {
  const warnings: string[] = [];
  const resolved: ResolvedShot[] = [];
  const ids = new Set<string>();

  for (const shot of storyboard.shots) {
    if (ids.has(shot.id)) throw new ValidationError(`Duplicate shot id "${shot.id}".`);
    ids.add(shot.id);

    if (!timing.sections.some((section) => section.id === shot.section)) {
      throw new ValidationError(`Shot "${shot.id}" references unknown section "${shot.section}".`);
    }

    const startSeconds = resolveAnchor(shot.start, timing);
    const endSeconds = resolveAnchor(shot.end, timing);
    if (endSeconds <= startSeconds) {
      throw new ValidationError(`Shot "${shot.id}" ends at or before its start.`);
    }

    const startFrame = Math.round(startSeconds * fps);
    const endFrame = Math.round(endSeconds * fps);
    if (endFrame <= startFrame) {
      throw new ValidationError(`Shot "${shot.id}" is shorter than one frame.`);
    }

    if (shot.start.type === 'time' || shot.end.type === 'time') {
      warnings.push(`Shot "${shot.id}" uses an explicit time anchor; prefer a symbolic anchor.`);
    }

    validateRefs(shot, style, characters);
    validateSets(shot, episode);
    validateSource(shot);
    validateText(shot);

    resolved.push({
      ...shot,
      startSeconds,
      endSeconds,
      startFrame,
      endFrame,
      durationInFrames: endFrame - startFrame,
    });
  }

  const durationInFrames = Math.round(timing.audio.duration * fps);
  const ordered = [...resolved].sort((a, b) => a.startFrame - b.startFrame);
  if (ordered.some((shot, index) => shot.id !== resolved[index]?.id)) {
    throw new ValidationError('Storyboard shots must be ordered by start time.');
  }

  const first = ordered[0];
  if (!first) throw new ValidationError('Storyboard must contain at least one shot.');
  if (Math.abs(first.startFrame) > toleranceFrames) {
    throw new ValidationError(`Storyboard must start at 0; first shot starts at frame ${first.startFrame}.`);
  }

  let previousEnd = 0;
  for (const shot of ordered) {
    const gap = shot.startFrame - previousEnd;
    if (gap > toleranceFrames) {
      throw new ValidationError(`Gap of ${gap} frame(s) before shot "${shot.id}".`);
    }
    if (gap < -toleranceFrames) {
      throw new ValidationError(`Overlap of ${Math.abs(gap)} frame(s) at shot "${shot.id}".`);
    }
    previousEnd = shot.endFrame;
  }

  if (Math.abs(previousEnd - durationInFrames) > toleranceFrames) {
    throw new ValidationError(
      `Storyboard ends at frame ${previousEnd}; song ends at frame ${durationInFrames}.`,
    );
  }

  for (const shot of ordered) {
    if (!shot.chaining?.enabled) continue;
    if (!shot.chaining.from) {
      throw new ValidationError(`Shot "${shot.id}" enables chaining but has no "from" shot.`);
    }
    const source = ordered.find((candidate) => candidate.id === shot.chaining?.from);
    if (!source) {
      throw new ValidationError(`Shot "${shot.id}" chains from missing shot "${shot.chaining.from}".`);
    }
    if (source.endFrame > shot.startFrame + toleranceFrames) {
      throw new ValidationError(`Shot "${shot.id}" chains from a shot that does not end before it starts.`);
    }
  }

  return {
    fps,
    durationSeconds: timing.audio.duration,
    durationInFrames,
    shots: ordered,
    warnings,
  };
}

export function sectionAt(timing: Timing, seconds: number): Section | undefined {
  return timing.sections.find(
    (section) => seconds >= section.start - TIMING_TOLERANCE_SECONDS && seconds <= section.end + TIMING_TOLERANCE_SECONDS,
  );
}

export function energyAt(timing: Timing, seconds: number): number {
  if (timing.energy.values.length === 0) return 0;
  const index = Math.floor(seconds * timing.energy.fps);
  return timing.energy.values[Math.max(0, Math.min(timing.energy.values.length - 1, index))] ?? 0;
}

export function beatIndexAt(timing: Timing, seconds: number): number {
  let index = -1;
  for (const [i, beat] of timing.beats.entries()) {
    if (beat <= seconds + TIMING_TOLERANCE_SECONDS) index = i;
    else break;
  }
  return index;
}
