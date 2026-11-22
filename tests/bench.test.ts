import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';
import {
  BudgetError,
  benchPaths,
  fixturePath,
  loadBenchCases,
  loadBenchConfig,
  loadBenchTargets,
  parseBenchCase,
  rubricScore,
  selectBenchCases,
  type BenchCase,
} from '@coreslopper/core';
import {
  benchItem,
  benchSkipReason,
  importBenchFixtures,
  loadBenchRun,
  runBench,
  wordErrorRate,
  writeBenchReport,
} from '../packages/cli/src/bench.ts';
import { summarizeTargets } from '../packages/cli/src/bench-report.ts';

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  temporary.push(dir);
  return dir;
}

// A 1x1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const editCase = {
  id: 'edit-hands',
  title: 'Edit with hands',
  sets: ['core', 'smoke'],
  focus: 'Hands from a reference.',
  source: { project: 'demo' },
  operation: 'editImage',
  role: 'image.edit',
  seed: 100,
  prompt: 'Keep the person, show both hands.',
  params: { megapixels: 1 },
  fixtures: { start: { from: 'demo/assets/start.png' }, golden: { from: 'demo/assets/golden.png' } },
  inputs: { references: ['start'] },
  golden: 'golden',
  rubric: [
    { id: 'identity', check: 'Same person.', weight: 2 },
    { id: 'hands', check: 'Five fingers.' },
  ],
};

const audioCase = {
  id: 'voice',
  title: 'Voice',
  sets: ['core'],
  focus: 'Speech.',
  operation: 'generateAudio',
  role: 'audio.voice_design',
  seed: 7,
  prompt: 'Guten Morgen zusammen.',
  expectText: 'Guten Morgen zusammen.',
  rubric: [{ id: 'complete', check: 'Every word.' }],
};

/** A bench directory with two cases, a mock target, an image-only mock target, and a paid target. */
async function benchDir(budget = 5): Promise<ReturnType<typeof benchPaths>> {
  const root = await tempDir('coreslopper-bench-');
  const paths = benchPaths(root);
  await mkdir(paths.cases, { recursive: true });
  await writeFile(paths.config, stringify({ version: 1, budget_usd: budget, batch_cap_usd: budget }));
  await writeFile(
    paths.targets,
    stringify({
      version: 1,
      targets: {
        mock: { provider: 'mock', operations: { editImage: { params: { megapixels: 2 } }, generateAudio: {} } },
        'mock-images': { provider: 'mock', operations: { editImage: {} } },
        paid: {
          provider: 'fal',
          operations: { editImage: { model: 'some/model', pricing: { unit: 'image', usd: 4 } } },
        },
      },
    }),
  );
  await writeFile(join(paths.cases, 'edit-hands.yaml'), stringify(editCase));
  await writeFile(join(paths.cases, 'voice.yaml'), stringify(audioCase));
  return paths;
}

async function placeFixtures(paths: ReturnType<typeof benchPaths>): Promise<void> {
  const [benchCase] = await loadBenchCases(paths);
  for (const name of ['start', 'golden']) {
    const path = join(paths.root, fixturePath(benchCase!, name));
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, PNG);
  }
}

describe('bench files', () => {
  it('parses every tracked case and target', async () => {
    const paths = benchPaths();
    const cases = await loadBenchCases(paths);
    // Upstream ships generic examples only: they need no fixtures from a private project (ADR 0048).
    expect(cases.length).toBeGreaterThanOrEqual(1);
    expect(selectBenchCases(cases, { set: 'smoke' }).length).toBeGreaterThanOrEqual(1);
    // A workspace keeps its own cases at update; only the shipped example-* cases must be generic.
    const examples = cases.filter((benchCase) => benchCase.id.startsWith('example-'));
    expect(examples.length).toBeGreaterThanOrEqual(1);
    for (const benchCase of examples) expect([benchCase.id, benchCase.fixtures, benchCase.source]).toEqual([benchCase.id, {}, undefined]);
    const targets = await loadBenchTargets(paths);
    expect(Object.keys(targets)).toContain('local');
    expect(Object.keys(targets)).toContain('mock');
    expect((await loadBenchConfig(paths)).budget_usd).toBeGreaterThanOrEqual(0);
    for (const benchCase of cases) {
      for (const criterion of benchCase.rubric) expect(criterion.check.length).toBeGreaterThan(5);
      // Portable params only: workflow node IDs belong in a target.
      expect(JSON.stringify(benchCase.params)).not.toMatch(/node_inputs/);
    }
  });

  it('rejects inputs that are not fixtures and operations without their inputs', () => {
    expect(() => parseBenchCase({ ...editCase, inputs: { references: ['nope'] } }, 'case')).toThrow(/not a fixture/);
    expect(() => parseBenchCase({ ...editCase, inputs: { references: [] } }, 'case')).toThrow(/needs at least one/);
    expect(() =>
      parseBenchCase({ ...editCase, operation: 'lipSync', role: 'video.lipsync' }, 'case'),
    ).toThrow(/audio input/);
  });

  it('merges role, case, and target params with the target winning', async () => {
    const paths = await benchDir();
    const [benchCase] = await loadBenchCases(paths);
    const targets = await loadBenchTargets(paths);
    const item = benchItem(benchCase!, targets.mock!, 1);
    expect(item).toMatchObject({
      operation: 'editImage',
      seed: 201,
      references: [join('fixtures', 'edit-hands', 'start.png')],
      params: { megapixels: 2 },
    });
  });

  it('runs an i2v case as reference-to-video on a target with as: referenceToVideo', () => {
    const clip = {
      ...editCase,
      id: 'clip',
      operation: 'imageToVideo',
      role: 'video.image_to_video.fast',
      durationSeconds: 2,
    };
    const flex = {
      subjects: [{ is: 'the dancer', picture: 1, role: 'identity anchor' }],
      summary: 'A two-second static shot of the dancer.',
      retention: [{ subject: 1, appears: '[Shot 1]', label: 'fully_preserved', note: 'face and outfit' }],
      style: 'Static camera.',
      shots: ['<Subject 1> sways. At about one second she raises her hands.'],
      soundscape: 'Room tone.',
    };
    const pika = { provider: 'comfyui', operations: { imageToVideo: { as: 'referenceToVideo', params: {} } } } as const;
    const plain = parseBenchCase(clip, 'case');
    expect(benchSkipReason(plain, pika)).toMatch(/no flex prompt/);
    const withFlex = parseBenchCase({ ...clip, flex }, 'case');
    expect(benchSkipReason(withFlex, pika)).toBeUndefined();
    const item = benchItem(withFlex, pika, 0);
    expect(item).toMatchObject({ operation: 'referenceToVideo', role: 'video.reference_to_video', durationSeconds: 2 });
    expect(item.prompt).toContain('non_diegetic_music:');
    // The same case keeps its own operation and prompt on an ordinary target.
    const ltx = { provider: 'comfyui', operations: { imageToVideo: { params: {} } } } as const;
    expect(benchItem(withFlex, ltx, 0)).toMatchObject({ operation: 'imageToVideo', prompt: clip.prompt });
  });

  it('scores a rubric with weights and reports unscored criteria', () => {
    const rubric = parseBenchCase(editCase, 'case').rubric;
    expect(rubricScore(rubric, { criteria: { identity: 2, hands: 1 }, verdict: 'weak', notes: '' })).toBeCloseTo(5 / 6);
    expect(rubricScore(rubric, { criteria: { identity: 2 }, verdict: 'weak', notes: '' })).toBeUndefined();
  });

  it('computes a word error rate on normalized words', () => {
    expect(wordErrorRate('Guten Morgen, zusammen!', 'guten morgen zusammen')).toBe(0);
    expect(wordErrorRate('eins zwei drei vier', 'eins drei vier')).toBe(0.25);
  });
});

describe('bench import', () => {
  it('copies fixtures from a workspace and reports missing sources', async () => {
    const paths = await benchDir();
    const workspace = await tempDir('coreslopper-ws-');
    await mkdir(join(workspace, 'projects', 'demo', 'assets'), { recursive: true });
    await writeFile(join(workspace, 'projects', 'demo', 'assets', 'start.png'), PNG);
    const summary = await importBenchFixtures({ from: workspace, paths });
    expect(summary.copied).toBe(1);
    expect(summary.missing).toEqual([expect.stringContaining('edit-hands.golden')]);
    expect(existsSync(join(paths.root, 'fixtures', 'edit-hands', 'start.png'))).toBe(true);
    const again = await importBenchFixtures({ from: workspace, paths });
    expect(again.skipped).toBe(1);
  });
});

describe('bench run', () => {
  it('refuses to run with missing fixtures', async () => {
    const paths = await benchDir();
    await expect(runBench({ targets: ['mock'], set: 'smoke', paths })).rejects.toThrow(/Missing fixtures/);
  });

  it('runs cases on mock targets, skips uncovered operations, and writes a report', async () => {
    const paths = await benchDir();
    await placeFixtures(paths);
    const run = await runBench({ targets: ['mock', 'mock-images'], seeds: 2, repeat: true, id: 'test', paths });
    const byKey = Object.fromEntries(run.results.map((result) => [result.key, result]));
    expect(byKey['edit-hands/mock/0']).toMatchObject({ status: 'ok', seed: 100, deterministic: true });
    expect(byKey['edit-hands/mock/1']).toMatchObject({ status: 'ok', seed: 201 });
    expect(byKey['edit-hands/mock/1']!.deterministic).toBeUndefined();
    expect(byKey['voice/mock/0']).toMatchObject({ status: 'ok' });
    expect(byKey['voice/mock-images/0']).toMatchObject({ status: 'skipped' });
    for (const result of run.results.filter((value) => value.status === 'ok')) {
      expect(existsSync(join(paths.runs, 'test', result.files[0]!))).toBe(true);
    }

    await mkdir(join(paths.runs, 'test', 'scores'), { recursive: true });
    await writeFile(
      join(paths.runs, 'test', 'scores', 'edit-hands.json'),
      JSON.stringify({
        'edit-hands/mock/0': { criteria: { identity: 2, hands: 2 }, verdict: 'pass', notes: 'clean' },
        'edit-hands/mock/1': { criteria: { identity: 1, hands: 0 }, verdict: 'fail', notes: '' },
      }),
    );
    await writeFile(join(paths.runs, 'test', 'ratings.json'), JSON.stringify({ 'edit-hands/mock/0': { stars: 4 } }));
    const html = await readFile(await writeBenchReport(join(paths.runs, 'test'), paths), 'utf8');
    expect(html).toContain('id="edit-hands"');
    expect(html).toContain('../../fixtures/edit-hands/golden.png');
    expect(html).toContain('"edit-hands/mock/0":{"stars":4}');

    const reloaded = await loadBenchRun(join(paths.runs, 'test'));
    const cases = (await loadBenchCases(paths)) as BenchCase[];
    const scores = {
      'edit-hands/mock/0': { criteria: { identity: 2 as const, hands: 2 as const }, verdict: 'pass' as const, notes: '' },
      'edit-hands/mock/1': { criteria: { identity: 1 as const, hands: 0 as const }, verdict: 'fail' as const, notes: '' },
    };
    const [mock] = summarizeTargets({ run: reloaded, cases, scores, ratings: { 'edit-hands/mock/0': { stars: 4 } } });
    expect(mock).toMatchObject({ target: 'mock', ok: 4, scored: 2, meanStars: 4 });
    expect(mock!.meanScore).toBeCloseTo((1 + 2 / 6) / 2);
    expect(mock!.worstSeedMean).toBeCloseTo(2 / 6);
  });

  it('checks the whole run against the bench budget before the first call', async () => {
    const paths = await benchDir(5);
    await placeFixtures(paths);
    await expect(runBench({ targets: ['paid'], cases: ['edit-hands'], seeds: 2, paths })).rejects.toBeInstanceOf(BudgetError);
    expect(existsSync(paths.state)).toBe(false);
  });
});
