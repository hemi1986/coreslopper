---
id: ST-076
title: Ship the tagged MiniMax H3 workflows for vast and the H3 prompt guide
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
- The `alternatives.vast` entries of the video roles in `config/models.yaml` and a model lock for the template's
  MiniMax H3 files.
- The `ai-clips` skill: when `vast` is the video provider, how to prompt plain MiniMax H3 (the prompt form ST-070
  found), and that Flex prompts are for the Pika workflows only.
- `.env.example`: the `VAST_*` settings with their defaults; `docs/providers.md` and `comfyui/README.md` describe the
  `vast` provider; `doctor` reports a missing `VAST_API_KEY` only for a workspace with a `vast` project.

## Acceptance Criteria
- [ ] `comfyui/vast/` holds one tagged API export per operation (text-, image-, first/last-frame-, reference-to-video) and the runtime build ships it
- [ ] Each export passes the adapter's tag and model-lock checks in a test with a mocked server
- [ ] `config/models.yaml` gives every video role an `alternatives.vast` entry at price 0
- [ ] The `ai-clips` skill has the plain MiniMax H3 prompt section (loaded `writing-for-agents` first)
- [ ] `.env.example`, `docs/providers.md` and `comfyui/README.md` describe the `vast` provider and its settings
- [ ] `doctor` warns about a missing `VAST_API_KEY` in a workspace with a `vast` project, and says nothing otherwise
