# Providers and AI generation

coreslopper generates images and clips through a small adapter interface. fal.ai and Higgsfield are the cloud adapters, ComfyUI renders clips locally, and a deterministic mock adapter powers tests and runs without an account. Songs are never generated; the user imports a finished song.

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
| `image` | `generateImage`, `editImage` | `fal`, `higgsfield`, `mock` |
| `video` | `textToVideo`, `imageToVideo`, `firstLastFrameToVideo` | `fal`, `higgsfield`, `comfyui`, `mock` |
| `lipsync` | `lipSync` | `fal`, `comfyui` (LTX FLF2V lip-sync, see [comfyui/README.md](../comfyui/README.md)), `mock` (Higgsfield has no lip-sync yet). Defaults to `video`, or to `fal` when `video` is `comfyui`. |

When a storyboard uses lip-sync shots and `video` is `higgsfield`, set `lipsync: fal`.

Without any key, use the mock provider everywhere:

```yaml
providers:
  image: mock
  video: mock
  lipsync: mock
```

## Local clips with ComfyUI

Set `providers.video: comfyui` to render clips on your own GPU. Stills stay on `providers.image`; lip-sync falls back to fal.ai. Each video role's `alternatives.comfyui.model` names a workflow in `comfyui/workflows/`, exported with Export (API) and tagged by node title. A local clip costs $0 against the budget. Setup, title tags, params, and server variables are in [comfyui/README.md](../comfyui/README.md).

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
```

## The adapter interface

```ts
generateImage(input): Promise<ImageResult>;
editImage(input): Promise<ImageResult>;
textToVideo(input): Promise<VideoResult>;
imageToVideo(input): Promise<VideoResult>;           // references[0] = start frame
firstLastFrameToVideo(input): Promise<VideoResult>;  // references = [start, end]
lipSync(input): Promise<VideoResult>;
```

fal.ai implements every operation; Higgsfield implements everything but lip-sync; ComfyUI implements the three video operations. For `firstLastFrameToVideo` in the cloud, set the adapter-only `end_reference_field` param to the model's end-frame field. The mock adapter returns deterministic SVG placeholders. Model IDs, provider-specific slugs, defaults, and prices live in [`config/models.yaml`](../config/models.yaml), not in code. A change of model is a configuration change.

Higgsfield submissions are asynchronous: the adapter uploads local references through the presigned-upload endpoint, polls the request, and downloads the result before it is cached. Its model schemas are strict, so provider-specific params stay in `config/models.yaml`. Three adapter-only options are stripped before the request is sent: `send_seed: true` for models that accept a seed, `send_negative_prompt: true` for models that accept a negative prompt, and `reference_field: <field>` when an edit model uses a name other than `image_urls` (for example `image_reference_url`).

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

The estimate resolves the role for the project's selected provider. Add `--provider higgsfield` (or `fal`) to compare providers without changing the project.

Every call is cached by a SHA-256 hash of the canonical request and recorded in `assets/manifest.jsonl` with provider, model, prompt, seed, references, cost, and cache status. A cache hit costs nothing.

## Budget

- `project.yaml` requires `budget_usd`. `batch_cap_usd` defaults to 30 % of the remaining budget.
- Every paid batch is estimated first; unknown pricing is a hard error.
- `state.json` records the spend of every stage.

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
