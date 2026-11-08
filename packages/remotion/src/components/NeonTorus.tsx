import type { StyleBible } from '@coreslopper/core';
import { ThreeCanvas } from '@remotion/three';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

export function NeonTorus({
  style,
  energy,
  width,
  height,
}: {
  style: StyleBible;
  energy: number;
  width: number;
  height: number;
}) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const time = frame / fps;
  const spin = interpolate(frame, [0, Math.max(1, durationInFrames)], [0, Math.PI * 2.4]);
  const scale = 1 + energy * 0.16;
  const secondary = style.palette.secondary ?? '#05d9e8';
  const primary = style.palette.primary ?? '#ff2a6d';

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: `radial-gradient(circle at 50% 50%, ${primary}33 0%, transparent 62%), ${style.palette.background ?? '#050510'}`,
        overflow: 'hidden',
      }}
    >
      <ThreeCanvas
        width={width}
        height={height}
        camera={{ position: [0, 0, 6], fov: 42 }}
        gl={{ antialias: true, alpha: true }}
        style={{ position: 'absolute', inset: 0, background: 'transparent' }}
      >
        <ambientLight intensity={0.35} />
        <pointLight position={[4, 5, 6]} color={secondary} intensity={28} />
        <pointLight position={[-5, -2, 4]} color={primary} intensity={20} />
        <group rotation={[spin * 0.45, spin, Math.sin(time) * 0.2]} scale={scale}>
          <mesh>
            <torusGeometry args={[1.55, 0.42, 32, 120]} />
            <meshStandardMaterial
              color={secondary}
              emissive={primary}
              emissiveIntensity={1.4}
              metalness={0.7}
              roughness={0.22}
              wireframe
            />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[2.35, 0.035, 16, 120]} />
            <meshStandardMaterial color={primary} emissive={primary} emissiveIntensity={2} />
          </mesh>
        </group>
      </ThreeCanvas>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at center, transparent 38%, rgba(0,0,0,0.55) 100%)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
