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
      durationSeconds: 3.4,
      seed: 7,
      params: { duration: 5, min_duration: 3, sound: 'off' },
      outputDir: join(directory, 'out'),
    });

    expect(result.files[0]!.endsWith('.mp4')).toBe(true);
    expect(submitted).toEqual({
      prompt: 'slow push in',
      image_url: 'https://cdn.example.com/first-frame.png',
      duration: 4,
      sound: 'off',
    });
  });

  /** A fake Higgsfield API for lip-sync: uploads, one submission, polls, a video. */
  function lipSyncApi(submitPath: string, statuses: Record<string, unknown>[]) {
    const submitted: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = [];
    const polled: string[] = [];
    const uploads: string[] = [];
    const fetchImpl: FetchLike = async (url, init) => {
      if (url.endsWith('/files/generate-upload-url')) {
        const type = (JSON.parse(String(init?.body)) as { content_type: string }).content_type;
        uploads.push(type);
        const name = type.startsWith('audio') ? 'line.mp3' : 'face.png';
        return json({ public_url: `https://cdn.example.com/${name}`, upload_url: `https://storage.example.com/${name}` });
      }
      if (url.startsWith('https://storage.example.com/')) return new Response('', { status: 200 });
      if (url === `https://api.higgsfield.ai/${submitPath}`) {
        submitted.push({
          url,
          body: JSON.parse(String(init?.body)) as Record<string, unknown>,
          headers: init?.headers as Record<string, string>,
        });
        return json(statuses[0]!);
      }
      if (url.includes('/requests/') || url.includes('/v1/job-sets/')) {
        polled.push(url);
        return json(statuses[Math.min(polled.length, statuses.length - 1)]!);
      }
      if (url === 'https://cdn.example.com/sing.mp4') {
        return new Response(Buffer.from('fake-mp4'), { status: 200, headers: { 'content-type': 'video/mp4' } });
      }
      throw new Error(`unexpected fetch ${url}`);
    };
    return { fetchImpl, submitted, polled, uploads };
  }

  async function lipSyncInputs() {
    const directory = await tempDir();
    const face = join(directory, 'face.png');
    const audio = join(directory, 'line.mp3');
    await writeFile(face, 'face');
    await writeFile(audio, 'audio');
    return { face, audio, outputDir: join(directory, 'out') };
  }

  it('lip-syncs with Speak v2: uploads face and audio, snaps the duration, polls, downloads', async () => {
    const { face, audio, outputDir } = await lipSyncInputs();
    const api = lipSyncApi('higgsfield-ai/speak', [
      { status: 'queued', request_id: 'req-9' },
      { status: 'in_progress' },
      { status: 'completed', video: { url: 'https://cdn.example.com/sing.mp4' } },
    ]);
    const provider = new HiggsfieldProvider({ credentials: 'id:secret', fetchImpl: api.fetchImpl, pollIntervalMs: 1 });
    const result = await provider.lipSync({
      model: 'higgsfield-ai/speak',
      prompt: 'Close-up, static camera. She sings the audio with accurate lip sync.',
      references: [face],
      audio,
      durationSeconds: 2.7,
      seed: 1234567,
      params: { model_quality: 'high', durations: [5, 10, 15], send_seed: true },
      outputDir,
      idempotencyKey: 'idem-ls',
    });

    expect(await readFile(result.files[0]!, 'utf8')).toBe('fake-mp4');
    expect(api.uploads).toEqual(['image/png', 'audio/mpeg']);
    expect(api.submitted).toHaveLength(1);
    expect(api.submitted[0]!.headers['Idempotency-Key']).toBe('idem-ls');
    expect(api.submitted[0]!.body).toEqual({
      image_url: 'https://cdn.example.com/face.png',
      audio_url: 'https://cdn.example.com/line.mp3',
      prompt: 'Close-up, static camera. She sings the audio with accurate lip sync.',
      seed: 234567,
      quality: 'high',
      duration: 5,
    });
    expect(api.polled).toEqual([
      'https://api.higgsfield.ai/requests/req-9/status',
      'https://api.higgsfield.ai/requests/req-9/status',
    ]);
  });

  it('lip-syncs on a legacy job-set route (Kling Avatar) without a duration', async () => {
    const { face, audio, outputDir } = await lipSyncInputs();
    const api = lipSyncApi('v1/speak/kling', [
      { id: '3c90c3cc-0d44-4b50-8888-8dd25736052a', jobs: [{ status: 'queued' }] },
      {
        id: '3c90c3cc-0d44-4b50-8888-8dd25736052a',
        jobs: [{ status: 'completed', results: { min: { url: 'https://cdn.example.com/min.mp4' }, raw: { url: 'https://cdn.example.com/sing.mp4' } } }],
      },
    ]);
    const provider = new HiggsfieldProvider({ credentials: 'id:secret', fetchImpl: api.fetchImpl, pollIntervalMs: 1 });
    const result = await provider.lipSync({
      model: 'v1/speak/kling',
      prompt: 'She sings.',
      references: [face],
      audio,
      durationSeconds: 3,
      seed: 1,
      params: { request_format: 'job_set', mode: 'std', send_duration: false },
      outputDir,
    });

    expect(result.files).toHaveLength(1);
    expect(api.submitted[0]!.body).toEqual({
      params: {
        input_image: { type: 'image_url', image_url: 'https://cdn.example.com/face.png' },
        input_audio: { type: 'audio_url', audio_url: 'https://cdn.example.com/line.mp3' },
        prompt: 'She sings.',
        mode: 'std',
      },
    });
    expect(api.polled).toEqual(['https://api.higgsfield.ai/v1/job-sets/3c90c3cc-0d44-4b50-8888-8dd25736052a']);
  });

  it('sends the audio to a custom field for audio-driven Wan models', async () => {
    const { face, audio, outputDir } = await lipSyncInputs();
    const api = lipSyncApi('wan/v2.7/image-to-video', [
      { status: 'completed', request_id: 'r', video: { url: 'https://cdn.example.com/sing.mp4' } },
    ]);
    const provider = new HiggsfieldProvider({ credentials: 'id:secret', fetchImpl: api.fetchImpl, pollIntervalMs: 1 });
    await provider.lipSync({
      model: 'wan/v2.7/image-to-video',
      prompt: 'She sings.',
      references: [face],
      audio,
      durationSeconds: 1.2,
      seed: 1,
      params: { resolution: '720p', min_duration: 2 },
      outputDir,
    });
    expect(api.submitted[0]!.body).toEqual({
      image_url: 'https://cdn.example.com/face.png',
      audio_url: 'https://cdn.example.com/line.mp3',
      prompt: 'She sings.',
      resolution: '720p',
      duration: 2,
    });
  });

  it('stops on failed lip-sync jobs and missing inputs', async () => {
    const { face, audio, outputDir } = await lipSyncInputs();
    const failed = lipSyncApi('higgsfield-ai/speak', [{ status: 'queued', request_id: 'r1' }, { status: 'nsfw' }]);
    const provider = new HiggsfieldProvider({ credentials: 'id:secret', fetchImpl: failed.fetchImpl, pollIntervalMs: 1 });
    const input = { model: 'higgsfield-ai/speak', prompt: 'x', references: [face], audio, seed: 1, outputDir };
    await expect(provider.lipSync(input)).rejects.toThrow(/nsfw/);

    const jobSet = lipSyncApi('v1/speak/kling', [
      { id: 'set-1', jobs: [{ status: 'queued' }] },
      { id: 'set-1', jobs: [{ status: 'failed' }] },
    ]);
    const legacy = new HiggsfieldProvider({ credentials: 'id:secret', fetchImpl: jobSet.fetchImpl, pollIntervalMs: 1 });
    await expect(
      legacy.lipSync({ ...input, model: 'v1/speak/kling', params: { request_format: 'job_set' } }),
    ).rejects.toThrow(/job failed/);

    await expect(provider.lipSync({ ...input, audio: undefined })).rejects.toThrow(/audio/);
    await expect(provider.lipSync({ ...input, references: [] })).rejects.toThrow(/face reference/);
    await expect(provider.lipSync({ ...input, params: { request_format: 'content' } })).rejects.toThrow(/request_format/);
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
