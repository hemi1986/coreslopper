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

# Adoption – series
Date: 2026-11-22 · Commit: 2ec8a70 · Slice: the series budget and episode plan, episode creation, the script, the take registry, the voice track, the episode track, subtitles and lip-sync audio (concept `series`) · Analysts: 3 lenses

## Scope

- **Slice:**
  - core: `episode.ts`; the series, script and take schemas and the episode fields of `ProjectConfigSchema` in
    `schema.ts`; series and episode loading in `project.ts`; `EPISODE_STAGES` in `state.ts`;
    `seriesNextAction` in `production.ts`;
  - cli: `series.ts`, `new-series.ts`, `new-project.ts` (episode path), `voice-track.ts`, `takes.ts`,
    `episode-track.ts`, `subtitles.ts`, `import-takes` and `audio-segment --character` in `media.ts`, and the
    series parts of `validate.ts`, `validate-file.ts`, `generate.ts`, `status.ts` and `board-production.ts`;
  - workspace: the skills `new-series`, `new-episode`, `voice-track` and `episode-track`, the `series-status`
    command, and the demo canon and episode.

  No shared library.
- **Out of scope:**
  - the canon files (characters, sets, plates, props, style, the character library): slice `character`;
  - rendering and the compositions, `Subtitles.tsx` read for coupling only: slice `render`;
  - the timing merge, the storyboard and the generation runner: already adopted;
  - `lipsync-audio.ts` and the lead-only muting: music-video logic (BC-Timing).
- **Intent:** domain model, as for the earlier slices. **Language:** artifacts `en`, UI `en`.
- **Since the last slice:** no code change (same night). `slice.ts --cluster episode` and `--cluster sery` found
  the seeds; the scope was completed by hand from the callers.

| Layer | Files |
|---|---|
| core (domain) | `episode.ts`; `SeriesSchema`, `SeriesStateSchema`, `ScriptSchema`, `TakesSchema` and the episode project fields in `schema.ts`; `loadSeries`, `seriesDir` in `project.ts`; `EPISODE_STAGES`; `seriesNextAction` |
| cli (application) | `series.ts`, `new-series.ts`, `new-project.ts`, `voice-track.ts`, `takes.ts`, `episode-track.ts`, `subtitles.ts`, `media.ts` (`importTakes`, lip-sync segments), the commands in `index.ts`; series parts of `validate*.ts`, `generate.ts` (`seriesTarget`), `board-production.ts`, `board-wizard.ts` |
| workspace (orchestration) | `new-series`, `new-episode`, `voice-track`, `episode-track` skills; `series-status.md`; episode parts of `stage-runner.md` |
| fixtures | `projects/demo-series/`, `projects/demo-episode/` |
| tests | `episode.test.ts`, `episode-track.test.ts`, `episode-lipsync.test.ts`, `episode-render.test.ts`, `series-budget.test.ts`, `series-status.test.ts` |

## How this slice was decided

As in the earlier slices, there were no code-level questions. Every technical hotspot was decided by the
recommendation and is marked "not reviewed by the user – delegated". The user answered four questions about how
they work:
1. All voices are generated on ComfyUI; they record nothing themselves.
2. At least one episode went all the way to release.
3. Speech is German and subtitles are English, as the code does it today.
4. Only the agent changes a script once it is written.

Answer 1 makes the stale take after a voice change medium (G-112) and keeps the import path intended but rare.
Answer 2 confirms the episode path works end to end; nothing in it is dead. Answer 3 keeps `text_de` and the
English subtitles as they are, with generic languages as a later gap (G-114, low). Answer 4 makes the agent the
only writer of `script.yaml` (HS-121). ADR 0042 stays `Proposed`.

## What the repository is (facts)

- **Series.** A folder in `projects/` with `series.yaml` and `state.json`. `new-series` requires a budget and a
  free slug and writes the starter canon. Episodes are found by scanning the sibling `project.yaml` files; the
  series stores no episode list.
- **Series budget.** The uncommitted series budget is the series budget minus canon spend minus every episode
  budget. It is checked only when an episode is created. Canon generations check total minus canon spend,
  without the episode budgets. `budget_usd` is optional in the schema and kept twice.
- **Episode.** A project of kind `episode`. It copies formats, providers and brand once and has the stages
  `setup`, `script`, `voice-track`, `episode-track`, then the shared four. Duplicate episode numbers and episodes
  outside the plan pass `new`.
- **Script.** Six line kinds:
  - spoken: dialogue, voiceover, announcement;
  - subtitled: the spoken kinds plus chat;
  - audible: the spoken kinds plus sfx.

  `validateScript` lists every broken rule in one error, and the hook runs it on every edit. The TTS rule
  rejects digits, symbols and German abbreviations, but a leading voice description in brackets is exempt.
  `with` (overlap) is always refused.
- **Takes.** `takes.json` has five statuses: current, missing, stale, replaced and unregistered. What blocks:
  - a replaced or unregistered take always;
  - a stale take only if it was imported; a stale generated take is regenerated.

  The hash covers kind, speaker and `text_de`, or an effect's prompt and duration, or an ambience's prompt. It
  leaves out the reference voice and `direction`, and `direction` is never read.
- **Episode track.** It is deterministic: it places the lines one after another from the take durations. In one
  run it writes the timing, the mix and one stem per speaker from the effective timing. The mix uses fixed gains
  for ambience and the optional music, plus a loudness target.
- **Subtitles and lip-sync audio.** Subtitles are English only, as `renders/<slug>.en.srt` or burned in. Lip-sync
  audio comes from the speaker stem.
- **Checks and locks.** `limits.episode_seconds` is checked only in QA. There are no locks on `takes.json` or
  the series state.
- **History.** Almost the whole slice landed on 2026-11-10. The one breaking change is `3ac49cc` (series into
  `projects/`). There are no reverts or TODOs.

## Domain model (decided by recommendation)

- **Context:** `BC-Series` – Series.
  - Episodes are projects of BC-Pipeline.
  - Takes and canon references are generated through BC-Generation.
  - The episode track writes the timing that BC-Timing merges.
  - The canon files are read here but belong to the character slice.
- **Aggregates (all `as-is`):**
  - `AGG-Series`: the commitment of canon spend and episode budgets, one slug namespace, one episode per number,
    settings copied once, and the canon append-only for episodes.
  - `AGG-Script`: validated whole, written only by the agent.
  - `AGG-TakeRegistry`: one take per audible line; staleness from the line, the reference voice and the
    direction; imported takes protected.
  - `AGG-EpisodeTrack`: built whole from the takes and the effective timing; the length limit is checked when it
    is built.
- **Commands:** create a series, create an episode, record canon spend, write, revise and validate the script,
  generate the takes, import takes, build the episode track, write subtitles, cut lip-sync audio.
- **Policy:** every script edit is validated; a canon generation's planned cost is recorded (an extension of
  `POL-RecordPlannedSpend`).
- **Read models:** series status, take status, subtitles. **Flows:** `FLOW-Episode`, `FLOW-EpisodeTrack`.
- **Glossary:**
  - New: **Uncommitted Series Budget**, **Planned Episode**, **Canon Gap**, **Take Registry**, **Take Status**,
    **Voice Track**.
  - Sharpened: **Series** (not a project), **Series Budget** (always set), **Episode** (settings copied once),
    **Take**, **Ambience** (avoid "atmo"), **Episode Track**, **Speaker Stem** (no longer avoids "voice
    track"), **Subtitles** (German speech and English subtitles today).
- **ADR:** 0042 (Proposed), which amends 0016.

## Package documentation written

- `.claude/rules/series.md` – path-scoped slice doc; nothing left `[OPEN]`.
- `docs/engineering/conventions.md` – take status and the series budget as further rules outside core, ffmpeg,
  three seams (script rule, series budget, episode audio).
- `docs/architecture/data-model.md`, `docs/domain/context-map.as-is.md` – the four aggregates and `BC-Series`.

## Contradictions found and how they were resolved

| Contradiction | Resolution |
|---|---|
| Glossary: canon plus episodes fit in the series budget, versus canon generations ignoring episode budgets | the glossary (G-105) |
| Series budget mandatory (command, skill, glossary) versus optional in the schema | mandatory (G-106) |
| ADR 0016 "never writes the canon", ADR 0025 append-only, versus any canon file writable | ADR 0025 (G-118) |
| `direction` documented as acting direction, versus never read | wired, hashed (G-113) |
| ADR 0016: a changed canon changes cache keys, versus takes ignoring the reference voice | a voice change stales the take (G-112) |
| `new-series` grills "the languages of speech and subtitles", versus `text_de`, the German TTS rule and English subtitles | as it is, generic later (G-114) |
| `series-status.md` checks the episode length, versus only QA | checked when the episode track is built (G-115) |
| Glossary Speaker Stem avoids "voice track", versus the stage `voice-track` | Voice Track is the stage; glossary corrected |
| `unplanned` for two different things | Planned Episode and episode outside the plan (G-110) |
| "A series is a project of its own" (comments), versus the glossary's Project | a series is not a project |
| Canon readiness: "speaking characters without a reference voice", versus only a missing listed file | a missing voice is a canon gap (G-111) |
| Rules in core (conventions), versus take status and the series budget in cli | accident (G-116) |
| ADR 0016 as a "first version" with a demo canon, without `file_hash`, with `series/` paths | ADR 0042 (G-119) |

## Rules and checks

| Rule | Enforcement | State |
|---|---|---|
| A spoken take goes stale on its speaker or spoken text, not on its subtitle or pause; an effect on its prompt or length; an ambience only on its prompt; chat and pause lines have no take | `tests/series-characterization.test.ts` | green |
| A leading voice description is exempt from the TTS rule, the spoken text after it is not | `tests/series-characterization.test.ts` | green |
| The series' next action: canon, then planned episodes, then done | `tests/series-characterization.test.ts` | green |
| An episode keeps its formats, providers and brand when the series changes later | `tests/series-characterization.test.ts` | green |
| Script validation, take status and blocking, the uncommitted series budget, canon generations on the series budget, imported takes protected, the constructed timing | existing `tests/episode*.test.ts`, `series-budget.test.ts`, `series-status.test.ts` | green |
| The slice stays inside the package import direction | slice 1 boundary rule and `tests/package-boundaries.test.ts` | green |
| Commitment on canon generations, mandatory series budget, one episode per number, canon append-only, voice and direction in the take hash, length at the episode track | documentation until stories build them (G-105–G-118) | – |

## Gap register (candidates – stories only with --stories)

17 candidates, G-105 to G-121, in `docs/domain/gap-register.md`:
- 14 *exist but contradict*. The highest are G-105 (canon spend ignores episode budgets), G-112 (voice change
  leaves takes current) and G-118 (an episode can overwrite canon files), all medium.
- 2 are *missing*: G-107 (no series budget command) and G-121 (tests).
- 1 is *dead*: G-113 (`direction`).

## Deliberately left alone

- Production code, the four skills, `series-status.md`, and ADRs 0016, 0025, 0026 and 0035, which are accepted.
  ADR 0042 amends 0016. Only the glossary was corrected.
- The canon files and their rules: the character slice. The episode's appended plates, props and states on the
  episode budget and manifest (`stage-runner.md`) are noted there.
- Cloud speech (ADR 0016 "not decided"): voices are generated locally.
- `lipsync-audio.ts`, `separate_lead.py` and the echo scan: music-video logic.
- `checkTakes` probing WAV lengths while `voice-track` trusts `takes.json`: an analyst's note, not checked.
- The board's German UI strings in `board/production.js`: a UI locale, not domain.

## Open hotspots

None. HS-103 to HS-122 are resolved, four of them partly by the user's answers.

## Next slice

`character` per the adoption plan: the character library, style and character bibles, sets, plates and props –
the canon files this slice reads and episodes append to.

## Decision log

| # | Decision | How | Written to |
|---|---|---|---|
| HS-111 | A changed reference voice makes a take stale | user (voices generated, 2026-11-22) and recommendation; medium | `AGG-TakeRegistry`, ADR 0042, G-112 |
| HS-113 | German speech and English subtitles as they are; languages per series later | user (2026-11-22) and recommendation | glossary (Subtitles), ADR 0042, G-114 |
| HS-121 | Only the agent writes `script.yaml` | user (2026-11-22) | `AGG-Script`, `CMD-ReviseScript` |
| HS-103 | One context, Series | recommendation | `BC-Series` |
| HS-104 | Four as-is aggregates | recommendation | `AGG-Series`, `AGG-Script`, `AGG-TakeRegistry`, `AGG-EpisodeTrack` |
| HS-105 | Canon spend plus episode budgets fit, also for canon generations | recommendation; medium | `AGG-Series`, ADR 0042, G-105 |
| HS-106 | Every series has a budget | recommendation | `AGG-Series`, glossary, G-106 |
| HS-107 | `budget_usd` the source, `state.json` a copy; no budget command yet | recommendation, as HS-5 | `AGG-Series`, G-107 |
| HS-108 | One episode per number; episodes outside the plan allowed | recommendation | `CMD-CreateEpisode`, G-109 |
| HS-109 | Planned Episode; episode outside the plan | recommendation | glossary, G-110 |
| HS-110 | A character without a reference voice is a canon gap unless every line is recorded | recommendation | glossary (Canon Gap), G-111 |
| HS-112 | `direction` reaches the voice and the hash | recommendation | `AGG-TakeRegistry`, ADR 0042, G-113 |
| HS-114 | The episode length is checked when the track is built | recommendation | `AGG-EpisodeTrack`, G-115 |
| HS-115 | Take status and the series budget sum belong in core | recommendation | conventions, G-116 |
| HS-116 | One `SubtitleCue` in core | recommendation | G-117 |
| HS-117 | Episodes add to the canon and never overwrite it | recommendation; medium | `AGG-Series`, ADR 0042, G-118 |
| HS-118 | Voice Track, Ambience, Take Registry, Take Status, Uncommitted Series Budget, Canon Gap, Planned Episode | recommendation | glossary |
| HS-119 | A series is not a project | recommendation | glossary (Series) |
| HS-120 | ADR 0042 | recommendation | `docs/adr/0042-series-and-episode-audio.md`, G-119 |
| HS-122 | The commitment also holds when an episode budget changes; parallel creation unguarded | recommendation | `AGG-Series`, G-108 |

# Adoption – character
Date: 2026-11-22 · Commit: f6aea03 · Slice: the style, character and set bibles with plates, prop references and character states, the user references, and the workspace character library (concept `character`) · Analysts: 3 lenses

## Scope

- **Slice:**
  - core: `StyleBibleSchema`, `CharacterSchema`, `CharacterStateSchema`, `CharacterBibleSchema`, `PlateSchema`,
    `SetSchema`, `PropSchema`, `SetBibleSchema`, `LibraryCharacterSchema` and `ReferencesSchema` in `schema.ts`;
    the bible loading in `project.ts`; the `style-character` stage in `state.ts`;
  - cli: `character-library.ts`, the `character` and `reference` commands and the automatic import at
    `stage-done` in `index.ts`, the reference functions in `board-wizard.ts`, the library routes and
    `/library-files` in `release-board.ts`, `board/characters.js`, and the bible checks in `validate-file.ts`;
  - workspace: the skills `style-bible` and `character-bible`, and the canon parts of `stage-runner.md` and
    `new-series`.

  No shared library.
- **Out of scope:**
  - generating and judging the references: the queue and verdicts, already adopted;
  - the storyboard's continuity check, `timing.ts` read for coupling only: already adopted;
  - the series budget and canon spend: already adopted;
  - the readers render and thumbnails: slice `render`;
  - `migrate-layout`: slice `workspace`.
- **Intent:** domain model, as for the earlier slices. **Language:** artifacts `en`, UI `en`; the board's Characters
  view is German.
- **Since the last slice:** no code change. `slice.ts --cluster character` found three seeds. The scope was
  completed by hand from the schemas and their callers.

| Layer | Files |
|---|---|
| core (domain) | bible, library and reference schemas in `schema.ts`; `loadProject` canon paths in `project.ts`; `style-character` in `state.ts` |
| cli (application) | `character-library.ts`; `character`, `reference`, `stage-done` in `index.ts`; `board-wizard.ts` (references); `release-board.ts` (`/api/library*`, `/library-files`); `board/characters.js`; `validate-file.ts` |
| workspace (orchestration) | `style-bible`, `character-bible` skills; canon rules in `stage-runner.md` and `new-series`; `validate-artifacts.mjs` |
| fixtures | `projects/demo`, `projects/demo-series` (no plates, props, states or references) |
| tests | `character-library.test.ts`, `continuity.test.ts`, `brand-palette.test.ts`, `board-wizard.test.ts` |

## How this slice was decided

As in the earlier slices, there were no code-level questions. Every technical hotspot was decided by the
recommendation and is marked "not reviewed by the user – delegated". The user answered four questions about how
they work:
1. They have not used the character library yet; it is new as of today.
2. They upload their own references sometimes.
3. A character that looks wrong is regenerated by the agent; they do not replace images by hand.
4. Music videos have recurring sets too, with plates and props as in a series.

How the answers shaped the model:
- Answer 1 keeps every library gap low (G-127, G-128, G-130, G-135).
- Answer 2 keeps the user references in the model and their lock gap low.
- Answer 3 makes the character sheet the anchor every regeneration derives from (HS-125, G-122 medium).
- Answer 4 confirms the set bible as a normal output of a music video's `style-character` (HS-129).

ADR 0043 stays `Proposed`.

## What the repository is (facts)

- **Bibles.** Every bible is one file parsed whole by its schema:
  - `style.yaml`;
  - `characters.yaml`, with the files in `characters/<id>/`;
  - `sets.yaml`, with plates in `sets/<set>/plates/` and props in `props/<id>/`;
  - `references.yaml`, with the files in `assets/references/`.

  The hook validates each on every edit. An episode reads its series' style, characters and sets; files in the
  episode folder are ignored.
- **Ids.** Set, prop, plate, state and library ids are unique and shaped like a script id. Character ids are any
  non-empty text and may repeat.
- **Sheets.** `sheet` is optional, and nothing checks it. The queue uses `sheet ?? refs[0]`, and canon gaps count
  only `refs`. No character of the demo canon has a sheet.
- **Continuity references.** They are resolved three times, by the storyboard check, QA and the queue. QA checks
  only a prop's first image.
- **The canon.** Episodes may append to it per `stage-runner.md` and ADR 0025. The glossary and `new-series` said
  "never change". No code enforces either.
- **User references.** Each one is a file under `assets/references/` or a link, never both. Ids are unique, and
  every listed file exists (`validate-file`). Removing a reference deletes its file.
- **Library.** It lives in `library/characters/<id>/character.yaml`, and its files are plain names stored once by
  content.
  - An import goes into the entry it came from, a same-id entry that shares a file, `--into`, or a new
    `<id>-<slug>`. It keeps the identity and appends references and states, and `history` records later
    imports.
  - `use` copies the identity always and the chosen states. It refuses an episode target and a same-id character
    of the target, and it drops `from`.
  - `stage-done … style-character` imports by itself and only warns on failure. A series canon imports through a
    skill step.
  - `update` never touches `library/`. Its media are gitignored, and `character.yaml` is tracked.
- **Concurrency.** Writes are atomic, and none is locked.
- **History.** The schemas date from 2026-11-08. Plates, props and states came with `b1c9eae` (2026-11-17), the
  library with `ec8a147` (2026-11-21). There are no reverts or TODOs.

## Domain model (decided by recommendation)

- **Contexts:**
  - `BC-Bibles` – Bibles: the style, character and set bibles and the user references of a music video or series
    canon.
  - `BC-CharacterLibrary` – Character library: workspace-wide characters, exchanged with the bibles as copies
    only.
- **Aggregates (all `as-is`):**
  - `AGG-StyleBible`: palette and roles; an episode uses the canon's.
  - `AGG-CharacterBible`: unique, script-id shaped character ids; a sheet for every recurring on-screen
    character; states derived from the sheet or a state of the same character; library copies keep their
    identity; append-only in a canon.
  - `AGG-SetBible`: unique ids; plates empty; append-only in a canon.
  - `AGG-UserReferences`: a file or a link; unique ids; existing files.
  - `AGG-LibraryCharacter`: the id is the folder; one character, one entry; files stored once and every file
    named; owned by the user.
- **Commands:**
  - bibles: write the style, character and set bible; add a character state; add a plate or prop reference;
  - user references: add, update and remove a user reference;
  - library: take characters into the library, use a library character, add a library character, add and remove
    a file, update and delete a library character.
- **Policy:** the characters of a finished character bible go into the library (`POL-ImportFinishedCharacters`).
- **Read models:** character library, user references. **Flows:** `FLOW-CharacterReuse`,
  `FLOW-ContinuityReferences`.
- **Glossary:**
  - New: **Set Bible**, **Character Identity**, **Library Character**, **Character Import**, **Character Use**.
  - Sharpened: **Style Bible** (music video or canon; an episode uses the canon's), **Character Bible**
    (everything a character carries, unique ids), **Character Sheet** (recurring on-screen characters, not the
    `sheet` command), **Canon** (append-only for episodes), **Canon Gap** (the sheet counts).
- **ADR:** 0043 (Proposed), which amends 0025 and 0034.

## Package documentation written

- `.claude/rules/character.md` – path-scoped slice doc; nothing left `[OPEN]`.
- `docs/engineering/conventions.md` – the library's rules in the CLI, unlocked writes, an episode's bibles via
  `loadProject`; three seams (bible schema, character library, keyframe references).
- `docs/architecture/data-model.md`, `docs/domain/context-map.as-is.md` – the five aggregates, both contexts, and
  the canon pointers of `BC-Series` and `.claude/rules/series.md` and `storyboard.md` moved from "character
  slice" to `BC-Bibles`.

## Contradictions found and how they were resolved

| Contradiction | Resolution |
|---|---|
| Glossary: a sheet "required for every character shot", versus optional, unchecked, `refs[0]` fallback, skill "a one-off figure may not" | a sheet for every recurring on-screen character (G-122) |
| Canon "none may change" (glossary, `new-series`), versus append for plates, props and states (ADR 0025, `stage-runner.md`) | append-only in storyboard and assets (G-126, glossary and G-134) |
| ADR 0025: the storyboard appends, versus `stage-runner.md`: storyboard and assets | storyboard and assets (ADR 0043) |
| ADR 0034: a series canon's characters come in "by themselves", versus a skill step | in code for both kinds (G-127) |
| ADR 0025: `from` keeps chains explicit, versus `use` dropping it | a chosen state brings its parents (G-129) |
| Every bible id unique and script-id shaped, versus character ids | the same rule for characters (G-124) |
| Queue: a sheet is a reference, versus canon gaps counting only `refs` | the sheet counts (G-123) |
| Glossary avoids "outfit", versus outfit references in schema, ADR 0034 and the board | an outfit is an identity reference image (Character Identity) |
| `sets.yaml` written in `style-character`, versus the stage's outputs and the skills' `stage-done` lines | an output of the stage (G-125) |
| Three resolvers of continuity references, versus one meaning | one resolution in core (G-131) |
| `style-bible` requires a recorded licence, versus no field for it | a gap (G-133) |
| `character list` prints `series/`, `workspace/CLAUDE.md` hook list without `references.yaml` | a text fix (G-134) |

## Rules and checks

| Rule | Enforcement | State |
|---|---|---|
| Every file of a library character is a plain file of its own folder | `tests/character-characterization.test.ts` | green |
| A user reference is a file in `assets/references/` or an http(s) link, never both or neither | `tests/character-characterization.test.ts` | green |
| A keyframe's references: the plate, each character's state or sheet or first reference, each prop's first reference; a missing one stops | `tests/character-characterization.test.ts` | green |
| A new sheet moves the old one into the references; a removed file clears only its field; `character.yaml` and paths are refused | `tests/character-characterization.test.ts` | green |
| Import, merge, use with chosen states, an episode target refused, the board's library routes; plate, prop and state ids unique; continuity references in validate and QA; an episode reads the canon | existing `tests/character-library.test.ts`, `continuity.test.ts`, `episode.test.ts` | green |
| The slice stays inside the package import direction | slice 1 boundary rule and `tests/package-boundaries.test.ts` | green |
| A sheet per recurring on-screen character, unique character ids, the canon append-only, one import rule, every library file named, `from` kept, locks, one resolver | documentation until stories build them (G-122–G-132) | – |

## Gap register (candidates – stories only with --stories)

15 candidates, G-122 to G-136, in `docs/domain/gap-register.md`:
- 11 *exist but contradict*. The highest are G-122 (no sheet check), G-124 (character ids) and G-126 (canon
  entries changeable by an episode), all medium.
- 3 are *missing*: G-133 (licence field), G-135 (board import options) and G-136 (tests).
- None is *dead*: the look and the prompts are agent guidance, not dead fields.

## Deliberately left alone

- Production code, the skills, and ADRs 0016, 0025 and 0034, which are accepted. ADR 0043 amends 0025 and 0034.
  Only the glossary was corrected.
- Generating and judging the references (queue, `review-image`, the `sheet:`/`state:`/`plate:`/`prop:` labels):
  the verdict slice.
- The episode budget paying for references appended to the canon (ADR 0025), and name replacement missing in
  canon generations (`seriesTarget`): the generation slice.
- File checks of `characters.yaml` and `sets.yaml` at write time: a bible is written before its images exist, so
  the queue and QA check them (HS-137).
- `stage-done` only warning on a failed import (HS-139).
- `migrate-layout` rewriting library origins: the workspace slice.
- The German UI strings of the board's Characters view: a UI locale, not domain.

## Open hotspots

None. HS-123 to HS-142 are resolved, four of them partly by the user's answers.

## Next slice

`render` per the adoption plan: render, the Remotion compositions (shared library `packages/remotion`),
thumbnails, Shorts and the media dir. These are the readers of the style bible's palette, typography and grain.

## Decision log

| # | Decision | How | Written to |
|---|---|---|---|
| HS-125 | A sheet for every recurring on-screen character, checked when an AI shot names it | user (corrections regenerated by the agent, 2026-11-22) and recommendation; medium | `AGG-CharacterBible`, glossary, ADR 0043, G-122 |
| HS-129 | The set bible is an output of style-character | user (sets in music videos, 2026-11-22) and recommendation | `AGG-SetBible`, ADR 0043, G-125 |
| HS-131 | One import rule in code for both kinds; a failure warns | recommendation; low (user: library unused) | `POL-ImportFinishedCharacters`, ADR 0043, G-127 |
| HS-134 | Lock the library, the use target and `references.yaml` | recommendation; low (user: references sometimes, library new) | ADR 0043, G-130 |
| HS-123 | Two contexts, Bibles and Character library | recommendation | `BC-Bibles`, `BC-CharacterLibrary` |
| HS-124 | Five as-is aggregates; the canon is the bibles of a series folder | recommendation | the five aggregates |
| HS-126 | The sheet counts for canon gaps | recommendation | glossary (Canon Gap), G-123 |
| HS-127 | Character ids unique and script-id shaped | recommendation; medium | `AGG-CharacterBible`, glossary, G-124 |
| HS-128 | Set Bible, Character Identity, Library Character, Character Import, Character Use; outfit as an identity image | recommendation | glossary |
| HS-130 | The canon append-only for episodes, in storyboard and assets | recommendation; medium | `AGG-CharacterBible`, `AGG-SetBible`, glossary (Canon), ADR 0043, G-126 |
| HS-132 | Every file of a library character named | recommendation | `AGG-LibraryCharacter`, glossary (Character Import), G-128 |
| HS-133 | A chosen state brings its parents | recommendation | `CMD-UseLibraryCharacter`, glossary (Character Use), G-129 |
| HS-135 | One resolution of continuity references in core | recommendation | ADR 0043, G-131 |
| HS-136 | Display rules, kinds and file types from one source in core | recommendation | conventions, G-132 |
| HS-137 | Bible files checked where they are used | recommendation | – |
| HS-138 | Look and prompts as agent guidance; a licence field missing | recommendation | `AGG-StyleBible`, G-133 |
| HS-139 | A failed import only warns | recommendation | `POL-ImportFinishedCharacters` |
| HS-140 | ADR 0043 | recommendation | `docs/adr/0043-bibles-and-character-identity.md` |
| HS-141 | Drifted texts fixed together | recommendation | G-134 |
| HS-142 | Board import options later | recommendation; low | G-135 |

# Adoption – render
Date: 2026-11-22 · Commit: e5a39c3 · Slice: renders per format, previews, Shorts, composed images (thumbnails, covers, feed images) and the media directory, with the shared library `packages/remotion` (concept `render`) · Analysts: 3 lenses

## Scope

- **Slice:**
  - remotion (shared library): `MusicVideo.tsx`, `Thumbnail.tsx`, `Root.tsx`, `fonts.ts`, `types.ts`,
    `lib/thumbnail.ts`, `components/*`, `remotion.config.ts`, `webpack-override.ts`, README;
  - core: `FormatSchema` and `formats`, the style bible's renderer fields (roles, typography, motion) in
    `schema.ts`; `palette.ts`; `browser.ts`;
  - cli: `render.ts`, `render-progress.ts`, `short.ts`, `thumbnail.ts`, `thumbnail-files.ts`,
    `thumbnail-recipe.ts`, `media-dir.ts`; the render helpers of `media.ts`; QA's render checks in `qa.ts`; the
    Short helpers in `release-files.ts`; the `render`, `thumbnail`, `short`, `media-link` and `qa` commands;
  - workspace: the skills `assembly-render`, `video-qa` (`SKILL.md`, `thumbnails.md`) and `remotion-motion`.
- **Out of scope:**
  - the release package and folder, `release.md`, upload texts and data, the feed post's format: slice `release`;
  - the watch round and the board container: slice `publish`; `init`, `update`, `migrate-layout`, the runtime
    build: slice `workspace`;
  - the timing helpers in `packages/remotion/src/lib/timing.ts` and `hooks/useTiming.ts`: already adopted
    (timing); the storyboard's terms in `ShotRenderer.tsx` (G-73, G-75, G-77, G-80, G-83): already adopted
    (storyboard).
- **Intent:** domain model, as for the earlier slices. **Language:** artifacts `en`, UI `en`.
- **Since the last slice:** no code change. `slice.ts --cluster thumbnail` and `--cluster media` found the seeds;
  the scope was completed by hand from the commands and their callers.

| Layer | Files |
|---|---|
| remotion (shared library) | compositions, components, `lib/thumbnail.ts`, `types.ts`, `fonts.ts`, config |
| core (domain) | `FormatSchema`, style renderer fields in `schema.ts`; `palette.ts`; `browser.ts`; `assembly` and `qa-export` in `state.ts` |
| cli (application) | `render.ts`, `render-progress.ts`, `short.ts`, `thumbnail*.ts`, `media-dir.ts`, render helpers in `media.ts`, render checks in `qa.ts`, Short helpers in `release-files.ts` |
| workspace (orchestration) | `assembly-render`, `video-qa` (`SKILL.md`, `thumbnails.md`), `remotion-motion` |
| tests | `episode-render`, `thumbnail`, `thumbnail-render` (opt-in), `media-dir`, `brand-palette`, `lyric-display`, `board-watch`, Short parts of `release` |

## How this slice was decided

As in the earlier slices, there were no code-level questions. Every technical hotspot was decided by the
recommendation and is marked "not reviewed by the user – delegated". The user answered four questions about how
they work:
1. They upload the 16:9 video; 9:16 so far only as Shorts. They have not used 1:1 yet, because Instagram was not
   ready, but they want to serve every social channel from now on.
2. They take one of the three thumbnails as it is.
3. The agent picks the Shorts.
4. Their media live in a separate folder (`CORESLOPPER_MEDIA_DIR`).

How the answers shaped the model:
- Answer 1 makes every derivative format a real output. The skill texts that assume a 16:9 master or leave out
  4:5 become a medium gap (G-141).
- Answers 2 and 3 put the agent's judgement first: the composed image's readability stays with the art director,
  and a Short that shows an older video is a medium gap, because nobody looks (G-139).
- Answer 4 makes the canon missing from the media directory a medium gap (G-140).

ADR 0044 stays `Proposed`.

## What the repository is (facts)

- **One composition.** `MusicVideo` renders every format, sized by props through `calculateMetadata`.
  `Thumbnail` renders one frame in five formats. ADR 0007's "a composition per format" is stale.
- **Formats.** There are four ids: 16x9, 9x16, 1x1 and 4x5. The master id comes from `formats.master.aspect`. A
  derivative takes its own size but always the master's fps. The defaults are a 16:9 master with 9:16 and 1:1.
- **Render.** The output is `renders/[preview-]<format>[.en].mp4`.
  - A preview is half scale at crf 22; a whole render is crf 18.
  - It renders in 60 s segments that resume, under `.cache/render/`. ffmpeg joins them and muxes the song.
  - Concurrency is 2–4, or 1 with software GL for a 3D shot.
  - Assets must lie inside the workspace. Clips and footage are muted.
- **Render record.** A whole render writes `render:<file>:inputs` (props, song bytes, crf) and
  `render:<file>:sha256` into `state.json`. `release` renders a missing or stale format again. `--frames` without
  `--out` writes the whole render's file and records nothing.
- **Progress.** `review/progress/<file>.json` is written every 2 s. It is removed on success and kept with the
  error on failure. The board shows it; the watch reports failed, interrupted and ready renders.
- **Shorts.** `short` cuts `renders/9x16.mp4` with a re-encode: crf 18, fades of 0.15 s and 0.4 s. Over 60 s is
  refused; outside 30–50 s warns. It accepts any anchor. Nothing ties a Short to its source render.
- **Composed images.** The `thumbnail` command makes five formats with exact sizes and size limits: 1280x720,
  1080x1920, 1080x1440, 1080x1350, and the cover at 3000x3000 in RGB.
  - The hook has at most three lines of four words. The cover refuses a tag and link text.
  - Colours come from the style bible's roles, and the text colour is picked by WCAG contrast.
  - The JPEG quality steps down until the image fits. A recipe lies beside it.
  - `MIN_READABLE_SIZE` is unused.
- **QA.**
  - The master render is required (FAIL), and each derivative is checked (WARN).
  - It expects three 1280x720 thumbnails, and three Shorts with their 9x16 thumbnails.
  - Determinism is checked only with `--determinism`.
- **Media directory.** `CORESLOPPER_MEDIA_DIR`, where `{slug}` is the folder name. `createProject` and
  `media-link` turn `assets/` and `renders/` into links; `new-series` does not.
- **Architecture.**
  - The CLI imports Remotion's source by relative path. Remotion takes runtime values only from `core/browser`.
  - Remotion is pinned to 4.0.541 as a devDependency and installed with the workspace.
  - There are no locks.
  - Colour resolution, format lists and the record keys exist twice.
- **History.** 196 commits, low churn: segments and media dir `b133e35`, thumbnails `7027d42`, progress
  `e7c2599`. There are no reverts or TODOs.

## Domain model (decided by recommendation)

- **Context:** `BC-Render` – Render: a project's videos and images, and where they are kept.
- **Aggregates (all `as-is`):**
  - `AGG-Render`:
    - one composition for every format at the master's frame rate, derivatives never cropped;
    - the song the only sound;
    - a recorded render is its file;
    - current while props, song, asset files and code are unchanged;
    - a preview never recorded;
    - one render at a time.
  - `AGG-Short`:
    - cut from the 9:16 render, at most 60 s, 30–50 s expected;
    - on section boundaries;
    - from the current render;
    - three per video.
  - `AGG-ComposedImage`:
    - exact size and limit, an RGB cover;
    - hook and cover text limits;
    - style-bible colours;
    - same inputs, same pixels on one machine;
    - always a recipe;
    - readability judged by the art director.
- **Commands:** render a preview, a passage, a format and a still; cut a Short; compose an image; link a project's
  media; check determinism.
- **Policy:** a new project's media go to the media directory (`POL-LinkNewProjectMedia`).
- **Read models:** render progress, renders, render checks. **Flow:** `FLOW-Render`.
- **Glossary:**
  - New: **Master Format**, **Derivative Format**, **Render Record**, **Composed Image**, **Media Directory**.
  - Sharpened: **Render** (one whole format, never a crop), **Preview** (half scale, passage or frame; never
    recorded or released), **Thumbnail** (a composed image; the user picks one), **Short** (from the current 9:16
    render, picked by the agent), **Cover** (a composed image), **Thumbnail Recipe** (beside every composed image).
  - Removed: **Animatic** (no code or skill uses it).
- **ADR:** 0044 (Proposed), which amends 0007 and 0018.

## Package documentation written

- `.claude/rules/render.md` – path-scoped slice doc, including `packages/remotion/**`. It is the one mechanism for
  the shared library too, so there is no package `AGENTS.md`. Nothing is left `[OPEN]`.
- `docs/engineering/conventions.md`:
  - Remotion's import rule as practised;
  - how a render and a composed image run;
  - six seams (render props and formats, Short window, composed-image layout, recipe, media directory, the
    opt-in Remotion render).
- `docs/architecture/data-model.md`, `docs/domain/context-map.as-is.md` – the three aggregates, `BC-Render`, and
  the edges that pointed to "Render – not adopted".

## Contradictions found and how they were resolved

| Contradiction | Resolution |
|---|---|
| ADR 0007: a composition per format (16x9, 9x16, 1x1), versus one `MusicVideo` sized by props, plus 4x5 | one composition (ADR 0044) |
| ADR 0007: frame-hash tests prove determinism, versus a flag-only QA check and thumbnail-only CI hashes | per machine and version, checked every QA pass (G-144) |
| Glossary: a cover is not a thumbnail, versus the cover made by `thumbnail --format 1x1` | Composed Image for both; Thumbnail and Cover name what the image represents |
| ADR 0018, README, `types.ts`: one to three thumbnail sizes, versus five | five composed-image formats (G-141) |
| Glossary Preview "low-resolution or short", versus `--frames` writing the whole render's file | a passage is a preview with its own file (G-137) |
| Glossary and `video-qa`: Shorts on section boundaries, versus any anchor | `short` warns (G-142) |
| `release` re-renders stale formats, versus Shorts never cut again | a Short belongs to its 9:16 render (G-139) |
| Render record "everything that decides the pixels", versus no asset bytes or code | asset files and code count (G-138) |
| `assembly-render`: a 1920x1080 master and `--format 16x9`, versus the configurable master (same skill, Episodes) | text fix (G-141) |
| `assembly-render`: "forgetting to mute AI clips", versus always muted in code | text fix (G-141) |
| README: add to `MOTION_COMPONENTS`, versus `remotion-motion` naming only the switch | both (slice doc, G-141) |
| Conventions: Remotion imports only `core/browser`, versus type imports from core's main entry | type imports are erased and allowed (conventions) |
| `style.motion.easing` in the schema, versus no reader | dead (G-145) |
| `video-qa`: "the six thumbnails and the cover" | three for the video plus one per Short; no contradiction |

## Rules and checks

| Rule | Enforcement | State |
|---|---|---|
| Every format renders at the master's frame rate | `tests/render-characterization.test.ts`, `tests/episode-render.test.ts` | green |
| The props carry the resolved shots, effective timing and bibles, serializable, with relative font paths | `tests/render-characterization.test.ts` | green |
| The render record is two `state.json` artifacts; the inputs hash follows the props and the song's bytes | `tests/render-characterization.test.ts` | green |
| A composed image keeps its recipe beside it, defaults left out; a broken recipe reads as none | `tests/render-characterization.test.ts` | green |
| A composed image has its format's size and stays under the limit; only the cover must be RGB | `tests/render-characterization.test.ts` | green |
| Short windows, limits, fades and names; thumbnail text, layout and colours; the media directory; render names and safe areas | existing `tests/release.test.ts`, `thumbnail.test.ts`, `media-dir.test.ts`, `episode-render.test.ts` | green |
| Same inputs give the same thumbnail pixels | `tests/thumbnail-render.test.ts` (opt-in, `CORESLOPPER_RENDER_TESTS=1`) | green in CI |
| The slice stays inside the package import direction | slice 1 boundary rule and `tests/package-boundaries.test.ts` | green |
| Passages never over a render, a complete render record, Shorts tied to their render, the canon in the media directory, section boundaries, determinism every pass, one render at a time | documentation until stories build them (G-137–G-148) | – |

## Gap register (candidates – stories only with --stories)

13 candidates, G-137 to G-149, in `docs/domain/gap-register.md`:
- 8 *exist but contradict*. The highest are G-137 (a passage overwrites the recorded render, high), G-138 (the
  record misses assets and code) and G-141 (drifted skill texts), both medium.
- 4 are *missing*: G-139 (Shorts tied to their render) and G-140 (the canon in the media directory), both medium;
  G-146 (a render lock) and G-149 (tests), both low.
- 1 is *dead*: G-145 (`style.motion.easing`, `MIN_READABLE_SIZE`).

## Deliberately left alone

- Production code, the skills, and ADRs 0007 and 0018, which are accepted. ADR 0044 amends them. Only the glossary
  was corrected.
- The release folder, the feed post's format (1:1 by default, 4:5 optional), the announcement images and
  `release.md`: the release slice.
- The watch round's render events and the board container's media mount: the publish slice. `migrate-layout`
  following media links: the workspace slice.
- The storyboard's render gaps (G-73, G-75, G-77, G-80, G-83): already recorded by the storyboard slice.
- `resolveBinary` using `which` (POSIX only), and the example-font fallback: platform details, not domain.
- The Remotion licence (`docs/THIRD_PARTY.md`): unchanged.

## Open hotspots

None. HS-143 to HS-161 are resolved, four of them partly by the user's answers.

## Next slice

`release` per the adoption plan: the release package and folder, texts, images, microsite, QA, the calendar, the
board's release view and approval. It reads this slice's render records, Shorts and recipes.

## Decision log

| # | Decision | How | Written to |
|---|---|---|---|
| HS-148 | A Short belongs to the 9:16 render it was cut from; release cuts again or reports | user (the agent picks Shorts; every social channel from now on, 2026-11-22) and recommendation; medium | `AGG-Short`, ADR 0044, G-139 |
| HS-152 | Composed Image for every image of the command; readability by the art director | user (takes one thumbnail as it is) and recommendation | glossary, `AGG-ComposedImage`, G-145 |
| HS-154 | A series canon goes to the media directory too | user (media in a separate folder) and recommendation; medium | `CMD-LinkProjectMedia`, ADR 0044, G-140 |
| HS-160 | Drifted texts fixed together | user (every social format from now on) and recommendation; medium | G-141 |
| HS-143 | One context, Render | recommendation | `BC-Render` |
| HS-144 | Three as-is aggregates: render, Short, composed image | recommendation | the three aggregates |
| HS-145 | Master Format, Derivative Format, Render Record, Composed Image, Media Directory; Preview covers passages and frames | recommendation | glossary |
| HS-146 | A passage is a preview with its own file | recommendation; high | `AGG-Render`, `CMD-RenderPassage`, ADR 0044, G-137 |
| HS-147 | A render is current while props, song, asset files and code are unchanged; one check for release, QA and short | recommendation; medium | `AGG-Render`, glossary (Render Record), ADR 0044, G-138 |
| HS-149 | `short` warns off a section boundary | recommendation; low | `AGG-Short`, `CMD-CutShort`, G-142 |
| HS-150 | Every format at the master's frame rate; one closed list of format ids in core | recommendation; low | `CMD-RenderFormat`, G-143 |
| HS-151 | Determinism per machine and pinned version; QA checks it every pass | recommendation; low | `CMD-CheckDeterminism`, ADR 0044, G-144 |
| HS-153 | `style.motion.easing` removed until a component reads it | recommendation; low | G-145 |
| HS-155 | One render of a project at a time, by a lock | recommendation; low | `AGG-Render`, ADR 0044, G-146 |
| HS-156 | One source for colours, format ids, record keys and encoder settings | recommendation; low | conventions, G-147 |
| HS-157 | Stills named by format and frame; the thumbnail cache cleaned | recommendation; low | G-148 |
| HS-158 | The CLI reaches Remotion by relative path; Remotion's runtime imports from `core/browser` only | recommendation | conventions |
| HS-159 | Animatic removed from the glossary | recommendation | glossary |
| HS-161 | ADR 0044 | recommendation | `docs/adr/0044-render-records-and-composed-images.md` |

# Adoption – release
Date: 2026-11-22 · Commit: 5fdf981 · Slice: the release package and folder, upload data and texts, release QA, the release schedule and calendar, the board's release view, done marks, live URLs and the release approval (concept `release`) · Analysts: 3 lenses

## Scope

- **Slice:**
  - core: `release.ts`, `calendar.ts`; the release parts of `schema.ts` (release metadata, channel config, release
    schedule, calendar, upload data, release status, release manifest); `approvalHolds` in `autopilot.ts`;
  - cli: `release.ts`, `release-files.ts` (non-Short parts), `release-images.ts`, `release-media.ts`,
    `release-microsite.ts`, `release-texts.ts`, `release-qa.ts`, `upload-text.ts`, `release-calendar.ts`,
    `release-board.ts`, `release-board-data.ts`, `board/release.js`; the `upload-text`, `release`, `calendar`,
    `board` (release view) and `release-approve` commands; the release rows of `qa.ts`; `approveRelease` and
    `revokeApproval` as the approval's writers;
  - workspace: `release-backfill`, `video-qa/release.md`, the release steps of `/video-next`, `qa-checker`,
    `new-video` (release data only), the hook's release files.
- **Out of scope:**
  - the release autopilot's plan and runner, `publish`, `publish-auth`, `publish-setup`, `release-timer`, the
    watchdog and the post adapters: slice `publish`;
  - renders, Shorts, composed images and the media directory: already adopted (render);
  - `init`, `update`, `doctor`, `migrate-layout`: slice `workspace`.
- **Intent:** domain model, as for the earlier slices. **Language:** artifacts `en`, UI `en`.
- **Since the last slice:** no code change. `slice.ts --cluster release` found 20 seeds and 93 candidates; the
  scope was cut to the release folder, calendar, board and approval by hand, along the adoption plan.

| Layer | Files |
|---|---|
| core (domain) | `release.ts`, `calendar.ts`, release schemas in `schema.ts`, `approvalHolds` |
| cli (application) | `release*.ts` (without the autopilot and timer), `upload-text.ts`, `board/release.js`, release rows in `qa.ts`, `approveRelease`/`revokeApproval` |
| workspace (orchestration) | `release-backfill`, `video-qa/release.md`, `/video-next` after the pipeline, `qa-checker` |
| tests | `release-folder`, `release-calendar`, the upload-text parts of `release`, `helpers/release-fixture.ts`; new `release-characterization` |

## How this slice was decided

As in the earlier slices, there were no code-level questions. Every technical hotspot was decided by the
recommendation and is marked "not reviewed by the user – delegated". The user answered four questions about how
they work:
1. They release from the release board and post by hand: they upload, tick off and enter the live URLs.
2. They take the platform texts as the agent wrote them.
3. They take the release day the calendar proposes.
4. Of the release's parts they use the distributor and the microsite; not the Spotify extras (canvas, lyrics
   files, pitch) and not the announcement.

How the answers shaped the model:
- Answers 1 and 3 together show the worst gap: a proposed day is fixed only by the approval, which a user who posts
  by hand never gives. The day stays a TODO, also at the distributor step, and a replan can move it (G-150, high).
- Answer 1 makes the board the place that must not lose anything: the background refresh after a live URL that can
  delete the video from the folder is high (G-151). The board hiding a broken `upload.yaml` is medium (G-153).
- Answer 2 means a broken limit goes straight to the platform: QA and `release` checking different things is
  medium (G-152).
- Answer 4 raises the microsite data's missing schema to medium (G-155) and keeps the gaps of the canvas, lyrics,
  pitch and announcement low.

ADR 0045 stays `Proposed`.

## What the repository is (facts)

- **Three records.**
  - The release folder `renders/release/` with `manifest.json` is written only by `buildRelease`.
  - `review/calendar.yaml` is planned only by `buildCalendar`.
  - `review/release-status.json` (done marks, live URLs, the approval) is written only under
    `review/.release.lock`.
  - The agent writes `review/upload.yaml`, and no code writes it.
- **Release package.**
  - Formats are placed by hardlink or copy, and a stale one is rendered first. Subtitles, three thumbnails and
    the Shorts follow.
  - For a music video: the WAV (converted once when it cannot be delivered), the cover, the canvas (a silent
    3–8 s loop without lyrics on screen), `lyrics.txt` and LRC.
  - Then the calendar, the dated announcement, story and feed images from the cover's recipe, `calendar.ics`,
    the microsite data, `texts/`, the README with the TODOs, and the manifest last.
  - The run is idempotent. It removes only files an earlier run wrote. It throws after writing when a limit or
    the chapters are broken.
- **Facts and limits.**
  - Missing release facts are TODOs. Channel release defaults fill gaps, and the project wins.
  - The limits are a code table that `channel.yaml` can override per key.
  - X counts each link as 23 characters. LinkedIn shows 210 characters before "see more".
  - The Instagram and TikTok captions must differ.
- **Calendar.**
  - The user's day wins and is not checked.
  - Otherwise the calendar picks the first release weekday at least 21 days ahead, a week from every other
    release, never on a skip day. It keeps that day while no other release holds it.
  - Moved times are kept while the day stays.
  - One Short per slot day across all projects, one per song a week, the first on the release day.
  - Times carry the schedule's or the computer's zone.
- **Board.**
  - It is a loopback page that writes only from its own origin.
  - The user ticks off posts and checklist lines (keyed by position) and enters live URLs, which start a
    background refresh without renders and stills.
  - The user approves or withdraws. There is no date or time change on the board.
- **Approval.**
  - It is `{at, release_date}`. It holds while the day equals the calendar's.
  - Approving a proposed day writes `release.release_date` into `project.yaml` first.
  - The blockers are checked only by the button. The production view counts any approval.
- **QA.**
  - Ten release rows. FAIL for changed files, stale formats, bad media, broken limits and unmarked `<ID>`, TODO
    for user gaps.
  - The upload checks use WARN.
  - QA does not check chapters, the description's bytes or `linkedin.md`.
- **Architecture.**
  - Core holds pure rules; the CLI holds all files.
  - The release context and the folder layout exist twice or three times.
  - There is no lock around the folder or the calendar, and `buildRelease` finds the workspace from the working
    directory.
  - German labels and jurisdiction notes are hard-coded.
- **History.** 23 commits from 2026-11-13 to 2026-11-21. The hotspots are `release-folder.test.ts` (13),
  `release-board.ts` (9) and `release-board-data.ts` (8). There are no reverts. Five fixes; the largest (`e44dde1`)
  made writes come only from the board's own page and tied the approval to the day.

## Domain model (decided by recommendation)

- **Context:** `BC-Release` – Release.
- **Aggregates (all `as-is`):**
  - `AGG-ReleasePackage`:
    - every written file in the manifest, only own files removed;
    - each format the current render;
    - a file never removed because it could not be refreshed;
    - facts never invented;
    - a TODO never fails;
    - idempotent;
    - one set of checks for `release` and QA.
  - `AGG-ReleaseCalendar`:
    - the user's day wins;
    - a proposed day stays until the user moves it, fixed without the approval;
    - a colliding user day is reported;
    - one Short per slot day;
    - moved times kept while the day stays;
    - steps off skip days;
    - stable event ids.
  - `AGG-ReleaseStatus`:
    - items keyed by event or a named checklist line;
    - done marks with who and when;
    - http(s) live URLs;
    - done marks survive;
    - the approval holds for one day, through `approvalHolds` everywhere;
    - it covers the day, not the content;
    - its blockers checked everywhere;
    - every write under the release lock.
- **Commands:**
  - write the upload data;
  - build the release package;
  - render the upload text;
  - plan the release calendar;
  - mark a calendar event done;
  - record a live URL;
  - approve a release;
  - withdraw the approval;
  - check the release package.
- **Policy:** the release folder follows a live URL and an approval (`POL-RefreshAfterStatusChange`).
- **Read models:** release board, workspace release calendar, release checks, upload text, microsite song.
- **Flow:** `FLOW-Release`. **External systems:** artist microsite, distributor.
- **Glossary:**
  - New: **Release Manifest**, **Calendar Event**, **Proposed Release Day**, **Release Status**, **Done Mark**,
    **Live URL**.
  - Sharpened:
    - **Upload Text**: the main video and the Shorts; "upload package" is avoided.
    - **Release Folder**: no file lost on a refresh.
    - **Release Calendar**: a new day plans again.
    - **Release Approval**: one day, not the content; withdrawing keeps the done marks.
    - **Announcement**: a full release composes it.
    - **Microsite**: its data.
    - **TODO**: a proposed release day; never a warning in QA.
- **ADR:** 0045 (Proposed), which amends 0019, 0024, 0028 and 0029.

## Package documentation written

- `.claude/rules/release.md` – the path-scoped slice doc. Nothing is left `[OPEN]`.
- `docs/engineering/conventions.md`:
  - how a release run works;
  - the release lock and the board's write guard;
  - the `project.yaml` exception;
  - time zones in the calendar;
  - the release labels;
  - four seams (release package, release rule, release calendar, release board).
- `docs/architecture/data-model.md` – the three aggregates, the approval's lifecycle and the release entities in the
  overview.
- `docs/domain/context-map.as-is.md` – `BC-Release` and its edges to Pipeline, Render, Timing, publish (not adopted),
  the microsite and the distributor.

## Contradictions found and how they were resolved

| Contradiction | Resolution |
|---|---|
| ADR 0028: without `release_date` the day is a proposal, versus a user who never approves and so never fixes it | the user fixes it without approving (ADR 0045, G-150) |
| Board refresh "texts and microsite data, no renders", versus the clean-up deleting skipped videos and images | a refresh never removes a file (G-151) |
| ADR 0028: the live URL goes into the X and LinkedIn texts, versus only the board fields getting it | every text, folder and board (G-154) |
| ADR 0028: times in the calendar are kept, versus kept only while the day stays | a new day plans again; the ADR's wording is stale (G-157) |
| ADR 0028: never colliding with another project, versus a user day never checked | the user's day wins and a collision is reported (G-160) |
| ADR 0019: a missing package is a WARN; `qa` WARN for upload checks, versus TODO in the release checks and the glossary | TODO for user gaps, WARN for advice (G-152) |
| `release` fails on chapters and description bytes, versus QA never checking them; QA's comment on `linkedin.md` versus its list | one set of checks (G-152) |
| `approvalHolds` (day must match), versus the production view's `Boolean(approval)` | `approvalHolds` everywhere (G-159) |
| Board disables Approve on blockers, versus the API and CLI approving anyway | blockers everywhere (G-158) |
| Conventions: a tool never replaces `project.yaml`, versus the approval writing `release.release_date` | a recorded exception (HS-177, conventions) |
| Glossary Upload Text "the YouTube part", versus `upload.md` covering the Shorts too, titled "Upload package" | glossary fixed; "upload package" avoided |
| Glossary Announcement "`release` composes again whenever the date moves", versus the refresh dropping the images | a full release composes them; glossary fixed |
| `docs/architecture.md`: the board's only write is the status, versus approval, wizard, library, review | text fix (G-157) |
| `/video-next` after the pipeline points to `publish --dry-run`, versus the board as the user's way to release | `/video-next` points to the board (G-157) |
| `video-qa/release.md`: the calendar planned first, a `✖` line per broken limit | text fix (G-157) |
| Upstream stays generic, versus German jurisdiction notes, a de/en switch, Berlin examples and tests | English built in, the rest as data (G-156) |

## Rules and checks

| Rule | Enforcement | State |
|---|---|---|
| A proposed day is kept while no other release holds it; a new day plans every event again, the same day keeps moved times | `tests/release-characterization.test.ts` | green |
| An approval holds for its release day only | `tests/release-characterization.test.ts` | green |
| X counts links as 23 and the reply's link as 24; LinkedIn's first paragraph at most 210, its media main or a Short | `tests/release-characterization.test.ts` | green |
| Chapters start at 0:00, number at least three, last at least 10 s | `tests/release-characterization.test.ts` | green |
| The documented folder, idempotence, own-file clean-up, TODOs never failing, broken limits as errors, release QA, the board's status and write guard, the calendar's planning rules | existing `tests/release-folder.test.ts`, `release-calendar.test.ts`, `release.test.ts`, `release-autopilot.test.ts` | green |
| The slice stays inside the package import direction | slice 1 boundary rule and `tests/package-boundaries.test.ts` | green |
| A fixed day without approval, no file lost on refresh, one set of checks, the live URL in the files, the microsite schema, locks, the approval's blockers and staleness everywhere, named checklist keys, English built in | documentation until stories build them (G-150–G-166) | – |

## Gap register (candidates – stories only with --stories)

17 candidates, G-150 to G-166, in `docs/domain/gap-register.md`:
- 9 *exist but contradict*. The highest is G-151 (a refresh deletes files, high). Then G-152 (checks differ),
  G-153 (a broken `upload.yaml` hidden), G-154 (the live URL missing from the files), G-156 (locale upstream) and
  G-157 (drifted texts), all medium.
- 7 are *missing*. The highest are G-150 (the day fixed without the approval, high) and G-155 (the microsite
  schema, medium); G-160, G-161, G-164 and G-166 are low.
- 1 is *dead*: G-165 (the LinkedIn skip branch).

## Deliberately left alone

- Production code, the skills, and ADRs 0019, 0024, 0028 and 0029, which are accepted. ADR 0045 amends them. Only
  the glossary was corrected.
- The release autopilot's plan, states and runner, `publish`, the timer, the watchdog and the post adapters: the
  publish slice. That includes the second microsite copy the autopilot writes and the `due` state the plan never
  returns.
- The board server's routes for the wizard, the library and review rounds, which share `release-board.ts`: already
  adopted slices.
- The episode subtitles in English only: decided in the series slice.
- Over-exported helpers (`PLACEHOLDER`, `CHAPTER_RULES`, `daysBetween`, …): not dead, only exported.
- `vitest.config.ts` pinning `TZ: 'Europe/Berlin'`: noted in slice 1, now part of G-156.

## Open hotspots

None. HS-162 to HS-182 are resolved, eight of them partly by the user's answers.

## Next slice

`publish` per the adoption plan: publish and the post adapters, auth, the release autopilot's plan and runner, the
timer and the watchdog. It reads this slice's release folder, upload data, calendar and approval, and writes done
marks and live URLs into the release status.

## Decision log

| # | Decision | How | Written to |
|---|---|---|---|
| HS-165 | The user fixes a proposed release day without approving; a replan keeps it | user (posts by hand, takes the proposed day, 2026-11-22) and recommendation; high | `AGG-ReleaseCalendar`, `CMD-PlanReleaseCalendar`, ADR 0045, G-150 |
| HS-167 | A refresh never removes a file it could not refresh | user (releases from the board) and recommendation; high | `AGG-ReleasePackage`, `POL-RefreshAfterStatusChange`, ADR 0045, G-151 |
| HS-172 | One set of checks for `release` and QA; TODO for user gaps | user (takes the texts as they are) and recommendation; medium | `AGG-ReleasePackage`, `CMD-CheckRelease`, ADR 0045, G-152 |
| HS-173 | The board shows a broken `upload.yaml` | user (copies from the board) and recommendation; medium | `RM-ReleaseBoard`, G-153 |
| HS-166 | The live URL in every text, folder and board | user (copies from the board) and recommendation; medium | `CMD-BuildReleasePackage`, ADR 0045, G-154 |
| HS-178 | The microsite data is a published language with a schema | user (uses the microsite) and recommendation; medium | `RM-MicrositeSong`, ADR 0045, G-155 |
| HS-180 | Drifted texts fixed together; `/video-next` points to the board | user (releases from the board) and recommendation; medium | G-157 |
| HS-181 | Hashtag sets stay a skill rule; an episode gets the release-day TODO; Spotify extras and the announcement rank low | user (uses the distributor and the microsite) and recommendation; low | `CMD-WriteUploadData`, G-164 |
| HS-162 | One context, Release; the autopilot that acts on the approval is publish's | recommendation | `BC-Release` |
| HS-163 | Three as-is aggregates: release package, calendar, status | recommendation | the three aggregates |
| HS-164 | Calendar Event, Proposed Release Day, Done Mark, Live URL, Release Status, Release Manifest; "post", "task" UI only | recommendation | glossary |
| HS-168 | The approval covers the day, not the content; its blockers checked everywhere | recommendation; low | `AGG-ReleaseStatus`, `CMD-ApproveRelease`, ADR 0045, G-158 |
| HS-169 | `approvalHolds` everywhere | recommendation; low | `AGG-ReleaseStatus`, G-159 |
| HS-170 | The user's day wins; a collision is reported | recommendation; low | `AGG-ReleaseCalendar`, ADR 0045, G-160 |
| HS-171 | A new day plans again; done marks stay; a full release composes the dated images | recommendation | the aggregates, glossary, G-157 |
| HS-174 | The package and the calendar under the release lock; the approval in one step | recommendation; low | ADR 0045 (not named), G-161 |
| HS-175 | One release context, one folder layout, one set of counting rules, the root passed in | recommendation; low | `CMD-BuildReleasePackage`, conventions, G-162 |
| HS-176 | English built in; other languages and jurisdiction notes as data | recommendation; medium | conventions, ADR 0045, G-156 |
| HS-177 | Fixing the release day is the one write into `project.yaml` | recommendation | conventions, `CMD-ApproveRelease` |
| HS-179 | Checklist lines keyed by name; every done mark says who | recommendation; low | `AGG-ReleaseStatus`, G-163 |
| HS-182 | ADR 0045 | recommendation | `docs/adr/0045-release-records-and-fixed-release-day.md` |
