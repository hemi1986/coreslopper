# Architecture review – 2026-11-25

Status: in progress · 01 (`4bf6985`), 03 (`119f693`) and 04 (`fbc42d0`) implemented, awaiting review · Source: `/improve-codebase-architecture`, hot spots of the last 250 commits.
Visual report: [architecture-review-2026-11-25.html](architecture-review-2026-11-25.html) (open in a browser; needs internet for Tailwind and Mermaid).
Scope: release and publishing, the board, the libraries, generation, the workspace payload.

Candidate 01 now has ADR 0055 (proposed) and code; candidate 03 has code and `tests/release-records.test.ts`; candidate 04 has `release-facts.ts` and `tests/release-facts.test.ts`; the other five are proposals without a story.
This file is the handoff between sessions. Keep it short and update the status table.

## Working rules (context discipline)

- **One candidate per session.** Read this file, then only that candidate's read set and tests.
- Do not load the other candidates or the HTML report into an agent session; the HTML is for humans.
- Use an `explore` subagent for broad reading; keep the main context for decisions and edits.
- Before code: grill the candidate (the `grilling` skill). If it changes a bounded context, update
  `docs/domain/context-map.md`; if it is hard to reverse, write an ADR.
- After a session: update `Status` with the commit/PR and one line of what changed.
- A rejected candidate keeps its row with the reason.

## Candidates

| # | Candidate | Strength | Status | Read set |
|---|---|---|---|---|
| 01 | Give the release one plan | Strong | done – `buildReleasePlan` in core, persisted as `manifest.plan`; folder, QA, board, autopilot and publish read it; ADR 0055 (proposed); commit 4bf6985 | `release.ts` (cli, core), `release-texts.ts`, `release-qa.ts`, `release-board-data.ts`, `publish.ts`, `release-autopilot.ts` |
| 02 | Collapse the two library lifecycles | Strong | open | `library-entry.ts`, `character-library.ts`, `set-library.ts`, `board/characters.js`, `board/sets.js`, `release-board.ts` |
| 03 | Give the release records one owner | Strong | done – `release-records.ts` owns status, the autopilot and publish logs and the lock; the board and production view share `approvalHolds`; checklist keys are by line; `tests/release-records.test.ts`; commit 119f693 | `release-calendar.ts`, `release-autopilot.ts`, `autopilot-state.ts`, `publish.ts`, `board-production.ts`, `board/release.js` |
| 04 | Lift release facts out of the board view | Strong | done – `release-facts.ts` owns `loadReleaseFacts`, `releasePlan` and `releaseProjectDirs`; the board and the autopilot build on them; one facts load per project per round; commit fbc42d0 | `release-autopilot.ts`, `release-board-data.ts`, `release-board.ts`, `publish.ts`, `board/app.js` |
| 05 | Make the uncommitted series budget one rule | Strong | open | `series.ts`, `new-project.ts`, `generate.ts`, `core/cost.ts`, `core/state.ts`, `board-wizard.ts` |
| 06 | Close the generation ledger's side doors | Strong | open | `index.ts` (`estimate`, `spend`), `generate.ts`, `core/state.ts`, `qa.ts` |
| 07 | Put never twice behind one seam | Worth exploring | open | `providers/http.ts`, `providers/publish/http.ts`, the five publish adapters, `release-autopilot.ts` |
| 08 | Let each board view own its routes | Worth exploring | open | `release-board.ts`, `board/release.js`, `board/app.js`, the wizard and library routes |

All paths are from the repository root. Tests are under `tests/`; the release fixture is
`tests/helpers/release-fixture.ts`.

## 01 – Give the release one plan

**Problem.** No module states what one post of one release contains; five consumers rebuild files, text and
limits from raw upload data, and the TikTok Short caption already differs between the folder and the uploader.

**Solution.** One release plan turns project + upload data + channel into each post's files, exact text and
limits; the folder writer, QA, board, autopilot and uploader read it; the manifest and board fields become
projections.

**Evidence.**
- TikTok Short: `release-texts.ts:654-656` builds caption + overlay + hashtags; `publish.ts:147-164` sets
  `caption` only for a meme, so `providers/src/publish/tiktok.ts:60-71` sends title + hashtags. The two tests
  pin the mismatch: `tests/release-folder.test.ts:238-254` and `tests/publish.test.ts:668-671`.
- Caption assembly is written 15 times across four modules; hashtag counting has three implementations;
  limits live in four tables (`core/src/schema.ts:1251-1263`, `publish.ts:47-56`, the adapters).
- QA's text list (`release-qa.ts:37-40`) misses the conditionally written `linkedin.md`
  (`release-texts.ts:913-933`).

**Test seam.** `buildReleasePlan` over `tests/helpers/release-fixture.ts`; one test that the folder text, the
board field, the QA verdict and the mock publisher's text are the same plan.

**Done when.** A TikTok Short's caption is identical in folder, board, QA and publisher; limits come from one
place; no consumer re-derives text.

**Alignment.** ADR 0019 and ADR 0024 (release package split); no conflict.

## 02 – Collapse the two library lifecycles

**Problem.** Characters and sets are one Library context in ADR 0052 but two full lifecycles in code: parallel
functions, two board views, three route blocks and three test suites pin the copies.

**Solution.** Grow `library-entry.ts` into the one lifecycle for characters and sets, with the entry file, file
roles, target key and words as data inside it; the sound library stays its own context (ADR 0051).

**Evidence.**
- Parallel pairs: `libraryUses` / `setLibraryUses`, `listLibrary` / `listLibrarySets`, `matchEntry` /
  `matchSetEntry`, `importCharacters` / `importSets`, `useCharacter` / `useSet`.
- `library-entry.ts` is 226 lines with 21 exports; `character-library.ts` is 480 lines, `set-library.ts` 689.
  The board views share 146 identical lines; the three route blocks are 69, 71 and 64 lines.
- Seam leak: both library modules import `projectDirs` / `seriesDirs` from the board's production read model;
  the sets route resolves its target through `character-library.libraryTarget`.

**Test seam.** One lifecycle suite over a kind fixture (entry file, file roles, target array) covering add,
update, add-file, import, use and remove; one route suite over the board request handler for both kinds.

**Done when.** A new kind is data, not a second implementation; the library views stop importing each other;
the sound library keeps its own suite.

**Alignment.** ADR 0052; no conflict.

## 03 – Give the release records one owner

**Problem.** The release status, autopilot log, publish log and lock are written through four modules with two
approval rules, so a stale approval can read as released and checklist ticks move when a row appears.

**Solution.** One release-records module owns the status, the logs and the lock; approval, take-over, done
rows and checklist keys are entries it names; calendar planning stays a pure core rule and becomes a client.

**Evidence.**
- Two approval rules: `approvalHolds` (`core/src/autopilot.ts:143-146`) and `Boolean(status?.approval)`
  (`board-production.ts:281`), which is G-159.
- `updateStatus` parses before writing (`release-calendar.ts:130-154`); `writeStatus` writes the mutated object
  unparsed (`release-autopilot.ts:56-63`).
- Checklist keys are position-based, `${event.id}#${index}` (`board/release.js:173`), which is G-163.
- `withReleaseLock` is used by four modules; `publish.ts:446` re-derives the project root from the log path.

**Test seam.** A release-records test on a temp project: approve a proposed day, move the day, tick rows;
assert that `boardProject` and `productionProject` read the approval through the same function.

**Done when.** One write path per record; one approval rule; a moved release day makes the approval stale.

**Alignment.** ADR 0046 (proposed); the code is behind the decision.

## 04 – Lift release facts out of the board view

**Problem.** The posting runner builds the board's whole view to learn a few facts, imports the board's shell
module, and reloads an approved project five times per round even when nothing is due.

**Solution.** One release-facts module owns project, identity, upload data, manifest files, calendar, status,
settings and workspace root; the board view and the runner both build on it; project discovery leaves the
board shell.

**Evidence.**
- Import cycle: `release-autopilot.ts:40` imports `boardProjectDirs` from `release-board.ts:82-90`;
  `release-board.ts:8,623` imports the board view and the runner.
- `runProject` loads the full release context five times (`release-autopilot.ts:238-311`).
- `projectReleaseContext` receives the workspace root but does not return it (`release-board-data.ts:398-437`);
  the runner re-derives it as `../..` (`release-autopilot.ts:537-539`), and `publish` derives it again.
- `song.json` has three readers: `release.ts:202-209`, `release-qa.ts:44-50`, `board-production.ts:282`.

**Test seam.** `loadReleaseFacts(projectDir, root)` on a temp workspace, plus a runner test that counts loads
(five to one) and injects the loader; the board view test asserts it builds its posts from the same facts.

**Done when.** The runner has no import into the board shell; runner tests do not go through `boardProject`;
the root is passed, not re-derived.

## 05 – Make the uncommitted series budget one rule

**Problem.** Uncommitted Series Budget is series total minus canon spend minus episode budgets in the wizard
and board, but a canon batch checks only the series state's remaining budget, which ignores committed episodes.

**Solution.** Move the uncommitted-series-budget rule into the core budget rule; episode creation and every
canon batch check the same amount.

**Evidence.**
- `seriesBudget` subtracts `episodeBudgetsUsd` (`series.ts:60-74`); `remainingBudget(series.state)` subtracts
  only spend and reserved (`core/src/cost.ts:26`), and `runBatch` uses it (`generate.ts:710-714`); G-105.
- The board wizard and series status show the richer amount (`board-wizard.ts:529`, `board/production.js:289`).

**Test seam.** A pure budget table, plus one integration test in `tests/series-budget.test.ts` that creates a
series with committed episode budgets and asserts a canon batch above the uncommitted amount is refused before
any provider exists.

**Done when.** One meaning of remaining; canon cannot spend money already committed to episodes.

## 06 – Close the generation ledger's side doors

**Problem.** `runBatch` carries the invariant that manifest cost equals recorded spend, but `estimate`
re-derives the price and `spend` raises spend without a manifest line, so the invariant holds only if callers
avoid two commands.

**Solution.** Quote through the generation module's existing price resolution; make manual spend a
manifest-backed ledger write through it, or remove the command.

**Evidence.**
- `estimate` repeats role lookup, provider choice, overrides and unit cost (`index.ts:1090-1128`); it checks
  only the batch cap, never the remaining budget; G-89.
- `spend` calls `recordSpend` directly (`index.ts:1072-1081`, `core/src/state.ts:371-382`); QA fails when the
  manifest total differs from spend (`qa.ts:230-262`); G-88.
- No skill uses `spend`; `estimate` is used widely, so its human output must stay.

**Test seam.** The inline `BatchTarget` fixture in `tests/generation-characterization.test.ts` for a dry-run
quote and the manifest/spend invariant; one test for the manual ledger path if kept.

**Done when.** One price rule; the ledger invariant is always true; `estimate` sees the remaining budget.

## 07 – Put never twice behind one seam

**Problem.** The rule that a public post is never sent twice is decided at each call site: two retry stacks,
three definitions of "may have gone out", and a poll loop per adapter (twice in TikTok).

**Solution.** One failure-classification seam (fatal, retryable, uncertain) and one poll-until-terminal helper;
adapters say when the last byte left; the runner, `publish` and the pinned-comment step share the class.

**Evidence.**
- Two retry stacks: `providers/src/http.ts:64-101` (four attempts, 500 ms base) and
  `providers/src/publish/http.ts:45-72` (five attempts, 1 s base).
- Three uncertainty rules: `providers/src/publish/http.ts:75-79`, `release-autopilot.ts:368-372` (status codes
  for comments) and `publish.ts:523` (a property of an unknown error).
- Poll loops: `tiktok.ts:457-484` (two), `x.ts:333-338`, `linkedin.ts:357-368`, `instagram.ts:240-247`, and
  YouTube's own backoff at `youtube.ts:400-437`.

**Test seam.** A table test of the classifier (phase, status, error kind to class); one fake-transport test per
adapter; `publishProject` with a fake adapter throwing each class.

**Done when.** One "uncertain" rule; one retry budget; one poll loop; the runner never re-judges a status code.

**Alignment.** ADR 0046; no conflict.

## 08 – Let each board view own its routes

**Problem.** The board shell validates and interprets release records itself, re-lists the workspace on every
status click, and serves view documents, while the release view's module has no routes.

**Solution.** A release-view route function beside the wizard and library ones owns the view's records and
bodies; the shell keeps only the write guard, the static page, whitelisted media and dispatch.

**Evidence.**
- About 180 inline route lines remain (`release-board.ts:494-677`); the wizard, library, sets and sounds routes
  are delegated (`:184-475`).
- The shell validates id length, URLs and autopilot actions (`:610-614,639`), while `projectDir` scans the
  workspace on each request (`:476-481`) and `allProjects` builds the full view for the projects and calendar
  routes (`:482-492,584-603,645-655`).
- The page's script is untested (`board/release.js` is not imported by a test); G-218.

**Test seam.** The release-view route function over the stub request used by
`tests/board-shell-characterization.test.ts`, plus pure view helpers the Vitest fake-document pattern can load.

**Done when.** The release view's routes live in its module; the shell is guard, static page, media and
dispatch; a status click does not list the workspace.

**Alignment.** ADR 0049 (proposed); the code is behind the decision.

## Suggested order

1. **01** – top recommendation; largest leverage and a live disagreement.
2. **05** – small correctness fix; a good first merge if 01 needs a separate design session.
3. **03**, then **04** – both land on 01's vocabulary and remove the record/facts tangle.
4. **02** – the largest cleanup; independent of release.
5. **06**, **07**, **08** – bounded follow-ups.

One candidate per session. 01 and 02 may need a design/grill session and an implementation session each.

## Start a session

```bash
cd /home/hemi/development/coreslopper
opencode
```

Prompt for candidate 01:

> Read `docs/reviews/architecture-review-2026-11-25.md`. Work on candidate 01 only. Read only its read set and
> tests; use an `explore` subagent for anything wider. First grill the interface and the test seam, then
> implement. Update the status row when done.

Both files live in `docs/reviews/`, which is `NOT_SHIPPED` in `scripts/runtime-files.mjs`; no runtime
classification change is needed.
