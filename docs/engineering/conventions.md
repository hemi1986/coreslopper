# Engineering conventions – coreslopper

> How the code is built here, recovered by `/adopt` (slices: project and stage pipeline; human review; generation queue and verdicts; timing; storyboard; generation – 2026-11-21). The ADRs
> decide WHAT; this file says HOW. Sections other slices own are marked as such. When code and this file
> disagree, raise it – don't silently follow either.

## Module layout

| Path | What belongs there | May import |
|---|---|---|
| `packages/core/src/` | Zod schemas (`schema.ts`, the source of truth, ADR 0004), state machine (`state.ts`), project loader (`project.ts`), budget checks (`cost.ts`), pure read models (`production.ts`), timing, hashes, errors | nothing outside core |
| `packages/providers/src/` | generation, publish and post adapters, the cache/manifest runner | core |
| `packages/remotion/src/` | Remotion compositions and motion components | core (`@coreslopper/core/browser` only) |
| `packages/cli/src/` | every command (`index.ts` wires them), the board server and its static page (`board/*.js`), the watchdog | core, providers, remotion |
| `scripts/` | Python helpers (audio analysis, review player) and the runtime build | – |
| `workspace/` | the workspace root: media skills, agents, commands, hook | – |

Packages resolve each other through `tsconfig.json` `paths` and the matching `resolve.alias` in
`vitest.config.ts`, not through manifest dependencies. `cli` reaches `remotion` with a relative path.

## Monorepo and shared libraries

npm workspaces (`packages/*`), but no package builds or tests on its own: `npm test` (Vitest over
`tests/**/*.test.ts`) and `npm run typecheck` (`tsc --noEmit`) run over the whole repository, and CI runs the
same. There is no affected-test selection. `runtime/` is build output (`npm run build`), gitignored; never read
it as source. The generated overview is `docs/architecture/repo-map.md`.

## Architecture enforcement

- Import direction: `docs/architecture/boundaries.yaml` (scan engine), run by `docs/engineering/checks.yaml`.
  Existing violations live in `docs/architecture/boundaries.baseline.json`; only new ones fail.
- Artifact schemas: the workspace hook (`workspace/.claude/hooks/validate-artifacts.mjs`) runs
  `validate-file` on every agent edit of `state.json`, `project.yaml` and the other project files.
- There is no linter.

## Commands and events

A state-changing command is a CLI command: `loadProject` (parses `project.yaml` and `state.json`, migrates the
state in memory), one core transition (`setStageRunning`, `setStageDone`, `setStageFailed`, `setStageSkipped`,
`resetStage`, `recordSpend`), then `saveState` (atomic: temp file plus rename). As-is:

- Transitions mutate the loaded `State` in place and return it; they check only that the stage ID exists.
- There is no write lock on `state.json` (`withFileLock` in `packages/cli/src/file-lock.ts` is used by review
  and release only) and no version check.
- Errors are typed: `ValidationError`, `BudgetError`, `ConfigError` (`packages/core/src/errors.ts`).
- File writes outside `state.json` that two writers share take `withFileLock` (review notes and rounds:
  `review/.notes.lock`; release files). Python helpers write atomically but take no lock.
- There is no event journal. `state.json` holds current state only; the watchdog derives events (stage started,
  done, failed, stalled) by diffing snapshots into `.cache/watch/`.
- IDs: project and series slugs (kebab-case folder names), stage IDs from the kind's stage list in `state.ts`.
- Orchestration rules – interactive gate, review-mode stop, hard stops, batch size – live in agent instructions
  (`workspace/.claude/commands/video-next.md`), not in code.
- The generation queue is the exception to "rules in core": its states, transitions and Zod schema live in
  `packages/cli/src/queue.ts`, the verdict type and the blocking-defect rule in `review-image.ts` (gap G-39).
  `queue.json` is written whole through temp file and rename, without a lock (G-32).
- Long-running work is a background process with its own lock file and a `wait` command (`queue run` /
  `queue wait`, `assets/queue.lock`); a stage runner starts it with the Bash tool's `run_in_background`.
- Agent judgement inside a command runs headless: `claude -p --agent <name> --json-schema <schema>`
  (`review-image.ts` `claudeRunner`), binary and timeout from `CORESLOPPER_CLAUDE_BIN` and
  `CORESLOPPER_REVIEW_TIMEOUT_MS`.
- Measurement that needs heavy models runs in Python, not in a CLI command: the stage runner calls
  `scripts/audio-analysis/analyze.py` through `uv run` (ADR 0008). The contract between Python and TypeScript is
  the JSON Schema generated from Zod (`npm run schema`, `schema/timing.schema.json`); the Python side writes the
  file, the TypeScript side merges and checks it. Python writes `timing.json` with a plain write, not atomically.
- `loadProject` merges `timing.json` with `timing.overrides.json` and checks the result on every load
  (`project.ts:237-241`), so every command sees the effective timing and a broken timing breaks every command
  (gap G-54). `validate` writes the snapshot `timing.effective.json` for agents and scripts.
- A project artifact the agent writes (`storyboard.yaml`) is checked as a whole by one core function
  (`resolveStoryboard`), reached only through `validateProject` in cli; the hook runs it on every agent edit and
  blocks a failing one. Consumers that build from shots take the resolved storyboard from `validateProject`;
  `buildShotItems` and QA's continuity checks still read the raw one (G-72). Kind-specific checks are branches on
  an optional context (`EpisodeContext`), not a second model.
- Every media generation is one call of `runBatch` (`packages/cli/src/generate.ts`), whoever asks: `generate`,
  the queue (one item per call), `patch`, `voice-track`, the bench. It resolves each item's model role and
  provider, checks the worst-case estimate once, runs one `GenerationRunner` per provider, and records the
  planned cost and saves the state after each new result. Do not call an adapter around it (ADR 0041).
- The runner in `packages/providers` owns the generation cache (`<workspace>/.cache/generations/<key>/`) and the
  manifest append; cli owns the budget, the state and the paths; providers know no project.
- Models, params and prices live in `config/models.yaml`, never in code; a model switch is a configuration change
  made by the agent. Provider-specific routing still sits in `generate.ts` `resolveItem` and `models.ts` (G-97).
- Adapters take an injectable `fetchImpl` and poll interval; HTTP calls go through `fetchJsonWithRetry` and
  downloads through `downloadOutputs` (`packages/providers/src/http.ts`). Each adapter keeps its own timeout and
  poll loop (G-98); a submission is retried only with an idempotency key (G-86).
- User-owned files (`timing.overrides.json`, `lyrics.txt`, imported stems, `project.yaml`) are never replaced by
  a tool; a command that would do so is a hard stop.

## Read models

Pure functions over loaded files: `stageViews`, `productionPhase`, `projectNextAction`, `seriesNextAction`
(`packages/core/src/production.ts`); `status` (`packages/cli/src/status.ts`); the board's production view
(`packages/cli/src/board-production.ts`), which reads files and never writes. The board polls every 10 s.

The resolved storyboard (shots in seconds and frames) is made on demand and never stored; render passes it to
Remotion unchanged as props, apart from public asset paths (`render.ts:98-111`). Derived documents of the
storyboard (`storyboard.md`, `review/contact-sheet.svg`) are written once and go stale when the YAML changes
(G-70, G-81). Lists that core and Remotion both need (motion components) are kept twice today (G-75).

Timing lookups (`sectionAt`, `energyAt`, `beatIndexAt`) and anchor resolution (`resolveAnchor`) are pure
functions over the effective timing in `packages/core/src/timing.ts`; Remotion has its own copies today (G-59).

## Time-based rules

As-is, core reads the clock itself (`new Date()` in every transition and in `createInitialState`); it cannot be
injected. The watchdog takes `options.now` (`packages/cli/src/production-watch.ts`). Vitest pins `TZ`.

## UI and texts

English only. CLI messages are inline strings; the board's texts are inline in the static modules in
`packages/cli/src/board/`. There is no message catalog.

## Test data and seams

Tests live in `tests/`, one file per concern, Vitest, mock provider, no API keys. Test data is built inline
(`ProjectConfigSchema.parse({...})` plus `createInitialState`); file-based tests write a project into a temp
directory. `tests/helpers/release-fixture.ts` builds release projects.

### Seam catalog

| Kind of code | Seam | Test type | Example |
|---|---|---|---|
| Pure domain rule | the core function (`setStageDone`, `nextStage`, `recordSpend`, `projectNextAction`) | unit | `tests/state.test.ts`, `tests/board-production.test.ts` |
| Command | the CLI command or the function it calls, on a project in a temp directory | integration | `tests/episode.test.ts` |
| Read model | the read-model function on a project in a temp directory | integration | `tests/board-production.test.ts` |
| Page, form, flow | the board's HTTP API | integration | `tests/board-review.test.ts` |
| Queue run | `runQueue(dir, { deps })` with injected `generate`, `review`, `restart`, `log` (`QueueDeps`) | integration | `tests/queue.test.ts` |
| Headless agent | `reviewImage(dir, { runner })` with a fake runner returning the JSON | unit | `tests/review-image.test.ts` |
| Python helper | the helper's functions | unit (pytest, `npm run python:test`) | `scripts/review-player/tests/test_review_notes.py`, `scripts/audio-analysis/tests/test_timing_core.py` |
| Song analysis | `analyze.py --no-separate --skip-asr --schema …` on a fixture project; no model loads | integration (pytest) | `scripts/audio-analysis/tests/test_analyze_integration.py` |
| Timing rule | `mergeTiming`, `assertTiming`, `resolveAnchor` on an inline `Timing` | unit | `tests/timing.test.ts`, `tests/timing-characterization.test.ts` |
| Storyboard rule | `resolveStoryboard` on an inline `Storyboard`, `Timing`, style and character bible | unit | `tests/storyboard-characterization.test.ts`, `tests/continuity.test.ts` |
| Generation runner | `GenerationRunner` with `MockProvider` (or a stub provider), a temp cache dir and manifest | unit | `tests/providers.test.ts`, `tests/generation-characterization.test.ts` |
| Generation batch | `runBatch(target, items, { dryRun, providerFactory, cacheKey, log: false })` on an inline `BatchTarget`; a unique `cacheKey` keeps the workspace cache out of it | integration | `tests/generate-workflow.test.ts`, `tests/generation-characterization.test.ts` |
| Provider adapter | the adapter with a fake `fetchImpl` (cloud) or a fake ComfyUI server | unit | `tests/fal-provider.test.ts`, `tests/topview.test.ts`, `tests/comfyui.test.ts` |
| Agent instruction | not testable deterministically | – | `workspace/.claude/commands/video-next.md` |
