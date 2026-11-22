# Acceptance – ST-008: Create a meme in the board's wizard
Date: 2026-11-22 · Tests run: `npx vitest run tests/meme-wizard.test.ts` → 8 passed, 0 failed; full `npx vitest run` → 741 passed, 2 skipped, 0 failed · Preview: none

## Scenarios
| Scenario | Test (file) | Given/When/Then really checked? | Result |
|---|---|---|---|
| A meme is created with its pitch and a library character | tests/meme-wizard.test.ts | Given: real library entry "office-robot". When: POST /api/new/meme through boardHandler. Then: kind meme, formats exactly 9:16 master and no derivatives, pitch holds both texts, characters.yaml names office-robot, setup done. All literals. | pass |
| A meme without characters is valid | same | Library empty, characters []. Setup done, no characters.yaml, pitch holds the idea and no setting section. | pass |
| An empty idea is refused | same | Idea missing, empty and blank all give 400 "needs an idea"; folder absent. | pass |
| A taken slug is refused | same | Existing folder; 400 "slug "office-prank" is taken"; existing content untouched. | pass |

## Definition of done
| Item | Applies | Evidence | OK? |
|---|---|---|---|
| Every Then asserted with literals | yes | see above | OK |
| Real entry point | yes | the HTTP API of the board handler (the wizard's only server path) | OK |
| UI per story Context (tile text, empty-library hint, error above the button keeping input, `/new-meme <slug>` afterwards) | yes | wizard.js: tile en/de texts, `memeNoChars` en/de, error `<p>` above the submit button and the form is not re-rendered on failure, `memeSteps` shows commandBox `/new-meme <slug>`. Verified by reading only; no browser test | OK (remark) |
| Journal entry per command | n/a here | project creation uses the existing createProject path; not specific to this story | OK |
| Texts from catalogs | yes | de/en catalog entries in wizard.js | OK |
| Failure leaves no folder | yes | all checks run before the folder; later failure removes it (tested for unknown character and low budget) | OK |
| No personal data in logs | yes | none logged beyond slug/path | OK |
| Security advisories | n/a | no dependency change | OK |

## Edge cases not covered by the story
| Case | Expected by a rule? | Recommendation |
|---|---|---|
| Server rejections reach the form in English only (e.message), also with the German UI | none in the story | question |
| Idea over 2000 characters is refused (an implementation limit not in the story) | no | question: confirm the limit |
| Two simultaneous creations of the same slug (check, then create) | no | question |
| Library character deleted between page load and submit | covered by the pre-check "no library character" | fine |
| UI form has no browser-level test (client check of the taken slug, kept input) | ux-guidelines pattern, tested where built | question |

## Verdict
accepted with remarks
