# Narrow generation interface, fal.ai first, hash cache and budget guard

**Status:** Accepted

## Context

Generation providers and models change quickly. Duplicate generations waste credits, and a long autonomous run can spend more than intended.

## Decision

Expose only `generateImage`, `editImage`, and `imageToVideo` in `packages/providers`. The first real adapter is fal.ai. Model IDs and defaults live in `config/models.yaml`, not code. Every call is logged to `assets/manifest.jsonl` with model, prompt, seed, references, params, provider, and cost. A SHA-256 hash of the canonical request (including reference-file hashes) keys a cache under `.cache/generations/`. Before a batch, estimate the cost and compare it with the project budget and batch cap; abort before the first paid call if either would be exceeded. Retries use backoff and timeouts; batch state is resumable. A mock adapter supports tests and no-account runs.

## Consequences

- Adding a provider is additive; the pipeline does not change.
- Cache hits avoid duplicate spend.
- Unknown model pricing is a hard error, not a guess.
