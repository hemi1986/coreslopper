import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectConfigSchema, providerForRole } from '@coreslopper/core';
import {
  ComfyUIProvider,
  GenerationRunner,
  framesFor,
  inspectWorkflow,
  inspectWorkflowDir,
  parseWorkflow,
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
    expect(inspectWorkflow(ltxWorkflow()).operation).toBe('textToVideo');
    expect(inspectWorkflow(ltxWorkflow({ start: true })).operation).toBe('imageToVideo');
    expect(inspectWorkflow(ltxWorkflow({ start: true, end: true })).operation).toBe('firstLastFrameToVideo');
  });

  it('rounds frames to 8n+1 for LTX', () => {
    expect(framesFor(5, 24, 8)).toBe(121);
    expect(framesFor(4, 24, 8)).toBe(97);
    expect(framesFor(2.5, 30, 1)).toBe(75);
  });

  it('reports every workflow in a folder for doctor', async () => {
    const { dir } = await setup({ 'ltx-i2v': ltxWorkflow({ start: true }), broken: { nodes: [], links: [] } });
    const reports = await inspectWorkflowDir(dir);
    expect(reports.map((report) => [report.name, report.ok, report.operation])).toEqual([
      ['broken', false, undefined],
      ['ltx-i2v', true, 'imageToVideo'],
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

  it('does not accept ComfyUI for stills or lip-sync', () => {
    expect(() => ProjectConfigSchema.parse({ ...base, providers: { image: 'comfyui', video: 'fal' } })).toThrow();
    expect(() =>
      ProjectConfigSchema.parse({ ...base, providers: { image: 'fal', video: 'comfyui', lipsync: 'comfyui' } }),
    ).toThrow();
  });
});
