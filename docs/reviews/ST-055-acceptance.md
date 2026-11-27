# Acceptance – ST-055: The release skill and the platform docs follow the release shapes
Date: 2026-11-28 · Tests run: `npm test` → 1083 passed, 2 skipped (GPU, opt-in), 0 failed; `npx vitest run tests/release-shape-fixes.test.ts tests/release-story-caption.test.ts` → 19 passed; `npm run typecheck` green · Preview: none

Type task: no Gherkin scenarios (`check-scenarios`: 0/0, traceability OK). Evidence is checked per checklist item.

## Checklist items
| Item | Evidence | Really checked? | Result |
|---|---|---|---|
| release.md: short-episode and vertical-version paths with commands | `workspace/.claude/skills/video-qa/release.md` ("Pick the path", "A short episode's release package", vertical version in sections 1–4) | commands, covers, texts per platform, no Shorts or 16:9 thumbnails | OK |
| No skill or doc asks for a story text, feed image, or default Short on X | grep of release.md, thumbnails.md, publishing.md, autopilot.ts, release-calendar.ts; the remaining "feed" mentions in autopilot.ts are the legacy calendar step, documented as such | `x.media` default is the main video | OK |
| release-platforms.md cites the research file | header link plus 12 `F<n>` citations | spot check | OK |
| `announcement.story`; long announcement text no longer fails | `tests/release-shape-fixes.test.ts` (3 tests) | literals, includes the over-120 case for `announcement.story` | OK |
| QA WARNs (story on other Short, `instagram_post` over 3 min); Short named `main` invalid | same file, 3 + 1 tests | warn and no-warn cases | OK |
| Provisional-shape TODO without timing.json | same file, 2 tests (with and without the track) | | OK |
| Short episode: one video, TikTok, no Premiere, no pinned comment | same file, end-to-end through `publishProject` and `runAutopilot`; leftover `shorts` and `pinned_comment` seeded | asserts calls, Premiere step, and `postComment` | OK |
| `npm test` passes | run above | | OK |

## Definition of done
| Item | Applies | Evidence | OK? |
|---|---|---|---|
| Texts from catalogs, no personal data in logs | little (docs and QA messages) | QA warnings name the field | OK |
| Journal entry per command | no new command | | n/a |
| Docs and schema in sync | yes | `schema/upload.schema.json` regenerated (+4 lines) | OK |
| Runtime classification | no new tracked top-level path | `npm test` includes runtime-files test | OK |

## Edge cases not covered by the story
| Case | Expected by a rule? | Recommendation |
|---|---|---|
| Short named `Main` or ` main ` (case or whitespace) | The schema refuses `main`; I did not probe variants. | question: does the refusal normalise case and whitespace? |
| Square 1:1 episode at exactly 3:00 | ADR 0057 boundary | question: is the 3-minute bound inclusive in all places? |
| Old workspace with `x.media: main` explicit | still valid (means the main video) | none |

## Minors (conventions)
- `release.md` grew to 253 lines with very long single-line paragraphs (for example line 247). It is hard for an agent to scan. Consider splitting. This is a writing-for-agents remark only.
- `docs/release-platforms.md` cites findings as bare `F<n>` with one link in the header. A reader has to open the research file to resolve them.

## Verdict
accepted with remarks

Findings: blocker 0, major 0, minor 2, question 2. Merge blockers: 0.
