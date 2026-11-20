import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkFlexPrompt, type FlexPromptInput } from '@coreslopper/core';
import {
  ComfyUIProvider,
  inspectWorkflow,
  nodesWithTitle,
  parseWorkflow,
  silentWav,
  type ComfyWorkflow,
  type FetchLike,
} from '../packages/providers/src/index.ts';
import { BatchSchema, runBatch, type BatchTarget } from '../packages/cli/src/generate.js';
import { resolveBinary } from '../packages/cli/src/media.js';

const WORKFLOW_FILE = join(__dirname, 'fixtures', 'pika-h3-ref2va-lipsync.json');
const workflowText = readFileSync(WORKFLOW_FILE, 'utf8');
const original = (): ComfyWorkflow => parseWorkflow(workflowText, 'pika-h3-ref2va-lipsync.json');
const examplePrompt = String(Object.values(original()).find((node) => node._meta?.title === 'cs:prompt')!.inputs.value);

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function setup(workflow: ComfyWorkflow = original()) {
  const root = await mkdtemp(join(tmpdir(), 'coreslopper-pika-lipsync-'));
  temporary.push(root);
  const dir = join(root, 'workflows');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'pika-h3-ref2va-lipsync.json'), JSON.stringify(workflow));
  const face = join(root, 'face.png');
  await writeFile(face, 'face');
  const vocal = join(root, 'vocal.wav');
  await writeFile(vocal, silentWav(1));
  return { dir, root, face, vocal };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function fakeServer() {
  let prompt: ComfyWorkflow | undefined;
  const uploads: string[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    if (url.endsWith('/upload/image')) {
      const form = init?.body as FormData;
      const file = form.get('image') as File;
      uploads.push(file.name);
      return json({ name: file.name, subfolder: String(form.get('subfolder')), type: 'input' });
    }
    if (url.endsWith('/prompt')) {
      prompt = (JSON.parse(String(init?.body)) as { prompt: ComfyWorkflow }).prompt;
      return json({ prompt_id: 'lipsync0000001', number: 1, node_errors: {} });
    }
    if (url.includes('/history/')) {
      return json({
        lipsync0000001: {
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

function input(face: string, vocal: string, extra: Record<string, unknown> = {}) {
  return {
    model: 'pika-h3-ref2va-lipsync',
    prompt: examplePrompt,
    references: [face],
    audio: vocal,
    seed: 7,
    width: 1920,
    height: 1080,
    durationSeconds: 5.457,
    params: { fps: 24, frame_step: 8, size_multiple: 64, megapixels: 0.8 },
    outputDir: '/tmp/unused',
    idempotencyKey: '0123456789abcdefffff',
    ...extra,
  };
}

describe('Pika H3 Flex lip-sync workflow', () => {
  it('is a lip-sync graph: references plus an anchored vocal', () => {
    const inspection = inspectWorkflow(original());
    expect(inspection.operations).toEqual(['lipSync']);
    expect(inspection.referenceSlots).toBe(1);
    expect(inspection.warnings).toEqual([]);
    expect(() => checkFlexPrompt(examplePrompt, 1)).not.toThrow();
  });

  it('wires the face as cs:ref_0, the vocal, its start, and the shot length; ignores LTX sizes', async () => {
    const { dir, face, vocal } = await setup();
    const comfy = new ComfyUIProvider({ workflowsDir: dir, fetchImpl: fakeServer().fetchImpl });
    const workflow = await comfy.buildPrompt(input(face, vocal, { audioStartSeconds: 46.613 }), 'lipSync', {
      indexedReferences: ['coreslopper/face.png'],
      audio: 'coreslopper/vocal.wav',
    });
    const byTitle = (title: string) => workflow[nodesWithTitle(workflow, title)[0]!]!.inputs;
    expect(byTitle('cs:ref_0').image).toBe('coreslopper/face.png');
    expect(byTitle('cs:audio').audio).toBe('coreslopper/vocal.wav');
    expect(byTitle('cs:audio_start').start_index).toBe(46.613);
    // The trim length is linked to the duration primitive, so the vocal and the clip share one length.
    expect(byTitle('cs:audio_start').duration).toEqual([nodesWithTitle(workflow, 'cs:duration')[0], 0]);
    expect(byTitle('cs:duration').value).toBe(5.457);
    expect(byTitle('cs:aspect')).toMatchObject({ aspect_ratio: '16:9 (Widescreen)', megapixels: 0.98, multiple: 32 });
    expect(byTitle('cs:seed').noise_seed).toBe(7);
    expect(byTitle('cs:output').filename_prefix).toBe('coreslopper/pika-h3-ref2va-lipsync/0123456789abcdef');
  });

  it('starts a cut segment at 0', async () => {
    const { dir, face, vocal } = await setup();
    const comfy = new ComfyUIProvider({ workflowsDir: dir, fetchImpl: fakeServer().fetchImpl });
    const workflow = await comfy.buildPrompt(input(face, vocal), 'lipSync', { indexedReferences: ['f.png'], audio: 'v.wav' });
    expect(workflow[nodesWithTitle(workflow, 'cs:audio_start')[0]!]!.inputs.start_index).toBe(0);
  });

  it('rejects a graph whose vocal is not anchored at frame 0 into the guider', async () => {
    const shifted = original();
    const guide = Object.values(shifted).find((node) => node.class_type === 'MiniMaxH3AddGuide')!;
    guide.inputs.frame_idx = 12;
    const bypassed = original();
    bypassed['126']!.inputs.conditioning = ['136', 0];
    const asReference = original();
    asReference['136']!.inputs['ref_audios.ref_audio_0'] = ['201', 0];
    const untitled = original();
    untitled['201']!._meta = { title: 'Trim' };
    for (const [workflow, message] of [
      [shifted, /frame_idx 0/],
      [bypassed, /feed the guider/],
      [asReference, /no reference audio/],
      [untitled, /cs:audio_start/],
    ] as const) {
      const { dir, face, vocal } = await setup(workflow);
      const comfy = new ComfyUIProvider({ workflowsDir: dir, fetchImpl: fakeServer().fetchImpl });
      await expect(
        comfy.buildPrompt(input(face, vocal), 'lipSync', { indexedReferences: ['f.png'], audio: 'v.wav' }),
      ).rejects.toThrow(message);
    }
  });

  it('uploads the face and the vocal and queues the wired graph', async () => {
    const { dir, root, face, vocal } = await setup();
    const server = fakeServer();
    const comfy = new ComfyUIProvider({ workflowsDir: dir, fetchImpl: server.fetchImpl, pollIntervalMs: 1 });
    const output = await comfy.lipSync({ ...input(face, vocal), outputDir: root });
    expect(server.uploads).toHaveLength(2);
    const submitted = server.submitted();
    const [faceUpload, vocalUpload] = server.uploads.map((name) => `coreslopper/${name}`);
    expect(submitted[nodesWithTitle(submitted, 'cs:ref_0')[0]!]!.inputs.image).toBe(faceUpload);
    expect(submitted[nodesWithTitle(submitted, 'cs:audio')[0]!]!.inputs.audio).toBe(vocalUpload);
    expect(output.files).toHaveLength(1);
  });
});

function hasFfprobe(): boolean {
  try {
    resolveBinary('ffprobe');
    return true;
  } catch {
    return false;
  }
}

function target(): BatchTarget {
  const root = mkdtempSync(join(tmpdir(), 'cs-pika-lipsync-'));
  writeFileSync(join(root, 'face.png'), '');
  writeFileSync(join(root, 'ref1.png'), '');
  writeFileSync(join(root, 'ref2.png'), '');
  mkdirSync(join(root, 'assets', 'audio-segments'), { recursive: true });
  writeFileSync(join(root, 'assets', 'audio-segments', 'shot-022-lead.wav'), silentWav(5.457));
  return {
    label: 'project',
    config: {
      kind: 'music-video',
      providers: { image: 'mock', video: 'mock', lipsync: 'comfyui' },
      models: {},
      formats: { master: { id: '16x9', width: 1920, height: 1080 } },
      batch_cap_usd: undefined,
    } as unknown as BatchTarget['config'],
    state: { budget: { totalUsd: 10, spentUsd: 0, reservedUsd: 0 }, updatedAt: '' },
    paths: { root, assets: join(root, 'assets'), manifest: join(root, 'assets', 'manifest.jsonl') },
    saveState: async () => undefined,
  };
}

const flex: FlexPromptInput = {
  subjects: [{ is: 'the singer', picture: 1, role: 'identity and framing anchor', features: 'green ponytail, freckles' }],
  summary: 'A static close-up: the singer sings the anchored vocal into the lens.',
  retention: [{ subject: 1, appears: '[Shot 1]', label: 'fully_preserved', note: 'face, hair, jacket' }],
  style: 'Bright high-key pop studio light, static camera.',
  shots: [['She sings "Lächeln, liken, weiter so" in German, lips in time with the vocal.', 'At about five seconds she holds a closed smile.']],
  soundscape: 'Only her lead vocal, as anchored.',
};

const item = {
  operation: 'lipSync',
  role: 'video.lipsync',
  references: ['face.png'],
  audio: 'assets/audio-segments/shot-022-lead.wav',
  flex,
};

describe.skipIf(!hasFfprobe())('Pika lip-sync batch items', () => {
  it('runs on Pika by default, with the length taken from the vocal', async () => {
    const [entry] = await runBatch(target(), BatchSchema.parse([item]), { dryRun: true, log: false });
    expect(entry?.resolved.provider).toBe('comfyui');
    expect(entry?.resolved.model).toBe('pika-h3-ref2va-lipsync');
    expect(entry?.resolved.durationSeconds).toBeCloseTo(5.457, 2);
    expect(entry?.resolved.cost).toBe(0);
    expect(entry?.resolved.notes?.join(' ')).toMatch(/pika-h3 ref2va lip-sync .* 141 frames/);
  });

  it('takes up to 4 references by default, named in the Flex prompt', async () => {
    const three = BatchSchema.parse([{ ...item, references: ['face.png', 'ref1.png', 'ref2.png'] }]);
    await expect(runBatch(target(), three, { dryRun: true, log: false })).rejects.toThrow(/reference 2 is never named/);
  });

  it('keeps LTX reachable with params.workflow, with a plain prompt and at most two frames', async () => {
    const { flex: _flex, ...rest } = item;
    const ltx = BatchSchema.parse([{ ...rest, prompt: 'She sings with accurate lip sync.', params: { workflow: 'ltx25-lipsync-flf2v' } }]);
    const [entry] = await runBatch(target(), ltx, { dryRun: true, log: false });
    expect(entry?.resolved.model).toBe('ltx25-lipsync-flf2v');
    expect(entry?.resolved.params).toMatchObject({ frame_step: 8, megapixels: 0.8 });
    const flexOnLtx = BatchSchema.parse([{ ...item, params: { workflow: 'ltx25-lipsync-flf2v' } }]);
    await expect(runBatch(target(), flexOnLtx, { dryRun: true, log: false })).rejects.toThrow(/need the Pika lip-sync workflow/);
    const threeOnLtx = BatchSchema.parse([
      { ...rest, prompt: 'x', references: ['face.png', 'ref1.png', 'ref2.png'], params: { workflow: 'ltx25-lipsync-flf2v' } },
    ]);
    await expect(runBatch(target(), threeOnLtx, { dryRun: true, log: false })).rejects.toThrow(/only Pika lip-sync takes more/);
  });
});
