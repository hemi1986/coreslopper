import type { ResolvedShot, StyleBible, Timing } from '@coreslopper/core';
import type { ReactNode } from 'react';
import { AbsoluteFill } from 'remotion';
import { GlitchBackdrop, Grid, LyricCard, ParticleField, Scanlines, TitleCard } from './Backdrops';
import { MediaLayer } from './MediaLayer';
import { NeonTorus } from './NeonTorus';
import { TextOverlay } from './TextOverlay';
import { Transition } from './Transition';
import { useBeat, useEnergy } from '../hooks/useTiming';

interface ShotRendererProps {
  shot: ResolvedShot;
  timing: Timing;
  style: StyleBible;
  width: number;
  height: number;
}

function MotionLayer({
  name,
  shot,
  style,
  energy,
  beatProgress,
  downbeat,
  width,
  height,
}: {
  name: string;
  shot: ResolvedShot;
  style: StyleBible;
  energy: number;
  beatProgress: number;
  downbeat: boolean;
  width: number;
  height: number;
}) {
  const props = {
    shotId: shot.id,
    style,
    energy,
    beatProgress,
    downbeat,
    width,
    height,
  };
  switch (name) {
    case 'LyricCard':
      return <LyricCard {...props} />;
    case 'GlitchBackdrop':
      return <GlitchBackdrop {...props} />;
    case 'ParticleField':
      return <ParticleField {...props} />;
    case 'Grid':
      return <Grid {...props} />;
    case 'Scanlines':
      return <Scanlines width={width} height={height} />;
    case 'NeonTorus':
      return <NeonTorus style={style} energy={energy} width={width} height={height} />;
    case 'TitleCard':
    default:
      return <TitleCard {...props} />;
  }
}

export function ShotRenderer({ shot, timing, style, width, height }: ShotRendererProps) {
  const energy = useEnergy(timing, shot.startSeconds);
  const beat = useBeat(timing, shot.startSeconds);
  const isTitleSection = ['intro', 'outro'].some((name) => shot.section.includes(name));
  const variant = shot.source === 'motion' && isTitleSection ? 'title' : 'lyric';

  const layers: ReactNode[] = [];
  if (shot.source === 'motion') {
    layers.push(
      <MotionLayer
        key="motion"
        name={shot.motion?.component ?? 'TitleCard'}
        shot={shot}
        style={style}
        energy={energy}
        beatProgress={beat.progress}
        downbeat={beat.downbeat}
        width={width}
        height={height}
      />,
    );
  } else if (shot.source === 'mixed' && shot.layers) {
    const ordered = [...shot.layers].sort((a, b) => a.zIndex - b.zIndex);
    for (const [index, layer] of ordered.entries()) {
      if (layer.type === 'motion') {
        layers.push(
          <MotionLayer
            key={`layer-${index}`}
            name={layer.component ?? 'Grid'}
            shot={shot}
            style={style}
            energy={energy}
            beatProgress={beat.progress}
            downbeat={beat.downbeat}
            width={width}
            height={height}
          />,
        );
      } else {
        layers.push(
          <MediaLayer
            key={`layer-${index}`}
            asset={layer.asset}
            style={style}
            width={width}
            height={height}
            description={shot.description}
          />,
        );
      }
    }
  } else {
    layers.push(
      <MediaLayer
        key="media"
        asset={shot.asset}
        style={style}
        width={width}
        height={height}
        description={shot.description}
      />,
    );
  }

  return (
    <Transition shot={shot}>
      <AbsoluteFill style={{ backgroundColor: style.palette.background }}>
        {layers}
        {shot.text ? (
          <TextOverlay
            text={shot.text}
            highlights={shot.highlights}
            section={shot.section}
            timing={timing}
            shotStartSeconds={shot.startSeconds}
            shotEndSeconds={shot.endSeconds}
            style={style}
            width={width}
            height={height}
            variant={variant}
          />
        ) : null}
      </AbsoluteFill>
    </Transition>
  );
}
