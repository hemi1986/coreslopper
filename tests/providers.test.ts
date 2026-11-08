import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GenerationRunner, MockProvider, type GenerationRequest } from '@coreslopper/providers';

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'coreslopper-provider-'));
}

describe('generation runner', () => {
  it('caches an identical request and records both calls in the manifest', async () => {
    const root = await tempDir();
    const runner = new GenerationRunner({
      provider: new MockProvider(),
      cacheDir: join(root, 'cache'),
      manifestPath: join(root, 'manifest.jsonl'),
    });
    const request: GenerationRequest = {
      operation: 'generateImage',
      role: 'image.keyframe',
      model: 'mock/image',
      prompt: 'neon rain title card',
      seed: 1234,
      estimatedCostUsd: 0.05,
      outputDir: join(root, 'out-a'),
      projectDir: root,
    };

    const first = await runner.run(request);
    expect(first.cached).toBe(false);
    expect(first.files).toHaveLength(1);
    expect(first.files[0]!.endsWith('.svg')).toBe(true);
    expect(existsSync(first.files[0]!)).toBe(true);

    const second = await runner.run({
      ...request,
      outputDir: join(root, 'out-b'),
    });
    expect(second.cached).toBe(true);
    expect(second.costUsd).toBe(0);
    expect(second.hash).toBe(first.hash);
    expect(existsSync(second.files[0]!)).toBe(true);

    const manifest = (await readFile(join(root, 'manifest.jsonl'), 'utf8')).trim().split('\n');
    expect(manifest).toHaveLength(2);
    expect(JSON.parse(manifest[0]!).cached).toBe(false);
    expect(JSON.parse(manifest[1]!).cached).toBe(true);
  });

  it('changes the cache key when the prompt changes', async () => {
    const root = await tempDir();
    const runner = new GenerationRunner({
      provider: new MockProvider(),
      cacheDir: join(root, 'cache'),
      manifestPath: join(root, 'manifest.jsonl'),
    });
    const base: GenerationRequest = {
      operation: 'imageToVideo',
      role: 'video.image_to_video.quality',
      model: 'mock/video',
      prompt: 'a slow push through neon rain',
      seed: 7,
      durationSeconds: 5,
      estimatedCostUsd: 0.85,
      outputDir: join(root, 'out'),
      projectDir: root,
    };
    const first = await runner.run(base);
    const second = await runner.run({ ...base, prompt: 'a fast push through neon rain' });
    expect(second.hash).not.toBe(first.hash);
    expect(second.cached).toBe(false);
  });
});
