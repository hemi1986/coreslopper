# Add Topview as a third cloud provider

## Status

Accepted — 2026-11-15. The lip-sync part is revised by [ADR 0026](0026-cloud-lipsync-and-lead-only-audio.md): Avatar 4 runs through the same adapter with separate OpenAPI credentials.

## Context

Topview's platform API serves many third-party image and video models (Kling, MiniMax, Wan, Seedance, Nano Banana, its own T1) with one key and one USD balance. Every model uses the same endpoint pattern and asynchronous task API, but the request bodies differ: some models take a flat body with named image fields, others a `content[]` list of text and media items with roles. Media inputs must be public HTTPS URLs; local files are uploaded to Topview's media storage first. Topview has no lip-sync endpoint on the platform API.

Providers are a closed set in code (ADR 0011): adding one means an adapter, a schema enum value, and credential checks. A plugin mechanism for workspace-local adapters was considered and deferred until a provider that should not live in the repository appears.

## Decision

- Add a `TopviewProvider` behind the existing `Provider` interface for `generateImage`, `editImage`, `textToVideo`, `imageToVideo`, and `firstLastFrameToVideo`. `lipSync` throws a `ConfigError`.
- Add `topview` to the image and video provider kinds, not to the lip-sync kinds. With `providers.video: topview`, `video.lipsync` defaults to fal.ai, as it does for ComfyUI.
- The role's `model` is the Topview model path (`<vendor>/<model>/<mode>`). The adapter posts to `/models/<model>/predictions` with an `Idempotency-Key` from the generation hash and polls `/predictions/<id>`.
- The adapter-only param `request_format` chooses `flat` (default), `content`, or `wan` (Wan 3.0: `input` + `parameters`). `reference_field`, `end_reference_field`, `send_seed`, and `send_negative_prompt` keep their Higgsfield meaning. All are stripped before the request is sent.
- Upload local references as multipart to `/media/files` and reuse the signed URL for at most 45 minutes within a run.
- Treat `payment_required` as a hard stop (`ConfigError`), not a retryable failure; Topview settles the task after a top-up without a new submission.
- Read the key from `TOPVIEW_API_PLATFORM_KEY`, or `TOPVIEW_API_KEY` as an alias. Onboarding checks it by querying a task ID that cannot exist (404 means the key was accepted).
- `config/models.yaml` gets `alternatives.topview` for the image roles and the video roles that have a per-second Topview price. Token-priced models are not mapped.

Lip-sync stays off Topview. The platform API has no lip-sync endpoint; `omni-reference-to-video` takes reference audio only as a cue, without a sync guarantee. Topview's talking-avatar product (Avatar 4) lives on the older `api.topview.ai` API, with its own key, a `Topview-Uid` header, a separate upload flow, and plan credits instead of the USD balance. It would be a separate adapter.

## Consequences

Switching a project to Topview is a configuration change. A new Topview model needs only a role alternative with its `request_format` and field names. The planned price in the manifest can differ from Topview's `charged_usd`; reconciling them is left to the user. A model with a fourth body shape needs a new `request_format`. Most Topview models reject `seed`, so their reruns are not reproducible on the provider side (Wan 3.0 is the exception); the local cache still makes them reproducible in the pipeline.
