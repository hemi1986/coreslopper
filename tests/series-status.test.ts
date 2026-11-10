import { afterEach, describe, expect, it } from 'vitest';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { stageDefinition } from '@coreslopper/core';
import { collectSeriesStatus, seriesDirFromArg } from '../packages/cli/src/series.ts';

const root = process.cwd();
const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('series status', () => {
  it('lists the canon and every planned episode', async () => {
    const status = await collectSeriesStatus(seriesDirFromArg('demo-series', root));
    expect(status.characters.map((c) => [c.id, c.face])).toEqual([
      ['mara', 'full'],
      ['contact', 'screen-only'],
      ['building', 'voice-only'],
    ]);
    expect(status.characters.find((c) => c.id === 'contact')!.voice).toBe('none');
    expect(status.sets.map((set) => set.id)).toEqual(['office', 'elevator']);
    expect(status.episodes).toHaveLength(2);
    expect(status.episodes[0]).toMatchObject({ episode: 1, slug: 'demo-episode', next: 'voice-track', budgetUsd: 10 });
    expect(status.episodes[0]!.durationSeconds).toBeCloseTo(22.363, 3);
    expect(status.episodes[1]).toEqual({ episode: 2, title: 'Second Floor' });
  });

  it('finds unplanned episodes, duplicates, and other series apart', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'coreslopper-series-'));
    temporary.push(dir);
    await cp(join(root, 'series/demo-series'), join(dir, 'series/demo-series'), { recursive: true });
    for (const [slug, episode, series] of [
      ['ep-01', 1, 'demo-series'],
      ['ep-01-copy', 1, 'demo-series'],
      ['ep-07', 7, 'demo-series'],
      ['other', 3, 'other-series'],
    ] as const) {
      await cp(join(root, 'projects/demo-episode'), join(dir, 'projects', slug), { recursive: true });
      const path = join(dir, 'projects', slug, 'project.yaml');
      const config = parse(await readFile(path, 'utf8'));
      Object.assign(config, { slug, episode, series });
      await writeFile(path, stringify(config));
    }
    const status = await collectSeriesStatus(join(dir, 'series/demo-series'));
    expect(status.episodes.map((episode) => episode.episode)).toEqual([1, 2, 7]);
    expect(status.episodes[0]!.error).toMatch(/also in projects\//);
    expect(status.episodes[2]).toMatchObject({ slug: 'ep-07', next: 'voice-track' });
    expect(() => seriesDirFromArg('nope', dir)).toThrow(/Series "nope" not found/);
  });

  it('marks the interactive stages of each kind', () => {
    expect(stageDefinition('script', 'episode')?.interactive).toBe(true);
    expect(stageDefinition('voice-track', 'episode')?.interactive).toBe(false);
    expect(stageDefinition('treatment')?.interactive).toBe(true);
    expect(stageDefinition('script')).toBeUndefined();
  });
});
