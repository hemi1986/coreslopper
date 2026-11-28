import { afterEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse, stringify } from 'yaml';
import { loadProject, projectNextAction, ProjectConfigSchema, SeriesSchema, seriesNextAction, setStageRunning, stageViews } from '@coreslopper/core';
import { createProject } from '../packages/cli/src/new-project.ts';
import { productionOverview, type ProductionProject, type ProductionSeries } from '../packages/cli/src/board-production.ts';
import { loadEvents, scanProduction } from '../packages/cli/src/production-watch.ts';
import { validateChangedFile } from '../packages/cli/src/validate-file.ts';
import { initWorkspace } from '../packages/cli/src/init.ts';
import { updateWorkspace } from '../packages/cli/src/update.ts';

// Demo productions (feature demo-projects): `demo: true` in a project's or series' own file means no next action
// and no watchdog events; `update` keeps a deleted demo deleted.

const root = process.cwd();
const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function temporaryDir(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporary.push(directory);
  return directory;
}

async function workspace(): Promise<string> {
  const dir = await temporaryDir('coreslopper-demo-');
  for (const folder of ['config', 'templates', 'brand']) await cp(join(root, folder), join(dir, folder), { recursive: true });
  return dir;
}

/** Copies a shipped demo's YAML and state files – no renders, which are git-ignored and may exist locally. */
async function copyDemo(ws: string, slug: string): Promise<string> {
  const source = join(root, 'projects', slug);
  const target = join(ws, 'projects', slug);
  await cp(source, target, { recursive: true, filter: (path) => !path.startsWith(join(source, 'renders')) && !path.startsWith(join(source, '.cache')) });
  return target;
}

async function editYaml(path: string, change: (data: Record<string, unknown>) => void): Promise<void> {
  const data = parse(await readFile(path, 'utf8')) as Record<string, unknown>;
  change(data);
  await writeFile(path, stringify(data));
}

describe('the demo flag', () => {
  it('validates project.yaml and series.yaml with demo: true and without it, and refuses demo: "yes" with the field named', async () => {
    for (const slug of ['demo', 'demo-episode']) {
      const config = parse(await readFile(join(root, 'projects', slug, 'project.yaml'), 'utf8')) as Record<string, unknown>;
      expect(config.demo).toBe(true);
      expect(ProjectConfigSchema.parse(config).demo).toBe(true);
      const { demo: _demo, ...plain } = config;
      expect(ProjectConfigSchema.parse(plain).demo).toBeUndefined();
      const refused = ProjectConfigSchema.safeParse({ ...config, demo: 'yes' });
      expect(refused.success).toBe(false);
      expect(refused.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['demo']);
    }
    const series = parse(await readFile(join(root, 'projects', 'demo-series', 'series.yaml'), 'utf8')) as Record<string, unknown>;
    expect(series.demo).toBe(true);
    expect(SeriesSchema.parse(series).demo).toBe(true);
    const { demo: _demo, ...plain } = series;
    expect(SeriesSchema.parse(plain).demo).toBeUndefined();
    const refused = SeriesSchema.safeParse({ ...series, demo: 'yes' });
    expect(refused.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['demo']);
  });

  it('is accepted and refused by validate-file', async () => {
    const ws = await workspace();
    const project = await copyDemo(ws, 'demo');
    const seriesDir = await copyDemo(ws, 'demo-series');
    await expect(validateChangedFile(join(project, 'project.yaml'))).resolves.toBeDefined();
    await expect(validateChangedFile(join(seriesDir, 'series.yaml'))).resolves.toBeDefined();
    await editYaml(join(project, 'project.yaml'), (data) => (data.demo = 'yes'));
    await expect(validateChangedFile(join(project, 'project.yaml'))).rejects.toThrow(/demo/);
    await editYaml(join(seriesDir, 'series.yaml'), (data) => (data.demo = 'yes'));
    await expect(validateChangedFile(join(seriesDir, 'series.yaml'))).rejects.toThrow(/demo/);
  });
});

describe('the next action of a demo', () => {
  it('is none with the reason demo and no command, before every other rule', async () => {
    const ws = await workspace();
    await copyDemo(ws, 'demo-series');
    const dir = await copyDemo(ws, 'demo-episode');
    const project = await loadProject(dir);
    const stages = stageViews(project.state);
    expect(stages.find((stage) => stage.status === 'pending' || stage.status === 'failed')?.id).toBe('voice-track');

    const overview = await productionOverview(ws);
    const episode = overview.projects.find((p) => p.slug === 'demo-episode') as ProductionProject;
    expect(episode.demo).toBe(true);
    expect(episode.next).toEqual({ where: 'none', reason: 'demo' });
    const series = overview.series.find((s) => s.slug === 'demo-series') as ProductionSeries;
    expect(series.demo).toBe(true);
    expect(series.next).toEqual({ where: 'none', reason: 'demo' });

    // Also while a stage runs, with open review rounds, and for a series whose canon is not ready.
    const running = stageViews(setStageRunning(project.state, 'voice-track'));
    expect(projectNextAction({ slug: 'demo-episode', kind: 'episode', stages: running, hasRelease: false, openRounds: 2, demo: true })).toEqual({ where: 'none', reason: 'demo' });
    expect(seriesNextAction({ slug: 'demo-series', canonReady: false, unplanned: [2], demo: true })).toEqual({ where: 'none', reason: 'demo' });
  });

  it('is not inherited: an episode without demo in a demo series still gets /video-next', async () => {
    const ws = await workspace();
    await copyDemo(ws, 'demo-series');
    const dir = await copyDemo(ws, 'demo-episode');
    await editYaml(join(dir, 'project.yaml'), (data) => delete data.demo);

    const overview = await productionOverview(ws);
    const episode = overview.projects.find((p) => p.slug === 'demo-episode') as ProductionProject;
    expect(episode.demo).toBe(false);
    expect(episode.next).toEqual({ where: 'claude', command: '/video-next demo-episode', reason: 'pipeline', stage: 'voice-track' });
    expect((overview.series.find((s) => s.slug === 'demo-series') as ProductionSeries).next.reason).toBe('demo');
  });
});

describe('the production scan', () => {
  it('writes events and a stall warning for the real project only, not for a stalled demo', async () => {
    const ws = await workspace();
    for (const slug of ['neon', 'neon-demo']) {
      const dir = await createProject({ root: ws, slug, budget: 20 });
      const project = await loadProject(dir);
      await writeFile(project.paths.state, JSON.stringify(setStageRunning(project.state, 'setup')));
    }
    await editYaml(join(ws, 'projects', 'neon-demo', 'project.yaml'), (data) => (data.demo = true));

    const { snapshot, events } = await scanProduction({ root: ws, now: new Date(Date.now() + 2 * 3_600_000) });
    expect(Object.keys(snapshot.projects)).toEqual(['neon']);
    expect(snapshot.projects.neon!.stalled).toBe(true);
    expect(events.map((event) => [event.project, event.kind])).toEqual([['neon', 'stalled']]);
    expect((await loadEvents(ws)).every((event) => event.project === 'neon')).toBe(true);
  });
});

describe('update and a deleted demo', () => {
  async function put(dir: string, path: string, content: string): Promise<void> {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), content);
  }

  async function runtimeFixture(version: string, files: Record<string, string>): Promise<string> {
    const runtime = await temporaryDir('coreslopper-runtime-');
    await mkdir(join(runtime, 'config'), { recursive: true });
    await cp(join(root, 'config', 'defaults.yaml'), join(runtime, 'config', 'defaults.yaml'));
    await cp(join(root, 'templates', 'project'), join(runtime, 'templates', 'project'), { recursive: true });
    await put(runtime, 'package.json', `${JSON.stringify({ name: 'coreslopper', version, private: true })}\n`);
    await put(runtime, '.mcp.json', '{"mcpServers":{}}\n');
    for (const [path, content] of Object.entries(files)) await put(runtime, path, content);
    return runtime;
  }

  it('leaves projects/demo-episode deleted and reports it', async () => {
    const v1 = await runtimeFixture('9.9.0', { 'projects/demo-episode/project.yaml': 'v1\n', 'projects/demo-episode/state.json': 'v1\n' });
    const target = await temporaryDir('coreslopper-workspace-');
    await initWorkspace({ targetDir: target, runtimeDir: v1, install: false, git: false });
    await rm(join(target, 'projects', 'demo-episode'), { recursive: true });

    const v2 = await runtimeFixture('9.10.0', { 'projects/demo-episode/project.yaml': 'v2\n', 'projects/demo-episode/state.json': 'v2\n' });
    const result = await updateWorkspace({ targetDir: target, runtimeDir: v2, install: false });

    const demo = result.changes.filter((change) => change.path.startsWith('projects/demo-episode/'));
    expect(demo.map((change) => [change.path, change.action]).sort()).toEqual([
      ['projects/demo-episode/project.yaml', 'skipped-deleted-locally'],
      ['projects/demo-episode/state.json', 'skipped-deleted-locally'],
    ]);
    expect(existsSync(join(target, 'projects', 'demo-episode'))).toBe(false);
  });
});
