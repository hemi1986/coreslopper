# Code review – ST-029: Update a library set's name, description, prompt and tags

Base: main · Commits: 5 · Date: 2026-11-24

Checks run at HEAD `3d1c294`: `npx vitest run tests/set-library.test.ts` → 40/40 green; `npm run typecheck` → green;
`node .claude/skills/implement/scripts/check-language.ts` → “Glossary language OK”;
`check-scenarios.ts ST-029` → 2/2 scenarios, exact titles; `check-commands.ts` → domain ID traceability OK.
I also drove `updateLibrarySet` in a throwaway `/tmp` workspace: a rename keeps the id and the entry’s folder, a
plate, `origin`, `added` and `history` survive, extra fields in the change object are ignored; empty or
whitespace-only name/description/prompt, an over-long field, an unknown id and a traversal id all reject with
`ValidationError`.
The diff is small and sits at the agreed seam (`updateLibrarySet`, “Set library” row of the seam catalog). The two
scenarios truly check their `Then` values and the extra test covers the story title's name/tags part.

## Findings

| # | Severity | Area | File:line | Finding | Source (ADR, rule, glossary, smell) | Suggested direction |
|---|---|---|---|---|---|---|
| 1 | minor | Test quality / prompt happy path | tests/set-library.test.ts:85-91, :93-101 | The only test that updates `prompt` asserts a refusal (`{ prompt: '' }`); no test changes the prompt successfully. `description` has a scenario, `name`+`tags` have the extra test, so the prompt's assignment (`set-library.ts:100`) is the one stated field whose success path never runs. A regression where a valid prompt is ignored or written to the wrong field would leave the suite green. Empty `name` and `description` refusals are likewise untested, though they share `entryText(..., true)` with the tested prompt case. | ST-029 title and Story (“change a library set's name, description, prompt and tags”); Context (“Name, description and prompt stay required”); tdd skill (the test must exercise the behaviour the story claims) | Extend the name/tags test with a valid prompt change and assert it on both the returned set and the re-read `set.yaml`; optionally pin the empty-name/description and unknown-id refusals in the same describe. |
| 2 | minor | Test quality / aggregate preservation | tests/set-library.test.ts:69-72, :75-101 | `withBar` builds a set with no references, plates or history, so no test updates a populated set. The implementation is correct today — the `/tmp` probe kept a plate and a history row through a rename — but a refactor that rebuilt the set from only the four fields would pass every test and leave files in `library/sets/bar/` that `set.yaml` no longer names. | AGG-LibrarySet invariants (“Every file in the entry's folder is named by set.yaml”; the entry holds `refs`, `plates`, `history`); ADR 0052; tdd skill (the Given should include the state the rule protects) | Add one reference and one plate through the existing `addLibrarySetFile` path to the Given, then assert `refs`, `plates`, `origin`, `added` and `history` survive the update. |
| 3 | minor | Module documentation | packages/cli/src/set-library.ts:22-27 | The module header enumerates the command surface (`addLibrarySet`, `addLibrarySetFile`, `importSets`, and the copy) but not `updateLibrarySet`, now the board's write path. The character module has the same stale line (`character-library.ts:32-38` omits `updateLibraryCharacter`), so this is doc drift, not a behavioural defect. | conventions (“when code and this file disagree, raise it”; module comments are the map maintainers read); ADR 0052; codebase-design: locality | Name `updateLibrarySet` in the first clause (the set is added, edited and given files by hand); optionally correct the character header at the same time. |
| 4 | question | Spec consistency with ST-032 | docs/stories/ST-032-the-boards-sets-view.md:24; docs/stories/ST-029-update-a-library-set.md:16-20 | ST-029's title and command cover four fields, but ST-032's set-page bullet says only “description and prompt (editable, ST-029)”. If ST-032 follows its text literally, `name` and `tags` have no form and this command's extra surface stays unused, so the story's stated purpose (“the agent offers and uses the set with the right words”) is only partly reachable. | ST-029 title, Story and Context (“the board's set page (ST-032)”); ST-032 set-page bullet; ADR 0052 (“the board's form” changes an entry) | Decide: (a) ST-032 edits all four fields, consistent with this story's title, or (b) accept that name/tags are edited later/elsewhere and say so. No story or ticket from this review. |
| 5 | question | Untrusted `change` shape | packages/cli/src/set-library.ts:96-101; packages/cli/src/release-board.ts:96-105, :303-306 | The command assumes `change` is an object. The board's `body()` returns `JSON.parse(...)`, and the character route passes the result straight to the command; a JSON body of `null` reaches `change.name` and throws a `TypeError`, which the board maps to 500, while ADR 0049 says malformed input is a 400. The four field values themselves are validated (`entryText`, `parseTags`) and unknown keys are ignored, so this is only about the object shape. | ADR 0049 (“malformed input is 400”); the untrusted-input rule; character update has the same pattern | Decide whether the command guards its shape (`typeof change === 'object' && change !== null`, for both library updates) or ST-032's route validates the body before calling. Prefer the route when ST-032 wires it, since it owns the body. |

**ready to merge** — no blockers or majors; findings 1–3 are small test/doc gaps, 4–5 are questions for the developer and do not gate this diff.
Most important: no test updates a set that already holds references and plates, so an update that dropped them (data loss, and files `set.yaml` no longer names) would pass; add one reference and one plate to the fixture and assert they survive.

## Follow-up verification

At HEAD `3d1c294` plus the refactor commit: findings 1 and 2 fixed — the describe now writes a prompt
successfully, pins the empty-name/description refusals, updates a set that already holds a reference, a plate and a
history row and asserts `refs`, `plates`, `history`, `origin` and `added` survive, and asserts the file stays on
disk. Finding 3 fixed for `set-library.ts` (the header names `updateLibrarySet`); the same one-line drift in
`character-library.ts` is left alone as it is outside this diff. Finding 5 fixed at the command, not the route:
`updateLibrarySet` refuses a `change` that is not an object with a `ValidationError`, so any caller gets the
ADR 0049 400; the character update's matching gap is in `OPEN_QUESTIONS.md`. Finding 4 (name and tags editable on
ST-032's set page) is in `OPEN_QUESTIONS.md` as a decision for the user.

Tests: `npx vitest run tests/set-library.test.ts` → 44/44; `verify.ts` green.

Verdict: **ready to merge** — 0 blockers, 0 majors, 0 open minors.
Most important: an update of a populated set keeps its references, plates and history, and a malformed change is
refused as a `ValidationError`.
