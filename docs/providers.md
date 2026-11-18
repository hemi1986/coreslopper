# Providers and AI generation

coreslopper generates images and clips through a small adapter interface. fal.ai, Higgsfield, and Topview are the cloud adapters, ComfyUI renders clips locally, and a deterministic mock adapter powers tests and runs without an account. Songs are never generated; the user imports a finished song.

## Choose providers per project

Set providers in `projects/<slug>/project.yaml`:

```yaml
providers:
  image: higgsfield
  video: fal
  lipsync: fal   # optional; defaults to providers.video
```

| Key | Covers | Values |
|---|---|---|
| `image` | `generateImage`, `editImage` | `fal`, `higgsfield`, `topview`, `comfyui`, `mock` |
| `video` | `textToVideo`, `imageToVideo`, `firstLastFrameToVideo` | `fal`, `higgsfield`, `topview`, `comfyui`, `mock` |
| `lipsync` | `lipSync` | `fal` (OmniHuman 1.5), `higgsfield` (Speak v2), `topview` (Avatar 4, separate credentials), `comfyui` (LTX FLF2V lip-sync, see [comfyui/README.md](../comfyui/README.md)), `mock`. Defaults to `video`, or to `fal` when `video` is `comfyui` or `topview`. |

`generate --lipsync-provider <p>` runs the lip-sync items of one batch on another provider, for example to compare OmniHuman with Speak v2 on one shot; `--provider` leaves lip-sync on its own provider. See [Lip-sync](#lip-sync) for the trade-offs.

Without any key, use the mock provider everywhere:

```yaml
providers:
  image: mock
  video: mock
  lipsync: mock
```

## Local clips with ComfyUI

Set `providers.video: comfyui` to render clips on your own GPU. Stills stay on `providers.image`; lip-sync falls back to fal.ai. Each video role's `alternatives.comfyui.model` names a workflow in `comfyui/workflows/`, exported with Export (API) and tagged by node title. A local clip costs $0 against the budget. Setup, title tags, params, and server variables are in [comfyui/README.md](../comfyui/README.md).

Per batch item, `params` choose how a local clip is made: `video_model` (`ltx` or `wan`; Wan 2.2 is image-to-video only and never lip-syncs), `quality` (`draft` or `final`), and after a final clip the **Restore Pass** (`seedvr2`: `restore`, `upscale`, or `off`; `color_correction`: `lab` or `wavelet`). `params.workflow` runs one item on another workflow, such as a slower `-quality` variant. Cloud providers ignore these keys.

## Audio roles and episode speech

`providers.audio` selects the provider for the `audio.*` roles: `comfyui` (the default) or `mock`. A song is never generated; these roles make stingers, effects, ambience, and, for episodes, speech:

- `audio.voice` speaks an episode's script line in the speaker's reference voice (`voice.ref` and `voice.transcript` in the series `characters.yaml`). `voice-track` builds these items itself.
- `audio.sfx` makes the `sfx` lines and each scene's `atmo` ambience. An effect longer than the role's `maxDuration` for the selected provider is rejected.

Speech has no cloud adapter yet ([ADR 0016](adr/0016-episode-projects.md) describes the intended `fal` path). Without a local GPU, record the lines and register them with `import-takes`. The mock provider writes silent takes whose length follows the text, so episodes run end to end in CI.

## Credentials

Put keys in the workspace `.env` (gitignored), never in a file that is committed.

```bash
# fal.ai
FAL_KEY=...

# Higgsfield: either the complete credential from open.higgsfield.ai ...
HIGGSFIELD_API_KEY=key_id:key_secret

# ... or the split values. HF_API_KEY, HF_KEY, and HF_CREDENTIALS are also accepted.
HF_API_KEY_ID=...
HF_API_KEY_SECRET=...

# Topview: platform API key from https://platform.topview.ai/api-keys
# (TOPVIEW_API_KEY is accepted as an alias)
TOPVIEW_API_PLATFORM_KEY=...

# Topview lip-sync (Avatar 4) only: the OpenAPI uid and key from
# topview.ai > API Settings, separate from the platform key
TOPVIEW_UID=...
TOPVIEW_OPENAPI_KEY=...
```

Publishing to YouTube and TikTok uses separate OAuth credentials (`YOUTUBE_CLIENT_ID`, `TIKTOK_CLIENT_KEY`, ...) and its own publish adapters, not these providers; see [publishing.md](publishing.md).

## The adapter interface

```ts
generateImage(input): Promise<ImageResult>;
editImage(input): Promise<ImageResult>;
textToVideo(input): Promise<VideoResult>;
imageToVideo(input): Promise<VideoResult>;           // references[0] = start frame
firstLastFrameToVideo(input): Promise<VideoResult>;  // references = [start, end]
lipSync(input): Promise<VideoResult>;
```

fal.ai, Higgsfield, and Topview implement every operation; ComfyUI implements the video operations and lip-sync. For `firstLastFrameToVideo` in the cloud, set the adapter-only `end_reference_field` param to the model's end-frame field. The mock adapter returns deterministic SVG placeholders. Model IDs, provider-specific slugs, defaults, and prices live in [`config/models.yaml`](../config/models.yaml), not in code. A change of model is a configuration change.

Higgsfield submissions are asynchronous: the adapter uploads local references through the presigned-upload endpoint, polls the request, and downloads the result before it is cached. Its model schemas are strict, so provider-specific params stay in `config/models.yaml`. Three adapter-only options are stripped before the request is sent: `send_seed: true` for models that accept a seed, `send_negative_prompt: true` for models that accept a negative prompt, and `reference_field: <field>` when an edit model uses a name other than `image_urls` (for example `image_reference_url`).

## Topview

Topview serves many third-party models behind one API: `POST /api/v1/models/<model>/predictions`, then `GET /api/v1/predictions/<id>` until the task is `completed`. The `model` in `config/models.yaml` is the path between `models/` and `/predictions`, for example `kling/kling-4.0/image-to-video`. The adapter sends an `Idempotency-Key`, uploads local references as multipart to `/media/files`, and passes the returned signed URL (valid for an hour; Topview keeps the file for 60 days).

Topview models do not share one request shape. `request_format` picks it:

- `flat` (default): `prompt` plus named fields. Edit references go to `images` (or `reference_field`); a video start frame goes to `image` (or `reference_field`), an end frame to `end_reference_field` (Kling 4.0: `last_image`).
- `content`: a `content[]` list with a text item and `image_url` items with the roles `first_frame` and `last_frame` (Topview T1, Seedance, MiniMax H3).
- `wan`: Alibaba's native shape for Wan 3.0, `{ input: { prompt, media: [{ type: first_frame|last_frame, url }] }, parameters: { ... } }`. Every role param (`resolution`, `ratio`, `audio`, `prompt_extend`, `watermark`) goes into `parameters`, and `send_seed: true` sets `parameters.seed`. Wan rejects start frames with a PNG alpha channel.

The formats apply to the video operations; image models all use `flat`.

`send_seed` and `send_negative_prompt` work as for Higgsfield. Most Topview models reject both, so they are off by default; Wan 3.0 accepts a seed. A task in `payment_required` stops the batch: top up the Topview workspace, and the task settles without a new submission. The manifest records the planned price; Topview's actual charge is in the task's `charged_usd` (kept in the adapter's raw result). Models with token-based prices (Seedance) need a per-second planning estimate before they can be used as a role.

## Lip-sync

A lip-sync item animates a face (`references[0]`) with a cut vocal segment (`audio`). The segment is lead-only: `audio-segment` mutes the parenthesized backing words of the timing and every `--mute` span with short fades, and cuts from `audio/stems/lead.wav` when it exists (see [scripts/audio-analysis/README.md](../scripts/audio-analysis/README.md)).

| Provider | Model (`video.lipsync`) | Audio | Length and billing | Notes |
|---|---|---|---|---|
| `fal` | OmniHuman 1.5 | MP3 or WAV | per second of audio, up to 30 s | Head and body motion; the default. |
| `higgsfield` | Speak v2 (`higgsfield-ai/speak`) | WAV only (`audio-segment --format wav`) | 5, 10, or 15 s per generation; a 3 s segment bills one 5 s generation ($1.125 at high quality, measured 2026-11-18) | Clip follows the audio length; 1280x704 at 16 fps. |
| `topview` | Avatar 4 (`avatar4`, `avatar4Fast`, `avatar2`) | MP3, WAV, or M4A | plan credits per generated second (avatar4 0.1 credits/s) | Topview OpenAPI on `api.topview.ai`; needs `TOPVIEW_UID` and `TOPVIEW_OPENAPI_KEY`. |
| `comfyui` | `ltx25-lipsync-flf2v` | the stem with `audioStartSeconds` | $0, up to 10 s | Local LTX. |

Higgsfield's Speak v2 is a model route of the current API: the adapter uploads face and audio, posts `{ image_url, audio_url, prompt, duration, seed, quality }`, and polls the request like any other model. `duration` is the audio length rounded up to `durations` (Speak cuts longer audio). Because `quality` is the local draft/final option in a batch item, Speak's own quality is set as `model_quality` (`high` or `mid`). The legacy routes `v1/speak/<model>` (Kling Avatar: `v1/speak/kling`, `mode: std|pro`) take `request_format: job_set`: the body is `{ params: { input_image, input_audio, prompt, ... } }` and the adapter polls `/v1/job-sets/<id>`. Audio-driven Wan (`wan/v2.6/image-to-video`, `wan/v2.7/image-to-video`, field `audio_url`) uses the flat format; `audio_field` names another audio field. Select these through a project override of `models.video.lipsync`. InfiniteTalk and a separate Wan 2.5 Speak route are not exposed on the Higgsfield API.

Topview's Avatar 4 is not on the platform API. It runs on the Topview OpenAPI (`api.topview.ai`) with the `Topview-Uid` header and its own key: the adapter gets an upload credential per file (`GET /v1/upload/credential?format=<ext>`), PUTs the file to the signed URL, checks it (`/v1/upload/check`), submits `POST /v1/photo_avatar/task/submit` with `templateImageFileId`, `scriptMode: audio`, `audioFileId`, `mode`, and the prompt as `customMotion`, then polls `GET /v1/photo_avatar/task/query` until `success` and downloads `finishedVideoUrl`. Other params (`offPeak: true` halves the credits) are sent as they are. The submission is not retried, because the OpenAPI has no idempotency key. Credits are a Topview plan balance, not the platform USD balance, so the USD price in `config/models.yaml` is a planning estimate.

## Generation batches

The `assets` stage writes batches itself. To run one by hand, write a JSON array:

```json
[
  {
    "operation": "editImage",
    "role": "image.keyframe",
    "prompt": "Nova stands in neon rain, cinematic close-up",
    "references": ["characters/nova/sheet.png"],
    "seed": 1234
  },
  {
    "operation": "imageToVideo",
    "role": "video.image_to_video.quality",
    "prompt": "slow push in, rain streaks, neon reflections",
    "references": ["assets/keyframes/shot-004.png"],
    "durationSeconds": 5,
    "seed": 1234
  }
]
```

Estimate, then run:

```bash
npm run cli -- estimate --role image.keyframe --units 8 --project projects/my-video
npm run cli -- generate projects/my-video --batch assets/batches/scene-01.json
```

The estimate resolves the role for the project's selected provider. Add `--provider higgsfield` (or `fal`, `topview`) to compare providers without changing the project, and `--lipsync-provider <p>` for the lip-sync items.

Every call is cached by a SHA-256 hash of the canonical request and recorded in `assets/manifest.jsonl` with provider, model, prompt, seed, references, cost, and cache status. A cache hit costs nothing.

## Budget

- `project.yaml` requires `budget_usd`. `batch_cap_usd` defaults to 30 % of the remaining budget.
- Every paid batch is estimated first; unknown pricing is a hard error.
- `state.json` records the spend of every stage.

## Comparing models before a switch

To decide between workflows, checkpoints, servers, or providers, run the model bench instead of a project: `bench/targets.yaml` names each variant per operation, and `npm run cli -- bench run` renders fixed scenes from past projects on them, with its own budget in `bench/bench.yaml`. See [`bench/README.md`](../bench/README.md) and [ADR 0020](adr/0020-model-bench.md). Change `config/models.yaml` once a bench shows the switch is worth it.

## Model roles

A role has a base provider and optional alternatives:

```yaml
roles:
  image.keyframe:
    provider: fal
    model: fal-ai/flux-2-pro
    pricing: { unit: image, usd: 0.05 }
    alternatives:
      higgsfield:
        model: higgsfield-ai/soul/v2/standard
        params: { resolution: 1080p, aspect_ratio: 16:9 }
        pricing: { unit: image, usd: 0.006 }
```

A project can also override a role explicitly with `models.image.keyframe.model`, `.params`, and `.pricing` in `project.yaml`. The estimator refuses to run a paid batch when the selected provider has no model or price.
