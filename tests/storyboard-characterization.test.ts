/**
 * Characterization tests for the storyboard (adoption of the storyboard slice, 2026-11-21).
 * They pin what resolveStoryboard does today where no other test does: coverage, order and ids, the source
 * rules, highlights and chaining. They do not assert the decided rules that are still ahead of the code
 * (gap register G-69 to G-85), and they do not pin the behaviour those gaps describe.
 */
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  StoryboardSchema,
  ValidationError,
  loadProject,
  resolveStoryboard,
  type CharacterBible,
  type StyleBible,
  type Timing,
} from '../packages/core/src/index.ts';

const demoDir = join(process.cwd(), 'projects/demo');
const FPS = 30;

let timing: Timing;
let style: StyleBible;
let characters: CharacterBible;
let duration: number;

beforeAll(async () => {
  const project = await loadProject(demoDir);
  timing = project.effectiveTiming!;
  style = project.style!;
  characters = project.characters!;
  duration = timing.audio.duration;
});

type ShotInput = Record<string, unknown>;

function motionShot(id: string, start: number, end: number, extra: ShotInput = {}): ShotInput {
  return {
    id,
    section: timing.sections[0]!.id,
    start: { type: 'time', seconds: start },
    end: { type: 'time', seconds: end },
    source: 'motion',
    description: `shot ${id}`,
    motion: { component: 'TitleCard' },
    ...extra,
  };
}

function resolve(shots: ShotInput[]) {
  return resolveStoryboard(StoryboardSchema.parse({ version: 1, shots }), timing, style, characters, FPS);
}

function covering(first: ShotInput): ShotInput[] {
  return [first, motionShot('shot-002', 2, duration)];
}

describe('storyboard characterization – coverage, order and ids', () => {
  it('accepts shots that cover the audio within one frame and warns about time anchors', () => {
    const resolved = resolve([motionShot('shot-001', 0, 2), motionShot('shot-002', 2 + 1 / FPS, duration)]);
    expect(resolved.durationInFrames).toBe(Math.round(duration * FPS));
    expect(resolved.shots.map((shot) => [shot.startFrame, shot.endFrame])).toEqual([
      [0, 60],
      [61, Math.round(duration * FPS)],
    ]);
    expect(resolved.warnings).toEqual([
      'Shot "shot-001" uses an explicit time anchor; prefer a symbolic anchor.',
      'Shot "shot-002" uses an explicit time anchor; prefer a symbolic anchor.',
    ]);
  });

  it('rejects a late start, a gap, an overlap and a short end, each beyond one frame', () => {
    expect(() => resolve([motionShot('shot-001', 0.1, 2), motionShot('shot-002', 2, duration)])).toThrow(
      'Storyboard must start at 0; first shot starts at frame 3.',
    );
    expect(() => resolve([motionShot('shot-001', 0, 2), motionShot('shot-002', 2.1, duration)])).toThrow(
      'Gap of 3 frame(s) before shot "shot-002".',
    );
    expect(() => resolve([motionShot('shot-001', 0, 2.1), motionShot('shot-002', 2, duration)])).toThrow(
      'Overlap of 3 frame(s) at shot "shot-002".',
    );
    expect(() => resolve([motionShot('shot-001', 0, 2), motionShot('shot-002', 2, duration - 0.1)])).toThrow(
      /^Storyboard ends at frame \d+; song ends at frame \d+\.$/,
    );
  });

  it('rejects shots out of order, a duplicate id, an unknown section, an empty or sub-frame shot, and a bad id', () => {
    expect(() => resolve([motionShot('shot-002', 2, duration), motionShot('shot-001', 0, 2)])).toThrow(
      'Storyboard shots must be ordered by start time.',
    );
    expect(() => resolve([motionShot('shot-001', 0, 2), motionShot('shot-001', 2, duration)])).toThrow(
      'Duplicate shot id "shot-001".',
    );
    expect(() => resolve(covering(motionShot('shot-001', 0, 2, { section: 'nowhere' })))).toThrow(
      'Shot "shot-001" references unknown section "nowhere".',
    );
    expect(() => resolve(covering(motionShot('shot-001', 2, 2)))).toThrow('Shot "shot-001" ends at or before its start.');
    expect(() => resolve(covering(motionShot('shot-001', 0, 0.01)))).toThrow('Shot "shot-001" is shorter than one frame.');
    expect(() => StoryboardSchema.parse({ version: 1, shots: [motionShot('shot-1', 0, duration)] })).toThrow(
      /shot id must look like shot-001/,
    );
  });
});

describe('storyboard characterization – shot sources', () => {
  it('requires a motion component, both prompts of an ordinary AI clip, and the asset of footage', () => {
    expect(() => resolve(covering(motionShot('shot-001', 0, 2, { motion: {} })))).toThrow(
      'Motion shot "shot-001" must set motion.component.',
    );
    expect(() => resolve(covering(motionShot('shot-001', 0, 2, { source: 'ai-clip', motion: undefined, prompts: { keyframe: 'k' } })))).toThrow(
      'AI clip shot "shot-001" must set prompts.keyframe and prompts.video.',
    );
    expect(() => resolve(covering(motionShot('shot-001', 0, 2, { source: 'footage', motion: undefined })))).toThrow(
      'Footage shot "shot-001" must set asset.',
    );
    expect(() =>
      resolve(covering(motionShot('shot-001', 0, 2, { source: 'ai-clip', motion: undefined, prompts: { keyframe: 'k', video: 'v' } }))),
    ).not.toThrow();
  });

  it('requires a mixed shot to have two layers, a footage layer an asset, and a motion layer a known component', () => {
    const mixed = (layers: ShotInput[]) => motionShot('shot-001', 0, 2, { source: 'mixed', motion: undefined, layers });
    expect(() => resolve(covering(mixed([{ type: 'motion', component: 'Grid' }])))).toThrow(
      'Mixed shot "shot-001" must have at least two layers.',
    );
    expect(() => resolve(covering(mixed([{ type: 'motion', component: 'Grid' }, { type: 'footage' }])))).toThrow(
      'Mixed shot "shot-001" layer 1 is footage but has no asset.',
    );
    expect(() => resolve(covering(mixed([{ type: 'motion', component: 'Nope' }, { type: 'footage', asset: 'a.mp4' }])))).toThrow(
      'Mixed shot "shot-001" layer 0 uses unknown component "Nope".',
    );
    expect(() => resolve(covering(mixed([{ type: 'motion', component: 'Grid' }, { type: 'footage', asset: 'a.mp4' }])))).not.toThrow();
  });
});

describe('storyboard characterization – highlights and chaining', () => {
  it('requires a highlight to be a word or a run of words of the text, ignoring case', () => {
    expect(() => resolve(covering(motionShot('shot-001', 0, 2, { highlights: ['run'] })))).toThrow(
      'Shot "shot-001" has highlights but no text.',
    );
    expect(() => resolve(covering(motionShot('shot-001', 0, 2, { text: 'We run', highlights: ['fly'] })))).toThrow(
      'Shot "shot-001" highlight "fly" is not a word or a run of words of its text.',
    );
    expect(() => resolve(covering(motionShot('shot-001', 0, 2, { text: 'We run all night', highlights: ['e ru'] })))).toThrow(
      'highlight "e ru" is not a word or a run of words',
    );
    expect(() => resolve(covering(motionShot('shot-001', 0, 2, { text: 'We RUN', highlights: ['run'] })))).not.toThrow();
    expect(() => resolve(covering(motionShot('shot-001', 0, 2, { text: 'We run (all night)', highlights: ['all night'] })))).not.toThrow();
  });

  it('requires a chained shot to name an existing shot that ends before it starts', () => {
    const chained = (chaining: ShotInput) => [motionShot('shot-001', 0, 2), motionShot('shot-002', 2, duration, { chaining })];
    expect(() => resolve(chained({ enabled: true }))).toThrow('Shot "shot-002" enables chaining but has no "from" shot.');
    expect(() => resolve(chained({ enabled: true, from: 'shot-009' }))).toThrow('Shot "shot-002" chains from missing shot "shot-009".');
    expect(() => resolve(chained({ enabled: true, from: 'shot-002' }))).toThrow(
      'Shot "shot-002" chains from a shot that does not end before it starts.',
    );
    expect(() => resolve(chained({ enabled: true, from: 'shot-001' }))).not.toThrow();
    expect(() => resolve(chained({ enabled: false, from: 'shot-009' }))).not.toThrow();
  });
});

describe('storyboard characterization – errors are validation errors', () => {
  it('throws ValidationError, not a generic error', () => {
    expect(() => resolve([motionShot('shot-001', 0, 2)])).toThrow(ValidationError);
  });
});
