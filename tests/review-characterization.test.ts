// Characterization tests for human review: they pin existing behaviour the domain model confirmed
// (docs/domain/events.yaml, AGG-ProjectReview), not the behaviour it still wants.
import { describe, expect, it } from 'vitest';
import { draftNotes, nextRoundNumber, openRounds, type ReviewNote } from '@coreslopper/core';

const note = (frame: number, round?: number): ReviewNote => ({
  frame,
  seconds: frame / 30,
  time: '00:00.000',
  text: `note ${frame}`,
  ...(round === undefined ? {} : { round }),
});

describe('review rounds (characterization)', () => {
  it('numbers rounds once per project, across every render', () => {
    const rounds = [
      { round: 1, video: '16x9.mp4' },
      { round: 2, video: 'preview-9x16.mp4' },
      { round: 3, video: '16x9.mp4' },
    ];
    expect(nextRoundNumber(rounds)).toBe(4);
    expect(nextRoundNumber([])).toBe(1);
  });

  it('lists the rounds without replies, oldest first', () => {
    const rounds = [{ round: 3 }, { round: 1 }, { round: 2 }];
    expect(openRounds(rounds, [{ round: 2 }]).map((round) => round.round)).toEqual([1, 3]);
  });

  it('treats a note without a round as a draft note and a note with one as sent', () => {
    expect(draftNotes([note(10), note(20, 1), note(30)]).map((n) => n.frame)).toEqual([10, 30]);
  });
});
