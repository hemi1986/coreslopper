import { withResolvedPalette } from '@coreslopper/core/browser';
import { useMemo } from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { ensureFonts } from './fonts';
import { Grain } from './components/Grain';
import { ShotRenderer } from './components/ShotRenderer';
import { Subtitles } from './components/Subtitles';
import type { VideoProps } from './types';

export function MusicVideo(input: VideoProps) {
  ensureFonts(input.fonts);
  // Map style.yaml palettes without the standard role names (roles: or name hints).
  const style = useMemo(() => withResolvedPalette(input.style), [input.style]);
  const props = { ...input, style };

  return (
    <AbsoluteFill style={{ backgroundColor: props.style.palette.background }}>
      {props.audioSrc ? <Audio src={staticFile(props.audioSrc)} /> : null}
      {props.shots.map((shot) => (
        <Sequence
          key={shot.id}
          name={shot.id}
          from={shot.startFrame}
          durationInFrames={Math.max(1, shot.durationInFrames)}
        >
          <ShotRenderer
            shot={shot}
            timing={props.timing}
            style={props.style}
            width={props.width}
            height={props.height}
            chat={props.chat}
          />
        </Sequence>
      ))}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 52%, rgba(0,0,0,0.38) 100%)',
          pointerEvents: 'none',
        }}
      />
      <Grain opacity={props.style.motion.grain} />
      {props.subtitles?.length ? (
        <Subtitles cues={props.subtitles} style={props.style} width={props.width} height={props.height} />
      ) : null}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: Math.round(props.height * 0.035),
            background: `linear-gradient(to right, transparent, ${props.style.palette.primary}55, transparent)`,
            opacity: 0.35,
          }}
        />
      </div>
    </AbsoluteFill>
  );
}
