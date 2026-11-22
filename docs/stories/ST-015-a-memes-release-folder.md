---
id: ST-015
title: A meme's release folder
type: domain
context: BC-Release
aggregate: AGG-ReleasePackage
command: CMD-BuildReleasePackage
ui: false
priority: must
size: null
risk: null
events: [EVT-ReleasePackageBuilt, EVT-ReleaseRulesBroken, EVT-ReleaseCalendarPlanned]
depends_on: [ST-007]
labels: [feature:meme]
status: ready
---

## Story
As a user, I want a meme's release folder to hold exactly what TikTok, YouTube Shorts and Instagram Reels need, so that I upload it, or let the autopilot post it, without leftovers of a music video.

## Context
Q17: one 9:16 video, a 1080x1920 cover, and the texts for TikTok, YouTube Shorts and Instagram Reels; no Shorts,
no song WAV, no canvas, no lyrics, and no announcement – neither announcement images nor an announcement in the
release calendar; a meme is posted, not announced (user, 2026-11-22). A meme goes through the release board and the autopilot like any project
(ADR 0029). Every used library sound that needs a credit gets its credit (the library sound's `credit` field, HS-265) into the platform texts (HS-261).

## Acceptance Criteria

Scenario: The folder holds the meme's video, cover and three platform texts
  Given the meme "office-prank" has a current 9:16 render
  When its release package is built
  Then the release folder holds the 9:16 video, a 1080x1920 cover and the texts for TikTok, YouTube Shorts and Instagram Reels

Scenario: No music-video parts are built
  Given the meme "office-prank" has a current 9:16 render
  When its release package is built
  Then the release folder holds no Shorts, no WAV, no canvas, no lyrics and no announcement images
  And the release calendar plans no announcement for "office-prank"

Scenario: A sound that needs a credit is credited
  Given the meme "office-prank" uses "vine-boom" with the licence "cc-by" and the credit "Boom by Jane Doe (CC BY 4.0)"
  When its release package is built
  Then every platform text carries "Boom by Jane Doe (CC BY 4.0)"

## Out of Scope
- A meme as a Short of another project

## Open Questions
- none
