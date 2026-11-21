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
