# ComfyUI as a local video backend

## Status

Accepted — 2026-11-09. Extends [ADR 0011](0011-higgsfield-provider.md).

## Context

Clips are the most expensive part of an AI music video. Users with a capable GPU can render LTX clips locally in ComfyUI at no cost per clip. ComfyUI has no model slugs: a generation is a node graph, and every model family wires its graph differently. Stills and lip-sync work well in the cloud and have no comparable local path in this workflow yet.

## Decision

- Add a `comfyui` provider for video only. `providers.video` accepts `comfyui`; `providers.image` and `providers.lipsync` do not. When `video` is `comfyui` and `lipsync` is unset, lip-sync falls back to `fal`.
- A model is a workflow exported with Export (API) into `comfyui/workflows/<name>.json`. Roles reference it in `alternatives.comfyui.model`. Local runs need no pricing and cost $0.
- The adapter finds the nodes it fills by title tags (`cs_prompt`, `cs_start_image`, `cs_end_image`, `cs_seed`, `cs_width`, `cs_height`, `cs_frames`, `cs_fps`, `cs_output`). One node can carry several tags. Tags survive re-export, need no sidecar file, and keep the workflow runnable in ComfyUI. Placeholders in JSON and sidecar mapping files were rejected for those reasons.
- Two operations are added to every adapter: `textToVideo` and `firstLastFrameToVideo` (start frame, then end frame). The workflow's image tags decide which operation it fits; a mismatched batch item fails before anything is queued. Cloud adapters support the end frame through the adapter-only `end_reference_field` param.
- The workflow file's SHA-256 is part of the cache key (`Provider.fingerprint`).
- A role without an alternative for the selected provider no longer inherits the base provider's params and price; only the project override applies.

## Consequences

- One project can mix cloud stills, local clips, and cloud lip-sync.
- Users own their workflows. The repository ships no LTX graph, because node names change between LTX and ComfyUI releases; `doctor` validates whatever is in the folder.
- Local clips take minutes and depend on VRAM. `COMFYUI_TIMEOUT_MS` bounds the wait.
- An unreachable server or a missing workflow is a hard stop, like missing credentials.
