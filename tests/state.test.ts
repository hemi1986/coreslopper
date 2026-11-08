import { describe, expect, it } from 'vitest';
import {
  BudgetError,
  ProjectConfigSchema,
  createInitialState,
  effectiveBatchCap,
  nextStage,
  overallStatus,
  recordSpend,
  remainingBudget,
  setStageDone,
  setStageRunning,
} from '@coreslopper/core';

const config = ProjectConfigSchema.parse({
  version: 1,
  slug: 'state-test',
  title: 'State test',
  created: '2026-11-08T00:00:00Z',
  workflow: { version: '0.1.0' },
  budget_usd: 50,
  formats: {
    master: { aspect: '16:9', width: 1920, height: 1080, fps: 30 },
  },
});

describe('state machine', () => {
  it('starts at brief and advances in order', () => {
    const state = createInitialState(config, '0.1.0');
    expect(state.stage).toBe('brief');
    expect(nextStage(state)?.id).toBe('brief');
    setStageRunning(state, 'brief');
    expect(state.status).toBe('running');
    setStageDone(state, 'brief', ['brief.md']);
    expect(state.stages.brief!.status).toBe('done');
    expect(nextStage(state)?.id).toBe('treatment');
    expect(overallStatus(state)).toBe('pending');
  });

  it('enforces the project budget', () => {
    const state = createInitialState(config, '0.1.0');
    recordSpend(state, 10);
    expect(remainingBudget(state)).toBe(40);
    expect(effectiveBatchCap(config, state)).toBeCloseTo(12);
    expect(() => recordSpend(state, 45)).toThrow(BudgetError);
  });

  it('reports done only when every stage is done or skipped', () => {
    const state = createInitialState(config, '0.1.0');
    for (const stage of Object.keys(state.stages)) {
      if (stage === 'assets') {
        state.stages[stage]!.status = 'skipped';
      } else {
        state.stages[stage]!.status = 'done';
      }
    }
    expect(overallStatus(state)).toBe('done');
  });
});
