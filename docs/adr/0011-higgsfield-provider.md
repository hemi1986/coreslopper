# Add Higgsfield as a second generation provider

## Status

Accepted — 2026-11-08

## Context

The workflow started with fal.ai as the only real generation provider. Users want to choose providers per project without rewriting prompts, storyboard roles, or the budget and cache machinery. Higgsfield exposes image and video models behind an asynchronous REST API with presigned uploads, per-model strict schemas, key-ID plus secret authentication, and per-second or per-image pricing. The two providers do not share model slugs or parameter names.

## Decision

- Add a `HiggsfieldProvider` behind the existing narrow `Provider` interface (`generateImage`, `editImage`, `imageToVideo`, `lipSync`).
- Keep model selection and pricing in `config/models.yaml`. A role names a base `provider` and can add `alternatives.<provider>` with its own slug, params, price, and duration limit.
- Let a project select `providers.image`, `providers.video`, and optional `providers.lipsync`. Lip-sync stays on fal.ai because the Higgsfield adapter does not implement it yet.
- Read Higgsfield credentials from `HIGGSFIELD_API_KEY`, `HF_API_KEY`, `HF_KEY`, or `HF_CREDENTIALS`, or from `HF_API_KEY_ID` plus `HF_API_KEY_SECRET`. Never commit them.
- Upload local references through Higgsfield's presigned-upload endpoint, send an idempotency key derived from the generation hash, poll with backoff, and download outputs before caching.
- Strip adapter-only model params (`send_seed`, `send_negative_prompt`, `reference_field`) before the provider request so strict Higgsfield schemas do not reject them.
- Keep the mock adapter able to run any role without provider-specific configuration.

## Consequences

Switching a project to Higgsfield is a configuration change. A paid batch still needs a provider-specific model and price; the estimator rejects a role that has no `alternatives` entry for the selected provider. Higgsfield schemas are stricter than fal.ai's, so a new model may need its own params in models.yaml. Adding a third provider follows the same pattern: one adapter, role alternatives, and credential checks in onboarding and doctor.
