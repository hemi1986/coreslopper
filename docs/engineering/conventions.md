# Engineering conventions – coreslopper

> How the code is built here, recovered by `/adopt` (slices: project and stage pipeline; human review; generation queue and verdicts; timing; storyboard; generation – 2026-11-21; series; bibles and the character library; render; release; publishing; the workspace – 2026-11-22). The ADRs
> decide WHAT; this file says HOW. Sections other slices own are marked as such. When code and this file
> disagree, raise it – don't silently follow either.

## Module layout

| Path | What belongs there | May import |
|---|---|---|
| `packages/core/src/` | Zod schemas (`schema.ts`, the source of truth, ADR 0004), state machine (`state.ts`), project loader (`project.ts`), budget checks (`cost.ts`), pure read models (`production.ts`), timing, hashes, errors | nothing outside core |
| `packages/providers/src/` | generation, publish and post adapters, the cache/manifest runner | core |
| `packages/remotion/src/` | Remotion compositions and motion components: pure functions of props and frame, no file access | core: runtime values from `@coreslopper/core/browser` only; `import type` from `@coreslopper/core` is erased and allowed |
| `packages/cli/src/` | every command (`index.ts` wires them), the board server and its static page (`board/*.js`), the watchdog | core, providers, remotion |
| `scripts/` | Python helpers (audio analysis), the runtime build and its file classification (`runtime-files.mjs`), the sandbox | – |
| `workspace/` | the workspace root: media skills, agents, commands, hook | – |

Packages resolve each other through `tsconfig.json` `paths` and the matching `resolve.alias` in
`vitest.config.ts`, not through manifest dependencies. `cli` reaches `remotion` with a relative path (`src/types.ts`, `src/lib/thumbnail.ts`, `webpack-override.ts`; `bundle()` takes `src/index.ts`); `remotion` has no `exports` field (HS-158).

## Monorepo and shared libraries

npm workspaces (`packages/*`), but no package builds or tests on its own: `npm test` (Vitest over
`tests/**/*.test.ts`) and `npm run typecheck` (`tsc --noEmit`) run over the whole repository, and CI runs the
same. There is no affected-test selection. `runtime/` is build output (`npm run build`), gitignored; never read
it as source. The generated overview is `docs/architecture/repo-map.md`.

Packaging (workspace slice):
- Two CLIs share one source tree. `packages/cli/src/npx.ts`, bundled by tsup into `dist/cli.js`, is what
  `npx coreslopper` runs: `init`, `update`, `doctor [dir]`, `new`, `status`, `validate`. `index.ts`, run with tsx as
  `npm run cli` inside a workspace, is the full CLI. `update` exists only in the npx CLI, `migrate-layout` only in
  the workspace CLI. Decided: npx owns `init` and `update`; the workspace CLI drops its `init` (HS-216, G-188).
- The bundle inlines core and providers and keeps only `commander`, `yaml`, `zod` and `@clack/prompts` external.
  Remotion and React are development dependencies, so nothing in the npx path may import them. Only the CI pack
  smoke test checks this (G-192).
- A new tracked path ships or stays upstream by `scripts/runtime-files.mjs`; classify it in the same change.
  `workspace/` becomes the workspace root. A test that ships may import only shipped files, so a test of
  `scripts/runtime-files.mjs` lives in `tests/runtime-files.test.ts`, which does not ship.
- The skipped directories and the `.env` filter exist three times: `runtime-files.mjs`, `update.ts`, and `init.ts`.
  Change all three until they are one (G-190).

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
- Take status, the blocking rule (`packages/cli/src/takes.ts`) and the series budget sum (`series.ts`) also live
  in the CLI; they belong in core (G-116). Episode audio work shells out to ffmpeg through `resolveBinary`
  (`media.ts`); it is deterministic, with fixed gains and a loudness target, and uses no speech recognition.
- The bibles' rules are schemas in core (`schema.ts`); the character library's rules – entry matching, content
  dedupe, import and use – live in `packages/cli/src/character-library.ts`, and the display rules, file types and
  reference kinds are repeated in the CLI and the board's JS (G-132). The set library (`set-library.ts`, ADR 0052)
  shares the entry id, field text, tags, name→id, file limits, the content-wise copy, the source label and the kind
  of target a copy may go into (`libraryTargetKind`) with it through `library-entry.ts`; its import and entry
  matching live in `set-library.ts`, as the character library's do in `character-library.ts`. Library,
  `references.yaml`
  and character-use writes are atomic but unlocked (G-130). An episode's bibles are the canon's: read them through `loadProject`,
  never from the episode folder.
- Rendering: the CLI owns all input, output and encoding. `buildVideoProps` (`packages/cli/src/render.ts`) turns
  the validated project into serializable props, `stagePublicDir` links only the referenced folders into a staged
  public dir, `bundle()` and `renderMedia`/`renderStill` from `@remotion/*` do the frames, ffmpeg (`resolveBinary`,
  `.tools/ffmpeg/` first) joins segments and muxes the song. Work files stay in `.cache/render/`; only the finished
  file is copied into `renders/`, which may be a link into the media directory. Limits come from
  `CORESLOPPER_RENDER_CONCURRENCY`, `CORESLOPPER_VIDEO_CACHE_MB`, `CORESLOPPER_MEDIA_CACHE_MB` and
  `CORESLOPPER_SEGMENT_SECONDS`. A whole render records its inputs and file hash in `state.json` through
  `renderArtifactKeys`; read them through that function, not a literal (G-147). Renders take no lock (HS-155).
- Composed images: `thumbnail.ts` builds `ThumbnailProps` and renders one still of `Thumbnail`; layout and colour
  maths are pure functions in `packages/remotion/src/lib/thumbnail.ts`, and every image gets its recipe. Remotion
  is pinned to one exact version in `package.json`; determinism is promised per machine and version (HS-151).
- Long-running work is a background process with its own lock file and a `wait` command (`queue run` /
  `queue wait`, `assets/queue.lock`); a stage runner starts it with the Bash tool's `run_in_background`.
- Agent judgement inside a command runs headless: `claude -p --agent <name> --json-schema <schema>`
  (`review-image.ts` `claudeRunner`), binary and timeout from `CORESLOPPER_CLAUDE_BIN` and
  `CORESLOPPER_REVIEW_TIMEOUT_MS`.
- Measurement that needs heavy models runs in Python, not in a CLI command: the stage runner calls
  `scripts/audio-analysis/analyze.py` through `uv run` (ADR 0008). The contract between Python and TypeScript is
  the JSON Schema generated from Zod (`npm run schema`, `schema/timing.schema.json`); the Python side writes the
  file, the TypeScript side merges and checks it. Python writes `timing.json` with a plain write, not atomically.
  The exception is `pose-extract`: a stage runner may only call CLI commands, so the command runs
  `scripts/pose/extract.py` through `uv run --extra engine` and checks the written track with `PoseTrackSchema`
  (ADR 0054). Python writes the track atomically (temp file plus rename).
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
- Release: the rules for facts, limits, chapters, the canvas window and the calendar are pure functions in core
  (`packages/core/src/release.ts`, `calendar.ts`); the CLI does all file work. `buildRelease`
  (`packages/cli/src/release.ts`) places, generates and composes every file through one `ReleaseWriter`, renders a
  stale format through the render command, plans the calendar, and writes `manifest.json` last; a run writes only
  what changed and removes only files an earlier run wrote. Texts are laid out from the agent's `upload.yaml` in
  `release-texts.ts`; the board reads the same layout helpers. The release context (language, identity, defaults)
  and the folder layout exist twice today (G-162): add to one place and remove the other, never add a third.
- `review/release-status.json` is written only through `updateStatus`/`writeStatus` under `withReleaseLock`
  (`review/.release.lock`); the release folder, `manifest.json` and `calendar.yaml` take no lock today (G-161).
  The board accepts writes only from its own page (`trustedWrite`: loopback Host, same Origin, JSON body).
- Publishing: the autopilot's plan is a pure function in core (`planAutopilot`, `packages/core/src/autopilot.ts`);
  the runner (`runAutopilot`, `packages/cli/src/release-autopilot.ts`) does all I/O through `AutopilotDeps`
  (`publish`, `youtube`, `social`, `runCommand`, `env`, `now`, `log`). A round takes `.cache/release-run.lock`;
  each due event is claimed by planning again under the release lock and appending `running` to
  `review/autopilot.json` in the same lock, and the platform call runs outside it. YouTube and TikTok always go
  through `publishProject`, never around it, so the publish log's hash check covers both paths.
- Never twice: a post adapter sends the public post once (`attempts: 1`) and marks a failure that may have gone
  out with `markUncertain` (`packages/providers/src/publish/http.ts`); the runner logs it as `uncertain` and the
  plan makes it stuck. A `ConfigError` or `ValidationError` is fatal. Keep these classes when adding a platform;
  the YouTube upload and TikTok do not mark yet (G-168).
- Secrets: tokens live in `.env` only; write them through `saveEnvValue`, mask every message with `redactSecrets`
  before it is logged or written. `review/publish.json` and `.env` take no lock today (G-169).
- Workspace: `init` and `update` write `coreslopper.workspace.json` whole, as the last step before the install;
  `update` decides each runtime file against the baseline in one pass and installs file by file, so an
  interrupted update is repaired by running it again. Paths that `update` never overwrites are listed in
  `USER_OWNED_FILES` and `USER_OWNED_PREFIXES` (`packages/cli/src/update.ts`); add a user-owned path there and in
  `docs/onboarding.md` together. Tools install best effort, and a failure is a warning (`tools.ts`).
- Model bench: core holds only the case, target, configuration and score schemas, their loaders and pure helpers
  (`packages/core/src/bench.ts`); the CLI runs the commands and the measurement (`packages/cli/src/bench.ts`); the
  comparison page is a pure renderer (`bench-report.ts`). Every bench generation is a one-item `runBatch` with the
  bench's own `BatchTarget` (`bench/state.json`, `bench/manifest.jsonl`, the run's output folder), the target's
  `providerFactory` and the cache key extras; never call a provider around it. `run.json` is written whole after
  every result. A bench writes only under `bench/` and never into a project. Workflow node ids belong in a target,
  not in a case. The run, state and ratings files have no schema yet (G-202).
- Board shell: one request handler, `boardHandler` (`packages/cli/src/release-board.ts`), kept apart from
  `startBoard` so tests call it with a stub request. The shell writes no workspace file itself; a route reaches the
  owning context's module (`updateStatus`, `release-autopilot`, `board-review`, `board-wizard`,
  `character-library`). Every request that is not a GET passes `trustedWrite`; a file goes out through
  `serveMedia` from a whitelist. A `ValidationError` becomes a 400. New view routes go into a `<view>Route`
  function in the view's module, as the wizard and the library do (HS-251, G-214). The page is static ES
  modules in `packages/cli/src/board/` without a build step; each view registers its strings with `addStrings`.
- User-owned files (`timing.overrides.json`, `lyrics.txt`, imported stems, `project.yaml`) are never replaced by
  a tool; a command that would do so is a hard stop. The one exception: fixing a proposed release day writes
  `release.release_date` into `project.yaml`, keeping every comment (`setReleaseDate`,
  `packages/cli/src/release-autopilot.ts`; HS-177).

## Read models

Pure functions over loaded files: `stageViews`, `productionPhase`, `projectNextAction`, `seriesNextAction`
(`packages/core/src/production.ts`); `status` (`packages/cli/src/status.ts`); the board's production view
(`packages/cli/src/board-production.ts`), which reads files and never writes. The page does not poll:
the user refreshes with the button in the navigation, which keeps a view with a playing video or an edited field
(ADR 0049).
The release board's view is `boardProject` (`packages/cli/src/release-board-data.ts`), a pure read of the release
folder's manifest, `upload.yaml`, the calendar and the status; whether an approval holds is `approvalHolds`
(`packages/core/src/autopilot.ts`) wherever it is read (G-159).

The resolved storyboard (shots in seconds and frames) is made on demand and never stored; render passes it to
Remotion unchanged as props, apart from public asset paths (`render.ts:98-111`). Derived documents of the
storyboard (`storyboard.md`, `review/contact-sheet.svg`) are written once and go stale when the YAML changes
(G-70, G-81). Lists that core and Remotion both need (motion components) are kept twice today (G-75).

Timing lookups (`sectionAt`, `energyAt`, `beatIndexAt`) and anchor resolution (`resolveAnchor`) are pure
functions over the effective timing in `packages/core/src/timing.ts`; Remotion has its own copies today (G-59).
A `cue` edge on a line anchor also reads a meme's sound cues, by script line id (`soundCuesByLine`, ADR 0051);
`resolveStoryboard` takes them in its `StoryboardContext`, and every caller that resolves shot anchors passes them.

## Time-based rules

As-is, core reads the clock itself (`new Date()` in every transition and in `createInitialState`); it cannot be
injected. The watchdog takes `options.now` (`packages/cli/src/production-watch.ts`). Vitest pins `TZ`.
The release slice takes `now` everywhere (`ReleaseDeps.now`, `CalendarContext.now`, `updateStatus(…, now)`, the
board's `now`); calendar times are local ISO with the offset of the schedule's `timezone`, else the computer's
zone, so a calendar planned in the board container is in UTC unless `TZ` is set; `scheduleZoneWarning` (core) names it on
the board and in `doctor`. Status and manifest times are UTC.
The autopilot takes `now` through `AutopilotDeps.now`; the adapters take `now` and `sleep` (TikTok as a number,
X and Instagram as a `Date`). The YouTube quota day is Pacific time, the one hard-coded zone.

## UI and texts

English only. CLI messages are inline strings; the board's texts are inline in the static modules in
`packages/cli/src/board/`. There is no message catalog. The release texts, images, microsite data and the release
board have English and German labels behind a `startsWith('de')` switch, with German jurisdiction notes in both
(G-156); decided: English built in, other languages and jurisdiction notes as data (HS-176). Do not add a third
hard-coded language.

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
| Python helper | the helper's functions | unit (pytest, `npm run python:test`) | `scripts/audio-analysis/tests/test_timing_core.py` |
| Song analysis | `analyze.py --no-separate --skip-asr --schema …` on a fixture project; no model loads | integration (pytest) | `scripts/audio-analysis/tests/test_analyze_integration.py` |
| Pose track rule | tracking, gap filling, smoothing, cuts and quality in `scripts/pose/pose_core.py` on synthetic arrays, no models; the schema contract against `schema/pose-track.schema.json` | unit (pytest) | `scripts/pose/tests/test_pose_core.py` |
| Pose track command and sampling | `poseExtract(dir, options, { runExtractor, root, log })` with a fake extractor that writes a track; `samplePoseTrack`, `relativePose`, `poseBoneAngles` on an inline track | integration, unit | `tests/pose-track.test.ts` |
| Timing rule | `mergeTiming`, `assertTiming`, `resolveAnchor` on an inline `Timing` | unit | `tests/timing.test.ts`, `tests/timing-characterization.test.ts` |
| Storyboard rule | `resolveStoryboard` on an inline `Storyboard`, `Timing`, style and character bible | unit | `tests/storyboard-characterization.test.ts`, `tests/continuity.test.ts` |
| Generation runner | `GenerationRunner` with `MockProvider` (or a stub provider), a temp cache dir and manifest | unit | `tests/providers.test.ts`, `tests/generation-characterization.test.ts` |
| Generation batch | `runBatch(target, items, { dryRun, providerFactory, cacheKey, log: false })` on an inline `BatchTarget`; a unique `cacheKey` keeps the workspace cache out of it | integration | `tests/generate-workflow.test.ts`, `tests/generation-characterization.test.ts` |
| Script rule | `validateScript`, `takeSource`, `placeLines` on the demo script (`projects/demo-episode/script.yaml`) and canon | unit | `tests/episode.test.ts`, `tests/series-characterization.test.ts` |
| Series budget | `createSeries` / `createProject` in a temp workspace with copies of `config/`, `templates/` and `brand/` | integration | `tests/series-budget.test.ts` |
| Bible schema | `StyleBibleSchema`, `CharacterBibleSchema`, `SetBibleSchema`, `ReferencesSchema`, `LibraryCharacterSchema` `.safeParse` on an inline object | unit | `tests/continuity.test.ts`, `tests/character-characterization.test.ts` |
| Character library | `importCharacters`, `useCharacter`, `addLibraryCharacter`, `addLibraryFile`, `removeLibraryFile` on a temp workspace (a temp folder is enough without projects) | integration | `tests/character-library.test.ts`, `tests/character-characterization.test.ts` |
| Set library | `addLibrarySet`, `addLibrarySetFile`, `updateLibrarySet`, `removeLibrarySetFile`, `removeLibrarySet`, `importSets`, `useSet` on a temp workspace (a temp folder is enough), `listLibrarySets`; the board's Sets routes at their HTTP API | integration | `tests/set-library.test.ts` |
| Keyframe references | `shotReferences(project, shot)` on an inline `LoadedProject` and `Shot` with files in a temp folder | unit | `tests/character-characterization.test.ts` |
| Episode audio | `voiceTrack`, `importTakes`, `episodeTrack` on a temp copy of the demo canon and episode, mock provider; skipped without ffmpeg | integration | `tests/episode-track.test.ts` |
| Provider adapter | the adapter with a fake `fetchImpl` (cloud) or a fake ComfyUI server | unit | `tests/fal-provider.test.ts`, `tests/topview.test.ts`, `tests/comfyui.test.ts` |
| Render props and formats | `buildVideoProps`, `formatConfig`, `masterFormatId`, `outputPath`, `renderInputsHash` on an inline config or the demo projects | unit | `tests/episode-render.test.ts`, `tests/render-characterization.test.ts` |
| Short window | `parseTimePoint`, `shortWindow`, `shortFfmpegArgs` on an inline `Timing` | unit | `tests/release.test.ts` |
| Composed-image layout | the pure functions of `packages/remotion/src/lib/thumbnail.ts`, `buildThumbnailProps`, `thumbnailProblems` on a JPEG header | unit | `tests/thumbnail.test.ts`, `tests/render-characterization.test.ts` |
| Thumbnail recipe | `writeRecipe` / `readRecipe` on a temp copy of a project | integration | `tests/render-characterization.test.ts` |
| Media directory | `mediaDirFor`, `linkProjectMedia(dir, { mediaDir })` in a temp folder | integration | `tests/media-dir.test.ts` |
| Release package | `buildRelease({ projectDir, deps: fakeDeps() })` on `fixture()` from `tests/helpers/release-fixture.ts` – probe, ffmpeg, render, thumbnail and `now` injected | integration | `tests/release-folder.test.ts` |
| Release rule | `platformTextProblems`, `chapterProblems`, `releaseTodos`, `canvasWindow` on inline upload data and timing | unit | `tests/release-folder.test.ts`, `tests/release-characterization.test.ts` |
| Release calendar | `buildCalendar(input, { schedule, now, existing, others })` with `ReleaseScheduleSchema.parse({ version: 1 })` | unit | `tests/release-calendar.test.ts`, `tests/release-characterization.test.ts` |
| Release board | `boardHandler({ root, now, refresh })` over a fixture workspace | integration | `tests/release-folder.test.ts` |
| Autopilot plan | `planAutopilot({ calendar, status, log, settings, now })` on a calendar from `buildCalendar` | unit | `tests/release-autopilot-plan.test.ts`, `tests/publish-characterization.test.ts` |
| Autopilot round | `runAutopilot({ root, deps })` with `MockPublisher`, `MockSocialAdapter`, a fake `runCommand` and a moving clock over `fixture()` | integration | `tests/release-autopilot.test.ts` |
| Publish | `publishProject({ projectDir, adapters, probe, now })` with `MockPublisher` or an adapter on a fake `fetchImpl` | integration | `tests/publish.test.ts` |
| Post adapter | `XPublisher`, `LinkedInPublisher`, `InstagramPublisher` with a fake `fetchImpl` router | unit | `tests/publish-x.test.ts`, `tests/publish-linkedin.test.ts`, `tests/publish-instagram.test.ts` |
| Timer | `timerPlan({ root, kind, env, home, nodeBin })` – the files and commands, nothing installed | unit | `tests/release-autopilot.test.ts` |
| Workspace init and update | `initWorkspace({ targetDir, runtimeDir, install: false, git: false })` and `updateWorkspace({ targetDir, runtimeDir, install: false })` on a runtime fixture in a temp folder (`package.json`, `config/defaults.yaml`, `templates/project`) | integration | `tests/update.test.ts`, `tests/workspace-characterization.test.ts` |
| Layout migration | `migrateLayout(root, { dryRun })` on a temp workspace with `series/<slug>/` | integration | `tests/migrate-layout.test.ts` |
| Runtime classification | `runtimePath`, `planRuntime` on paths or `git ls-files` (not shipped) | unit | `tests/runtime-files.test.ts` |
| Provider key check | `validateFalKey`, `validateHiggsfieldKey` with a fake `fetchImpl` | unit | `tests/init.test.ts` |
| Model bench | `runBench({ targets, cases, id, dryRun, paths: benchPaths(tempDir) })` on a temp bench folder with inline case and target files and fixtures written by the test; mock targets cost nothing, a `fal` target with a price checks the budget in a dry run; `summarizeTargets` on an inline `BenchRun` | integration, unit | `tests/bench.test.ts`, `tests/bench-characterization.test.ts` |
| Board shell | `boardHandler({ root, refresh: async () => undefined })` called with a stub request (a `Readable` plus `method`, `url`, `headers`) and a stub response that collects `writeHead`, `setHeader`, `write` and `end`; writes send the board's `host`, `origin` and `content-type` | integration | `tests/board-production.test.ts`, `tests/board-shell-characterization.test.ts` |
| Remotion render | a real still or JPEG; opt-in with `CORESLOPPER_RENDER_TESTS=1` (needs Chrome) | integration | `tests/thumbnail-render.test.ts` |
| Agent instruction | not testable deterministically | – | `workspace/.claude/commands/video-next.md` |
