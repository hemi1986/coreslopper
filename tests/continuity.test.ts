import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CharacterBibleSchema,
  SetBibleSchema,
  StoryboardSchema,
  loadProject,
  resolveStoryboard,
  type CharacterBible,
  type SetBible,
} from '@coreslopper/core';
import { checkContinuityRefs } from '../packages/cli/src/qa.ts';

const demoDir = join(process.cwd(), 'projects/demo');
const episodeDir = join(process.cwd(), 'projects/demo-episode');

const sets: SetBible = SetBibleSchema.parse({
  version: 1,
  sets: [
    {
      id: 'stage',
      name: 'Stage',
      description: 'An empty stage.',
      prompt: 'empty stage',
      plates: [{ id: 'front', angle: 'frontal, wide', ref: 'sets/stage/plates/front.png' }],
    },
  ],
  props: [{ id: 'walkman', name: 'Walkman', description: 'Grey cassette Walkman.', refs: ['props/walkman/ref.png'] }],
});

describe('continuity schemas', () => {
  it('keeps old files valid: plates, props, and states default to empty', async () => {
    const bible = SetBibleSchema.parse({ version: 1, sets: [{ id: 'a', name: 'A', description: 'a', prompt: 'a' }] });
    expect(bible.props).toEqual([]);
    expect(bible.sets[0]!.plates).toEqual([]);
    const characters = CharacterBibleSchema.parse({ version: 1, characters: [{ id: 'x', name: 'X', description: 'x' }] });
    expect(characters.characters[0]!.states).toEqual([]);
    const shot = structuredClone((await loadProject(demoDir)).storyboard!.shots[0]!) as Record<string, unknown>;
    delete shot.refs;
    const storyboard = StoryboardSchema.parse({ version: 1, shots: [shot] });
    expect(storyboard.shots[0]!.refs).toMatchObject({ props: [], states: {} });
  });

  it('rejects duplicate plate, prop, and state ids', () => {
    expect(() =>
      SetBibleSchema.parse({
        sets: [{ id: 'a', name: 'A', description: 'a', prompt: 'a', plates: [{ id: 'p', angle: 'x' }, { id: 'p', angle: 'y' }] }],
        props: [{ id: 'q', name: 'Q', description: 'q' }, { id: 'q', name: 'Q', description: 'q' }],
      }),
    ).toThrow(/^(?=[\s\S]*duplicate plate of \\"a\\" id \\"p\\")(?=[\s\S]*duplicate prop id \\"q\\")/);
    expect(() =>
      CharacterBibleSchema.parse({
        characters: [{ id: 'x', name: 'X', description: 'x', states: [{ id: 's', description: 'a' }, { id: 's', description: 'b' }] }],
      }),
    ).toThrow(/duplicate state of \\"x\\" id \\"s\\"/);
  });

  it('requires a plate to look like <set>/<plate>', async () => {
    const shot = structuredClone((await loadProject(demoDir)).storyboard!.shots[0]!);
    shot.refs.plate = 'front';
    expect(() => StoryboardSchema.parse({ version: 1, shots: [shot] })).toThrow(/<set>\/<plate>/);
  });
});

describe('continuity references in a music video', () => {
  async function resolveWith(edit: (shot: any, characters: CharacterBible) => void, withSets: SetBible | null = sets) {
    const project = await loadProject(demoDir);
    const storyboard = structuredClone(project.storyboard!);
    const characters = structuredClone(project.characters!);
    characters.characters.push({
      id: 'robot',
      name: 'Robot',
      description: 'A robot.',
      refs: [],
      face: 'full',
      states: [{ id: 'cable', description: 'hatch open, cable to the Walkman', ref: 'characters/robot/states/cable.png' }],
    });
    edit(storyboard.shots[0], characters);
    return () => resolveStoryboard(storyboard, project.effectiveTiming!, project.style!, characters, 30, 1, { sets: withSets ?? undefined });
  }

  it('accepts an existing plate, prop, and state', async () => {
    const resolve = await resolveWith((shot) => {
      shot.refs.characters = ['robot'];
      shot.refs.plate = 'stage/front';
      shot.refs.props = ['walkman'];
      shot.refs.states = { robot: 'cable' };
    });
    expect(resolve).not.toThrow();
  });

  it('rejects a missing plate, prop, or state', async () => {
    expect(await resolveWith((shot) => (shot.refs.plate = 'stage/side'))).toThrow(/missing plate "stage\/side"/);
    expect(await resolveWith((shot) => (shot.refs.plate = 'roof/front'))).toThrow(/missing set "roof"/);
    expect(await resolveWith((shot) => (shot.refs.props = ['radio']))).toThrow(/missing prop "radio"/);
    expect(
      await resolveWith((shot) => {
        shot.refs.characters = ['robot'];
        shot.refs.states = { robot: 'open' };
      }),
    ).toThrow(/missing state "open" of "robot"/);
  });

  it('rejects a state for a character not in the shot', async () => {
    expect(await resolveWith((shot) => (shot.refs.states = { robot: 'cable' }))).toThrow(/not in its refs\.characters/);
  });

  it('rejects a plate without a sets.yaml', async () => {
    expect(await resolveWith((shot) => (shot.refs.plate = 'stage/front'), null)).toThrow(/no sets\.yaml/);
  });
});

describe('continuity references in an episode', () => {
  it("rejects a plate of another set than the shot's scene", async () => {
    const project = await loadProject(episodeDir);
    const storyboard = structuredClone(project.storyboard!);
    const canon = structuredClone(project.sets!);
    canon.sets.find((set) => set.id === 'elevator')!.plates.push({ id: 'doors', angle: 'frontal' });
    storyboard.shots[0]!.refs.sets = [];
    storyboard.shots[0]!.refs.plate = 'elevator/doors';
    expect(() =>
      resolveStoryboard(storyboard, project.effectiveTiming!, project.style!, project.characters!, 30, 1, {
        episode: { script: project.script!, sets: canon },
      }),
    ).toThrow(/plays in set "office"/);
  });
});

describe('QA continuity references', () => {
  it('fails when a named plate, prop, or state has no image on disk and passes once they exist', async () => {
    const root = mkdtempSync(join(tmpdir(), 'continuity-'));
    const project = await loadProject(demoDir);
    const storyboard = structuredClone(project.storyboard!);
    storyboard.shots[0]!.refs.characters = ['robot'];
    storyboard.shots[0]!.refs.plate = 'stage/front';
    storyboard.shots[0]!.refs.props = ['walkman'];
    storyboard.shots[0]!.refs.states = { robot: 'cable' };
    const characters = CharacterBibleSchema.parse({
      characters: [{ id: 'robot', name: 'Robot', description: 'r', states: [{ id: 'cable', description: 'c', ref: 'states/cable.png' }] }],
    });
    const input = {
      storyboard,
      sets,
      characters,
      paths: { ...project.paths, root, sets: join(root, 'sets.yaml'), characters: join(root, 'characters.yaml') },
    };
    const failed = checkContinuityRefs(input);
    expect(failed.result).toBe('FAIL');
    expect(failed.evidence).toContain('plate stage/front');
    for (const file of ['sets/stage/plates/front.png', 'props/walkman/ref.png', 'states/cable.png']) {
      mkdirSync(join(root, file, '..'), { recursive: true });
      writeFileSync(join(root, file), 'x');
    }
    expect(checkContinuityRefs(input).result).toBe('PASS');
  });

  it('is N/A when no shot names a plate, prop, or state', async () => {
    const project = await loadProject(demoDir);
    expect(checkContinuityRefs(project).result).toBe('N/A');
  });
});
