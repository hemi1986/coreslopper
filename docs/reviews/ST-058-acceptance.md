# Acceptance – ST-058: The board's contact sheet shows each shot's keyframe
Date: 2026-11-28 · Tests run: `npx vitest run tests/board-contact-sheet.test.ts` → 8 passed, 0 failed; `tsc --noEmit` clean · Preview: none

## Scenarios (fast-lane checklist)
| Criterion | Test (file) | Really checked? | Result |
|---|---|---|---|
| 3 shots, keyframe for shot-002 → 3 cards, only shot-002 with image | tests/board-contact-sheet.test.ts (read model, route, card drawing) | Yes: ids in order, keyframe paths `[undefined, shot-002.png, undefined]`, route returns 3 cards and the file route serves the image | OK |
| Keyframe filed after load shows after Refresh, no contact-sheet run | same file, "filed later" | Yes: second read shows it; the sheet is built per request | OK |
| No storyboard.yaml → no grid, no error | same file | Yes: `{status:'none'}`; the tab says "No storyboard yet" | OK |
| Invalid storyboard → validation error in the tab | same file | Yes: status invalid with the message; the tab draws the error, not a grid | OK |

## Definition of done
| Item | Applies | Evidence | OK? |
|---|---|---|---|
| Texts from catalogs (de/en) | yes | `addStrings` in contact-sheet.js and lib.js, both languages | OK |
| Shared page frame | yes | `viewTabs`, `#main`, hash route in app.js | OK |
| Consumers take the resolved storyboard | yes | `validateProject(..., {write:false})`, no timing.effective.json written | OK |
| Embedded SVG removed from the production view | yes | production.js, board-production.ts; asserted in a test | OK |
| Card contents (id, source, section, times, description, text) | yes | `shotCard`, asserted | OK |
| Click opens the keyframe full size | yes | link to the project file route, `target=_blank` | OK |
| 4–6 cards per row at 1280–1440 px | yes | CSS `minmax(220px,1fr)` gives about 5 at 1280 and 6 at 1440 (computed, not measured) | OK, see minor |
| Slug and file access | yes | `workspaceDir` rejects an unknown slug (400, tested); shot ids come from the validated storyboard, so no path traversal | OK |
| Docs | yes | docs/board.md updated | OK |

## Edge cases not covered by the story
| Case | Expected by a rule? | Recommendation |
|---|---|---|
| Storyboard with zero shots | no | handled ("no shots" text), fine |
| Keyframe replaced with a new image | no | cache-busted by `?v=mtime`, fine |
| Invalid-storyboard error text may contain absolute paths | no | question |
| Tab shown for every project, also without a storyboard | story allows it | fine |

## Findings
- minor: the 4–6 cards per row is verified only by reading the CSS, with no browser check.
- minor: the German tab label "Contact Sheet" and the English "Contact sheet" follow the glossary, fine; the stale G-70 / RM-ContactSheet "as-is" text in `docs/domain/events.yaml` may need an update, which is outside this story's scope.
- No convention deviations found in the diff (strings in catalogs, the shared `viewTabs` and `el` helpers, glossary terms).

Merge blockers: 0.

Verdict: accepted with remarks
