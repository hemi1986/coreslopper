import { afterEach, describe, expect, it } from 'vitest';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import {
  CharacterBibleSchema,
  SeriesSchema,
  SeriesStateSchema,
  SetBibleSchema,
  StyleBibleSchema,
  loadSeries,
  readJsonFile,
  readYamlFile,
} from '@coreslopper/core';
import { createSeries } from '../packages/cli/src/new-series.ts';
import { createProject } from '../packages/cli/src/new-project.ts';
import { generateBatch, seriesTarget } from '../packages/cli/src/generate.ts';
import { seriesBudget } from '../packages/cli/src/series.ts';
import { validateChangedFile } from '../packages/cli/src/validate-file.ts';

const root = process.cwd();
const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

/** A throwaway workspace with config, templates, and brand kits. */
async function workspace(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'coreslopper-series-'));
  temporary.push(dir);
  for (const folder of ['config', 'templates', 'brand']) {
    await cp(join(root, folder), join(dir, folder), { recursive: true });
  }
  return dir;
}

describe('new-series', () => {
  it('creates a canon that validates, with its budget in state.json', async () => {
    const dir = await workspace();
    const seriesDir = await createSeries({ root: dir, slug: 'restlaufzeit', budget: 120, format: '9x16', providers: { audio: 'comfyui' } });
    const series = await readYamlFile(join(seriesDir, 'series.yaml'), SeriesSchema);
    expect(series).toMatchObject({
      slug: 'restlaufzeit',
      title: 'Restlaufzeit',
      budget_usd: 120,
      formats: { master: { aspect: '9:16', width: 1080, height: 1920 } },
      providers: { image: 'mock', video: 'mock', audio: 'comfyui' },
    });
    expect((await readYamlFile(join(seriesDir, 'style.yaml'), StyleBibleSchema)).name).toBe('Restlaufzeit');
    expect((await readYamlFile(join(seriesDir, 'characters.yaml'), CharacterBibleSchema)).characters).toEqual([]);
    expect((await readYamlFile(join(seriesDir, 'sets.yaml'), SetBibleSchema)).sets).toEqual([]);
    expect((await readJsonFile(join(seriesDir, 'state.json'), SeriesStateSchema)).budget).toEqual({
      totalUsd: 120,
      spentUsd: 0,
      reservedUsd: 0,
    });
    expect(await readFile(join(seriesDir, 'bible.md'), 'utf8')).toContain('# Restlaufzeit — series bible');
    for (const file of ['series.yaml', 'state.json', 'style.yaml', 'characters.yaml', 'sets.yaml']) {
      await expect(validateChangedFile(join(seriesDir, file))).resolves.toBeDefined();
    }
    await expect(createSeries({ root: dir, slug: 'restlaufzeit', budget: 10 })).rejects.toThrow(/already exists/);
    await expect(createSeries({ root: dir, slug: 'other' })).rejects.toThrow(/series budget is required/);
  });

  it('rejects a series budget that disagrees with state.json', async () => {
    const dir = await workspace();
    const seriesDir = await createSeries({ root: dir, slug: 'drift', budget: 40 });
    const path = join(seriesDir, 'series.yaml');
    const series = parse(await readFile(path, 'utf8'));
    series.budget_usd = 60;
    await writeFile(path, stringify(series));
    await expect(validateChangedFile(path)).rejects.toThrow(/does not match series.yaml budget_usd/);
    const loaded = await loadSeries(seriesDir);
    expect(() => seriesTarget(loaded)).toThrow(/budget \(40\) does not match series.yaml budget_usd \(60\)/);
  });
});

describe('series budget', () => {
  it('commits canon spend and episode budgets, and refuses an episode beyond it', async () => {
    const dir = await workspace();
    const seriesDir = await createSeries({ root: dir, slug: 'umbrella', budget: 30 });
    const statePath = join(seriesDir, 'state.json');
    const state = await readJsonFile(statePath, SeriesStateSchema);
    state.budget.spentUsd = 8;
    await writeFile(statePath, JSON.stringify(state));

    await createProject({ root: dir, slug: 'umbrella-01', budget: 12, kind: 'episode', series: 'umbrella', episode: 1 });
    expect(await seriesBudget(seriesDir)).toEqual({ totalUsd: 30, canonSpentUsd: 8, episodeBudgetsUsd: 12, remainingUsd: 10 });
    await expect(
      createProject({ root: dir, slug: 'umbrella-02', budget: 11, kind: 'episode', series: 'umbrella', episode: 2 }),
    ).rejects.toThrow(/exceeds the uncommitted series budget \$10\.00/);
    expect(existsSync(join(dir, 'projects/umbrella-02'))).toBe(false);
    await createProject({ root: dir, slug: 'umbrella-02', budget: 10, kind: 'episode', series: 'umbrella', episode: 2 });
    expect((await seriesBudget(seriesDir)).remainingUsd).toBe(0);
  });

  it('leaves episodes unchecked without a series budget', async () => {
    const dir = await workspace();
    const seriesDir = await createSeries({ root: dir, slug: 'open', budget: 5 });
    const path = join(seriesDir, 'series.yaml');
    const series = parse(await readFile(path, 'utf8'));
    delete series.budget_usd;
    await writeFile(path, stringify(series));
    await createProject({ root: dir, slug: 'open-01', budget: 500, kind: 'episode', series: 'open', episode: 1 });
    expect((await seriesBudget(seriesDir)).remainingUsd).toBeUndefined();
    expect(() => seriesTarget({ series: SeriesSchema.parse(series), state: {} as never, paths: {} as never })).toThrow(
      /no budget_usd/,
    );
  });
});

describe('canon generations', () => {
  it('run through the series budget, cache, and manifest', async () => {
    const dir = await workspace();
    const seriesDir = await createSeries({ root: dir, slug: 'canon', budget: 20 });
    const batch = join(dir, 'batch.json');
    await writeFile(
      batch,
      JSON.stringify([{ operation: 'generateImage', role: 'image.character_sheet', prompt: 'canon test character sheet, front and side' }]),
    );
    await generateBatch({ projectDir: '', seriesDir, batchPath: batch });
    const manifest = (await readFile(join(seriesDir, 'assets/manifest.jsonl'), 'utf8')).trim().split('\n');
    expect(manifest).toHaveLength(1);
    expect(JSON.parse(manifest[0]!)).toMatchObject({ role: 'image.character_sheet', status: 'ok', provider: 'mock' });
    const loaded = await loadSeries(seriesDir);
    expect(loaded.state.budget.spentUsd).toBe(0);
    expect(existsSync(join(seriesDir, 'assets/image/character_sheet'))).toBe(true);
  });
});
