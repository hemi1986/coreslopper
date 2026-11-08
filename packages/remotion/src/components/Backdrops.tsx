import type { StyleBible } from '@coreslopper/core';
import { Easing, interpolate, random, useCurrentFrame, useVideoConfig } from 'remotion';
import { seedFromString } from '../lib/timing';

interface BackdropProps {
  shotId: string;
  style: StyleBible;
  energy: number;
  beatProgress: number;
  downbeat: boolean;
  width: number;
  height: number;
}

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

export function ParticleField({ shotId, style, energy, width, height }: BackdropProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const time = frame / fps;
  const seed = seedFromString(shotId);
  const particles = Array.from({ length: 42 }, (_, index) => {
    const local = seed + index * 17;
    const x = random(local) * width;
    const baseY = random(local + 1) * height;
    const speed = 18 + random(local + 2) * 55;
    const span = height + 120;
    const y = (((baseY - time * speed) % span) + span) % span - 60;
    const size = 1 + random(local + 3) * 3.4;
    const opacity = (0.18 + random(local + 4) * 0.5) * (0.65 + energy * 0.7);
    const color = random(local + 5) > 0.72 ? style.palette.secondary : style.palette.primary;
    return (
      <div
        key={index}
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: size,
          height: size,
          borderRadius: 999,
          backgroundColor: color,
          opacity,
          boxShadow: `0 0 ${size * 4}px ${color}`,
        }}
      />
    );
  });
  return <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>{particles}</div>;
}

export function Grid({ style, energy, beatProgress, width, height }: BackdropProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const time = frame / fps;
  const size = Math.max(42, Math.round(width / 26));
  const offset = (time * (26 + energy * 42)) % size;
  return (
    <div
      style={{
        position: 'absolute',
        inset: '-18%',
        backgroundImage: `linear-gradient(${style.palette.secondary}2e 1px, transparent 1px), linear-gradient(90deg, ${style.palette.secondary}2e 1px, transparent 1px)`,
        backgroundSize: `${size}px ${size}px`,
        backgroundPosition: `0 ${offset}px`,
        transform: 'perspective(700px) rotateX(58deg) scale(1.35)',
        transformOrigin: '50% 80%',
        opacity: 0.4 + energy * 0.35,
        maskImage: 'linear-gradient(to bottom, transparent 4%, black 38%, black 82%, transparent)',
        WebkitMaskImage: 'linear-gradient(to bottom, transparent 4%, black 38%, black 82%, transparent)',
      }}
    />
  );
}

export function Scanlines({ width, height }: { width: number; height: number }) {
  const frame = useCurrentFrame();
  const spacing = Math.max(3, Math.round(height / 220));
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `repeating-linear-gradient(to bottom, rgba(0,0,0,0.32) 0px, rgba(0,0,0,0.32) 1px, transparent 1px, transparent ${spacing}px)`,
        opacity: 0.22,
        mixBlendMode: 'overlay',
        transform: `translateY(${frame % spacing}px)`,
        pointerEvents: 'none',
      }}
    />
  );
}

export function TitleCard({ shotId, style, energy, beatProgress, downbeat, width, height }: BackdropProps) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const push = interpolate(frame, [0, durationInFrames], [1.02, 1.1], { ...clamp, easing: Easing.out(Easing.quad) });
  const pulse = 0.5 + energy * 0.35 + (downbeat ? (1 - beatProgress) * 0.12 : 0);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: style.palette.background }}>
      <div
        style={{
          position: 'absolute',
          inset: '-20%',
          background: `radial-gradient(circle at 50% 42%, ${style.palette.primary}55 0%, transparent 46%), radial-gradient(circle at 72% 64%, ${style.palette.secondary}44 0%, transparent 40%), linear-gradient(160deg, ${style.palette.background} 0%, ${style.palette.surface} 55%, ${style.palette.background} 100%)`,
          transform: `scale(${push})`,
          opacity: 0.95,
        }}
      />
      <Grid
        shotId={shotId}
        style={style}
        energy={energy}
        beatProgress={beatProgress}
        downbeat={downbeat}
        width={width}
        height={height}
      />
      <ParticleField
        shotId={shotId}
        style={style}
        energy={energy}
        beatProgress={beatProgress}
        downbeat={downbeat}
        width={width}
        height={height}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: height * 0.34,
          background: `linear-gradient(to top, ${style.palette.background} 0%, transparent 100%)`,
          opacity: 0.82,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          boxShadow: `inset 0 0 ${Math.round(width * 0.12)}px ${style.palette.primary}${Math.round(pulse * 90)
            .toString(16)
            .padStart(2, '0')}`,
          pointerEvents: 'none',
        }}
      />
      <Scanlines width={width} height={height} />
    </div>
  );
}

export function LyricCard({ shotId, style, energy, beatProgress, downbeat, width, height }: BackdropProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const time = frame / fps;
  const orbit = interpolate(frame, [0, durationInFrames], [0, Math.PI * 2], clamp);
  const x = 50 + Math.cos(orbit) * 18;
  const y = 46 + Math.sin(orbit * 0.8) * 12;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: style.palette.background }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(150deg, ${style.palette.surface} 0%, ${style.palette.background} 58%, ${style.palette.primary}22 100%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: `${x}%`,
          top: `${y}%`,
          width: width * 0.7,
          height: width * 0.7,
          transform: 'translate(-50%, -50%)',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${style.palette.secondary}55 0%, transparent 62%)`,
          opacity: 0.5 + energy * 0.3,
          filter: 'blur(8px)',
        }}
      />
      <Grid
        shotId={shotId}
        style={style}
        energy={energy * 0.6}
        beatProgress={beatProgress}
        downbeat={downbeat}
        width={width}
        height={height}
      />
      <ParticleField
        shotId={shotId}
        style={style}
        energy={energy * 0.7}
        beatProgress={beatProgress}
        downbeat={downbeat}
        width={width}
        height={height}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(to top, ${style.palette.background}cc 0%, transparent 46%)`,
        }}
      />
      <Scanlines width={width} height={height} />
    </div>
  );
}

export function GlitchBackdrop({ style, width, height, energy }: BackdropProps) {
  const frame = useCurrentFrame();
  const shift = Math.round(Math.sin(frame * 0.6) * (2 + energy * 8));
  return (
    <div style={{ position: 'absolute', inset: 0, background: style.palette.background, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: '-10%',
          background: `linear-gradient(120deg, ${style.palette.primary}33, transparent 40%, ${style.palette.secondary}33)`,
          transform: `translateX(${shift}px)`,
        }}
      />
      <Scanlines width={width} height={height} />
    </div>
  );
}
