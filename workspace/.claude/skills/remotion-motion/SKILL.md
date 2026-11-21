---
name: remotion-motion
description: Use when building or changing motion-graphics shots in Remotion, adding typography components, timing hooks, effects, 3D layers, or deterministic animation.
license: MIT
---

# Remotion Motion

## When to use

- A storyboard shot uses `source: motion`.
- The user wants a title card, lyric treatment, transition, effect, or 3D layer.
- A motion component must react to beats, downbeats, onsets, energy, sections, or word timings.

## Inputs

- `storyboard.yaml`, `style.yaml`, `timing.effective.json`
- `packages/remotion/src/components/`
- `packages/remotion/src/lib/timing.ts`
- `docs/glossary.md`

## Process

1. Read the shot, its section, text, highlights, and style references. Decide whether it needs a new component or an existing one.
2. Build in `packages/remotion/src/components/` and register the component in the `MotionLayer` switch in `ShotRenderer.tsx` so the storyboard can select it by name.
3. Follow the determinism rules:
   - Animate from `useCurrentFrame()` and `useVideoConfig()`.
   - Use `interpolate`, `spring`, `Easing`, and `random(seed)`.
   - Never use `useFrame` as a clock, `Math.random`, `Date.now`, or time-based CSS animation.
   - Postprocessing and 3D rotation are pure functions of the frame.
4. Use style tokens, not hard-coded colors or fonts. Use the timing helpers for beat/energy reactions.
5. Verify with `npm run cli -- render projects/<slug> --still <frame>` at the important moments and check the composition at 16:9, 9:16, and 1:1.
6. Run `npm run typecheck` and the relevant tests.
7. Record any new component in the storyboard documentation and, if it is reusable, in the Remotion package README.

## Completion criteria

- The component renders at the target resolution and does not clip text.
- The relevant shot renders deterministically; two stills of the same frame are identical.
- The style bible colors and fonts are used.
- No wall-clock, `Math.random`, or `useFrame` clock is used.
- Typecheck and tests pass.

## Common failures

- Animating with CSS transitions that depend on wall time.
- Using a random seed that changes per render.
- Building a title card that only works at 16:9.
- Hard-coding a color that should come from `style.yaml`.
- Forgetting to register the component in `MotionLayer`.
