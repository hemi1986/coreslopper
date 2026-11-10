import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import {
  EPISODE_STAGES,
  MUSIC_VIDEO_STAGES,
  ProjectConfigSchema,
  buildSrt,
  loadProject,
  resolveStoryboard,
  stageOutputs,
  subtitleCues,
} from '@coreslopper/core';
import { formatConfig, masterFormatId, outputPath } from '../packages/cli/src/render.ts';
import { subtitlesPath } from '../packages/cli/src/subtitles.ts';
import { subtitleSafeArea } from '../packages/remotion/src/components/Subtitles.tsx';

const root = process.cwd();
const episodeDir = join(root, 'projects/demo-episode');

const base = {
  version: 1,
  slug: 'formats',
  title: 'Formats',
  created: '2026-11-10T00:00:00Z',
  workflow: { version: '0.1.0' },
  budget_usd: 10,
};

describe('master format', () => {
  const musicVideo = ProjectConfigSchema.parse({
    ...base,
    formats: {
      master: { aspect: '16:9', width: 1920, height: 1080 },
      derivatives: [{ aspect: '9:16', width: 1080, height: 1920 }],
    },
  });
  const episode = ProjectConfigSchema.parse({
    ...base,
    kind: 'episode',
    series: 'demo-series',
    episode: 1,
    formats: { master: { aspect: '9:16', width: 1080, height: 1920, fps: 25 } },
  });

  it('is derived from the master aspect', () => {
    expect(masterFormatId(musicVideo)).toBe('16x9');
    expect(masterFormatId(episode)).toBe('9x16');
    expect(() =>
      masterFormatId({ formats: { master: { aspect: '21:9', width: 2520, height: 1080, fps: 30 }, derivatives: [] } }),
    ).toThrow(/21:9 has no render format/);
  });

  it('sizes the master and derivatives and rejects unconfigured formats', () => {
    expect(formatConfig(episode, '9x16')).toEqual({ width: 1080, height: 1920, fps: 25 });
    expect(formatConfig(musicVideo, '16x9')).toEqual({ width: 1920, height: 1080, fps: 30 });
    expect(formatConfig(musicVideo, '9x16')).toEqual({ width: 1080, height: 1920, fps: 30 });
    expect(() => formatConfig(episode, '16x9')).toThrow(/not configured.*Configured: 9x16/);
  });

  it('names renders after the format', () => {
    expect(outputPath({ renders: '/r' }, '9x16', false)).toBe('/r/9x16.mp4');
    expect(outputPath({ renders: '/r' }, '16x9', true)).toBe('/r/preview-16x9.mp4');
    expect(outputPath({ renders: '/r' }, '9x16', false, 'en')).toBe('/r/9x16.en.mp4');
    expect(subtitlesPath('/r', 'demo-episode')).toBe('/r/demo-episode.en.srt');
  });

  it('derives stage outputs from the master format', () => {
    const qa = (stages: typeof MUSIC_VIDEO_STAGES) => stages.find((stage) => stage.id === 'qa-export')!;
    expect(stageOutputs(qa(MUSIC_VIDEO_STAGES), musicVideo)).toEqual(['review/report.md', 'renders/16x9.mp4']);
    expect(stageOutputs(qa(EPISODE_STAGES), { ...episode, slug: 'ep-01' })).toEqual([
      'review/report.md',
      'renders/9x16.mp4',
      'renders/ep-01.en.srt',
    ]);
  });

  it('keeps a 16:9 safe area apart from a 9:16 one', () => {
    expect(subtitleSafeArea(1080, 1920).bottom).toBeGreaterThan(subtitleSafeArea(1920, 1080).bottom);
  });
});

describe('subtitles', () => {
  it('builds an SRT from the subtitled lines in playing order', async () => {
    const project = await loadProject(episodeDir);
    const srt = buildSrt(project.script!, project.effectiveTiming!);
    const blocks = srt.trim().split('\n\n');
    expect(blocks).toHaveLength(5);
    expect(blocks[0]).toBe('1\n00:00:00,000 --> 00:00:04,140\nPast midnight again. Nobody calls anymore.');
    expect(blocks[1]).toContain('Are you still there?');
    expect(srt).not.toMatch(/chime|elevator doors/);
  });

  it('follows the effective timing and wraps long lines', async () => {
    const project = await loadProject(episodeDir);
    const timing = structuredClone(project.effectiveTiming!);
    timing.lines.find((line) => line.id === 'l01')!.start = 3661.5;
    timing.lines.find((line) => line.id === 'l01')!.end = 3663;
    const script = structuredClone(project.script!);
    (script.scenes[0]!.lines[0] as { text_en?: string }).text_en =
      'Past midnight again, and nobody calls the night desk anymore.';
    const cue = subtitleCues(script, timing).find((candidate) => candidate.id === 'l01')!;
    expect(cue.text.split('\n')).toHaveLength(2);
    expect(buildSrt(script, timing)).toContain('01:01:01,500 --> 01:01:03,000');
  });
});

describe('ChatWindow validation', () => {
  async function resolveWith(props: Record<string, unknown>, section?: string) {
    const project = await loadProject(episodeDir);
    const storyboard = structuredClone(project.storyboard!);
    const shot = storyboard.shots[1]!;
    shot.motion!.props = props;
    if (section) shot.section = section;
    return () =>
      resolveStoryboard(storyboard, project.effectiveTiming!, project.style!, project.characters!, 30, 1, {
        script: project.script!,
        sets: project.sets!,
      });
  }

  it('accepts the demo chat shot', async () => {
    expect(await resolveWith({ lines: ['l02'] })).not.toThrow();
  });

  it('needs chat lines of its scene', async () => {
    expect(await resolveWith({})).toThrow(/motion.props.lines/);
    expect(await resolveWith({ lines: ['l99'] })).toThrow(/unknown script line "l99"/);
    expect(await resolveWith({ lines: ['l01'] })).toThrow(/a dialogue line/);
  });

  it('is only for episodes', async () => {
    const project = await loadProject(episodeDir);
    const storyboard = structuredClone(project.storyboard!);
    for (const shot of storyboard.shots) shot.refs.sets = [];
    expect(() =>
      resolveStoryboard(storyboard, project.effectiveTiming!, project.style!, project.characters!, 30),
    ).toThrow(/ChatWindow/);
  });
});
