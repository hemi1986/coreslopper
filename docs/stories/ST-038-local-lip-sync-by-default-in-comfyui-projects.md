---
id: ST-038
title: ComfyUI projects lip-sync locally by default
type: task
ui: false
priority: must
size: null
risk: null
depends_on: []
labels: [feature:local-lipsync]
status: done
---

## Task
`providerForRole` (`packages/core/src/models.ts`) sends `video.lipsync` to fal whenever `providers.video` is
`comfyui` and `providers.lipsync` is not set ("local lip-sync is slower", ADR 0014/0015). Since the Pika H3
lip-sync workflow, the `ai-clips` skill and `config/models.yaml` call local Pika the first local lip-sync choice. So
a fully local project, like the "100 % lokal" teaser in the workspace, routes lip-sync to paid fal without saying
so. `new-series` and the wizard never write `providers.lipsync`, and episodes copy providers from `series.yaml`
without it.

Decided by the user (2026-11-22): `comfyui` video means `comfyui` lip-sync. Topview stays on fal, because its
Avatar 4 needs separate OpenAPI credentials.

## Acceptance Criteria
- [x] A new ADR (`proposed`) records the new default and supersedes the lip-sync part of ADR 0014/0015; the accepted ADRs stay unedited
- [x] `providerForRole(…, 'video.lipsync')` returns `comfyui` for `providers.video: comfyui` without `providers.lipsync`; Topview still returns `fal`; an explicit `providers.lipsync` still wins
- [x] `new`, `new-series` and the board wizard write `providers.lipsync` explicitly (the resolved default unless the user chose one); an episode copies `providers.lipsync` from its `series.yaml`
- [x] `docs/pipeline.md`, `docs/architecture.md`, `docs/providers.md`, the `new-video` skill and the README state the new default
- [x] Tests cover the routing and the written provider; `npm test` and `npm run typecheck` are green

## Out of Scope
- Changing the lip-sync provider of existing projects: they keep fal until the user sets `providers.lipsync: comfyui`
