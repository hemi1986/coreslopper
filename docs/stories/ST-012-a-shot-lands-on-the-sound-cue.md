---
id: ST-012
title: A shot lands on a sound's cue
type: domain
context: BC-Storyboard
aggregate: AGG-Storyboard
command: CMD-ValidateStoryboard
ui: false
priority: should
size: null
risk: null
events: [EVT-StoryboardValidated]
depends_on: [ST-011]
labels: [feature:meme]
status: in-progress
---

## Story
As a stage runner, I want to anchor a cut on the hit of a library sound, so that the punch of a meme lands on the frame.

## Context
A line anchor may name the cue of a sound line with a library sound, `line:<id>:cue`, resolved to the line's start
plus the sound cue (relative to the trim's start); offsets work as on every other anchor (ADR 0005). A cue anchor on
a line without a library sound, or on a sound without a cue, is refused. A meme has exactly one format, 9:16, and its
track lasts at most 30 seconds (CMD-ValidateStoryboard rules).

## Acceptance Criteria

Scenario: A cue anchor resolves to the hit
  Given the sound line "reveal-boom" starts at 6.0 seconds and names "vine-boom" with the cue 0.12
  When a shot of the meme starts at "line:reveal-boom:cue"
  Then the shot starts at 6.12 seconds

Scenario: A cue anchor on a spoken line is refused
  Given the line "punchline" is dialogue
  When a shot of the meme starts at "line:punchline:cue"
  Then the validation fails because "punchline" has no sound cue

Scenario: A sound without a cue is refused
  Given the sound line "reveal-boom" names "vine-boom" without a cue
  When a shot of the meme starts at "line:reveal-boom:cue"
  Then the validation fails because "vine-boom" has no cue

Scenario: A meme with a second format is refused
  Given the meme "office-prank" lists the formats 9x16 and 16x9
  When its storyboard is validated
  Then the validation fails because a meme has only the format 9x16

## Out of Scope
- Placing a sound so that its cue lands on a line's end (`at_cue`, dropped in grilling)

## Open Questions
- none
