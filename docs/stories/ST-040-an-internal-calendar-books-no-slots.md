---
id: ST-040
title: An internal project's calendar books no slots
type: domain
context: BC-Release
aggregate: AGG-ReleaseCalendar
command: CMD-PlanReleaseCalendar
ui: false
priority: should
size: null
risk: null
events: [EVT-ReleaseCalendarPlanned]
depends_on: [ST-036]
labels: [feature:internal-projects]
status: done
---

## Story
As a user, I want the calendar of a project that is no longer released publicly to be ignored when other projects
are planned, so that a teaser that never goes out does not push a real release to a later day.

## Context
ST-036 keeps an earlier `review/calendar.yaml` when a project becomes `distribution: internal` (deleting it is the
user's call). Today `otherCalendars` (`packages/cli/src/release-calendar.ts:49-57`) still hands it to every other
project's plan, so its release day and Shorts slots stay booked (`calendar.ts:119-142,186-219`; OPEN_QUESTIONS,
ST-036, option a).

Rule (CMD-PlanReleaseCalendar): the calendar of an internal project books no release day and no slot. It applies
wherever a calendar is planned – `calendar <project>` and `release <project>` share the same planning. The internal
project's own file stays as it is.

## Acceptance Criteria
Scenario: An internal project's release day is free for another release
  Given an internal project "teaser" with an earlier calendar whose release day is "2026-12-04"
  And a public project without a release day whose first free release weekday would be "2026-12-04"
  When the user plans the calendar of the public project
  Then the public project's proposed release day is "2026-12-04"

Scenario: An internal project's Short slots are free for another release
  Given an internal project "teaser" with an earlier calendar that books a Short on "2026-12-11"
  And a public project whose first Short would fall on "2026-12-11"
  When the user plans the calendar of the public project
  Then the public project has a Short on "2026-12-11"

Scenario: A public project's calendar still books its slots
  Given a public project "other" with a calendar whose release day is "2026-12-04"
  And a public project without a release day whose first free release weekday would be "2026-12-04"
  When the user plans the calendar of the second project
  Then the second project's proposed release day is not "2026-12-04"

## Out of Scope
- Deleting or archiving the earlier calendar of an internal project
- The board's calendar of all projects, its `.ics` export and `boardProjectDirs`, which still serve an internal project's earlier calendar (OPEN_QUESTIONS, ST-040)
- The autopilot (ST-041) and the approval (ST-042)

## Open Questions
- none
