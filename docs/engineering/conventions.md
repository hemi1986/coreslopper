# Engineering conventions – coreslopper

> How the code is built here, recovered by `/adopt` (slice: project and stage pipeline, 2026-11-21). The ADRs
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
- There is no event journal. `state.json` holds current state only; the watchdog derives events (stage started,
  done, failed, stalled) by diffing snapshots into `.cache/watch/`.
- IDs: project and series slugs (kebab-case folder names), stage IDs from the kind's stage list in `state.ts`.
- Orchestration rules – interactive gate, review-mode stop, hard stops, batch size – live in agent instructions
  (`workspace/.claude/commands/video-next.md`), not in code.

## Read models

Pure functions over loaded files: `stageViews`, `productionPhase`, `projectNextAction`, `seriesNextAction`
(`packages/core/src/production.ts`); `status` (`packages/cli/src/status.ts`); the board's production view
(`packages/cli/src/board-production.ts`), which reads files and never writes. The board polls every 10 s.

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
| Agent instruction | not testable deterministically | – | `workspace/.claude/commands/video-next.md` |
