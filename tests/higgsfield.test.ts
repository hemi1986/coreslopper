import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  HiggsfieldProvider,
  resolveHiggsfieldCredentials,
  type FetchLike,
} from '../packages/providers/src/index.ts';

const temporary: string[] = [];

async function tempDir(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'coreslopper-higgsfield-'));
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

function png(): Response {
  return new Response(Buffer.from('fake-png'), {
    status: 200,
    headers: { 'content-type': 'image/png' },
  });
}

describe('Higgsfield provider', () => {
  it('submits, polls, and downloads an image without leaking adapter options', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith('/higgsfield-ai/soul/v2/standard')) {
        return json({
          status: 'queued',
          request_id: 'req-1',
          status_url: 'https://api.higgsfield.ai/requests/req-1/status',
        });
      }
      if (url.endsWith('/requests/req-1/status')) {
        return json({
          status: 'completed',
          request_id: 'req-1',
          images: [{ url: 'https://cdn.example.com/out.png' }],
        });
      }
      if (url === 'https://cdn.example.com/out.png') return png();
      throw new Error(`unexpected fetch ${url}`);
    };

    const outputDir = await tempDir();
    const provider = new HiggsfieldProvider({
      credentials: 'key-id:key-secret',
      fetchImpl,
      pollIntervalMs: 1,
    });
    const result = await provider.generateImage({
      model: 'higgsfield-ai/soul/v2/standard',
      prompt: 'neon portrait',
      seed: 42,
      params: {
        send_seed: true,
        resolution: '1080p',
        aspect_ratio: '16:9',
        reference_field: 'image_reference_url',
      },
      outputDir,
      idempotencyKey: 'idem-1',
    });

    expect(result.files).toHaveLength(1);
    expect(result.files[0]!.endsWith('.png')).toBe(true);
    expect(await readFile(result.files[0]!, 'utf8')).toBe('fake-png');

    const submit = calls.find((call) => call.init?.method === 'POST');
    expect(submit).toBeDefined();
    expect((submit!.init!.headers as Record<string, string>).Authorization).toBe('Key key-id:key-secret');
    expect((submit!.init!.headers as Record<string, string>)['Idempotency-Key']).toBe('idem-1');
    const body = JSON.parse(String(submit!.init!.body)) as Record<string, unknown>;
    expect(body).toEqual({
      prompt: 'neon portrait',
      seed: 42,
      resolution: '1080p',
      aspect_ratio: '16:9',
    });
  });

  it('uploads an edit reference and sends it as a public URL', async () => {
    const directory = await tempDir();
    const reference = join(directory, 'face.png');
    await writeFile(reference, 'face');

    const bodies: Record<string, unknown>[] = [];
    const fetchImpl: FetchLike = async (url, init) => {
      if (url.endsWith('/files/generate-upload-url')) {
        return json({
          public_url: 'https://cdn.example.com/face.png',
          upload_url: 'https://storage.example.com/upload',
          upload_headers: {
            'Content-Type': 'image/png',
            'x-amz-tagging': 'retention=temporary',
          },
        });
      }
      if (url === 'https://storage.example.com/upload') {
        expect(init?.method).toBe('PUT');
        return new Response('', { status: 200 });
      }
      if (url.endsWith('/alibaba/qwen-image-3/edit')) {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return json({
          status: 'completed',
          request_id: 'req-2',
          images: [{ url: 'https://cdn.example.com/edited.png' }],
        });
      }
      if (url === 'https://cdn.example.com/edited.png') return png();
      throw new Error(`unexpected fetch ${url}`);
    };

    const provider = new HiggsfieldProvider({
      credentials: 'key-id:key-secret',
      fetchImpl,
      pollIntervalMs: 1,
    });
    const result = await provider.editImage({
      model: 'alibaba/qwen-image-3/edit',
      prompt: 'keep the face, change the lighting',
      seed: 7,
      references: [reference],
      params: {
        reference_field: 'image_urls',
        prompt_extend: false,
        enable_thinking: false,
        send_seed: true,
      },
      outputDir: join(directory, 'out'),
    });

    expect(result.files).toHaveLength(1);
    expect(bodies[0]).toEqual({
      prompt: 'keep the face, change the lighting',
      image_urls: ['https://cdn.example.com/face.png'],
      seed: 7,
      prompt_extend: false,
      enable_thinking: false,
    });
  });

  it('uploads a start frame and sends image_url for image-to-video', async () => {
    const directory = await tempDir();
    const reference = join(directory, 'first-frame.png');
    await writeFile(reference, 'frame');

    let submitted: Record<string, unknown> | undefined;
    const fetchImpl: FetchLike = async (url, init) => {
      if (url.endsWith('/files/generate-upload-url')) {
        return json({
          public_url: 'https://cdn.example.com/first-frame.png',
          upload_url: 'https://storage.example.com/upload',
          upload_headers: { 'Content-Type': 'image/png' },
        });
      }
      if (url === 'https://storage.example.com/upload') {
        return new Response('', { status: 200 });
      }
      if (url.endsWith('/kling-video/v3.0/std/image-to-video')) {
        submitted = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return json({
          status: 'completed',
          request_id: 'req-3',
          video: { url: 'https://cdn.example.com/clip.mp4' },
        });
      }
      if (url === 'https://cdn.example.com/clip.mp4') {
        return new Response(Buffer.from('fake-mp4'), {
          status: 200,
          headers: { 'content-type': 'video/mp4' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    };

    const provider = new HiggsfieldProvider({
      credentials: 'key-id:key-secret',
      fetchImpl,
      pollIntervalMs: 1,
    });
    const result = await provider.imageToVideo({
      model: 'kling-video/v3.0/std/image-to-video',
      prompt: 'slow push in',
      references: [reference],
      durationSeconds: 5,
      seed: 7,
      params: { sound: 'off' },
      outputDir: join(directory, 'out'),
    });

    expect(result.files[0]!.endsWith('.mp4')).toBe(true);
    expect(submitted).toEqual({
      prompt: 'slow push in',
      image_url: 'https://cdn.example.com/first-frame.png',
      duration: 5,
      sound: 'off',
    });
  });

  it('rejects lip-sync with a clear configuration error', async () => {
    const provider = new HiggsfieldProvider({
      credentials: 'key-id:key-secret',
      fetchImpl: async () => json({}),
    });
    await expect(
      provider.lipSync({
        model: 'kling-video/v3.0/std/image-to-video',
        prompt: 'sing',
        references: ['face.png'],
        audio: 'vocals.wav',
        seed: 1,
        outputDir: '/tmp',
      }),
    ).rejects.toThrow(/does not support lip-sync/);
  });

  it('resolves credentials from combined and split environment variables', () => {
    expect(resolveHiggsfieldCredentials({ HIGGSFIELD_API_KEY: ' a:b ' })).toBe('a:b');
    expect(resolveHiggsfieldCredentials({ HIGGSFIELD_API_KEY: 'Key a:b' })).toBe('a:b');
    expect(resolveHiggsfieldCredentials({ HF_KEY: 'c:d' })).toBe('c:d');
    expect(resolveHiggsfieldCredentials({ HF_API_KEY_ID: 'id', HF_API_KEY_SECRET: 'secret' })).toBe(
      'id:secret',
    );
    expect(resolveHiggsfieldCredentials({ HF_API_KEY_ID: 'id' })).toBeUndefined();
  });
});
