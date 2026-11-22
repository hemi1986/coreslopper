import { describe, expect, it } from 'vitest';
import type { Timing } from '@coreslopper/core';
import { highlightedWords } from '../packages/core/src/index.ts';
import { displayLyric, lineForText } from '../packages/remotion/src/lib/timing.ts';

describe('lyric display', () => {
  it('drops Suno parentheses and keeps the sung words', () => {
    expect(displayLyric('My Machine (my machine)')).toBe('My Machine my machine');
    expect(displayLyric('(Oh) we run ( all night )')).toBe('Oh we run all night');
    expect(displayLyric('no backing vocal')).toBe('no backing vocal');
  });

  it('matches shot text to a timed line with or without the parentheses', () => {
    const timing = {
      lines: [{ id: 'l1', section: 'chorus_1', text: 'My Machine (my machine)', start: 1, end: 3, words: [] }],
    } as unknown as Timing;
    expect(lineForText(timing, 'chorus_1', 'My Machine (my machine)')?.id).toBe('l1');
    expect(lineForText(timing, 'chorus_1', 'my machine my machine')?.id).toBe('l1');
  });

  it('highlights a phrase of several words, and a single word wherever it stands', () => {
    const words = displayLyric('We burn the night, burn it down').split(' ');
    expect(highlightedWords(words, ['burn the night'])).toEqual([false, true, true, true, false, false, false]);
    expect(highlightedWords(words, ['Burn'])).toEqual([false, true, false, false, true, false, false]);
    expect(highlightedWords(words, ['the burn'])).toEqual(words.map(() => false));
  });
});
