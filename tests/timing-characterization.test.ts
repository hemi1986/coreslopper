/**
 * Characterization tests for timing and lyrics (adoption of the timing slice, 2026-11-21).
 * They pin what the merge, the check, the anchor resolver and the tag proposal do today where no other test
 * does; they do not assert the decided rules that are still ahead of the code (gap register G-49 to G-68).
 */
import { describe, expect, it } from 'vitest';
import {
  TimingOverridesSchema,
  TimingSchema,
  ValidationError,
  assertTiming,
  lyricsSections,
  mergeTiming,
  proposeTags,
  resolveAnchor,
  type Timing,
} from '../packages/core/src/index.ts';

function timing(): Timing {
  return TimingSchema.parse({
    version: 1,
    audio: { path: 'audio/song.wav', duration: 10, sampleRate: 48000 },
    bpm: 120,
    beats: [0, 0.5, 1, 1.5, 2],
    downbeats: [0, 2],
    onsets: [0.1],
    energy: { hop: 512, fps: 10, values: [0.2, 0.8] },
    sections: [
      { id: 'verse_1', label: 'Verse 1', start: 0, end: 4, confidence: 0.85, sources: ['downbeat'] },
      { id: 'chorus_1', label: 'Chorus', start: 4, end: 10, confidence: 0.7, sources: ['downbeat'] },
    ],
    lines: [
      {
        id: 'l1',
        section: 'verse_1',
        start: 1,
        end: 3,
        text: 'we run all night',
        words: [
          { text: 'we', start: 1, end: 1.4 },
          { text: 'run', start: 1.5, end: 2 },
        ],
      },
    ],
  });
}

describe('timing characterization', () => {
  it('replaces beats whole and moves sections, lines and words by id or index, keeping text and labels', () => {
    const merged = mergeTiming(
      timing(),
      TimingOverridesSchema.parse({
        beats: [0, 1],
        sections: [
          { id: 'verse_1', start: 0, end: 4.5 },
          { id: 'chorus_1', start: 4.5, end: 10 },
        ],
        lines: [{ id: 'l1', start: 1.2, end: 3.5 }],
        words: [{ line: 'l1', index: 1, start: 1.6, end: 2.1 }],
      }),
    );
    expect(merged.beats).toEqual([0, 1]);
    expect(merged.downbeats).toEqual([0, 2]);
    expect(merged.sections[0]).toMatchObject({ label: 'Verse 1', start: 0, end: 4.5, confidence: 0.85 });
    expect(merged.lines[0]).toMatchObject({ text: 'we run all night', start: 1.2, end: 3.5 });
    // a line override leaves the line's words where they were
    expect(merged.lines[0]!.words[0]).toEqual({ text: 'we', start: 1, end: 1.4 });
    expect(merged.lines[0]!.words[1]).toEqual({ text: 'run', start: 1.6, end: 2.1 });
  });

  it('throws for an override of an unknown section, line or word', () => {
    const base = timing();
    expect(() => mergeTiming(base, TimingOverridesSchema.parse({ sections: [{ id: 'bridge', start: 0, end: 1 }] }))).toThrow(
      /Unknown section "bridge"/,
    );
    expect(() => mergeTiming(base, TimingOverridesSchema.parse({ lines: [{ id: 'l9', start: 0, end: 1 }] }))).toThrow(
      /Unknown lyric line "l9"/,
    );
    expect(() =>
      mergeTiming(base, TimingOverridesSchema.parse({ words: [{ line: 'l1', index: 5, start: 1, end: 2 }] })),
    ).toThrow(/missing word 5 on line "l1"/);
  });

  it('accepts edges within 0.05 s and rejects sections that miss 0 or the duration, and beats outside the audio', () => {
    const near = timing();
    near.sections[1]!.end = 10.04;
    expect(() => assertTiming(near)).not.toThrow();

    const late = timing();
    late.sections[0]!.start = 0.2;
    expect(() => assertTiming(late)).toThrow(ValidationError);

    const short = timing();
    short.sections[1]!.end = 9.5;
    expect(() => assertTiming(short)).toThrow(ValidationError);

    const beats = timing();
    beats.beats.push(10.5);
    expect(() => assertTiming(beats)).toThrow(ValidationError);
  });

  it('applies offsets and edges, clamps within the tolerance and refuses missing beats or times outside the audio', () => {
    const base = timing();
    expect(resolveAnchor({ type: 'section', id: 'chorus_1', edge: 'end', offset: -1 }, base)).toBe(9);
    expect(resolveAnchor({ type: 'word', line: 'l1', index: 1, edge: 'end', offset: 0 }, base)).toBe(2);
    expect(resolveAnchor({ type: 'downbeat', index: 1, offset: 0.25 }, base)).toBe(2.25);
    expect(resolveAnchor({ type: 'section', id: 'chorus_1', edge: 'end', offset: 0.03 }, base)).toBe(10);
    expect(() => resolveAnchor({ type: 'section', id: 'chorus_1', edge: 'end', offset: 1 }, base)).toThrow(/outside/);
    expect(() => resolveAnchor({ type: 'beat', index: 99, offset: 0 }, base)).toThrow(/missing beat 99/);
  });

  it('proposes [Chorus] for a repeated block and numbered verses otherwise, and [Intro] above untagged leading lines', () => {
    const untagged = 'first line\nsecond line\n\nwe run all night\n\nthird line\n\nWe run all night!';
    expect(proposeTags(untagged)).toBe(
      '[Verse 1]\nfirst line\nsecond line\n\n[Chorus]\nwe run all night\n\n[Verse 2]\nthird line\n\n[Chorus]\nWe run all night!\n',
    );
    expect(proposeTags('hello\n[Verse 1]\nline')).toBe('[Intro]\nhello\n[Verse 1]\nline\n');
    expect(lyricsSections('hello\n[Verse 1]\nline')).toEqual({ untagged: ['hello'], sections: [{ tag: 'Verse 1', lines: ['line'] }] });
  });
});
