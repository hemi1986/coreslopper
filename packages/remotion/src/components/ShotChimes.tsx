import type { ResolvedShot } from '@coreslopper/core';
import { Audio, Sequence, staticFile, useVideoConfig } from 'remotion';

/**
 * One sound cue of a shot: `src` (project audio file), `at` (seconds from the shot start),
 * `gainDb`, and optionally `from` (seconds into the file to start at) and `duration` (seconds it
 * plays at most), so a slice of a longer take works as a cue.
 */
export interface ShotChime {
  src: string;
  at: number;
  gainDb: number;
  from: number;
  duration?: number;
}

/** The valid `motion.props.chimes` entries of a shot. */
export function shotChimes(shot: Pick<ResolvedShot, 'motion'>): ShotChime[] {
  const value = shot.motion?.props?.chimes;
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const { src, at, gainDb, from, duration } = entry as Record<string, unknown>;
    if (typeof src !== 'string' || src.length === 0) return [];
    return [
      {
        src,
        at: typeof at === 'number' && at >= 0 ? at : 0,
        gainDb: typeof gainDb === 'number' ? gainDb : 0,
        from: typeof from === 'number' && from > 0 ? from : 0,
        duration: typeof duration === 'number' && duration > 0 ? duration : undefined,
      },
    ];
  });
}

/**
 * Per-shot one-shot sounds (`motion.props.chimes`: [{src, at, gainDb, from?, duration?}]), e.g. a
 * messenger chime on each incoming message or a slice of a typing take. Each cue is a Sequence
 * starting at its frame with an Audio inside, so it is frame-exact and plays in the Studio and in
 * unmuted renders. `npm run cli -- render` renders muted segments and mixes the same cues into the
 * soundtrack when it muxes the audio.
 */
export function ShotChimes({ shot }: { shot: ResolvedShot }) {
  const { fps } = useVideoConfig();
  const chimes = shotChimes(shot);
  if (chimes.length === 0) return null;
  return (
    <>
      {chimes.map((chime, index) => {
        const from = Math.round(chime.at * fps);
        if (from >= shot.durationInFrames) return null;
        const length = chime.duration !== undefined ? Math.max(1, Math.round(chime.duration * fps)) : undefined;
        return (
          <Sequence key={`chime-${index}`} from={from} durationInFrames={length} layout="none" name={`chime ${index + 1}`}>
            <Audio src={staticFile(chime.src)} trimBefore={chime.from > 0 ? Math.round(chime.from * fps) : undefined} volume={Math.pow(10, chime.gainDb / 20)} />
          </Sequence>
        );
      })}
    </>
  );
}
