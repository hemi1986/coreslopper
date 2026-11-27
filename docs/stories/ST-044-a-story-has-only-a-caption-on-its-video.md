---
id: ST-044
title: A story carries no text, only an optional caption of at most 120 characters on its video
type: domain
context: BC-Release
aggregate: AGG-ReleasePackage
command: CMD-BuildReleasePackage
ui: true
priority: must
size: null
risk: null
events: [EVT-ReleasePackageBuilt, EVT-ReleaseRulesBroken, EVT-ReleaseCalendarPlanned]
depends_on: []
labels: [feature:platform-formats]
feature: platform-formats
sources: [docs/research/platform-video-formats.md]
status: in-progress
---

## Story
As a user, I want the release board to offer a story only the text Instagram lets me add, so that I don't write or
paste a story text that has nowhere to go.

## Context
Instagram stories have no text field; no primary source names a limit for text added to a story (F7 in
`docs/research/platform-video-formats.md`). In the app, a caption ("Bildunterschrift") added to a story's video takes
at most 120 characters (user, 2026-11-27, HS-267).

- `shorts[].instagram.story` and the announcement's story text become the **caption** of a story that shows a video:
  the release-day story with the first Short, and the announcement story with the teaser.
- The caption is optional; a missing caption is no TODO (`shorts.<name>.instagram.story` leaves `missing`).
- A story that shows only an image has no caption, also when the upload data has one.
- The limit is `PLATFORM_LIMITS.instagram.story_caption = 120` characters, overridable in `config/channel.yaml`
  like every limit; over it is a broken rule (`EVT-ReleaseRulesBroken`), like every other limit.
- An older `upload.yaml` with a story text stays valid.
- On the board the field is "Bildunterschrift" / "Caption", with the live counter of the other limited fields.

Rules from `CMD-WriteUploadData` and `CMD-BuildReleasePackage`; the invariants of `AGG-ReleasePackage` (a TODO
never fails, a broken limit is an error).

## Acceptance Criteria
Scenario: A story with a video carries its caption
  Given an episode whose first Short has the story text "Neue Folge – jetzt auf YouTube"
  When the user runs release for the project
  Then the release plan's post "story" has the caption "Neue Folge – jetzt auf YouTube" with the limit 120

Scenario: A story without a caption is complete
  Given a music video whose Shorts have no story text
  When the user runs release for the project
  Then the release plan's missing texts do not contain "shorts.Z1-intro.instagram.story"

Scenario: A caption over 120 characters breaks a rule
  Given a music video whose first Short has a story text of 121 characters
  When the user runs release for the project
  Then the run fails with "story: caption has 121 characters, limit 120"

Scenario: A story with only an image has no caption
  Given a music video whose release-day story shows the story image and no video, and whose first Short has a story text
  When the user runs release for the project
  Then the release plan's post "story" has no caption

## Out of Scope
- Text burned into a story image (the composed story image carries its own words)
- Story stickers other than the link sticker

## Open Questions
- none
