# A model bench in `bench/`

## Status

Accepted — 2026-11-14. Builds on [ADR 0006](0006-fal-adapter-cache-budget.md), [ADR 0014](0014-comfyui-local-video.md), and [ADR 0017](0017-ltx-lipsync-flf2v-official-templates.md).

## Context

Model choices were made inside projects. Ich tu dir nichts found that local LTX lip-sync needs a face close-up and a tight vocal segment, and that local LTX holds a dancing face for about 2 s while Kling holds it for 3. Zukunft auf Kredit found the hostess and manager recipes for several distinct people, and which hand poses survive a clip. Each finding cost a tuning session, and none of it could be replayed: when a new workflow (Qwen Image instead of Turbo, an int8 LTX checkpoint) or another GPU server appears, the only way to judge it was to start a project on it.

The scenes that broke are known, and their prompts, seeds, inputs, and accepted results are all in the projects' manifests.

## Decision

- **A model bench lives in `bench/`.** Bench cases (`bench/cases/<id>.yaml`) are scenes from past projects that once failed or were hard: the prompt and seed from the manifest, the inputs, the known good result, the failure mode in one sentence (`focus`), and a weighted rubric. Cases belong to sets (`core`, `smoke`). Params in a case are portable; workflow node IDs belong in a target.
- **Bench targets (`bench/targets.yaml`) name a way to run operations**: a provider, and per operation a ComfyUI workflow or model slug, params, and a price. A ComfyUI target may name another server (`comfyui_url`) and workflow folder. A target runs only the operations it lists; the other cases are skipped, not failed. A new workflow is one new target, and `config/models.yaml` stays untouched until a bench shows the switch is worth it.
- **Fixtures are imported, never committed.** Inputs come from the user's projects (their songs, their face). `bench import --from <workspace>` copies them, or cuts a vocal window from a stem, into the gitignored `bench/fixtures/`. The repository holds only case text.
- **`bench run` reuses the generation path.** Each result goes through `runBatch`: role defaults, case params, then target params; cost estimate, cache, manifest. The bench has its own budget (`bench/bench.yaml`, spend in `bench/state.json`) and checks the whole run against it before the first call. The cache key gains the ComfyUI URL for a remote target, a repeat index for `--repeat` (determinism: the same request twice, bytes compared), and an invocation stamp for `--fresh` (time measured again).
- **Measured mechanically:** wall time per generation (recorded on the first generation, reported again on a cache hit), cost, output size, length, fps, VRAM peak sampled from ComfyUI's `/system_stats` while the job runs, provider refusals (a refusal is a result), and with `--transcribe` the word error rate of speech against the case text.
- **Judged twice.** The `art-director` scores each result against the case rubric (0/1/2 per criterion) into `scores/<case>.json`, one agent per case. The user grades results 1-5 on the comparison page `bench/runs/<id>/index.html`, a local HTML file; grades are kept in the browser and exported as `ratings.json` into the run folder, where `bench report` and the agents read them.
- **The `model-bench` skill drives a comparison**: map the question to targets and cases, estimate, run, score, report, and end with a recommendation per operation.

## Alternatives considered

- **Bench inside the user's workspace only.** The mechanism, schemas, and cases would not reach other workspaces through `update`. Cases are text and carry no media, so they can ship; fixtures stay local.
- **Neutral, committed stand-in inputs.** Free to share, but the point is to replay the scenes that actually broke, with the inputs that broke them.
- **Model selection through `config/models.yaml` and `--provider` only.** No way to compare several variants in one run or to point one variant at another server.
- **Automatic ML metrics (face-embedding identity, SyncNet).** Heavy GPU dependencies, and they miss what fails in practice: a finger wandering onto the lips, a push-in, a CGI doll face, pseudo-text on a blank board. A rubric written from those failures, plus the user's eye, measures what decides a shot.
- **A claude.ai artifact for the comparison page.** Stores grades centrally, but the page shows private media; a local file keeps it on the machine.

## Consequences

- A bench run on the `core` set is 25 generations per target and seed: minutes locally, a few dollars on paid targets.
- Scores depend on the art director's judgement; the user's ratings are the tie-breaker. Rubrics should name observable failures, not taste.
- VRAM is sampled, not traced: a short spike between samples can be missed, and models kept loaded from an earlier job count. Compare targets that start from the same server state.
- Case prompts come from projects written for older workflows (`ltx-av`); a case is a fixed input, not a recommended prompt.
