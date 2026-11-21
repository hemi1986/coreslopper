---
paths:
  - "packages/cli/src/generate.ts"
  - "packages/cli/src/clip-options.ts"
  - "packages/cli/src/comfy.ts"
  - "packages/cli/src/image-ops.ts"
  - "packages/core/src/models.ts"
  - "packages/core/src/cost.ts"
  - "packages/core/src/hash.ts"
  - "packages/core/src/flex.ts"
  - "packages/core/src/fl2va.ts"
  - "packages/providers/src/*.ts"
  - "config/models.yaml"
  - "config/defaults.yaml"
  - "comfyui/**"
  - "docs/providers.md"
  - "tests/generation-characterization.test.ts"
  - "tests/providers.test.ts"
  - "tests/generate-*.test.ts"
---

# Generation (BC-Generation)

> Concept slice across core, providers, cli and the configuration. Adopted 2026-11-21. Decided by recommendation
> plus four answers from the user. The model is in `docs/domain/events.yaml` (`AGG-CachedGeneration`,
> `AGG-ModelRoles`), the decisions in ADR 0041 (proposed), and gaps G-86–G-104 in
> `docs/domain/gap-register.md`. The publish and post adapters in `packages/providers/src/publish/` are not part
> of this slice.

## Purpose

Turns the items of a generation batch into provider calls for a model role. The slice refuses a batch up front
when it does not fit the budget. It serves a request that ran before from the generation cache, records every
generation in the manifest, and bills every new one at its planned cost.

## Key terms

Generation Batch, Generation, Generation Operation, Model Role, Provider, Provider Alternative, Provider Adapter,
ComfyUI Workflow, Mock Provider, Generation Cache, Cache Key, Manifest, Project Budget, Batch Cap, Restore Pass,
Video Model. All are defined in `docs/glossary.md`. Do not write "backend" for a provider, "job" for a generation,
or "model" when you mean the role.

## As-is boundary

- `runBatch` (`generate.ts`) is the one path every caller takes: `generate`, the queue (one item per batch),
  `patch`, `voice-track` and the bench.
  - It resolves each item with `resolveItem`.
  - It checks the worst-case estimate once with `assertAffordable`.
  - It runs one `GenerationRunner` per provider.
  - After each new result it records the planned cost and saves the state.
- `GenerationRunner` (`packages/providers/src/runner.ts`) owns:
  - the cache key;
  - the workspace-wide cache under `.cache/generations/<key>/`;
  - the append to `assets/manifest.jsonl`.
- `config/models.yaml` holds the model roles, their provider alternatives and the ComfyUI locks. `models.ts`
  resolves a role for the project's provider.
- The budget ledger is `AGG-Project` (pipeline slice). The queue's attempts are BC-GenerationQueue.

## Boundaries

- Generate only through `runBatch`. Never call an adapter or `GenerationRunner` around it.
- Put models, params and prices in `config/models.yaml`, never in code. Only the agent changes them, at the user's
  request.
- Keep `packages/providers` free of projects, state and the budget. It imports only core
  (`tests/package-boundaries.test.ts`).
- A new provider-specific rule belongs in the adapter or the model role, not in `generate.ts` or core (G-97).
- Every recorded spend has a manifest line. Do not raise `spentUsd` any other way (G-88).

## Typical pitfalls

- fal submissions are retried without an idempotency key, so a retry can charge twice (G-86).
- The budget check counts cache hits at full price. The queue's one-item batches mean the batch cap never guards
  a whole run (intended, ADR 0041).
- The cache is shared by every project of the workspace, and its key also hashes reference paths (G-99).
- A paid call that returns no file leaves no manifest line and no spend (G-87).
- `budget.reservedUsd`, `beforeGenerate` and the `retries` block in `defaults.yaml` are dead (G-90–G-92).
- Lip-sync ignores `--provider`. Reference-to-video always runs on ComfyUI. `audio.*` defaults to ComfyUI.
- `docs/providers.md`, `comfyui/README.md` and ADR 0017 describe older capabilities and LTX as the local lip-sync.
  The code and `models.yaml` run Pika first (G-93, G-94).

## Read next

- `docs/glossary.md`, `docs/providers.md`, `comfyui/README.md`
- `docs/adr/0006-fal-adapter-cache-budget.md`, `0011`, `0014`, `0017`, `0021`, `0026`, `0027`,
  `docs/adr/0041-generation-funnel.md`
- `docs/domain/events.yaml`, `docs/domain/context-map.as-is.md`, `docs/domain/gap-register.md`
- `.claude/rules/verdict.md` (the queue that calls this slice)
