---
id: ST-047
title: The release package records whether an episode is a short episode
type: domain
context: BC-Release
aggregate: AGG-ReleasePackage
command: CMD-BuildReleasePackage
ui: false
priority: must
size: null
risk: null
events: [EVT-ReleasePackageBuilt, EVT-ReleaseRulesBroken, EVT-ReleaseCalendarPlanned]
depends_on: []
labels: [feature:platform-formats]
feature: platform-formats
sources: [docs/research/platform-video-formats.md]
status: done
---

## Story
As a user, I want the release to tell from the episode itself whether it is a short episode, so that a vertical
episode of up to 3 minutes is released the way YouTube treats it, without a setting I could forget.

## Context
YouTube counts only a square or vertical video of at most 3 minutes as a Short; a 16:9 video stays long-form (F12 in
`docs/research/platform-video-formats.md`). Decided by the user on 2026-11-27 (HS-266, Q5, Q14).

- The **Release Shape** (`docs/glossary.md`) is `music-video`, `meme`, `episode` or `short-episode`, recorded in
  `manifest.json` as `shape`. A manifest without it reads as its project kind.
- An episode is a **Short Episode** when its master is at least as tall as wide (9:16, 4:5, 1:1) and its episode
  track lasts at most 180 seconds; 180 s still counts. The length is the built episode track's.
- Nothing in `series.yaml` or `project.yaml` sets it.
- What a short episode's folder holds is ST-048; this story only derives and records the shape.

## Acceptance Criteria
Scenario: A vertical episode of 170 seconds is a short episode
  Given an episode with the master format 9:16 and an episode track of 170 seconds
  When the user runs release for the project
  Then the release manifest has the shape "short-episode"

Scenario: A 4:5 episode of exactly 180 seconds is a short episode
  Given an episode with the master format 4:5 and an episode track of 180 seconds
  When the user runs release for the project
  Then the release manifest has the shape "short-episode"

Scenario: A vertical episode of 181 seconds is an episode
  Given an episode with the master format 9:16 and an episode track of 181 seconds
  When the user runs release for the project
  Then the release manifest has the shape "episode"

Scenario: A horizontal episode of 120 seconds is an episode
  Given an episode with the master format 16:9 and an episode track of 120 seconds
  When the user runs release for the project
  Then the release manifest has the shape "episode"

## Out of Scope
- A series setting that forces short episodes
- Music videos and memes (their shape is their kind)

## Open Questions
- none
