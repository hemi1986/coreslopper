import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ComfyUIProvider,
  inspectWorkflow,
  isOutOfMemory,
  type ComfyWorkflow,
  type FetchLike,
} from '../packages/providers/src/index.ts';
import {
  halfSize,
  imageSize,
  replaceCharacterNames,
  seedvr2Scale,
  takeClipOptions,
  wanSize,
} from '../packages/cli/src/clip-options.ts';
import { BatchSchema, runBatch, type BatchTarget } from '../packages/cli/src/generate.ts';

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});
async function tempDir(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'coreslopper-seedvr2-'));
  temporary.push(directory);
  return directory;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** A PNG header is enough for imageSize. */
function pngHeader(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

/** The tagged SeedVR2 template, trimmed to the nodes the adapter touches. */
function seedvr2Workflow(): ComfyWorkflow {
  return {
    '73': { class_type: 'LoadVideo', inputs: { file: 'example.mp4' }, _meta: { title: 'Load Video cs_video' } },
    '52': {
      class_type: 'UNETLoader',
      inputs: { unet_name: 'seedvr2_3b_int8_convrot.safetensors', weight_dtype: 'default' },
      _meta: { title: 'Load Diffusion Model' },
    },
    '57': {
      class_type: 'ResizeImageMaskNode',
      inputs: { resize_type: 'scale by multiplier', 'resize_type.multiplier': 1, input: ['74', 0] },
      _meta: { title: 'Resize Image/Mask cs_scale' },
    },
    '54': { class_type: 'KSampler', inputs: { seed: 1, steps: 1 }, _meta: { title: 'KSampler cs_seed' } },
    '59': {
      class_type: 'SeedVR2PostProcessing',
      inputs: { color_correction_method: 'lab', images: ['55', 0] },
      _meta: { title: 'Post-Process SeedVR2 Output cs_color_correction' },
    },
    '105': { class_type: 'PrimitiveBoolean', inputs: { value: false }, _meta: { title: 'Boolean (Split Latent) cs_split' } },
    '76': { class_type: 'SaveVideo', inputs: { filename_prefix: 'x', video: ['75', 0] }, _meta: { title: 'Save Video cs_output' } },
  };
}

interface Server {
  fetchImpl: FetchLike;
  prompts: ComfyWorkflow[];
}

function fakeServer(options: { oom?: number; models?: string[] } = {}): Server {
  const prompts: ComfyWorkflow[] = [];
  let failures = options.oom ?? 0;
  const fetchImpl: FetchLike = async (url, init) => {
    if (url.includes('/object_info/')) {
      const name = decodeURIComponent(url.split('/object_info/')[1]!);
      if (name !== 'UNETLoader') return json({});
      return json({
        UNETLoader: {
          input: { required: { unet_name: [options.models ?? ['seedvr2_3b_int8_convrot.safetensors']], weight_dtype: [['default']] } },
        },
      });
    }
    if (url.endsWith('/upload/image')) {
      const file = (init?.body as FormData).get('image') as File;
      return json({ name: file.name, subfolder: 'coreslopper', type: 'input' });
    }
    if (url.endsWith('/prompt')) {
      prompts.push((JSON.parse(String(init?.body)) as { prompt: ComfyWorkflow }).prompt);
      return json({ prompt_id: `p${prompts.length}`, node_errors: {} });
    }
    if (url.includes('/history/')) {
      const id = url.split('/history/')[1]!;
      if (failures > 0) {
        failures -= 1;
        return json({
          [id]: {
            status: {
              status_str: 'error',
              messages: [['execution_error', { exception_message: 'Allocation on device 0 would exceed allowed memory. (out of memory)' }]],
            },
          },
        });
      }
      return json({
        [id]: {
          status: { status_str: 'success', completed: true, messages: [] },
          outputs: { '76': { images: [{ filename: 'up_00001_.mp4', subfolder: 'coreslopper', type: 'output' }] } },
        },
      });
    }
    if (url.includes('/view?')) return new Response(Buffer.from('fake-mp4'), { status: 200 });
    throw new Error(`unexpected fetch ${url}`);
  };
  return { fetchImpl, prompts };
}

async function setup(server: Server) {
  const root = await tempDir();
  const dir = join(root, 'workflows');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'seedvr2-upscale.json'), JSON.stringify(seedvr2Workflow()));
  const clip = join(root, 'clip.mp4');
  await writeFile(clip, 'clip');
  const provider = new ComfyUIProvider({
    baseUrl: 'http://comfy.test:8188',
    workflowsDir: dir,
    fetchImpl: server.fetchImpl,
    pollIntervalMs: 1,
  });
  return { root, clip, provider };
}

describe('SeedVR2 restore', () => {
  it('is an upscaleVideo workflow without a prompt', () => {
    const inspection = inspectWorkflow(seedvr2Workflow());
    expect(inspection.operations).toEqual(['upscaleVideo']);
    expect(inspection.warnings).toEqual([]);
  });

  it('uploads the clip and sets scale, color correction, and seed', async () => {
    const server = fakeServer();
    const { root, clip, provider } = await setup(server);
    const result = await provider.upscaleVideo({
      model: 'seedvr2-upscale',
      prompt: 'SeedVR2 upscale',
      references: [clip],
      seed: 77,
      params: { scale: 2, color_correction: 'wavelet' },
      outputDir: join(root, 'out'),
    });
    const prompt = server.prompts[0]!;
    expect(prompt['73']!.inputs.file).toMatch(/^coreslopper\/[0-9a-f]{16}\.mp4$/);
    expect(prompt['57']!.inputs['resize_type.multiplier']).toBe(2);
    expect(prompt['59']!.inputs.color_correction_method).toBe('wavelet');
    expect(prompt['54']!.inputs.seed).toBe(77);
    expect(prompt['105']!.inputs.value).toBe(false);
    expect(result.files).toHaveLength(1);
  });

  it('retries once with split_latent after running out of memory, then stops', async () => {
    const once = fakeServer({ oom: 1 });
    const first = await setup(once);
    await first.provider.upscaleVideo({
      model: 'seedvr2-upscale', prompt: 'x', references: [first.clip], seed: 1, params: {}, outputDir: join(first.root, 'out'),
    });
    expect(once.prompts.map((prompt) => prompt['105']!.inputs.value)).toEqual([false, true]);

    const twice = fakeServer({ oom: 2 });
    const second = await setup(twice);
    await expect(
      second.provider.upscaleVideo({
        model: 'seedvr2-upscale', prompt: 'x', references: [second.clip], seed: 1, params: {}, outputDir: join(second.root, 'out'),
      }),
    ).rejects.toThrow(/even with split_latent: true/);
    expect(twice.prompts).toHaveLength(2);
    expect(isOutOfMemory(new Error('CUDA out of memory'))).toBe(true);
  });

  it('stops before queueing when a model file is not installed', async () => {
    const server = fakeServer({ models: ['other.safetensors'] });
    const { root, clip, provider } = await setup(server);
    await expect(
      provider.upscaleVideo({ model: 'seedvr2-upscale', prompt: 'x', references: [clip], seed: 1, params: {}, outputDir: join(root, 'out') }),
    ).rejects.toThrow(/missing model files.*seedvr2_3b_int8_convrot\.safetensors \(UNETLoader\.unet_name\)/);
    expect(server.prompts).toHaveLength(0);
  });
});

describe('clip options', () => {
  it('defaults to LTX draft without SeedVR2, and restore with lab on final', () => {
    expect(takeClipOptions({}).options).toEqual({
      videoModel: 'ltx', quality: 'draft', seedvr2: 'off', colorCorrection: 'lab', turbo: true,
    });
    const final = takeClipOptions({ quality: 'final', fps: 24 });
    expect(final.options.seedvr2).toBe('restore');
    expect(final.rest).toEqual({ fps: 24 });
    expect(takeClipOptions({ quality: 'draft', seedvr2: 'upscale' }).options.seedvr2).toBe('off');
    expect(() => takeClipOptions({ video_model: 'kling' })).toThrow(/video_model/);
  });

  it('halves the LTX size to multiples of 64 and scales Wan to the master', () => {
    expect(halfSize({ width: 1920, height: 1080 })).toEqual({ width: 960, height: 576 });
    expect(halfSize({ width: 1080, height: 1920 })).toEqual({ width: 576, height: 960 });
    expect(seedvr2Scale('upscale', { width: 960, height: 576 }, { width: 1920, height: 1080 })).toBe(2);
    expect(seedvr2Scale('upscale', { width: 1280, height: 720 }, { width: 1920, height: 1080 })).toBe(1.5);
    expect(seedvr2Scale('restore', { width: 1280, height: 720 }, { width: 1920, height: 1080 })).toBe(1);
  });

  it('sizes Wan from the start frame aspect in multiples of 16', () => {
    expect(wanSize(16 / 9, 'draft')).toEqual({ width: 832, height: 480 });
    expect(wanSize(9 / 16, 'final')).toEqual({ width: 720, height: 1280 });
    const square = wanSize(1, 'final');
    expect(square.width % 16).toBe(0);
    expect(square.width).toBe(square.height);
  });

  it('replaces character names and ids with descriptions', () => {
    const characters = [{ id: 'alexis', name: 'Alexis', description: 'a young woman with a silver bob.' }];
    expect(replaceCharacterNames('Alexis turns to the window; alexis smiles.', characters)).toBe(
      'a young woman with a silver bob turns to the window; a young woman with a silver bob smiles.',
    );
    expect(replaceCharacterNames('Alexisa stays', characters)).toBe('Alexisa stays');
  });
});

describe('local clip batches', () => {
  async function target() {
    const root = await tempDir();
    await writeFile(join(root, 'start.png'), pngHeader(1920, 1080));
    await writeFile(join(root, 'tall.png'), pngHeader(1080, 1920));
    await writeFile(join(root, 'vocals.wav'), '');
    const value: BatchTarget = {
      label: 'project',
      config: {
        providers: { image: 'comfyui', video: 'comfyui', lipsync: 'comfyui' },
        models: {},
        formats: { master: { id: '16x9', width: 1920, height: 1080 } },
        batch_cap_usd: undefined,
      } as unknown as BatchTarget['config'],
      state: { budget: { totalUsd: 10, spentUsd: 0, reservedUsd: 0 }, updatedAt: '' },
      paths: { root, assets: join(root, 'assets'), manifest: join(root, 'assets', 'manifest.jsonl') },
      characters: [{ id: 'alexis', name: 'Alexis', description: 'a young woman with a silver bob' }],
      saveState: async () => undefined,
    };
    return value;
  }
  const item = (params: Record<string, unknown>, references = ['start.png']) => ({
    operation: 'imageToVideo',
    role: 'video.image_to_video.quality',
    prompt: 'Alexis turns her head.',
    references,
    durationSeconds: 4,
    params,
  });

  it('routes Wan to its workflow with the start frame aspect, turbo, and character descriptions', async () => {
    const batch = BatchSchema.parse([item({ video_model: 'wan', quality: 'final' }, ['tall.png'])]);
    const [entry] = await runBatch(await target(), batch, { dryRun: true, log: false });
    expect(entry!.resolved.model).toBe('wan22-i2v');
    expect(entry!.resolved.params).toMatchObject({ width: 720, height: 1280, turbo: true, fps: 16, frame_step: 4 });
    expect(entry!.resolved.params).not.toHaveProperty('megapixels');
    expect(entry!.resolved.prompt).toBe('a young woman with a silver bob turns her head.');
    expect(entry!.resolved.restore).toMatchObject({ mode: 'restore', scale: 1, colorCorrection: 'lab' });
  });

  it('renders LTX final at full size, or at half size for the upscale mode', async () => {
    const batch = BatchSchema.parse([
      item({ quality: 'final' }),
      item({ quality: 'final', seedvr2: 'upscale', color_correction: 'wavelet' }),
      item({ quality: 'final', seedvr2: 'off' }),
      item({}),
    ]);
    const [restore, upscale, off, draft] = await runBatch(await target(), batch, { dryRun: true, log: false });
    expect(restore!.resolved.params).toMatchObject({ width: 1920, height: 1088 });
    expect(restore!.resolved.params).not.toHaveProperty('megapixels');
    expect(upscale!.resolved.params).toMatchObject({ width: 960, height: 576 });
    expect(upscale!.resolved.restore).toMatchObject({ mode: 'upscale', scale: 2, colorCorrection: 'wavelet' });
    expect(upscale!.resolved.restore!.params).toMatchObject({ scale: 2, color_correction: 'wavelet' });
    expect(off!.resolved.restore).toBeUndefined();
    expect(draft!.resolved.restore).toBeUndefined();
    expect(draft!.resolved.params).toMatchObject({ megapixels: 0.8 });
  });

  it('refuses Wan for a lip-sync shot', async () => {
    const batch = BatchSchema.parse([
      {
        operation: 'lipSync',
        role: 'video.lipsync',
        prompt: 'She sings.',
        references: ['start.png'],
        audio: 'vocals.wav',
        params: { video_model: 'wan' },
      },
    ]);
    await expect(runBatch(await target(), batch, { dryRun: true, log: false })).rejects.toThrow(/run on Pika H3 or LTX/);
  });
});

describe('imageSize', () => {
  it('reads a PNG header', async () => {
    const root = await tempDir();
    await writeFile(join(root, 'a.png'), pngHeader(832, 480));
    expect(imageSize(join(root, 'a.png'))).toEqual({ width: 832, height: 480 });
  });
});
