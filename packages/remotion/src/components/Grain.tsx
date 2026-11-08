import { useCurrentFrame } from 'remotion';

const noiseSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch"/></filter><rect width="220" height="220" filter="url(#n)" opacity="0.55"/></svg>`;

export function Grain({ opacity = 0.08 }: { opacity?: number }) {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(noiseSvg)}")`,
        backgroundRepeat: 'repeat',
        opacity,
        mixBlendMode: 'overlay',
        transform: `translate(${frame % 7}px, ${(frame * 3) % 11}px)`,
        pointerEvents: 'none',
      }}
    />
  );
}
