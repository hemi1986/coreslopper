---
id: ST-074
title: The vast provider generates MiniMax H3 clips on the rented GPU
type: domain
context: BC-Generation
aggregate: AGG-CachedGeneration
command: CMD-RunGenerationBatch
ui: false
priority: must
size: null
risk: null
events: [EVT-GenerationBatchRefused, EVT-GenerationCompleted, EVT-GenerationReused, EVT-GenerationFailed, EVT-ClipRestored, EVT-GenerationFiled]
depends_on: [ST-071, ST-076]
labels: [feature:vast-gpu]
feature: vast-gpu
sources: [docs/research/vast-gpu-rental.md]
status: ready
---

## Story
As a user, I want a project whose video provider is `vast` to generate its clips with MiniMax H3 on the rented GPU,
so that I get MiniMax H3 clips while my own ComfyUI keeps every other workflow.

## Context
Feature `vast-gpu`, decided by the user on 2026-11-28 (ADR 0059 proposed, CMD-RunGenerationBatch rule on `vast`).

- **Two servers.** `providers.video: vast` sends the video roles to the GPU rental's ComfyUI; the user's own ComfyUI
  stays the `comfyui` provider for stills, audio, the restore pass and every local workflow. A project that does not
  name `vast` never talks to vast.ai.
- **Operations.** Text-, image-, first/last-frame- and reference-to-video on plain MiniMax H3 (no Pika LoRA), with the
  tagged workflows in `comfyui/vast/` (ST-076) as the roles' `alternatives.vast` models. Lip-sync stays on
  `providers.lipsync` (default the local `comfyui`) until ST-070 answers HS-269; a lip-sync story for `vast` follows
  only then.
- **Prompt.** A plain-text prompt; a Flex prompt is rejected before any call.
- **Access.** Every request carries the rental's access token; the server URL and token come from the GPU rental,
  never from `COMFYUI_URL`.
- **Cost.** A vast clip costs 0 per clip and is not billed to the project budget; the rental carries the cost
  (AGG-GpuRental invariant). The cache key includes the workflow file's hash, as for ComfyUI (ADR 0014).
- **No rental.** Without a ready rental the batch fails as a configuration error before anything is queued, with the
  hint to rent the GPU (G11 texts).
- The `/object_info` check of the model files and the model lock apply as for ComfyUI: a vast workflow may load only
  the MiniMax H3 files the template ships.

## Acceptance Criteria
Scenario: A reference-to-video clip runs on the rented GPU at no project cost
  Given a project with providers.video "vast", a ready GPU rental and a reference-to-video item with a plain-text prompt
  When the generation batch runs
  Then the clip is generated on the rental's ComfyUI with the rental's access token
  And the project's spend stays unchanged

Scenario: A Flex prompt is rejected on vast
  Given a project with providers.video "vast" and an item with a Flex prompt
  When the generation batch runs
  Then the batch is refused with "vast takes a plain-text prompt"
  And nothing is queued on the rental

Scenario: Without a ready rental nothing is queued
  Given a project with providers.video "vast" and no ready GPU rental
  When the generation batch runs
  Then the batch fails with "No vast GPU is ready. Rent one with gpu up or Rent GPU in the board."
  And the local ComfyUI is not asked

Scenario: Stills of a vast project stay on the local ComfyUI
  Given a project with providers.video "vast", providers.image "comfyui" and a keyframe item
  When the generation batch runs
  Then the keyframe is generated on the local ComfyUI server

## Out of Scope
- Lip-sync on `vast` (after ST-070, HS-269)
- Video or audio references for MiniMax H3 (the adapter does not wire them yet)
- Other vast.ai templates or models

## Open Questions
- none
