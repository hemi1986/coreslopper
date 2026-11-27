---
id: ST-048
title: A short episode is released as one video on every platform
type: domain
context: BC-Release
aggregate: AGG-ReleasePackage
command: CMD-BuildReleasePackage
ui: true
priority: must
size: null
risk: null
events: [EVT-ReleasePackageBuilt, EVT-ReleaseRulesBroken, EVT-ReleaseCalendarPlanned]
depends_on: [ST-047]
labels: [feature:platform-formats]
feature: platform-formats
sources: [docs/research/platform-video-formats.md]
status: in-progress
---

## Story
As a user, I want a short episode released as its one video on YouTube Shorts, TikTok, Instagram, X and the
microsite, so that I don't get a main video, 16:9 thumbnails and Shorts that a two-minute vertical episode has no use for.

## Context
Decided by the user on 2026-11-27 (HS-266, Q6, Q8, Q11); it follows the meme's one-video release (ADR 0051).

- **Folder**: `video/<slug>-<master>.mp4`, one 1080x1920 cover (`cover/<slug>-1080x1920.jpg`), one 1080x1440 TikTok
  cover, the subtitles, the microsite data, `texts/`, `README.md`, `manifest.json`. No `thumbnails/`, no
  `shorts/`, no streaming cover, no feed image.
- **Posts on the release day**: `youtube` (a Short: title, description with hashtags, hashtags), `tiktok`,
  `instagram` (Reel), `x` (the whole video), `microsite`. No story, community post, pinned comment or LinkedIn.
- **Texts per platform**: the upload data's `main` is the YouTube Shorts text, plus its own `tiktok`, `instagram`
  and `x` blocks; an identical TikTok and Reel caption is an error, as for a Short today. A missing platform text is
  a TODO under `missing`.
- **Announcement**: optional, as today; its 10 s teaser is cut from the episode's master, and its images are
  vertical.
- The upload data's `shorts` entries are ignored for a short episode.

## Acceptance Criteria
Scenario: A short episode's folder holds one video and its covers
  Given a short episode with its cover and TikTok cover composed
  When the user runs release for the project
  Then the release folder has the video "video/<slug>-9x16.mp4", the cover "cover/<slug>-1080x1920.jpg" and a TikTok cover
  And the release folder has no folder "thumbnails" and no folder "shorts"

Scenario: A short episode is planned on five platforms on the release day
  Given a short episode with texts for YouTube, TikTok, Instagram, X and the microsite and no announcement
  When the user runs release for the project
  Then the release calendar has the events "youtube", "tiktok", "instagram", "x" and "microsite" on the release day
  And the release calendar has no event "story" and no event "linkedin"

Scenario: A short episode's teaser is cut from its master
  Given a short episode with an announcement
  When the user runs release for the project
  Then the announcement teaser is cut from the episode's 9:16 master

Scenario: A missing TikTok text is a TODO
  Given a short episode whose upload data has no TikTok text
  When the user runs release for the project
  Then the release plan's missing texts contain "tiktok"
  And the run does not fail

## Out of Scope
- The series playlist (ST-053)
- The board's view of the shape (ST-052)
- QA's expected assets (ST-050)

## Open Questions
- none
