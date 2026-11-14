# ComfyUI workflows

Put ComfyUI workflow exports here to generate locally instead of on fal.ai or Higgsfield: stills, image edits, video clips, lip-sync, and audio. A local run costs $0 against the project budget.

## Tested workflows

The repository ships no graphs: node names change between ComfyUI and model releases, and you own your workflows. `config/models.yaml` expects these file names; put a tagged export under each name, or point the role at your own file.

| File | Operations | Default roles | Built from |
|---|---|---|---|
| `qwen-t2i.json` | `generateImage` | `image.keyframe`, `image.keyframe.budget` (comfyui alternative) | ComfyUI template *Qwen Image 2.1 Turbo t2i* |
| `qwen-edit.json` | `editImage` (up to 16 references) | `image.edit`, `image.character_sheet` (comfyui alternative) | Template *Qwen Image 2.1 Turbo image edit* |
| `qwen-bg-remove.json` | `editImage` | `image.background_removal` | Template *Qwen Image 2.1 background removal*; outputs a transparent PNG |
| `ltx25-lipsync-flf2v.json` | `lipSync` | `video.lipsync` (comfyui alternative) | The community graph *LTX2.5_FLF2V_Lipsync_SinglePass_HQ*: start + end frame + vocal stem, one pass |
| `ltx-i2v.json` | `imageToVideo` | `video.image_to_video.*`, `video.premium.veo` (comfyui alternative) | LTX 2.5 official image-to-video template |
| `ltx-t2v.json` | `textToVideo` | `video.text_to_video` | LTX 2.5 official text-to-video template |
| `ltx-flf2v.json` | `firstLastFrameToVideo` | `video.first_last_frame` | LTX 2.5 official first/last-frame template |
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
- **MiniMax Music 3:** the text encoder `cs_prompt cs_lyrics cs_duration`, the seed node `cs_seed`, the audio save node `cs_output`.
- **ACE-Step 1.5:** the `TextEncodeAceStepAudio1.5` node `cs_prompt cs_lyrics cs_duration` (prompt goes into `tags`), the `EmptyAceStep1.5LatentAudio` node `cs_duration`, the seed `PrimitiveInt` `cs_seed`, the audio save node `cs_output`.
- **VoxCPM clone:** the `VoxCPM_TTS` node `cs_prompt cs_seed`, the `LoadAudio` with the reference voice `cs_audio`, the `VoxCPM_VoiceCloning` node `cs_transcript`, the save node `cs_output`. Design: the same without `cs_audio` and `cs_transcript`.
- **Stable Audio 3:** the user-description primitive `cs_prompt`, the negative encoder `cs_negative`, the duration primitive `cs_duration`, the `KSampler` `cs_seed`, the audio save node `cs_output`.

Notes from test runs on a 16 GB GPU:

- `qwen-t2i` and `qwen-edit` take about 10–20 s per image. Put the image to edit first (`references[0]` sets the output size), then the other references.
- `qwen-bg-remove` works on a clear subject. On dark, low-contrast scenes it can return a fully transparent image, so generate cutouts on a plain background.
- `ltx25-lipsync-flf2v` takes about 48 s for a 4.7 s clip at 0.8 MP, `ltx-i2v` about 31 s for 4 s, `ltx-flf2v` about 45 s for 5 s. The lip-sync graph cuts the vocal stem itself: `audio` is `audio/stems/vocals.wav`, `audioStartSeconds` the line's start, `durationSeconds` the line plus about 0.3 s of the following pause. Frames round down to 8n+1, so the clip never outruns the audio and only that silent tail is dropped. The graph has no vocal separator; `generate` rejects the full mix. With one keyframe, the adapter uploads it as start and end frame.
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
| `cs_resolution` | `ResolutionSelector` | `aspect_ratio` from the output size, plus `megapixels` and `multiple` when those params are set |
| `cs_audio_start` | `TrimAudioDuration` | `start_index`, set to the batch item's `audioStartSeconds` (default 0) |
| `cs_seed` | Sampler, `RandomNoise`, or a seed node | `seed` / `noise_seed` |
| `cs_width`, `cs_height` | Latent or size node | `width`, `height` |
| `cs_frames` | Latent or image-to-video node | `length` / `frames` / `num_frames` |
| `cs_duration` | A seconds input | `seconds` / `duration` / `max_duration` / `value` |
| `cs_fps` | Frame-rate node | `frame_rate` / `fps` / `value` |
| `cs_lyrics` | Music text encoder | `lyrics`, set to the `lyrics` param (empty when unset, so demo lyrics never leak) |
| `cs_output` | The save node | Only its outputs are downloaded. Its class decides the output kind: `Save…Image` = image, `Save…Audio` = audio, anything else = video. |

A node can carry several tags separated by spaces, for example `cs_width cs_height cs_frames` on an LTX latent node. Tag the node that holds the value. If the input is connected to another node, tag that source node instead.

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
| `node_inputs` | Set any other value: `{"cs_sampler.steps": 30, "12.cfg": 3.5}`. Keys are `<node title tag or node id>.<input>`. |

Any other param is an error, so typos do not pass silently.

## Server

The adapter talks to `COMFYUI_URL` (default `http://127.0.0.1:8188`). Under WSL, a ComfyUI server running on Windows is usually reachable at `localhost` when WSL uses mirrored networking. Otherwise, start ComfyUI with `--listen` and use the Windows host IP.

| Variable | Default | Meaning |
|---|---|---|
| `COMFYUI_URL` | `http://127.0.0.1:8188` | ComfyUI server |
| `COMFYUI_TIMEOUT_MS` | `3600000` | Maximum wait for one generation |
| `COMFYUI_WORKFLOWS_DIR` | `comfyui/workflows` | Alternative workflow folder |

Images and audio are uploaded to ComfyUI's `input/coreslopper/` folder. Results are downloaded into the generation cache like cloud results. The cache key includes the workflow file's content, so editing a workflow regenerates.
