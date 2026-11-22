# ComfyUI workflows

Put ComfyUI workflow exports here to generate locally instead of on fal.ai or Higgsfield: stills, image edits, video clips, lip-sync, and audio. A local run costs $0 against the project budget.

## Tested workflows

The repository ships no graphs: node names change between ComfyUI and model releases, and you own your workflows. `config/models.yaml` expects these file names; put a tagged export under each name, or point the role at your own file.

| File | Operations | Default roles | Built from |
|---|---|---|---|
| `qwen-t2i.json` | `generateImage` | `image.keyframe`, `image.keyframe.budget` (comfyui alternative) | ComfyUI template *Qwen Image 2.1 Turbo t2i* |
| `qwen-edit.json` | `editImage` (up to 16 references) | `image.edit`, `image.character_sheet` (comfyui alternative) | Template *Qwen Image 2.1 Turbo image edit* |
| `qwen-bg-remove.json` | `editImage` | `image.background_removal` | Template *Qwen Image 2.1 background removal*; outputs a transparent PNG |
| `pika-h3-ref2va-lipsync.json` | `lipSync` (1–4 reference images, up to 9) | `video.lipsync` (comfyui alternative, the first local choice) | `pika-h3-ref2va.json` plus the vocal anchored as the soundtrack from frame 0; tagging below |
| `ltx25-lipsync-flf2v.json` | `lipSync` | none; pick per item with `params.workflow` (LTX fallback) | The community graph *LTX2.5_FLF2V_Lipsync_SinglePass_HQ*: start + end frame + vocal stem, one pass |
| `ltx-i2v.json` | `imageToVideo` | `video.image_to_video.*`, `video.premium.veo` (comfyui alternative) | LTX 2.5 official image-to-video template |
| `ltx-t2v.json` | `textToVideo` | `video.text_to_video` | LTX 2.5 official text-to-video template |
| `ltx-flf2v.json` | `firstLastFrameToVideo` | `video.first_last_frame` | LTX 2.5 official first/last-frame template |
| `qwen-t2i-quality.json`, `qwen-edit-quality.json` | `generateImage`, `editImage` | none; pick per item with `params.workflow` | Templates *Qwen Image 2.1 t2i* and *image edit* (non-turbo): `KSampler`, 40 steps |
| `ltx-i2v-quality.json`, `ltx-t2v-quality.json`, `ltx-flf2v-quality.json`, `ltx25-lipsync-flf2v-quality.json` | as their base workflow | none; pick per item with `params.workflow` | The same graphs with the int8 UNet (`…-comfy-int8-convrot`) and the full video VAE (`ltx-2.5-video-vae-bf16`) instead of nvfp4 and the conv VAE |
| `pika-h3-ref2va.json` | `referenceToVideo` (1–4 reference images, up to 9) | `video.reference_to_video` | Template *Pika H3 Flex Ref2VA* (MiniMax H3 reference-to-video + Pika LoRA); rules below |
| `pika-h3-flf2va.json` | `firstLastFrameToVideo`, `imageToVideo` (end frame optional) | none; pick per item with `params.workflow: "pika-h3-flf2va"` | Template *Pika H3 Flex FL2VA* (MiniMax H3 first/last-frame + Pika LoRA); rules below |
| `wan22-i2v.json` | `imageToVideo` | `video.wan`, picked per item with `params.video_model: "wan"` | Template *Wan2.2 14B I2V* plus a RIFE VFI node (×3) before the save |
| `seedvr2-upscale.json` | `upscaleVideo` | `video.upscale`, runs after a clip with `params.quality: "final"` | Template *Video Upscale: SeedVR2 3B Int8* |
| `music-minimax.json` | `generateAudio` | `audio.music` | Template *MiniMax Music 3* |
| `music-ace.json` | `generateAudio` | (set `models.audio.music.model: music-ace`) | Template *ACE-Step 1.5 XL Turbo* |
| `voxcpm-clone.json` | `generateAudio` (reference voice + transcript) | `audio.voice` | A VoxCPM2 voice-cloning graph (ComfyUI-VoxCPM nodes); default for all speech |
| `voxcpm-design.json` | `generateAudio` | `audio.voice_design` | A VoxCPM2 TTS graph; voice from a description |
| `audio-stable.json` | `generateAudio` | `audio.sfx` | Template *Stable Audio 3 Medium* |

How they were tagged:

- **Qwen t2i and edit:** the templates write the prompt as a literal into an If/Else switch and into the prompt-enhancer node. Add a `PrimitiveStringMultiline` titled `cs_prompt` and connect it to both. Tag the Qwen text encoder `cs_negative` (edit: `cs_negative cs_references`), the `RandomNoise` `cs_seed`, and the save node `cs_output`. In t2i, delete the resolution selector, give `EmptyLatentImage` literal sizes, and title it `cs_width cs_height`. In edit, tag the `LoadImage` `cs_start_image`.
- **Qwen background removal:** `LoadImage` `cs_start_image`, the text encoder `cs_prompt cs_negative`, the `KSampler` `cs_seed`, the save node `cs_output`.
- **LTX official templates (t2v, i2v, flf2v):** the prompt primitive `cs_prompt`, the width/height primitives `cs_width`/`cs_height` (full output size; i2v and t2v halve it for the latent and upscale ×2), the duration primitive `cs_frames` with its math node set to `a` so the value is the frame count, the frame-rate primitive `cs_fps`, every `RandomNoise` `cs_seed`, the `LoadImage` nodes `cs_start_image`/`cs_end_image`, the save node `cs_output`. Leave the prompt enhancer off. The templates also generate sound, which the edit discards.
- **LTX FLF2V lip-sync** (`LTX2.5_FLF2V_Lipsync_SinglePass_HQ`): `LoadImage` first/last frame `cs_start_image`/`cs_end_image`, `LoadAudio` `cs_audio`, the `ResolutionSelector` `cs_resolution` (multiple 64), the duration primitive `cs_frames` with its math node changed from `a * b + 1` to `a`, the frame-rate primitive `cs_fps`, `RandomNoise` `cs_seed`, the prompt primitive `cs_prompt`, `TrimAudioDuration` `cs_audio_start` (its duration stays linked to frames / fps), the save node `cs_output`. Empty the negative text encoder: the model is distilled and runs at CFG 1, so a negative prompt has no effect.
- **Quality variants:** the LTX and lip-sync `-quality` files are the tagged base graphs with only the UNet and VAE loaders swapped. The Qwen `-quality` files are tagged like their turbo versions; the tags sit on the `KSampler` (`cs_seed`) instead of `RandomNoise`, the edit's If/Else latent switch is off so `references[0]` sets the output size, and the template's second example `LoadImage` and its compare node are removed.
- **Wan 2.2 I2V:** `LoadImage` `cs_start_image`, the positive and negative `CLIPTextEncode` `cs_prompt`/`cs_negative`, `WanImageToVideo` `cs_width cs_height`, the duration and FPS float primitives `cs_duration`/`cs_fps`, the boolean *Enable 4steps LoRA?* `cs_turbo`, the high-noise `KSamplerAdvanced` (the one with `add_noise: enable`) `cs_seed`, the save node `cs_output`. The graph computes `floor(duration × 16 + 1)` frames; `WanImageToVideo` uses 4n+1 of them, so the adapter (`frame_step: 4`) writes a duration that lands on 4n+1 and covers the shot. RIFE interpolates ×3 and the `CreateVideo` before the save writes 48 fps, so a 24 fps edit takes every second frame. The output has no audio.
- **Pika H3 Flex Ref2VA:** exported with colon tags: the prompt primitive `cs:prompt`, the `ResolutionSelector` `cs:aspect` (an alias of `cs_resolution`), the duration float `cs:duration`, `RandomNoise` `cs:seed`, the reference `LoadImage` nodes `cs:ref_0`, `cs:ref_1`, the save node `cs:output`. All of them are required: a workflow without one stops with a `ConfigError`, so no template value (example image, seed, aspect, length) leaks into a clip. Extra references are added as `LoadImage` copies with the ID `ref_<n>` and the title `cs:ref_<n>`. Fixed in code: sampler `lcm`, the seven manual sigmas, exactly one LoRA at 1.0 (no Turbo/Lightning LoRA on top). Fixed in config: the model files each variant may load, per loader input, in `comfyui_locks` of `config/models.yaml` (`pika-h3-ref2va`, `pika-h3-fl2va`); to switch a model, e.g. to an NVFP4 UNet, add its file name there. The adapter rejects a graph that breaks either, and `node_inputs` may only address `cs:` tags.
- **Pika H3 Flex FL2VA** (`pika-h3-flf2va.json`): derived from the official Comfy template *Pika H3 Flex FL2VA* (a UI export with a subgraph, flattened to API format; a workspace keeps the UI export as `comfyui/sources/video_pika_h3_flex_fl2va.json`). The tests use a copy in `tests/fixtures/pika-h3-flf2va.json`. Two changes against the template: the tags below, and the canvas size. The template sizes the canvas to the first frame's full size in multiples of 32 (`round(a/32)*32`); this export scales it to about 0.98 MP in multiples of 32 (`round(a * sqrt(980000 / (a * b)) / 32) * 32`), so the canvas keeps the keyframe's aspect and fits 16 GB. Required tags (a missing one is a `ConfigError`): the `LoadImage` nodes `cs:start_image` (first frame, Picture 1) and `cs:end_image` (last frame, Picture 2), the prompt primitive `cs:prompt` (new; the template typed the prompt into the `MiniMaxH3ImageToVideo` node), the duration float `cs:duration`, `RandomNoise` `cs:seed`, the save node `cs:output`. A user export with other tag names (e.g. `cs:first_frame`/`cs:last_frame`) is not compatible; tag it as above. There is no size tag, so `width`, `height`, `megapixels`, and `size_multiple` have no effect. Fixed part and model locks as in Ref2VA. With one keyframe (`imageToVideo`) the adapter removes `cs:end_image` and the `last_frame` input.
- **Pika H3 Flex lip-sync:** start from the tagged `pika-h3-ref2va.json` and add three nodes: `LoadAudio` titled `cs:audio`, `TrimAudioDuration` titled `cs:audio_start` (its `audio` from the `LoadAudio`, its `duration` linked to the `cs:duration` float), and `MiniMaxH3AddGuide` with `positive` and `latent` from the `MiniMaxH3ReferenceToVideo` node, the audio VAE, `frame_idx` 0, and the trimmed audio. Its `positive` output replaces the conditioning of the `BasicGuider`. Do not connect the vocal to `ref_audios` of the reference node: an audio reference only steers the voice and breaks identity, while the guide anchors the soundtrack so the face is generated to it. The adapter rejects a graph without the guide at frame 0 in front of the guider. Sampler, sigmas, LoRA, and models are the Ref2VA ones (`comfyui_locks.pika-h3-ref2va`).
- **SeedVR2:** `LoadVideo` `cs_video`, `Resize Image/Mask` `cs_scale` (`resize_type.multiplier`), `Post-Process SeedVR2 Output` `cs_color_correction`, the boolean *Split Latent* `cs_split`, the `KSampler` `cs_seed`, the save node `cs_output`. Denoise, sampler, and scheduler stay as in the template. The graph needs no prompt.
- **MiniMax Music 3:** the text encoder `cs_prompt cs_lyrics cs_duration`, the seed node `cs_seed`, the audio save node `cs_output`.
- **ACE-Step 1.5:** the `TextEncodeAceStepAudio1.5` node `cs_prompt cs_lyrics cs_duration` (prompt goes into `tags`), the `EmptyAceStep1.5LatentAudio` node `cs_duration`, the seed `PrimitiveInt` `cs_seed`, the audio save node `cs_output`.
- **VoxCPM clone:** the `VoxCPM_TTS` node `cs_prompt cs_seed`, the `LoadAudio` with the reference voice `cs_audio`, the `VoxCPM_VoiceCloning` node `cs_transcript`, the save node `cs_output`. Design: the same without `cs_audio` and `cs_transcript`.
- **Stable Audio 3:** the user-description primitive `cs_prompt`, the negative encoder `cs_negative`, the duration primitive `cs_duration`, the `KSampler` `cs_seed`, the audio save node `cs_output`.

Notes from test runs on a 16 GB GPU:

- `qwen-t2i` and `qwen-edit` take about 10–20 s per image. Put the image to edit first (`references[0]` sets the output size), then the other references.
- The `-quality` workflows are slower but cleaner (measured 2026-11-17): `qwen-t2i-quality` about 17 s for 1 MP, `qwen-edit-quality` about 25–30 s (turbo 10–15 s) with visibly more natural textures, `ltx-i2v-quality` about 40 s for a 2 s clip at 0.8 MP including model load. Use them for character references, face close-ups, hero keyframes, clip start frames, and final clip renders; keep the turbo/nvfp4 workflows for drafts and background stills. The 8-step sigma override (`node_inputs` on `459:502`/`459:484`) does not apply to the Qwen quality graphs; set `"459:458.steps"` there instead.
- **Local clip options** (batch item `params`, ComfyUI only; cloud providers ignore them):
  - `video_model`: `ltx` (default) or `wan`. Wan is image-to-video only, makes no sound, and never lip-syncs; a lip-sync or first/last-frame item with `wan` is rejected. Character names and ids in a Wan prompt are replaced by their `characters.yaml` description.
  - `quality`: `draft` (default) or `final`. LTX draft keeps the role's 0.8 MP; LTX final renders at the master size in multiples of 64 (1920×1088). Wan follows the start frame's aspect: draft 832×480, final 1280×720 (swapped for 9:16), multiples of 16; `turbo` (default `true`) switches the 4-step Lightning LoRAs, and `turbo: false` runs 20 steps at CFG 3.5, very slow on 16 GB.
  - `seedvr2`: after a `final` clip, `restore` (default, scale 1), `upscale` (LTX renders at half size, 960×576 for 1920×1080, and SeedVR2 scales ×2; Wan scales its 720p ×1.5), or `off` for a shot that looks oversharpened. `color_correction`: `lab` (default) or `wavelet`.
  - The SeedVR2 result lands next to the clip as `<clip>_upscaled.mp4`, with the clip's audio stream copied back (`-c copy`), so lip-sync clips keep their sound. The original is never overwritten. It uses the clip's seed and runs through the same cache and manifest. On an out-of-memory error it retries once with `split_latent: true`, then stops.
  - `generate` logs `video_model`, `quality`, turbo, size, seed, the SeedVR2 mode, and `color_correction` per item; `--dry-run` shows the same.
- Before queueing, the adapter checks every model file a workflow loads (`unet_name`, `vae_name`, `clip_name`, `lora_name`, `ckpt_name`) against `GET /object_info` and stops with a list of the missing files.
- `pika-h3-ref2va` took 87 s for a 2.3 s clip (56 frames, 1344×768) with two references, including model load (measured 2026-11-19). The graph rounds the duration up to 17n+5 frames at 24 fps and keeps its sound (SFX, dialogue, ambience). References are identity anchors, not a start frame: `references[0]` is `<Picture 1>` in the prompt. The prompt follows the Flex schema: six sections in this order, `subject_definitions` / `summary` / `retention_analysis` / `detailed_description` / `overall_soundscape` / `non_diegetic_music`; retention labels `fully_preserved`, `attribute_transfer`, `weak_reference`; `detailed_description` in `[Shot N]` blocks with time marks ("at about 1.5 seconds …"); reference images named `<Picture N>` in wiring order. The template's own prompt is a good example; `generate` renders a batch item's `flex` object into it and checks a raw prompt. `non_diegetic_music` is always `none - No music, no score, no melody of any kind.`: the score comes in post-production, and music that plays inside the scene goes in `overall_soundscape`. The aspect follows the project's master format (16:9 or 9:16). Audio references are rejected (they break identity); MiniMax H3 also takes up to 3 video and 3 audio references, which the adapter does not wire yet.
- `pika-h3-flf2va` took about 98 s (image-to-video, including the switch from the Ref2VA model) and 108 s (first/last frame) of ComfyUI execution for a 3 s 9:16 clip (73 frames, 736×1312 from a 928×1632 keyframe), measured 2026-11-20 on 16 GB with no out-of-memory error. The first frame matches the keyframe (PSNR about 30 dB, only grain and codec loss), and with the same image as end frame the clip returns to it.
- **Length of a Pika clip** (both variants): the adapter writes the item's `durationSeconds` into `cs:duration` as is (required; `frame_step`, `size_multiple`, and `megapixels` of the role are ignored), and the graph renders `round(seconds × 24)` frames, at least 5, rounded up to 17n+5 (`pikaFrames` in `packages/core/src/flex.ts`): 3 s → 73 frames, 4.4 s → 107, 5 s → 124, 8 s → 192.
- **FL2VA prompt schema** (`packages/core/src/fl2va.ts`), not the Ref2VA Flex schema; `generate` and the adapter reject a prompt that mixes them, in both directions. First the alignment line, then three sections, each header with its text on the same line: `integrated_multimodal_description:` (`[Shot N]` blocks; "The shot begins exactly on Picture 1 …"; time marks where something happens), `overall_soundscape:` (SFX, dialogue, ambience, and music that plays inside the scene), `non_diegetic_music: none - No music, no score, no melody of any kind.` Keyframes are `Picture 1` and `Picture 2`, without angle brackets. The alignment line is `How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot N) aligns with the <frames/24, two decimals>-second mark of the target video.` (5 s → `5.17`); without an end frame it ends after the Picture 1 part, and Picture 2 may not appear anywhere. `generate` writes the line itself: give a structured `fl2va` object (`style`, `shots`, `soundscape`), or a plain `prompt` that starts with `integrated_multimodal_description:`; a prompt that already has an alignment line must have the right marks. The graph stretches the first frame to the canvas and cover-crops the end frame, so `generate` stops when the two frames differ in aspect by more than 1 %.
- `pika-h3-ref2va-lipsync` took about 4.5 min for a 5.5 s line (141 frames, 1344×768) with one keyframe and a lead-only segment, including model load (measured 2026-11-20). Identity, set, and framing held, and the mouth followed the vocal with natural head motion. The prompt is a Flex prompt like Ref2VA: the sung words in quotes in the `[Shot 1]` block, "her lips follow the anchored vocal", `overall_soundscape` "Only her lead vocal, as anchored", and the usual `non_diegetic_music` none line. The clip rounds up to 17n+5 frames, so it can run a few frames past the vocal; that tail is silent.
- `qwen-bg-remove` works on a clear subject. On dark, low-contrast scenes it can return a fully transparent image, so generate cutouts on a plain background.
- `ltx25-lipsync-flf2v` (the LTX lip-sync fallback, `params.workflow: "ltx25-lipsync-flf2v"`) takes about 48 s for a 4.7 s clip at 0.8 MP, `ltx-i2v` about 31 s for 4 s, `ltx-flf2v` about 45 s for 5 s. The lip-sync graph cuts the vocal stem itself: `audio` is `audio/stems/vocals.wav`, `audioStartSeconds` the line's start, `durationSeconds` the line plus about 0.3 s of the following pause. Frames round down to 8n+1, so the clip never outruns the audio and only that silent tail is dropped. The graph has no vocal separator; `generate` rejects the full mix. With one keyframe, the adapter uploads it as start and end frame.
- LTX prompts are short and concrete and say what should happen ("her mouth stays closed", "static camera"). Drafts render at 0.8 MP, finals at 1.9 MP (`megapixels`), in multiples of 64.
- `generateAudio` is for teasers, stingers, SFX, and voice-overs. It never replaces the song a video is made for.
- `music-ace` makes 30 s in about 11 s. Set `bpm`, `keyscale`, `language`, or `timesignature` with `node_inputs`, e.g. `{"cs_prompt.bpm": 110, "cs_prompt.language": "de"}`.
- `voxcpm-clone` takes about 10 s per sentence. Give the reference WAV as the batch item's `audio` and its exact words as `params.transcript`. Use the VoxCPM2 model, not 0.5B; the language follows the text.
- Write every number, year, time, abbreviation, and symbol out in words before TTS, e.g. in German "2077" → "zweitausendsiebenundsiebzig", "23:15" → "dreiundzwanzig Uhr fünfzehn", "z. B." → "zum Beispiel". `generate` rejects `audio.voice*` prompts with digits, symbols, or common abbreviations.
- Generate long texts one sentence or paragraph at a time and join them; short sections are more stable. On a slip or wrong stress, try up to 3 seeds. In a test, one seed dropped the first two words and two others were correct.
- `voxcpm-design` invents a voice: put the description in brackets right before the text, `(deep, calm male voice)Text`. Use it only to find a voice, then keep a good take as the reference WAV for `voxcpm-clone`.

## Select the backend

In `projects/<slug>/project.yaml`:

```yaml
providers:
  image: comfyui      # qwen stills and edits
  video: comfyui      # LTX clips
  lipsync: comfyui    # LTX FLF2V lip-sync; defaults to fal when video is comfyui
  # audio: comfyui    # audio.* roles; comfyui is the default
```

A single batch can also run on ComfyUI with `npm run cli -- generate <project> --batch <file> --provider comfyui` (lip-sync keeps its own provider). Run `npm run cli -- doctor` first. It shows whether ComfyUI is reachable and which operations each workflow fits.

## Add a workflow

1. Build and test the workflow in ComfyUI.
2. Give the nodes the adapter must fill a title tag (right-click a node > Title). The table below lists the tags.
3. Save the workflow with **Workflow > Export (API)**, not the normal Save, and put it in `workflows/`. The file name is the `model` in `config/models.yaml` (`alternatives.comfyui.model`, or the role's `model` when its provider is `comfyui`).

## Title tags

| Tag | Node to tag | Input set |
|---|---|---|
| `cs_prompt` | Positive text node (`CLIPTextEncode`, a string primitive, a music caption, a TTS node) | `text` / `prompt` / `caption` / `tags` / `value`. **Required.** |
| `cs_negative` | Negative text node | `negative_prompt` / `text` / `value` |
| `cs_start_image` | `LoadImage` for the start frame or the image to edit | `image` (uploaded by the adapter) |
| `cs_end_image` | `LoadImage` for the end frame (FLF2V; lip-sync gets the start frame again when there is only one) | `image` |
| `cs_references` | A node with an autogrow image input (Qwen `images.image_N`) | The adapter adds a `LoadImage` per extra reference and links it to the next free slot |
| `cs_audio` | `LoadAudio` for the driving vocals, or the reference voice in a voice-clone workflow | `audio` (uploaded by the adapter) |
| `cs_transcript` | Voice-clone node with the reference transcript | `prompt_text` / `transcript` / `reference_text`, set to the `transcript` param (required) |
| `cs_resolution` (alias `cs_aspect`) | `ResolutionSelector` | `aspect_ratio` from the output size, plus `megapixels` and `multiple` when those params are set |
| `cs_ref_0` … `cs_ref_<n>` | `LoadImage` per reference image of a reference-to-video graph, linked to numbered slots (`ref_images.ref_image_N`) | `image` (uploaded by the adapter). Slots are filled in order; missing ones are added and linked to the next slot of the node `cs_ref_0` feeds, extra ones are removed with their links |
| `cs_audio_start` | `TrimAudioDuration` | `start_index`, set to the batch item's `audioStartSeconds` (default 0) |
| `cs_seed` | Sampler, `RandomNoise`, or a seed node | `seed` / `noise_seed` |
| `cs_width`, `cs_height` | Latent or size node | `width`, `height` |
| `cs_frames` | Latent or image-to-video node | `length` / `frames` / `num_frames` |
| `cs_duration` | A seconds input | `seconds` / `duration` / `max_duration` / `value` |
| `cs_fps` | Frame-rate node | `frame_rate` / `fps` / `value` |
| `cs_lyrics` | Music text encoder | `lyrics`, set to the `lyrics` param (empty when unset, so demo lyrics never leak) |
| `cs_video` | `LoadVideo` for the clip to restore or upscale | `file` (uploaded by the adapter) |
| `cs_scale` | Resize node | `resize_type.multiplier`, set to the `scale` param |
| `cs_color_correction` | SeedVR2 post-processing | `color_correction_method`, set to the `color_correction` param |
| `cs_split` | Boolean primitive that splits the latent into temporal chunks | `value`, set to the `split_latent` param |
| `cs_turbo` | Boolean primitive that switches a fast-sampling LoRA | `value`, set to the `turbo` param |
| `cs_output` | The save node | `filename_prefix` is set to `coreslopper/<workflow>/<request hash>`. Only its outputs are downloaded. Its class decides the output kind: `Save…Image` = image, `Save…Audio` = audio, anything else = video. |

Tags may be written `cs_prompt` or `cs:prompt`; both are the same tag. A node can carry several tags separated by spaces, for example `cs_width cs_height cs_frames` on an LTX latent node. Tag the node that holds the value. If the input is connected to another node, tag that source node instead.

A video workflow needs `cs_frames` or `cs_duration` when a batch item has `durationSeconds`. With `frame_step` set, a `cs_duration` value is chosen so that a workflow computing `1 + floor(fps × s / 8) × 8` frames still covers the shot.

The output kind and the input tags decide which operations a workflow fits:

| Output | Input tags | Operations |
|---|---|---|
| image | none | `generateImage` |
| image | `cs_start_image` | `editImage` |
| audio | none, or `cs_audio` (+ `cs_transcript`) as reference voice | `generateAudio` |
| video | none | `textToVideo` |
| video | `cs_start_image` | `imageToVideo` |
| video | `cs_start_image`, `cs_end_image` | `firstLastFrameToVideo` |
| video | `cs_start_image`, `cs_audio` (+ `cs_end_image`) | `lipSync` |
| video | `cs_video` | `upscaleVideo` (no prompt needed) |
| video | `cs_ref_0` (…`cs_ref_<n>`) | `referenceToVideo` |

A batch item for another operation is rejected before anything is queued.

## Adapter params

Set these under `params` in `config/models.yaml`, or in a project override (`models.<role>.params` in `project.yaml`):

| Param | Meaning |
|---|---|
| `fps` | Frame rate the workflow renders at. Default 24. It is written to `cs_fps` only when you set it. |
| `frame_step` | Rounds frame counts up to `step × n + 1`. LTX needs 8. |
| `size_multiple` | Rounds width and height to a multiple. The LTX roles use 64. |
| `megapixels` | Scales the target size to this many megapixels, keeping the aspect. LTX: 0.8 for drafts, 1.9 for final renders. |
| `width`, `height` | Override the project's master size, e.g. render at 1280×704 for drafts. |
| `lyrics` | Lyrics for `cs_lyrics` (music workflows). |
| `transcript` | Exact text of the reference voice for `cs_transcript` (voice clone). |
| `workflow` | Run this item on another workflow file, e.g. `"workflow": "ltx-i2v-quality"`. Applies only when the item runs on ComfyUI; on a cloud provider it is dropped and the role's model is used. Works per batch item or as `models.<role>.params.workflow` in `project.yaml`. |
| `scale`, `color_correction`, `split_latent` | SeedVR2: resize multiplier, color transfer method, temporal chunking. Set by `generate` from the clip options. |
| `turbo` | Boolean for `cs_turbo`, e.g. Wan's 4-step LoRAs. |
| `max_references` | Reference-to-video: images allowed per item. Default 4, hard limit 9. |
| `node_inputs` | Set any other value: `{"cs_sampler.steps": 30, "12.cfg": 3.5}`. Keys are `<node title tag or node id>.<input>`. |

Any other param is an error, so typos do not pass silently.

## Server

The adapter talks to `COMFYUI_URL` (default `http://127.0.0.1:8188`). Under WSL, a ComfyUI server running on Windows is usually reachable at `localhost` when WSL uses mirrored networking. Otherwise, start ComfyUI with `--listen` and use the Windows host IP.

| Variable | Default | Meaning |
|---|---|---|
| `COMFYUI_URL` | `http://127.0.0.1:8188` | ComfyUI server |
| `COMFYUI_TIMEOUT_MS` | `3600000` | Maximum wait for one generation |
| `COMFYUI_WORKFLOWS_DIR` | `comfyui/workflows` | Alternative workflow folder |
| `COMFYUI_RESTART_COMMAND` | none | Shell command that restarts the server (see "Stuck queue") |

Images and audio are uploaded to ComfyUI's `input/coreslopper/` folder. Results are downloaded into the generation cache like cloud results. The cache key includes the workflow file's content, so editing a workflow regenerates.

## Stuck queue

When jobs stay in `queue_pending` and `queue_running` is empty, the server's prompt worker has died while HTTP still answers; restart the server. `POST /free` releases VRAM between heavy phases, but only while the queue is idle and the last job ended cleanly; after it, confirm that a submitted job reaches `queue_running`. `npm run cli -- comfy status` shows the server, both queue counts, VRAM, and the outcome of the last prompts. How the server is restarted differs per machine, so the command comes from `.env`: `COMFYUI_RESTART_COMMAND=.local/comfyui-restart.sh` (a script in the workspace's gitignored `.local/` folder that stops the server, starts it, and returns once it answers). `npm run cli -- comfy restart` runs it, and `queue run` runs it by itself when a generation fails or hangs past `--timeout`. `Fault failed: 2` (`VRAM Allocation failed (non OOM)`) on a single job is VRAM pressure from a large edit; it passes on retry, and fewer references per edit avoid it.
