import { describe, expect, it } from 'vitest';
import type { ResolvedShot } from '@coreslopper/core';
import { soundCueMix, soundCues } from '../packages/cli/src/render.ts';
import { truePeakLimiter } from '../packages/cli/src/media.ts';
import { shotChimes } from '../packages/remotion/src/components/ShotChimes.tsx';

const shot = (id: string, startFrame: number, durationInFrames: number, chimes?: unknown): ResolvedShot =>
  ({
    id,
    startFrame,
    durationInFrames,
    startSeconds: startFrame / 30,
    endSeconds: (startFrame + durationInFrames) / 30,
    motion: { component: 'Black', props: chimes === undefined ? {} : { chimes } },
  }) as unknown as ResolvedShot;

describe('per-shot sound cues (motion.props.chimes)', () => {
  const shots = [
    shot('a', 0, 90, [{ src: 'projects/x/audio/lines/ping.wav', at: 1.5, gainDb: -4 }]),
    shot('b', 90, 60, [{ src: 'projects/x/audio/lines/ping.wav', at: 0 }, { at: 1 }, 'junk']),
    shot('c', 150, 30),
  ];

  it('reads valid chimes of a shot', () => {
    expect(shotChimes(shots[1]!)).toEqual([{ src: 'projects/x/audio/lines/ping.wav', at: 0, gainDb: 0, from: 0 }]);
    expect(shotChimes(shots[2]!)).toEqual([]);
  });

  it('places cues on the render timeline and clips them at the shot end', () => {
    const cues = soundCues(shots, 30, 0, 179);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({ delay: 1.5, skip: 0, gainDb: -4 });
    expect(cues[0]!.maxSeconds).toBeCloseTo(1.5);
    expect(cues[1]).toMatchObject({ delay: 3, skip: 0, gainDb: 0 });
    expect(cues[1]!.maxSeconds).toBeCloseTo(2);
  });

  it('shifts and trims cues for a partial frame range', () => {
    const cues = soundCues(shots, 30, 60, 179);
    expect(cues[0]).toMatchObject({ delay: 0 });
    expect(cues[0]!.skip).toBeCloseTo(0.5);
    expect(cues[0]!.maxSeconds).toBeCloseTo(1);
    expect(soundCues(shots, 30, 150, 179)).toEqual([]);
  });

  it('builds one amix over the song', () => {
    const mix = soundCueMix(soundCues(shots, 30, 0, 179), '/root');
    expect(mix.inputs).toEqual(['-i', '/root/projects/x/audio/lines/ping.wav', '-i', '/root/projects/x/audio/lines/ping.wav']);
    expect(mix.filter).toContain('[2:a]atrim=start=0.0000:duration=1.5000');
    expect(mix.filter).toContain('volume=-4.00dB,adelay=1500:all=1[cue0]');
    expect(mix.filter).toContain('[song][cue0][cue1]amix=inputs=3:duration=first:dropout_transition=0:normalize=0,aresample=192000,alimiter=');
    expect(mix.filter.endsWith(',aresample=48000[aout]')).toBe(true);
  });

  it('ends the cue mix in a true-peak limiter below the target', () => {
    // -1 dBTP target, 1 dB AAC headroom -> -2 dBFS on the 4x oversampled signal.
    expect(truePeakLimiter(-1)).toContain('alimiter=limit=0.7943:');
    expect(truePeakLimiter(-1)).toContain('level=disabled');
    expect(truePeakLimiter(-1)).toContain('latency=enabled');
    expect(soundCueMix(soundCues(shots, 30, 0, 179), '/root', 2, -2).filter).toContain('alimiter=limit=0.7079:');
  });

  it('plays a slice of a longer take with from and duration', () => {
    const sliced = [shot('d', 0, 90, [{ src: 'projects/x/audio/lines/typing.wav', at: 1, gainDb: -6, from: 0.3, duration: 0.4 }])];
    expect(shotChimes(sliced[0]!)).toEqual([{ src: 'projects/x/audio/lines/typing.wav', at: 1, gainDb: -6, from: 0.3, duration: 0.4 }]);
    const [cue] = soundCues(sliced, 30, 0, 89);
    expect(cue).toMatchObject({ delay: 1, gainDb: -6 });
    expect(cue!.skip).toBeCloseTo(0.3);
    expect(cue!.maxSeconds).toBeCloseTo(0.4);
    const [late] = soundCues(sliced, 30, 36, 89);
    expect(late!.delay).toBe(0);
    expect(late!.skip).toBeCloseTo(0.5);
    expect(late!.maxSeconds).toBeCloseTo(0.2);
  });
});
