import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectConfigSchema, providerForRole } from '@coreslopper/core';
import {
  ComfyUIProvider,
  GenerationRunner,
  framesFor,
  framesWithin,
  inspectWorkflow,
  inspectWorkflowDir,
  parseWorkflow,
  resolutionAspect,
  type ComfyWorkflow,
  type FetchLike,
} from '../packages/providers/src/index.ts';

const temporary: string[] = [];

async function tempDir(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'coreslopper-comfyui-'));
  temporary.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** A trimmed LTX-style API export. */
function ltxWorkflow(options: { start?: boolean; end?: boolean } = {}): ComfyWorkflow {
  const workflow: ComfyWorkflow = {
    '1': { class_type: 'CLIPTextEncode', inputs: { text: 'placeholder', clip: ['9', 0] }, _meta: { title: 'cs_prompt' } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['9', 0] }, _meta: { title: 'cs_negative' } },
    '3': {
      class_type: 'EmptyLTXVLatentVideo',
      inputs: { width: 768, height: 512, length: 97, batch_size: 1 },
      _meta: { title: 'cs_width cs_height cs_frames' },
    },
    '4': { class_type: 'RandomNoise', inputs: { noise_seed: 1 }, _meta: { title: 'cs_seed' } },
    '5': { class_type: 'LTXVConditioning', inputs: { frame_rate: 25, positive: ['1', 0] }, _meta: { title: 'cs_fps' } },
    '6': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' }, _meta: { title: 'cs_sampler' } },
    '7': { class_type: 'SaveVideo', inputs: { filename_prefix: 'ltx', format: 'mp4' }, _meta: { title: 'cs_output' } },
    '8': { class_type: 'PreviewImage', inputs: { images: ['3', 0] }, _meta: { title: 'Preview' } },
  };
  if (options.start) {
    workflow['10'] = { class_type: 'LoadImage', inputs: { image: 'example.png' }, _meta: { title: 'cs_start_image' } };
  }
  if (options.end) {
    workflow['11'] = { class_type: 'LoadImage', inputs: { image: 'example.png' }, _meta: { title: 'cs_end_image' } };
  }
  return workflow;
}

async function setup(workflows: Record<string, ComfyWorkflow | object>) {
  const root = await tempDir();
  const dir = join(root, 'workflows');
  await mkdir(dir, { recursive: true });
  for (const [name, workflow] of Object.entries(workflows)) {
    await writeFile(join(dir, `${name}.json`), JSON.stringify(workflow));
  }
  const start = join(root, 'start.png');
  const end = join(root, 'end.png');
  await writeFile(start, 'start-frame');
  await writeFile(end, 'end-frame');
  return { root, dir, start, end };
}

interface FakeServer {
  fetchImpl: FetchLike;
  submitted: () => ComfyWorkflow;
  uploads: string[];
  calls: string[];
}

function fakeServer(options: { history?: Record<string, unknown>; queueStatus?: number } = {}): FakeServer {
  let prompt: ComfyWorkflow | undefined;
  const uploads: string[] = [];
  const calls: string[] = [];
  let historyPolls = 0;
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push(url);
    if (url.endsWith('/upload/image')) {
      const form = init?.body as FormData;
      const file = form.get('image') as File;
      uploads.push(file.name);
      return json({ name: file.name, subfolder: String(form.get('subfolder')), type: 'input' });
    }
    if (url.endsWith('/prompt')) {
      if (options.queueStatus) {
        return json({ error: { message: 'Prompt outputs failed validation' }, node_errors: { '3': {} } }, options.queueStatus);
      }
      prompt = (JSON.parse(String(init?.body)) as { prompt: ComfyWorkflow }).prompt;
      return json({ prompt_id: 'abc123def456ghi', number: 1, node_errors: {} });
    }
    if (url.includes('/history/')) {
      historyPolls += 1;
      if (historyPolls < 2) return json({});
      return json(
        options.history ?? {
          abc123def456ghi: {
            status: { status_str: 'success', completed: true, messages: [] },
            outputs: {
              '7': { images: [{ filename: 'ltx_00001_.mp4', subfolder: 'video', type: 'output' }], animated: [true] },
              '8': { images: [{ filename: 'preview.png', subfolder: '', type: 'temp' }] },
            },
          },
        },
      );
    }
    if (url.includes('/view?')) {
      return new Response(Buffer.from('fake-mp4'), { status: 200, headers: { 'content-type': 'video/mp4' } });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  return { fetchImpl, submitted: () => prompt!, uploads, calls };
}

function provider(dir: string, server: FakeServer): ComfyUIProvider {
  return new ComfyUIProvider({
    baseUrl: 'http://comfy.test:8188/',
    workflowsDir: dir,
    fetchImpl: server.fetchImpl,
    pollIntervalMs: 1,
  });
}

describe('ComfyUI workflow parsing', () => {
  it('rejects a UI workflow and points to Export (API)', () => {
    expect(() => parseWorkflow(JSON.stringify({ nodes: [], links: [] }), 'ui.json')).toThrow(/Export \(API\)/);
  });

  it('derives the operation from the image tags', () => {
    expect(inspectWorkflow(ltxWorkflow()).operations).toEqual(['textToVideo']);
    expect(inspectWorkflow(ltxWorkflow({ start: true })).operations).toEqual(['imageToVideo']);
    expect(inspectWorkflow(ltxWorkflow({ start: true, end: true })).operations).toEqual(['firstLastFrameToVideo']);
  });

  it('rounds frames to 8n+1 for LTX', () => {
    expect(framesFor(5, 24, 8)).toBe(121);
    expect(framesFor(4, 24, 8)).toBe(97);
    expect(framesFor(2.5, 30, 1)).toBe(75);
  });

  it('reports every workflow in a folder for doctor', async () => {
    const { dir } = await setup({ 'ltx-i2v': ltxWorkflow({ start: true }), broken: { nodes: [], links: [] } });
    const reports = await inspectWorkflowDir(dir);
    expect(reports.map((report) => [report.name, report.ok, report.operations])).toEqual([
      ['broken', false, undefined],
      ['ltx-i2v', true, ['imageToVideo']],
    ]);
  });
});

describe('ComfyUI provider', () => {
  it('fills an image-to-video workflow, uploads the start frame, and downloads only the tagged video', async () => {
    const { dir, root, start } = await setup({ 'ltx-i2v': ltxWorkflow({ start: true }) });
    const server = fakeServer();
    const result = await provider(dir, server).imageToVideo({
      model: 'ltx-i2v',
      prompt: 'slow push in, neon rain',
      negativePrompt: 'blurry',
      references: [start],
      seed: 42,
      width: 1920,
      height: 1080,
      durationSeconds: 5,
      params: { fps: 24, frame_step: 8, size_multiple: 32, node_inputs: { 'cs_sampler.sampler_name': 'res_multistep' } },
      outputDir: join(root, 'out'),
    });

    const prompt = server.submitted();
    expect(prompt['1']!.inputs.text).toBe('slow push in, neon rain');
    expect(prompt['1']!.inputs.clip).toEqual(['9', 0]);
    expect(prompt['2']!.inputs.text).toBe('blurry');
    expect(prompt['3']!.inputs).toMatchObject({ width: 1920, height: 1088, length: 121 });
    expect(prompt['4']!.inputs.noise_seed).toBe(42);
    expect(prompt['5']!.inputs.frame_rate).toBe(24);
    expect(prompt['6']!.inputs.sampler_name).toBe('res_multistep');
    expect(prompt['10']!.inputs.image).toBe(`coreslopper/${server.uploads[0]}`);
    expect(server.uploads).toHaveLength(1);
    expect(server.calls.some((url) => url.startsWith('http://comfy.test:8188/view?') && url.includes('ltx_00001_.mp4'))).toBe(true);
    expect(server.calls.some((url) => url.includes('preview.png'))).toBe(false);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]!.endsWith('.mp4')).toBe(true);
    expect(await readFile(result.files[0]!, 'utf8')).toBe('fake-mp4');
  });

  it('uploads both frames for first/last-frame workflows', async () => {
    const { dir, root, start, end } = await setup({ 'ltx-flf2v': ltxWorkflow({ start: true, end: true }) });
    const server = fakeServer();
    await provider(dir, server).firstLastFrameToVideo({
      model: 'ltx-flf2v',
      prompt: 'morph',
      references: [start, end],
      seed: 1,
      outputDir: join(root, 'out'),
    });
    const prompt = server.submitted();
    expect(server.uploads).toHaveLength(2);
    expect(prompt['10']!.inputs.image).toBe(`coreslopper/${server.uploads[0]}`);
    expect(prompt['11']!.inputs.image).toBe(`coreslopper/${server.uploads[1]}`);
  });

  it('runs text-to-video without uploads', async () => {
    const { dir, root } = await setup({ 'ltx-t2v': ltxWorkflow() });
    const server = fakeServer();
    await provider(dir, server).textToVideo({ model: 'ltx-t2v', prompt: 'abstract smoke', seed: 3, outputDir: join(root, 'out') });
    expect(server.uploads).toHaveLength(0);
    expect(server.submitted()['1']!.inputs.text).toBe('abstract smoke');
  });

  it('refuses a workflow that does not fit the operation before contacting the server', async () => {
    const { dir, root, start } = await setup({ 'ltx-t2v': ltxWorkflow() });
    const server = fakeServer();
    await expect(
      provider(dir, server).imageToVideo({ model: 'ltx-t2v', prompt: 'x', references: [start], seed: 1, outputDir: root }),
    ).rejects.toThrow(/fits textToVideo/);
    expect(server.calls).toHaveLength(0);
  });

  it('rejects unknown params and missing frame tags', async () => {
    const noFrames = ltxWorkflow();
    noFrames['3']!._meta = { title: 'cs_width cs_height' };
    const { dir, root } = await setup({ 'ltx-t2v': ltxWorkflow(), 'no-frames': noFrames });
    const server = fakeServer();
    await expect(
      provider(dir, server).textToVideo({ model: 'ltx-t2v', prompt: 'x', seed: 1, params: { duration: 5 }, outputDir: root }),
    ).rejects.toThrow(/Unknown ComfyUI params.*duration/);
    await expect(
      provider(dir, server).textToVideo({ model: 'no-frames', prompt: 'x', seed: 1, durationSeconds: 5, outputDir: root }),
    ).rejects.toThrow(/cs_frames/);
  });

  it('surfaces execution errors and validation failures', async () => {
    const { dir, root } = await setup({ 'ltx-t2v': ltxWorkflow() });
    const failing = fakeServer({
      history: {
        abc123def456ghi: {
          status: {
            status_str: 'error',
            completed: false,
            messages: [['execution_error', { exception_message: 'CUDA out of memory', node_type: 'SamplerCustom' }]],
          },
          outputs: {},
        },
      },
    });
    await expect(
      provider(dir, failing).textToVideo({ model: 'ltx-t2v', prompt: 'x', seed: 1, outputDir: root }),
    ).rejects.toThrow(/CUDA out of memory/);

    const invalid = fakeServer({ queueStatus: 400 });
    await expect(
      provider(dir, invalid).textToVideo({ model: 'ltx-t2v', prompt: 'x', seed: 1, outputDir: root }),
    ).rejects.toThrow(/failed validation/);
  });

  it('explains an unreachable server', async () => {
    const { dir, root } = await setup({ 'ltx-t2v': ltxWorkflow() });
    const offline = new ComfyUIProvider({
      baseUrl: 'http://127.0.0.1:1',
      workflowsDir: dir,
      pollIntervalMs: 1,
      fetchImpl: async () => {
        throw new TypeError('fetch failed');
      },
    });
    await expect(offline.textToVideo({ model: 'ltx-t2v', prompt: 'x', seed: 1, outputDir: root })).rejects.toThrow(
      /not reachable.*COMFYUI_URL/,
    );
  }, 30_000);

  it('keys the cache on the workflow content', async () => {
    const { dir, root, start } = await setup({ 'ltx-i2v': ltxWorkflow({ start: true }) });
    const server = fakeServer();
    const runner = new GenerationRunner({
      provider: provider(dir, server),
      cacheDir: join(root, 'cache'),
      manifestPath: join(root, 'manifest.jsonl'),
    });
    const request = {
      operation: 'imageToVideo' as const,
      role: 'video.image_to_video.quality',
      model: 'ltx-i2v',
      prompt: 'push in',
      references: [start],
      seed: 5,
      outputDir: join(root, 'out'),
      estimatedCostUsd: 0,
    };
    const first = await runner.run(request);
    const again = await runner.run(request);
    expect(again.cached).toBe(true);
    expect(again.hash).toBe(first.hash);

    const changed = ltxWorkflow({ start: true });
    changed['6']!.inputs.sampler_name = 'dpmpp_2m';
    await writeFile(join(dir, 'ltx-i2v.json'), JSON.stringify(changed));
    const edited = await runner.run(request);
    expect(edited.cached).toBe(false);
    expect(edited.hash).not.toBe(first.hash);
  });
});

describe('ComfyUI provider selection', () => {
  const base = {
    version: 1,
    slug: 'test',
    title: 'Test',
    created: '2026-11-09',
    workflow: { version: '0.1.0' },
    budget_usd: 50,
    formats: { master: { aspect: '16:9', width: 1920, height: 1080, fps: 30 }, derivatives: [] },
  };

  it('keeps lip-sync on fal when video clips render in ComfyUI', () => {
    const config = ProjectConfigSchema.parse({ ...base, providers: { image: 'fal', video: 'comfyui' } });
    expect(providerForRole(config, 'video.image_to_video.quality')).toBe('comfyui');
    expect(providerForRole(config, 'video.lipsync')).toBe('fal');
    expect(providerForRole(config, 'image.keyframe')).toBe('fal');
  });

  it('accepts ComfyUI for stills, lip-sync, and audio when selected', () => {
    const config = ProjectConfigSchema.parse({
      ...base,
      providers: { image: 'comfyui', video: 'comfyui', lipsync: 'comfyui' },
    });
    expect(providerForRole(config, 'image.keyframe')).toBe('comfyui');
    expect(providerForRole(config, 'video.lipsync')).toBe('comfyui');
    expect(providerForRole(config, 'audio.music')).toBe('comfyui');
    const mocked = ProjectConfigSchema.parse({ ...base, providers: { image: 'mock', video: 'mock', audio: 'mock' } });
    expect(providerForRole(mocked, 'audio.sfx')).toBe('mock');
  });
});

/** The LTX FLF2V lip-sync graph: start/end frame, driving audio cut by start + frames, ResolutionSelector. */
function ltxLipsyncWorkflow(): ComfyWorkflow {
  return {
    '1': { class_type: 'PrimitiveStringMultiline', inputs: { value: 'demo' }, _meta: { title: 'Prompt cs_prompt' } },
    '2': { class_type: 'LoadImage', inputs: { image: 'a.png' }, _meta: { title: 'Load First Frame cs_start_image' } },
    '3': { class_type: 'LoadImage', inputs: { image: 'b.png' }, _meta: { title: 'Load Last Frame cs_end_image' } },
    '4': { class_type: 'LoadAudio', inputs: { audio: 'demo.mp3' }, _meta: { title: 'Load Driving Audio cs_audio' } },
    '5': {
      class_type: 'ResolutionSelector',
      inputs: { aspect_ratio: '16:9 (Widescreen)', megapixels: 0.9, multiple: 64 },
      _meta: { title: 'Resolution Selector cs_resolution' },
    },
    '6': { class_type: 'PrimitiveInt', inputs: { value: 73 }, _meta: { title: 'Duration (frames) cs_frames' } },
    '7': { class_type: 'PrimitiveInt', inputs: { value: 25 }, _meta: { title: 'Frame Rate(int) cs_fps' } },
    '8': {
      class_type: 'TrimAudioDuration',
      inputs: { start_index: 0, duration: ['9', 0], audio: ['4', 0] },
      _meta: { title: 'Trim Driving Audio cs_audio_start' },
    },
    '9': { class_type: 'ComfyMathExpression', inputs: { expression: 'a / b', 'values.a': ['6', 0] }, _meta: { title: 'len' } },
    '10': { class_type: 'RandomNoise', inputs: { noise_seed: 1 }, _meta: { title: 'RandomNoise cs_seed' } },
    '11': { class_type: 'SaveVideo', inputs: { filename_prefix: 'x' }, _meta: { title: 'Save Video cs_output' } },
  };
}

function qwenEditWorkflow(): ComfyWorkflow {
  return {
    '1': { class_type: 'PrimitiveStringMultiline', inputs: { value: 'demo' }, _meta: { title: 'cs_prompt' } },
    '2': { class_type: 'LoadImage', inputs: { image: 'demo.png' }, _meta: { title: 'cs_start_image' } },
    '3': {
      class_type: 'TextEncodeQwenImage21',
      inputs: { prompt: ['1', 0], negative_prompt: '', 'images.image_1': ['2', 0] },
      _meta: { title: 'encode cs_negative cs_references' },
    },
    '4': { class_type: 'RandomNoise', inputs: { noise_seed: 1 }, _meta: { title: 'cs_seed' } },
    '5': { class_type: 'SaveImageAdvanced', inputs: { filename_prefix: 'q' }, _meta: { title: 'cs_output' } },
  };
}

function musicWorkflow(): ComfyWorkflow {
  return {
    '1': {
      class_type: 'MiniMaxMusic3TextEncode',
      inputs: { caption: 'demo', lyrics: '[Verse] demo lyrics', max_duration: 60, seed: ['2', 0] },
      _meta: { title: 'cs_prompt cs_lyrics cs_duration' },
    },
    '2': { class_type: 'SeedNode', inputs: { seed: 1 }, _meta: { title: 'cs_seed' } },
    '3': { class_type: 'SaveAudioAdvanced', inputs: { filename_prefix: 'm' }, _meta: { title: 'cs_output' } },
  };
}

function outputsServer(outputs: Record<string, unknown>): FakeServer {
  return fakeServer({
    history: { abc123def456ghi: { status: { status_str: 'success', completed: true, messages: [] }, outputs } },
  });
}

describe('ComfyUI images, lip-sync, and audio', () => {
  it('derives operations from the output node and the image/audio tags', () => {
    expect(inspectWorkflow(ltxLipsyncWorkflow()).operations).toEqual(['lipSync']);
    expect(inspectWorkflow(qwenEditWorkflow()).operations).toEqual(['editImage']);
    const t2i = qwenEditWorkflow();
    delete t2i['2'];
    expect(inspectWorkflow(t2i).operations).toEqual(['generateImage']);
    expect(inspectWorkflow(musicWorkflow())).toMatchObject({ kind: 'audio', operations: ['generateAudio'] });
  });

  it('lip-syncs start and end frame to the vocal stem, cut by start time and frames that never outrun it', async () => {
    const { dir, root, start, end } = await setup({ 'ltx25-lipsync-flf2v': ltxLipsyncWorkflow() });
    const vocals = join(root, 'vocals.wav');
    await writeFile(vocals, 'vocal-stem');
    const server = outputsServer({ '11': { images: [{ filename: 'lip_00001.mp4', subfolder: '', type: 'output' }] } });
    const result = await provider(dir, server).lipSync({
      model: 'ltx25-lipsync-flf2v',
      prompt: 'Close-up, static camera. She sings the audio with accurate lip sync.',
      references: [start, end],
      audio: vocals,
      audioStartSeconds: 42.5,
      seed: 9,
      width: 1080,
      height: 1920,
      durationSeconds: 3.6,
      params: { fps: 24, frame_step: 8, size_multiple: 64, megapixels: 0.8 },
      outputDir: join(root, 'out'),
    });
    const prompt = server.submitted();
    expect(server.uploads).toHaveLength(3);
    expect(prompt['2']!.inputs.image).toBe(`coreslopper/${server.uploads[0]}`);
    expect(prompt['3']!.inputs.image).toBe(`coreslopper/${server.uploads[1]}`);
    expect(prompt['4']!.inputs.audio).toBe(`coreslopper/${server.uploads[2]}`);
    expect(prompt['5']!.inputs).toEqual({ aspect_ratio: '9:16 (Portrait Widescreen)', megapixels: 0.8, multiple: 64 });
    // 3.6 s at 24 fps = 86.4 frames -> 81 (8n+1, rounded down): the clip never runs past the audio.
    expect(prompt['6']!.inputs.value).toBe(81);
    expect(prompt['7']!.inputs.value).toBe(24);
    expect(prompt['8']!.inputs.start_index).toBe(42.5);
    expect(prompt['8']!.inputs.duration).toEqual(['9', 0]);
    expect(prompt['10']!.inputs.noise_seed).toBe(9);
    expect(result.files[0]!.endsWith('.mp4')).toBe(true);
  });

  it('uses the single keyframe as start and end frame', async () => {
    const { dir, root, start } = await setup({ 'ltx25-lipsync-flf2v': ltxLipsyncWorkflow() });
    const vocals = join(root, 'vocals.wav');
    await writeFile(vocals, 'vocal-stem');
    const server = outputsServer({ '11': { images: [{ filename: 'clip.mp4', subfolder: '', type: 'output' }] } });
    await provider(dir, server).lipSync({
      model: 'ltx25-lipsync-flf2v',
      prompt: 'x',
      references: [start],
      audio: vocals,
      seed: 2,
      durationSeconds: 2,
      params: { fps: 24, frame_step: 8 },
      outputDir: join(root, 'out'),
    });
    const prompt = server.submitted();
    expect(prompt['3']!.inputs.image).toBe(prompt['2']!.inputs.image);
    expect(prompt['8']!.inputs.start_index).toBe(0);
    expect(prompt['6']!.inputs.value).toBe(41);
  });

  it('rejects other operations and too-short segments on the lip-sync workflow', async () => {
    const { dir, root, start } = await setup({ 'ltx25-lipsync-flf2v': ltxLipsyncWorkflow() });
    const server = outputsServer({});
    await expect(
      provider(dir, server).imageToVideo({ model: 'ltx25-lipsync-flf2v', prompt: 'x', references: [start], seed: 1, outputDir: root }),
    ).rejects.toThrow(/fits lipSync/);
    expect(framesWithin(3.6, 24, 8)).toBe(81);
    expect(() => framesWithin(0.3, 24, 8)).toThrow(/too short/);
    expect(resolutionAspect(1920, 1088)).toBe('16:9 (Widescreen)');
    expect(() => resolutionAspect(1080, 1350)).toThrow(/aspect ratio/);
  });

  it('edits with extra references linked into the autogrow input', async () => {
    const { dir, root, start, end } = await setup({ 'qwen-edit': qwenEditWorkflow() });
    const server = outputsServer({
      '5': { images: [{ filename: 'q_00001_.png', subfolder: '', type: 'output' }] },
    });
    const result = await provider(dir, server).editImage({
      model: 'qwen-edit',
      prompt: 'put the character from image 2 into image 1',
      negativePrompt: 'extra fingers',
      references: [start, end],
      seed: 4,
      width: 1920,
      height: 1080,
      outputDir: join(root, 'out'),
    });
    const prompt = server.submitted();
    expect(prompt['1']!.inputs.value).toBe('put the character from image 2 into image 1');
    expect(prompt['3']!.inputs.negative_prompt).toBe('extra fingers');
    expect(prompt['3']!.inputs['images.image_2']).toEqual(['cs_ref_2', 0]);
    expect(prompt['cs_ref_2']!).toMatchObject({ class_type: 'LoadImage', inputs: { image: `coreslopper/${server.uploads[1]}` } });
    expect(result.files[0]!.endsWith('.png')).toBe(true);
  });

  it('refuses extra references when the workflow takes one image', async () => {
    const single = qwenEditWorkflow();
    single['3']!._meta = { title: 'encode' };
    const { dir, root, start, end } = await setup({ single });
    const server = fakeServer();
    await expect(
      provider(dir, server).editImage({ model: 'single', prompt: 'x', references: [start, end], seed: 1, outputDir: root }),
    ).rejects.toThrow(/cs_references/);
    expect(server.calls).toHaveLength(0);
  });

  it('generates audio with lyrics and never keeps the demo lyrics', async () => {
    const { dir, root } = await setup({ music: musicWorkflow() });
    const server = outputsServer({ '3': { audio: [{ filename: 'm_00001_.mp3', subfolder: 'audio', type: 'output' }] } });
    const result = await provider(dir, server).generateAudio({
      model: 'music',
      prompt: 'dark electroclash',
      seed: 7,
      durationSeconds: 30,
      outputDir: join(root, 'out'),
    });
    const prompt = server.submitted();
    expect(prompt['1']!.inputs).toMatchObject({ caption: 'dark electroclash', lyrics: '', max_duration: 30 });
    expect(prompt['2']!.inputs.seed).toBe(7);
    expect(server.uploads).toHaveLength(0);
    expect(result.files[0]!.endsWith('.mp3')).toBe(true);
  });

  it('clones a voice from the reference audio and its transcript', async () => {
    const clone: ComfyWorkflow = {
      '1': { class_type: 'SaveAudio', inputs: { filename_prefix: 'v', audio: ['24', 0] }, _meta: { title: 'cs_output' } },
      '2': { class_type: 'LoadAudio', inputs: { audio: 'demo.wav' }, _meta: { title: 'cs_audio' } },
      '22': {
        class_type: 'VoxCPM_VoiceCloning',
        inputs: { prompt_text: 'demo transcript', prompt_audio: ['2', 0], reference_audio: ['2', 0] },
        _meta: { title: 'cs_transcript' },
      },
      '24': {
        class_type: 'VoxCPM_TTS',
        inputs: { text: 'demo', seed: 1, voice_config: ['22', 0] },
        _meta: { title: 'VoxCPM TTS cs_prompt cs_seed' },
      },
    };
    expect(inspectWorkflow(clone)).toMatchObject({ kind: 'audio', operations: ['generateAudio'], warnings: [] });
    const { dir, root } = await setup({ 'voxcpm-clone': clone });
    const voice = join(root, 'voice.wav');
    await writeFile(voice, 'reference-voice');
    const request = { model: 'voxcpm-clone', prompt: 'Hallo Welt.', seed: 3, outputDir: join(root, 'out') };

    const quiet = fakeServer();
    await expect(provider(dir, quiet).generateAudio({ ...request, params: { transcript: 'Ich bin es.' } })).rejects.toThrow(
      /reference voice/,
    );
    await expect(provider(dir, quiet).generateAudio({ ...request, audio: voice })).rejects.toThrow(/params.transcript/);
    expect(quiet.calls).toHaveLength(0);

    const server = outputsServer({ '1': { audio: [{ filename: 'v_00001_.flac', subfolder: '', type: 'output' }] } });
    const result = await provider(dir, server).generateAudio({ ...request, audio: voice, params: { transcript: 'Ich bin es.' } });
    const prompt = server.submitted();
    expect(server.uploads).toHaveLength(1);
    expect(prompt['2']!.inputs.audio).toBe(`coreslopper/${server.uploads[0]}`);
    expect(prompt['22']!.inputs.prompt_text).toBe('Ich bin es.');
    expect(prompt['24']!.inputs).toMatchObject({ text: 'Hallo Welt.', seed: 3 });
    expect(result.files[0]!.endsWith('.flac')).toBe(true);
  });

  it('fills an ACE-Step encoder through its tags input', async () => {
    const ace: ComfyWorkflow = {
      '94': {
        class_type: 'TextEncodeAceStepAudio1.5',
        inputs: { tags: 'demo', lyrics: '[Verse] demo', duration: 120, seed: ['109', 0], bpm: 95 },
        _meta: { title: 'cs_prompt cs_lyrics cs_duration' },
      },
      '98': { class_type: 'EmptyAceStep1.5LatentAudio', inputs: { seconds: 120 }, _meta: { title: 'cs_duration' } },
      '109': { class_type: 'PrimitiveInt', inputs: { value: 0 }, _meta: { title: 'cs_seed' } },
      '111': { class_type: 'SaveAudioAdvanced', inputs: { filename_prefix: 'a' }, _meta: { title: 'cs_output' } },
    };
    const { dir, root } = await setup({ 'music-ace': ace });
    const server = outputsServer({ '111': { audio: [{ filename: 'a_00001_.mp3', subfolder: '', type: 'output' }] } });
    await provider(dir, server).generateAudio({
      model: 'music-ace',
      prompt: 'synthwave, 120 BPM',
      seed: 5,
      durationSeconds: 40,
      params: { lyrics: '[Chorus] la la', node_inputs: { 'cs_prompt.bpm': 120 } },
      outputDir: join(root, 'out'),
    });
    const prompt = server.submitted();
    expect(prompt['94']!.inputs).toMatchObject({ tags: 'synthwave, 120 BPM', lyrics: '[Chorus] la la', duration: 40, bpm: 120 });
    expect(prompt['98']!.inputs.seconds).toBe(40);
    expect(prompt['109']!.inputs.value).toBe(5);
  });
});
