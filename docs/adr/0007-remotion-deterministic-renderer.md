# Remotion is the central renderer; determinism is enforced

**Status:** Accepted

## Context

Motion graphics, AI clips, and footage must share one song timeline and re-render identically for QA and cache validation.

## Decision

Remotion 4.x (React/TypeScript) renders every format. 3D uses `@remotion/three` (React Three Fiber). All animation is driven by `useCurrentFrame()` and `useVideoConfig()`; there is no `useFrame` clock/delta, no `Math.random`, no `Date.now`, and no time-based CSS animation. Randomness uses `random(seed)`. Postprocessing parameters are pure functions of the frame. Audio is normalized once and used as the master track. Formats are separate compositions (`16x9`, `9x16`, `1x1`).

## Consequences

- Frame-hash tests can prove determinism.
- Remotion is source-available, not OSI open source; users must comply with the Remotion License. This is documented in `docs/THIRD_PARTY.md`.
