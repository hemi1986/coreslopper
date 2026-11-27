# Acceptance – ST-045: The main video goes to Instagram as a Reel only up to 3 minutes
Date: 2026-11-27 · Tests run: `npx vitest run -t "ST-045"` → 4 passed; full `npx vitest run` → 1022 passed, 2 skipped, 0 failed; `npm run typecheck` green; lint-story green · Preview: none

## Scenarios
| Scenario | Test (file) | Given/When/Then really checked? | Result |
|---|---|---|---|
| A main video of 2:30 gets its Reel | tests/release-reel.test.ts | Given: episode fixture, timing set to 150 s, 9:16 render, Instagram text. When: `buildRelease`. Then: post media and file role, calendar step `reel`, plus board heading "Reel: Hauptvideo". Literals from the scenario. | OK |
| A main video of exactly 3 minutes still gets its Reel | tests/release-reel.test.ts | 180 s boundary, post exists, media 9x16. | OK |
| A main video over 3 minutes gets no Instagram post | tests/release-reel.test.ts | 181 s, no text. Asserts no post, `missing` lacks `instagram_post`, no TODO, no calendar event. | OK |
| There is no image post in place of the Reel | tests/release-reel.test.ts | Only the 16:9 master; post carries `video/neon-16x9.mp4`, no 4x5 thumbnail call, no `instagram/feed*` file on disk, no `feed-image` in the manifest. | OK |

## Definition of done
| Item | Applies | Evidence | OK? |
|---|---|---|---|
| Texts from the message catalogs (DE/EN) | yes | `release-texts.ts` and `release-board-data.ts` carry both languages for the heading, the checklist and the calendar label | OK |
| Journal entry / events | yes | The change sits inside the existing release build, which writes the manifest and calendar. No new command. | OK |
| Older projects stay valid | yes | The upload key `instagram_post` is kept; the `feed-image` kind stays in the schema | OK |
| No personal data in logs, performance | no change | none | OK |
| Docs in step with the behaviour | yes | `workspace/.claude/skills/video-qa/release.md:151` still says "the main video in the feed format (4:5 or 1:1 render)". This is a shipped agent doc and now wrong. | remark (minor) |
| Dead label | yes | `release-texts.ts:228` `post.instagram: 'Instagram feed post'`. The calendar no longer emits step `post` for Instagram, so it is probably unused. | remark (minor) |

## Edge cases not covered by the story
| Case | Expected by a rule? (cite) | Recommendation |
|---|---|---|
| No timing, so the length is unknown | The code keeps the Reel (`mainVideoReel(undefined)`), and a unit test covers it. The story does not say. | question: confirm "unknown length keeps the Reel" |
| Over 180 s with an `instagram_post` text still in upload.yaml | The post is skipped and the text is ignored. No warning to the user. | question |
| Release folder from before the change still holds `instagram/feed*` files | The story only says "the release folder has no feed image" for a fresh build. Old files are not shown to be cleaned up. | question |
| `release` and `calendar` compute the length from different sources (`effectiveTiming ?? timing` against `input.durationSeconds`) | No rule. They could differ at the 180 s boundary if effective timing and timing differ. | question |
| Meme (one 9:16 video, its own Reel) | The calendar guard `!meme` is unchanged. | none |

No merge blockers found (no crash, security or rule-bypass case). Malformed input goes through the existing `UploadDataSchema`, which this change does not touch.

## Verdict
accepted with remarks
