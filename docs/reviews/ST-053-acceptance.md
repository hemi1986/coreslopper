# Acceptance – ST-053: A short episode's YouTube post asks for the series playlist
Date: 2026-11-28 · Tests run: `npx vitest run tests/release*.test.ts tests/runtime-files.test.ts` → 242 passed, 0 failed (story file: 5 passed); `npm run typecheck` clean; `npm run schema` leaves no diff · Preview: none

## Scenarios (task checklist)
| Criterion | Test (file) | Really checked? | Result |
|---|---|---|---|
| series.yaml validates with and without `youtube_playlist` | `validates series.yaml with youtube_playlist, and without it` (tests/release-series-playlist.test.ts) | Yes: with, without, empty object; bad URL and empty title rejected | OK |
| Short episode's YouTube post has the checklist line with the title | `gives a short episode's YouTube post the checklist line ...`, `names the playlist after the series' title ... in English too` | Yes: youtube.md text (DE and EN), board checklist item with href, release check PASS; literals used | OK |
| No URL gives TODO "YouTube playlist of the series", never a failure | `gives a short episode the TODO ...` | Yes: todos, errors empty, README TODO line, line without href, check result TODO | OK |
| Music video has no playlist line | `gives a music video's YouTube post no playlist line` | Yes: text and checks | OK |

## Definition of done
| Item | Applies | Evidence | OK? |
|---|---|---|---|
| Schema regenerated | yes | schema/series.schema.json matches `npm run schema` | OK |
| Docs updated | yes | docs/architecture.md, docs/release-platforms.md | OK |
| Texts from catalogs | yes | `meme.playlist` in the EN and DE label catalogs | OK |
| Board link safe | yes | href rendered only for `http(s):`, `rel=noopener` | OK |
| Journal / personal data / lists | no | no command or data change | n/a |

## Edge cases not covered by the story
| Case | Expected by a rule? | Recommendation |
|---|---|---|
| Playlist title with a newline or Markdown characters breaks the checklist line in youtube.md | no | question |
| `url` accepts any scheme (e.g. `ftp:`); the board only links http(s), the text still prints it | no | question |
| TODO text is English-only, also for a German release | consistent with the other README TODOs | question |
| Meme project has no series, so no line | story: short episode only | none |

## Minors (convention check)
- The label sits in the `meme` label group (`l.meme.playlist`), but it serves short episodes. The glossary term is "short episode", so the group name is misleading.
- English line uses straight quotes, the story names ‹title›. Harmless.

Merge blockers: 0.

## Verdict
accepted with remarks
