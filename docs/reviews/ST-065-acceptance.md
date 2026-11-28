# Acceptance – ST-065: A wizard creates or imports library sets
Date: 2026-11-28 · Tests run: `npx vitest run tests/board-set-wizard.test.ts tests/board-sets.test.ts tests/board-character-wizard.test.ts` → 24 passed, 0 failed; `npm run typecheck` green · Preview: none

Story type is `task`: there are no Gherkin scenarios (check-scenarios: 0/0), so the checklist items are the acceptance criteria.

## Checklist
| Item | Test (file) | Really checked? | Result |
|---|---|---|---|
| Set card in the Library group opens `#/new/set` | `tests/board-set-wizard.test.ts` "has a Set card in the Library group…" | Card found in the chooser, click sets hash `#/new/set` | OK |
| Step 1 with a name creates the set; address `#/new/set/<id>` | same file, "step 1 with a name creates…" | Real board handler over a fixture workspace; hash `#/new/set/neon-bar` and the stored entry (name, description, prompt, origin manual) are asserted with literals | OK |
| Reference and plate in step 2 appear in the set | same file, "shows a reference and a plate…" | Uploads via the real route; tiles, `entry.refs`, `entry.plates` (angle, file), resume after reload and the "To the set" link `#/sets/attic` asserted. Plate without angle refused in its step and retried | OK |
| Import takes the sets of a fixture project and lists them with links | same file, "imports the sets of a fixture project…" | Link `#/sets/pier`, the stored entry and the "nothing found" text asserted | OK |
| Refused name shown with its reason, fields keep text | same file, "marks name, description and prompt as required, refuses an empty or taken name…" | Empty and taken name: error text, field values kept, hash unchanged | OK (the story box has no "(test)" marker, but a test exists) |
| Sets view has no inline form; its + New opens `#/new/set` | same file, "the Sets view has no inline creation…" plus an adjusted `tests/board-sets.test.ts` | No FORM element, old texts absent, click goes to `#/new/set` | OK |

## Definition of done
| Item | Applies | Evidence | OK? |
|---|---|---|---|
| Texts from the message catalogs (de + en) | yes | `addStrings` de/en in `set-wizard.js` and `sets.js`; story labels (Neu anlegen, Aus Projekt oder Serie übernehmen, Zum Set) present | OK |
| Docs: `docs/board.md` and both board guides | yes | all three changed (board.md describes both paths) | OK |
| Empty state links + Neu | yes | `sl-empty-new` link in `sets.js` | OK |
| Existing routes only, no new route | yes | wizard posts to `/api/sets/new`, `/api/upload/sets/`, `/api/sets/import` | OK |
| Output escaped | yes | the wizard builds the DOM with `el(...)` and `textContent`, with no raw HTML from the id, the name or an error message | OK |
| Journal entry per command | yes (existing routes) | No new command; the routes are unchanged | OK |
| Lists fast, personal data in logs, advisories | n/a | no list or logging change | n/a |

## Edge cases not covered by the story
| Case | Expected by a rule? | Recommendation |
|---|---|---|
| `#/new/set/<unknown id>` | Handled: shows an error and a link back (`swUnknown`) | OK, no action |
| Import with no project or series in the workspace | Handled: `swNoTargets` | OK |
| Imported set without files | Listed as "skipped" without a link (CMD-ImportSets rule) | OK |
| A very long name or description in the step header | No rule | question (layout only) |
| Two browser tabs creating the same name at once | The library refuses a taken id (CMD-AddLibrarySet) and the wizard shows it | OK |
| Server routes get malformed JSON | Routes unchanged by this story; no new input path | no action |

No merge blockers found.

## Verdict
accepted
