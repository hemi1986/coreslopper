---
id: ST-051
title: The release shape is kept once the release has started
type: domain
context: BC-Release
aggregate: AGG-ReleasePackage
command: CMD-BuildReleasePackage
ui: false
priority: must
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
As a user, I want a release that has started to keep its shape, so that a new cut never removes files from the folder
that posts already went out with.

## Context
The shape follows the episode's length, and a cut can move an episode across 180 s. Decided by the user on 2026-11-27
(HS-268, Q13).

- Until the release status holds a done mark or a live URL, the shape follows the project.
- After that, a run whose shape differs from the manifest's fails before it writes anything: no file in the folder,
  the manifest and the calendar change. The message names both shapes and the first done mark or live URL.
- A run with the same shape builds as usual.
- The release status is read under its lock (`AGG-ReleaseStatus`); `release` never writes it.

## Acceptance Criteria
Scenario: Before the first post the shape follows the episode
  Given a short episode whose manifest has the shape "short-episode", no done mark and no live URL, and whose track now lasts 190 seconds
  When the user runs release for the project
  Then the release manifest has the shape "episode"

Scenario: A done mark keeps the shape
  Given a short episode whose manifest has the shape "short-episode", the done mark "youtube", and whose track now lasts 190 seconds
  When the user runs release for the project
  Then the run fails with "the release started as short-episode"
  And the release folder and its manifest are unchanged

Scenario: A live URL keeps the shape
  Given a short episode whose manifest has the shape "short-episode", a live URL for "tiktok" and no done mark, and whose track now lasts 190 seconds
  When the user runs release for the project
  Then the run fails with "the release started as short-episode"

Scenario: The same shape builds after the first post
  Given a short episode whose manifest has the shape "short-episode" and the done mark "youtube", and whose track lasts 170 seconds
  When the user runs release for the project
  Then the run succeeds and the release manifest has the shape "short-episode"

## Out of Scope
- A way to force a new shape after the release started (the user removes the done marks first)

## Open Questions
- none
