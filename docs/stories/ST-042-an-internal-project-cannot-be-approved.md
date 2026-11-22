---
id: ST-042
title: An internal project cannot be approved
type: domain
context: BC-Release
aggregate: AGG-ReleaseStatus
command: CMD-ApproveRelease
ui: false
priority: should
size: null
risk: null
events: [EVT-ReleaseDayFixed, EVT-ReleaseCalendarPlanned, EVT-ReleaseApproved, EVT-ApprovalRefused]
depends_on: [ST-036]
labels: [feature:internal-projects]
status: ready
---

## Story
As a user, I want an approval of a project that is not released publicly to be refused before anything changes,
so that its project file is never half written and the autopilot never gets an approval for it.

## Context
Today `approveRelease` (`packages/cli/src/release-autopilot.ts:66-82`) needs only a calendar. With a proposed day it
first writes `release.release_date` into `project.yaml`, then plans the calendar again; since ST-036 that planning
refuses an internal project, so the approval stops with `project.yaml` already changed (OPEN_QUESTIONS, ST-036,
option a).

Rule (CMD-ApproveRelease): an internal project is never approved; the refusal comes first, so `project.yaml`, the
calendar and the release status stay as they are. It holds for the board's Approve release and `release-approve`
alike (one function).

## Acceptance Criteria
Scenario: An internal project with a proposed day is refused
  Given an internal project with an earlier calendar that proposes the release day "2026-12-04"
  When the user approves the release
  Then the approval is refused with "not released publicly"
  And the project's project.yaml has no release day
  And the project's release status has no approval

Scenario: An internal project with a fixed day is refused
  Given an internal project with an earlier calendar for its release day "2026-12-04"
  When the user approves the release
  Then the approval is refused with "not released publicly"
  And the project's release status has no approval

Scenario: A public project is still approved
  Given a public project with a calendar that proposes the release day "2026-12-04"
  When the user approves the release
  Then the project's release status has an approval for "2026-12-04"
  And the project's project.yaml has the release day "2026-12-04"

## Out of Scope
- Hiding or disabling the board's Approve release button for an internal project (ST-037 gives it no release tab)
- Withdrawing an approval given before the project became internal

## Open Questions
- none
