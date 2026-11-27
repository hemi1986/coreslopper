# Acceptance – ST-044: A story carries no text, only an optional caption of at most 120 characters on its video
Date: 2026-11-27 · Tests run: `npx vitest run tests/release-story-caption.test.ts` → 9 passed, 0 failed; `npx vitest run tests/release` → 163 passed; `npm run typecheck` green · Preview: none

## Scenarios
| Scenario | Test (file) | Given/When/Then really checked? | Result |
|---|---|---|---|
| A story with a video carries its caption | tests/release-story-caption.test.ts | Given: episode fixture, first Short with story "Neue Folge – jetzt auf YouTube". When: buildRelease (entry point of release; --no-render). Then: caption value and limit 120 asserted with literals. | OK |
| A story without a caption is complete | same | Story text removed from all Shorts; asserts `missing` lacks `shorts.Z1-intro.instagram.story`. | OK |
| A caption over 120 characters breaks a rule | same | 121 x characters; runRelease rejects with details containing "story: caption has 121 characters, limit 120" (exact literal). | OK |
| A story with only an image has no caption | same | Short videos removed, story image kept, story text still in upload data; asserts files = story-image only and `texts.caption` undefined. | OK |

Traceability: `check-scenarios.ts` 4/4 covered.

## Definition of done
| Item | Applies | Evidence | OK? |
|---|---|---|---|
| Texts from the message catalogs (DE/EN) | yes | "Bildunterschrift"/"Caption" in BOARD and Labels (release-board-data.ts, release-texts.ts); board test asserts the DE label | OK |
| Live counter like other limited fields | yes | board field carries limit 120 and unit chars; texts/instagram.md shows "(11/120 Zeichen)" (tested) | OK |
| Limit overridable in channel.yaml | yes | `story_caption` in PLATFORM_LIMITS, schema/channel.schema.json regenerated, test "takes the caption limit from the channel" | OK |
| Docs / skill updated | yes | docs/release-platforms.md, video-qa/release.md | OK |
| Journal entry, personal data in logs, performance | n/a | no new command, no new logging | OK |
| Typecheck, related release tests | yes | green | OK |

## Edge cases not covered by the story
| Case | Expected by a rule? (cite) | Recommendation |
|---|---|---|
| An existing `announcement.text` longer than 120 characters (it also serves X and the YouTube post) now fails the whole release while the announcement story shows the teaser. Story text says the announcement's story text becomes the caption, with the limit, so this follows the story, but it newly breaks previously valid upload data (also "An older upload.yaml ... stays valid" refers to a story text only). | Partly (Context: announcement text becomes the caption; limit is a broken rule) | question: is a hard error right for old announcement texts, or only for new ones? |
| Only the first Short's story text is used; a story text on a later Short is silently ignored (previously any Short's text was taken). | Context: "release-day story with the first Short" | question, no action |
| Story text over 120 characters while the story shows only an image: no error, no caption (consistent with scenario 4). | Scenario 4 | none |
| Counting of characters for emoji / combined characters (code points vs. UTF-16 units) follows the existing limit counter. | no | question |
| Malformed input (null, wrong type for `story`) goes through the existing zod schema (`z.string().min(1).optional()`), so it is rejected as invalid upload data, not a crash. | schema | none |

No merge blockers found.

Verdict: accepted with remarks
