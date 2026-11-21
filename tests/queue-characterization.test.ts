/**
 * Characterization tests for the generation queue (adoption of the verdict slice, 2026-11-21).
 * They pin what the queue does today where no other test does; they do not assert the decided
 * rules that are still ahead of the code (gap register G-32 to G-48).
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadProject, type LoadedProject } from '../packages/core/src/index.ts';
import {
  acceptItem,
  addToQueue,
  dropItem,
  loadQueue,
  runQueue,
  updateQueue,
  type Generated,
  type QueueDeps,
  type QueueEntry,
  type QueueItemInput,
} from '../packages/cli/src/queue.ts';

const temporary: string[] = [];
afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});

async function demo(): Promise<LoadedProject> {
  const dir = mkdtempSync(join(tmpdir(), 'coreslopper-queue-char-'));
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

type Verdict = Awaited<ReturnType<QueueDeps['review']>>;
const pass: Verdict = { verdict: 'pass', score: 8, issues: [], fix_prompt: 'none' };

function deps(project: LoadedProject, verdict: (entry: QueueEntry, attempt: number) => Verdict): Partial<QueueDeps> {
  let counter = 0;
  return {
    async generate(_project, entry): Promise<Generated> {
      mkdirSync(join(project.paths.assets, 'raw'), { recursive: true });
      const file = join(project.paths.assets, 'raw', `gen-${(counter += 1)}.png`);
      writeFileSync(file, `${entry.id} a${entry.attempt}`);
      return { file, seed: Number(entry.item.seed ?? 1), provider: 'mock' };
    },
    async review(_project, entry, _file, attempt) {
      return verdict(entry, attempt);
    },
    async lastFrame(_clip, output) {
      writeFileSync(output, 'last frame');
    },
    log: () => undefined,
  };
}

describe('generation queue – characterization', () => {
  it('a failed image whose fix prompt is "none" waits as needs-fix after its first attempt', async () => {
    const project = await demo();
    addToQueue(project, [image('shot-001')]);
    const result = await runQueue(project.paths.root, {
      deps: deps(project, () => ({ verdict: 'fail', score: 2, issues: ['third arm -> two arms'], fix_prompt: 'none' })),
    });

    expect(result.needsFix).toEqual(['keyframe:shot-001']);
    const entry = loadQueue(project.paths.assets).items[0]!;
    expect(entry).toMatchObject({ status: 'needs-fix', focus: 'third arm -> two arms' });
    expect(entry.attempts).toHaveLength(1);
    expect(existsSync(join(project.paths.root, 'assets/keyframes/shot-001.png'))).toBe(false);
  });

  it('a replaced item keeps its attempts and continues their numbering', async () => {
    const project = await demo();
    addToQueue(project, [image('shot-001')]);
    await runQueue(project.paths.root, { deps: deps(project, () => pass) });

    const result = addToQueue(project, [image('shot-001', { prompt: 'a new prompt' })], { replace: true });
    expect(result.replaced).toEqual(['keyframe:shot-001']);
    const entry = loadQueue(project.paths.assets).items[0]!;
    expect(entry).toMatchObject({ status: 'pending', attempt: 2 });
    expect(entry.attempts.map((attempt) => attempt.n)).toEqual([1]);
  });

  it('a known id is skipped without replace', async () => {
    const project = await demo();
    addToQueue(project, [image('shot-001')]);
    const result = addToQueue(project, [image('shot-001', { prompt: 'other' })]);
    expect(result).toEqual({ added: [], replaced: [], skipped: ['keyframe:shot-001'] });
    expect(loadQueue(project.paths.assets).items[0]!.item.prompt).toBe('first prompt of shot-001');
  });

  it('drop removes the item but keeps its files, and refuses an item that is reviewing', async () => {
    const project = await demo();
    addToQueue(project, [image('shot-001'), image('shot-002')]);
    await runQueue(project.paths.root, { deps: deps(project, () => pass) });

    dropItem(project.paths.assets, 'keyframe:shot-001');
    expect(loadQueue(project.paths.assets).items.map((entry) => entry.id)).toEqual(['keyframe:shot-002']);
    expect(existsSync(join(project.paths.root, 'assets/keyframes/shot-001.png'))).toBe(true);
    expect(existsSync(join(project.paths.root, 'assets/keyframes/attempts/shot-001-a1.png'))).toBe(true);

    updateQueue(project.paths.assets, (queue) => {
      queue.items[0]!.status = 'reviewing';
    });
    expect(() => dropItem(project.paths.assets, 'keyframe:shot-002')).toThrow(/reviewing/);
  });

  it('accept with an attempt number files that attempt and records it in the note', async () => {
    const project = await demo();
    addToQueue(project, [image('shot-001')]);
    await runQueue(project.paths.root, {
      maxAttempts: 2,
      deps: deps(project, (_entry, attempt) => ({ verdict: 'fail', score: attempt === 1 ? 6 : 3, issues: ['wrong face'], fix_prompt: 'a better prompt' })),
    });
    expect(loadQueue(project.paths.assets).items[0]!.status).toBe('needs-fix');

    const accepted = await acceptItem(project, 'keyframe:shot-001', 1, 'user approved');
    expect(accepted).toMatchObject({ status: 'passed', note: 'accepted attempt 1: user approved' });
    expect(readFileSync(join(project.paths.root, 'assets/keyframes/shot-001.png'), 'utf8')).toBe('keyframe:shot-001 a1');
  });
});
