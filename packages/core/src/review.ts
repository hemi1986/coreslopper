import type { ReviewNote, ReviewReplies, ReviewRound } from './schema.js';

// Review rounds: the user's notes on a render, sent to the agent in rounds.
// Pure helpers shared by the board, `status`, and the tests.

/** `mm:ss.mmm` for a position in a video, as the review player writes it. */
export function formatReviewTime(seconds: number): string {
  const total = Math.round(seconds * 1000);
  const minutes = Math.floor(total / 60000);
  const rest = total % 60000;
  return `${String(minutes).padStart(2, '0')}:${String(Math.floor(rest / 1000)).padStart(2, '0')}.${String(rest % 1000).padStart(3, '0')}`;
}

/** The frame shown at `seconds` in a video of `fps`. */
export function frameAt(seconds: number, fps: number): number {
  return Math.max(0, Math.floor(seconds * fps + 1e-6));
}

export interface TimedSpan {
  id: string;
  start: number;
  end: number;
}

/**
 * The spans (shots or sections) on screen during a note: the one at its
 * frame, or every span its range touches. A note on a cut belongs to both shots.
 */
export function spansAt(spans: TimedSpan[], seconds: number, endSeconds = seconds, fps = 30): string[] {
  const halfFrame = 0.5 / fps;
  const from = seconds - halfFrame;
  const to = endSeconds + halfFrame;
  return spans.filter((span) => span.start < to && span.end > from).map((span) => span.id);
}

/** The next round number: one past the highest that exists. */
export function nextRoundNumber(rounds: Array<Pick<ReviewRound, 'round'>>): number {
  return rounds.reduce((max, round) => Math.max(max, round.round), 0) + 1;
}

/** Rounds without replies, oldest first. */
export function openRounds<T extends Pick<ReviewRound, 'round'>>(rounds: T[], replies: Array<Pick<ReviewReplies, 'round'>>): T[] {
  const answered = new Set(replies.map((reply) => reply.round));
  return rounds.filter((round) => !answered.has(round.round)).sort((a, b) => a.round - b.round);
}

/** Drafts: the notes no round has sent yet. */
export function draftNotes(notes: ReviewNote[]): ReviewNote[] {
  return notes.filter((note) => note.round === undefined);
}

/** File name of a round: `001.json`. */
export const roundFileName = (round: number) => `${String(round).padStart(3, '0')}.json`;
export const repliesFileName = (round: number) => `${String(round).padStart(3, '0')}.replies.json`;
