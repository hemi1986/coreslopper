import { afterEach, describe, expect, it } from 'vitest';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import {
  createInitialState,
  loadProject,
  productionPhase,
  projectNextAction,
  queueCounts,
  seriesNextAction,
  setStageDone,
  setStageFailed,
  setStageRunning,
  stageViews,
  type State,
} from '@coreslopper/core';
import { createProject } from '../packages/cli/src/new-project.ts';
import { createSeries } from '../packages/cli/src/new-series.ts';
import { productionDetail, productionOverview } from '../packages/cli/src/board-production.ts';
import { boardHandler } from '../packages/cli/src/release-board.ts';

const root = process.cwd();
const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function workspace(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'coreslopper-board-'));
  temporary.push(dir);
  for (const folder of ['config', 'templates', 'brand']) await cp(join(root, folder), join(dir, folder), { recursive: true });
  return dir;
}

function state(kind: 'music-video' | 'episode' = 'music-video'): State {
  return createInitialState({ slug: 'x', kind, budget_usd: 20 } as never, '0.0.0');
}

const done = (s: State, ...ids: string[]) => ids.reduce((acc, id) => setStageDone(acc, id, []), s);
const facts = (s: State, extra: { hasRelease?: boolean; approved?: boolean } = {}) => ({
  slug: 'neon',
  kind: s.kind,
  stages: stageViews(s),
  hasRelease: extra.hasRelease ?? false,
  approved: extra.approved,
});

describe('production next action', () => {
  it('sends open interactive stages to the setup skill, then the pipeline to /video-next', () => {
    expect(projectNextAction(facts(state()))).toEqual({ where: 'claude', command: '/new-video neon', reason: 'interactive', stage: 'setup' });
    expect(projectNextAction(facts(state('episode')))).toMatchObject({ command: '/new-episode neon', stage: 'setup' });
    const ready = done(state(), 'setup', 'brief', 'treatment');
    expect(productionPhase(stageViews(ready))).toBe('ready');
    expect(projectNextAction(facts(ready))).toEqual({ where: 'claude', command: '/video-next neon', reason: 'pipeline', stage: 'audio-analysis' });
  });

  it('waits while a stage runs and asks for a retry after a failure', () => {
    const base = done(state(), 'setup', 'brief', 'treatment');
    const running = setStageRunning(base, 'audio-analysis');
    expect(productionPhase(stageViews(running))).toBe('running');
    expect(projectNextAction(facts(running))).toEqual({ where: 'none', reason: 'running', stage: 'audio-analysis' });
    const failed = setStageFailed(running, 'audio-analysis', 'no vocals');
    expect(productionPhase(stageViews(failed))).toBe('failed');
    expect(projectNextAction(facts(failed))).toMatchObject({ command: '/video-next neon', reason: 'retry' });
  });

  it('goes to the release once every stage is done, and waits after the approval', () => {
    const all = done(state(), ...stageViews(state()).map((stage) => stage.id));
    expect(productionPhase(stageViews(all))).toBe('done');
    expect(projectNextAction(facts(all))).toMatchObject({ command: '/video-next neon', stage: 'qa-export' });
    expect(projectNextAction(facts(all, { hasRelease: true }))).toEqual({ where: 'board', reason: 'release' });
    expect(projectNextAction(facts(all, { hasRelease: true, approved: true }))).toEqual({ where: 'none', reason: 'released' });
  });

  it('finishes a series canon before its episodes', () => {
    expect(seriesNextAction({ slug: 'drift', canonReady: false, unplanned: [1] })).toEqual({ where: 'claude', command: '/new-series drift', reason: 'canon' });
    expect(seriesNextAction({ slug: 'drift', canonReady: true, unplanned: [2, 3] })).toEqual({ where: 'claude', command: '/new-episode', reason: 'episode' });
    expect(seriesNextAction({ slug: 'drift', canonReady: true, unplanned: [] })).toEqual({ where: 'none', reason: 'series-done' });
  });

  it('counts queue items by status', () => {
    expect(queueCounts([{ status: 'passed' }, { status: 'passed' }, { status: 'needs-fix' }, {}])).toEqual({ passed: 2, 'needs-fix': 1, pending: 1 });
  });
});

async function request(handler: ReturnType<typeof boardHandler>, url: string) {
  const req = Object.assign(Readable.from([]), { method: 'GET', url, headers: { host: '127.0.0.1:4848' } });
  return new Promise<{ status: number; headers: Record<string, unknown>; body: string }>((resolveDone) => {
    const chunks: Buffer[] = [];
    const res = {
      statusCode: 200,
      headers: {} as Record<string, unknown>,
      setHeader(name: string, value: unknown) { this.headers[name.toLowerCase()] = value; },
      writeHead(status: number, head: Record<string, unknown> = {}) { this.statusCode = status; Object.assign(this.headers, head); return this; },
      write(chunk: Buffer | string) { chunks.push(Buffer.from(chunk)); return true; },
      end(chunk?: Buffer | string) { if (chunk) chunks.push(Buffer.from(chunk)); resolveDone({ status: this.statusCode, headers: this.headers, body: Buffer.concat(chunks).toString('utf8') }); },
      on() { return this; }, once() { return this; }, emit() { return true; }, removeListener() { return this; },
    };
    void handler(req as never, res as never);
  });
}

describe('production view', () => {
  it('lists every project and series with stages, budget, queue, reviews, and renders', async () => {
    const ws = await workspace();
    const dir = await createProject({ root: ws, slug: 'neon', budget: 25, title: 'Neon Rain' });
    await createSeries({ root: ws, slug: 'drift', budget: 60 });
    const project = await loadProject(dir);
    const running = setStageRunning(done(project.state, 'setup', 'brief', 'treatment', 'audio-analysis', 'style-character', 'storyboard'), 'assets');
    await writeFile(project.paths.state, JSON.stringify(running));
    await writeFile(join(dir, 'song.json'), JSON.stringify({ title: 'Neon Rain', artist: 'Neon Static' }));
    await writeFile(join(dir, 'assets', 'queue.json'), JSON.stringify({ version: 1, items: [{ id: 's01', kind: 'image', status: 'passed' }, { id: 's02', kind: 'clip', status: 'needs-fix', note: 'hand drift' }] }));
    await mkdir(join(dir, 'assets', 'review'), { recursive: true });
    await writeFile(join(dir, 'assets', 'review', 'verdicts.jsonl'), [
      JSON.stringify({ subject: 's01', verdict: 'fail', score: 4, attempt: 1, image: 'assets/keyframes/s01-a1.png', issues: ['six fingers'], reviewedAt: '2026-11-21T10:00:00Z' }),
      JSON.stringify({ subject: 's01', verdict: 'pass', score: 8, attempt: 2, image: 'assets/keyframes/s01-a2.png', issues: [], reviewedAt: '2026-11-21T10:05:00Z' }),
      JSON.stringify({ subject: 's02', verdict: 'fail', score: 3, attempt: 1, image: 'assets/keyframes/s02.png', issues: ['wrong prop'], reviewedAt: '2026-11-21T10:06:00Z' }),
      '{"torn',
    ].join('\n'));
    await writeFile(join(dir, 'renders', 'preview-16x9.mp4'), 'video');
    await writeFile(join(dir, 'brief.md'), '# Brief\n\nA rainy night.\n');

    const { projects, series } = await productionOverview(ws);
    expect(projects).toEqual([
      expect.objectContaining({
        slug: 'neon', title: 'Neon Rain', artist: 'Neon Static', phase: 'running', current: 'assets',
        queue: { passed: 1, 'needs-fix': 1 }, failedReviews: 1, hasRelease: false,
        next: { where: 'none', reason: 'running', stage: 'assets' },
        budget: { totalUsd: 25, spentUsd: 0, reservedUsd: 0 },
      }),
    ]);
    expect((projects[0] as { renders: unknown[] }).renders).toEqual([expect.objectContaining({ path: 'renders/preview-16x9.mp4', bytes: 5 })]);
    expect(series).toEqual([expect.objectContaining({ slug: 'drift', characters: 0, sets: 0, canonGaps: ['no characters', 'no sets'], next: { where: 'claude', command: '/new-series drift', reason: 'canon' } })]);

    const detail = await productionDetail(dir);
    // Only documents with more than template headings.
    expect(detail.documents).toEqual([{ label: 'Brief', path: 'brief.md' }]);
    expect(detail.queueItems.map((item) => item.status)).toEqual(['passed', 'needs-fix']);
    expect(detail.verdicts.map((verdict) => `${verdict.subject}:${verdict.verdict}`)).toEqual(['s02:fail', 's01:pass']);
  });

  it('serves the page, the production API, and only whitelisted project files', async () => {
    const ws = await workspace();
    const dir = await createProject({ root: ws, slug: 'neon', budget: 25 });
    await writeFile(join(dir, 'renders', 'preview-16x9.mp4'), 'video');
    await writeFile(join(dir, 'brief.md'), '# Brief\n\nText.\n');
    await writeFile(join(ws, '.env'), 'FAL_KEY=secret');
    const handler = boardHandler({ root: ws, refresh: async () => undefined });

    const page = await request(handler, '/');
    expect(page.status).toBe(200);
    expect(page.body).toContain('/board/app.js');
    for (const file of ['app.js', 'lib.js', 'production.js', 'release.js', 'board.css']) {
      expect((await request(handler, `/board/${file}`)).status).toBe(200);
    }
    expect((await request(handler, '/board/..%2Frelease-board.ts')).status).toBe(404);

    expect(JSON.parse((await request(handler, '/api/production')).body).projects[0]).toMatchObject({ slug: 'neon', phase: 'setup' });
    expect(JSON.parse((await request(handler, '/api/production/projects/neon')).body)).toMatchObject({ slug: 'neon', documents: [{ label: 'Brief', path: 'brief.md' }] });
    expect((await request(handler, '/api/production/projects/nope')).status).toBe(400);

    const video = await request(handler, '/files/neon/renders/preview-16x9.mp4');
    expect(video).toMatchObject({ status: 200, body: 'video' });
    expect(video.headers['content-security-policy']).toContain('sandbox');
    expect((await request(handler, '/files/neon/brief.md')).body).toContain('Text.');
    for (const path of ['/files/neon/project.yaml', '/files/neon/state.json', '/files/neon/assets/.cache/x', '/files/neon/renders/..%2F..%2F..%2F.env']) {
      expect((await request(handler, path)).status).toBe(403);
    }
    // Dot segments are resolved by the URL parser before any route matches.
    for (const path of ['/files/neon/renders/../../../.env', '/files/neon/renders/%2e%2e/%2e%2e/%2e%2e/.env']) {
      const response = await request(handler, path);
      expect(response.status).toBe(404);
      expect(response.body).not.toContain('secret');
    }
  });
});
