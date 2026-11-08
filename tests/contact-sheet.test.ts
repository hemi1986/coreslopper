import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { loadProject } from '@coreslopper/core';
import { renderContactSheetSvg } from '../packages/cli/src/contact-sheet.js';

describe('contact sheet', () => {
  it('renders every shot and never leaks undefined palette values', async () => {
    const project = await loadProject(join(process.cwd(), 'projects/demo'));
    const svg = renderContactSheetSvg(
      project.config.title,
      project.effectiveTiming!.audio.duration,
      project.effectiveTiming!.bpm,
      [
        {
          ...project.storyboard!.shots[0]!,
          startSeconds: 0,
          endSeconds: 2,
          startFrame: 0,
          endFrame: 60,
          durationInFrames: 60,
        },
        {
          ...project.storyboard!.shots[1]!,
          startSeconds: 2,
          endSeconds: 5,
          startFrame: 60,
          endFrame: 150,
          durationInFrames: 90,
        },
      ],
      project.style!,
    );
    expect(svg).toContain('shot-001');
    expect(svg).toContain('shot-002');
    expect(svg).toContain('MOTION');
    expect(svg).not.toContain('undefined');
    expect(svg.startsWith('<?xml')).toBe(true);
  });
});
