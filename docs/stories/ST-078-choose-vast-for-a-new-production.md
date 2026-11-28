---
id: ST-078
title: Choose MiniMax H3 on vast.ai when creating a production
type: task
ui: true
priority: should
size: null
risk: null
depends_on: [ST-074]
labels: [feature:vast-gpu]
feature: vast-gpu
sources: [docs/research/vast-gpu-rental.md]
status: ready
---

## Task
Feature `vast-gpu`, decided by the user on 2026-11-28 (Q16). A new production can use the `vast` provider without
editing `project.yaml` by hand.

- The board wizard's provider step offers "Video: MiniMax H3 on vast.ai" beside the existing choices; `new` and
  `new-series` accept `--video-provider vast`. An episode copies it from its `series.yaml` like the other providers.
- Choosing `vast` writes `providers.video: vast` and `providers.lipsync` explicitly: the local `comfyui` unless the
  user picks another (ADR 0053 writes lip-sync explicitly).
- An existing project switches by editing `providers.video` in `project.yaml`; there is no button for it.

## Acceptance Criteria
- [ ] The wizard offers "Video: MiniMax H3 on vast.ai" and the new project's `project.yaml` has `providers.video: vast` and `providers.lipsync: comfyui`
- [ ] `new --video-provider vast` and `new-series --video-provider vast` write the same
- [ ] An episode of a `vast` series gets `providers.video: vast`
