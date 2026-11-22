import { stagesFor } from './state.js';
import type { ProjectKind, State, StageStatus } from './schema.js';

// What the board's production view shows per project and series: the phase
// it is in and the next thing to do. Pure, so the board and the watchdog read
// the same answer from the same files.

/** Where a project stands, coarsely. */
export type ProductionPhase =
  /** An interactive stage is open: the user runs a skill in Claude Code. */
  | 'setup'
  /** Autonomous stages are open and none is running. */
  | 'ready'
  | 'running'
  | 'failed'
  /** Every stage is done; the release package exists or is next. */
  | 'done';

export interface NextAction {
  /** `claude`: a command to type in Claude Code; `board`: something to do on the board; `none`: wait. */
  where: 'claude' | 'board' | 'none';
  /** The command to copy, for `claude`. */
  command?: string;
  /** Machine-readable reason, for the page's wording. */
  reason:
    | 'interactive'
    | 'pipeline'
    | 'retry'
    | 'review'
    | 'running'
    | 'release'
    | 'release-missing'
    | 'released'
    | 'canon'
    | 'episode'
    | 'series-done';
  /** The stage the reason refers to. */
  stage?: string;
}

export interface StageView {
  id: string;
  label: string;
  status: StageStatus;
  interactive: boolean;
  attempts: number;
  startedAt?: string;
  finishedAt?: string;
  lastError?: string;
}

export function stageViews(state: State): StageView[] {
  return stagesFor(state.kind).map((stage) => {
    const entry = state.stages[stage.id];
    return {
      id: stage.id,
      label: stage.label,
      status: entry?.status ?? 'pending',
      interactive: stage.interactive,
      attempts: entry?.attempts ?? 0,
      ...(entry?.startedAt ? { startedAt: entry.startedAt } : {}),
      ...(entry?.finishedAt ? { finishedAt: entry.finishedAt } : {}),
      ...(entry?.lastError ? { lastError: entry.lastError } : {}),
    };
  });
}

/** The skill that runs a project's interactive stages. */
export function setupSkill(kind: ProjectKind | undefined): string {
  if (kind === 'episode') return 'new-episode';
  if (kind === 'meme') return 'new-meme';
  return 'new-video';
}

export interface ProductionFacts {
  slug: string;
  kind?: ProjectKind;
  stages: StageView[];
  /** `renders/release/manifest.json` exists. */
  hasRelease: boolean;
  /** The release is approved on the board (`review/release-status.json`). */
  approved?: boolean;
  /** Review rounds the user sent and the agent has not answered. */
  openRounds?: number;
}

export function productionPhase(stages: StageView[]): ProductionPhase {
  if (stages.some((stage) => stage.status === 'running')) return 'running';
  const open = stages.find((stage) => stage.status === 'pending' || stage.status === 'failed');
  if (!open) return 'done';
  if (open.interactive) return 'setup';
  return open.status === 'failed' ? 'failed' : 'ready';
}

/**
 * The next step of a project. Interactive stages come first (they block
 * `/video-next`); a running stage means waiting; an open review round and a
 * failed or pending autonomous stage are `/video-next`, which answers the
 * round first; a finished project goes to the release. A finished project
 * without a release folder is `/video-next` too: it resets qa-export, whose
 * output the folder is, and builds it again (HS-13).
 */
export function projectNextAction(facts: ProductionFacts): NextAction {
  const running = facts.stages.find((stage) => stage.status === 'running');
  if (running) return { where: 'none', reason: 'running', stage: running.id };
  const open = facts.stages.find((stage) => stage.status === 'pending' || stage.status === 'failed');
  if (open?.interactive) return { where: 'claude', command: `/${setupSkill(facts.kind)} ${facts.slug}`, reason: 'interactive', stage: open.id };
  if (facts.openRounds) return { where: 'claude', command: `/video-next ${facts.slug}`, reason: 'review' };
  if (open) return { where: 'claude', command: `/video-next ${facts.slug}`, reason: open.status === 'failed' ? 'retry' : 'pipeline', stage: open.id };
  if (!facts.hasRelease) return { where: 'claude', command: `/video-next ${facts.slug}`, reason: 'release-missing', stage: 'qa-export' };
  return facts.approved ? { where: 'none', reason: 'released' } : { where: 'board', reason: 'release' };
}

export interface SeriesFacts {
  slug: string;
  /** The canon has what episodes need: at least one character and one set, each with references. */
  canonReady: boolean;
  /** Planned episodes without a project, in plan order. */
  unplanned: number[];
}

/** The next step of a series: finish the canon, then create the next planned episode. */
export function seriesNextAction(facts: SeriesFacts): NextAction {
  if (!facts.canonReady) return { where: 'claude', command: `/new-series ${facts.slug}`, reason: 'canon' };
  if (facts.unplanned.length) return { where: 'claude', command: '/new-episode', reason: 'episode' };
  return { where: 'none', reason: 'series-done' };
}

/** Counts of a generation queue (`assets/queue.json`) by item status. */
export function queueCounts(items: Array<{ status?: unknown }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const status = typeof item.status === 'string' ? item.status : 'pending';
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}
