---
id: ST-002
title: Edit a library sound's description
type: domain
context: BC-SoundLibrary
aggregate: AGG-LibrarySound
command: CMD-UpdateLibrarySound
ui: false
priority: must
size: null
risk: null
events: [EVT-LibrarySoundUpdated]
depends_on: [ST-001]
labels: [feature:meme]
status: in-progress
---

## Story
As a user, I want to correct what a library sound is used for, its tags, cue and trim, so that the meme skill keeps picking the right sound.

## Context
`sound edit <id> [--title] [--use-when] [--tags] [--cue] [--trim] [--source] [--licence] [--credit]` changes only the metadata,
never the file. Hand edits of `sound.yaml` are validated by the hook (ST-005).

Invariants (AGG-LibrarySound): title and use when are never empty; a cue and a trim lie inside the length, a cue
inside the trim; length and loudness are measured, never typed.

The cue counts from the trim's start; a trim changed without a new cue keeps the moment the sound lands in the
file, and an edit that would put that moment before the trim is refused (user, 2026-11-22, code review of ST-002).

A changed trim or cue makes the takes copied from the sound stale (POL-TakeChosenLibrarySounds, ST-011).

## Acceptance Criteria

Scenario: The use when and the tags are changed
  Given the library holds "vine-boom" with use when "a dramatic reveal"
  When the user edits "vine-boom" with use when "a shocking twist" and the tags "reveal,shock"
  Then "vine-boom" has use when "a shocking twist" and the tags "reveal" and "shock"
  And its file is unchanged

Scenario: An empty use when is refused
  Given the library holds "vine-boom"
  When the user edits "vine-boom" with an empty use when
  Then the edit is refused because a library sound needs a use when
  And "vine-boom" keeps use when "a dramatic reveal"

Scenario: A cue outside the trim is refused
  Given the library holds "vine-boom" of 1.4 seconds with the trim 0.0-1.0
  When the user edits "vine-boom" with the cue 1.2
  Then the edit is refused because the cue lies outside the trim

Scenario: The length cannot be typed
  Given the library holds "vine-boom" of 1.4 seconds
  When the user edits "vine-boom" with the length 3
  Then the edit is refused because the length is measured from the file

## Out of Scope
- Replacing the audio file (remove and add again, or swap it and run `sound check`)

## Open Questions
- none
