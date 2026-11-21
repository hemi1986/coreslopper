import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import {
  DEFAULT_WATCH_OPTIONS,
  isStalled,
  watchEvents,
  writeTextAtomic,
  type ProjectPulse,
  type WatchEvent,
  type WatchOptions,
  type WatchSnapshot,
} from '@coreslopper/core';
import { productionProject, projectDirs, type ProductionProject } from './board-production.js';

// The watchdog's production round: read every project as the board does,
// compare with the last round, and record what changed. It writes only its own
// files in .cache/watch/; it never touches state.json and never starts a stage.

export const watchDir = (root: string) => join(root, '.cache', 'watch');
export const snapshotPath = (root: string) => join(watchDir(root), 'snapshot.json');
export const eventsPath = (root: string) => join(watchDir(root), 'events.jsonl');

/** Events kept in the log; older ones are dropped when it grows past twice this. */
const KEEP_EVENTS = 500;

export function pulseOf(project: ProductionProject, now: Date, options: WatchOptions): ProjectPulse {
  const current = project.stages.find((stage) => stage.id === project.current);
  const pulse: ProjectPulse = {
    phase: project.phase,
    ...(current ? { current: current.id, currentStatus: current.status } : {}),
    failed: project.stages.filter((stage) => stage.status === 'failed').map((stage) => stage.id),
    renders: Object.fromEntries(project.renders.map((render) => [render.name, render.modified])),
    progress: project.progress,
    ...(project.lastActivity ? { lastActivity: project.lastActivity } : {}),
    needsFix: project.queue?.['needs-fix'] ?? 0,
    spentShare: project.budget.totalUsd > 0 ? project.budget.spentUsd / project.budget.totalUsd : 0,
    stalled: false,
  };
  pulse.stalled = isStalled(pulse, now, options);
  return pulse;
}

export async function loadSnapshot(root: string): Promise<WatchSnapshot | undefined> {
  try {
    const snapshot = JSON.parse(await readFile(snapshotPath(root), 'utf8')) as WatchSnapshot;
    return snapshot.version === 1 && typeof snapshot.at === 'string' ? snapshot : undefined;
  } catch {
    return undefined;
  }
}

/** The newest events first. */
export async function loadEvents(root: string, limit = 100): Promise<WatchEvent[]> {
  const text = await readFile(eventsPath(root), 'utf8').catch(() => '');
  const events: WatchEvent[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as WatchEvent);
    } catch {
      // a torn line
    }
  }
  return events.reverse().slice(0, limit);
}

async function appendEvents(root: string, events: WatchEvent[]): Promise<void> {
  if (!events.length) return;
  await appendFile(eventsPath(root), events.map((event) => `${JSON.stringify(event)}\n`).join(''));
  const lines = (await readFile(eventsPath(root), 'utf8')).split('\n').filter((line) => line.trim());
  if (lines.length > 2 * KEEP_EVENTS) await writeTextAtomic(eventsPath(root), `${lines.slice(-KEEP_EVENTS).join('\n')}\n`);
}

/** One production round: a snapshot of every project, and the events since the last round. */
export async function scanProduction(options: { root: string; now?: Date; every?: number; watch?: Partial<WatchOptions> }): Promise<{ snapshot: WatchSnapshot; events: WatchEvent[] }> {
  const now = options.now ?? new Date();
  const watch = { ...DEFAULT_WATCH_OPTIONS, ...options.watch };
  const projects: Record<string, ProjectPulse> = {};
  for (const dir of await projectDirs(options.root)) {
    const project = await productionProject(dir);
    projects[project.slug] =
      'error' in project
        ? { phase: 'failed', failed: [], renders: {}, progress: [], needsFix: 0, spentShare: 0, stalled: false, error: project.error }
        : pulseOf(project, now, watch);
  }
  const snapshot: WatchSnapshot = { version: 1, at: now.toISOString(), ...(options.every ? { every: options.every } : {}), projects };
  const events = watchEvents(await loadSnapshot(options.root), snapshot, watch);
  await mkdir(watchDir(options.root), { recursive: true });
  await appendEvents(options.root, events);
  await writeTextAtomic(snapshotPath(options.root), `${JSON.stringify(snapshot, null, 2)}\n`);
  return { snapshot, events };
}

/**
 * One watchdog round: the release autopilot, then the production scan. A
 * failing autopilot does not stop the scan, and the other way round.
 */
export async function watchRound(options: { root: string; every?: number; log?: (line: string) => void; autopilot?: boolean }): Promise<{ events: WatchEvent[]; errors: string[] }> {
  const log = options.log ?? ((line: string) => console.log(line));
  const errors: string[] = [];
  let events: WatchEvent[] = [];
  const stamp = new Date().toISOString();
  if (options.autopilot !== false) {
    try {
      const { runAutopilot } = await import('./release-autopilot.js');
      const result = await runAutopilot({ root: options.root });
      const acted = result.projects.reduce((sum, project) => sum + project.acted.length, 0);
      const attention = result.projects.reduce((sum, project) => sum + project.attention.length, 0);
      log(`${stamp} release-run: ${acted} action(s), ${attention} item(s) need you${result.locked ? ' (another run was active)' : ''}`);
    } catch (error) {
      errors.push(`release-run: ${(error as Error).message}`);
    }
  }
  try {
    const scan = await scanProduction({ root: options.root, every: options.every });
    const snapshot = scan.snapshot;
    events = scan.events;
    const stalled = Object.entries(snapshot.projects).filter(([, pulse]) => pulse.stalled).map(([slug]) => slug);
    log(`${stamp} production: ${Object.keys(snapshot.projects).length} project(s), ${events.length} event(s)${stalled.length ? `, stalled: ${stalled.join(', ')}` : ''}`);
  } catch (error) {
    errors.push(`production: ${(error as Error).message}`);
  }
  for (const error of errors) log(`${stamp} ${error}`);
  return { events, errors };
}

/**
 * Read `.env` again before a round of a long-running loop: a token renewed by
 * `publish-auth` in another process (on the computer, while the board runs in
 * its container) must reach this one. Values in the file win.
 */
export async function reloadEnv(root: string, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const text = await readFile(join(root, '.env'), 'utf8').catch(() => undefined);
  if (text === undefined) return;
  try {
    Object.assign(env, parseEnv(text));
  } catch {
    // A malformed .env keeps the values already loaded; doctor reports it.
  }
}

/** Run a round now and then every `everyMinutes`, until the process ends. */
export function watchLoop(options: { root: string; everyMinutes: number; log?: (line: string) => void }): () => void {
  // The autopilot records how often a round is due, for the board's "last run" warning.
  process.env.CORESLOPPER_TIMER_EVERY ??= String(options.everyMinutes);
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await reloadEnv(options.root);
      await watchRound({ root: options.root, every: options.everyMinutes, log: options.log });
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), options.everyMinutes * 60_000);
  return () => clearInterval(timer);
}
