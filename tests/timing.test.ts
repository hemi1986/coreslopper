import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import {
  TimingOverridesSchema,
  ValidationError,
  loadProject,
  mergeTiming,
  resolveAnchor,
  resolveStoryboard,
} from '@coreslopper/core';

const projectDir = join(process.cwd(), 'projects/demo');

describe('timing', () => {
  it('loads the demo and resolves the storyboard without gaps', async () => {
    const project = await loadProject(projectDir);
    expect(project.timing).toBeDefined();
    expect(project.effectiveTiming).toBeDefined();
    expect(project.storyboard).toBeDefined();
    expect(project.style).toBeDefined();
    expect(project.characters).toBeDefined();

    const resolved = resolveStoryboard(
      project.storyboard!,
      project.effectiveTiming!,
      project.style!,
      project.characters!,
      30,
    );
    expect(resolved.shots).toHaveLength(6);
    expect(resolved.durationInFrames).toBe(360);
    expect(resolved.shots[0]!.startFrame).toBe(0);
    expect(resolved.shots.at(-1)!.endFrame).toBe(360);
  });

  it('resolves section, line, word, beat, and time anchors', async () => {
    const project = await loadProject(projectDir);
    const timing = project.effectiveTiming!;
    expect(resolveAnchor({ type: 'section', id: 'chorus_1', edge: 'start', offset: 0 }, timing)).toBe(5);
    expect(resolveAnchor({ type: 'line', id: 'l3', edge: 'start', offset: 0 }, timing)).toBe(5.5);
    expect(resolveAnchor({ type: 'word', line: 'l4', index: 3, edge: 'end', offset: 0 }, timing)).toBe(8.8);
    expect(resolveAnchor({ type: 'beat', index: 10, offset: 0 }, timing)).toBe(5);
    expect(resolveAnchor({ type: 'time', seconds: 3.25 }, timing)).toBe(3.25);
  });

  it('applies overrides with precedence and keeps the storyboard covered', async () => {
    const project = await loadProject(projectDir);
    const overrides = TimingOverridesSchema.parse({
      sections: [
        { id: 'intro', start: 0, end: 2.5 },
        { id: 'verse_1', start: 2.5, end: 5 },
      ],
      words: [{ line: 'l1', index: 0, start: 0.4, end: 0.8 }],
    });
    const merged = mergeTiming(project.timing!, overrides);
    expect(merged.sections[0]!.end).toBe(2.5);
    expect(merged.sections[1]!.start).toBe(2.5);
    expect(merged.lines[0]!.words[0]!.start).toBe(0.4);

    const resolved = resolveStoryboard(
      project.storyboard!,
      merged,
      project.style!,
      project.characters!,
      30,
    );
    expect(resolved.shots[0]!.endSeconds).toBe(2.5);
    expect(resolved.shots[1]!.startSeconds).toBe(2.5);
  });

  it('rejects a storyboard with a gap', async () => {
    const project = await loadProject(projectDir);
    const storyboard = structuredClone(project.storyboard!);
    const second = storyboard.shots[1]!;
    if (second.start.type !== 'section') throw new Error('fixture changed');
    second.start.offset = 0.2;

    expect(() =>
      resolveStoryboard(storyboard, project.effectiveTiming!, project.style!, project.characters!, 30),
    ).toThrow(ValidationError);
  });

  it('rejects an unknown style reference', async () => {
    const project = await loadProject(projectDir);
    const storyboard = structuredClone(project.storyboard!);
    storyboard.shots[0]!.refs.style = ['palette.not-a-token'];
    expect(() =>
      resolveStoryboard(storyboard, project.effectiveTiming!, project.style!, project.characters!, 30),
    ).toThrow(/missing style token/);
  });

  it('rejects an unknown motion component', async () => {
    const project = await loadProject(projectDir);
    const storyboard = structuredClone(project.storyboard!);
    storyboard.shots[0]!.motion = { component: 'NotARealComponent', props: {} };
    expect(() =>
      resolveStoryboard(storyboard, project.effectiveTiming!, project.style!, project.characters!, 30),
    ).toThrow(/unknown component/);
  });

  it('rejects an invalid timing override that creates a section overlap', async () => {
    const project = await loadProject(projectDir);
    const overrides = TimingOverridesSchema.parse({
      sections: [{ id: 'intro', start: 0, end: 3 }],
    });
    try {
      mergeTiming(project.timing!, overrides);
      throw new Error('expected mergeTiming to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).details.join('\n')).toMatch(/gap or overlap/);
    }
  });
});
