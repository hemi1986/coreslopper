import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  ComfyUIProvider,
  inspectWorkflow,
  parseWorkflow,
  type ComfyWorkflow,
  type FetchLike,
} from '../packages/providers/src/index.ts';
import {
  FLEX_NO_MUSIC,
  checkFl2vaPrompt,
  checkFlexPrompt,
  pikaEndMark,
  pikaFrames,
  renderFl2vaPrompt,
  withFl2vaAlignment,
  type Fl2vaPromptInput,
} from '../packages/core/src/index.ts';
import { parse as parseYaml } from 'yaml';
import { BatchSchema, runBatch, type BatchTarget } from '../packages/cli/src/generate.js';

/** A copy of comfyui/workflows/pika-h3-flf2va.json; the repository ships no workflows. */
const WORKFLOW_FILE = join(__dirname, 'fixtures', 'pika-h3-flf2va.json');
const original = (): ComfyWorkflow => parseWorkflow(readFileSync(WORKFLOW_FILE, 'utf8'), 'pika-h3-flf2va.json');

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function setup(workflow: ComfyWorkflow = original()) {
  const root = await mkdtemp(join(tmpdir(), 'coreslopper-fl2va-'));
  temporary.push(root);
  const dir = join(root, 'workflows');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'pika-h3-flf2va.json'), JSON.stringify(workflow));
  const start = join(root, 'start.png');
  const end = join(root, 'end.png');
  await writeFile(start, 'start');
  await writeFile(end, 'end');
  return { dir, start, end };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function fakeServer() {
  let prompt: ComfyWorkflow | undefined;
  const uploads: string[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    if (url.endsWith('/upload/image')) {
      const file = (init?.body as FormData).get('image') as File;
      uploads.push(file.name);
      return json({ name: file.name, subfolder: '', type: 'input' });
    }
    if (url.endsWith('/prompt')) {
      prompt = (JSON.parse(String(init?.body)) as { prompt: ComfyWorkflow }).prompt;
      return json({ prompt_id: 'fl2va0000000001', number: 1, node_errors: {} });
    }
    if (url.includes('/history/')) {
      return json({
        fl2va0000000001: {
          status: { status_str: 'success', completed: true },
          outputs: { '92': { images: [{ filename: 'clip.mp4', subfolder: 'video', type: 'output' }] } },
        },
      });
    }
    if (url.includes('/view?')) return new Response(Buffer.from('mp4'), { status: 200 });
    if (url.includes('/object_info/')) return json({});
    throw new Error(`unexpected fetch ${url}`);
  };
  return { fetchImpl, uploads, submitted: () => prompt! };
}

const fl2va: Fl2vaPromptInput = {
  style: 'Flat pop-art studio look, hard frontal light.',
  shots: [
    [
      'The shot begins exactly on Picture 1: she holds the sticker pizza at chin height.',
      'At about one and a half seconds she spins once, and the shot settles into the final composition.',
    ],
  ],
  soundscape: 'A papery tear, a short whoosh, a radio in the corner plays a faint pop song.',
};

function input(references: string[], outputDir: string, extra: Record<string, unknown> = {}) {
  const seconds = Number(extra.durationSeconds ?? 3);
  return {
    model: 'pika-h3-flf2va',
    prompt: renderFl2vaPrompt(fl2va, { seconds, lastFrame: references.length === 2 }),
    references,
    seed: 7,
    width: 1080,
    height: 1920,
    durationSeconds: 3,
    params: { fps: 24 },
    outputDir,
    idempotencyKey: 'fl2va-test-key-0001',
    ...extra,
  };
}

const i2vNode = (workflow: ComfyWorkflow) =>
  Object.values(workflow).find((node) => node.class_type === 'MiniMaxH3ImageToVideo')!;

describe('Pika H3 Flex frame count and end mark', () => {
  it('rounds to 17n+5 frames at 24 fps like the graph', () => {
    expect([3, 4.4, 5, 8].map(pikaFrames)).toEqual([73, 107, 124, 192]);
    expect([3, 4.4, 5, 8].map(pikaEndMark)).toEqual(['3.04', '4.46', '5.17', '8.00']);
    expect(pikaFrames(0.1)).toBe(5);
    expect(() => pikaFrames(0)).toThrow(/positive duration/);
  });
});

describe('Pika H3 Flex FL2VA workflow in the ComfyUI adapter', () => {
  it('writes the shot length as is: frame_step, size_multiple, and megapixels do not apply', async () => {
    const { dir, start, end } = await setup();
    const provider = new ComfyUIProvider({ baseUrl: 'http://comfy.test', workflowsDir: dir, fetchImpl: fakeServer().fetchImpl });
    const workflow = await provider.buildPrompt(
      input([start, end], dir, { durationSeconds: 4.4, params: { fps: 24, frame_step: 8, size_multiple: 64, megapixels: 0.8 } }),
      'firstLastFrameToVideo',
      { start: 's.png', end: 'e.png' },
    );
    expect(workflow['133']!.inputs.value).toBe(4.4);
    expect(workflow['150']!.inputs.expression).toBe(original()['150']!.inputs.expression);
  });

  it('fits first/last-frame and image-to-video', () => {
    const inspection = inspectWorkflow(original());
    expect(inspection.operations).toEqual(['firstLastFrameToVideo', 'imageToVideo']);
    expect(inspection.titles.startImage).toEqual(['148']);
    expect(inspection.titles.endImage).toEqual(['147']);
    expect(inspection.warnings).toEqual([]);
  });

  it('wires start and end frame for firstLastFrameToVideo', async () => {
    const { dir, start, end } = await setup();
    const server = fakeServer();
    const provider = new ComfyUIProvider({ baseUrl: 'http://comfy.test', workflowsDir: dir, fetchImpl: server.fetchImpl, pollIntervalMs: 1 });
    await provider.firstLastFrameToVideo(input([start, end], join(dir, 'out')));
    const workflow = server.submitted();
    expect(server.uploads).toHaveLength(2);
    expect(workflow['148']!.inputs.image).toBe(server.uploads[0]);
    expect(workflow['147']!.inputs.image).toBe(server.uploads[1]);
    expect(server.uploads[0]).not.toBe(server.uploads[1]);
    expect(i2vNode(workflow).inputs.last_frame).toEqual(['147', 0]);
    expect(workflow['133']!.inputs.value).toBe(3);
    expect(workflow['129']!.inputs.noise_seed).toBe(7);
  });

  it('drops the end frame for imageToVideo so the template image never leaks in', async () => {
    const { dir, start } = await setup();
    const server = fakeServer();
    const provider = new ComfyUIProvider({ baseUrl: 'http://comfy.test', workflowsDir: dir, fetchImpl: server.fetchImpl, pollIntervalMs: 1 });
    await provider.imageToVideo(input([start], join(dir, 'out')));
    const workflow = server.submitted();
    expect(server.uploads).toHaveLength(1);
    expect(workflow['147']).toBeUndefined();
    expect(i2vNode(workflow).inputs.last_frame).toBeUndefined();
    expect(i2vNode(workflow).inputs.first_frame).toEqual(['148', 0]);
  });

  it.each([
    ['cs:start_image', '148'],
    ['cs:end_image', '147'],
    ['cs:seed', '129'],
    ['cs:duration', '133'],
    ['cs:prompt', '138'],
    ['cs:output', '92'],
  ])('stops with a ConfigError when %s is missing, also for imageToVideo', async (tag, id) => {
    const changed = original();
    changed[id]!._meta = { title: 'untitled' };
    const { dir, start } = await setup(changed);
    const provider = new ComfyUIProvider({ baseUrl: 'http://comfy.test', workflowsDir: dir, fetchImpl: fakeServer().fetchImpl });
    await expect(provider.buildPrompt(input([start], dir), 'imageToVideo', { start: 's.png' })).rejects.toThrow(
      new RegExp(`FL2VA\\) has no node titled ${tag}\\b`),
    );
  });

  it('keeps the fixed Pika setup: FL2VA LoRA at 1.0, no node-ID patches', async () => {
    const { dir, start, end } = await setup();
    const provider = new ComfyUIProvider({ baseUrl: 'http://comfy.test', workflowsDir: dir, fetchImpl: fakeServer().fetchImpl });
    await expect(
      provider.buildPrompt(input([start, end], dir, { params: { node_inputs: { '134.strength_model': 0.5 } } }), 'firstLastFrameToVideo', {
        start: 's.png',
        end: 'e.png',
      }),
    ).rejects.toThrow(/must address a cs: tag/);

    const changed = original();
    changed['134']!.inputs.lora_name = 'pika_h3_flex_ref2va_v1_bf16.safetensors';
    const other = await setup(changed);
    const strict = new ComfyUIProvider({ baseUrl: 'http://comfy.test', workflowsDir: other.dir, fetchImpl: fakeServer().fetchImpl });
    await expect(
      strict.buildPrompt(input([other.start], other.dir), 'imageToVideo', { start: 's.png' }),
    ).rejects.toThrow(/lora_name "pika_h3_flex_ref2va_v1_bf16\.safetensors" is not in comfyui_locks\.pika-h3-fl2va\.lora_name/);
  });

  it('takes the allowed model files from config: an NVFP4 UNet passes once it is listed', async () => {
    const nvfp4 = original();
    nvfp4['127']!.inputs.unet_name = 'minimax_h3_fl2va_nvfp4.safetensors';
    const { dir, start } = await setup(nvfp4);
    const build = (locks?: Record<string, Record<string, string[]>>) =>
      new ComfyUIProvider({ baseUrl: 'http://comfy.test', workflowsDir: dir, fetchImpl: fakeServer().fetchImpl, ...(locks ? { locks } : {}) })
        .buildPrompt(input([start], dir), 'imageToVideo', { start: 's.png' });
    // The repo config lists only the int8 UNet.
    await expect(build()).rejects.toThrow(/unet_name "minimax_h3_fl2va_nvfp4\.safetensors" is not in comfyui_locks\.pika-h3-fl2va\.unet_name/);
    const config = parseYaml(readFileSync(join(__dirname, '..', 'config', 'models.yaml'), 'utf8')).comfyui_locks;
    const listed = {
      ...config,
      'pika-h3-fl2va': { ...config['pika-h3-fl2va'], unet_name: [...config['pika-h3-fl2va'].unet_name, 'minimax_h3_fl2va_nvfp4.safetensors'] },
    };
    await expect(build(listed)).resolves.toBeDefined();
    await expect(build({ 'pika-h3-ref2va': config['pika-h3-ref2va'] })).rejects.toThrow(/has no comfyui_locks\.pika-h3-fl2va/);
    const { clip_name: _drop, ...withoutClip } = listed['pika-h3-fl2va'];
    await expect(build({ ...listed, 'pika-h3-fl2va': withoutClip })).rejects.toThrow(/allows no clip_name/);
  });
});

const templatePrompt = String(original()['138']!.inputs.value);

describe('FL2VA prompt schema', () => {
  it('accepts the template example: 5 s with an end frame, music line "none"', () => {
    expect(templatePrompt).toContain(`non_diegetic_music: ${FLEX_NO_MUSIC}`);
    expect(() => checkFl2vaPrompt(templatePrompt, { seconds: 5, lastFrame: true })).not.toThrow();
  });

  it('renders the alignment line from the duration; Picture 2 only with an end frame', () => {
    const both = renderFl2vaPrompt(fl2va, { seconds: 4.4, lastFrame: true });
    expect(both.split('\n')[0]).toBe(
      'How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark ' +
        'of the target video; Picture 2 (from Shot 1) aligns with the 4.46-second mark of the target video.',
    );
    const single = renderFl2vaPrompt(fl2va, { seconds: 4.4, lastFrame: false });
    expect(single.split('\n')[0]).toBe(
      'How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video.',
    );
    expect(single).toContain('integrated_multimodal_description: [Shot 1] Flat pop-art studio look, hard frontal light. The shot begins');
    expect(single).toContain('overall_soundscape: A papery tear');
    expect(single.endsWith(`non_diegetic_music: ${FLEX_NO_MUSIC}`)).toBe(true);
  });

  it('prepends the alignment line to a raw prompt, but never fixes a wrong one', () => {
    const body = renderFl2vaPrompt(fl2va, { seconds: 3, lastFrame: false }).split('\n\n').slice(1).join('\n\n');
    const fixed = withFl2vaAlignment(body, { seconds: 3, lastFrame: false });
    expect(() => checkFl2vaPrompt(fixed, { seconds: 3, lastFrame: false })).not.toThrow();
    expect(() => checkFl2vaPrompt(templatePrompt, { seconds: 3, lastFrame: true })).toThrow(/expected: .*3\.04-second mark/);
    expect(() => checkFl2vaPrompt(body, { seconds: 3, lastFrame: false })).toThrow(/must start with the alignment line/);
  });

  it('rejects Picture 2 without an end frame and the template score', () => {
    expect(() => checkFl2vaPrompt(templatePrompt, { seconds: 5, lastFrame: false })).toThrow(/Picture 2 has no keyframe/);
    const scored = templatePrompt.replace(FLEX_NO_MUSIC, 'A bright brass figure.');
    expect(() => checkFl2vaPrompt(scored, { seconds: 5, lastFrame: true })).toThrow(/non_diegetic_music must be exactly/);
    // A held shot needs no time marks.
    const held = templatePrompt.replaceAll(/at about/gi, 'around');
    expect(() => checkFl2vaPrompt(held, { seconds: 5, lastFrame: true })).not.toThrow();
  });

  it('never mixes with the Ref2VA Flex schema, in either direction', () => {
    const ref2vaText = [
      'subject_definitions:\n<Subject 1> is the pilot in <Picture 1>.',
      'summary:\n[reference generation] One shot.',
      'retention_analysis:\n<Subject 1>: fully_preserved - helmet.',
      'detailed_description:\nLook.\n\n[Shot 1] At about 1 second the pilot turns.',
      'overall_soundscape:\nHum.',
      `non_diegetic_music:\n${FLEX_NO_MUSIC}`,
    ].join('\n\n');
    expect(() => checkFlexPrompt(ref2vaText, 1)).not.toThrow();
    expect(() => checkFl2vaPrompt(ref2vaText, { seconds: 3, lastFrame: false })).toThrow(/Ref2VA schema in an FL2VA prompt/);
    expect(() => checkFlexPrompt(templatePrompt, 2)).toThrow(/FL2VA schema in a Ref2VA prompt/);
  });

  it('is checked in the adapter as well', async () => {
    const { dir, start } = await setup();
    const provider = new ComfyUIProvider({ baseUrl: 'http://comfy.test', workflowsDir: dir, fetchImpl: fakeServer().fetchImpl });
    await expect(
      provider.buildPrompt(input([start], dir, { prompt: templatePrompt }), 'imageToVideo', { start: 's.png' }),
    ).rejects.toThrow(/Picture 2 has no keyframe/);
  });
});

/** A PNG header with the given size: enough for imageSize(). */
function png(width: number, height: number): Buffer {
  const data = Buffer.alloc(33);
  data.writeUInt32BE(0x89504e47, 0);
  data.writeUInt32BE(0x0d0a1a0a, 4);
  data.writeUInt32BE(13, 8);
  data.write('IHDR', 12);
  data.writeUInt32BE(width, 16);
  data.writeUInt32BE(height, 20);
  return data;
}

function target(): BatchTarget {
  const root = mkdtempSync(join(tmpdir(), 'cs-fl2va-'));
  temporary.push(root);
  writeFileSync(join(root, 'start.png'), png(928, 1632));
  writeFileSync(join(root, 'end.png'), png(928, 1632));
  writeFileSync(join(root, 'wide.png'), png(1632, 928));
  return {
    label: 'project',
    config: {
      kind: 'episode',
      providers: { image: 'comfyui', video: 'comfyui' },
      models: {},
      formats: { master: { id: '9x16', width: 1080, height: 1920 } },
      batch_cap_usd: undefined,
    } as unknown as BatchTarget['config'],
    state: { budget: { totalUsd: 10, spentUsd: 0, reservedUsd: 0 }, updatedAt: '' },
    paths: { root, assets: join(root, 'assets'), manifest: join(root, 'assets', 'manifest.jsonl') },
    saveState: async () => undefined,
  };
}

describe('FL2VA batch items', () => {
  // generate finds the workflow by name in COMFYUI_WORKFLOWS_DIR.
  const previous = process.env.COMFYUI_WORKFLOWS_DIR;
  let workflows = '';
  beforeAll(async () => {
    workflows = await mkdtemp(join(tmpdir(), 'coreslopper-fl2va-workflows-'));
    await writeFile(join(workflows, 'pika-h3-flf2va.json'), JSON.stringify(original()));
    process.env.COMFYUI_WORKFLOWS_DIR = workflows;
  });
  afterAll(async () => {
    if (previous === undefined) delete process.env.COMFYUI_WORKFLOWS_DIR;
    else process.env.COMFYUI_WORKFLOWS_DIR = previous;
    await rm(workflows, { recursive: true, force: true });
  });
  const item = {
    operation: 'firstLastFrameToVideo',
    role: 'video.first_last_frame',
    references: ['start.png', 'end.png'],
    durationSeconds: 5,
    params: { workflow: 'pika-h3-flf2va' },
    fl2va,
  };

  it('renders "fl2va" with its alignment line and runs on pika-h3-flf2va', async () => {
    const batch = BatchSchema.parse([item]);
    expect(batch[0]!.prompt).toContain('Picture 2 (from Shot 1) aligns with the 5.17-second mark');
    const [entry] = await runBatch(target(), batch, { dryRun: true, log: false });
    expect(entry?.resolved.model).toBe('pika-h3-flf2va');
    expect(entry?.resolved.notes?.join()).toMatch(/pika-h3 fl2va · first and last frame · about 736x1312 · 24 fps, 124 frames \(end mark 5\.17 s\)/);
  });

  it('prepends the alignment line to a plain prompt for one keyframe', async () => {
    const body = renderFl2vaPrompt(fl2va, { seconds: 3, lastFrame: false }).split('\n\n').slice(1).join('\n\n');
    const batch = BatchSchema.parse([
      { ...item, operation: 'imageToVideo', role: 'video.first_last_frame', references: ['start.png'], durationSeconds: 3, fl2va: undefined, prompt: body },
    ]);
    const [entry] = await runBatch(target(), batch, { dryRun: true, log: false });
    expect(entry?.resolved.prompt?.split('\n')[0]).toBe(
      'How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video.',
    );
  });

  it('stops when the end frame has another aspect than the start frame, instead of cropping it', async () => {
    const wide = BatchSchema.parse([{ ...item, references: ['start.png', 'wide.png'] }]);
    await expect(runBatch(target(), wide, { dryRun: true, log: false })).rejects.toThrow(
      /end frame wide\.png is 1632x928, the start frame start\.png 928x1632\. Both frames need the same aspect ratio/,
    );
    const close = target();
    writeFileSync(join(close.paths.root, 'end.png'), png(930, 1632));
    await expect(runBatch(close, BatchSchema.parse([item]), { dryRun: true, log: false })).resolves.toHaveLength(1);
  });

  it('rejects "fl2va" off the FL2VA workflow, without a duration, or next to another prompt', async () => {
    const ltx = BatchSchema.parse([{ ...item, params: {} }]);
    await expect(runBatch(target(), ltx, { dryRun: true, log: false })).rejects.toThrow(/need the Pika H3 FL2VA workflow/);
    expect(() => BatchSchema.parse([{ ...item, durationSeconds: undefined }])).toThrow(/needs durationSeconds/);
    expect(() => BatchSchema.parse([{ ...item, prompt: 'x' }])).toThrow(/exactly one of/);
    expect(() => BatchSchema.parse([{ ...item, operation: 'referenceToVideo' }])).toThrow(/only for imageToVideo and firstLastFrameToVideo/);
  });
});
