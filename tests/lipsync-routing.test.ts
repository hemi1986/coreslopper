import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BatchSchema, runBatch, type BatchTarget } from '../packages/cli/src/generate.js';
import { resolveBinary } from '../packages/cli/src/media.js';
import { silentWav } from '../packages/providers/src/index.ts';

function hasFfprobe(): boolean {
  try {
    resolveBinary('ffprobe');
    return true;
  } catch {
    return false;
  }
}

function target(providers: Record<string, string>): BatchTarget {
  const root = mkdtempSync(join(tmpdir(), 'cs-lipsync-'));
  writeFileSync(join(root, 'face.png'), '');
  mkdirSync(join(root, 'assets', 'audio-segments'), { recursive: true });
  writeFileSync(join(root, 'assets', 'audio-segments', 'shot-001.wav'), silentWav(2.7));
  return {
    label: 'project',
    config: {
      providers,
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
    operation: 'lipSync',
    role: 'video.lipsync',
    prompt: 'Close-up, static camera. She sings the audio with accurate lip sync.',
    references: ['face.png'],
    audio: 'assets/audio-segments/shot-001.wav',
  },
  { operation: 'imageToVideo', role: 'video.image_to_video.quality', prompt: 'push in', references: ['face.png'] },
]);

describe.skipIf(!hasFfprobe())('lip-sync provider routing', () => {
  it('runs lip-sync on providers.lipsync and other clips on --provider', async () => {
    const [lipsync, clip] = await runBatch(target({ image: 'mock', video: 'mock', lipsync: 'fal' }), batch, {
      dryRun: true,
      log: false,
      provider: 'higgsfield',
    });
    expect(lipsync?.resolved.provider).toBe('fal');
    expect(clip?.resolved.provider).toBe('higgsfield');
  });

  it('overrides the lip-sync provider per batch with lipsyncProvider', async () => {
    const [lipsync, clip] = await runBatch(target({ image: 'mock', video: 'mock', lipsync: 'fal' }), batch, {
      dryRun: true,
      log: false,
      lipsyncProvider: 'higgsfield',
    });
    expect(lipsync?.resolved.provider).toBe('higgsfield');
    expect(lipsync?.resolved.model).toBe('higgsfield-ai/speak');
    expect(clip?.resolved.provider).toBe('mock');
  });

  it('bills Speak v2 for the snapped clip length and passes the audio length on', async () => {
    const [lipsync] = await runBatch(target({ image: 'mock', video: 'mock', lipsync: 'higgsfield' }), batch.slice(0, 1), {
      dryRun: true,
      log: false,
    });
    // 2.7 s of audio bills one 5 s Speak generation at $0.225/s.
    expect(lipsync?.resolved.cost).toBeCloseTo(1.125, 5);
    expect(lipsync?.resolved.durationSeconds).toBeCloseTo(2.7, 2);
  });

  it('bills Topview Avatar 4 by the audio length', async () => {
    const [lipsync] = await runBatch(target({ image: 'mock', video: 'mock', lipsync: 'topview' }), batch.slice(0, 1), {
      dryRun: true,
      log: false,
    });
    expect(lipsync?.resolved.model).toBe('avatar4');
    expect(lipsync?.resolved.cost).toBeCloseTo(0.06, 5);
  });
});
