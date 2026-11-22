# ComfyUI projects lip-sync locally by default

## Status

Proposed — 2026-11-22. Supersedes the lip-sync default of [ADR 0014](0014-comfyui-local-video.md) and
[ADR 0015](0015-comfyui-images-lipsync-audio.md) ("when `video` is `comfyui` and `lipsync` is unset, lip-sync falls
back to `fal`"). Their other decisions, and those carried over into [ADR 0017](0017-ltx-lipsync-flf2v-official-templates.md),
stay. The Topview default of [ADR 0026](0026-cloud-lipsync-and-lead-only-audio.md) stays.

## Context

ADR 0014 sent lip-sync to fal.ai when clips render in ComfyUI, because there was no local lip-sync path; ADR 0015
kept the fallback once one existed, because local lip-sync was slower. Since ADR 0027, local Pika H3 lip-sync is the
first local choice in the `ai-clips` skill and in `config/models.yaml`. The fallback stayed in `providerForRole`:
a fully local project lip-synced on paid fal.ai without saying so. `new`, `new-series`, and the board wizard never
wrote `providers.lipsync`, so nothing in `project.yaml` showed it.

## Decision

- **`comfyui` video means `comfyui` lip-sync.** Without `providers.lipsync`, lip-sync runs on the video provider;
  only `topview` still falls back to `fal`, because Avatar 4 needs its separate OpenAPI credentials.
  `defaultLipSyncProvider` in core holds the rule. An explicit `providers.lipsync` wins, as before.
- **New projects say it.** `new`, `new-series`, and the board wizard write `providers.lipsync` explicitly: the
  resolved default, or the provider the user chose (`--lipsync-provider` on `new` and `new-series`). An episode copies
  it with the other providers from its `series.yaml`.

## Consequences

- A fully local project lip-syncs at $0 on the local Pika H3 workflow; a lip-sync clip takes minutes, not seconds
  (ADR 0027).
- An existing ComfyUI project without `providers.lipsync` moves its lip-sync from fal.ai to ComfyUI on the next
  `generate`. To keep fal.ai, set `providers.lipsync: fal`. Lip-sync clips already in the cache stay valid; only new
  ones change provider.
- A ComfyUI project needs a lip-sync workflow in `comfyui/workflows/` (`pika-h3-ref2va-lipsync` or the LTX fallback)
  for its singing shots; a missing workflow is a hard stop before anything is queued, as for any other role
  (ADR 0014).
