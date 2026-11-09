# ComfyUI workflows

Put ComfyUI workflow exports here to render video clips locally instead of on fal.ai or Higgsfield. Stills and lip-sync stay with a cloud provider.

## Quick setup

1. Build and test the workflow in ComfyUI.
2. Give the nodes the adapter must fill a title tag (right-click a node > Title). The table below lists the tags.
3. Save the workflow with **Workflow > Export (API)**, not the normal Save. Put the file here:

   | File | Operation | Default role |
   |---|---|---|
   | `workflows/ltx-t2v.json` | `textToVideo` | `video.text_to_video` |
   | `workflows/ltx-i2v.json` | `imageToVideo` | `video.image_to_video.*` |
   | `workflows/ltx-flf2v.json` | `firstLastFrameToVideo` | `video.first_last_frame` |

   The file name is the `model` in `config/models.yaml` (`alternatives.comfyui.model`). You can add more workflows and point roles at them.
4. Select the backend in `projects/<slug>/project.yaml`:

   ```yaml
   providers:
     image: fal
     video: comfyui
     # lipsync: fal   # default when video is comfyui
   ```

5. Run `npm run cli -- doctor`. It shows whether ComfyUI is reachable and checks every workflow in this folder.

## Title tags

| Tag | Node to tag | Input set |
|---|---|---|
| `cs_prompt` | Positive text encoder (e.g. `CLIPTextEncode`) | `text`. **Required.** |
| `cs_negative` | Negative text encoder | `text` |
| `cs_start_image` | `LoadImage` for the start frame | `image` (uploaded by the adapter) |
| `cs_end_image` | `LoadImage` for the end frame | `image` |
| `cs_seed` | Sampler or `RandomNoise` | `seed` / `noise_seed` |
| `cs_width`, `cs_height` | Latent or image-to-video node | `width`, `height` |
| `cs_frames` | Latent or image-to-video node | `length` / `frames` / `num_frames`. Required when a batch item has `durationSeconds`. |
| `cs_fps` | Conditioning or video-save node | `frame_rate` / `fps` |
| `cs_output` | The video save node | Only its outputs are downloaded. Without this tag, every saved video is downloaded. |

A node can carry several tags separated by spaces. For example, an LTX latent node can be titled `cs_width cs_height cs_frames`. Tag the node that holds the value. If the input is connected to another node, tag that source node instead.

The image tags decide which operation a workflow fits:

| Image tags in the workflow | Operation |
|---|---|
| None | `textToVideo` |
| `cs_start_image` only | `imageToVideo` |
| `cs_start_image` and `cs_end_image` | `firstLastFrameToVideo` |

A batch item for another operation is rejected before anything is queued.

## Adapter params

Set these under `params` in `config/models.yaml`, or in a project override (`models.<role>.params` in `project.yaml`):

| Param | Meaning |
|---|---|
| `fps` | Frame rate the workflow renders at. Default 24. It is written to `cs_fps` only when you set it. |
| `frame_step` | Rounds frame counts up to `step × n + 1`. LTX needs 8. |
| `size_multiple` | Rounds width and height to a multiple. LTX needs 32, so 1080 becomes 1088. |
| `width`, `height` | Override the project's master size, e.g. render at 1280×704 for drafts. |
| `node_inputs` | Set any other value: `{"cs_sampler.steps": 30, "12.cfg": 3.5}`. Keys are `<node title tag or node id>.<input>`. |

Any other param is an error, so typos do not pass silently.

## Server

The adapter talks to `COMFYUI_URL` (default `http://127.0.0.1:8188`). Under WSL, a ComfyUI server running on Windows is usually reachable at `localhost` when WSL uses mirrored networking. Otherwise, start ComfyUI with `--listen` and use the Windows host IP.

| Variable | Default | Meaning |
|---|---|---|
| `COMFYUI_URL` | `http://127.0.0.1:8188` | ComfyUI server |
| `COMFYUI_TIMEOUT_MS` | `3600000` | Maximum wait for one clip |
| `COMFYUI_WORKFLOWS_DIR` | `comfyui/workflows` | Alternative workflow folder |

Start frames are uploaded to ComfyUI's `input/coreslopper/` folder. Clips are downloaded into the generation cache like cloud results. The cache key includes the workflow file's content, so editing a workflow regenerates the clips. A local run costs $0 against the project budget.
