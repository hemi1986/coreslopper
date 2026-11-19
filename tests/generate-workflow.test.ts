import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BatchSchema, runBatch, type BatchTarget } from '../packages/cli/src/generate.js';

function target(): BatchTarget {
  const root = mkdtempSync(join(tmpdir(), 'cs-workflow-'));
  writeFileSync(join(root, 'frame.png'), '');
  return {
    label: 'project',
    config: {
      providers: { image: 'comfyui', video: 'comfyui' },
      models: {},
      formats: { master: { id: '16x9', width: 1920, height: 1080 } },
      batch_cap_usd: undefined,
    } as unknown as BatchTarget['config'],
    state: { budget: { totalUsd: 10, spentUsd: 0, reservedUsd: 0 }, updatedAt: '' },
    paths: { root, assets: join(root, 'assets'), manifest: join(root, 'assets', 'manifest.jsonl') },
    saveState: async () => undefined,
  };
}

const batch = BatchSchema.parse([
  {
    operation: 'editImage',
    role: 'image.edit',
    prompt: 'make it night',
    references: ['frame.png'],
    params: { workflow: 'qwen-edit-quality' },
  },
]);

describe('params.workflow', () => {
  it('picks another local workflow for one item and is not passed on as a param', async () => {
    const [entry] = await runBatch(target(), batch, { dryRun: true, log: false });
    expect(entry?.resolved.model).toBe('qwen-edit-quality');
    expect(entry?.resolved.params).not.toHaveProperty('workflow');
  });

  it('is ignored when the item runs on a cloud provider', async () => {
    const [entry] = await runBatch(target(), batch, { dryRun: true, log: false, provider: 'higgsfield' });
    expect(entry?.resolved.model).toBe('alibaba/qwen-image-3/edit');
    expect(entry?.resolved.params).not.toHaveProperty('workflow');
  });

  it('rejects an empty workflow name', async () => {
    const bad = BatchSchema.parse([{ ...batch[0], params: { workflow: '' } }]);
    await expect(runBatch(target(), bad, { dryRun: true, log: false })).rejects.toThrow(/params.workflow/);
  });
});

describe('negativePrompt', () => {
  it('is rejected for local clips, where the distilled LTX models run at CFG 1', async () => {
    const clip = BatchSchema.parse([
      {
        operation: 'imageToVideo',
        role: 'video.image_to_video.fast',
        prompt: 'she turns her head',
        negativePrompt: 'blurry',
        references: ['frame.png'],
      },
    ]);
    await expect(runBatch(target(), clip, { dryRun: true, log: false })).rejects.toThrow(/no effect/);
  });

  it('is kept for local stills', async () => {
    const still = BatchSchema.parse([{ ...batch[0], negativePrompt: 'blurry' }]);
    const [entry] = await runBatch(target(), still, { dryRun: true, log: false });
    expect(entry?.resolved.item.negativePrompt).toBe('blurry');
  });
});
