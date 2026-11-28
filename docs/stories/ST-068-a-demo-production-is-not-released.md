---
id: ST-068
title: A demo production is not released
type: domain
context: BC-Release
aggregate: AGG-ReleaseStatus
command: CMD-ApproveRelease
ui: false
priority: should
size: null
risk: null
events: [EVT-ReleaseDayFixed, EVT-ReleaseCalendarPlanned, EVT-ReleaseApproved, EVT-ApprovalRefused]
depends_on: [ST-067]
labels: [feature:demo-projects]
feature: demo-projects
status: ready
---

## Story
As a user with real projects, I want the shipped demos to stay out of every release, so that a demo never takes a
release day from my song and never posts anything.

## Context
Feature `demo-projects`, decided by the user on 2026-11-28 (flow `FLOW-DemoProductions`, glossary **Demo
Production**). A demo is not released, as an internal project is not (ST-040–ST-042), but unlike an internal
project its **Release Package** and its own calendar are still built, so `release` and `npm run demo` keep working
and the demo shows what a package looks like.

Rules – one predicate, "released publicly" = public and not a demo, used where `distribution: internal` is checked
today:
- CMD-ApproveRelease: a demo is never approved; the approval is refused before anything is written
  (`packages/cli/src/release-autopilot.ts:70-92`).
- CMD-PlanReleaseCalendar: a demo's calendar books no release day and no slot for another project's plan
  (`otherCalendars`, `packages/cli/src/release-calendar.ts:49-57`); its own calendar is still planned by `release`.
- CMD-RunAutopilotRound: a round leaves a demo alone and says so in one line; `release-run --plan` lists no event
  of it (`release-autopilot.ts:196-288,534-555`).

This story touches three commands' rules through one predicate; the user agreed to keep it one story
(2026-11-28). The board's calendar is ST-069.

## Acceptance Criteria
Scenario: A demo cannot be approved
  Given a demo production "demo" with a calendar for its release day "2026-12-04"
  When the user approves the release of "demo"
  Then the approval is refused with "demo production"
  And the project's project.yaml and release status are unchanged

Scenario: A demo's release day is free for another release
  Given a demo production "demo" with a calendar whose release day is "2026-12-04"
  And a public project without a release day whose first free release weekday would be "2026-12-04"
  When the user plans the calendar of the public project
  Then the public project's proposed release day is "2026-12-04"

Scenario: The autopilot leaves a demo alone
  Given a demo production "demo" with a calendar, an approval of its release day, and an event that is due
  When the autopilot runs a round
  Then the project's autopilot log has no entry
  And the round's output says "demo production"
  And the autopilot plan lists no event of "demo"

Scenario: A public project is still approved and posted
  Given a public project with a calendar that proposes the release day "2026-12-04"
  When the user approves the release
  Then the release is approved for "2026-12-04"

## Out of Scope
- The release package of a demo: it is built as before
- The board's calendar and `/calendar.ics` (ST-069)
- Deleting a demo's calendar or release status

## Open Questions
- none
