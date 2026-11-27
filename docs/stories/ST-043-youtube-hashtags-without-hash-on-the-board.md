---
id: ST-043
title: The board lists YouTube hashtags comma-separated without "#"
type: chore
ui: true
priority: must
size: null
risk: null
depends_on: []
labels: [feature:platform-formats]
feature: platform-formats
sources: [docs/research/platform-video-formats.md]
status: in-progress
---

## Task
The release board's field "Hashtags, kommagetrennt" / "Hashtags, comma-separated" shows `#tag1, #tag2` today, on
the main video's YouTube post and on every Short's YouTube post (`release-board-data.ts`, the plan's `hashtags`
text in `packages/core/src/release-plan.ts`). The user pastes it as a list, so it shows `tag1, tag2`: comma-separated,
without the leading `#`.

The description keeps its hashtags with `#`, because YouTube reads them there (F16 in
`docs/research/platform-video-formats.md`). `review/upload.yaml` keeps `#` in its hashtag lists; only the field
changes. Decided by the user on 2026-11-27 (feature `platform-formats`, Q1).

## Acceptance Criteria
- [x] The main video's YouTube post shows the hashtags `#a`, `#b` of the upload data as `a, b` (test)
- [x] Each Short's YouTube post shows its hashtags the same way (test)
- [x] The YouTube descriptions still end with `#a #b` (test)
- [x] `texts/youtube.md` lists the hashtags in the same form as the board
