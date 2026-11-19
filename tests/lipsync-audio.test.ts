import { describe, expect, it } from 'vitest';
import { backingSpans, muteFilter, parseMuteSpans, segmentMutes } from '../packages/cli/src/lipsync-audio.ts';
import { segmentSource } from '../packages/cli/src/media.ts';

const line = (text: string, words: [string, number, number][]) => ({
  id: 'l1',
  section: 'chorus_1',
  start: words[0]![1],
  end: words[words.length - 1]![2],
  text,
  words: words.map(([word, start, end]) => ({ text: word, start, end })),
});

describe('lead-only lip-sync segments', () => {
  it('finds parenthesized backing words in the timing and merges neighbours', () => {
    const timing = {
      lines: [
        line('Trainiert auf euch (auf euch)', [
          ['Trainiert', 44.9, 45.1],
          ['auf', 45.1, 45.2],
          ['euch', 45.2, 45.4],
          ['(auf', 45.44, 45.7],
          ['euch)', 45.8, 46.08],
        ]),
        line('Ist das echt? (Nee!)', [
          ['Ist', 114.9, 115.0],
          ['das', 115.0, 115.1],
          ['echt?', 115.1, 115.4],
          ['(Nee!)', 115.54, 115.6],
        ]),
        line('Hallo, ich bin Alexis.', [['Hallo,', 3.7, 4.9]]),
      ],
    };
    expect(backingSpans(timing)).toEqual([
      { start: 45.44, end: 46.08 },
      { start: 115.54, end: 115.6 },
    ]);
  });

  it('parses --mute spans and rejects bad ones', () => {
    expect(parseMuteSpans('48.2-48.9, 50.1-50.6')).toEqual([
      { start: 48.2, end: 48.9 },
      { start: 50.1, end: 50.6 },
    ]);
    expect(parseMuteSpans(undefined)).toEqual([]);
    expect(() => parseMuteSpans('48.9-48.2')).toThrow(/ends before/);
    expect(() => parseMuteSpans('abc')).toThrow(/Invalid mute span/);
  });

  it('clips mutes to the segment, makes them relative, and merges close ones', () => {
    const spans = [
      { start: 10, end: 10.5 },
      { start: 10.55, end: 11 },
      { start: 12.8, end: 13.5 },
      { start: 20, end: 21 },
    ];
    expect(segmentMutes(spans, 9.5, 13)).toEqual([
      { start: 0.5, end: 1.5 },
      { start: 3.3, end: 3.5 },
    ]);
  });

  it('builds a volume filter with fades outside each span', () => {
    expect(muteFilter([])).toBeUndefined();
    expect(muteFilter([{ start: 1, end: 1.5 }, { start: 2, end: 2.2 }])).toBe(
      "volume='max(0,min(1,max((1-t)/0.04,(t-1.5)/0.04)))*max(0,min(1,max((2-t)/0.04,(t-2.2)/0.04)))':eval=frame",
    );
  });

  it('prefers the lead stem for a music video when one exists', () => {
    expect(segmentSource('music-video', {}, true)).toBe('audio/stems/lead.wav');
    expect(segmentSource('music-video', {}, false)).toBe('audio/stems/vocals.wav');
    expect(segmentSource('music-video', { source: 'audio/stems/vocals.wav' }, true)).toBe('audio/stems/vocals.wav');
  });
});
