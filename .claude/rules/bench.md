---
paths:
  - "packages/cli/src/bench.ts"
  - "packages/cli/src/bench-report.ts"
  - "packages/core/src/bench.ts"
  - "tests/bench.test.ts"
  - "tests/bench-characterization.test.ts"
  - "bench/**"
  - "workspace/.claude/skills/model-bench/**"
---

# Model bench (BC-Bench)

> Concept slice across core (schemas), the CLI (commands, measurement, the comparison page), `bench/`, and the
> `model-bench` skill. Adopted 2026-11-22. Decided by recommendation plus four answers from the user. The model is in
> `docs/domain/events.yaml` (`AGG-BenchCase`, `AGG-BenchRun`, `AGG-BenchBudget`), the decisions in ADR 0048
> (proposed, amends 0020), and gaps G-193–G-206 in `docs/domain/gap-register.md`.

## Purpose

The model bench replays fixed scenes from past projects on several bench targets. It is used before switching a
workflow, checkpoint, server or provider. Each result is measured. The art director scores it against the case's
rubric, and the user rates it. The skill ends with a recommendation per operation. The bench has its own budget and
never produces project assets.

## Key terms

Model Bench, Bench Case, Bench Set, Bench Target, Bench Fixture, Known Good Result, Bench Run, Bench Result, Frame
Strip, Rubric, Bench Score, Rating, Bench Budget (`docs/glossary.md`).

## As-is boundary

- `packages/core/src/bench.ts`: `BenchCaseSchema` with its cross-field rules, `BenchTargetsFileSchema`,
  `BenchConfigSchema`, `BenchScoreSchema`, the loaders, `selectBenchCases`, `rubricScore`. Core imports no package.
- `packages/cli/src/bench.ts`: `bench list`, `import`, `run` and `report`. It also does VRAM sampling, ffprobe, the
  frame strip, the lip-sync review clip, transcription and the word error rate, the timings ledger and score
  loading. The run, result and state types are interfaces only.
- `packages/cli/src/bench-report.ts`: `summarizeTargets` and the self-contained comparison page. Ratings are stored in
  localStorage under `bench-ratings:<run id>`.
- Every generation is a one-item `runBatch` (ADR 0041). The bench passes its own `BatchTarget` (`bench/state.json`,
  `bench/manifest.jsonl`), the target's `providerFactory`, and cache key extras for a remote server, `--fresh` and
  `--repeat`. It shares the workspace's generation cache.
- `workspace/.claude/skills/model-bench/` drives a comparison. `scoring.md` is what the art director follows (its
  step 9).

## Boundaries

- Write only under `bench/`. Never write a project file or a project budget.
- Generate only through `runBatch`. Call a provider directly only for status (`checkComfyUI`, `/system_stats`).
- Keep case params portable. ComfyUI node ids belong in a target.
- A case names its source project by slug and its fixtures by paths inside it. The user's cases belong to their
  workspace; upstream ships generic examples (ADR 0048).
- A new file format in a run gets a schema in core (G-202).

## Typical pitfalls

- The tracked cases are the maintainer's scenes and ship to every workspace. Elsewhere every fixture is missing
  (G-193, medium).
- `update` merges `bench.yaml`, `targets.yaml` and the cases like any runtime file. A case removed upstream is deleted
  from the workspace (G-194, medium).
- A rerun with the run id runs every item again, and an ok result can be replaced by an error (G-195).
  `--repeat`'s second render is cached across invocations (G-196).
- Without `batch_cap_usd`, each generation falls back to 30 % of the remaining budget, although the whole run passed.
  A dry run over budget throws (G-197).
- The refusal pattern matches "not allowed" and "policy" in any message (G-198).
- The page colours by percentage only, counts a scored error, and its time legend says "fresh only" (G-199).
- A target's workflow folder is ignored when Pika is classified (G-100). A reference-to-video swap on a non-ComfyUI
  target renders locally (G-201).
- Local and ComfyUI targets cost $0, so the bench budget only guards paid targets.

## Read next

- `bench/README.md`, `docs/providers.md` (the bench section)
- `docs/adr/0020-model-bench.md`, `docs/adr/0041-generation-funnel.md`, `docs/adr/0048-bench-in-the-workspace.md`
- `.claude/rules/generation.md` (the funnel, the cache, G-100), `.claude/rules/verdict.md` (the art director)
