import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { ensureFonts } from './fonts';
import { Grain } from './components/Grain';
import { ShotRenderer } from './components/ShotRenderer';
import type { VideoProps } from './types';

export function MusicVideo(props: VideoProps) {
  ensureFonts();

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
