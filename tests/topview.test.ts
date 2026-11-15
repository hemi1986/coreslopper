import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigError, providerForRole } from '../packages/core/src/index.ts';
import { TopviewProvider, resolveTopviewApiKey, type FetchLike } from '../packages/providers/src/index.ts';

const BASE = 'https://platform-backend.topview.ai/api/v1';
const temporary: string[] = [];

async function tempDir(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'coreslopper-topview-'));
  temporary.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function task(status: string, extra: Record<string, unknown> = {}) {
  return {
    code: 200,
    message: 'ok',
    data: {
      id: 'task1',
      status,
      outputs: [],
      error: '',
      charged_usd: '0',
      billing_state: 'RESERVED',
      urls: { get: `${BASE}/predictions/task1` },
      ...extra,
    },
  };
}

function media(type: string): Response {
  return new Response(Buffer.from(`fake-${type}`), { status: 200, headers: { 'content-type': type } });
}

interface Call {
  url: string;
  init?: RequestInit;
}

/**
 * A fake Topview API: uploads, one submission, then `pending` polls before completion.
 * An uploaded file is served at a URL named after it, so parallel uploads stay deterministic.
 */
function fakeApi(modelPath: string, output: string, contentType: string, pending = 1) {
  const calls: Call[] = [];
  let polls = 0;
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    if (url === `${BASE}/media/files`) {
      const name = ((init?.body as FormData).get('file') as File).name;
      return json({ data: { id: name, download_url: `https://r2.example.com/${name}`, status: 'READY' } });
    }
    if (url === `${BASE}/models/${modelPath}/predictions`) return json(task('created'));
    if (url === `${BASE}/predictions/task1`) {
      polls += 1;
      return json(polls <= pending ? task('processing') : task('completed', { outputs: [output], charged_usd: '0.03' }));
    }
    if (url === output) return media(contentType);
    throw new Error(`unexpected fetch ${url}`);
  };
  const submitted = () => {
    const call = calls.find((entry) => entry.url.endsWith('/predictions') && entry.init?.method === 'POST');
    expect(call).toBeDefined();
    return { headers: call!.init!.headers as Record<string, string>, body: JSON.parse(String(call!.init!.body)) };
  };
  return { calls, fetchImpl, submitted };
}

function provider(fetchImpl: FetchLike): TopviewProvider {
  return new TopviewProvider({ apiKey: 'tv-key', fetchImpl, pollIntervalMs: 1 });
}

describe('Topview provider', () => {
  it('submits a flat image request, polls the task, and downloads the output', async () => {
    const api = fakeApi('google/nano-banana-2.1/text-to-image', 'https://cdn.example.com/out.png', 'image/png');
    const outputDir = await tempDir();
    const result = await provider(api.fetchImpl).generateImage({
      model: 'google/nano-banana-2.1/text-to-image',
      prompt: 'neon portrait',
      seed: 42,
      params: { resolution: '2k', aspect_ratio: '16:9' },
      outputDir,
      idempotencyKey: 'idem-1',
    });

    expect(result.files).toHaveLength(1);
    expect(await readFile(result.files[0]!, 'utf8')).toBe('fake-image/png');
    const { headers, body } = api.submitted();
    expect(headers.Authorization).toBe('Bearer tv-key');
    expect(headers['Idempotency-Key']).toBe('idem-1');
    expect(body).toEqual({ prompt: 'neon portrait', resolution: '2k', aspect_ratio: '16:9' });
    expect(api.calls.filter((call) => call.url.endsWith('/predictions/task1'))).toHaveLength(2);
  });

  it('uploads edit references as multipart and sends their signed URLs', async () => {
    const directory = await tempDir();
    const face = join(directory, 'face.png');
    const outfit = join(directory, 'outfit.png');
    await writeFile(face, 'face');
    await writeFile(outfit, 'outfit');
    const api = fakeApi('google/nano-banana-2.1/edit', 'https://cdn.example.com/edit.png', 'image/png', 0);

    await provider(api.fetchImpl).editImage({
      model: 'google/nano-banana-2.1/edit',
      prompt: 'same character, red jacket',
      references: [face, outfit, face],
      seed: 1,
      params: { resolution: '2k', send_seed: true },
      outputDir: directory,
    });

    const uploads = api.calls.filter((call) => call.url === `${BASE}/media/files`);
    expect(uploads).toHaveLength(2);
    const form = uploads[0]!.init!.body as FormData;
    expect(form.get('kind')).toBe('image');
    expect(['face.png', 'outfit.png']).toContain((form.get('file') as File).name);
    expect(api.submitted().body).toEqual({
      prompt: 'same character, red jacket',
      seed: 1,
      images: ['https://r2.example.com/face.png', 'https://r2.example.com/outfit.png', 'https://r2.example.com/face.png'],
      resolution: '2k',
    });
  });

  it('builds a content[] request with first and last frames and a snapped duration', async () => {
    const directory = await tempDir();
    const start = join(directory, 'start.png');
    const end = join(directory, 'end.png');
    await writeFile(start, 'start');
    await writeFile(end, 'end');
    const api = fakeApi('topview/topview-t1/image-to-video', 'https://cdn.example.com/clip.mp4', 'video/mp4');

    const result = await provider(api.fetchImpl).firstLastFrameToVideo({
      model: 'topview/topview-t1/image-to-video',
      prompt: 'slow push in',
      negativePrompt: 'blur',
      references: [start, end],
      seed: 7,
      durationSeconds: 2.2,
      params: { request_format: 'content', min_duration: 4, resolution: '1080p', generate_audio: false },
      outputDir: directory,
    });

    expect(result.files[0]!.endsWith('.mp4')).toBe(true);
    expect(api.submitted().body).toEqual({
      content: [
        { type: 'text', text: 'slow push in' },
        { type: 'image_url', role: 'first_frame', image_url: { url: 'https://r2.example.com/start.png' } },
        { type: 'image_url', role: 'last_frame', image_url: { url: 'https://r2.example.com/end.png' } },
      ],
      resolution: '1080p',
      generate_audio: false,
      duration: 4,
    });
  });

  it('sends a flat video request with named start and end fields', async () => {
    const directory = await tempDir();
    const start = join(directory, 'a.png');
    const end = join(directory, 'b.png');
    await writeFile(start, 'a');
    await writeFile(end, 'b');
    const api = fakeApi('kling/kling-4.0/image-to-video', 'https://cdn.example.com/k.mp4', 'video/mp4', 0);

    await provider(api.fetchImpl).firstLastFrameToVideo({
      model: 'kling/kling-4.0/image-to-video',
      prompt: 'turn around',
      references: [start, end],
      seed: 3,
      durationSeconds: 6,
      params: { reference_field: 'image', end_reference_field: 'last_image', resolution: '1080P' },
      outputDir: directory,
    });

    expect(api.submitted().body).toEqual({
      prompt: 'turn around',
      image: 'https://r2.example.com/a.png',
      last_image: 'https://r2.example.com/b.png',
      resolution: '1080P',
      duration: 6,
    });
  });

  it('builds a Wan request with typed media and every setting in parameters', async () => {
    const directory = await tempDir();
    const start = join(directory, 's.png');
    const end = join(directory, 'e.png');
    await writeFile(start, 's');
    await writeFile(end, 'e');
    const api = fakeApi('alibaba/wan-3.0/image-to-video', 'https://cdn.example.com/w.mp4', 'video/mp4', 0);

    await provider(api.fetchImpl).firstLastFrameToVideo({
      model: 'alibaba/wan-3.0/image-to-video',
      prompt: 'boat drifts',
      references: [start, end],
      seed: 1234,
      durationSeconds: 1.5,
      params: { request_format: 'wan', send_seed: true, min_duration: 2, resolution: '720P', audio: false },
      outputDir: directory,
    });

    expect(api.submitted().body).toEqual({
      input: {
        prompt: 'boat drifts',
        media: [
          { type: 'first_frame', url: 'https://r2.example.com/s.png' },
          { type: 'last_frame', url: 'https://r2.example.com/e.png' },
        ],
      },
      parameters: { seed: 1234, resolution: '720P', audio: false, duration: 2 },
    });
  });

  it('sends a Wan text-to-video request without media', async () => {
    const outputDir = await tempDir();
    const api = fakeApi('alibaba/wan-3.0/text-to-video', 'https://cdn.example.com/t.mp4', 'video/mp4', 0);
    await provider(api.fetchImpl).textToVideo({
      model: 'alibaba/wan-3.0/text-to-video',
      prompt: 'fog over neon',
      seed: 5,
      params: { request_format: 'wan', ratio: '16:9' },
      outputDir,
    });
    expect(api.submitted().body).toEqual({ input: { prompt: 'fog over neon' }, parameters: { ratio: '16:9', duration: 5 } });
  });

  it('requires end_reference_field for a flat first/last-frame request', async () => {
    const directory = await tempDir();
    const frame = join(directory, 'f.png');
    await writeFile(frame, 'f');
    const api = fakeApi('kling/kling-4.0/image-to-video', 'https://cdn.example.com/k.mp4', 'video/mp4');
    await expect(
      provider(api.fetchImpl).firstLastFrameToVideo({
        model: 'kling/kling-4.0/image-to-video',
        prompt: 'x',
        references: [frame, frame],
        seed: 1,
        outputDir: directory,
      }),
    ).rejects.toThrow(/end_reference_field/);
  });

  it('stops on a failed task and on a payment-required task', async () => {
    const outputDir = await tempDir();
    const failing: FetchLike = async (url) =>
      url.endsWith('/predictions') ? json(task('created')) : json(task('failed', { error: 'content policy' }));
    await expect(
      provider(failing).generateImage({ model: 'google/nano-banana', prompt: 'x', seed: 1, outputDir }),
    ).rejects.toThrow(/content policy/);

    const broke: FetchLike = async (url) =>
      url.endsWith('/predictions') ? json(task('created')) : json(task('payment_required', { shortfall_usd: '1.20' }));
    await expect(
      provider(broke).generateImage({ model: 'google/nano-banana', prompt: 'x', seed: 1, outputDir }),
    ).rejects.toBeInstanceOf(ConfigError);
  });

  it('rejects lip-sync and a missing key', async () => {
    await expect(
      provider(async () => json({})).lipSync({ model: 'x', prompt: 'x', seed: 1, outputDir: '/tmp' }),
    ).rejects.toBeInstanceOf(ConfigError);
    expect(() => new TopviewProvider({ apiKey: '' })).toThrow(ConfigError);
  });

  it('reads the key from TOPVIEW_API_PLATFORM_KEY or TOPVIEW_API_KEY', () => {
    expect(resolveTopviewApiKey({ TOPVIEW_API_PLATFORM_KEY: ' Bearer abc ' })).toBe('abc');
    expect(resolveTopviewApiKey({ TOPVIEW_API_KEY: 'def' })).toBe('def');
    expect(resolveTopviewApiKey({})).toBeUndefined();
  });

  it('keeps lip-sync on fal when video runs on Topview', () => {
    expect(providerForRole({ providers: { image: 'topview', video: 'topview' } }, 'video.lipsync')).toBe('fal');
    expect(
      providerForRole({ providers: { image: 'topview', video: 'topview', lipsync: 'comfyui' } }, 'video.lipsync'),
    ).toBe('comfyui');
  });
});
