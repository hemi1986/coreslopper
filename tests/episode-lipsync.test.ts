import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { StoryboardSchema, lipSyncSource, loadProject, resolveStoryboard, type EpisodeContext } from '@coreslopper/core';
import { segmentSource } from '../packages/cli/src/media.ts';
import { validateProject } from '../packages/cli/src/validate.ts';

const episodeDir = join(process.cwd(), 'projects/demo-episode');

describe('lip-sync source', () => {
  it('defaults to the vocal stem of a music video and the speaker stem of an episode', () => {
    const shot = StoryboardSchema.parse({
      version: 1,
      shots: [
        {
          id: 'shot-001',
          section: 'intro',
          start: { type: 'section', id: 'intro' },
          end: { type: 'section', id: 'intro', edge: 'end' },
          source: 'ai-clip',
          description: 'face',
          lipSync: { character: 'mara' },
        },
      ],
    }).shots[0]!;
    expect(lipSyncSource(shot, 'music-video')).toBe('audio/stems/vocals.wav');
    expect(lipSyncSource(shot, undefined)).toBe('audio/stems/vocals.wav');
    expect(lipSyncSource(shot, 'episode')).toBe('audio/stems/mara.wav');
    expect(lipSyncSource({ lipSync: { character: 'mara', source: 'audio/song.wav' } }, 'episode')).toBe('audio/song.wav');
    expect(lipSyncSource({}, 'episode')).toBeUndefined();
  });

  it('cuts episode segments from the speaker stem', () => {
    expect(segmentSource('music-video', {})).toBe('audio/stems/vocals.wav');
    expect(segmentSource('episode', { character: 'mara' })).toBe('audio/stems/mara.wav');
    expect(segmentSource('episode', { source: 'audio/episode.wav', character: 'mara' })).toBe('audio/episode.wav');
    expect(() => segmentSource('episode', {})).toThrow(/--character/);
  });
});

describe('episode lip-sync rules', () => {
  async function resolveWith(edit: (shot: any, characters: any) => void, limits: Partial<EpisodeContext> = {}) {
    const project = await loadProject(episodeDir);
    const storyboard = structuredClone(project.storyboard!);
    const characters = structuredClone(project.characters!);
    edit(storyboard.shots[2], characters);
    return () =>
      resolveStoryboard(storyboard, project.effectiveTiming!, project.style!, characters, 30, 1, {
        script: project.script!,
        sets: project.sets!,
        ...limits,
      });
  }

  it('accepts the demo lip-sync shot within its limits', async () => {
    const { resolved } = await validateProject(episodeDir, { write: false });
    expect(resolved.shots[2]!.lipSync).toEqual({ character: 'mara' });
    expect(await resolveWith(() => {}, { lipsyncMaxDuration: 30, lipsyncSecondsMax: 8 })).not.toThrow();
  });

  it('rejects characters whose display rule hides the face', async () => {
    for (const face of ['silhouette', 'voice-only']) {
      const resolve = await resolveWith((shot, characters) => {
        characters.characters.find((c: { id: string }) => c.id === 'mara').face = face;
      });
      expect(resolve).toThrow(new RegExp(`display rule "${face}"`));
    }
    const screen = await resolveWith((shot, characters) => {
      characters.characters.find((c: { id: string }) => c.id === 'mara').face = 'screen-only';
    });
    expect(screen).not.toThrow();
    const missing = await resolveWith((shot) => {
      shot.lipSync.character = 'nobody';
    });
    expect(missing).toThrow(/missing character "nobody"/);
  });

  it("rejects shots longer than the provider's maximum or the series limit", async () => {
    // shot-003 lasts 3.19 s
    expect(await resolveWith(() => {}, { lipsyncMaxDuration: 3 })).toThrow(/at most 3s on the selected provider/);
    expect(await resolveWith(() => {}, { lipsyncSecondsMax: 2 })).toThrow(/series allows lip-sync shots of at most 2s/);
  });
});
