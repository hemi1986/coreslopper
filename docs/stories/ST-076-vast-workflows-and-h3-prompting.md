---
id: ST-076
title: Ship the tagged MiniMax H3 workflows for vast, lip-sync included, and the H3 prompt guide
type: task
ui: false
priority: must
size: null
risk: null
depends_on: [ST-070]
labels: [feature:vast-gpu]
feature: vast-gpu
sources: [docs/research/vast-gpu-rental.md]
status: ready
---

## Task
Feature `vast-gpu`, decided by the user on 2026-11-28. Turn the template workflows ST-070 exported into what the
`vast` provider runs, and tell the media agents and the user how to use it.

- The MiniMax H3 workflows of vast's template, unchanged except for the `cs:` title tags (as `comfyui/README.md`
  describes for the Pika exports), in `comfyui/vast/`, classified in `scripts/runtime-files.mjs`.
- A lip-sync workflow `comfyui/vast/h3-ref2va-lipsync.json`: the template's reference-to-video graph plus `LoadAudio`
  (`cs:audio`), `TrimAudioDuration` (`cs:audio_start`, duration from `cs:duration`) and `MiniMaxH3AddGuide` at
  `frame_idx` 0 between the conditioning and the guider – ADR 0027's graph without the Pika LoRA, as ST-070 ran it
  (`docs/research/vast-minimax-h3/spike-h3-r2v-lipsync.json`, F15). The adapter routes it to `lipSync` and applies
  ADR 0027's checks (the guide present and at frame 0, the vocal not on `ref_audios`); without `durationSeconds` the
  clip takes the vocal segment's length.
- The `alternatives.vast` entries of the video roles in `config/models.yaml`, `video.lipsync` included, and a model lock for the template's
  MiniMax H3 files.
- The `ai-clips` skill: when `vast` is the video provider, how to prompt plain MiniMax H3 (the prompt form ST-070
  found), including a lip-sync prompt that names the sung or spoken words and their timing, and that Flex prompts are
  for the Pika workflows only.
- `.env.example`: the `VAST_*` settings with their defaults; `docs/providers.md` and `comfyui/README.md` describe the
  `vast` provider; `doctor` reports a missing `VAST_API_KEY` only for a workspace with a `vast` project.

## Acceptance Criteria
- [ ] `comfyui/vast/` holds one tagged API export per operation (text-, image-, first/last-frame-, reference-to-video, lip-sync) and the runtime build ships it
- [ ] Each export passes the adapter's tag and model-lock checks in a test with a mocked server
- [ ] `config/models.yaml` gives every video role an `alternatives.vast` entry at price 0, `video.lipsync` included
- [ ] A `lipSync` item of a project with `providers.lipsync: vast` runs the lip-sync workflow; the adapter rejects a graph without the guide at frame 0 or with the vocal on `ref_audios` (test with a mocked server)
- [ ] The `ai-clips` skill has the plain MiniMax H3 prompt section (loaded `writing-for-agents` first)
- [ ] `.env.example`, `docs/providers.md` and `comfyui/README.md` describe the `vast` provider and its settings
- [ ] `doctor` warns about a missing `VAST_API_KEY` in a workspace with a `vast` project, and says nothing otherwise
