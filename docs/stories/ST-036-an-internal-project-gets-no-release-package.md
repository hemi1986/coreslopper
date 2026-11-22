---
id: ST-036
title: An internal project gets no release package
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
labels: [feature:internal-projects]
status: ready-for-human-review
---

## Story
As a user, I want a project that is never released publicly (an internal teaser sent by mail or Teams) to get no
release package, so that it plans no calendar slots that collide with real releases and writes no platform texts
nobody posts.

## Context
Trigger: the workspace's `projects/nerd-cafe-teaser`, an episode that passed QA without a release package. Running
the board's suggested `/video-next` would reset `qa-export` and build YouTube and TikTok texts plus calendar slots.

`project.yaml` gets `distribution: public | internal` (default `public`). The name avoids `release:`, which already
holds the distributor facts (`ReleaseMetadataSchema`). The decision is the user's (2026-11-22): `distribution:
internal`, finished after QA, without an extra "mark as distributed" step.

`release <project>` on an internal project builds nothing and plans nothing: no `renders/release/`, no
`review/calendar.yaml`. It says so in one line and exits 0, so `qa-export` stays green. A release folder or calendar
from before the project became internal is left as it is; deleting it is the user's call.

The rest of the feature (the `new` and wizard option, QA without release checks, the board's finished state) is
ST-037.

## Acceptance Criteria
Scenario: An internal project builds no release folder
  Given a project with "distribution: internal" whose renders are current
  When the user runs release for the project
  Then the project has no folder "renders/release"
  And the output says "not released publicly"

Scenario: An internal project plans no release calendar
  Given a project with "distribution: internal" and another project with a planned release calendar
  When the user runs release for the internal project
  Then the internal project has no file "review/calendar.yaml"
  And the other project's calendar is unchanged

Scenario: A project without distribution is released publicly
  Given a project whose project.yaml has no field "distribution"
  When the user runs release for the project
  Then the project has the file "renders/release/manifest.json"

## Out of Scope
- A "mark as distributed" action on the board and a record of where an internal video went
- Deleting an existing release folder when a project becomes internal

## Open Questions
- none
