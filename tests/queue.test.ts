import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BudgetError, loadProject, type LoadedProject } from '../packages/core/src/index.ts';
import {
  acceptItem,
  addToQueue,
  attemptPath,
  buildShotItems,
  expandShotIds,
  fl2vaFromPlain,
  formatQueue,
  loadQueue,
  retryItem,
  runQueue,
  runningPid,
  shotReferences,
  waitForQueue,
  type Generated,
  type QueueDeps,
  type QueueEntry,
  type QueueItemInput,
} from '../packages/cli/src/queue.ts';
import { BatchSchema, projectTarget, runBatch } from '../packages/cli/src/generate.ts';

const temporary: string[] = [];
afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});

/** A copy of the demo project (mock provider) without media. */
async function demo(): Promise<LoadedProject> {
  const dir = mkdtempSync(join(tmpdir(), 'coreslopper-queue-'));
  temporary.push(dir);
  const project = join(dir, 'demo');
  cpSync(join(process.cwd(), 'projects/demo'), project, {
    recursive: true,
    filter: (source) => !/\/(assets|renders|\.cache)(\/|$)/.test(source),
  });
  mkdirSync(join(project, 'assets'), { recursive: true });
  return loadProject(project);
}

const image = (id: string, extra: Partial<QueueItemInput> = {}): QueueItemInput => ({
  id: `keyframe:${id}`,
  out: `assets/keyframes/${id}.png`,
  review: { shot: id },
  operation: 'generateImage',
  role: 'image.keyframe',
  prompt: `first prompt of ${id}`,
  seed: 10,
  ...extra,
});

const clip = (id: string, extra: Partial<QueueItemInput> = {}): QueueItemInput => ({
  id: `clip:${id}`,
  out: `assets/clips/${id}.mp4`,
  review: { shot: id },
  after: [`keyframe:${id}`],
  operation: 'imageToVideo',
  role: 'video.image_to_video.quality',
  prompt: `motion of ${id}`,
  references: [`assets/keyframes/${id}.png`],
  durationSeconds: 4,
  ...extra,
});

type Verdict = Awaited<ReturnType<QueueDeps['review']>>;
const pass: Verdict = { verdict: 'pass', score: 8, issues: ['note: soft grain'], fix_prompt: 'none' };
const fail = (fix = 'fixed prompt'): Verdict => ({ verdict: 'fail', score: 3, issues: ['third arm -> two arms', 'note: dark'], fix_prompt: fix });

/** Deps that write a small file per generation and answer reviews from a script. */
function fakeDeps(project: LoadedProject, verdicts: (entry: QueueEntry, attempt: number) => Verdict) {
  const order: string[] = [];
  const prompts: string[] = [];
  const reviews: { id: string; attempt: number; focus?: string }[] = [];
  let counter = 0;
  const deps: Partial<QueueDeps> = {
    async generate(_project, entry): Promise<Generated> {
      order.push(`${entry.id} a${entry.attempt}`);
      prompts.push(String(entry.item.prompt));
      const file = join(project.paths.assets, 'raw', `gen-${(counter += 1)}${entry.kind === 'clip' ? '.mp4' : '.png'}`);
      mkdirSync(join(project.paths.assets, 'raw'), { recursive: true });
      writeFileSync(file, `${entry.id} a${entry.attempt}`);
      return { file, seed: Number(entry.item.seed ?? 1), provider: entry.provider ?? 'mock' };
    },
    async review(_project, entry, _file, attempt) {
      reviews.push({ id: entry.id, attempt, focus: entry.focus });
      return verdicts(entry, attempt);
    },
    async lastFrame(_clip, output) {
      mkdirSync(join(output, '..'), { recursive: true });
      writeFileSync(output, 'last frame');
    },
    log: () => undefined,
  };
  return { deps, order, prompts, reviews };
}

describe('queue items', () => {
  it('expands shot ids and ranges', () => {
    expect(expandShotIds(['001', 'shot-004', '007-009', '001'])).toEqual(['shot-001', 'shot-004', 'shot-007', 'shot-008', 'shot-009']);
    expect(() => expandShotIds(['intro'])).toThrow(/not a shot id/);
  });

  it('names attempt files next to the out path', () => {
    expect(attemptPath('assets/keyframes/shot-008.png', 2)).toBe('assets/keyframes/attempts/shot-008-a2.png');
    expect(attemptPath('assets/clips/shot-008.mp4', 1, '.webm')).toBe('assets/clips/attempts/shot-008-a1.webm');
  });

  it('adds items once and rejects a malformed one', async () => {
    const project = await demo();
    expect(addToQueue(project, [image('shot-001'), clip('shot-001')])).toMatchObject({ added: ['keyframe:shot-001', 'clip:shot-001'] });
    expect(addToQueue(project, [image('shot-001')])).toMatchObject({ added: [], skipped: ['keyframe:shot-001'] });
    expect(loadQueue(project.paths.assets).items.map((entry) => [entry.id, entry.kind, entry.status])).toEqual([
      ['keyframe:shot-001', 'image', 'pending'],
      ['clip:shot-001', 'clip', 'pending'],
    ]);
    expect(() => addToQueue(project, [image('shot-002', { prompt: undefined })])).toThrow();
    expect(() => addToQueue(project, [image('shot-002', { out: '../outside.png' })])).toThrow(/inside/);
  });
});

describe('buildShotItems', () => {
  /** An episode-like project: canon folder with a plate, a state, and a prop. */
  async function withCanon() {
    const project = await demo();
    const canon = join(project.paths.root, 'canon');
    for (const file of ['sets/yard/plates/wide.png', 'characters/robot/states/closed.png', 'characters/robot/sheet.png', 'props/scarf/scarf.png']) {
      mkdirSync(join(canon, file, '..'), { recursive: true });
      writeFileSync(join(canon, file), 'png');
    }
    const base = project.storyboard!.shots[0]!;
    const shot = (id: string, extra: Record<string, unknown>) => ({ ...base, id, lipSync: undefined, chaining: undefined, ...extra });
    const refs = { ...base.refs, characters: ['robot'], plate: 'yard/wide', props: ['scarf'], states: { robot: 'closed' } };
    return {
      ...project,
      paths: { ...project.paths, series: canon },
      sets: {
        version: 1 as const,
        sets: [{ id: 'yard', name: 'Yard', description: 'd', prompt: 'p', refs: [], plates: [{ id: 'wide', angle: 'wide', ref: 'sets/yard/plates/wide.png' }] }],
        props: [{ id: 'scarf', name: 'Scarf', description: 'd', refs: ['props/scarf/scarf.png'] }],
      },
      characters: {
        version: 1 as const,
        characters: [
          { id: 'robot', name: 'Robot', description: 'd', sheet: 'characters/robot/sheet.png', refs: [], face: 'full' as const, states: [{ id: 'closed', description: 'd', ref: 'characters/robot/states/closed.png' }] },
        ],
      },
      storyboard: {
        ...project.storyboard!,
        shots: [
          shot('shot-001', { refs, prompts: { keyframe: 'Insert the robot from image 2 into image 1.', video: 'The robot waves.' }, motion: { props: { clipSeconds: 4, keyframeWorkflow: 'qwen-edit-quality' } } }),
          shot('shot-002', { refs: { ...refs, states: {} }, prompts: { keyframe: 'Chained.', video: 'The robot rolls away.' }, chaining: { enabled: true, from: 'shot-001' }, motion: { props: { clipSeconds: 5 } } }),
          shot('shot-003', { refs: base.refs, prompts: { keyframe: 'An empty street.' } }),
        ],
      },
    } as unknown as LoadedProject;
  }

  it('orders the references plate, state, prop and builds an edit keyframe', async () => {
    const project = await withCanon();
    expect(shotReferences(project, project.storyboard!.shots[0]!)).toEqual([
      'canon/sets/yard/plates/wide.png',
      'canon/characters/robot/states/closed.png',
      'canon/props/scarf/scarf.png',
    ]);
    const { items, skipped } = buildShotItems(project, { kind: 'keyframe', shots: ['001-003'] });
    expect(items.map((item) => [item.id, item.operation, item.role, item.out])).toEqual([
      ['keyframe:shot-001', 'editImage', 'image.edit', 'assets/keyframes/shot-001.png'],
      ['keyframe:shot-003', 'generateImage', 'image.keyframe', 'assets/keyframes/shot-003.png'],
    ]);
    expect(items[0]).toMatchObject({ params: { workflow: 'qwen-edit-quality' }, review: { shot: 'shot-001' }, seed: 1001 });
    expect(skipped).toEqual([{ shot: 'shot-002', reason: expect.stringContaining('chained') }]);
  });

  it('builds clips from the keyframe, chains from the previous clip, and applies overrides', async () => {
    const project = await withCanon();
    const fl2va = { shots: ['The shot begins exactly on Picture 1. At about 2 seconds the robot waves.'], soundscape: 'A servo whirs.' };
    const { items, skipped } = buildShotItems(project, {
      kind: 'clip',
      shots: ['001', '002', '003'],
      workflow: 'pika-h3-flf2va',
      overrides: { 'shot-001': { fl2va, params: { quality: 'final' } } },
    });
    expect(items[0]).toMatchObject({
      id: 'clip:shot-001',
      operation: 'imageToVideo',
      references: ['assets/keyframes/shot-001.png'],
      after: ['keyframe:shot-001'],
      durationSeconds: 4,
      fl2va,
      params: { workflow: 'pika-h3-flf2va', quality: 'final' },
    });
    expect(items[0]).not.toHaveProperty('prompt');
    expect(items[1]).toMatchObject({
      id: 'clip:shot-002',
      chainFrom: 'clip:shot-001',
      references: ['assets/keyframes/chain/shot-002-start.png'],
      fl2va: { shots: ['The shot begins exactly on Picture 1. The robot rolls away.'] },
      durationSeconds: 5,
    });
    expect(skipped).toEqual([{ shot: 'shot-003', reason: 'no prompts.video' }]);
    // Without an override, a plain prompt becomes a one-shot FL2VA prompt on this workflow.
    const plain = buildShotItems(project, { kind: 'clip', shots: ['001'], workflow: 'pika-h3-flf2va' }).items[0]!;
    expect(plain).toMatchObject({ fl2va: { shots: ['The shot begins exactly on Picture 1. The robot waves.'], soundscape: expect.stringContaining('ambient') } });
    expect(plain).not.toHaveProperty('prompt');
    expect(buildShotItems(project, { kind: 'clip', shots: ['001'] }).items[0]).toMatchObject({ prompt: 'The robot waves.' });
  });

  it('splits the sound out of a plain clip prompt and leaves out stills and reused clips', async () => {
    expect(fl2vaFromPlain('Static camera. The pincer brushes the sign. Sound: metal scraping. No music, nobody speaks.')).toEqual({
      shots: ['The shot begins exactly on Picture 1. Static camera. The pincer brushes the sign.'],
      soundscape: 'metal scraping. No music, nobody speaks.',
    });
    expect(() => fl2vaFromPlain('integrated_multimodal_description: [Shot 1] x')).toThrow(/already carries/);
    const project = await withCanon();
    project.storyboard!.shots[0]!.asset = 'assets/keyframes/shot-001.png';
    project.storyboard!.shots[1]!.asset = 'assets/clips/shot-002.mp4';
    const { items, skipped } = buildShotItems(project, { kind: 'clip', shots: ['001', '002'] });
    expect(items.map((item) => item.id)).toEqual(['clip:shot-002']);
    expect(skipped[0]).toMatchObject({ shot: 'shot-001', reason: expect.stringContaining('a still') });
  });

  it('names every missing reference', async () => {
    const project = await withCanon();
    rmSync(join(project.paths.series!, 'props/scarf/scarf.png'));
    project.characters!.characters[0]!.states[0]!.ref = undefined;
    expect(() => shotReferences(project, project.storyboard!.shots[0]!)).toThrow(/create these references first/);
  });
});

describe('runQueue', () => {
  it('files a passed image, requeues a failed one with the fix prompt, and lets the clip wait for its keyframe', async () => {
    const project = await demo();
    addToQueue(project, [clip('shot-001'), image('shot-001'), image('shot-002')]);
    const { deps, order, prompts, reviews } = fakeDeps(project, (entry, attempt) => (entry.id === 'keyframe:shot-001' && attempt === 1 ? fail() : pass));
    const result = await runQueue(project.paths.root, { deps });

    expect(result).toEqual({ passed: ['clip:shot-001', 'keyframe:shot-001', 'keyframe:shot-002'], needsFix: [], errors: [], blocked: [] });
    // The clip is first in the queue but waits; the failed keyframe goes to the end with attempt 2.
    expect(order).toEqual(['keyframe:shot-001 a1', 'keyframe:shot-002 a1', 'keyframe:shot-001 a2', 'clip:shot-001 a1']);
    expect(prompts[2]).toBe('fixed prompt');
    expect(reviews.find((review) => review.id === 'keyframe:shot-001' && review.attempt === 2)?.focus).toBe('third arm -> two arms');
    const entry = loadQueue(project.paths.assets).items.find((item) => item.id === 'keyframe:shot-001')!;
    expect(entry.attempts.map((attempt) => [attempt.n, attempt.verdict, attempt.file])).toEqual([
      [1, 'fail', 'assets/keyframes/attempts/shot-001-a1.png'],
      [2, 'pass', 'assets/keyframes/attempts/shot-001-a2.png'],
    ]);
    expect(entry.item.seed).toBe(11);
    expect(readFileSync(join(project.paths.root, 'assets/keyframes/shot-001.png'), 'utf8')).toBe('keyframe:shot-001 a2');
    expect(existsSync(join(project.paths.root, 'assets/clips/shot-001.mp4'))).toBe(true);
    expect(runningPid(project.paths.assets)).toBeUndefined();
  });

  it('stops an image after the attempt limit and never requeues a clip by itself', async () => {
    const project = await demo();
    addToQueue(project, [image('shot-001'), image('shot-002'), clip('shot-002'), clip('shot-001')]);
    const { deps, order } = fakeDeps(project, (entry) => (entry.id === 'keyframe:shot-001' || entry.kind === 'clip' ? fail() : pass));
    const result = await runQueue(project.paths.root, { deps, maxAttempts: 3 });

    expect(order.filter((line) => line.startsWith('keyframe:shot-001'))).toHaveLength(3);
    expect(order.filter((line) => line.startsWith('clip:shot-002'))).toEqual(['clip:shot-002 a1']);
    expect(result.needsFix.sort()).toEqual(['clip:shot-002', 'keyframe:shot-001']);
    expect(result.blocked).toEqual(['clip:shot-001']);
    // Nothing unapproved is filed.
    expect(existsSync(join(project.paths.root, 'assets/keyframes/shot-001.png'))).toBe(false);
    const text = formatQueue(loadQueue(project.paths.assets));
    expect(text).toContain('waits for keyframe:shot-001');
    expect(text).toMatch(/keyframe:shot-001\s+needs-fix\s+a3\s+3\s+3 attempt\(s\) failed/);
    expect(text).toContain('third arm -> two arms');
  });

  it('retries a clip with a rewritten prompt, and accept files the best attempt', async () => {
    const project = await demo();
    addToQueue(project, [image('shot-001'), clip('shot-001')]);
    let clipVerdict = fail('none');
    const { deps, prompts } = fakeDeps(project, (entry) => (entry.kind === 'clip' ? clipVerdict : pass));
    expect((await runQueue(project.paths.root, { deps })).needsFix).toEqual(['clip:shot-001']);

    const retried = retryItem(project.paths.assets, 'clip:shot-001', { prompt: 'slower motion', provider: 'topview' });
    expect(retried).toMatchObject({ status: 'pending', attempt: 2, provider: 'topview', focus: 'third arm -> two arms' });
    clipVerdict = { ...fail('none'), score: 5 };
    await runQueue(project.paths.root, { deps });
    expect(prompts.at(-1)).toBe('slower motion');
    const entry = loadQueue(project.paths.assets).items.find((item) => item.id === 'clip:shot-001')!;
    expect(entry.attempts.map((attempt) => attempt.provider)).toEqual(['mock', 'topview']);
    expect(entry.provider).toBeUndefined();

    const accepted = await acceptItem(project, 'shot-001'.replace('shot-001', 'clip:shot-001'), undefined, 'user approved by eye');
    expect(accepted).toMatchObject({ status: 'passed', note: 'accepted attempt 2: user approved by eye' });
    expect(readFileSync(join(project.paths.root, 'assets/clips/shot-001.mp4'), 'utf8')).toBe('clip:shot-001 a2');
  });

  it('chains a clip from the last frame of the clip before it', async () => {
    const project = await demo();
    addToQueue(project, [
      clip('shot-002', { chainFrom: 'clip:shot-001', after: [], references: ['assets/keyframes/chain/shot-002-start.png'] }),
      clip('shot-001', { after: [] }),
    ]);
    const { deps, order } = fakeDeps(project, () => pass);
    await runQueue(project.paths.root, { deps });
    expect(order).toEqual(['clip:shot-001 a1', 'clip:shot-002 a1']);
    expect(readFileSync(join(project.paths.root, 'assets/keyframes/chain/shot-002-start.png'), 'utf8')).toBe('last frame');
  });

  it('restarts the backend after a failed generation and marks an item that keeps failing', async () => {
    const project = await demo();
    addToQueue(project, [image('shot-001'), image('shot-002')]);
    const base = fakeDeps(project, () => pass);
    let restarts = 0;
    let calls = 0;
    const result = await runQueue(project.paths.root, {
      tries: 2,
      deps: {
        ...base.deps,
        restart: async () => void (restarts += 1),
        generate: async (loaded, entry) => {
          calls += 1;
          if (entry.id === 'keyframe:shot-002' || calls === 1) throw new Error('Fault failed: 2');
          return base.deps.generate!(loaded, entry);
        },
      },
    });
    expect(restarts).toBe(2);
    expect(result).toMatchObject({ passed: ['keyframe:shot-001'], errors: ['keyframe:shot-002'] });
    expect(loadQueue(project.paths.assets).items[1]).toMatchObject({ status: 'error', error: 'Fault failed: 2' });
  });

  it('stops the run on a budget error and keeps the item pending', async () => {
    const project = await demo();
    addToQueue(project, [image('shot-001')]);
    const { deps } = fakeDeps(project, () => pass);
    await expect(
      runQueue(project.paths.root, { deps: { ...deps, generate: async () => Promise.reject(new BudgetError('over the batch cap')) } }),
    ).rejects.toThrow(/batch cap/);
    expect(loadQueue(project.paths.assets).items[0]!.status).toBe('pending');
    expect(runningPid(project.paths.assets)).toBeUndefined();
  });

  it('reviews an unreviewed attempt again instead of generating a new one', async () => {
    const project = await demo();
    addToQueue(project, [image('shot-001')]);
    const first = fakeDeps(project, () => pass);
    await runQueue(project.paths.root, { deps: { ...first.deps, review: async () => Promise.reject(new Error('reviewer timed out')) } });
    expect(loadQueue(project.paths.assets).items[0]).toMatchObject({ status: 'error', error: 'review: reviewer timed out' });
    expect(retryItem(project.paths.assets, 'keyframe:shot-001')).toMatchObject({ status: 'reviewing', attempt: 1 });
    const second = fakeDeps(project, () => pass);
    const result = await runQueue(project.paths.root, { deps: second.deps });
    expect(second.order).toEqual([]);
    expect(result.passed).toEqual(['keyframe:shot-001']);
  });

  it('wait returns when no run is active', async () => {
    const project = await demo();
    addToQueue(project, [image('shot-001')]);
    expect(await waitForQueue(project.paths.assets, { timeoutSeconds: 1, pollMs: 10 })).toEqual({ reason: 'finished', changes: [] });
  });

  it('runs through the real generate path on the mock provider', async () => {
    const project = await demo();
    addToQueue(project, [image('shot-001', { review: undefined })]);
    const result = await runQueue(project.paths.root, { deps: { log: () => undefined } });
    expect(result.passed).toEqual(['keyframe:shot-001']);
    expect(existsSync(join(project.paths.root, 'assets/keyframes/shot-001.png'))).toBe(true);
    expect(readFileSync(project.paths.manifest, 'utf8')).toContain('image.keyframe');
  });
});

describe('generate out', () => {
  it('files the result at the item out path and rejects a path outside the project', async () => {
    const project = await demo();
    const batch = BatchSchema.parse([
      { operation: 'generateImage', role: 'image.keyframe', id: 'keyframe:shot-001', out: 'assets/keyframes/shot-001.png', prompt: 'a street', seed: 5 },
    ]);
    const [done] = await runBatch(projectTarget(project), batch, { log: false });
    expect(done?.out).toBe(join(project.paths.root, 'assets/keyframes/shot-001.png'));
    expect(existsSync(done!.out!)).toBe(true);
    const outside = BatchSchema.parse([{ operation: 'generateImage', role: 'image.keyframe', out: '../x.png', prompt: 'a street' }]);
    await expect(runBatch(projectTarget(project), outside, { log: false })).rejects.toThrow(/inside/);
  });
});
