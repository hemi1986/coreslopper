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
  let uploads = 0;
  const fetchImpl: FetchLike = async (url, init) => {
    if (url.includes('/storage/upload/initiate')) {
      uploads += 1;
      return json({ upload_url: `https://upload.test/${uploads}`, file_url: `https://cdn.test/file-${uploads}` });
    }
    if (url.startsWith('https://upload.test/')) return new Response('', { status: 200 });
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
  it('sends the requested clip length instead of the role default duration', async () => {
    const body = await runImageToVideo('kling/v4/image-to-video', {
      duration: 10,
      min_duration: 3,
      reference_field: 'start_image_url',
    });
    expect(body.duration).toBe(5);
    expect(body).not.toHaveProperty('min_duration');
  });

  it('sends the start frame as start_image_url for Kling v4 and keeps adapter options out', async () => {
    const body = await runImageToVideo('kling/v4/image-to-video', {
      resolution: '1080p',
      reference_field: 'start_image_url',
    });
    expect(body.start_image_url).toMatch(/^https:\/\/cdn\.test\//);
    expect(body).not.toHaveProperty('image_url');
    expect(body).not.toHaveProperty('reference_field');
    expect(body).not.toHaveProperty('generate_audio');
    expect(body.resolution).toBe('1080p');
  });

  it('defaults to image_url and forwards configured params', async () => {
    const body = await runImageToVideo('alibaba/wan-3.0/image-to-video', { generate_audio: false });
    expect(body.image_url).toMatch(/^https:\/\/cdn\.test\//);
    expect(body.generate_audio).toBe(false);
  });

  it('sends start and end frames for first/last-frame models and requires the end field', async () => {
    const directory = await tempDir();
    const start = join(directory, 'start.png');
    const end = join(directory, 'end.png');
    await writeFile(start, 'start');
    await writeFile(end, 'end');
    let submitted: Record<string, unknown> | undefined;
    let uploads = 0;
    const fetchImpl: FetchLike = async (url, init) => {
      if (url.includes('/storage/upload/initiate')) {
        uploads += 1;
        return json({ upload_url: `https://upload.test/${uploads}`, file_url: `https://cdn.test/file-${uploads}` });
      }
      if (url.startsWith('https://upload.test/')) return new Response('', { status: 200 });
      if (url === 'https://queue.fal.run/some/flf-model') {
        submitted = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return json({ request_id: 'r', status_url: 'https://queue.fal.run/status', response_url: 'https://queue.fal.run/response' });
      }
      if (url === 'https://queue.fal.run/status') return json({ status: 'COMPLETED' });
      if (url === 'https://queue.fal.run/response') return json({ video: { url: 'https://cdn.example.com/clip.mp4' } });
      return new Response(Buffer.from('mp4'), { status: 200, headers: { 'content-type': 'video/mp4' } });
    };
    const provider = new FalProvider({ apiKey: 'test-key', fetchImpl, pollIntervalMs: 1 });
    const input = {
      model: 'some/flf-model',
      prompt: 'morph',
      references: [start, end],
      seed: 1,
      outputDir: join(directory, 'out'),
    };
    await expect(provider.firstLastFrameToVideo({ ...input, params: {} })).rejects.toThrow(/end_reference_field/);
    await provider.firstLastFrameToVideo({
      ...input,
      params: { reference_field: 'start_image_url', end_reference_field: 'end_image_url' },
    });
    expect(submitted!.start_image_url).toMatch(/^https:\/\/cdn\.test\//);
    expect(submitted!.end_image_url).toMatch(/^https:\/\/cdn\.test\//);
    expect(submitted).not.toHaveProperty('end_reference_field');
  });

  it('accepts the legacy image_param alias and strips it', async () => {
    const body = await runImageToVideo('kling/v4/image-to-video', { image_param: 'start_image_url' });
    expect(body.start_image_url).toMatch(/^https:\/\/cdn\.test\//);
    expect(body).not.toHaveProperty('image_param');
    expect(body).not.toHaveProperty('image_url');
  });

  it('uploads lip-sync image and audio and sends URLs, not data URIs', async () => {
    const directory = await tempDir();
    const face = join(directory, 'face.png');
    const audio = join(directory, 'vocals.mp3');
    await writeFile(face, 'png');
    await writeFile(audio, 'mp3');
    let submitted: Record<string, unknown> | undefined;
    let uploads = 0;
    const fetchImpl: FetchLike = async (url, init) => {
      if (url.includes('/storage/upload/initiate')) {
        uploads += 1;
        return json({ upload_url: `https://upload.test/${uploads}`, file_url: `https://cdn.test/file-${uploads}` });
      }
      if (url.startsWith('https://upload.test/')) return new Response('', { status: 200 });
      if (url === 'https://queue.fal.run/fal-ai/bytedance/omnihuman/v1.5') {
        submitted = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return json({ request_id: 'r', status_url: 'https://queue.fal.run/status', response_url: 'https://queue.fal.run/response' });
      }
      if (url === 'https://queue.fal.run/status') return json({ status: 'COMPLETED' });
      if (url === 'https://queue.fal.run/response') return json({ video: { url: 'https://cdn.example.com/clip.mp4' } });
      return new Response(Buffer.from('mp4'), { status: 200, headers: { 'content-type': 'video/mp4' } });
    };
    const provider = new FalProvider({ apiKey: 'test-key', fetchImpl, pollIntervalMs: 1 });
    const output = await provider.lipSync({
      model: 'fal-ai/bytedance/omnihuman/v1.5',
      prompt: 'sings',
      references: [face],
      audio,
      seed: 1,
      params: { resolution: '1080p' },
      outputDir: join(directory, 'out'),
    });
    expect(submitted).toMatchObject({
      image_url: 'https://cdn.test/file-1',
      audio_url: 'https://cdn.test/file-2',
      resolution: '1080p',
    });
    expect(JSON.stringify(submitted)).not.toContain('data:');
    expect(output.files).toHaveLength(1);
  });
});
