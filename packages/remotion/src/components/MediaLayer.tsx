import type { StyleBible } from '@coreslopper/core';
import { Img, OffthreadVideo, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

const imageExtensions = new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif']);
const videoExtensions = new Set(['.mp4', '.webm', '.mov', '.mkv']);

function extensionOf(path: string): string {
  const clean = path.split('?')[0] ?? path;
  const dot = clean.lastIndexOf('.');
  return dot >= 0 ? clean.slice(dot).toLowerCase() : '';
}

export function MediaLayer({
  asset,
  style,
  width,
  height,
  description,
  focus,
}: {
  asset?: string;
  style: StyleBible;
  width: number;
  height: number;
  description: string;
  /** Focus point (0–1) kept in view when the format crops the media. */
  focus?: { x: number; y: number };
}) {
  const frame = useCurrentFrame();
  // Focus applies only to formats narrower than the 16:9 sources (9:16, 1:1,
  // 4:5). In the master nothing is cropped, and the zoom keeps its centre.
  const cropped = width / height < 1.7;
  const fx = cropped ? (focus?.x ?? 0.5) : 0.5;
  const fy = cropped ? (focus?.y ?? 0.5) : 0.5;
  const position = `${(fx * 100).toFixed(2)}% ${(fy * 100).toFixed(2)}%`;
  const { durationInFrames } = useVideoConfig();
  const zoom = interpolate(frame, [0, Math.max(1, durationInFrames)], [1.02, 1.09], {
    extrapolateRight: 'clamp',
  });

  if (!asset) {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(145deg, ${style.palette.surface}, ${style.palette.primary}55, ${style.palette.secondary}44)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: width * 0.08,
        }}
      >
        <div
          style={{
            color: style.palette.text,
            fontFamily: style.typography.mono?.family ?? 'JetBrains Mono',
            fontSize: Math.round(width * 0.022),
            textAlign: 'center',
            opacity: 0.8,
          }}
        >
          ASSET PENDING
          <br />
          {description}
        </div>
      </div>
    );
  }

  const extension = extensionOf(asset);
  const src = staticFile(asset);
  if (videoExtensions.has(extension)) {
    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: style.palette.background }}>
        <OffthreadVideo
          src={src}
          muted
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: position,
            transform: `scale(${zoom})`,
            transformOrigin: position,
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(120deg, ${style.palette.primary}22, transparent 55%, ${style.palette.secondary}22)`,
            mixBlendMode: 'screen',
          }}
        />
      </div>
    );
  }

  if (imageExtensions.has(extension)) {
    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: style.palette.background }}>
        <Img
          src={src}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: position,
            transform: `scale(${zoom})`,
            transformOrigin: position,
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(120deg, ${style.palette.primary}22, transparent 55%, ${style.palette.secondary}22)`,
            mixBlendMode: 'screen',
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: style.palette.surface,
        color: style.palette.text,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: style.typography.mono?.family ?? 'JetBrains Mono',
        fontSize: Math.round(width * 0.025),
      }}
    >
      Unsupported asset: {asset}
    </div>
  );
}
