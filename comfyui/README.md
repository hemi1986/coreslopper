# ComfyUI workflows

Put ComfyUI workflow exports here to generate locally instead of on fal.ai or Higgsfield: stills, image edits, video clips, lip-sync, and audio. A local run costs $0 against the project budget.

## Tested workflows

The repository ships no graphs: node names change between ComfyUI and model releases, and you own your workflows. `config/models.yaml` expects these file names; put a tagged export under each name, or point the role at your own file.

| File | Operations | Default roles | Built from |
|---|---|---|---|
| `qwen-t2i.json` | `generateImage` | `image.keyframe`, `image.keyframe.budget` (comfyui alternative) | ComfyUI template *Qwen Image 2.1 Turbo t2i* |
| `qwen-edit.json` | `editImage` (up to 16 references) | `image.edit`, `image.character_sheet` (comfyui alternative) | Template *Qwen Image 2.1 Turbo image edit* |
| `qwen-bg-remove.json` | `editImage` | `image.background_removal` | Template *Qwen Image 2.1 background removal*; outputs a transparent PNG |
| `ltx-av.json` | `imageToVideo`, `lipSync` | `video.image_to_video.*`, `video.lipsync` (comfyui alternative) | An LTX 2.5 audio-video graph with a custom-audio switch |
| `ltx-t2v.json` | `textToVideo` | `video.text_to_video` | LTX 2.5 text-to-video |
| `ltx-flf2v.json` | `firstLastFrameToVideo` | `video.first_last_frame` | LTX 2.5 first/last frame |
| `music-minimax.json` | `generateAudio` | `audio.music` | Template *MiniMax Music 3* |
| `audio-stable.json` | `generateAudio` | `audio.sfx` | Template *Stable Audio 3 Medium* |

How they were tagged:

- **Qwen t2i and edit:** the templates write the prompt as a literal into an If/Else switch and into the prompt-enhancer node. Add a `PrimitiveStringMultiline` titled `cs_prompt` and connect it to both. Tag the Qwen text encoder `cs_negative` (edit: `cs_negative cs_references`), the `RandomNoise` `cs_seed`, and the save node `cs_output`. In t2i, delete the resolution selector, give `EmptyLatentImage` literal sizes, and title it `cs_width cs_height`. In edit, tag the `LoadImage` `cs_start_image`.
- **Qwen background removal:** `LoadImage` `cs_start_image`, the text encoder `cs_prompt cs_negative`, the `KSampler` `cs_seed`, the save node `cs_output`.
- **LTX audio-video:** `LoadImage` `cs_start_image`, `LoadAudio` `cs_audio`, the positive/negative prompt primitives `cs_prompt`/`cs_negative`, the fps and duration-in-seconds primitives `cs_fps`/`cs_duration`, both `RandomNoise` nodes `cs_seed`, the half-size `EmptyLTXVLatentVideo` `cs_width cs_height` (with `size_scale: 0.5`), every boolean that turns custom audio on `cs_use_audio`, `TrimAudioDuration` `cs_audio_start`, and the video save node `cs_output`.
- **MiniMax Music 3:** the text encoder `cs_prompt cs_lyrics cs_duration`, the seed node `cs_seed`, the audio save node `cs_output`.
- **Stable Audio 3:** the user-description primitive `cs_prompt`, the negative encoder `cs_negative`, the duration primitive `cs_duration`, the `KSampler` `cs_seed`, the audio save node `cs_output`.

Notes from test runs on a 16 GB GPU:

- `qwen-t2i` and `qwen-edit` take about 10–20 s per image. Put the image to edit first (`references[0]` sets the output size), then the other references.
- `qwen-bg-remove` works on a clear subject. On dark, low-contrast scenes it can return a fully transparent image, so generate cutouts on a plain background.
- `ltx-av` takes about 65 s for a 3 s clip at 1088×1920. In `lipSync` mode the clip length follows the vocal segment. Prompt the singing explicitly, for example "sings the supplied vocal audio with accurate lip sync: lips, jaw and facial muscles move precisely with every syllable".
- `generateAudio` is for teasers, stingers, and SFX. It never replaces the song a video is made for.

## Select the backend

In `projects/<slug>/project.yaml`:

```yaml
providers:
  image: comfyui      # qwen stills and edits
  video: comfyui      # LTX clips
  lipsync: comfyui    # LTX with custom audio; defaults to fal when video is comfyui
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
| `cs_prompt` | Positive text node (`CLIPTextEncode`, a string primitive, a music caption) | `text` / `prompt` / `caption` / `value`. **Required.** |
| `cs_negative` | Negative text node | `negative_prompt` / `text` / `value` |
| `cs_start_image` | `LoadImage` for the start frame or the image to edit | `image` (uploaded by the adapter) |
| `cs_end_image` | `LoadImage` for the end frame | `image` |
| `cs_references` | A node with an autogrow image input (Qwen `images.image_N`) | The adapter adds a `LoadImage` per extra reference and links it to the next free slot |
| `cs_audio` | `LoadAudio` for the driving vocals | `audio` (uploaded by the adapter) |
| `cs_use_audio` | Boolean switches that turn the custom-audio branch on | `boolean` / `value`: `true` for `lipSync`, `false` otherwise |
| `cs_audio_start` | `TrimAudioDuration` | `start_index`, set to `audio_offset` (default 0) |
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
| audio | — | `generateAudio` |
| video | none | `textToVideo` |
| video | `cs_start_image` | `imageToVideo` |
| video | `cs_start_image`, `cs_end_image` | `firstLastFrameToVideo` |
| video | `cs_start_image`, `cs_audio` | `lipSync`, plus `imageToVideo` when `cs_use_audio` is present |

A batch item for another operation is rejected before anything is queued. When a workflow has `cs_audio` but runs without lip-sync, the adapter uploads a short silent file so ComfyUI's validation passes, and switches `cs_use_audio` off.

## Adapter params

Set these under `params` in `config/models.yaml`, or in a project override (`models.<role>.params` in `project.yaml`):

| Param | Meaning |
|---|---|
| `fps` | Frame rate the workflow renders at. Default 24. It is written to `cs_fps` only when you set it. |
| `frame_step` | Rounds frame counts up to `step × n + 1`. LTX needs 8. |
| `size_multiple` | Rounds width and height to a multiple. LTX needs 32, so 1080 becomes 1088. |
| `size_scale` | Fraction of the output size written to the size tags, for workflows that upscale the latent. `ltx-av` uses 0.5 (latent ×2). |
| `megapixels` | Scales the target size to this many megapixels, keeping the aspect. |
| `width`, `height` | Override the project's master size, e.g. render at 1280×704 for drafts. |
| `audio_offset` | Start of the driving audio in seconds (`cs_audio_start`). Default 0, since `audio-segment` already cuts the line. |
| `lyrics` | Lyrics for `cs_lyrics` (music workflows). |
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
