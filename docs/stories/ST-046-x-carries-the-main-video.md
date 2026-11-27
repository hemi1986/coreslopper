---
id: ST-046
title: The X post carries the main video by default
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
status: ready
---

## Story
As a user, I want the X post to carry the whole main video, so that people on X see the release itself, not only an
excerpt and a link.

## Context
X takes a whole video: 140 s for free accounts in the app and on the web, up to 4 h with Premium (F9), and 16:9 and
9:16 alike (F10 in `docs/research/platform-video-formats.md`). Decided by the user on 2026-11-27 (Q4).

- `x.media` may be `main` and is `main` when not set; a Short's name stays allowed.
- `x.reply` becomes optional. Without it the post has no reply text and nothing is missing; the post no longer waits
  for the YouTube URL (`needsYoutube`) when it has no reply.
- Over 140 s the board's X post shows the note "Über 140 s nur mit X Premium" / "Over 140 s only with X Premium".
- A Short's own X post (`shorts[].x`) is unchanged.

## Acceptance Criteria
Scenario: The X post takes the main video when no media is named
  Given a music video whose X post names no media
  When the user runs release for the project
  Then the release plan's post "x" carries the video "video/<slug>-16x9.mp4"

Scenario: A named Short stays the X post's video
  Given a music video whose X post names the media "Z2-chorus"
  When the user runs release for the project
  Then the release plan's post "x" carries the video "shorts/Z2-chorus-9x16.mp4"

Scenario: An X post without a reply is complete
  Given a music video whose X post has no reply
  When the user runs release for the project
  Then the release plan's post "x" has no reply
  And the release plan's missing texts do not contain "x"

Scenario: A main video over 140 seconds notes X Premium
  Given a music video of 200 seconds whose X post carries the main video
  When the user opens the project on the release board
  Then the X post shows the note "Over 140 s only with X Premium"

## Out of Scope
- Checking whether the user's X account has Premium
- The autopilot's X adapter limits (publish slice)

## Open Questions
- none
