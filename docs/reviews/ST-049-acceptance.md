# Acceptance – ST-049: A horizontal episode of up to 3 minutes posts its vertical version as its one Short
Date: 2026-11-28 · Tests run: `npx vitest run tests/release-vertical-version.test.ts tests/short-form.test.ts tests/release-shape.test.ts` → 16 passed, 0 failed; `npm run typecheck` green · Preview: none

## Scenarios
| Scenario | Test (file) | Given/When/Then really checked? | Result |
|---|---|---|---|
| The vertical version is the one Short | tests/release-vertical-version.test.ts | 150 s horizontal fixture with 150 s 9:16 probe; goes through buildRelease; asserts the only Short is `shorts/demo-episode-9x16.mp4` and measured duration 150 (literals) | pass |
| Cut Shorts stay out of the folder | same | two cut Shorts written to renders/shorts; folder tree and manifest both hold only the vertical version | pass |
| The main video keeps its three thumbnails | same | plan post "youtube" lists thumb-1..3 as thumbnail/alt files | pass |
| A horizontal episode over 3 minutes keeps its cut Shorts | same | 200 s with two cut Shorts; both in the folder, no vertical version | pass |

## Definition of done
| Item | Applies | Evidence | OK? |
|---|---|---|---|
| One shared "up to 3 minutes" rule (0.05 s tolerance) | yes | `upToThreeMinutes` in core short-form.ts, used by release shape, vertical version and publish; unit test short-form.test.ts | OK |
| Journal / events | yes | no new command; existing release events unchanged | OK |
| Texts from catalogs, no personal data in logs | yes | TODO texts are CLI strings like the neighbouring ones; no personal data | OK |
| Typecheck | yes | green | OK |

## Edge cases not covered by the story
| Case | Expected by a rule? (cite) | Recommendation: fix now / question |
|---|---|---|
| Exactly 180.02 s horizontal episode | yes, Context tolerance rule; unit-tested in short-form.test.ts, not through release | question (minor): no release-level test |
| Project without a 9:16 derivative format | code adds a TODO, no Short placed | question (minor): behaviour not in a scenario |
| Episode shortened/lengthened across 180 s after a release | not in the story | question: earlier cut Shorts in the folder vs vertical version |
| Base branch marathon/2026-11-28 moved on (ST-051: keptShapeProblem, withReleaseLock in release.ts); the branch forked before it | n/a | question: merge/rebase conflict in packages/cli/src/release.ts; rerun the tests after the merge |
| Malformed input / security | no new untrusted input path | none found |

Verdict: accepted with remarks
