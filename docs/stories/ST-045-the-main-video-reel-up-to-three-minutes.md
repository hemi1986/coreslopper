---
id: ST-045
title: The main video goes to Instagram as a Reel only up to 3 minutes
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
As a user, I want the main video on Instagram only as a Reel and only when it is at most 3 minutes long, so that the
board never asks me for a feed post Instagram does not have.

## Context
Instagram shares every new video as a Reel, and its API has no plain feed video (F1, F8 in
`docs/research/platform-video-formats.md`). The user does not share videos over 3 minutes on Instagram; the Reels of
the Shorts carry the reach (user, 2026-11-27).

- The post `instagram-post` becomes the main video's Reel: heading "Reel: Hauptvideo" / "Reel: main video", calendar
  step `reel`. Its video is the best vertical render there is: `9x16`, then `4x5`, then `1x1`, then the master.
- It exists only when the main video lasts at most 180 seconds; 180 s still counts.
- The image post that stood in for a missing feed video (`feedImage`, the cover crop) is gone: `release` no longer
  composes the 4:5 feed image.
- The upload data keeps the key `instagram_post`, so older projects stay valid; over 180 s it is not asked for (no
  TODO).

## Acceptance Criteria
Scenario: A main video of 2:30 gets its Reel
  Given an episode of 150 seconds with a 9:16 render and an Instagram post text
  When the user runs release for the project
  Then the release plan has the post "instagram-post" with the video "video/<slug>-9x16.mp4"
  And the release calendar has the event "instagram-post" with the step "reel"

Scenario: A main video of exactly 3 minutes still gets its Reel
  Given a music video of 180 seconds with an Instagram post text
  When the user runs release for the project
  Then the release plan has the post "instagram-post"

Scenario: A main video over 3 minutes gets no Instagram post
  Given a music video of 181 seconds without an Instagram post text
  When the user runs release for the project
  Then the release plan has no post "instagram-post"
  And the release plan's missing texts do not contain "instagram_post"

Scenario: There is no image post in place of the Reel
  Given a music video of 150 seconds with only the 16:9 master and an Instagram post text
  When the user runs release for the project
  Then the post "instagram-post" carries the video "video/<slug>-16x9.mp4"
  And the release folder has no feed image

## Out of Scope
- Instagram carousels
- Trial Reels

## Open Questions
- none
