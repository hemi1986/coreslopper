import { describe, expect, it } from 'vitest';
import { clipDurationSeconds, withoutDurationOptions } from '../packages/providers/src/index.ts';

describe('clipDurationSeconds', () => {
  it('lets the requested length win over the role default', () => {
    expect(clipDurationSeconds(3, { duration: 5 })).toBe(3);
  });

  it('rounds up to whole seconds', () => {
    expect(clipDurationSeconds(2.13, {})).toBe(3);
    expect(clipDurationSeconds(4, {})).toBe(4);
  });

  it('falls back to params.duration, then 5 s', () => {
    expect(clipDurationSeconds(undefined, { duration: 4 })).toBe(4);
    expect(clipDurationSeconds(undefined, {})).toBe(5);
    expect(clipDurationSeconds(undefined, undefined)).toBe(5);
  });

  it('raises short requests to min_duration', () => {
    expect(clipDurationSeconds(1.5, { min_duration: 3 })).toBe(3);
  });

  it('snaps to the next allowed length, capped at the longest', () => {
    expect(clipDurationSeconds(2, { durations: [5, 10] })).toBe(5);
    expect(clipDurationSeconds(6, { durations: [10, 5] })).toBe(10);
    expect(clipDurationSeconds(12, { durations: [5, 10] })).toBe(10);
    expect(clipDurationSeconds(5, { durations: [4, 6, 8] })).toBe(6);
  });
});

describe('withoutDurationOptions', () => {
  it('strips adapter-only duration options', () => {
    expect(withoutDurationOptions({ duration: 5, min_duration: 3, durations: [5], sound: 'off' })).toEqual({
      duration: 5,
      sound: 'off',
    });
  });
});
