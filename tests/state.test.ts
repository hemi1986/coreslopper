import { describe, expect, it } from 'vitest';
import {
  BudgetError,
  ProjectConfigSchema,
  createInitialState,
  STAGES,
  effectiveBatchCap,
  migrateState,
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
  it('starts at setup and advances in order', () => {
    const state = createInitialState(config, '0.1.0');
    expect(state.stage).toBe('setup');
    expect(nextStage(state)?.id).toBe('setup');
    setStageDone(state, 'setup', ['lyrics.txt', 'song.json', 'audio/song.wav']);
    expect(nextStage(state)?.id).toBe('brief');
    setStageRunning(state, 'brief');
    expect(state.status).toBe('running');
    setStageDone(state, 'brief', ['brief.md']);
    expect(state.stages.brief!.status).toBe('done');
    expect(nextStage(state)?.id).toBe('treatment');
    expect(overallStatus(state)).toBe('pending');
  });

  it('runs the interactive stages before the song analysis', () => {
    const interactive = STAGES.filter((stage) => stage.interactive).map((stage) => stage.id);
    expect(interactive).toEqual(['setup', 'brief', 'treatment']);
    expect(STAGES.map((stage) => stage.id)).not.toContain('song');
    expect(STAGES.map((stage) => stage.id)).not.toContain('lyrics');
  });

  it('migrates a state file with the retired lyrics and song stages', () => {
    const state = createInitialState(config, '0.1.0');
    delete state.stages.setup;
    state.stages.lyrics = { status: 'done', outputs: ['lyrics.txt'], attempts: 1 };
    state.stages.song = { status: 'done', outputs: ['song.json', 'audio/song.wav'], attempts: 1 };
    state.stage = 'song';
    const migrated = migrateState(state);
    expect(migrated.stages.setup?.status).toBe('done');
    expect(migrated.stages.song).toBeUndefined();
    expect(migrated.stages.lyrics).toBeUndefined();
    expect(migrated.stage).toBe('brief');
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
