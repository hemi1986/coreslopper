---
id: ST-049
title: A horizontal episode of up to 3 minutes posts its vertical version as its one Short
type: domain
context: BC-Release
aggregate: AGG-ReleasePackage
command: CMD-BuildReleasePackage
ui: true
priority: should
size: null
risk: null
events: [EVT-ReleasePackageBuilt, EVT-ReleaseRulesBroken, EVT-ReleaseCalendarPlanned]
depends_on: [ST-047]
labels: [feature:platform-formats]
feature: platform-formats
sources: [docs/research/platform-video-formats.md]
status: ready
---

## Story
As a user, I want a horizontal episode of up to 3 minutes to go to the vertical platforms as one 9:16 version of the
whole episode, so that I don't cut three Shorts out of an episode that is already short.

## Context
YouTube publishes a 16:9 video as long-form even at under 3 minutes (F12 in
`docs/research/platform-video-formats.md`), so the episode keeps its main video. Decided by the user on 2026-11-27
(HS-266, Q10).

- The **Vertical Version** (`docs/glossary.md`) is the 9:16 render of the whole episode, rendered when missing or
  stale like every format, and placed as `shorts/<slug>-9x16.mp4` with its 1080x1920 thumbnail and TikTok cover.
- It is the episode's one Short: its YouTube Shorts, TikTok, Reel and X posts. Shorts cut from the episode are not
  placed in the folder.
- "Up to 3 minutes" is one core rule with a tolerance of 0.05 s – the one `publish` already uses for a Short – shared
  by this path, the release shape (`SHORT_EPISODE_MAX_SECONDS`), the main video's Reel (`MAIN_REEL_MAX_SECONDS`) and
  `publish`, so a track that reads "3:00" (180.02 s) is treated alike everywhere (marathon 2026-11-27-2 reviews,
  decided by recommendation).
- The main video keeps its three 16:9 thumbnails and its posts.
- The upload data's one Short entry carries the vertical version's texts.

## Acceptance Criteria
Scenario: The vertical version is the one Short
  Given a horizontal episode of 150 seconds
  When the user runs release for the project
  Then the release folder's only Short is "shorts/<slug>-9x16.mp4" and it lasts 150 seconds

Scenario: Cut Shorts stay out of the folder
  Given a horizontal episode of 150 seconds with two Shorts in "renders/shorts"
  When the user runs release for the project
  Then the release folder has no Short other than "shorts/<slug>-9x16.mp4"

Scenario: The main video keeps its three thumbnails
  Given a horizontal episode of 150 seconds with three thumbnails
  When the user runs release for the project
  Then the release plan's post "youtube" carries three thumbnails

Scenario: A horizontal episode over 3 minutes keeps its cut Shorts
  Given a horizontal episode of 200 seconds with two Shorts in "renders/shorts"
  When the user runs release for the project
  Then the release folder has both Shorts

## Out of Scope
- A Short over 60 s cut by the `short` command (the vertical version is a render, not a cut)

## Open Questions
- none
