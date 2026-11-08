import type { Timing } from '@coreslopper/core';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { beatAt, energyAt, sectionAt } from '../lib/timing';

/**
 * Reusable timing hooks. Pass the shot's start offset so a hook used inside a
 * <Sequence> still reads the song's global time.
 */
export function useTime(offsetSeconds = 0): number {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return offsetSeconds + frame / fps;
}

export function useBeat(timing: Timing, offsetSeconds = 0) {
  return beatAt(timing, useTime(offsetSeconds));
}

export function useEnergy(timing: Timing, offsetSeconds = 0): number {
  return energyAt(timing, useTime(offsetSeconds));
}

export function useSection(timing: Timing, offsetSeconds = 0) {
  return sectionAt(timing, useTime(offsetSeconds));
}

export function useDownbeat(timing: Timing, offsetSeconds = 0) {
  const beat = useBeat(timing, offsetSeconds);
  return { downbeat: beat.downbeat, progress: beat.progress, index: beat.index };
}

export function useOnset(timing: Timing, offsetSeconds = 0) {
  const time = useTime(offsetSeconds);
  let index = -1;
  for (let i = 0; i < timing.onsets.length; i += 1) {
    if (timing.onsets[i]! <= time) index = i;
    else break;
  }
  const current = index >= 0 ? timing.onsets[index]! : 0;
  const next = timing.onsets[index + 1] ?? current + 0.5;
  const progress = next > current ? Math.max(0, Math.min(1, (time - current) / (next - current))) : 0;
  return { index, progress };
}

export function useWordTiming(
  word: { start: number; end: number },
  offsetSeconds = 0,
) {
  const time = useTime(offsetSeconds);
  const active = time >= word.start && time <= word.end;
  const span = Math.max(0.001, word.end - word.start);
  return {
    active,
    progress: Math.max(0, Math.min(1, (time - word.start) / span)),
  };
}
