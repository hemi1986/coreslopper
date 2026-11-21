---
name: model-bench
description: Benchmark image, video, lip-sync, or voice models against fixed scenes from past videos. Use when comparing a new ComfyUI workflow, a quantized checkpoint, a remote server, or a paid provider with the current setup.
license: MIT
---

# Model bench

The bench renders fixed **bench cases** (critical scenes from past projects: dancing, several people, hands, lip-sync, text, identity) on several **bench targets** and scores each result against the case's rubric. Cases and targets are tracked in `bench/`; fixtures, runs, and spend stay local. Rationale: [ADR 0020](../../../docs/adr/0020-model-bench.md).

## Inputs

- What the user wants to compare, in their words: e.g. "Qwen Image normal vs. Turbo", "LTX int8 on the remote box", "Kling vs. local for dance".
- `bench/targets.yaml`, `bench/cases/*.yaml`, `bench/bench.yaml` (budget).

## Steps

1. **Targets.** Run `npm run cli -- bench list`. Map the user's comparison to target names. A target that does not exist yet goes into `bench/targets.yaml`: copy the closest entry, set `model` to the workflow name (`comfyui/workflows/<model>.json`) or provider slug, `comfyui_url` for another server, `pricing` for a paid model without a price in `config/models.yaml`. For a new ComfyUI workflow, run `npm run cli -- doctor` and check that it fits the operation. Always include the current default (`local`, or the provider in use) as the baseline. Done when every compared model is a target and `bench list` shows it.
2. **Cases.** Pick the set: `smoke` to check that a new target works at all, `core` for a real comparison, or `--cases` for the cases the user's question is about (e.g. only lip-sync cases for a lip-sync model). Done when the selection covers the operations the targets differ in.
3. **Fixtures.** If `bench list` shows missing fixtures, run `npm run cli -- bench import --from <workspace>` with the workspace that holds the source projects (ask the user for the path once). Done when every selected case shows `fixtures ok` (a missing `golden` only removes the reference column).
4. **Estimate.** `npm run cli -- bench run --targets <a,b> --set <set> --dry-run`. A paid target needs the estimate inside the bench budget; raise `budget_usd` in `bench/bench.yaml` only when the user agrees. Add `--seeds 2` or `3` when variance matters (a model that fails one seed in three is expensive in the pipeline), `--repeat` to test determinism on a new server, `--fresh` to measure time again instead of reusing cached results, `--transcribe` for speech cases.
5. **Run.** The same command without `--dry-run`. Long runs belong in the background; the run writes `bench/runs/<id>/run.json` after every generation, so a rerun with the same `--id` resumes and fills gaps. Done when every planned result is `ok`, `refused`, or an `error` you have read and understood (a missing workflow or credential is a target fix, not a model verdict).
6. **Score.** Dispatch one `art-director` agent per case (in parallel), each with the run directory, the case file, and [scoring.md](scoring.md). Each writes `bench/runs/<id>/scores/<case>.json`. Do not view the media in the main context. Done when every `ok` and `refused` result of the run has a score.
7. **Report.** `npm run cli -- bench report <id>` rebuilds `bench/runs/<id>/index.html`. Give the user the path and tell them they can grade each cell on the page and export `ratings.json` into the run folder; `bench report` then shows their grades next to the rubric.
8. **Verdict.** Summarise per operation, from the report data (`run.json`, the scores, and `ratings.json` if present): rubric mean, worst seed, time per generation, VRAM peak, cost, refusals, determinism. Name the cases where the targets differ most and what fails. End with a recommendation per operation (keep, switch, or use only for some shots, e.g. "LTX int8 for calm shots ≤ 2 s, Kling for dance") and the `config/models.yaml` change it implies. Change `config/models.yaml` only when the user asks.

## Adding a case

A case is one scene that once broke or was hard: copy a case file, take prompt, seed, references, and the accepted result from the source project's `assets/manifest.jsonl` (search by the accepted file's hash prefix), name its failure mode in `focus`, and write 3-6 rubric criteria that each catch one way it fails, weighted by how much that failure costs. Keep params portable: workflow node IDs belong in a target, not in a case. Validate with `npm run cli -- bench list`, then `bench import`.
