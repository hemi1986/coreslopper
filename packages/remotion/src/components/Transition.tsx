import type { ResolvedShot } from '@coreslopper/core';
import type { ReactNode } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

export function Transition({ shot, children }: { shot: ResolvedShot; children: ReactNode }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const duration = shot.durationInFrames;
  const type = shot.transition.type;
  if (type === 'cut' || shot.transition.duration <= 0) {
    return <AbsoluteFill>{children}</AbsoluteFill>;
  }

  const transitionFrames = Math.max(1, Math.min(Math.round(shot.transition.duration * fps), Math.floor(duration / 2)));
  const fadeIn = interpolate(frame, [0, transitionFrames], [0, 1], clamp);
  const fadeOut = interpolate(frame, [duration - transitionFrames, duration], [1, 0], clamp);
  const opacity = Math.min(fadeIn, fadeOut);

  if (type === 'glitch') {
    const edge = Math.max(0, 1 - Math.min(fadeIn, fadeOut));
    const shift = Math.round(edge * 18);
    return (
      <AbsoluteFill style={{ opacity }}>
        <AbsoluteFill style={{ transform: `translateX(${shift}px)`, filter: `hue-rotate(${edge * 40}deg)` }}>
          {children}
        </AbsoluteFill>
        <AbsoluteFill style={{ transform: `translateX(${-shift}px)`, mixBlendMode: 'screen', opacity: edge * 0.6 }}>
          {children}
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
}
