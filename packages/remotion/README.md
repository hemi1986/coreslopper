# Remotion Renderer

The central renderer for coreslopper. It receives a serializable `VideoProps` object from the CLI and renders one `MusicVideo` composition per format.

## Composition

- `src/Root.tsx` registers `MusicVideo`.
- `src/MusicVideo.tsx` maps every resolved shot to a `<Sequence>` and renders the audio, vignette, and grain.
- `src/components/ShotRenderer.tsx` chooses motion backdrops, media layers, mixed layers, and text overlays.
- `src/components/TextOverlay.tsx` animates lyric words and highlights.
- `src/components/Backdrops.tsx` contains the grid, particles, title card, lyric card, and glitch backdrop.
- `src/components/NeonTorus.tsx` is the `@remotion/three` 3D layer.
- `src/components/Grain.tsx` adds deterministic film grain.
- `src/lib/timing.ts` contains pure beat, energy, and lyric-line helpers.

## Determinism rules

- Animate from `useCurrentFrame()` and `useVideoConfig()`.
- Use `interpolate`, `spring`, `Easing`, and `random(seed)`.
- Never use `useFrame` as a clock, `Math.random`, `Date.now`, or time-based CSS animation.
- Make postprocessing and 3D rotation pure functions of the frame.
- Use the song as the only audio source; mute generated clips and footage.

## Adding a component

1. Create the component in `src/components/`.
2. Register its name in the `MotionLayer` switch in `ShotRenderer.tsx`.
3. Set `motion.component` in `storyboard.yaml`.
4. Render a still at a representative frame and check 16:9, 9:16, and 1:1.
5. Run `npm run typecheck` and `npm test`.

## Rendering

From the repository root:

```bash
npm run cli -- render projects/<slug> --format 16x9
npm run cli -- render projects/<slug> --format 9x16
npm run cli -- render projects/<slug> --format 1x1
npm run cli -- render projects/<slug> --still 130 --still-scale 0.5
```

The CLI resolves the project, bundles this package with the repository as `publicDir`, and calls `renderMedia` or `renderStill`. Projects with 3D components use software GL and concurrency 1 automatically.

## Fonts

The example brand uses local OFL fonts in `brand/example/fonts/`. `src/fonts.ts` loads them through `@remotion/fonts`; Remotion waits for the font files before rendering.
