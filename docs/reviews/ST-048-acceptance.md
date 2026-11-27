# Acceptance – ST-048: A short episode is released as one video on every platform
Date: 2026-11-27 · Tests run: `npx vitest run` on the four release test files → 72 passed; `npm test` → 1045 passed, 2 skipped (GPU, opt-in); `npm run typecheck` green · Preview: none

## Scenarios
| Scenario | Test (file) | Given/When/Then really checked? | Result |
|---|---|---|---|
| A short episode's folder holds one video and its covers | `tests/release-short-episode.test.ts` | Given: `shortEpisodeFixture`. When: `buildRelease` (the release entry point). Then: the video, the 1080x1920 cover and the 1080x1440 TikTok cover are asserted with literal paths, and no `thumbnails/` or `shorts/` file exists. It also asserts that the only mp4 is the one video. | pass |
| A short episode is planned on five platforms on the release day | same | The calendar read from `review/calendar.yaml` has exactly youtube, tiktok, instagram, x and microsite, all on the release date. `story` and `linkedin` are absent. | pass |
| A short episode's teaser is cut from its master | same | With an announcement, the teaser's manifest source is `renders/9x16.mp4`, and the ffmpeg `-i` argument is the master. The announcement images are vertical only. A 4:5 variant is also covered. | pass |
| A missing TikTok text is a TODO | same | `runRelease` (not `buildRelease`) with no `tiktok` block. `missing` contains "tiktok", the TODO text is checked, and `errors` is empty, so the run does not fail. | pass |

Traceability: `check-scenarios.ts` reports 4/4 covered.

Commit 5d7a7ee (earlier tests' fixtures):
- ST-044 "A story with a video carries its caption": the fixture is now a vertical episode of 200 s, which has a main video, Shorts and a story. The test still asserts the story caption value and its limit of 120. It still proves its scenario, and the fixture matches the scenario's premise better than before.
- ST-045 "A main video of 2:30 gets its Reel": the fixture is now a horizontal episode with a 9:16 render and a duration of 150 s. It still asserts the Reel's media, files, calendar event and board heading. It still proves its scenario.
- The "tags an episode announcement NEUE FOLGE" test now uses 200 s. Its intent is unchanged.
- The fixture change is additive (options with defaults), so the other ST-044 and ST-045 tests are untouched. All of them pass.

## Definition of done
| Item | Applies | Evidence | OK? |
|---|---|---|---|
| Usable at design size | yes, `ui: true` | The board's view of the shape belongs to ST-052 (out of scope). The release's board data is touched and still passes. | OK |
| Journal entry per command | yes | Release events (`EVT-ReleasePackageBuilt`, `EVT-ReleaseRulesBroken`, `EVT-ReleaseCalendarPlanned`) are unchanged in kind. The manifest now carries `shape`. | OK |
| Texts from catalogs | partly | New TODO and error strings ("tiktok is missing in review/upload.yaml", "the Instagram and TikTok captions are identical…") follow the existing release message style. | OK |
| No personal data in logs | yes | Nothing new is logged. | OK |
| Schemas regenerated | yes | `schema/upload.schema.json` and `schema/release-manifest.schema.json` are in the diff. | OK |
| Typecheck and full suite | yes | Both green. | OK |
| Shorts of upload data ignored (Context rule) | yes | Test "ignores the Shorts of the upload data". | OK |
| Identical TikTok and Reel caption is an error (Context rule) | yes | Dedicated test. | OK |

## Edge cases not covered by the story
| Case | Expected by a rule? (cite) | Recommendation |
|---|---|---|
| An episode of exactly 180 s, and 181 s | ST-047 (shape rule at ≤180 s) | Covered by ST-047, not here. No action. |
| A short episode without an Instagram text | Context: "a missing platform text is a TODO" | Same code path as the TikTok case. Not tested for instagram, x or microsite individually. Question (minor). |
| A short episode whose upload data holds `null` or a wrong type for `tiktok` | Schema validates; a failure is an `invalid` path, not a 5xx | Zod rejects it. No crash found by reading the code. Not run. Question (minor). |
| A re-run after the shape changes (a short episode becomes an episode), for example `thumbnails/` left from an earlier run | Existing "removes only its own stale files" behaviour | Question: are stale `thumbnails/` and `shorts/` files of a former shape removed from the folder? |
| Hashtag case or whitespace variants in the TikTok versus Reel caption comparison | "An identical caption is an error" | Question (minor): is the comparison normalised (case, trailing whitespace)? |

No security, privacy, authorization, injection, server-error or rule-bypass gap was found.

## Verdict
accepted with remarks. All four scenarios have real tests with literal assertions, and everything passes. The fixture changes of the earlier ST-044 and ST-045 tests keep their scenarios intact. Findings: 0 blocker, 0 major, 1 minor (the unchecked per-platform missing-text cases, the stale-file question and the caption normalisation question), 4 questions, 0 merge blockers.
