import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  FLEX_NO_MUSIC,
  checkFlexPrompt,
  flexSections,
  renderFlexPrompt,
  type FlexPromptInput,
} from '@coreslopper/core';
import {
  ComfyUIProvider,
  inspectWorkflow,
  nodesWithTitle,
  parseWorkflow,
  type ComfyWorkflow,
  type FetchLike,
} from '../packages/providers/src/index.ts';
import { BatchSchema, runBatch, type BatchTarget } from '../packages/cli/src/generate.js';

const WORKFLOW_FILE = join(__dirname, 'fixtures', 'pika-h3-ref2va.json');
const workflowText = readFileSync(WORKFLOW_FILE, 'utf8');
const original = (): ComfyWorkflow => parseWorkflow(workflowText, 'pika-h3-ref2va.json');
const examplePrompt = String(Object.values(original()).find((node) => node._meta?.title === 'cs:prompt')!.inputs.value);
/** The template's example prompt with the score replaced by the house rule. */
const fixedExample = examplePrompt.replace(/non_diegetic_music:\n[\s\S]*$/, `non_diegetic_music:\n${FLEX_NO_MUSIC}`);

const flex: FlexPromptInput = {
  subjects: [
    {
      is: 'the pilot',
      picture: 1,
      role: 'identity and gear anchor',
      features: 'a dark matte helmet with a glossy black visor and one orange ring',
      avoid: 'the light grey studio background of <Picture 1>',
    },
    { is: 'the hangar, invented to match <Subject 1>: ribbed white metal and orange strip lights' },
  ],
  summary: 'A five-second single shot: the camera glides down the hangar to the pilot.',
  retention: [
    { subject: 1, appears: '[Shot 1]', label: 'fully_preserved', note: 'helmet, visor, orange ring' },
    { subject: 2, appears: '[Shot 1]', label: 'attribute_transfer', note: 'the orange of the visor becomes the strip lights' },
  ],
  backgrounds: [{ picture: 1, label: 'weak_reference', note: 'its grey backdrop is discarded' }],
  style: 'Retro-futurist cinematography, one unbroken move, deep blacks.',
  shots: [
    [
      'The camera glides down <Subject 2> at chest height.',
      'At about three seconds it comes to rest on <Subject 1>, who turns their head toward the lens.',
    ],
  ],
  soundscape: 'Hangar hum, distant clanks, a suit hiss. A radio on the catwalk plays a faint old pop song.',
};

describe('Flex prompt schema', () => {
  it('accepts the template example once non_diegetic_music is "none"', () => {
    expect(() => checkFlexPrompt(fixedExample, 2)).not.toThrow();
  });

  it('rejects the template example as is: it asks for a synthwave score', () => {
    expect(() => checkFlexPrompt(examplePrompt, 2)).toThrow(/non_diegetic_music must be exactly/);
  });

  it('requires a reference image for every <Picture N> and names every reference', () => {
    expect(() => checkFlexPrompt(fixedExample, 1)).toThrow(/<Picture 2> has no reference image/);
    expect(() => checkFlexPrompt(fixedExample, 3)).toThrow(/reference 3 is never named/);
  });

  it('checks section order, retention labels, shots, and time marks', () => {
    const swapped = fixedExample.replace('summary:', 'tmp:').replace('retention_analysis:', 'summary:').replace('tmp:', 'retention_analysis:');
    expect(() => checkFlexPrompt(swapped, 2)).toThrow(/out of order/);
    expect(() => checkFlexPrompt(fixedExample.replace('fully_preserved', 'kept'), 2)).toThrow(/without a label/);
    expect(() => checkFlexPrompt(fixedExample.replace('[Shot 1]', '[Scene]').replaceAll('[Shot 1]', '[Scene]'), 2)).toThrow(
      /no \[Shot N\] block/,
    );
    expect(() => checkFlexPrompt(fixedExample.replaceAll(/at about/gi, 'around'), 2)).toThrow(/time marks/);
    const decimal = fixedExample.replaceAll(/at about [^.\n]*?seconds?/gi, 'at about 1.5 seconds');
    expect(decimal).toContain('at about 1.5 seconds');
    expect(() => checkFlexPrompt(decimal, 2)).not.toThrow();
  });

  it('renders a structured prompt in schema order with the fixed music line', () => {
    const text = renderFlexPrompt(flex);
    expect(flexSections(text).map((section) => section.name)).toEqual([
      'subject_definitions',
      'summary',
      'retention_analysis',
      'detailed_description',
      'overall_soundscape',
      'non_diegetic_music',
    ]);
    expect(text).toContain('<Subject 1> is the pilot in <Picture 1>. Reference role: identity and gear anchor.');
    expect(text).toContain('[reference generation] A five-second');
    expect(text).toContain('<Picture 1> background: weak_reference only - its grey backdrop is discarded.');
    expect(text).toContain('[Shot 1] The camera glides');
    // Music inside the scene stays in the soundscape; the score line is always "none".
    expect(text).toContain('A radio on the catwalk plays');
    expect(text.endsWith(`non_diegetic_music:\n${FLEX_NO_MUSIC}`)).toBe(true);
  });
});

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function setup(workflow: ComfyWorkflow = original()) {
  const root = await mkdtemp(join(tmpdir(), 'coreslopper-ref2va-'));
  temporary.push(root);
  const dir = join(root, 'workflows');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'pika-h3-ref2va.json'), JSON.stringify(workflow));
  const refs = await Promise.all(
    Array.from({ length: 9 }, async (_, index) => {
      const path = join(root, `ref${index}.png`);
      await writeFile(path, `ref-${index}`);
      return path;
    }),
  );
  return { dir, refs };
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
      return json({ prompt_id: 'ref2va000000001', number: 1, node_errors: {} });
    }
    if (url.includes('/history/')) {
      return json({
        ref2va000000001: {
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

function input(refs: string[], extra: Record<string, unknown> = {}) {
  return {
    model: 'pika-h3-ref2va',
    prompt: fixedExample,
    references: refs,
    seed: 42,
    width: 1920,
    height: 1080,
    durationSeconds: 3.2,
    params: { megapixels: 0.98 },
    outputDir: '/tmp/unused',
    idempotencyKey: 'abcdef0123456789ffff',
    ...extra,
  };
}

/** Reference inputs of the MiniMax node, in order, and the LoadImage they come from. */
function referenceWiring(workflow: ComfyWorkflow): [string, string, string][] {
  const consumer = Object.values(workflow).find((node) => node.class_type === 'MiniMaxH3ReferenceToVideo')!;
  return Object.entries(consumer.inputs)
    .filter(([name]) => name.startsWith('ref_images.'))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, link]) => {
      const source = workflow[(link as [string, number])[0]]!;
      return [name, source._meta!.title!, String(source.inputs.image)];
    });
}

describe('Pika H3 Flex workflow in the ComfyUI adapter', () => {
  it('is found by its cs: tags and fits referenceToVideo only', () => {
    const inspection = inspectWorkflow(original());
    expect(inspection.operations).toEqual(['referenceToVideo']);
    expect(inspection.referenceSlots).toBe(2);
    expect(Object.keys(inspection.titles).sort()).toEqual(['duration', 'output', 'prompt', 'resolution', 'seed']);
    expect(inspection.warnings).toEqual([]);
  });

  it('treats cs: and cs_ as the same tag', () => {
    const workflow = original();
    expect(nodesWithTitle(workflow, 'cs_prompt')).toEqual(nodesWithTitle(workflow, 'cs:prompt'));
    expect(nodesWithTitle(workflow, 'cs_resolution')).toEqual(nodesWithTitle(workflow, 'cs:aspect'));
  });

  it.each([
    [1, ['ref_images.ref_image_0']],
    [2, ['ref_images.ref_image_0', 'ref_images.ref_image_1']],
    [3, ['ref_images.ref_image_0', 'ref_images.ref_image_1', 'ref_images.ref_image_2']],
  ])('wires %i reference image(s) by title and link', async (count, slots) => {
    const { dir, refs } = await setup();
    const comfy = new ComfyUIProvider({ workflowsDir: dir, fetchImpl: fakeServer().fetchImpl });
    const images = refs.slice(0, count).map((_, index) => `coreslopper/r${index}.png`);
    const workflow = await comfy.buildPrompt(input(refs.slice(0, count)), 'referenceToVideo', { indexedReferences: images });
    const wiring = referenceWiring(workflow);
    expect(wiring.map(([name]) => name)).toEqual(slots);
    expect(wiring.map(([, title]) => title)).toEqual(images.map((_, index) => `cs:ref_${index}`));
    expect(wiring.map(([, , image]) => image)).toEqual(images);
    expect(Object.values(workflow).filter((node) => node.class_type === 'LoadImage')).toHaveLength(count);
  });

  it('sets aspect, seed, duration, and the output prefix; keeps the fixed part', async () => {
    const { dir, refs } = await setup();
    const comfy = new ComfyUIProvider({ workflowsDir: dir, fetchImpl: fakeServer().fetchImpl });
    const workflow = await comfy.buildPrompt(input(refs.slice(0, 2), { width: 1080, height: 1920 }), 'referenceToVideo', {
      indexedReferences: ['a.png', 'b.png'],
    });
    const byTitle = (title: string) => workflow[nodesWithTitle(workflow, title)[0]!]!.inputs;
    expect(byTitle('cs:aspect')).toMatchObject({ aspect_ratio: '9:16 (Portrait Widescreen)', megapixels: 0.98, multiple: 32 });
    expect(byTitle('cs:seed').noise_seed).toBe(42);
    expect(byTitle('cs:duration').value).toBe(3.2);
    expect(byTitle('cs:prompt').value).toBe(fixedExample);
    expect(byTitle('cs:output').filename_prefix).toBe('coreslopper/pika-h3-ref2va/abcdef0123456789');
    const fixed = Object.values(workflow);
    expect(fixed.find((node) => node.class_type === 'KSamplerSelect')!.inputs.sampler_name).toBe('lcm');
    expect(fixed.find((node) => node.class_type === 'LoraLoaderModelOnly')!.inputs.strength_model).toBe(1);
  });

  it('names added reference nodes ref_N, so a cs_ref_N key never addresses them by ID', async () => {
    const { dir, refs } = await setup();
    const comfy = new ComfyUIProvider({ workflowsDir: dir, fetchImpl: fakeServer().fetchImpl });
    const workflow = await comfy.buildPrompt(input(refs.slice(0, 3)), 'referenceToVideo', {
      indexedReferences: ['a.png', 'b.png', 'c.png'],
    });
    expect(workflow['ref_2']).toMatchObject({ _meta: { title: 'cs:ref_2' }, inputs: { image: 'c.png' } });
    expect(Object.keys(workflow).filter((id) => id.startsWith('cs_ref_'))).toEqual([]);
  });

  it.each([
    ['cs:aspect', '115'],
    ['cs:seed', '129'],
    ['cs:duration', '132'],
    ['cs:prompt', '138'],
    ['cs:output', '92'],
    ['cs:ref_0', '149'],
  ])('stops with a ConfigError when %s is missing', async (tag, id) => {
    const changed = original();
    changed[id]!._meta = { title: 'untitled' };
    const { dir, refs } = await setup(changed);
    const comfy = new ComfyUIProvider({ workflowsDir: dir, fetchImpl: fakeServer().fetchImpl });
    await expect(
      comfy.buildPrompt(input(refs.slice(0, 1)), 'referenceToVideo', { indexedReferences: ['a.png'] }),
    ).rejects.toThrow(new RegExp(`Ref2VA\\) has no node titled ${tag}\\b`));
  });

  it('takes 4 references by default and at most 9', async () => {
    const { dir, refs } = await setup();
    const comfy = new ComfyUIProvider({ workflowsDir: dir, fetchImpl: fakeServer().fetchImpl });
    const names = (n: number) => ({ indexedReferences: refs.slice(0, n).map((_, i) => `r${i}.png`) });
    await expect(comfy.buildPrompt(input(refs.slice(0, 5)), 'referenceToVideo', names(5))).rejects.toThrow(
      /takes 4 by default.*hard limit 9/,
    );
    const nine = await comfy.buildPrompt(
      input(refs, { params: { max_references: 9 } }),
      'referenceToVideo',
      names(9),
    );
    expect(referenceWiring(nine)).toHaveLength(9);
    await expect(
      comfy.buildPrompt(input(refs, { params: { max_references: 10 } }), 'referenceToVideo', names(9)),
    ).rejects.toThrow(/from 1 to 9/);
  });

  it('rejects audio references, node-ID patches, and a changed fixed setup', async () => {
    const { dir, refs } = await setup();
    const comfy = new ComfyUIProvider({ workflowsDir: dir, fetchImpl: fakeServer().fetchImpl });
    const uploads = { indexedReferences: ['a.png'] };
    await expect(comfy.buildPrompt(input(refs.slice(0, 1), { audio: '/x.wav' }), 'referenceToVideo', uploads)).rejects.toThrow(
      /no audio reference/,
    );
    await expect(
      comfy.buildPrompt(input(refs.slice(0, 1), { params: { node_inputs: { '123.sampler_name': 'euler' } } }), 'referenceToVideo', uploads),
    ).rejects.toThrow(/must address a cs: tag/);
    await expect(
      comfy.buildPrompt(input(refs.slice(0, 1), { params: { turbo: true } }), 'referenceToVideo', uploads),
    ).rejects.toThrow(/cs_turbo/);

    const stacked = original();
    stacked['900'] = {
      class_type: 'LoraLoaderModelOnly',
      inputs: { lora_name: 'lightning.safetensors', strength_model: 1, model: ['145', 0] },
      _meta: { title: 'Turbo' },
    };
    const other = await setup(stacked);
    const locked = new ComfyUIProvider({ workflowsDir: other.dir, fetchImpl: fakeServer().fetchImpl });
    await expect(locked.buildPrompt(input(refs.slice(0, 1)), 'referenceToVideo', uploads)).rejects.toThrow(
      /exactly one LoRA/,
    );
  });

  it('uploads every reference through /upload/image and queues the wired graph', async () => {
    const { dir, refs } = await setup();
    const server = fakeServer();
    const outputDir = await mkdtemp(join(tmpdir(), 'coreslopper-ref2va-out-'));
    temporary.push(outputDir);
    const comfy = new ComfyUIProvider({ workflowsDir: dir, fetchImpl: server.fetchImpl, pollIntervalMs: 1 });
    const output = await comfy.referenceToVideo({ ...input(refs.slice(0, 3)), outputDir });
    expect(server.uploads).toHaveLength(3);
    // Uploads are named by content hash; the wiring keeps references[k] on cs:ref_k.
    const hashed = [0, 1, 2].map((index) => `coreslopper/${createHash('sha256').update(`ref-${index}`).digest('hex').slice(0, 16)}.png`);
    expect(referenceWiring(server.submitted()).map(([, , image]) => image)).toEqual(hashed);
    expect(output.files).toHaveLength(1);
  });
});

function target(kind: 'music-video' | 'episode', master = { id: '16x9', width: 1920, height: 1080 }): BatchTarget {
  const root = mkdtempSync(join(tmpdir(), 'cs-ref2va-'));
  for (let index = 0; index < 3; index += 1) writeFileSync(join(root, `ref${index}.png`), '');
  return {
    label: 'project',
    config: {
      kind,
      providers: { image: 'topview', video: 'topview' },
      models: {},
      formats: { master },
      batch_cap_usd: undefined,
    } as unknown as BatchTarget['config'],
    state: { budget: { totalUsd: 10, spentUsd: 0, reservedUsd: 0 }, updatedAt: '' },
    paths: { root, assets: join(root, 'assets'), manifest: join(root, 'assets', 'manifest.jsonl') },
    saveState: async () => undefined,
  };
}

describe('referenceToVideo batch items', () => {
  const item = { operation: 'referenceToVideo', role: 'video.reference_to_video', references: ['ref0.png'], durationSeconds: 5, flex };

  it('renders "flex" into the prompt and always runs locally', async () => {
    const batch = BatchSchema.parse([item]);
    expect(batch[0]!.prompt).toContain(`non_diegetic_music:\n${FLEX_NO_MUSIC}`);
    const [entry] = await runBatch(target('music-video'), batch, { dryRun: true, log: false });
    expect(entry?.resolved.provider).toBe('comfyui');
    expect(entry?.resolved.model).toBe('pika-h3-ref2va');
    expect(entry?.resolved.params).toMatchObject({ megapixels: 0.98, max_references: 4 });
  });

  it('takes the aspect from the project kind', async () => {
    const batch = BatchSchema.parse([item]);
    await expect(runBatch(target('episode'), batch, { dryRun: true, log: false })).rejects.toThrow(/renders 9:16 for an episode/);
    const vertical = target('episode', { id: '9x16', width: 1080, height: 1920 });
    await expect(runBatch(vertical, batch, { dryRun: true, log: false })).resolves.toHaveLength(1);
  });

  it('rejects audio, too many images, both prompt kinds, and a prompt that misses a picture', async () => {
    expect(() => BatchSchema.parse([{ ...item, audio: 'a.wav' }])).toThrow(/no audio reference/);
    expect(() => BatchSchema.parse([{ ...item, references: Array(10).fill('ref0.png') }])).toThrow(/1 to 9/);
    expect(() => BatchSchema.parse([{ ...item, prompt: 'x' }])).toThrow(/exactly one of/);
    const untimed = BatchSchema.parse([{ ...item, durationSeconds: undefined }]);
    await expect(runBatch(target('music-video'), untimed, { dryRun: true, log: false })).rejects.toThrow(/needs durationSeconds/);
    const twoRefs = BatchSchema.parse([{ ...item, references: ['ref0.png', 'ref1.png'] }]);
    await expect(runBatch(target('music-video'), twoRefs, { dryRun: true, log: false })).rejects.toThrow(
      /reference 2 is never named/,
    );
  });
});
