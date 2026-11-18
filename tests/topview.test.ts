import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigError, providerForRole } from '../packages/core/src/index.ts';
import {
  TopviewProvider,
  resolveTopviewApiKey,
  resolveTopviewAvatarCredentials,
  type FetchLike,
} from '../packages/providers/src/index.ts';

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

  it('rejects lip-sync without OpenAPI credentials and a missing key', async () => {
    await expect(
      provider(async () => json({})).lipSync({ model: 'avatar4', prompt: 'x', references: ['f.png'], audio: 'a.mp3', seed: 1, outputDir: '/tmp' }),
    ).rejects.toThrow(/TOPVIEW_UID/);
    expect(() => new TopviewProvider({ apiKey: '' })).toThrow(ConfigError);
  });

  describe('Avatar 4 lip-sync', () => {
    const AVATAR = 'https://api.topview.ai';

    function avatarApi(queries: Record<string, unknown>[]) {
      const calls: Call[] = [];
      let polls = 0;
      let files = 0;
      const fetchImpl: FetchLike = async (url, init) => {
        calls.push({ url, init });
        if (url.startsWith(`${AVATAR}/v1/upload/credential?format=`)) {
          files += 1;
          return json({ code: '200', message: 'Success', result: { fileId: `file${files}`, uploadUrl: `https://aigc.s3.example.com/up${files}`, format: url.split('=')[1] } });
        }
        if (url.startsWith('https://aigc.s3.example.com/')) return new Response('', { status: 200 });
        if (url.startsWith(`${AVATAR}/v1/upload/check?fileId=`)) return json({ code: '200', message: 'Success', result: true });
        if (url === `${AVATAR}/v1/photo_avatar/task/submit`) {
          return json({ code: '200', message: 'Success', result: { taskId: 'tv-task-1', status: 'init' } });
        }
        if (url === `${AVATAR}/v1/photo_avatar/task/query?taskId=tv-task-1`) {
          const body = queries[Math.min(polls, queries.length - 1)]!;
          polls += 1;
          return json(body);
        }
        if (url === 'https://cdn.example.com/out.mp4') return media('video/mp4');
        throw new Error(`unexpected fetch ${url}`);
      };
      return { calls, fetchImpl };
    }

    async function inputs() {
      const directory = await tempDir();
      const face = join(directory, 'face.png');
      const audio = join(directory, 'line.mp3');
      await writeFile(face, 'face');
      await writeFile(audio, 'audio');
      return { face, audio, outputDir: join(directory, 'out') };
    }

    const avatarProvider = (fetchImpl: FetchLike) =>
      new TopviewProvider({ avatar: { uid: 'uid-1', apiKey: 'sk-1' }, fetchImpl, pollIntervalMs: 1 });

    it('uploads face and audio, submits an audio-mode task, polls, and downloads the video', async () => {
      const { face, audio, outputDir } = await inputs();
      const api = avatarApi([
        { code: '200', result: { taskId: 'tv-task-1', status: 'running' } },
        { code: '200', result: { taskId: 'tv-task-1', status: 'success', costCredit: 0.3, finishedVideoUrl: 'https://cdn.example.com/out.mp4' } },
      ]);
      const result = await avatarProvider(api.fetchImpl).lipSync({
        model: 'avatar4',
        prompt: 'She sings with a gentle smile, small head movements.',
        references: [face],
        audio,
        seed: 1,
        params: { offPeak: false },
        outputDir,
      });

      expect(await readFile(result.files[0]!, 'utf8')).toBe('fake-video/mp4');
      const credential = api.calls.filter((call) => call.url.includes('/v1/upload/credential'));
      expect(credential.map((call) => call.url.split('format=')[1])).toEqual(['png', 'mp3']);
      expect((credential[0]!.init!.headers as Record<string, string>)['Topview-Uid']).toBe('uid-1');
      expect((credential[0]!.init!.headers as Record<string, string>).Authorization).toBe('Bearer sk-1');
      const put = api.calls.find((call) => call.url === 'https://aigc.s3.example.com/up1');
      expect(put?.init?.method).toBe('PUT');
      const submit = api.calls.find((call) => call.url.endsWith('/task/submit'));
      expect(JSON.parse(String(submit!.init!.body))).toEqual({
        templateImageFileId: 'file1',
        mode: 'avatar4',
        scriptMode: 'audio',
        audioFileId: 'file2',
        customMotion: 'She sings with a gentle smile, small head movements.',
        offPeak: false,
      });
      expect(api.calls.filter((call) => call.url.includes('/task/query'))).toHaveLength(2);
    });

    it('stops on a failed task, an unknown mode, and an error envelope', async () => {
      const { face, audio, outputDir } = await inputs();
      const input = { model: 'avatar4', prompt: '', references: [face], audio, seed: 1, outputDir };
      const failed = avatarApi([{ code: '200', result: { taskId: 'tv-task-1', status: 'fail', errorMsg: 'no face detected' } }]);
      await expect(avatarProvider(failed.fetchImpl).lipSync(input)).rejects.toThrow(/no face detected/);

      await expect(avatarProvider(failed.fetchImpl).lipSync({ ...input, model: 'avatar9' })).rejects.toBeInstanceOf(ConfigError);

      const broke: FetchLike = async () => json({ code: '4001', message: 'Insufficient credits' });
      await expect(avatarProvider(broke).lipSync(input)).rejects.toBeInstanceOf(ConfigError);
    });

    it('needs the platform key for clips when only OpenAPI credentials are set', async () => {
      await expect(
        avatarProvider(async () => json({})).generateImage({ model: 'google/nano-banana', prompt: 'x', seed: 1, outputDir: '/tmp' }),
      ).rejects.toThrow(/TOPVIEW_API_PLATFORM_KEY/);
    });

    it('reads TOPVIEW_UID and TOPVIEW_OPENAPI_KEY', () => {
      expect(resolveTopviewAvatarCredentials({ TOPVIEW_UID: ' u ', TOPVIEW_OPENAPI_KEY: 'Bearer k' })).toEqual({ uid: 'u', apiKey: 'k' });
      expect(resolveTopviewAvatarCredentials({ TOPVIEW_UID: 'u' })).toBeUndefined();
    });
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
