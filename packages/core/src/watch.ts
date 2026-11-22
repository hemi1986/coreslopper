import type { ProductionPhase } from './production.js';

// The watchdog's view of production: one pulse per project per round, and the
// events between two rounds. Pure, so the board and the watchdog agree.

/** A render in progress, from `review/progress/<output>.json`. */
export interface RenderProgress {
  output: string;
  framesDone: number;
  framesTotal: number;
  startedAt: string;
  updatedAt: string;
  /** Set when the render failed; the file stays until the next render of that output. */
  error?: string;
}

export interface ProjectPulse {
  phase: ProductionPhase;
  /** The running stage, else the first open one. */
  current?: string;
  currentStatus?: string;
  /** Failed stages. */
  failed: string[];
  /** Finished renders in `renders/` by name, with their modification time. */
  renders: Record<string, string>;
  progress: RenderProgress[];
  /** The newest change among the files the pipeline writes. */
  lastActivity?: string;
  /** Queue items waiting for the stage runner. */
  needsFix: number;
  spentShare: number;
  stalled: boolean;
  error?: string;
}

export interface WatchSnapshot {
  version: 1;
  at: string;
  /** Minutes between rounds, when the round runs on a schedule. */
  every?: number;
  projects: Record<string, ProjectPulse>;
}

export type WatchEventKind =
  | 'stage-started'
  | 'stage-done'
  | 'stage-failed'
  | 'render-ready'
  | 'render-failed'
  | 'render-interrupted'
  | 'stalled'
  | 'needs-fix'
  | 'budget'
  | 'unreadable'
  | 'comfyui-restarted';

export interface WatchEvent {
  at: string;
  /** The project's slug; empty for an event of the workspace (a ComfyUI restart). */
  project: string;
  kind: WatchEventKind;
  stage?: string;
  file?: string;
  detail?: string;
}

export interface WatchOptions {
  /** A running stage with no file change for this long is stalled. */
  stallMinutes: number;
  /** A render whose progress file did not change for this long was interrupted. */
  renderStaleMinutes: number;
}

export const DEFAULT_WATCH_OPTIONS: WatchOptions = { stallMinutes: 60, renderStaleMinutes: 15 };

const minutesSince = (iso: string | undefined, now: Date) => (iso ? (now.getTime() - Date.parse(iso)) / 60_000 : Infinity);

/** A running stage whose files have not changed for `stallMinutes`. */
export function isStalled(pulse: Pick<ProjectPulse, 'phase' | 'lastActivity'>, now: Date, options: WatchOptions = DEFAULT_WATCH_OPTIONS): boolean {
  return pulse.phase === 'running' && minutesSince(pulse.lastActivity, now) > options.stallMinutes;
}

/** A render still listed as in progress, but whose progress stopped moving. */
export function isInterrupted(progress: RenderProgress, now: Date, options: WatchOptions = DEFAULT_WATCH_OPTIONS): boolean {
  return !progress.error && minutesSince(progress.updatedAt, now) > options.renderStaleMinutes;
}

/**
 * What changed between two rounds. The first round (no previous snapshot)
 * reports only what needs the user now, so a new watchdog does not replay history.
 */
export function watchEvents(previous: WatchSnapshot | undefined, next: WatchSnapshot, options: WatchOptions = DEFAULT_WATCH_OPTIONS): WatchEvent[] {
  const events: WatchEvent[] = [];
  const now = new Date(next.at);
  for (const [project, pulse] of Object.entries(next.projects)) {
    const before = previous?.projects[project];
    const add = (event: Omit<WatchEvent, 'at' | 'project'>) => events.push({ at: next.at, project, ...event });
    if (pulse.error) {
      if (before?.error !== pulse.error) add({ kind: 'unreadable', detail: pulse.error });
      continue;
    }
    if (pulse.stalled && !before?.stalled) add({ kind: 'stalled', ...(pulse.current ? { stage: pulse.current } : {}), ...(pulse.lastActivity ? { detail: pulse.lastActivity } : {}) });
    for (const stage of pulse.failed) if (!before?.failed.includes(stage)) add({ kind: 'stage-failed', stage });
    for (const progress of pulse.progress) {
      const was = before?.progress.find((entry) => entry.output === progress.output);
      if (progress.error && (!was || !was.error)) add({ kind: 'render-failed', file: progress.output, detail: progress.error });
      else if (isInterrupted(progress, now, options) && (!was || !isInterrupted(was, new Date(previous!.at), options))) {
        add({ kind: 'render-interrupted', file: progress.output });
      }
    }
    if (pulse.needsFix > 0 && !(before && before.needsFix >= pulse.needsFix)) add({ kind: 'needs-fix', detail: String(pulse.needsFix) });
    if (pulse.spentShare >= 0.8 && !(before && before.spentShare >= 0.8)) add({ kind: 'budget', detail: `${Math.round(pulse.spentShare * 100)}%` });
    if (!before) continue;
    // Progress since the last round.
    if (pulse.current !== before.current || pulse.currentStatus !== before.currentStatus) {
      if (before.current && before.currentStatus === 'running' && !pulse.failed.includes(before.current)) add({ kind: 'stage-done', stage: before.current });
      if (pulse.current && pulse.currentStatus === 'running') add({ kind: 'stage-started', stage: pulse.current });
    }
    for (const [name, modified] of Object.entries(pulse.renders)) {
      if (before.renders[name] !== modified) add({ kind: 'render-ready', file: name });
    }
  }
  return events;
}
