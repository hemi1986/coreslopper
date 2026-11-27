---
id: ST-053
title: A short episode's YouTube post asks for the series playlist
type: task
ui: true
priority: should
size: null
risk: null
depends_on: [ST-048]
labels: [feature:platform-formats]
feature: platform-formats
sources: [docs/research/platform-video-formats.md]
status: ready
---

## Task
A series of short episodes lives in one YouTube playlist. YouTube can turn a playlist of only Shorts into a show, but
a show needs 16:9 artwork and a Shorts-only playlist cannot be reordered (F13 in
`docs/research/platform-video-formats.md`); the user keeps a plain playlist (2026-11-27, Q7).

- `series.yaml` gets an optional `youtube_playlist: { title, url }` (`SeriesSchema`; `npm run schema`). Without a
  title the playlist is named after the series' title.
- A short episode's YouTube post gets the checklist line "In die Playlist ‹title› aufnehmen" / "Add to the playlist
  ‹title›", linking the URL when there is one.
- A missing URL is a TODO in `README.md` and the release checks ("YouTube playlist of the series"), never a failure.
- The show feature and its artwork are out of scope.

## Acceptance Criteria
- [ ] `series.yaml` with `youtube_playlist` validates; without it as well (test)
- [ ] A short episode's YouTube post has the checklist line with the playlist title (test)
- [ ] A series without a playlist URL gives the short episode the TODO "YouTube playlist of the series" (test)
- [ ] A music video's YouTube post has no playlist line
