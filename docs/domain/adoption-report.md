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

---

# Adoption – generation-queue-and-verdicts
Date: 2026-11-21 · Commit: 7c7b81e · Slice: art-director verdicts and the generation queue (concept `verdict`) · Analysts: 3 lenses

## Scope

- **Slice:** the art director's verdicts (`review-image`, `verdicts.jsonl`, `verdicts`), the generation queue
  with its items and attempts (`queue add|run|status|wait|retry|accept|drop`), the region patch (`patch`), the
  comparison sheet as a helper, and the art-director agent. No shared library.
- **Out of scope:** generate batches, cache, manifest and provider adapters (slice `generation`), the model
  bench, the contact sheet, human review.
- **Intent:** domain model, as for the earlier slices. **Language:** artifacts `en`, UI `en`.
- **Since the last slice:** no code change (same day).

| Layer | Files |
|---|---|
| cli (application, and here also domain) | `packages/cli/src/queue.ts`, `review-image.ts`, `verdicts.ts`, `patch.ts`, `image-ops.ts` (sheet, frames, crop and paste), the commands in `index.ts`; queue and verdict parts of `board-production.ts`, `board/production.js`, `production-watch.ts`; `comfy.ts` as the queue uses it |
| core | `packages/core/src/production.ts` (`queueCounts` only) |
| workspace (orchestration) | `workspace/.claude/agents/art-director.md`, `stage-runner.md` rule 10; `ai-clips/SKILL.md` steps 3–6; queue parts of `character-bible`, `style-bible`, `new-series` |
| tests | `tests/queue.test.ts`, `review-image.test.ts`, `image-ops.test.ts`, `runner-commands.test.ts`, `board-production.test.ts` (queue parts) |

## How this slice was decided

The user had the product written with Claude and uses it; they cannot judge code-level questions and said so.
Round 1 (12 questions) was answered "all yes" without a view of their own; the six questions of round 2 were
decided by the recommendation without asking. **Every decision of this slice is a recommendation, not reviewed
by the user** – hotspots carry "delegated" in their resolution, and ADR 0038 stays `Proposed`. Later slices
work the same way: no code-level questions, only questions about what the user sees and does.

## What the repository is (facts)

- One `assets/queue.json` per project, written whole (temp file and rename) without a lock; one `queue run` per
  project behind a check-then-write pid lock. Six statuses: pending, generating, reviewing, passed, needs-fix,
  error.
- Every attempt is a file; only a pass, an accept, or an item without a verdict target reaches `out`.
- The art director runs headless (`claude -p --agent art-director`, JSON schema) in the background, at most
  `--reviews` started at once, though not strictly.
- Only a blocking defect fails (prompt text plus `notesOnlyPass`); a failed image requeues itself with the fix
  prompt up to 3 attempts, a failed clip waits. `queue retry` has no cap.
- Every verdict goes to `verdicts.jsonl` and, in the queue, into its attempt; `accept` writes none and checks no
  status; `patch` writes an attempt file outside the queue.
- All of it lives in `cli`; core only counts statuses. No ADR recorded it. One commit (`73063bc`) introduced the
  queue; `review-image.ts` changed five times in two days.

## Domain model (decided by recommendation)

- **Context:** `BC-GenerationQueue` – Generation queue. It generates through the not-yet-adopted generation
  slice (budget, cache, manifest, spend), builds items from storyboard shots, and feeds the board and watchdog
  with its needs-fix count and failed verdicts.
- **Aggregate:** `AGG-GenerationQueue` (`as-is`, evidence the whole-file write, cross-item `after` and order,
  the per-project run lock). Invariants: only an approved attempt is filed; an item starts after the items it
  derives from; attempts numbered by the queue, patches included; one run per project; at most 3 local and 1
  cloud attempt since the last replace; a user's accept is final; no change while generating or reviewing; no
  lost write.
- **Commands:** add queue item, run the queue, give a verdict (art director), apply a verdict (queue run),
  requeue (`queue retry`), accept attempt, drop queue item, patch a region. **Policies:** judge every attempt;
  apply every verdict. **Read models:** queue status, latest verdicts.
- **Glossary:** new **Verdict**, **Blocking Defect**, **Verdict Note**; sharpened **Art Director** (every image
  and clip, references, thumbnails, covers; bench scores are not verdicts), **Attempt** (the cap, approved =
  pass or accept, requeue), **Generation Queue**, **Region Patch** (an attempt of its item).
- **ADR:** 0038 (Proposed) records the queue's decisions; amends ADR 0002.

## Package documentation written

- `.claude/rules/verdict.md` – path-scoped slice doc; nothing left `[OPEN]`.
- `docs/engineering/conventions.md` – the queue as the exception to rules in core, background processes with a
  wait command, headless agents, two seams.
- `docs/architecture/data-model.md`, `docs/domain/context-map.as-is.md` – `AGG-GenerationQueue`,
  `BC-GenerationQueue`.

## Contradictions found and how they were resolved

| Contradiction | Resolution |
|---|---|
| "review" for the art director (code, UI) vs the user's review | Verdict; the art director judges (G-43) |
| `note:` issues vs Review Note | Verdict Note, beside Blocking Defect |
| `queue retry`, `--tries` vs "retry" avoided | requeue; tries are technical (G-44) |
| `passed` for pass, accept, and unjudged | approved attempt, filed, filed unjudged (G-41) |
| `art-director.md` "fail on any doubt", text answer vs the prompt's blocking-defect rule and JSON | the blocking-defect rule for every verdict (G-38) |
| Glossary "stills and keyframes" vs everything the art director judges | definition sharpened |
| Verdict in `verdicts.jsonl` and in the attempt | the log is the record, the attempt a copy (G-42 for the two readers) |
| `ai-clips` "three attempts per clip", "3 + one cloud" vs no cap on retry | the cap is an invariant (G-34) |
| `patch` "files it as the next attempt" vs not in the queue, wrong log for a canon | a patch is an attempt of its item (G-35, G-36, G-47) |
| `accept` without guard vs "the user's eye wins" | accept is final and refused while running (G-33) |
| Queue schema in `cli` vs ADR 0004 | accident (G-39) |

## Rules and checks

| Rule | Enforcement | State |
|---|---|---|
| Fix prompt `none` → needs-fix at attempt 1; replace keeps and continues attempts; a known id is skipped; drop keeps files and refuses a reviewing item; accept of attempt n files it with its note | `tests/queue-characterization.test.ts` | green |
| Pass files, fail requeues with fix prompt and focus, clips wait, attempt cap for images, budget stop, re-review | existing `tests/queue.test.ts`, `tests/review-image.test.ts` | green |
| Accept final and guarded, attempt cap for all, patch as attempt, no lost write, one run | documentation until stories build them (G-32–G-35) | – |
| The slice stays inside `cli`'s allowed imports | slice 1 boundary rule and test | green |

## Gap register (candidates – stories only with --stories)

17 candidates G-32 to G-48 in `docs/domain/gap-register.md`: 15 *exists but contradicts* (highest: G-32 no
lock on `queue.json`, G-33 accept without guard), 1 *missing* (G-37 accept in the verdict views), 1 *dead*
(G-48 `QueueAttempt.provider`).

## Deliberately left alone

- Production code, `art-director.md`, `ai-clips/SKILL.md`, and the docs that contradict the model.
- `EVT-VerdictGiven` belongs to no aggregate on purpose: the verdict log is outside the queue (the validator
  warns).
- The series board view showing no canon verdicts (an analyst's inference, not checked).

## Open hotspots

None. HS-29 to HS-46 are resolved by recommendation.

## Next slice

`timing` (song analysis, timing resolver, overrides, anchors, lyrics), per the adoption plan.

## Decision log

| # | Decision | How | Written to |
|---|---|---|---|
| HS-46 | The whole queue stays the aggregate (as-is) | agreed without review | `AGG-GenerationQueue` |
| HS-36 | `verdicts.jsonl` is the record; the attempt a copy | agreed without review | data model, G-42 |
| HS-30 | Verdict; the art director judges | agreed without review | glossary, G-43 |
| HS-31 | Blocking Defect and Verdict Note | agreed without review | glossary |
| HS-32 | requeue; tries technical | agreed without review | glossary (Attempt), G-44 |
| HS-33 | approved attempt, filed, filed unjudged | agreed without review | glossary, G-41 |
| HS-35 | Art Director sharpened | agreed without review | glossary |
| HS-34 | Blocking-defect rule for every verdict | agreed without review | `CMD-GiveVerdict`, G-38 |
| HS-41 | No lost write, one run per project | agreed without review | invariant, G-32 |
| HS-44 | ADR 0038 | agreed without review | `docs/adr/0038-generation-queue-and-verdicts.md` |
| HS-45 | Domain logic in `cli` is an accident | agreed without review | G-39 |
| HS-43 | Canon judged by hand – intended | agreed without review | gap register decisions |
| HS-29 | Context "Generation queue" | recommendation | `BC-GenerationQueue` |
| HS-37 | Accept shows as accepted in the verdict views | recommendation | `RM-LatestVerdicts`, G-37 |
| HS-38 | No change while running; no requeue of a passed item; replace cascades | recommendation | invariants, data model, G-33, G-40 |
| HS-39 | 3 local + 1 cloud attempt since the last replace | recommendation | invariant, glossary, G-34 |
| HS-40 | A region patch is an attempt of its item | recommendation | invariant, glossary, G-35, G-36 |
| HS-42 | The user accepts anything, final; the runner only after the cloud attempt | recommendation | `CMD-AcceptAttempt` |

# Adoption – timing
Date: 2026-11-21 · Commit: 5e06927 · Slice: song analysis, timing resolver, overrides, anchors, lyrics, song import (concept `timing`) · Analysts: 3 lenses

## Scope

- **Slice:** the lyrics (`lyrics.txt`, `lyrics.ts`, `writeLyrics`, `lyrics [--propose]`), the song import as the
  analysis' input (`import-song`, `normalize-audio`, `song.json`, stems), the Python song analysis
  (`scripts/audio-analysis/`), the timing and its overrides (`TimingSchema`, `TimingOverridesSchema`, the merge
  and check in `timing.ts` and `project.ts`), anchor resolution (`resolveAnchor`), the timing lookups in core and
  Remotion, and the `audio-analysis` skill. No shared library.
- **Out of scope:** the storyboard's coverage and validation rules (slice `storyboard`), the episode's
  constructed timing (slice `series`), cutting lip-sync segments, release.
- **Intent:** domain model, as for the earlier slices. **Language:** artifacts `en`, UI `en`.
- **Since the last slice:** no code change (same day).

| Layer | Files |
|---|---|
| core (domain) | `packages/core/src/timing.ts` (merge, check, anchors, lookups), `lyrics.ts`, the timing parts of `schema.ts`, `project.ts` (load and merge), `state.ts` (stage outputs) |
| scripts (analysis) | `scripts/audio-analysis/analyze.py`, `timing_core.py`, `echo_scan.py`, `separate_lead.py`, `README.md`, tests; `transcribe.py` serves the bench |
| cli (application) | `index.ts` (`lyrics`, `import-song`, `normalize-audio`, `validate`), `media.ts`, `board-wizard.ts` `writeLyrics`, `new-project.ts`, `validate.ts`, `validate-file.ts` |
| remotion (consumer) | `packages/remotion/src/lib/timing.ts`, `hooks/useTiming.ts` |
| workspace | `workspace/.claude/skills/audio-analysis/SKILL.md`, `hooks/validate-artifacts.mjs` (timing parts) |
| tests | `tests/timing.test.ts`, `lyric-display.test.ts`, `import-song.test.ts`, `scripts/audio-analysis/tests/` |

## How this slice was decided

As in the verdict slice: no code-level questions. Every technical hotspot was decided by the recommendation and
is marked "not reviewed by the user – delegated". The user answered four questions about how they work:
1. Words in parentheses in the lyrics are backing vocals (Suno style), not directions.
2. A vocal stem comes with most songs.
3. The song and lyrics never change after the analysis.
4. When a line or section sits wrong, the user tells the agent and the agent enters the correction.
Answers 2 and 3 set the priority of G-50 (high) and G-61 (low). ADR 0039 stays `Proposed`.

## What the repository is (facts)

- The analysis is Python, run by the stage runner through the skill (`uv run python analyze.py`); no CLI command
  runs it. It writes `timing.json` and `timing.report.md`, never the overrides. Lyrics text and order win, and
  speech recognition supplies only times (Needleman–Wunsch alignment, optional forced alignment). Sections are
  snapped to downbeats, and a section's confidence is that of its weaker boundary.
- `loadProject` merges `timing.json` with `timing.overrides.json` and checks the result on every load. The
  renderer gets this merge as props. `timing.effective.json` is a snapshot only `validate` (and the episode
  track) writes.
- Overrides move times only, by section or line id or by line and word index. An unknown target throws and
  breaks every command.
- Section ids come only from the Python parser; line ids are positional. `song.json` has no schema.
- Python and TypeScript share only the generated JSON Schema; `timing.meta` is untyped. Remotion keeps its own
  lookups. 19 commits touch the slice; the largest (`ac35d0d`, "align lyrics first") left the energy-only path as
  the `--skip-asr` fallback. There are no TODOs and no reverts.

## Domain model (decided by recommendation)

- **Context:** `BC-Timing` – Timing. Run by the pipeline's `audio-analysis` stage. It feeds the storyboard
  (anchors), render (props), the board review (sections, beats), lip-sync segments (echo spans, lead stem), the
  queue, Shorts, and release.
- **Aggregates:** `AGG-ProjectTiming` (`as-is`: the merge and the one check on every load) with invariants:
  sections cover the audio; lines inside their section and words inside their line; overrides move times only,
  always win, and name an existing target; no tool replaces the overrides; the lyrics text wins; words in
  parentheses are timed; the duration matches the song. `AGG-Lyrics` (`as-is`: `writeLyrics`) with every sung
  line under a tag.
- **Commands:** import song, normalize song loudness, write lyrics, analyze song, separate lead stem, override
  timing. **Read models:** effective timing, timing report, echo spans. **Flow:** `FLOW-SongTiming`.
- **Glossary:** new **Timing Report**; sharpened **Lyrics** (tags, parentheses), **Effective Timing** (made on
  load, the file is a snapshot), **Timing Override** (times only, entered by the agent), **Section** (boundary
  confidence, tag), **Line**, **Word** (inside their container), **Anchor** (word anchors carry an edge),
  **Echo Span** (avoid "unwritten vocals", "backing span").
- **ADR:** 0039 (Proposed), which amends 0005 and 0008.

## Package documentation written

- `.claude/rules/timing.md` – path-scoped slice doc; nothing left `[OPEN]`.
- `docs/engineering/conventions.md` – Python behind the generated schema, the merge on load, user-owned files,
  timing seams.
- `docs/architecture/data-model.md`, `docs/domain/context-map.as-is.md` – `AGG-ProjectTiming`, `AGG-Lyrics`,
  `BC-Timing`.

## Contradictions found and how they were resolved

| Contradiction | Resolution |
|---|---|
| Parentheses: backing vocals (glossary, ADR 0026, lip-sync muting) vs cues and directions (analysis) | backing vocals (user; G-49) |
| "Never overwrite" user files vs Demucs writing over the imported stem | the stem is user-owned, a hard stop (G-50) |
| Skill "stop when Demucs is missing" vs the silent fallback | stop; fallback only when asked (G-51) |
| ADR 0004 producer check vs the cwd-relative schema path | always check against the repository schema (G-52) |
| Skill step 5 and the hook vs `validate` needing a storyboard | validate the timing alone (G-53) |
| "Timing Override always wins" vs an unknown override breaking every load | reported by name, other commands work (G-54) |
| Skill "lines and words inside their sections" vs `assertTiming` | invariant (G-55) |
| Glossary and ADR 0005 "word anchors are points" vs schema and resolver | the code is right; glossary fixed, ADR 0039 |
| "Effective timing" for the merge and for the file | the merge; the file is a snapshot (G-63 for release) |
| `[Verse 2]` vs id `verse_3` | ids follow the tag text (G-56) |
| Lines before the first tag: `unlabeled` vs refused / `[Intro]` | rules once, Python follows (G-57) |
| Overrides user-owned vs the skill telling the agent to edit them | the agent enters them at the user's request (user) |
| Two sets of lookups (core, Remotion) | one in core (G-59) |

## Rules and checks

| Rule | Enforcement | State |
|---|---|---|
| Overrides replace beats whole and move sections, lines and words by id or index; text and labels stay; a line override leaves its words | `tests/timing-characterization.test.ts` | green |
| Unknown override targets throw; the 0.05 s tolerance at the audio's edges; beats inside the audio | `tests/timing-characterization.test.ts` | green |
| Anchor offsets, edges, clamping, missing beats; tag proposal (`[Chorus]`, `[Verse n]`, `[Intro]`) | `tests/timing-characterization.test.ts` | green |
| Lyrics text wins, sections cover the song, in-order chorus alignment, echo spans | existing `scripts/audio-analysis/tests/` | green |
| Backing vocals timed, stem never replaced, stop on a missing model, schema check, lines inside sections, override reported | documentation until stories build them (G-49–G-55) | – |
| The slice stays inside the packages' allowed imports | slice 1 boundary rule and test | green |

## Gap register (candidates – stories only with --stories)

20 candidates G-49 to G-68 in `docs/domain/gap-register.md`: 15 *exists but contradicts* (highest: G-49
parentheses, G-50 the overwritten stem), 4 *missing*, and 1 *dead* (G-67 `StoryboardSchema.timing`).

## Deliberately left alone

- Production code, the audio-analysis skill, `scripts/audio-analysis/README.md`, and ADR 0005 and 0008 (accepted;
  ADR 0039 amends them).
- The episode's constructed timing and `assertTimingMatchesScript` (series slice), `audio-segment` (lip-sync).
- `tools.ts` installing the analysis without the `asr` and `stems` extras (workspace slice).
- The alignment constants; they are tuning, not decisions.
- `EVT-SongImported`, `EVT-SongLoudnessNormalized`, and `EVT-LeadStemSeparated` belong to no aggregate on
  purpose (the validator warns).

## Open hotspots

None. HS-47 to HS-68 are resolved, four of them partly by the user's answers.

## Next slice

`storyboard` (shots, shot sources, coverage, validation, contact sheet), per the adoption plan. It owns
`resolveStoryboard`'s coverage rules next to this slice's anchors.

## Decision log

| # | Decision | How | Written to |
|---|---|---|---|
| HS-50 | Words in parentheses are backing vocals, timed | user (2026-11-21); `(Spoken)` by recommendation | glossary (Lyrics), invariant, G-49 |
| HS-56 | An imported vocal stem is analyzed, never replaced | recommendation; priority from the user | `CMD-AnalyzeSong`, hard stop, G-50 |
| HS-59 | The duration matches the song | recommendation; low because the song never changes (user) | invariant, G-61 |
| HS-66 | The agent enters overrides at the user's request; no tool replaces the file | user and recommendation | glossary, invariant, `CMD-OverrideTiming` |
| HS-55 | Section ids from the tag text; positional line ids | recommendation; lyrics never change (user) | `CMD-AnalyzeSong`, G-56 |
| HS-47 | One context, Timing; song metadata elsewhere | recommendation | `BC-Timing` |
| HS-48 | Project timing and lyrics as the aggregates (as-is) | recommendation | `AGG-ProjectTiming`, `AGG-Lyrics` |
| HS-49 | Effective timing is the merge; the file a snapshot | recommendation | glossary, `RM-EffectiveTiming`, G-63 |
| HS-51 | Echo Span; avoid "unwritten vocals", "backing span" | recommendation | glossary, G-64 |
| HS-52 | Boundary confidence, alignment confidence; Timing Report | recommendation | glossary |
| HS-53 | Lines inside sections, words inside lines | recommendation | invariant, G-55 |
| HS-54 | A missed override is reported by name | recommendation | invariant, G-54 |
| HS-57 | A missing model stops the analysis | recommendation | `CMD-AnalyzeSong`, G-51 |
| HS-58 | The analysis always checks the repository schema | recommendation | `CMD-AnalyzeSong`, G-52 |
| HS-60 | One set of lookups in core | recommendation | G-59 |
| HS-61 | The anchor string grammar belongs in core | recommendation | G-60 |
| HS-62 | Word anchors carry an edge | recommendation | glossary, ADR 0039 |
| HS-63 | `validate` checks the timing without a storyboard | recommendation | G-53 |
| HS-64 | `song.json` gets a schema | recommendation | G-58 |
| HS-65 | Line kind and confidence as schema fields | recommendation | G-62 |
| HS-67 | ADR 0039 | recommendation | `docs/adr/0039-song-timing.md` |
| HS-68 | Lyrics rules once; Python follows | recommendation | G-57 |

# Adoption – storyboard
Date: 2026-11-21 · Commit: 2ba1480 · Slice: shots, shot sources, coverage, validation, contact sheet (concept `storyboard`) · Analysts: 3 lenses

## Scope

- **Slice:** the storyboard schemas (`ShotSchema`, `StoryboardSchema`, layers, transitions), the storyboard
  checks in `resolveStoryboard` with their episode branches, `validate` and `validateProject`, the hook's
  storyboard path, the contact sheet, `storyboard.md`, and the storyboard skill. No shared library.
- **Out of scope:** anchors and their resolution (timing slice), the generation queue (verdict slice), keyframe
  and clip generation (generation), the definitions of sets, plates, props and character states (character), the
  script and scenes (series), the Remotion compositions (render). Consumers were read for coupling only.
- **Intent:** domain model, as for the earlier slices. **Language:** artifacts `en`, UI `en`.
- **Since the last slice:** no code change (same day).

| Layer | Files |
|---|---|
| core (domain) | the storyboard parts of `packages/core/src/schema.ts`, `timing.ts` (`resolveStoryboard`, `EpisodeContext`, `MOTION_COMPONENTS`), `project.ts` (load), `state.ts` (stage) |
| cli (application) | `validate.ts`, `validate-file.ts`, `contact-sheet.ts`, `index.ts` (`validate`, `contact-sheet`), `npx.ts` (`validate`) |
| consumers | `queue.ts` (`buildShotItems`), `render.ts`, `qa.ts`, `subtitles.ts`, `board-review.ts`, `board-production.ts`, `packages/remotion/src/components/ShotRenderer.tsx`, `Transition.tsx`, `TextOverlay.tsx` |
| workspace | `workspace/.claude/skills/storyboard/SKILL.md`, `hooks/validate-artifacts.mjs` |
| tests | `tests/continuity.test.ts`, `timing.test.ts`, `schema.test.ts`, `contact-sheet.test.ts`, `episode*.test.ts` (storyboard parts) |

## How this slice was decided

As in the verdict and timing slices: no code-level questions. Every technical hotspot was decided by the
recommendation and is marked "not reviewed by the user – delegated". The user answered four questions about how
they work:
1. They have never looked at the contact sheet. If it stays, it belongs in the board's view of an active
   project, with images if possible.
2. When something in the storyboard is wrong, they tell the agent; they do not edit it.
3. They use lip-sync shots in music videos regularly.
4. Their videos use AI clips, motion graphics and mixed shots, but no footage.
Answer 3 makes G-69 high; answers 1 and 4 set G-70 and G-73 to medium and footage to low. ADR 0040 stays
`Proposed`.

## What the repository is (facts)

- `storyboard.yaml` is written by the agent (skill step 3), parsed only by `loadProject`, and checked as a whole
  by `resolveStoryboard`, whose only caller is `validateProject`. Render, contact sheet, QA, subtitles and the board
  review go through it; the queue's `buildShotItems` and QA's continuity checks read the raw storyboard.
- The checks: unique `shot-NNN` ids, start order, at least one frame per shot, a known section, coverage from 0
  to the audio duration within one frame, the source rules, continuity references, highlights inside the text,
  and chaining from an earlier shot. A `time` anchor only warns.
- One model for both kinds: an episode adds scene sets and plates, ChatWindow chat lines, and lip-sync face and
  length checks through `EpisodeContext`. A music video gets no lip-sync check at all.
- The contact sheet is a hand-built SVG of text cards with no images; the board embeds it. `storyboard.md` is
  written by hand. The hook validates every storyboard edit, which also rewrites `timing.effective.json`.
- Dead fields: `storyboard.timing`, `.style`, `.characters` and `layer.blend`. `camera` is read by no code. Undeclared
  keys in `motion.props` are read by the queue and ChatWindow. `fade`, `dissolve` and `wipe` render alike.
- `ShotSchema` changed in six commits (lip-sync, focus, episodes, lip-sync limits, plates, props and states).
  `layers`, `mixed`, `chaining`, `highlights` and `transition` date from the first commit. No demo uses mixed shots.
  There are no TODOs and no reverts.

## Domain model (decided by recommendation)

- **Context:** `BC-Storyboard` – Storyboard. It is run by the pipeline's `storyboard` stage, which both kinds
  share. It reads the effective timing (BC-Timing) and refers to the bibles and the canon. It feeds the queue,
  render, QA, subtitles and the board review.
- **Aggregate:** `AGG-Storyboard` (`as-is`: parsed whole, checked as one, validated on every edit). Its
  invariants:
  - coverage within one frame;
  - order and ids;
  - each source has what it needs (lip-sync shots need no video prompt, chained shots no keyframe prompt);
  - every layer can be rendered;
  - continuity references exist;
  - the episode scene rules;
  - lip-sync checks in both kinds;
  - a highlight is one word;
  - chaining from an earlier shot;
  - the agent is the only writer.
- **Commands:** write storyboard, revise storyboard, validate storyboard, write contact sheet. **Policy:** every
  storyboard edit is validated (the hook). **Read models:** resolved storyboard, storyboard table, contact sheet.
  **Flow:** `FLOW-Storyboard`.
- **Glossary:**
  - New: **Layer**, **Continuity Reference**, **Lip-Sync Shot**, **Highlight**, **Focus Point**.
  - Sharpened: **Shot** (all its parts, ids, avoid "cut"), **Storyboard** (one model, the agent writes it at the
    user's request), **Shot Source** (avoid "source" alone), **Coverage** (song or episode track, within one
    frame), **Contact Sheet** (on the board, with keyframes).
- **ADR:** 0040 (Proposed), which amends 0005 and 0016.

## Package documentation written

- `.claude/rules/storyboard.md` – path-scoped slice doc; nothing left `[OPEN]`.
- `docs/engineering/conventions.md` – an agent-written artifact checked whole by one core function, consumers
  through `validateProject`, derived documents going stale, the storyboard seam.
- `docs/architecture/data-model.md`, `docs/domain/context-map.as-is.md` – `AGG-Storyboard`, `BC-Storyboard`.

## Contradictions found and how they were resolved

| Contradiction | Resolution |
|---|---|
| Glossary "grid of stills" vs text cards in an SVG | on the board, with keyframes (user; G-70) |
| Lip-sync checks for episodes only vs regular music-video lip-sync; skill "≤ 30 s" | both kinds, the provider's maximum (user and recommendation; G-69) |
| An AI clip needs both prompts vs unused video prompts of lip-sync shots and keyframe prompts of chained shots | each needs only the prompt it uses (G-71) |
| "One validated storyboard" (render, board) vs the queue and QA reading the raw one | everything reads the validated one (G-72) |
| A mixed AI-clip layer validates with only a video prompt vs renders empty | every layer renderable (G-73) |
| Highlight: substring (validation) vs word (renderer) | one word (G-77) |
| `project.ts` and ADR 0016 "path fields unused for an episode" vs unused for both kinds | remove them (G-78) |
| Skill: `storyboard.md` "derived" vs written by hand | generated (G-81) |
| Skill "shot list", "storyboard critic", lyric rule under Episodes | glossary terms; skill fix (G-74) |
| Glossary "character sheet required for every character shot" vs `validate` not checking it | the queue's check before generation is intended |
| Motion components and continuity references kept in two and three places | one place each (G-75, G-76) |

## Rules and checks

| Rule | Enforcement | State |
|---|---|---|
| Coverage within one frame, start at 0, end at the duration; order, unique ids, the id format, a known section, at least one frame; the `time` anchor warning | `tests/storyboard-characterization.test.ts` | green |
| Source rules: motion component, both prompts of an ordinary AI clip, footage asset, two layers and valid layers of a mixed shot | `tests/storyboard-characterization.test.ts` | green |
| Highlights inside the text, ignoring case; chaining from an existing earlier shot | `tests/storyboard-characterization.test.ts` | green |
| Continuity references, plates, props, states, the episode set rule | existing `tests/continuity.test.ts`, `tests/episode.test.ts` | green |
| Music-video lip-sync checks, single prompts, renderable layers, validated input for every consumer, one-word highlights | documentation until stories build them (G-69–G-73, G-77) | – |
| The slice stays inside the packages' allowed imports | slice 1 boundary rule and test | green |

## Gap register (candidates – stories only with --stories)

17 candidates, G-69 to G-85, in `docs/domain/gap-register.md`:
- 13 *exist but contradict*. The highest are G-69 (music-video lip-sync), G-71 (prompts), G-72 (unvalidated
  input) and G-73 (empty layers).
- 2 are *missing*: G-70 (the contact sheet with keyframes) and G-85 (tests).
- 2 are *dead*: G-78 (path fields) and G-79 (`blend`).

## Deliberately left alone

- Production code, the storyboard and ai-clips skills, and ADRs 0005, 0016 and 0025, which are accepted. ADR 0040
  amends 0005 and 0016.
- The definitions of sets, plates, props and character states, and the canon append rule (character slice).
  ChatWindow typing and the script's scenes (series slice).
- The Remotion compositions, transitions and text overlay as code (render slice). G-75, G-77, G-80 and G-83 are
  recorded here because the storyboard's terms are at stake.
- The composition rules for AI shots and the 3–6 s clip length. They are agent guidance, not checks.
- The glossary term **Animatic**, which no code or skill uses (render slice).
- The hook rewriting `timing.effective.json` on every storyboard edit. It is harmless, because the snapshot is
  the same merge (timing slice, HS-49).

## Open hotspots

None. HS-69 to HS-86 are resolved, four of them partly by the user's answers.

## Next slice

`generation` per the adoption plan: `generate`, the cache and manifest, provider adapters, models and roles, and
ComfyUI. It owns how keyframes and clips are made from this slice's shots and prompts.

## Decision log

| # | Decision | How | Written to |
|---|---|---|---|
| HS-71 | The contact sheet on the board, with keyframes | user (2026-11-21) | glossary, `RM-ContactSheet`, G-70 |
| HS-72 | Lip-sync checks in both kinds; provider maximum | user (regular use) and recommendation | invariant, ADR 0040, G-69 |
| HS-77 | The agent is the only writer, at the user's request | user (2026-11-21) | glossary (Storyboard), invariant, `CMD-ReviseStoryboard` |
| HS-82 | Every layer renderable; at most one ChatWindow per mixed shot | recommendation; medium because the user uses mixed shots | invariant, G-73 |
| HS-69 | One context, Storyboard; one model for both kinds | recommendation | `BC-Storyboard` |
| HS-70 | The whole storyboard as the aggregate (as-is) | recommendation | `AGG-Storyboard` |
| HS-73 | Lip-sync shots need no video prompt, chained shots no keyframe prompt | recommendation | invariant, G-71 |
| HS-74 | Remove the storyboard path fields | recommendation | G-78 |
| HS-75 | Keep `camera` as direction; remove `blend` | recommendation | glossary (Shot), G-79 |
| HS-76 | Keep five transition values; render them apart | recommendation | G-80 |
| HS-78 | `storyboard.md` generated from the YAML | recommendation | `RM-StoryboardTable`, G-81 |
| HS-79 | Every consumer reads the validated storyboard | recommendation | `CMD-ValidateStoryboard`, G-72 |
| HS-80 | One continuity resolution, one motion component registry | recommendation | G-75, G-76 |
| HS-81 | A highlight is one word | recommendation | glossary, invariant, G-77 |
| HS-83 | Typed fields for clip length and keyframe workflow | recommendation | G-82 |
| HS-84 | The look comes from the storyboard, not a section's name | recommendation | G-83 |
| HS-85 | ADR 0040 | recommendation | `docs/adr/0040-storyboard.md` |
| HS-86 | Shot Source, Layer, Continuity Reference, Lip-Sync Shot; avoid "refs", "shot list" and "cut" | recommendation | glossary, G-74 |

# Adoption – generation
Date: 2026-11-21 · Commit: 512350f · Slice: generation batches, model roles, the budget check, the generation cache, the manifest, the provider adapters and ComfyUI (concept `generation`) · Analysts: 3 lenses

## Scope

- **Slice:**
  - core: `models.ts`, `cost.ts`, `hash.ts`, `flex.ts`, `fl2va.ts`, and the model roles, providers and budget
    parts of `schema.ts` and `state.ts`;
  - providers: every file of `packages/providers/src/` except `publish/`;
  - cli: `generate.ts`, `clip-options.ts`, `comfy.ts`, `image-ops.ts` and their wiring in `index.ts`;
  - `config/models.yaml`, `config/defaults.yaml`, `comfyui/`, `docs/providers.md`.

  No shared library.
- **Out of scope:**
  - the generation queue and verdicts (verdict slice);
  - the budget ledger itself (pipeline slice);
  - the voice track and lip-sync audio segments (series);
  - the model bench (bench);
  - the publish and post adapters (publish).

  Consumers were read for coupling only.
- **Intent:** domain model, as for the earlier slices. **Language:** artifacts `en`, UI `en`.
- **Since the last slice:** no code change (same day). `slice.ts --cluster generate` found schema and fixture
  scripts instead of the generation code, so the scope was cut by hand from the providers' callers.

| Layer | Files |
|---|---|
| core (domain) | `models.ts`, `cost.ts`, `hash.ts`, `flex.ts`, `fl2va.ts`, `errors.ts`; the `ModelsConfigSchema`, `ProvidersSchema` and `BudgetSchema` parts of `schema.ts`; `recordSpend` and `remainingBudget` in `state.ts` |
| providers (adapters) | `types.ts`, `runner.ts`, `http.ts`, `duration.ts`, `index.ts`, `mock.ts`, `fal.ts`, `higgsfield.ts`, `topview.ts`, `comfyui.ts` |
| cli (application) | `generate.ts` (`runBatch`, `resolveItem`, `BatchItemSchema`), `clip-options.ts`, `comfy.ts`, `image-ops.ts`, `index.ts` (`generate`, `estimate`, `spend`, `comfy`) |
| consumers | `queue.ts`, `patch.ts`, `voice-track.ts`, `bench.ts`, `qa.ts` (manifest check), `doctor.ts`, `release-autopilot.ts` |
| config and docs | `config/models.yaml`, `config/defaults.yaml`, `comfyui/README.md`, `docs/providers.md`, ADRs 0006, 0011, 0014, 0015, 0017, 0021, 0026, 0027 |
| tests | `providers.test.ts`, `generate-*.test.ts`, `fal-provider`, `higgsfield`, `topview`, `comfyui`, `models`, `clip-duration`, `lipsync-routing`, `pika-*`, `seedvr2-wan`, `runner-commands`, `image-ops` |

## How this slice was decided

As in the earlier slices, there were no code-level questions. Every technical hotspot was decided by the
recommendation and is marked "not reviewed by the user – delegated". The user answered four questions about how
they work:
1. They generate with all four providers: ComfyUI locally, fal.ai, Higgsfield and Topview.
2. Generation runs only through the stages and the queue. They never run `generate`, `estimate` or `spend` by
   hand.
3. They read spend on the board and do not compare it with the providers' bills.
4. Only the agent changes the model roles and a project's model overrides.

Answer 1 makes the double charge on a retried fal submission medium (G-86). Answer 2 keeps the hand commands low
(G-88, G-89). Answer 3 makes planned spend intended. Answer 4 makes the stale provider docs medium (G-93, G-94),
because the agent reads them. ADR 0041 stays `Proposed`.

## What the repository is (facts)

- **One path.** `runBatch` is the one path for every media generation: `generate`, the queue (one item per
  call), `patch`, `voice-track` and the bench. No adapter is called around it. The release autopilot's fal file
  upload is not a generation.
- **What `runBatch` does:**
  - it resolves every item's model role for the project's provider;
  - it checks the batch's worst-case estimate (cache hits included, also for a dry run) against the remaining
    budget and the batch cap;
  - it runs one `GenerationRunner` per provider;
  - it records the planned cost and saves the state after each new result.
- **The runner** (`packages/providers`) owns:
  - the cache key: what is sent, the reference paths and content hashes, the audio, the workflow hash;
  - the workspace-wide cache under `.cache/generations/`;
  - the append-only manifest. A reuse is recorded at $0 and a failure as `failed`.
- **Model roles and providers.** There are 20 model roles in `config/models.yaml`, 10 with fal.ai as base and 10
  with ComfyUI. Provider alternatives cover Higgsfield, Topview and ComfyUI. The project picks providers per kind.
  Lip-sync falls back to fal.ai when the video provider is ComfyUI or Topview, `audio.*` defaults to ComfyUI, and
  reference-to-video always runs on ComfyUI.
- **Operations.** There are nine operations. The cloud adapters implement six: stills, edits, three clip
  operations and lip-sync. ComfyUI implements all nine: it runs tagged workflows on the user's GPU for stills,
  edits, every clip operation, lip-sync (Pika first, LTX fallback), audio and the restore pass. Mock writes
  deterministic placeholders for every operation except the restore pass.
- **Item checks.** About 15 schema refinements and the provider limits are checked before any call:
  - the Flex and FL2VA prompts;
  - the Pika aspect and model locks;
  - the full-mix guard;
  - the lip-sync `maxDuration`;
  - duration snapping.
- **Dead parts.** `budget.reservedUsd`, the `beforeGenerate` hook and the `retries` block of `defaults.yaml` are
  never used.
- **Idempotency.** fal submissions are retried without an idempotency key.
- **History.** `schema.ts` (34 commits), `generate.ts` (23) and `models.yaml` (18) change most. There are no
  reverts or TODOs. Two breaking commits are `0c34c20` (ComfyUI runs everything) and `7e810b4` (LTX FLF2V
  lip-sync).

## Domain model (decided by recommendation)

- **Context:** `BC-Generation` – Generation.
  - Its callers are the queue (BC-GenerationQueue), the voice track and the canon (series), and the bench.
  - It bills spend to `AGG-Project` (BC-Pipeline).
  - Its external systems are the cloud providers and the ComfyUI server.
- **Aggregates:**
  - `AGG-CachedGeneration` (`as-is`: one record per cache key, written once, reused while its files exist,
    shared by the workspace).
  - `AGG-ModelRoles` (`as-is`: `config/models.yaml` parsed whole and resolved in one place; only the agent
    changes it).
  - `AGG-Project` gains one invariant: the recorded spend equals the manifest's cost sum.
- **Commands:** run a generation batch, estimate a generation, change model roles, restart ComfyUI.
- **Policies:**
  - every new generation is billed at its planned cost;
  - a failed local generation restarts ComfyUI.
- **Read models:** manifest, generation estimate, ComfyUI status.
- **Flow:** `FLOW-Generation`.
- **Glossary:**
  - New: **Generation**, **Generation Operation**, **Model Role**, **Provider**, **Generation Cache**,
    **Project Budget**, **Batch Cap**.
  - Sharpened: **Manifest** (every generation, reuses at $0, equals the spend), **Generation Batch** (the
    worst-case check, one item per queue batch), **Provider Adapter** (the real capabilities, avoid "backend"),
    **Cache Key** (content, not paths), **Video Model** (LTX or Wan for local image-to-video and
    first-last-frame; Pika from the role's workflow).
- **ADR:** 0041 (Proposed), which amends 0006, 0014 and 0017.

## Package documentation written

- `.claude/rules/generation.md` – path-scoped slice doc; nothing left `[OPEN]`.
- `docs/engineering/conventions.md` – the one generation path, who owns the cache and the budget, models in
  configuration, the adapter mechanics, three seams.
- `docs/architecture/data-model.md`, `docs/domain/context-map.as-is.md` – `AGG-CachedGeneration`,
  `AGG-ModelRoles`, the manifest line, `BC-Generation`.

## Contradictions found and how they were resolved

| Contradiction | Resolution |
|---|---|
| Glossary and `providers.md`: the cloud adapters do every operation, ComfyUI only video and lip-sync, versus the code | the code; glossary corrected, docs a gap (G-93) |
| Local lip-sync: LTX (`providers.md`, `comfyui/README.md`, ADR 0017) versus Pika first (`models.yaml`, ADR 0027); "defaults to video" versus the fal fallback | the code and ADR 0027 (G-94) |
| Glossary Video Model: `ltx` for every operation including lip-sync, a "clip backend" | LTX or Wan for local image-to-video and first-last-frame; glossary corrected |
| ADR 0006: three operations, "batch state is resumable", "abort before the first paid call" | nine operations; no batch state, the cache and the per-item spend make a rerun cheap; the worst-case check holds (ADR 0041, G-103) |
| ADR 0011 and 0021: an idempotency key from the hash, versus fal retried without one | no double charge (G-86) |
| ADR 0021: a new provider means an adapter and an enum value, versus five lists and routing in `generate.ts` | provider rules in adapters and roles (G-97) |
| `defaults.yaml` retries and timeouts, versus hard-coded values in the adapters | adapters own them; the block goes (G-92) |
| QA: manifest cost sum equals spend, versus `spend` and a paid call without a file | every spend has a manifest line (G-87, G-88) |
| `estimate` checks the cap only, versus `generate` checking both limits | same rules (G-89) |
| `workspace/AGENTS.md`, `providers.md` and the ai-clips skill on the cache key, spend per stage and recording spend | stale docs (G-95) |

## Rules and checks

| Rule | Enforcement | State |
|---|---|---|
| The worst-case estimate fits the batch cap and the remaining budget before any provider exists, also as a dry run; the cap never exceeds the remaining budget | `tests/generation-characterization.test.ts` | green |
| ComfyUI and mock cost nothing whatever the role costs | `tests/generation-characterization.test.ts` | green |
| A new paid generation is billed at its planned cost and saved; a reuse is free; each gets a manifest line and their costs equal the spend | `tests/generation-characterization.test.ts` | green |
| A failed call is a `failed` manifest line at no cost and is not cached | `tests/generation-characterization.test.ts` | green |
| Only `runBatch` creates a generation runner; adapters are built only where they feed it (bench) or for a non-generation upload (release autopilot) | `tests/generation-characterization.test.ts` (architecture test) | green |
| The cache key, cache reuse, role resolution, lip-sync routing, duration snapping, Pika and Flex rules, adapter requests | existing `tests/providers.test.ts`, `models.test.ts`, `lipsync-routing.test.ts`, `clip-duration.test.ts`, `pika-*.test.ts`, adapter tests | green |
| `packages/providers` imports only core | slice 1 boundary rule and `tests/package-boundaries.test.ts` | green |
| No double charge, content-only cache key, a manifest line for every spend, `estimate` with both limits | documentation until stories build them (G-86–G-89, G-99) | – |

## Gap register (candidates – stories only with --stories)

19 candidates, G-86 to G-104, in `docs/domain/gap-register.md`:
- 14 *exist but contradict*. The highest are G-86 (double charge on fal), G-93 (capability docs) and G-94
  (local lip-sync docs), all medium.
- 1 is *missing*: G-104 (tests).
- 3 are *dead*: G-90 (`reservedUsd`), G-91 (`beforeGenerate`), G-92 (the retries config).

## Deliberately left alone

- Production code, `docs/providers.md`, `comfyui/README.md`, the ai-clips skill, and ADRs 0006, 0011, 0014, 0017,
  0021, 0026 and 0027, which are accepted. ADR 0041 amends 0006, 0014 and 0017. Only the glossary was corrected,
  because it is this adoption's language.
- The per-model limits that only agents follow (clip length up to 10 s on Pika, 3–6 s clips, qwen-edit with at most 4
  references on 16 GB, `asset_batch_size`). They are agent guidance, not checks.
- The queue's attempt cap and cloud fallback (verdict slice), the state lock (G-1, pipeline slice), the voice
  track's `maxDuration` check (series), the bench's own manifest and budget (bench), and the release autopilot's
  fal upload (publish).
- The model prices in `config/models.yaml`. They are planning estimates; Topview Avatar 4 is marked unverified.

## Open hotspots

None. HS-87 to HS-102 are resolved, three of them partly by the user's answers.

## Next slice

`series` per the adoption plan: series canon, episodes, script, takes, voice track, episode track, subtitles and
lip-sync audio. It is the largest caller of this slice outside the queue.

## Decision log

| # | Decision | How | Written to |
|---|---|---|---|
| HS-88 | Two as-is aggregates, the cached generation and the model roles; only the agent changes the roles | user (2026-11-21) and recommendation | `AGG-CachedGeneration`, `AGG-ModelRoles`, glossary (Model Role) |
| HS-92 | Planned spend equal to the manifest; the board's planned spend is enough | user (2026-11-21) and recommendation | `POL-RecordPlannedSpend`, `AGG-Project` invariant, G-87, G-95 |
| HS-97 | No double charge on a retried submission | recommendation; medium because the user uses all cloud providers | `CMD-RunGenerationBatch`, ADR 0041, G-86 |
| HS-87 | One context, Generation | recommendation | `BC-Generation` |
| HS-89 | A workspace-wide cache keyed by content | recommendation | `AGG-CachedGeneration`, glossary (Cache Key, Generation Cache), G-99 |
| HS-90 | The worst-case budget check per batch, cache hits included | recommendation | `CMD-RunGenerationBatch`, glossary (Generation Batch) |
| HS-91 | The project budget guards a queue run; `beforeGenerate` goes | recommendation | ADR 0041, G-91 |
| HS-93 | `reservedUsd` goes | recommendation | G-90 |
| HS-94 | Every recorded spend has a manifest line | recommendation; low because the user runs no hand commands | G-88 |
| HS-95 | `estimate` follows the rules of a run | recommendation; low | `CMD-EstimateGeneration`, G-89 |
| HS-96 | The adapters own timeouts and backoff; the retries block goes | recommendation | G-92 |
| HS-98 | Provider, Provider Adapter, Model Role, Generation, Generation Operation, Generation Cache, Project Budget, Batch Cap; avoid "backend" | recommendation | glossary |
| HS-99 | Video Model is LTX or Wan for local image-to-video and first-last-frame | recommendation | glossary |
| HS-100 | Provider rules in adapters and model roles; one provider list | recommendation | ADR 0041, G-97, G-98, G-100 |
| HS-101 | The code is right about capabilities and the local lip-sync; docs follow | recommendation; medium because the agent reads the docs | glossary, G-93, G-94 |
| HS-102 | ADR 0041 | recommendation | `docs/adr/0041-generation-funnel.md` |
