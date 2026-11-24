# Acceptance – ST-029: Update a library set's name, description, prompt and tags

Date: 2026-11-24 · Tests run: `npx vitest run tests/set-library.test.ts -t "ST-029"` → 2 passed / 0 failed; `npx vitest run tests/set-library.test.ts` → 40 passed / 0 failed; `npm test` → 887 passed / 2 skipped / 0 failed; `npm run typecheck` → green; `check-scenarios.ts ST-029` → 2/2, exact titles; `lint-story.ts ST-029` green; `verify.ts` → passed · Preview: none

Verified on `st-029-update-a-library-set` at HEAD `3d1c294` against `main` (`git diff main...HEAD`); working tree clean. The diff touches only the set-library seam, its tests, the seam catalog row, the story status and the generated backlog. The implemented seam is `updateLibrarySet` (`packages/cli/src/set-library.ts:96-104`), which is the row "Set library" of the seam catalog and exactly what the future board form will call; the board's set page and its HTTP route are ST-032, and the CLI has no update, as the story's Context says.

## Scenarios

| Scenario | Test (file) | Given/When/Then really checked? | Result |
|---|---|---|---|
| The description is corrected | `tests/set-library.test.ts:75` (`ST-029: The description is corrected`) | **Given** a temp workspace in which the library entry `bar` is created through the real `addLibrarySet` seam with the description `"a bar"` (and the prompt `"narrow bar, blue neon"`). **When** `updateLibrarySet(ws, 'bar', { description: 'a narrow bar in blue neon' })` runs. **Then** the returned entry has the literal `id: 'bar'` and `description: 'a narrow bar in blue neon'`, the other fields are unchanged (`name: 'bar'`, prompt), the re-read `set.yaml` has the same id and description, and `validateChangedFile` says `library set`, so the write is schema-valid. | pass |
| An emptied prompt is refused | `tests/set-library.test.ts:85` (`ST-029: An emptied prompt is refused`) | **Given** the library entry `bar` with the prompt `"narrow bar, blue neon"`. **When** `updateLibrarySet(ws, 'bar', { prompt: '' })` runs. **Then** it rejects with `/prompt is required/` (the scenario's "refused because the prompt is missing"), and the re-read entry still has the literal prompt `"narrow bar, blue neon"`, so nothing was written. | pass |

An extra, non-scenario test at `tests/set-library.test.ts:93` covers the name and tags part of the story title: it renames `"bar"` to `"Neon Bar"`, sets three comma-separated tags, asserts the entry and the re-read file keep `id: 'bar'`, and asserts no `library/sets/neon-bar` folder appears, so a rename does not move the id.

## Definition of done

| Item | Applies | Evidence | OK? |
|---|---|---|---|
| Usable at the project's design size | no | This story has no screen of its own: the board's set page is ST-032, and `docs/product/ux-guidelines.md` still leaves the design size `[OPEN]`. | n/a |
| Lists fast with realistic data | no | No list, read model or board route is added by this story. | n/a |
| Every command writes its journal entry | n/a | This repository has no event journal; `state.json` holds current state and the watchdog derives events (`docs/engineering/conventions.md:62`). The durable record here is `library/sets/bar/set.yaml`, asserted by both scenario tests. | n/a |
| Texts from the message catalogs | n/a | There is no message catalog; CLI and board texts are inline English by convention (`docs/engineering/conventions.md`, "UI and texts"). This story adds no user-facing text. | n/a |
| No personal data in logs | yes | `updateLibrarySet` logs nothing; it only writes the entry's `set.yaml` through the atomic `saveLibrarySet`. The library text is user content, not a log. | yes |
| Critical security advisories of the stack within 48 h | no | The diff changes no `package.json`, lockfile or stack version. | n/a |
| Story Context rules and `AGG-LibrarySet` invariants | yes | The id stays `bar` on a rename (scenario 1 + extra test, so productions that took the set keep their `library` link); name, description and prompt stay required (`entryText(..., true)`; the prompt case is tested); the entry's folder keeps its id and the write is schema-valid (scenario 1); only `library/sets/<id>/set.yaml` is written, so references, plates, `origin`, `added` and `history` are untouched and the user's library is not overwritten by anything else. | yes |
| Out of scope respected | yes | The id is never renamed or moved; the board set page/route (ST-032) and the CLI are untouched, as the Context states. | yes |
| Scenario ↔ test traceability | yes | `check-scenarios.ts ST-029` → 2/2 scenarios covered, each test title exact; `verify.ts` reports the same. | yes |
| Full checks | yes | Targeted file 40/40, story tests 2/2, full suite 887 passed / 2 skipped, typecheck green, story linter green, `verify.ts` passed. | yes |

## Edge cases not covered by the story

| Case | Expected by a rule? (cite) | Recommendation |
|---|---|---|
| An emptied **name** or **description** on update | Yes — story Context: "Name, description and prompt stay required"; `LibrarySetSchema` has `min(1)` on both. The code refuses through the same `entryText(..., true)` call as the tested prompt. Only the prompt case has a test. | question — the behaviour is correct; decide whether to pin name and description emptiness with tests in this story (the prompt test already covers the shared path) |
| A whitespace-only name/description/prompt | Yes — the same "stay required" rule; `entryText` trims and then rejects an empty result. | no action — same tested code path as the empty string |
| Updating an id the library does not hold | Expected by the aggregate (the entry exists); `loadLibrarySet` throws `no library set "<id>"` before any write. Untested. | question — trivial; add a test only if ST-032 needs to surface that message |
| Clearing tags (`tags: ''` or `[]`) | Allowed — `tags` is optional with default `[]` (`docs/architecture/data-model.md`, Tags attribute); `parseTags` returns `[]`. Untested. | question — confirm clearing is intended (it mirrors `set new`) |
| Updating an entry that already has references, plates and import history | Yes — the invariants "every file in the entry's folder is named by set.yaml" and "an import … is recorded in the history"; the implementation only reassigns the four changed fields, so `refs`, `plates`, `origin`, `added` and `history` survive. No test sets up files or a history before the update. | question — assert the preserved collections once, since losing plates would be data loss |
| Two updates of the same entry at the same time | No locking rule; library writes are atomic but unlocked (G-130, `docs/engineering/conventions.md:80`). Last write wins; this command adds no lock. | no action — existing workspace-wide gap |
| A production takes the set while its library entry is updated | Yes — ADR 0052 and the Context: productions hold copies, and the update writes only `library/sets/<id>/set.yaml`. | no action — true by construction |
| Long texts and the other language | Field limits are 200 (name), 4 000 (description, prompt) and 60 per tag, enforced by the shared `entryText`/`parseTags`; English only by convention. | no action |
| An empty change object (`{}`) | No rule; it loads and rewrites the entry unchanged. Harmless. | no action |

Verdict: **accepted with remarks** — both scenarios have exact-title tests that build their Given through the real add seam, enter through `updateLibrarySet`, and assert every Then with the scenario's literal values, including persistence and schema validity; the story tests, the whole set-library file, the full suite and typecheck pass at HEAD `3d1c294`, and traceability, the story linter and `verify.ts` are green. The Context rules hold: the id survives a rename, the prompt stays required with the old value intact after a refusal, and only the entry's `set.yaml` is written. The remarks are test-coverage questions (a refused empty name/description, clearing tags, preserving references/plates/history and the unknown-id message); none is a failing test, a scenario without a real test, or a violated story rule.

## Follow-up verification

At HEAD `3d1c294` plus the refactor commit, the remarks are answered with tests: a successful prompt change, the
empty-name and empty-description refusals, a `change` that is not an object refused as a `ValidationError`, and an
update of a set that already holds a reference, a plate and a history row asserting that `refs`, `plates`,
`history`, `origin` and `added` survive and the file remains on disk. Clearing tags and the unknown-id message are
left as they are: `parseTags` mirrors `set new`, and `loadLibrarySet`'s message already names the missing id.

`npx vitest run tests/set-library.test.ts` → 44/44; `verify.ts` green.

Verdict: **accepted** — no remarks remain.
