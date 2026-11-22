// Characterization tests from the adoption of the bench slice (2026-11-22).
// They pin what the model bench does today; they do not assert what it should do (gap register G-193 to G-206).
import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { BudgetError, benchPaths, fixturePath, loadBenchCases, type BenchCase } from '@coreslopper/core';
import { runBench, type BenchRun } from '../packages/cli/src/bench.ts';
import { summarizeTargets } from '../packages/cli/src/bench-report.ts';

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

// A 1x1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const editCase = {
  id: 'edit-pin',
  title: 'Edit, pinned',
  sets: ['core'],
  focus: 'Characterization only.',
  operation: 'editImage',
  role: 'image.edit',
  seed: 4242,
  prompt: 'Keep the person, characterization pin.',
  fixtures: { start: { from: 'demo/assets/start.png' } },
  inputs: { references: ['start'] },
  rubric: [{ id: 'identity', check: 'Same person as the start frame.' }],
};

/** A bench directory with one edit case, a mock target and a paid target; `config` replaces bench.yaml. */
async function benchDir(config: Record<string, unknown>): Promise<ReturnType<typeof benchPaths>> {
  const root = await mkdtemp(join(tmpdir(), 'coreslopper-bench-pin-'));
  temporary.push(root);
  const paths = benchPaths(root);
  await mkdir(paths.cases, { recursive: true });
  await writeFile(paths.config, stringify({ version: 1, ...config }));
  await writeFile(
    paths.targets,
    stringify({
      version: 1,
      targets: {
        mock: { provider: 'mock', operations: { editImage: {} } },
        paid: { provider: 'fal', operations: { editImage: { model: 'some/model', pricing: { unit: 'image', usd: 4 } } } },
      },
    }),
  );
  await writeFile(join(paths.cases, 'edit-pin.yaml'), stringify(editCase));
  const [benchCase] = await loadBenchCases(paths);
  const start = join(paths.root, fixturePath(benchCase!, 'start'));
  await mkdir(join(start, '..'), { recursive: true });
  await writeFile(start, PNG);
  return paths;
}

describe('bench characterization', () => {
  it('runs every planned item again when a run is extended with its id; the earlier result comes back as a cache hit', async () => {
    const paths = await benchDir({ budget_usd: 5 });
    await runBench({ targets: ['mock'], cases: ['edit-pin'], id: 'again', paths });
    const second = await runBench({ targets: ['mock'], cases: ['edit-pin'], id: 'again', paths });
    expect(second.results).toHaveLength(1);
    expect(second.results[0]).toMatchObject({ key: 'edit-pin/mock/0', status: 'ok', cached: true });
  });

  it('turns an item above 30 % of the remaining bench budget into an error result when bench.yaml sets no batch cap', async () => {
    const paths = await benchDir({ budget_usd: 10 });
    const run = await runBench({ targets: ['paid'], cases: ['edit-pin'], dryRun: true, paths });
    expect(run.results).toHaveLength(1);
    expect(run.results[0]).toMatchObject({ key: 'edit-pin/paid/0', status: 'error' });
    expect(run.results[0]!.error).toMatch(/batch cap|exceeds/);
  });

  it('refuses a dry run whose estimate exceeds the bench budget instead of listing the plan', async () => {
    const paths = await benchDir({ budget_usd: 5, batch_cap_usd: 5 });
    await expect(
      runBench({ targets: ['paid'], cases: ['edit-pin'], seeds: 2, dryRun: true, paths }),
    ).rejects.toBeInstanceOf(BudgetError);
  });

  it('counts a scored error result in the rubric mean and cache-hit times in the mean time', () => {
    const cases = [{ ...editCase, sets: ['core'], refusalOk: false, frames: [0.5], rubric: [{ ...editCase.rubric[0]!, weight: 1 }], inputs: { references: ['start'] }, params: {} }] as unknown as BenchCase[];
    const run: BenchRun = {
      id: 'pin',
      createdAt: '2026-11-22T00:00:00.000Z',
      updatedAt: '2026-11-22T00:00:00.000Z',
      cases: ['edit-pin'],
      targets: { mock: { provider: 'mock' } },
      seeds: 2,
      results: [
        { key: 'edit-pin/mock/0', case: 'edit-pin', target: 'mock', seedIndex: 0, seed: 4242, status: 'ok', files: [], cached: true, elapsedSeconds: 10 },
        { key: 'edit-pin/mock/1', case: 'edit-pin', target: 'mock', seedIndex: 1, seed: 4343, status: 'error', error: 'boom', files: [] },
      ],
    };
    const scores = {
      'edit-pin/mock/0': { criteria: { identity: 2 as const }, verdict: 'pass' as const, notes: '' },
      'edit-pin/mock/1': { criteria: { identity: 0 as const }, verdict: 'fail' as const, notes: '' },
    };
    const [mock] = summarizeTargets({ run, cases, scores, ratings: {} });
    expect(mock).toMatchObject({ ok: 1, errors: 1, scored: 2, meanSeconds: 10 });
    expect(mock!.meanScore).toBeCloseTo(0.5);
  });
});
