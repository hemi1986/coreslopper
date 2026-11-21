# Gap register

> Generated rows come from `docs/domain/events.yaml`; decisions and manual gaps live outside the managed block.
> As-is map: [context-map.as-is.md](context-map.as-is.md) · Target map: [context-map.md](context-map.md).

<!-- kataster:gap-register:begin -->
<!-- Generated from docs/domain/events.yaml by gap-register.ts. Do not edit inside this block. -->
| Gap | Kind | Aggregate | As-is | Target | Evidence | Next step |
|---|---|---|---|---|---|---|
| GAP-AGG-Project | as-is boundary | [AGG-Project](events.yaml) | [BC-Pipeline](context-map.as-is.md#bc-pipeline--pipeline) | – | state.json per project, loaded and saved as one document (packages/core/src/project.ts:171-184,233-236)<br>stage transitions mutate one State (packages/core/src/state.ts:250-324)<br>budget ledger inside the same State (packages/core/src/state.ts:326-341) | Decide the target boundary |
| GAP-AGG-ProjectReview | as-is boundary | [AGG-ProjectReview](events.yaml) | [BC-Review](context-map.as-is.md#bc-review--review) | – | one lock per project review folder, review/.notes.lock, around every note change and every send (packages/cli/src/board-review.ts:38,202,238)<br>round numbers from all rounds of the project (packages/core/src/review.ts:37; board-review.ts:242)<br>notes per render in review/notes/<video-stem>.json, rounds in review/rounds/<NNN>.json (board-review.ts:50,62-78) | Decide the target boundary |
<!-- kataster:gap-register:end -->

## Gaps found by the adoption of the project and stage pipeline (2026-11-21)

Candidates only – no stories until the user asks (`/adopt <scope> --stories`). Priority is a suggestion.

| # | Class | Gap | Evidence | Source | Priority |
|---|---|---|---|---|---|
| G-1 | Exists but contradicts | `state.json` has no write lock; a long `generate` batch saves the state it loaded at its start and can overwrite a parallel `stage-*`, `spend`, wizard, or `render` write, losing recorded spend | `packages/cli/src/generate.ts:255,758-759`; `packages/core/src/project.ts:171-184` | HS-15 | high |
| G-2 | Exists but contradicts | No stage transition is guarded (start, complete, fail, skip from any status; interactive stages startable) | `packages/core/src/state.ts:250-324` | HS-11 | high |
| G-3 | Exists but contradicts | A stage reset accepts a running stage and leaves later done stages done, so a project can count as done with stale assets and renders | `packages/core/src/state.ts:310-324` | HS-12 | high |
| G-4 | Exists but contradicts | Seven stage skills call `stage-done` themselves, partly with other outputs (`preview-16x9.mp4` vs `preview-{master}.mp4`) | `workspace/.claude/skills/{audio-analysis,storyboard,assembly-render,video-qa,episode-track,style-bible,character-bible}/SKILL.md` | HS-7 | medium |
| G-5 | Exists but contradicts | All stages done without a release folder: next action says `/video-next` (qa-export), which stops as done | `packages/core/src/production.ts:105`; `workspace/.claude/commands/video-next.md` step 5 | HS-13 | medium |
| G-6 | Exists but contradicts | `/video-next` answers review rounds before it checks for an open interactive stage | `video-next.md` steps 4 and 6 | HS-14 | low |
| G-7 | Exists but contradicts | Hard stop lists diverge (`workspace/AGENTS.md` 3, `docs/pipeline.md` and `docs/architecture.md` 4, `video-next.md` adds two) | listed files | HS-4 | low |
| G-8 | Exists but contradicts | `workspace/AGENTS.md` and `docs/architecture.md` claim input hashes make the pipeline resumable; nothing passes or compares them | `packages/cli/src/index.ts:779`; `workspace/AGENTS.md` "Resumable and thrifty" | HS-10 | low |
| G-9 | Exists but contradicts | Next action and board ignore `review_mode: final`; only `/video-next` stops | `packages/core/src/production.ts:98`; `video-next.md` step 6 | HS-8 | low |
| G-10 | Exists but contradicts | The next-action reason is `retry`; the glossary word is resume | `packages/core/src/production.ts:28` | HS-2 | low |
| G-11 | Exists but contradicts | The phase value `setup` beside the stage ID `setup` | `packages/core/src/production.ts:11` | HS-1 | low |
| G-12 | Exists but contradicts | ADR 0016 still names `series/<slug>/` and says `/video-next` reads the stage list from `status`, while `video-next.md` hard-codes both lists | `docs/adr/0016-episode-projects.md:33`; `video-next.md` stage loop step 1 | – | low |
| G-13 | Missing | No command changes a project's budget; raising it means editing `project.yaml` and `state.json` by hand | `packages/cli/src/validate-file.ts:164-170` | HS-5 | medium |
| G-14 | Missing | The clock cannot be injected into core's transitions | `packages/core/src/state.ts` (`new Date()`) | conventions | low |
| G-15 | Dead | `budget.reservedUsd` – never set, still subtracted and shown as "reserved" | `packages/core/src/state.ts:199,327`; `packages/cli/src/board/production.js:241` | HS-9 | low |
| G-16 | Dead | `StageDefinition.mechanical` and `stageOutputs` have no reader in the packages | `packages/core/src/state.ts:9,158` | – | low |

## Gaps found by the adoption of human review (2026-11-21)

| # | Class | Gap | Evidence | Source | Priority |
|---|---|---|---|---|---|
| G-17 | Exists but contradicts | The desktop player takes no lock and rewrites the whole notes file from memory: a board note or a round mark written while it is open is lost, and the note can be sent twice | `scripts/review-player/review_notes.py:33-37,72-76` | HS-16 | high |
| G-18 | Exists but contradicts | The desktop player deletes sent notes (`remove_last`) | `scripts/review-player/review_notes.py:52-59` | HS-16 | high |
| G-19 | Exists but contradicts | Any replies file answers a round, also an incomplete one; completeness is checked only by the hook after the write | `packages/core/src/review.ts:42-45`; `validate-file.ts:219-232` | HS-18 | medium |
| G-20 | Exists but contradicts | An unreadable round file makes the board count nothing open, while `status` fails | `packages/cli/src/board-review.ts:84-88,273` | HS-18 | medium |
| G-21 | Exists but contradicts | Sending writes the round file and the note marks separately; a crash between them sends the same notes again | `packages/cli/src/board-review.ts:264-266` | Q8 | medium |
| G-22 | Exists but contradicts | The agent may write notes and round files; only an instruction forbids it, the hook checks replies only | `workspace/.claude/hooks/validate-artifacts.mjs:13-30,84-85` | HS-25 | medium |
| G-23 | Exists but contradicts | The desktop player computes frames with `round(t × fps)` and the container fps; the board with `floor` and the format fps | `scripts/review-player/review_player.py:44,66`; `packages/core/src/review.ts:16` | HS-16 | low |
| G-24 | Exists but contradicts | `assembly-render` takes desktop notes "asked for in chat"; the board sends them in the next round | `workspace/.claude/skills/assembly-render/SKILL.md` "Review rounds" | HS-17 | low |
| G-25 | Exists but contradicts | ADR 0032 resets `qa-export` after every round; the rule is: only when the fix pass changed a render | `docs/adr/0032-web-review-rounds.md` Decision | HS-20 | low |
| G-26 | Exists but contradicts | Docs say open rounds come "before any stage"; a running and an open interactive stage come first | `docs/pipeline.md` "Review notes and rounds", `docs/board.md` "Review", ADR 0032, test title in `tests/board-review.test.ts:50` | slice 1 HS-14 | low |
| G-27 | Exists but contradicts | The code says submit (`submitRound`, `/submit`, `submitted_at`); the domain verb is send | `packages/cli/src/board-review.ts:234`; `schema.ts:1383` | HS-21 | low |
| G-28 | Exists but contradicts | The art director's verdicts use "review" words (queue state `reviewing`, "Art-director reviews", `assets/review/`) | `packages/cli/src/board/production.js:12-13,46-47` | HS-22 | low – art-director slice |
| G-29 | Missing | A round does not record the version of its render; a re-render under the same name moves notes silently | `packages/cli/src/board-review.ts:40-50` | HS-26 | medium |
| G-30 | Missing | Review mode `final`: no documented release of the stop; every `/video-next` stops again before `qa-export` | `workspace/.claude/commands/video-next.md` step 6 | HS-27 | medium |
| G-31 | Missing | The review view does not reload while a fix pass runs; replies appear after a manual reload (inferred from the code, not reproduced) | `packages/cli/src/board/app.js:82-86` | analyst | low |

Decisions for human review:

- GAP-AGG-ProjectReview: the boundary stays as recovered (`as-is`).
- Exists and is intended: rounds numbered once per project; open rounds oldest first; a note on a cut belongs
  to both shots; a range note's section is the one at its start; Shorts are reviewed through their 9:16 render;
  board writes limited to the board's own origin; the board writes review files (ADR 0032 covers it).

## Decisions

- GAP-AGG-Project: the boundary stays as recovered (`as-is`); no target boundary was decided in this adoption.
- Exists and is intended (no action): kind-specific stage lists in code (ADR 0016); interactive stages run by
  the setup skill; budget check before a batch and on every recorded spend; the append-only error history
  (`state.errors`); the read-only production view and watchdog (ADR 0030, 0031); the import direction between
  packages (now checked).
