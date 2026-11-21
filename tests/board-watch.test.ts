import { afterEach, describe, expect, it } from 'vitest';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProject, setStageDone, setStageFailed, setStageRunning, watchEvents, type ProjectPulse, type State, type WatchSnapshot } from '@coreslopper/core';
import { createProject } from '../packages/cli/src/new-project.ts';
import { loadEvents, loadSnapshot, reloadEnv, scanProduction } from '../packages/cli/src/production-watch.ts';
import { progressPath, startProgress } from '../packages/cli/src/render-progress.ts';
import { acquireHolderLock } from '../packages/cli/src/file-lock.ts';

const root = process.cwd();
const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function workspace(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'coreslopper-watch-'));
  temporary.push(dir);
  for (const folder of ['config', 'templates', 'brand']) await cp(join(root, folder), join(dir, folder), { recursive: true });
  return dir;
}

const pulse = (extra: Partial<ProjectPulse> = {}): ProjectPulse => ({
  phase: 'running', current: 'assets', currentStatus: 'running', failed: [], renders: {}, progress: [], needsFix: 0, spentShare: 0.1, stalled: false, ...extra,
});
const snap = (at: string, projects: Record<string, ProjectPulse>): WatchSnapshot => ({ version: 1, at, projects });

describe('watch events', () => {
  it('reports only what needs the user on the first round', () => {
    const events = watchEvents(undefined, snap('2026-11-21T10:00:00Z', {
      a: pulse({ renders: { 'preview-16x9.mp4': '2026-11-20T10:00:00Z' } }),
      b: pulse({ phase: 'failed', current: 'storyboard', currentStatus: 'failed', failed: ['storyboard'], needsFix: 2, spentShare: 0.85 }),
    }));
    expect(events.map((event) => `${event.project}:${event.kind}`)).toEqual(['b:stage-failed', 'b:needs-fix', 'b:budget']);
  });

  it('reports finished stages, new renders, and a stall once', () => {
    const before = snap('2026-11-21T10:00:00Z', { a: pulse({ current: 'storyboard' }) });
    const after = snap('2026-11-21T10:05:00Z', { a: pulse({ current: 'assets', renders: { 'preview-16x9.mp4': '2026-11-21T10:04:00Z' } }) });
    expect(watchEvents(before, after).map((event) => [event.kind, event.stage ?? event.file])).toEqual([
      ['stage-done', 'storyboard'],
      ['stage-started', 'assets'],
      ['render-ready', 'preview-16x9.mp4'],
    ]);
    const stalled = snap('2026-11-21T11:30:00Z', { a: { ...after.projects.a!, stalled: true } });
    expect(watchEvents(after, stalled).map((event) => event.kind)).toEqual(['stalled']);
    expect(watchEvents(stalled, { ...stalled, at: '2026-11-21T11:35:00Z' })).toEqual([]);
  });

  it('tells a failed render from one that stopped moving', () => {
    const progress = { output: '16x9.mp4', framesDone: 100, framesTotal: 400, startedAt: '2026-11-21T10:00:00Z', updatedAt: '2026-11-21T10:01:00Z' };
    const before = snap('2026-11-21T10:02:00Z', { a: pulse({ progress: [progress] }) });
    const later = snap('2026-11-21T10:30:00Z', { a: pulse({ progress: [progress] }) });
    expect(watchEvents(before, later).map((event) => event.kind)).toEqual(['render-interrupted']);
    const failed = snap('2026-11-21T10:31:00Z', { a: pulse({ progress: [{ ...progress, error: 'Chrome crashed' }] }) });
    expect(watchEvents(later, failed)).toEqual([expect.objectContaining({ kind: 'render-failed', file: '16x9.mp4', detail: 'Chrome crashed' })]);
  });
});

describe('production scan', () => {
  it('writes a snapshot and the events between two rounds', async () => {
    const ws = await workspace();
    const dir = await createProject({ root: ws, slug: 'neon', budget: 20 });
    const project = await loadProject(dir);
    const done = (state: State, ...ids: string[]) => ids.reduce((acc, id) => setStageDone(acc, id, []), state);
    const base = done(project.state, 'setup', 'brief', 'treatment');
    await writeFile(project.paths.state, JSON.stringify(setStageRunning(base, 'audio-analysis')));

    const first = await scanProduction({ root: ws, now: new Date('2026-11-21T10:00:00Z') });
    expect(first.events).toEqual([]);
    expect(first.snapshot.projects.neon).toMatchObject({ phase: 'running', current: 'audio-analysis', currentStatus: 'running' });

    await writeFile(project.paths.state, JSON.stringify(setStageFailed(setStageRunning(base, 'audio-analysis'), 'audio-analysis', 'no vocals')));
    await writeFile(join(dir, 'renders', 'preview-16x9.mp4'), 'video');
    const second = await scanProduction({ root: ws, now: new Date('2026-11-21T10:05:00Z'), every: 5 });
    expect(second.events.map((event) => event.kind)).toEqual(['stage-failed', 'render-ready']);
    expect(await loadSnapshot(ws)).toMatchObject({ at: '2026-11-21T10:05:00.000Z', every: 5 });
    expect((await loadEvents(ws)).map((event) => event.kind)).toEqual(['render-ready', 'stage-failed']);
  });

  it('marks a running stage stalled when no file changed for an hour', async () => {
    const ws = await workspace();
    const dir = await createProject({ root: ws, slug: 'neon', budget: 20 });
    const project = await loadProject(dir);
    await writeFile(project.paths.state, JSON.stringify(setStageRunning(project.state, 'setup')));
    const { snapshot, events } = await scanProduction({ root: ws, now: new Date(Date.now() + 2 * 3_600_000) });
    expect(snapshot.projects.neon!.stalled).toBe(true);
    expect(events.map((event) => event.kind)).toEqual(['stalled']);
  });
});

describe('render progress', () => {
  it('writes the progress at most every interval, removes it when done, and keeps a failure', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'coreslopper-progress-'));
    temporary.push(dir);
    let clock = Date.parse('2026-11-21T10:00:00Z');
    const now = () => new Date(clock);
    const writer = await startProgress(dir, '/media/neon/renders/16x9.mp4', 300, { now, intervalMs: 2000 });
    const path = progressPath(dir, '16x9.mp4');
    const read = async () => JSON.parse(await readFile(path, 'utf8'));
    expect(await read()).toMatchObject({ output: '16x9.mp4', framesDone: 0, framesTotal: 300 });
    clock += 2500;
    await writer.update(120.4);
    expect(await read()).toMatchObject({ framesDone: 120, updatedAt: '2026-11-21T10:00:02.500Z' });
    clock += 500;
    await writer.update(150);
    expect((await read()).framesDone).toBe(120);
    await writer.fail('Chrome crashed');
    expect(await read()).toMatchObject({ framesDone: 150, error: 'Chrome crashed' });
    const again = await startProgress(dir, '16x9.mp4', 300, { now });
    await again.done();
    expect(existsSync(path)).toBe(false);
  });
});

describe('container and computer', () => {
  it('leaves a young lock held on another host alone, and takes over a stale one', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'coreslopper-lock-'));
    temporary.push(dir);
    const path = join(dir, 'run.lock');
    const release = await acquireHolderLock(path, { staleMs: 60_000, alive: () => true, host: 'laptop' });
    expect(release).toBeDefined();
    // The container cannot see the laptop's pid: alive() says no, the host says it is someone else's.
    expect(await acquireHolderLock(path, { staleMs: 60_000, alive: () => false, host: 'container' })).toBeUndefined();
    const takeover = await acquireHolderLock(path, { staleMs: -1, alive: () => false, host: 'container' });
    expect(takeover).toBeDefined();
    await takeover!();
  });

  it('reads .env again so a token renewed elsewhere reaches a long-running watchdog', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'coreslopper-env-'));
    temporary.push(dir);
    const env: NodeJS.ProcessEnv = { X_REFRESH_TOKEN: 'old', OTHER: 'kept' };
    await writeFile(join(dir, '.env'), 'X_REFRESH_TOKEN=new\n# comment\n');
    await reloadEnv(dir, env);
    expect(env).toEqual({ X_REFRESH_TOKEN: 'new', OTHER: 'kept' });
    await mkdir(join(dir, 'none'));
    await reloadEnv(join(dir, 'none'), env);
    expect(env.X_REFRESH_TOKEN).toBe('new');
  });
});
