---
id: ST-041
title: The autopilot leaves an internal project alone
type: domain
context: BC-Publish
aggregate: AGG-AutopilotRound
command: CMD-RunAutopilotRound
ui: false
priority: should
size: null
risk: null
events: [EVT-AutopilotRoundRun]
depends_on: [ST-036]
labels: [feature:internal-projects]
status: in-progress
---

## Story
As a user, I want the release autopilot to post nothing of a project that is no longer released publicly, so that
a teaser I approved before I made it internal never goes out on a platform.

## Context
ST-036 keeps an earlier calendar and release status when a project becomes `distribution: internal`. Today
`runAutopilot` (`packages/cli/src/release-autopilot.ts:196-288`) goes through every project with a calendar, and
an approval that still holds for the calendar's release day posts its due events; `release-run --plan` lists them
(OPEN_QUESTIONS, ST-036, option a).

Rule (CMD-RunAutopilotRound): a round leaves an internal project alone and says so in one line; its plan lists no
event of it. The release status, the autopilot log and the earlier files stay as they are.

## Acceptance Criteria
Scenario: An approved internal project posts nothing
  Given an internal project with an earlier calendar, an approval of its release day, and an event that is due
  When the autopilot runs a round
  Then the project's autopilot log has no entry
  And the round's output says "not released publicly"

Scenario: The plan lists no event of an internal project
  Given an internal project with an earlier calendar
  When the user prints the autopilot plan
  Then the plan lists no event of the internal project

Scenario: An approved public project still posts
  Given a public project with a calendar, an approval of its release day, and an event that is due
  When the autopilot runs a round
  Then the project's autopilot log has an entry for the due event

## Out of Scope
- Withdrawing the earlier approval or deleting the earlier status
- Anything already posted or uploaded before the project became internal

## Open Questions
- none
