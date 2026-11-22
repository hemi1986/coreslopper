---
id: ST-011
title: The voice track takes library sounds into a meme
type: domain
context: BC-ScriptedAudio
aggregate: AGG-TakeRegistry
command: CMD-GenerateTakes
ui: false
priority: must
size: null
risk: null
events: [EVT-TakeGenerated, EVT-AmbienceGenerated, EVT-VoiceTrackStopped, EVT-LibrarySoundTaken]
depends_on: [ST-009]
labels: [feature:meme]
status: in-progress
---

## Story
As a stage runner, I want the voice track to copy each chosen library sound into the meme as a take, so that the meme sounds exactly like the sound the user picked and stays intact when the library changes later.

## Context
POL-TakeChosenLibrarySounds: a sound line with `sound: <id>` gets its take by copy, never by generation, and costs
nothing. The take is the trimmed library sound in `audio/lines/<line-id>.wav`, registered with the source
`library:<id>` and the hashes of the file and of the trim (Q14).

Invariants (AGG-TakeRegistry) the command can violate: every audible line has one take; a take is current while its
file is the registered one and what it was made from is unchanged; an imported take is never generated over.
A changed library sound (file, trim) makes its take stale and it is copied again; a removed one only warns and the
take stays current (HS-260).

## Acceptance Criteria

Scenario: A library sound becomes a take without cost
  Given the library holds "vine-boom" with the trim 0.0-1.0
  And the meme "office-prank" has the sound line "reveal-boom" naming "vine-boom"
  When the voice track runs
  Then "reveal-boom" has a take of 1.0 seconds with the source "library:vine-boom"
  And no generation is billed for it

Scenario: A changed trim takes the sound again
  Given "reveal-boom" has a current take of "vine-boom" with the trim 0.0-1.0
  And the user changed the trim of "vine-boom" to 0.0-0.8
  When the voice track runs
  Then "reveal-boom" has a take of 0.8 seconds

Scenario: A removed library sound keeps the take and warns
  Given "reveal-boom" has a current take of "vine-boom"
  And the user removed "vine-boom" from the library
  When the voice track runs
  Then "reveal-boom" keeps its take and the run warns that "vine-boom" is no longer in the library

Scenario: A line naming a sound that never was taken and is gone stops the voice track
  Given the meme "office-prank" has the sound line "reveal-boom" naming "vine-boom" without a take
  And the library does not hold "vine-boom"
  When the voice track runs
  Then the voice track stops because "reveal-boom" names a sound that is not in the library

## Out of Scope
- Levelling library sounds in the file (the mix balances them)

## Open Questions
- none
