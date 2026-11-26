---
status: accepted
date: 2026-11-21
---

# Generation: one path, a budget check per batch, a workspace cache, and planned spend

## Status

Accepted — 2026-11-21; accepted by the user on 2026-11-26. Records decisions already in the code. Amends
[ADR 0006](0006-fal-adapter-cache-budget.md) (the interface, resumable batch state, the budget check),
[ADR 0014](0014-comfyui-local-video.md) (ComfyUI's scope), and [ADR 0017](0017-ltx-lipsync-flf2v-official-templates.md)
(the local lip-sync, already changed by [ADR 0027](0027-pika-lipsync-audio-guide.md)). The adoption of the
generation slice recovered it. The user answered four questions about how they work and has not reviewed the code.

## Context

ADR 0006 sets the adapter interface, the hash cache, the manifest, and the budget guard. ADRs 0011, 0014, 0015,
0017, 0021, 0026, and 0027 add adapters, operations, and lip-sync routes. The code has since grown to nine
operations and five callers. No ADR says that every caller takes the same path, how the budget check treats cache
hits and queue runs, that the cache is shared across projects, or that spend is the planned cost. The glossary,
`docs/providers.md`, and `comfyui/README.md` partly contradict the code (`docs/domain/adoption-report.md`,
generation).

The user uses all four providers (fal.ai, Higgsfield, Topview, and ComfyUI). Generation runs only through the
stages and the queue, never by hand. The user reads spend on the board and does not compare it with the
providers' bills. Only the agent changes the model roles.

## Decision

- **One generation path.** Every media generation goes through `runBatch` (`packages/cli/src/generate.ts`):
  `generate`, each attempt of the generation queue, region patches, the voice track, and the bench. No caller
  calls an adapter around it.
- **Model roles in configuration.** A generation names a model role (`config/models.yaml`). The project's provider
  for that kind of role picks the role's base entry or its provider alternative. A project may override a role's
  model. A model switch changes the model roles, not the code, and only the agent changes them, at the user's
  request. A paid provider runs a role only with a known price. ComfyUI and mock generations cost nothing.
- **A budget check per batch, worst case.** Before the first call, the batch's worst-case estimate, cache hits
  included, must fit both the remaining budget and the batch cap (`batch_cap_usd`, or 30 % of the remaining
  budget, never more than the remaining budget). A dry run is checked the same way. The queue sends one item per
  batch, so a queue run is guarded by the project budget, not by the batch cap.
- **One workspace cache, keyed by content.** A generation with the same cache key reuses the earlier result at no
  cost while its files exist. The cache is shared by every project and series of a workspace. The key depends on
  what the provider is sent and on the content of the reference and audio files, not on their paths.
- **Planned spend, equal to the manifest.** Every new paid generation is billed at its planned cost and saved to
  the project state after each item. Every generation, whether new, reused, or failed, is one manifest line. The
  manifest's costs add up to the recorded spend. The provider's actual charge stays in the adapter's raw result.
- **No double charge.** An adapter retries a paid submission only with an idempotency key the provider honours,
  or only while the provider cannot have accepted it.
- **Provider rules in adapters and model roles.** What a provider can do and how it is called belongs in its
  adapter or in its model roles. The provider list exists once. Adding a provider means an adapter and a list
  entry, as ADR 0021 says.
- **Capabilities as they are.** The cloud adapters make stills, edits, text-, image-, and first-last-frame-to-video
  clips, and lip-sync. ComfyUI also makes reference-to-video clips, audio, and the restore pass. Local lip-sync
  runs Pika first and LTX as a fallback (ADR 0027). Lip-sync falls back to fal.ai when the video provider is
  ComfyUI or Topview. There is no resumable batch state; the cache and the per-item spend make a rerun cheap.

## Consequences

- Candidate 06 (2026-11-25) closed the `spend` and `estimate` gaps this ADR listed: the command is gone, so
  only the generation path writes spend, and `estimate` shares the generation path's price rule and checks the
  remaining budget as well as the batch cap.
- Several of these rules are ahead of the code (gaps G-86 and later in `docs/domain/gap-register.md`):
  - fal submissions are retried without an idempotency key.
  - The cache key hashes reference paths.
  - A paid call that returns no file breaks the rule that the manifest equals the spend.
  - About 280 lines of ComfyUI routing sit in `generate.ts`, and the provider list is kept five times.
- `budget.reservedUsd`, the runner's `beforeGenerate` hook, and the `retries` block of `config/defaults.yaml` are
  dead and will be removed.
- The glossary is corrected now. `docs/providers.md`, `comfyui/README.md`, and the ai-clips skill still describe
  the older capabilities and lip-sync defaults. The agent reads them when it changes the model roles.
