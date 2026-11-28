# MiniMax H3 workflows of vast.ai's template (ST-070)

Evidence for `docs/research/vast-gpu-rental.md` (F10–F15), not a shipped workflow. ST-076 tags and ships them.

## Template exports

Exported with **Export (API)** from the ComfyUI frontend of a rental of template
`6c54167e40e8ceed220393d585126a1c` (image `vastai/comfy:v0.44.0-cuda-13.2-py312`, ComfyUI 0.44.0, workflow templates
0.11.101) on 2026-11-28. The template provisions exactly these three files from
`Comfy-Org/workflow_templates` tag `v0.11.101`; it ships no separate first/last-frame workflow.

| File | Operations | Diffusion model | Size |
|---|---|---|---|
| `video_minimax_h3_t2v.json` | text-to-video (the FL2VA subgraph with no frame) | `minimax_h3_fl2va_pruned_int8_convrot.safetensors` | `ResolutionSelector` 16:9, 0.4 MP |
| `video_minimax_h3_i2v.json` | image-to-video; first/last frame through the subgraph's optional `last_frame` | `minimax_h3_fl2va_pruned_int8_convrot.safetensors` | `ImageScaleToTotalPixels` 0.9 MP of the first frame |
| `video_minimax_h3_r2v.json` | reference-to-video (2 images; slots for up to 3 images, a video, a video's audio, an audio) | `minimax_h3_ref2va_pruned_int8_convrot.safetensors` | `ResolutionSelector` 16:9, 0.4 MP |

The t2v and i2v exports keep the subgraph as `140:<id>` / `105:<id>` node IDs.

All three share:

- Text encoder `qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` (`CLIPLoader`, type `minimax`).
- VAEs `minimax_h3_video_vae_int8_convrot.safetensors` and `minimax_h3_audio_vae_fp32.safetensors`.
- `KSamplerSelect` `res_multistep`, `BasicScheduler` `simple`, 20 steps, denoise 1, `BasicGuider` (CFG-distilled).
- Length `max(5, round(a * 24)) + (5 - (max(5, round(a * 24)) % 17)) % 17` frames at 24 fps from a duration in seconds.
- A Lightning switch, off by default: `minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors` (8 steps) and
  `minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors` (4 steps). Both LoRAs are on the rental.

All model files are downloaded at boot from `huggingface.co/Comfy-Org/MiniMax-H3` (and `lightx2v/Minimax-h3-Turbo`);
the image holds none.

## Spike graph

`spike-h3-r2v-lipsync.json` is the graph the lip-sync test ran: the template's reference-to-video graph with the
Lightning switch resolved to off, `ResolutionSelector` at 0.9 MP, one reference, and `LoadAudio` (`cs:audio`),
`TrimAudioDuration` (`cs:audio_start`, duration from `cs:duration`) and `MiniMaxH3AddGuide` at `frame_idx` 0 between
the reference-to-video conditioning and the guider, as in ADR 0027, without the Pika LoRA. Built by hand from the
template files, not exported.
