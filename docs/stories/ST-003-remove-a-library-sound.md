---
id: ST-003
title: Remove a library sound
type: domain
context: BC-SoundLibrary
aggregate: AGG-LibrarySound
command: CMD-RemoveLibrarySound
ui: false
priority: should
size: null
risk: null
events: [EVT-LibrarySoundRemoved]
depends_on: [ST-001]
labels: [feature:meme]
status: in-progress
---

## Story
As a user, I want to remove a sound from the sound library, so that the meme skill no longer proposes it.

## Context
`sound remove <id>` deletes the entry and its file. Memes that took the sound keep their takes (HS-260): the take
stays current and `voice-track` only warns that its library sound is gone (ST-011).

## Acceptance Criteria

Scenario: A removed sound leaves the library
  Given the library holds "vine-boom" and "sad-trombone"
  When the user removes "vine-boom"
  Then the library lists only "sad-trombone"
  And the folder "library/sounds/vine-boom" no longer exists

Scenario: A meme keeps the take of a removed sound
  Given the meme "office-prank" has a take copied from "vine-boom"
  When the user removes "vine-boom"
  Then the take of "office-prank" still exists and is current

Scenario: An unknown sound is refused
  Given the library does not hold "vine-boom"
  When the user removes "vine-boom"
  Then the removal is refused because there is no library sound "vine-boom"

## Out of Scope
- Removing the takes of memes that used the sound

## Open Questions
- none
