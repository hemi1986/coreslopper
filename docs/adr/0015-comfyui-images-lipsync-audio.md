# ComfyUI for stills, lip-sync, and audio

## Status

Accepted — 2026-11-10. Extends [ADR 0014](0014-comfyui-local-video.md).

## Context

ADR 0014 limited the `comfyui` provider to video clips because stills and lip-sync had no local path. Local workflows now exist for all of them: Qwen Image 2.1 (text-to-image, multi-reference edit, background removal), an LTX 2.5 graph that lip-syncs a start frame to custom audio and also runs as plain image-to-video, and MiniMax Music 3 and Stable Audio 3 for audio.

## Decision

- `providers.image` and `providers.lipsync` accept `comfyui`. A new optional `providers.audio` (`comfyui` or `mock`, default `comfyui`) selects the provider for `audio.*` roles. When `video` is `comfyui` and `lipsync` is unset, lip-sync still falls back to `fal`, so existing projects keep their behavior.
- A new operation, `generateAudio`, is optional on `Provider`; only ComfyUI and the mock implement it. It is for teasers, stingers, and SFX, never for the song a video is made for.
- The class of the `cs_output` node decides the output kind (image, audio, or video). Kind plus input tags decide the operations a workflow fits; one workflow can fit several (`ltx-av`: `imageToVideo` and `lipSync`).
- New title tags: `cs_references` (autogrow reference input; the adapter adds `LoadImage` nodes), `cs_audio`, `cs_use_audio`, `cs_audio_start`, `cs_duration` (seconds instead of frames), and `cs_lyrics`. New params: `size_scale`, `megapixels`, `audio_offset`, `lyrics`.
- A workflow with `cs_audio` that runs without lip-sync gets a silent placeholder upload, because ComfyUI validates every node, including switched-off branches.
- The repository still ships no graphs (ADR 0014). `comfyui/README.md` lists the tested workflows, the file names `config/models.yaml` expects, and how each was tagged.

## Consequences

- A project can run fully locally: stills, clips, and lip-sync at $0.
- A local lip-sync clip's length comes from its vocal segment (`generate` passes the probed length as `durationSeconds`). Cloud lip-sync requests are unchanged, so their cache keys stay valid.
- Workflow quality is the user's responsibility. Background removal can fail on dark, low-contrast images, and lip-sync clips are limited by VRAM (about 10 s on 16 GB).
