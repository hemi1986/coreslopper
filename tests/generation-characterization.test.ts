import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BudgetError } from '@coreslopper/core';
import {
  GenerationRunner,
  MockProvider,
  type GenerationRequest,
  type Provider,
  type ProviderKind,
} from '@coreslopper/providers';
import { BatchSchema, runBatch, type BatchTarget } from '../packages/cli/src/generate.js';

// Characterization tests from the adoption of the generation slice (2026-11-21).
// They pin what runBatch and the generation runner do today; they do not assert what they should do.

function target(
  providers: Record<string, string>,
  budget: { totalUsd: number; spentUsd?: number },
  batchCap?: number,
): BatchTarget & { saves: number } {
  const root = mkdtempSync(join(tmpdir(), 'cs-generation-'));
  const result = {
    label: 'project',
    config: {
      providers,
      models: {},
      formats: { master: { id: '16x9', width: 1920, height: 1080 } },
      batch_cap_usd: batchCap,
    } as unknown as BatchTarget['config'],
    state: { budget: { totalUsd: budget.totalUsd, spentUsd: budget.spentUsd ?? 0, reservedUsd: 0 }, updatedAt: '' },
    paths: { root, assets: join(root, 'assets'), manifest: join(root, 'assets', 'manifest.jsonl') },
    saves: 0,
    saveState: async () => {
      result.saves += 1;
    },
  };
  return result;
}

function keyframes(count: number, prompt = 'neon rain, close-up') {
  return BatchSchema.parse(
    Array.from({ length: count }, (_, index) => ({
      operation: 'generateImage',
      role: 'image.keyframe',
      prompt: `${prompt} ${index}`,
      seed: 1000 + index,
    })),
  );
}

const noCalls = (): Provider => {
  throw new Error('no provider may be created');
};

describe('generation characterization', () => {
  it('refuses a paid batch whose worst-case estimate exceeds the batch cap before any provider exists, also as a dry run', async () => {
    // image.keyframe on fal costs $0.05 per image; 30 % of a $1 budget is $0.30.
    const project = target({ image: 'fal', video: 'mock' }, { totalUsd: 1 });
    await expect(runBatch(project, keyframes(7), { dryRun: true, log: false })).rejects.toBeInstanceOf(BudgetError);
    await expect(runBatch(project, keyframes(7), { log: false, providerFactory: noCalls })).rejects.toThrow(/batch cap/);
    const [first] = await runBatch(project, keyframes(6), { dryRun: true, log: false });
    expect(first!.resolved.cost).toBe(0.05);
  });

  it('never lets the batch cap exceed the remaining budget', async () => {
    const project = target({ image: 'fal', video: 'mock' }, { totalUsd: 1, spentUsd: 0.9 }, 50);
    await expect(runBatch(project, keyframes(3), { dryRun: true, log: false })).rejects.toThrow(/remaining project budget/);
    await expect(runBatch(project, keyframes(2), { dryRun: true, log: false })).resolves.toHaveLength(2);
  });

  it('prices local and mock generations at nothing, whatever the role costs', async () => {
    const local = await runBatch(target({ image: 'comfyui', video: 'comfyui' }, { totalUsd: 0 }), keyframes(1), {
      dryRun: true,
      log: false,
    });
    expect(local[0]!.resolved.provider).toBe('comfyui');
    expect(local[0]!.resolved.cost).toBe(0);
    const mock = await runBatch(target({ image: 'mock', video: 'mock' }, { totalUsd: 0 }), keyframes(1), {
      dryRun: true,
      log: false,
    });
    expect(mock[0]!.resolved.cost).toBe(0);
  });

  it('bills a new paid generation at its planned cost and a reuse at nothing, with a manifest line for each', async () => {
    const project = target({ image: 'fal', video: 'mock' }, { totalUsd: 1 });
    const factory = (_kind: ProviderKind): Provider => new MockProvider();
    // A unique cache key keeps this test from reusing an earlier run's result in the workspace cache.
    const options = { log: false as const, providerFactory: factory, cacheKey: { test: randomUUID() } };
    try {
      const [first] = await runBatch(project, keyframes(1), options);
      expect(first!.result!.cached).toBe(false);
      expect(project.state.budget.spentUsd).toBe(0.05);
      expect(project.saves).toBe(1);

      const [second] = await runBatch(project, keyframes(1), options);
      expect(second!.result!.cached).toBe(true);
      expect(project.state.budget.spentUsd).toBe(0.05);
      expect(project.saves).toBe(1);

      const lines = (await readFile(project.paths.manifest, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
      expect(lines.map((line) => [line.cached, line.costUsd, line.status])).toEqual([
        [false, 0.05, 'ok'],
        [true, 0, 'ok'],
      ]);
      expect(lines.reduce((sum, line) => sum + line.costUsd, 0)).toBe(project.state.budget.spentUsd);
    } finally {
      rmSync(project.paths.root, { recursive: true, force: true });
    }
  });

  it('records a failed provider call in the manifest at no cost, caches nothing, and calls the provider again next time', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cs-generation-runner-'));
    let calls = 0;
    const failing = Object.assign(new MockProvider(), {
      async generateImage(): Promise<never> {
        calls += 1;
        throw new Error('provider down');
      },
    });
    const runner = new GenerationRunner({
      provider: failing,
      cacheDir: join(root, 'cache'),
      manifestPath: join(root, 'manifest.jsonl'),
    });
    const request: GenerationRequest = {
      operation: 'generateImage',
      role: 'image.keyframe',
      model: 'mock/image',
      prompt: 'neon rain',
      seed: 7,
      estimatedCostUsd: 0.05,
      outputDir: join(root, 'out'),
      projectDir: root,
    };
    await expect(runner.run(request)).rejects.toThrow('provider down');
    await expect(runner.run(request)).rejects.toThrow('provider down');
    expect(calls).toBe(2);
    const lines = (await readFile(join(root, 'manifest.jsonl'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    expect(lines.map((line) => [line.status, line.costUsd, line.error])).toEqual([
      ['failed', 0, 'provider down'],
      ['failed', 0, 'provider down'],
    ]);
  });

  it('creates the generation runner only in runBatch, and adapters only where they feed it (ADR 0041)', () => {
    const root = join(__dirname, '..');
    const files = ['packages/cli/src', 'packages/core/src', 'packages/remotion/src'].flatMap((dir) =>
      readdirSync(join(root, dir), { recursive: true, encoding: 'utf8' })
        .filter((file) => /\.(ts|tsx)$/.test(file))
        .map((file) => join(root, dir, file)),
    );
    const using = (pattern: RegExp) =>
      files.filter((file) => pattern.test(readFileSync(file, 'utf8'))).map((file) => relative(root, file)).sort();
    expect(using(/new GenerationRunner\b/)).toEqual(['packages/cli/src/generate.ts']);
    // The bench builds providers as runBatch's providerFactory; the release autopilot uses fal's file upload,
    // which is not a generation (publish slice).
    expect(using(/createProvider\(|new (Fal|Higgsfield|Topview|ComfyUI|Mock)Provider\b/)).toEqual([
      'packages/cli/src/bench.ts',
      'packages/cli/src/release-autopilot.ts',
    ]);
  });
});
