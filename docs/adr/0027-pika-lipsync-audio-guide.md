---
status: accepted
date: 2026-11-20
---

# Local lip-sync on Pika H3 with an anchored vocal

## Status

Accepted — 2026-11-20. Changes the local lip-sync workflow of [ADR 0017](0017-ltx-lipsync-flf2v-official-templates.md); LTX lip-sync stays as a fallback.

## Context

Pika H3 Flex Ref2VA (MiniMax H3 reference-to-video plus the Pika LoRA) is the local default for every clip without lip-sync, because it keeps identity, framing, and a static camera better than LTX. Its adapter rejected audio: as a reference audio (`ref_audios`) a vocal only steers the voice, and the subject's identity drifts.

MiniMax H3 has a second way in: `MiniMaxH3AddGuide` anchors an image, a clip, or audio at a frame of the generated video. With the vocal anchored from frame 0, the soundtrack is fixed and the picture is generated to it. A test on shot-022 of a music-video project (one keyframe, a 5.5 s lead-only segment, German vocals) kept face, hair, outfit, set, and framing, and the mouth followed the vocal with natural head motion. The user judged it clearly better than the LTX lip-sync and wants it as the first local choice.

## Decision

- **Workflow.** `pika-h3-ref2va-lipsync` is `pika-h3-ref2va` plus `LoadAudio` (`cs:audio`), `TrimAudioDuration` (`cs:audio_start`, its duration linked to `cs:duration`), and a `MiniMaxH3AddGuide` at `frame_idx` 0 between the reference-to-video conditioning and the guider. The adapter rejects a Pika lip-sync graph without that guide, with the guide off frame 0, or with the vocal on `ref_audios`. Sampler, sigmas, LoRA, and models are locked as for Ref2VA.
- **Routing.** A Ref2VA graph with `cs:audio` fits `lipSync`; references are wired into `cs:ref_<n>` as in Ref2VA (1–4, up to 9), the keyframe first.
- **Default.** The `comfyui` alternative of `video.lipsync` is `pika-h3-ref2va-lipsync`. LTX lip-sync runs with `params.workflow: ltx25-lipsync-flf2v`; the role keeps the LTX params for that fallback, which the Pika graph ignores.
- **Prompt and length.** A Pika lip-sync item takes a `flex` prompt like `referenceToVideo`, checked against its references; LTX and cloud lip-sync reject `flex`. Without `durationSeconds` the clip takes the length of the vocal segment; the graph rounds up to 17n+5 frames at 24 fps, so the clip may run a few silent frames past the vocal.

## Consequences

- Local lip-sync shots share the look and identity behaviour of the other Pika clips.
- A Pika lip-sync clip takes minutes (about 4.5 min for 5.5 s) where LTX took under a minute; batch lip-sync shots small.
- Workspaces need the new workflow export in `comfyui/workflows/`; `comfyui/README.md` describes the three added nodes.
- Cloud lip-sync (OmniHuman, Speak, Avatar 4) is unchanged.
