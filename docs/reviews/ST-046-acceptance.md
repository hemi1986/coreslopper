# Acceptance – ST-046: The X post carries the main video by default
Date: 2026-11-27 · Tests run: `npx vitest run tests` → 1027 passed, 2 skipped, 0 failed (`tests/release-x-main.test.ts`: 5/5); `npm run typecheck` green · Preview: none

## Scenarios
| Scenario | Test (file) | Given/When/Then really checked? | Result |
|---|---|---|---|
| The X post takes the main video when no media is named | tests/release-x-main.test.ts | Given: fixture music video, `x.media` deleted. When: `buildRelease`. Then: plan post `x` media and files are `video/neon-16x9.mp4` (literal), also with `media: main`. | OK |
| A named Short stays the X post's video | same | Given media `Z2-chorus`; plan media `shorts/Z2-chorus-9x16.mp4`, board card agrees. | OK |
| An X post without a reply is complete | same | Given reply deleted; reply undefined, `missing` lacks `x`, no `needsYoutube`, no `{youtube}` in text, board has no reply field. | OK |
| A main video over 140 seconds notes X Premium | same | Given 200 s timing, English release language; board field note is exactly "Over 140 s only with X Premium". Negative cases (140 s, Short) also tested. | OK |

## Definition of done
| Item | Applies | Evidence | OK? |
|---|---|---|---|
| Traceability | yes | check-scenarios: 4/4 covered | OK |
| Texts from message catalogs | yes | `xPremium` in the de and en BOARD catalogs | OK |
| Journal entry | n/a | no new command; the existing release build is unchanged | OK |
| Docs | yes | docs/publishing.md, docs/release-platforms.md and the release skill updated | OK |
| Personal data in logs | n/a | none added | OK |

## Edge cases not covered by the story
| Case | Expected by a rule? (cite) | Recommendation |
|---|---|---|
| `media: "Main"` or `" main "` (case or whitespace) | Not the same value as `main`; it gets the existing error "not a Short in upload.yaml" (rejected, not silently accepted), so no bypass | no action |
| A Short literally named "main" in upload.yaml | `main` now always means the main video (story context) | question: reserve the name or accept the shadowing? |
| Existing upload.yaml with no `media` formerly got the first Short; now it gets the main video | Intended by the story ("main when not set") | no action |
| Main video over 140 s in a plan without `durationSeconds` | No note is shown (`?? 0`) | question: acceptable for projects not yet timed? |
| Episode or meme kinds on X | Not covered by the story | question |

Merge blockers: 0.

## Verdict
accepted with remarks
