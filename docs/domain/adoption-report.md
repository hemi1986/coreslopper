# Adoption – project-stage-pipeline
Date: 2026-11-21 · Commit: b195086 · Slice: project and stage pipeline (concept `pipeline`) · Analysts: 3 lenses

## Scope and intent

- **Slice:** the project and its stage pipeline – project, project kind, stage definitions, stage status
  lifecycle, review mode, hard stops, budget, production phase and next action. No shared library in this pass.
- **Intent:** domain model first (language, aggregates, lifecycle) as the basis for later `/feature` work.
- **Language:** artifacts `en`, UI `en`; the conversation was German.

| Layer | Files |
|---|---|
| core (domain) | `packages/core/src/state.ts`, `project.ts`, `production.ts`, `cost.ts`, the project/state parts of `schema.ts` |
| cli (application) | `packages/cli/src/index.ts` (stage commands), `status.ts`, `new-project.ts`, `generate.ts` (budget only), `board-production.ts`, `production-watch.ts`, `board/production.js`, `board-wizard.ts` (`finishSetup`) |
| workspace (orchestration) | `workspace/.claude/commands/video-next.md`, `video-status.md`, `agents/stage-runner.md`, `hooks/validate-artifacts.mjs` |
| tests | `tests/state.test.ts`, `board-production.test.ts`, `episode.test.ts` |

Out of scope, even where it touches the state: review rounds, release, series canon, bench, character library.

## Repository map (tooling, packages, why this slice)

npm workspaces, 6 packages (`packages/{core,providers,cli,remotion}`, two Python helpers under `scripts/`).
`core` and `providers` are layer packages. The map suggested `review`; the slice chosen is the project and its
stage pipeline because review rounds, release and episodes all hang off it.

Tooling findings:

- `repo-map.ts` and `slice.ts` read the gitignored build output `runtime/` (7 phantom packages). The map was
  generated with `runtime/` moved aside; rerun it the same way after `npm run build`.
- Packages resolve each other through `tsconfig.json` `paths`, not manifests: the map shows no dependency
  edges, `slice.ts` does not follow `@coreslopper/core` imports, and the boundary scan sees relative imports
  only (package-name imports are covered by a test instead).
- The generated command `npm run test --workspace <package>` does not work: no package has a test script.
- Kataster's tools read only `CONTEXT.md` and do not follow its `Imports: docs/glossary.md` line – a feature
  request for Kataster (an import list in `CONTEXT.md` that `loadGlossary` and `story-context` follow).

## What the repository is (facts)

- One `projects/<slug>/state.json` per project is the control plane; `project.yaml` is the user-owned
  configuration. Every state write goes through core's transitions and an atomic `saveState`, without a lock.
- Stage lists are fixed per project kind in code; the next stage is the first `pending` or `failed` one.
- No transition is guarded; a reset touches one stage of any status.
- Orchestration rules (interactive gate, review-mode stop, hard stops) exist only in agent instructions.
- The budget is checked before a batch (`assertAffordable`, batch cap 30 % of the remainder) and on every
  recorded spend (`recordSpend`).

## Confirmed domain model

- **Context:** `BC-Pipeline` – Pipeline.
- **Aggregate:** `AGG-Project` (`as-is`, evidence `state.json` + `state.ts` + `project.ts`). Invariants: spend
  within budget; a stage state for every stage of the kind; kind and budget equal in `state.json` and
  `project.yaml`; a stage is started, done or skipped only after every earlier stage is done or skipped
  (not enforced); no writer loses another writer's change (not enforced); the error history only grows.
- **Commands:** create project; start, complete, complete interactive, fail, skip, reset stage; record spend –
  each with the confirmed transition rules. **Policies:** run the next autonomous stage; hard stop.
  **Read models:** status, next action (with its confirmed precedence), production view.
- **Glossary (`docs/glossary.md`):** new **Stage Attempt**, **Stage Skip**, **Production Phase**; sharpened
  **Hard Stop** (four conditions), **Review Mode** (the orchestrator stops), **Stage Reset** (later stages too,
  never a running one). **Workspace Payload**, **Engineering Layer**, **Sandbox Workspace** moved to
  `CONTEXT.md`, which imports the product glossary and holds engineering terms only.
- **Maps:** `docs/domain/context-map.as-is.md` (BC-Pipeline and its unadopted neighbours); no target map yet –
  the gap register shows “target not decided”.

## Package documentation written

- `.claude/rules/pipeline.md` – path-scoped slice doc (the slice spans `core`, `cli` and the workspace
  orchestrator, so no package `AGENTS.md`). Nothing left `[OPEN]`.
- `docs/engineering/conventions.md` – module layout, tooling, command flow, read models, time, texts, seams.
- `docs/architecture/data-model.md` – as-is model of `project.yaml`, `state.json` and stage state, plus the
  confirmed lifecycle.

## Contradictions found and how they were resolved

| Contradiction | Resolution |
|---|---|
| Two glossaries (`docs/glossary.md` vs Kataster's `CONTEXT.md`) | Each tool keeps its standard; `CONTEXT.md` imports the product glossary and extends it |
| "phase" avoided, `ProductionPhase` in code | Production Phase is its own term |
| Stage `attempts` vs queue Attempt; `retry` avoided | Stage Attempt; a failed stage resumes |
| Three, four, or six hard-stop conditions | Four conditions |
| Budget in two files | `project.yaml` is the source, `state.json` a copy |
| ADR 0030 "read-only" vs the wizard completing `setup` | ADR 0037 (proposed) |
| Orchestrator and stage skills both call `stage-done` | The orchestrator completes autonomous stages (G-4) |
| `review_mode: final` read by no code | Supported as an orchestrator rule (G-9) |
| Input hashes "make it resumable" | Not part of the model; reset is explicit (G-8) |
| Reset of any status, no cascade | Refuse running, cascade to later stages (G-3) |
| Next action vs `/video-next` when done without release, and on precedence | Reset qa-export; interactive before review rounds (G-5, G-6) |

## Rules and checks

| Rule | Enforcement | State |
|---|---|---|
| `core` imports no package; `providers`, `remotion` import only `core` | `tests/package-boundaries.test.ts` (package names) + `docs/architecture/boundaries.yaml` (relative imports, edit and stop via `docs/engineering/checks.yaml`) | green, empty baseline |
| No source imports `runtime/` | `boundaries.yaml` `no-build-output` | green |
| Failed stage resumes first; attempts count starts; skip advances; reset clears the stage; batch cap and budget refuse a batch; interactive stage before review rounds | `tests/state-characterization.test.ts` (characterization) | green |
| Transition rules, reset cascade, no lost writes | documentation only until a story builds them (G-1–G-3) | – |
| Orchestrator rules (interactive gate, review-mode stop, hard stops) | documentation only (agent instructions) | – |

## Gap register (candidates – stories only with --stories)

16 candidates in `docs/domain/gap-register.md`: 12 *exists but contradicts* (highest: G-1 no write lock, G-2 no
transition guards, G-3 reset without cascade), 2 *missing* (G-13 budget change command, G-14 injectable clock),
2 *dead* (G-15 `reservedUsd`, G-16 `mechanical`/`stageOutputs`).

## Deliberately left alone

- Production code: unchanged.
- Shipped docs that contradict the model (`workspace/AGENTS.md`, `docs/pipeline.md`, `docs/architecture.md`,
  `video-next.md`, the stage skills): recorded as gaps, not edited.
- ADR 0016 drift (G-12): an accepted ADR is not edited; a superseding note is a decision for later.
- `vitest.config.ts` pins `TZ: 'Europe/Berlin'` – a locale default upstream, outside this slice.
- The ADR status convention (Kataster's `proposed` vs the repository's direct `Accepted`): ADR 0037 uses the
  repository's format with status `Proposed`.

## Open hotspots

None. HS-1 to HS-15 are resolved.

## Next slice

`review` (review rounds, notes, replies, the review player) – it builds on this slice (review rounds reset
`qa-export`, the next action ranks them) and was the map's suggestion. Alternatively `release`, cut down first.

## Grilling log

### Round 1 (2026-11-21)

| # | Decision | Written to |
|---|---|---|
| Q1 | Two standards: `docs/glossary.md` is the product glossary; Kataster's `CONTEXT.md` imports it and only adds engineering terms. Kataster's tools do not follow the import yet – a feature request for Kataster, no local patch. | `CONTEXT.md` |
| Q2 | **Production Phase** is its own term; "phase" stays avoided for a stage. | glossary, HS-1 |
| Q3 | **Stage Attempt**; a failed stage *resumes*. The code's `retry` reason is a gap. | glossary, HS-2 |
| Q4 | **Stage Skip** is the user's manual decision. | glossary, HS-3, `CMD-SkipStage` |
| Q5 | **Hard Stop** has four conditions. | glossary, HS-4, `POL-HardStop` |
| Q6 | `budget_usd` in `project.yaml` is the source; `state.json` holds an equal copy. | HS-5 |
| Q7 | The board wizard may complete `setup`, nothing else. | ADR 0037 (proposed), HS-6 |
| Q8 | The orchestrator completes autonomous stages; the setup skill completes interactive ones. | HS-7, `CMD-CompleteInteractiveStage` |
| Q9 | `review_mode: final` is supported as an orchestrator rule. | glossary, HS-8, `POL-RunNextStage` |
| Q10 | `reservedUsd` is dead. | HS-9 |
| Q11 | Stale-stage detection is not part of the model; a reset is always explicit. | HS-10 |

### Round 2 (2026-11-21)

| # | Decision | Written to |
|---|---|---|
| Q1 | Legal transitions: start autonomous stages from pending/failed after earlier stages are done/skipped; complete and fail from running; complete interactive from pending/failed; skip from pending/failed. | HS-11, command rules, data model |
| Q2 | A reset refuses a running stage and returns every later done/skipped stage to pending. | HS-12, glossary |
| Q3 | Done without a release folder → reset qa-export, then `/video-next`. | HS-13, `RM-NextAction` |
| Q4 | An open interactive stage comes before open review rounds. | HS-14, `RM-NextAction` |
| Q5 | No writer loses another's change; no recorded spend is lost. | HS-15, aggregate invariant |
| Q6 | `errors[]` is the intended append-only error history. | aggregate invariant |
| Q7 | Workspace Payload, Engineering Layer, Sandbox Workspace move to `CONTEXT.md`. | glossary, `CONTEXT.md` |
| Q8 | Package import direction is a hard rule. | `boundaries.yaml`, `tests/package-boundaries.test.ts` |
| Q9 | Clock in core, in-place mutation, in-memory migration are accidents, not decisions. | conventions, G-14 |
| Q10 | The context is named Pipeline. | `BC-Pipeline` |

---

# Adoption – human-review
Date: 2026-11-21 · Commit: 5128f52 · Slice: human review (concept `review`, without art-director verdicts) · Analysts: 3 lenses

## Scope

- **Slice:** the user's review of renders – review notes, review rounds and their replies, the desktop review
  player, the board's review view, and how the orchestrator answers open rounds. No shared library.
- **Intent:** domain model, as for the pipeline slice. **Language:** artifacts `en`, UI `en`.
- **Split from the map's `review` cluster:** the art director's verdicts (`review-image`, `verdicts.jsonl`)
  are a different concept that shares the word; they stay for a later slice.
- **Since the last slice:** nothing changed in code (same day); slice 1 is committed on `docs/adopt-pipeline`.

| Layer | Files |
|---|---|
| core (domain) | `packages/core/src/review.ts`; in `schema.ts` `ReviewNoteSchema`, `ReviewNotesSchema`, `ReviewRoundSchema`, `ReviewReplyStatusSchema`, `ReviewRepliesSchema`; `production.ts` (`openRounds` only) |
| cli (application) | `packages/cli/src/board-review.ts`, `board/review.js`, `review.ts`, `status.ts` (`Review:` lines), `validate-file.ts` (review parts), `file-lock.ts` (as used by review) |
| python | `scripts/review-player/review_player.py`, `review_notes.py`, `README.md` |
| workspace (orchestration) | `workspace/.claude/commands/video-next.md` ("Review rounds"), `workspace/.claude/skills/assembly-render/SKILL.md` ("Review rounds"), `workspace/.claude/hooks/validate-artifacts.mjs` (replies) |
| tests | `tests/review.test.ts`, `tests/board-review.test.ts`, `scripts/review-player/tests/test_review_notes.py` |
| docs | ADR 0022, ADR 0032, `docs/board.md` "Review", `docs/pipeline.md` "Review notes and rounds" |

## What the repository is (facts)

- Review data are three file kinds per project under `review/`: notes per render, frozen round files, and
  reply files; Zod schemas in core, generated JSON Schema that the Python player does not use.
- The board writes notes and rounds under one lock per project; the desktop player writes notes without the
  lock; the agent writes replies; only replies are validated.
- A round counts as answered once a replies file exists; rounds are numbered once per project.
- Time, frame, and path logic exists three times (core, board page, Python).

## Confirmed domain model

- **Context:** `BC-Review` – Review. It feeds `BC-Pipeline` through the count of open rounds and the
  orchestrator's `qa-export` reset.
- **Aggregate:** `AGG-ProjectReview` (`as-is`, evidence the board's lock and project-wide round numbers) with
  notes, rounds and replies. Invariants: a sent note never changes; round numbers unique and ascending; a round
  holds every draft note of one render; replies answer every note; a round is answered exactly once; notes and
  rounds belong to the user; every writer keeps sent notes, loses no write and uses floor(seconds × format fps);
  a note is sent in exactly one round; a round is open until a valid replies file answers it.
- **Commands:** add, change, delete review note; send review round; answer review round. **Policies:** answer
  open rounds before the next autonomous stage; fixes that changed a render reset `qa-export`. **Read models:**
  review view, open review rounds.
- **Glossary:** new **Fix Pass**; **Review Note** (draft note vs publishing Draft, a sent note never changes);
  **Review Round** (answered only by a valid, complete replies file; follow-ups in the next round; avoid
  "submission").

## Package documentation written

- `.claude/rules/review.md` – path-scoped slice doc; nothing left `[OPEN]`.
- `docs/engineering/conventions.md` – locks for shared files, the Python seam.
- `docs/architecture/data-model.md`, `docs/domain/context-map.as-is.md` – `AGG-ProjectReview`, `BC-Review`.

## Contradictions found and how they were resolved

| Contradiction | Resolution |
|---|---|
| send (UI, glossary) vs submit (code) | send (G-27) |
| "review" for the user, the art director, and a folder | only the user's review; the art director gives verdicts (G-28) |
| `review-fix` runner label vs "fix pass" | Fix Pass; `review-fix` is a label |
| Desktop player deletes sent notes, writes without the lock | a fallback bound by the same invariants (G-17, G-18, G-23) |
| Desktop notes via the next round vs via chat | the next round only (G-24) |
| Any replies file closes a round | only a valid, complete one (G-19, G-20) |
| `qa-export` reset always (ADR 0032) vs when the picture changed | when a render changed (G-25) |
| "Rounds before any stage" vs running and interactive stages first | slice 1 decision stands (G-26) |

## Rules and checks

| Rule | Enforcement | State |
|---|---|---|
| Rounds numbered once per project; open rounds oldest first; draft note = no round | `tests/review-characterization.test.ts` | green |
| Drafts editable, sent notes frozen in the board, replies cover every note | existing `tests/board-review.test.ts` | green |
| Notes and rounds are the user's; every writer obeys the note invariants; a valid reply answers | documentation until stories build them (G-17–G-22) | – |
| `core/review.ts` stays free of other packages | slice 1 boundary rule and test | green |

## Gap register (candidates – stories only with --stories)

15 candidates G-17 to G-31 in `docs/domain/gap-register.md`: 12 *exists but contradicts* (highest: G-17 lost
writes from the desktop player, G-18 it deletes sent notes), 3 *missing* (G-29 render version, G-30 the release
of the final-review stop, G-31 live replies, inferred).

## Deliberately left alone

- Production code, ADR 0022 and 0032, and the shipped docs that contradict the model.
- The `review/` folder name; the art director's wording (its own slice).

## Open hotspots

None. HS-16 to HS-28 are resolved.

## Next slice

`release` (release package, folder, calendar, board, autopilot), cut down to one concept first – or the
art director's verdicts, which now share no word with human review.

## Grilling log

### Round 1 (2026-11-21)

| # | Decision | Written to |
|---|---|---|
| Q1 | The domain verb is *send*; `submit` in code is a gap. | glossary (Review Round), HS-21 |
| Q2 | "Review" is only the user's review of renders; the art director gives *verdicts*; `review/` is file layout; an unsent note is a *draft note*. | glossary (Review Note), HS-22 |
| Q3 | **Fix Pass** is the agent's work on one round; `review-fix` is a runner label, not a stage. | glossary, HS-23 |
| Q4 | Notes, rounds and replies are one aggregate; a round is answered exactly once. | HS-24, `AGG-ProjectReview` |
| Q5 | The desktop player stays a fallback writer bound by the same invariants. | HS-16, `AGG-ProjectReview` |
| Q6 | Notes and rounds belong to the user; enforcement by the hook is a gap. | HS-25, `AGG-ProjectReview` |

### Round 2 (2026-11-21)

| # | Decision | Written to |
|---|---|---|
| Q1 | Desktop notes reach the agent only through the board's next round. | HS-17 |
| Q2 | Only a valid, complete replies file answers a round; board and `status` count alike. | HS-18, invariant |
| Q3 | No reopening; the user follows up with a new note in the next round. | HS-19, glossary |
| Q4 | `qa-export` is reset only when the fix pass changed a render. | HS-20, `POL-RebuildQaAfterFixes` |
| Q5 | A round records its render's version. | HS-26, `CMD-SendReviewRound` |
| Q6 | The final review of review mode `final` uses the review view; `--stage qa-export` releases it. | HS-27, `POL-AnswerOpenRounds` |
| Q7 | Shorts are not reviewed in the board. | HS-28 |
| Q8 | A note is sent in exactly one round. | invariant |
| Q9 | A range note's section is the one at its start – intended. | `CMD-SendReviewRound` |
