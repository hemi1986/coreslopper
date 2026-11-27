# Acceptance – ST-051: The release shape is kept once the release has started
Date: 2026-11-28 · Tests run: `npx vitest run tests/release-shape.test.ts` → 13 passed, 0 failed · Preview: none

## Scenarios
| Scenario | Test (file) | Given/When/Then really checked? | Result |
|---|---|---|---|
| Before the first post the shape follows the episode | tests/release-shape.test.ts | Yes: real first run (short-episode), status without done mark or URL, track set to 190 s, second `buildRelease`; manifest on disk is "episode". | pass |
| A done mark keeps the shape | same | Yes: done mark "youtube", 190 s; rejects with "the release started as short-episode"; the full folder and calendar are compared byte for byte before and after. | pass |
| A live URL keeps the shape | same | Yes: URL for "tiktok", done false; same failure message, snapshot unchanged. | pass |
| The same shape builds after the first post | same | Yes: done mark, track 160 s to 170 s; run succeeds, shape "short-episode" in the result and on disk. | pass |

Extra test: the message names both shapes and the first done mark or live URL.

## Definition of done
| Item | Applies | Evidence | OK? |
|---|---|---|---|
| Fails before anything is written | yes | The check sits right after the manifest is read, before the `ReleaseWriter`, rendering and calendar planning. | OK |
| Status read under its lock, never written | yes | `withReleaseLock(... loadStatus)`; no write in `release`. | OK |
| Message names both shapes and the start | yes | Own test. | OK |
| Journal / catalog / personal data / UI | no | CLI error, no UI, no personal data. | n/a |

## Edge cases not covered by the story
| Case | Expected by a rule? (cite) | Recommendation |
|---|---|---|
| Older manifest without `shape` | Handled by `manifestShape(previous, kind)` fallback | none |
| Unreadable `release-status.json` makes the run fail with a parse error | No rule | question |
| Done mark but no manifest yet (first run) builds any shape | Consistent with the rule: it compares against the manifest | none |
| Board refresh after a live URL (POL-RefreshAfterStatusChange) hitting the refusal | Not stated | question |

Merge blockers: 0.

Verdict: accepted
