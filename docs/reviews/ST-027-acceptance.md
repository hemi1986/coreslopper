# Acceptance – ST-027: The sets of a finished set bible go into the library by themselves

Date: 2026-11-24 · Tests run: `npm test -- -t "ST-027"` → 3 passed / 0 failed (876 skipped); `npx vitest run tests/set-library.test.ts` → 31 passed / 0 failed; `npm test` → 877 passed / 2 skipped / 0 failed; `npm run typecheck` → green · Preview: none

Verified on `st-027-finished-set-bibles-go-into-the-library` at committed HEAD `0dc73b3` against `main`; no production or test changes remain uncommitted. `check-scenarios.ts ST-027` reports 3/3 with exact titles, the story linter is green, the changed-boundary scan reports 0 violations, and the glossary/domain-ID checks are green. Ad-hoc CLI probes in throwaway `/tmp/opencode` workspaces also covered a partial missing-file import, a non-`style-character` completion, a repeated completion, `set import --series` on a canon, and malformed set-bible input.

## Scenarios

| Scenario | Test (file) | Given/When/Then really checked? | Result |
|---|---|---|---|
| Finishing style-character takes the sets in | `tests/set-library.test.ts:493` (`ST-027: Finishing style-character takes the sets in`) | **Given** a fresh temp workspace with no library entries, a real `neon-rain` music-video project, and `sets.yaml` naming set `bar` with plate `counter` and its image. **When** the test spawns the real CLI entry point: `stage-done <project> style-character`. **Then** exit is 0, the loaded stage is `done`, stdout says `bar → new entry bar`, and the loaded library entry has the literal `id: bar`, `name: The bar`, plate `{ id: counter, angle: counter, frontal, file: counter.png }`, origin `projects/neon-rain`, and the copied image exists. | pass |
| A failed import does not fail the stage | `tests/set-library.test.ts:517` (`ST-027: A failed import does not fail the stage`) | **Given** the same real project and set, but the named plate file `sets/bar/plates/counter.png` is absent. **When** the real `stage-done` command runs. **Then** exit is 0, the loaded stage is `done`, stderr contains a warning naming both `bar` and the missing plate path, and no broken `bar` entry is created. | pass |
| A music video without a set bible takes nothing in | `tests/set-library.test.ts:545` (`ST-027: A music video without a set bible takes nothing in`) | **Given** a real `neon-rain` project with no `sets.yaml` (asserted before the When) and an existing library entry `bar`, including its `set.yaml`, directory listing, and `counter.png` bytes. **When** the real `stage-done` command runs. **Then** exit is 0, the stage is `done`, the entry's metadata, file names, and image bytes are unchanged, and `library/sets` still contains exactly `bar`. | pass |

## Definition of done

| Item | Applies | Evidence | OK? |
|---|---|---|---|
| Usable at the project's design size | no | `ui: false`; this is CLI/domain behavior, and the UX guidelines still leave the design size open. | n/a |
| Lists fast with realistic data | no | No list, read model, or board route is added. | n/a |
| Every command writes its journal entry | yes | `stage-done` still performs one core transition and saves `state.json` before importing (`packages/cli/src/index.ts:966-969`). A new set records `origin`/`added`; an import into an existing entry appends history in `importSets` (`set-library.ts:298`). A repeated `stage-done` probe produced a later history row with `added: []`; a skipped/failed import creates no entry to journal. | yes |
| Texts from the message catalogs | no | This repository has no message catalog; CLI texts are inline English by convention. The changed skip/success/missing-file/warning strings are inline English (`index.ts:931-944`, `970-985`). | n/a |
| No personal data in logs | yes | Normal output contains set/library ids, the project-relative origin, and source-relative missing-file names. No `.env` value, prompt, description, or other user content is logged. | yes |
| Critical security advisories of the stack within 48 h | no | The diff changes no dependency, lockfile, or stack version. | n/a |
| `CMD-ImportSets` rules and `AGG-LibrarySet` invariants | yes | The automatic path delegates to the existing `importSets` command implementation rather than duplicating matching, copying, dedupe, or history rules. All 31 tests in `tests/set-library.test.ts` pass, including the ST-026 rule/invariant coverage; the ST-027 happy path reloads the entry through its schema. | yes |
| Failed import is non-fatal | yes | State is saved before the import. Both dynamic imports now sit inside their warning-only `try` blocks, and per-set missing files are warnings from `printSetImport`. Scenario 2 covers missing files; the added command-seam regression (`tests/set-library.test.ts:530`) makes `importSets` reject by putting a file at `library/sets`, then asserts exit 0, stage `done`, a set-library warning, and no destructive change. | yes |
| Out of scope respected | yes | No episode/canon later-plate import was added; props and the board are untouched. | yes |
| Scenario ↔ test traceability | yes | `check-scenarios.ts ST-027` → 3/3; each title is exact and each test enters through the CLI command. | yes |
| Full checks | yes | `npm test` → 877 passed / 2 skipped; `npm run typecheck` green; boundary scan → 0 violations; story linter, glossary check, domain-ID check, and `git diff --check` green. | yes |

## Engineering conventions and minor findings

| Item | Evidence | Result |
|---|---|---|
| Inline English CLI texts | New messages follow the existing character-import wording and remain inline in `index.ts`; no catalog or third language was introduced. | OK |
| Command seam | `stage-done` keeps the established load → core transition → atomic save sequence, then calls the owning library module. The tests spawn `packages/cli/src/index.ts`, so they cross commander and the real command action rather than calling a helper behind it. | OK |
| Domain language | Code/docs use Set Bible, Set Library, Library Set, Set Import, set, and plate consistently; `check-language.ts` reports no warnings. | OK |
| Review-fix consistency | Commit `0dc73b3` moves both dynamic imports inside their warning guards, makes the character-bible example add `sets.yaml` when present, and snapshots the existing entry's media in the no-bible scenario. | OK |
| Open minor deviations | None remain in the reviewed diff. | none |

## Edge cases not covered by the story

| Case | Expected by a rule? (cite) | Recommendation |
|---|---|---|
| A series canon after its references pass | Yes — story Context and ADR 0052 say the canon imports sets where characters do. `new-series/SKILL.md:70` now makes `set import <slug> --series` part of the References done condition; an ad-hoc canon probe succeeded with origin `projects/canon`. Agent instructions are not deterministically testable (`docs/engineering/conventions.md`, seam catalog). | question — documentation is the evidence for this path |
| A set with one valid reference and one missing plate | Yes — `CMD-ImportSets` says missing files are reported, not fatal. An ad-hoc `stage-done` probe exited 0, left the stage done, warned with the missing path, imported the valid reference, and kept the plate without a file. ST-026 covers the helper behavior; ST-027's failure scenario covers the all-files-missing case. | question — behavior is correct; no ST-027 scenario slot covers the partial case |
| Completing `style-character` twice | The aggregate says every later import is recorded. A repeated completion exited 0 and appended a history row with `added: []`. The story does not say whether a duplicate completion should re-import. | question — confirm duplicate completion should remain a recorded no-op import |
| Completing another stage while `sets.yaml` exists | The policy names only `style-character`. An ad-hoc `stage-done … storyboard` probe completed the stage and did not import the set. | question — negative guard works; no scenario required by the story |
| Malformed `sets.yaml` | The story's non-fatal case is a schema-valid bible with a missing file, not invalid YAML. `loadProject` parses the bible before the transition (`packages/core/src/project.ts:263`); an ad-hoc malformed-bible probe exited 1 with the stage still `pending`, before any import warning path. | question — confirm invalid artifacts remain a hard stop rather than a warning-only import failure |
| Two completions/imports writing the library concurrently | Library writes are atomic but unlocked — known gap G-130 (`docs/engineering/conventions.md`, “Commands and events”). The automatic hook adds another caller but no new locking rule. | question — covered by the existing library-wide gap |
| A meme's `style-character` stage | The code path is kind-agnostic and the workspace docs now say meme sets enter the library, but ST-027's scenarios name only music videos. | question — no conflicting rule; meme set-import coverage is not in this story |
| The other language | No — CLI output is English only under `docs/engineering/conventions.md`. | no action |
| Plates an episode appends later | Explicitly out of scope in the story. | no action |

Verdict: **accepted with remarks** — all three scenarios have exact-title tests that exercise the real CLI command and assert their Given/When/Then outcomes; the targeted tests, full set-library file, full suite, typecheck, traceability, and boundary checks pass at committed HEAD `0dc73b3`. The production diff follows the inline-text, command-seam, and domain-language conventions, and the review fixes are committed. The remaining remarks are edge-case questions; none is a failing test, a scenario without a real test, or a violated story rule.
