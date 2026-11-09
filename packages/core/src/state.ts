import { BudgetError } from './errors.js';
import type { ProjectConfig, State, StageState, StageStatus } from './schema.js';

export interface StageDefinition {
  id: string;
  label: string;
  skills: string[];
  outputs: string[];
  mechanical: boolean;
  /**
   * Interactive stages run in the main session with the user (the
   * `new-video` skill), never in an autonomous stage runner.
   */
  interactive: boolean;
}

export const STAGES: StageDefinition[] = [
  {
    id: 'setup',
    label: 'Project setup & song import',
    skills: ['new-video'],
    outputs: ['lyrics.txt', 'song.json', 'audio/song.wav'],
    mechanical: false,
    interactive: true,
  },
  {
    id: 'brief',
    label: 'Brief',
    skills: ['grilling', 'video-brief'],
    outputs: ['brief.md'],
    mechanical: false,
    interactive: true,
  },
  {
    id: 'treatment',
    label: 'Concept & treatment',
    skills: ['grilling', 'video-treatment'],
    outputs: ['treatment.md'],
    mechanical: false,
    interactive: true,
  },
  {
    id: 'audio-analysis',
    label: 'Audio analysis',
    skills: ['audio-analysis'],
    outputs: ['timing.json', 'timing.report.md'],
    mechanical: true,
    interactive: false,
  },
  {
    id: 'style-character',
    label: 'Style & character bible',
    skills: ['style-bible', 'character-bible'],
    outputs: ['style.yaml', 'characters.yaml'],
    mechanical: false,
    interactive: false,
  },
  {
    id: 'storyboard',
    label: 'Storyboard',
    skills: ['storyboard'],
    outputs: ['storyboard.yaml', 'storyboard.md', 'review/contact-sheet.svg'],
    mechanical: false,
    interactive: false,
  },
  {
    id: 'assets',
    label: 'Asset production',
    skills: ['remotion-motion', 'ai-clips', 'footage'],
    outputs: ['assets/manifest.jsonl'],
    mechanical: false,
    interactive: false,
  },
  {
    id: 'assembly',
    label: 'Assembly',
    skills: ['assembly-render'],
    outputs: ['renders/preview-16x9.mp4'],
    mechanical: true,
    interactive: false,
  },
  {
    id: 'qa-export',
    label: 'QA & export',
    skills: ['video-qa'],
    outputs: ['review/report.md', 'renders/16x9.mp4'],
    mechanical: true,
    interactive: false,
  },
];

export const STAGE_IDS = STAGES.map((stage) => stage.id);

export function stageDefinition(id: string): StageDefinition | undefined {
  return STAGES.find((stage) => stage.id === id);
}

export function createInitialState(config: ProjectConfig, workflowVersion: string): State {
  const now = new Date().toISOString();
  const stages: Record<string, StageState> = {};
  for (const stage of STAGES) {
    stages[stage.id] = {
      status: 'pending',
      outputs: [],
      attempts: 0,
    };
  }
  return {
    version: 1,
    project: config.slug,
    workflowVersion,
    stage: STAGES[0]!.id,
    status: 'pending',
    stages,
    budget: {
      totalUsd: config.budget_usd,
      spentUsd: 0,
      reservedUsd: 0,
    },
    artifacts: {},
    errors: [],
    updatedAt: now,
  };
}

/** Stages that existed before the song became a mandatory import. */
const RETIRED_STAGES = ['lyrics', 'song'];

/**
 * Bring a state file written by an older workflow up to the current stage
 * list: add missing stages as pending, drop retired ones, and treat a finished
 * `song` stage as a finished `setup`.
 */
export function migrateState(state: State): State {
  const songDone = state.stages.song?.status === 'done' || state.stages.song?.status === 'skipped';
  for (const stage of STAGES) {
    if (state.stages[stage.id]) continue;
    state.stages[stage.id] =
      stage.id === 'setup' && songDone
        ? { status: 'done', outputs: state.stages.song?.outputs ?? [], attempts: 0 }
        : { status: 'pending', outputs: [], attempts: 0 };
  }
  for (const id of RETIRED_STAGES) delete state.stages[id];
  if (!STAGES.some((stage) => stage.id === state.stage)) {
    state.stage = nextStage(state)?.id ?? STAGES[STAGES.length - 1]!.id;
  }
  return state;
}

export function nextStage(state: State): StageDefinition | undefined {
  return STAGES.find((stage) => {
    const status = state.stages[stage.id]?.status ?? 'pending';
    return status === 'pending' || status === 'failed';
  });
}

export function overallStatus(state: State): StageStatus {
  const statuses = STAGES.map((stage) => state.stages[stage.id]?.status ?? 'pending');
  if (statuses.some((status) => status === 'failed')) return 'failed';
  if (statuses.some((status) => status === 'running')) return 'running';
  if (statuses.every((status) => status === 'done' || status === 'skipped')) return 'done';
  return 'pending';
}

export function setStageRunning(state: State, stageId: string): State {
  const stage = state.stages[stageId];
  if (!stage) throw new Error(`Unknown stage "${stageId}".`);
  const now = new Date().toISOString();
  stage.status = 'running';
  stage.startedAt = now;
  stage.attempts += 1;
  state.stage = stageId;
  state.status = 'running';
  state.updatedAt = now;
  return state;
}

export function setStageDone(
  state: State,
  stageId: string,
  outputs: string[],
  inputHash?: string,
): State {
  const stage = state.stages[stageId];
  if (!stage) throw new Error(`Unknown stage "${stageId}".`);
  const now = new Date().toISOString();
  stage.status = 'done';
  stage.outputs = outputs;
  stage.finishedAt = now;
  if (inputHash) stage.inputHash = inputHash;
  delete stage.lastError;
  const next = nextStage(state);
  state.stage = next?.id ?? stageId;
  state.status = overallStatus(state);
  state.updatedAt = now;
  return state;
}

export function setStageFailed(state: State, stageId: string, error: string): State {
  const stage = state.stages[stageId];
  if (!stage) throw new Error(`Unknown stage "${stageId}".`);
  const now = new Date().toISOString();
  stage.status = 'failed';
  stage.lastError = error;
  stage.finishedAt = now;
  state.stage = stageId;
  state.status = 'failed';
  state.errors.push(error);
  state.updatedAt = now;
  return state;
}

export function setStageSkipped(state: State, stageId: string, reason?: string): State {
  const stage = state.stages[stageId];
  if (!stage) throw new Error(`Unknown stage "${stageId}".`);
  stage.status = 'skipped';
  if (reason) stage.lastError = reason;
  const next = nextStage(state);
  state.stage = next?.id ?? stageId;
  state.status = overallStatus(state);
  state.updatedAt = new Date().toISOString();
  return state;
}

export function resetStage(state: State, stageId: string): State {
  const stage = state.stages[stageId];
  if (!stage) throw new Error(`Unknown stage "${stageId}".`);
  stage.status = 'pending';
  stage.outputs = [];
  stage.attempts = 0;
  delete stage.inputHash;
  delete stage.lastError;
  delete stage.startedAt;
  delete stage.finishedAt;
  state.stage = stageId;
  state.status = overallStatus(state);
  state.updatedAt = new Date().toISOString();
  return state;
}

export function remainingBudget(state: State): number {
  return Math.max(0, state.budget.totalUsd - state.budget.spentUsd - state.budget.reservedUsd);
}

export function recordSpend(state: State, usd: number): State {
  if (usd < 0) throw new BudgetError('Spend must not be negative.');
  const next = state.budget.spentUsd + usd;
  if (next > state.budget.totalUsd + 1e-9) {
    throw new BudgetError(
      `Spend of $${usd.toFixed(2)} would exceed the project budget ($${state.budget.totalUsd.toFixed(2)}).`,
    );
  }
  state.budget.spentUsd = Number(next.toFixed(6));
  state.updatedAt = new Date().toISOString();
  return state;
}

export function stageTable(state: State): string[] {
  const rows = ['Stage                 Status    Attempts  Outputs'];
  for (const stage of STAGES) {
    const current = state.stages[stage.id];
    const status = current?.status ?? 'pending';
    const attempts = current?.attempts ?? 0;
    const outputs = current?.outputs.length ? current.outputs.join(', ') : '-';
    rows.push(`${stage.id.padEnd(21)} ${status.padEnd(9)} ${String(attempts).padEnd(9)} ${outputs}`);
  }
  return rows;
}
