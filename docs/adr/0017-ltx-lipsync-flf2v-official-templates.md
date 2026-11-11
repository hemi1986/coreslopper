# LTX FLF2V lip-sync and the official LTX templates

## Status

Accepted — 2026-11-11. Supersedes [ADR 0015](0015-comfyui-images-lipsync-audio.md).

## Context

ADR 0015 ran local image-to-video and lip-sync through one community graph, `LTX-2.5_T2V_I2V_Audio-V2` (`ltx-av`). One graph for two jobs needed switches (`cs_use_audio`), a silent placeholder upload when it ran without audio, a half-size latent (`size_scale: 0.5`), and an integer-seconds duration. Lip-sync could only anchor the start frame, so a line could drift away from the planned end pose, and clip lengths could run past the vocal line into the next word.

A dedicated graph now exists, `LTX2.5_FLF2V_Lipsync_SinglePass_HQ`: start frame, end frame, and driving audio in one pass. The official LTX 2.5 templates (T2V, I2V, FLF2V) cover everything else. All of them run the distilled model at CFG 1, where a negative prompt has no effect.

## Decision

- **One workflow per job.** Lip-sync uses `ltx25-lipsync-flf2v` (operation `lipSync`). Other clips use the official templates unchanged: `ltx-flf2v` when a movement has a fixed target and both keyframes exist, `ltx-i2v` with one keyframe, `ltx-t2v` only for atmosphere and establishing shots without a keyframe. `ltx-av` is dropped from the roles and docs, with no fallback.
- **Routing by tags.** A video workflow with `cs_audio` fits `lipSync` only; with `cs_end_image` it fits `firstLastFrameToVideo`; with `cs_start_image` `imageToVideo`; otherwise `textToVideo`. `cs_use_audio`, `size_scale`, `audio_offset`, and the silent placeholder upload are removed.
- **Lip-sync audio is cut in the workflow.** The batch item gives the vocal stem (`audio/stems/vocals.wav`), `audioStartSeconds` (`cs_audio_start`), and `durationSeconds`. The frame count rounds *down* to 8n+1, so the clip never outruns the line; segments end in a pause with about 0.3 s of silence, so only silence is dropped. `generate` rejects the full mix (`audio/song.*`) and says where the stem must live. With one keyframe, the start frame is also the end frame. A pre-cut segment (`audio-segment`) still works, and cloud lip-sync takes only that.
- **Resolution.** A new tag `cs_resolution` marks a `ResolutionSelector`; the adapter picks its aspect option from the output size and sets `megapixels` and `multiple`. The templates take width and height directly. All LTX roles use multiples of 64 and 0.8 MP for drafts; a project sets `megapixels: 1.9` for the final render.
- **No negative prompts for local video.** Batch items carry no negative prompt, and the lip-sync workflow's negative encoder is emptied. Prompts are short and state the wanted behaviour positively ("her mouth stays closed", "static camera"). The `ai-clips` skill holds the prompt templates and clip rules.
- **Carried over from ADR 0015 unchanged:** `providers.image`, `providers.lipsync`, and `providers.audio` accept `comfyui`; `generateAudio` for teasers, stingers, SFX, and speech, never the song; the `cs_output` class decides the output kind; `cs_references`, `cs_audio` as reference voice, `cs_lyrics`, `cs_transcript`, `megapixels`, `lyrics`, and `transcript`; spelled-out speech text. The repository still ships no graphs (ADR 0014); `comfyui/README.md` describes how to tag each workflow.

## Consequences

- A lip-sync shot can land on a planned end pose, and its clip ends inside the pause, never mid-word.
- The official templates generate their own sound; the edit discards it, and the song stays the only audio.
- Projects that set `ltx-av` or `size_scale`/`audio_offset` in `project.yaml` fail until they switch to the new workflows (`Unknown ComfyUI params`, or the lip-sync workflow fits only `lipSync`).
- The lip-sync workflow has no vocal separator; a project needs a vocal stem from the song session or from Demucs in `audio-analysis`.
- Final renders at 1.9 MP in a single pass (FLF2V, lip-sync) need more VRAM than drafts; render finals per shot.
