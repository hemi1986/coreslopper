import { BudgetError } from './errors.js';
import type { ProjectConfig, State, StageState, StageStatus } from './schema.js';

export interface StageDefinition {
  id: string;
  label: string;
  skills: string[];
  outputs: string[];
  mechanical: boolean;
}

export const STAGES: StageDefinition[] = [
  {
    id: 'brief',
    label: 'Brief',
    skills: ['video-brief'],
    outputs: ['brief.md'],
    mechanical: false,
  },
  {
    id: 'treatment',
    label: 'Concept & treatment',
    skills: ['video-treatment'],
    outputs: ['treatment.md'],
    mechanical: false,
  },
  {
    id: 'lyrics',
    label: 'Lyrics',
    skills: ['lyrics-writer'],
    outputs: ['lyrics.txt', 'suno-style.txt'],
    mechanical: false,
  },
  {
    id: 'song',
    label: 'Song',
    skills: ['suno-song'],
    outputs: ['song.json', 'audio/song.wav', 'audio/stems/vocals.wav'],
    mechanical: false,
  },
  {
    id: 'audio-analysis',
    label: 'Audio analysis',
    skills: ['audio-analysis'],
    outputs: ['timing.json', 'timing.report.md'],
    mechanical: true,
  },
  {
    id: 'style-character',
    label: 'Style & character bible',
    skills: ['style-bible', 'character-bible'],
    outputs: ['style.yaml', 'characters.yaml'],
    mechanical: false,
  },
  {
    id: 'storyboard',
    label: 'Storyboard',
    skills: ['storyboard'],
    outputs: ['storyboard.yaml', 'storyboard.md', 'review/contact-sheet.svg'],
    mechanical: false,
  },
  {
    id: 'assets',
    label: 'Asset production',
    skills: ['remotion-motion', 'ai-clips', 'footage'],
    outputs: ['assets/manifest.jsonl'],
    mechanical: false,
  },
  {
    id: 'assembly',
    label: 'Assembly',
    skills: ['assembly-render'],
    outputs: ['renders/preview-16x9.mp4'],
    mechanical: true,
  },
  {
    id: 'qa-export',
    label: 'QA & export',
    skills: ['video-qa'],
    outputs: ['review/report.md', 'renders/16x9.mp4'],
    mechanical: true,
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
