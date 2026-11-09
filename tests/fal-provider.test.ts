import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FalProvider, type FetchLike } from '../packages/providers/src/index.ts';

const temporary: string[] = [];

async function tempDir(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'coreslopper-fal-'));
  temporary.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function runImageToVideo(model: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const directory = await tempDir();
  const reference = join(directory, 'first-frame.png');
  await writeFile(reference, 'frame');

  let submitted: Record<string, unknown> | undefined;
  const fetchImpl: FetchLike = async (url, init) => {
    if (url === `https://queue.fal.run/${model}`) {
      submitted = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return json({
        request_id: 'req-1',
        status_url: 'https://queue.fal.run/status',
        response_url: 'https://queue.fal.run/response',
      });
    }
    if (url === 'https://queue.fal.run/status') return json({ status: 'COMPLETED' });
    if (url === 'https://queue.fal.run/response') return json({ video: { url: 'https://cdn.example.com/clip.mp4' } });
    if (url === 'https://cdn.example.com/clip.mp4') {
      return new Response(Buffer.from('fake-mp4'), { status: 200, headers: { 'content-type': 'video/mp4' } });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const provider = new FalProvider({ apiKey: 'test-key', fetchImpl, pollIntervalMs: 1 });
  const result = await provider.imageToVideo({
    model,
    prompt: 'slow push in',
    references: [reference],
    durationSeconds: 5,
    seed: 7,
    params,
    outputDir: join(directory, 'out'),
  });
  expect(result.files[0]!.endsWith('.mp4')).toBe(true);
  return submitted!;
}

describe('fal provider', () => {
  it('sends the start frame as start_image_url for Kling v4 and keeps adapter options out', async () => {
    const body = await runImageToVideo('kling/v4/image-to-video', {
      resolution: '1080p',
      reference_field: 'start_image_url',
    });
    expect(body.start_image_url).toMatch(/^data:/);
    expect(body).not.toHaveProperty('image_url');
    expect(body).not.toHaveProperty('reference_field');
    expect(body).not.toHaveProperty('generate_audio');
    expect(body.resolution).toBe('1080p');
  });

  it('defaults to image_url and forwards configured params', async () => {
    const body = await runImageToVideo('alibaba/wan-3.0/image-to-video', { generate_audio: false });
    expect(body.image_url).toMatch(/^data:/);
    expect(body.generate_audio).toBe(false);
  });
});
