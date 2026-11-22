// Characterization tests from the adoption of the pipeline slice (2026-11-21).
// They pin the project's stage behaviour the domain model confirmed; they do not assert what it should do.
import { describe, expect, it } from 'vitest';
import {
  BudgetError,
  ProjectConfigSchema,
  assertAffordable,
  createInitialState,
  nextStage,
  overallStatus,
  projectNextAction,
  resetStage,
  setStageDone,
  setStageFailed,
  setStageRunning,
  setStageSkipped,
  stageViews,
  STAGES,
} from '@coreslopper/core';

const config = ProjectConfigSchema.parse({
  version: 1,
  slug: 'pipeline-test',
  title: 'Pipeline test',
  created: '2026-11-08T00:00:00Z',
  workflow: { version: '0.1.0' },
  budget_usd: 100,
  formats: { master: { aspect: '16:9', width: 1920, height: 1080, fps: 30 } },
});

function stateWithInteractiveDone() {
  const state = createInitialState(config, '0.1.0');
  setStageDone(state, 'setup', ['lyrics.txt']);
  setStageDone(state, 'brief', ['brief.md']);
  setStageDone(state, 'treatment', ['treatment.md']);
  return state;
}

describe('stage pipeline (characterization)', () => {
  it('resumes a failed stage before any later stage, and a failed stage fails the project', () => {
    const state = stateWithInteractiveDone();
    setStageRunning(state, 'audio-analysis');
    setStageFailed(state, 'audio-analysis', 'credentials missing');
    expect(nextStage(state)?.id).toBe('audio-analysis');
    expect(overallStatus(state)).toBe('failed');
    expect(state.stages['audio-analysis']!.lastError).toBe('credentials missing');
  });

  it('counts every start of a stage as a stage attempt', () => {
    const state = stateWithInteractiveDone();
    setStageRunning(state, 'audio-analysis');
    setStageFailed(state, 'audio-analysis', 'validation failed');
    setStageRunning(state, 'audio-analysis');
    expect(state.stages['audio-analysis']!.attempts).toBe(2);
    expect(state.errors).toEqual(['validation failed']);
  });

  it('treats a skipped stage as finished and moves on to the next open stage', () => {
    const state = stateWithInteractiveDone();
    setStageSkipped(state, 'audio-analysis', 'not needed');
    expect(state.stage).toBe('style-character');
    for (const stage of STAGES.filter((s) => s.id !== 'audio-analysis' && !s.interactive)) {
      setStageDone(state, stage.id, []);
    }
    expect(overallStatus(state)).toBe('done');
  });

  it('a stage reset returns the stage to pending with no outputs, attempts, hash, or error', () => {
    const state = stateWithInteractiveDone();
    setStageRunning(state, 'audio-analysis');
    setStageDone(state, 'audio-analysis', ['timing.json'], 'abc123');
    resetStage(state, 'audio-analysis');
    const stage = state.stages['audio-analysis']!;
    expect(stage).toEqual({ status: 'pending', outputs: [], attempts: 0 });
    expect(state.stage).toBe('audio-analysis');
  });

  it('refuses a batch above the batch cap of 30 % of the remaining budget, and one above the remaining budget', () => {
    const state = createInitialState(config, '0.1.0');
    expect(() => assertAffordable(config, state, 30)).not.toThrow();
    expect(() => assertAffordable(config, state, 31)).toThrow(BudgetError);
    expect(() => assertAffordable({ batch_cap_usd: 500 }, state, 101)).toThrow(/remaining project budget/);
  });

  it('sends an open interactive stage to the setup skill before open review rounds', () => {
    const state = createInitialState(config, '0.1.0');
    const action = projectNextAction({ slug: 'pipeline-test', stages: stageViews(state), hasRelease: false, openRounds: 2 });
    expect(action).toMatchObject({ where: 'claude', reason: 'interactive', command: '/new-video pipeline-test' });
  });
});
