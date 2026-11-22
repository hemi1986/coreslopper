---
id: ST-004
title: Check the sound library after hand edits
type: domain
context: BC-SoundLibrary
aggregate: AGG-LibrarySound
command: CMD-CheckSoundLibrary
ui: false
priority: should
size: null
risk: null
events: [EVT-SoundLibraryChecked, EVT-LibrarySoundRemeasured]
depends_on: [ST-001]
labels: [feature:meme]
status: ready
---

## Story
As a user who maintains the sound library by hand, I want one check of the whole library, so that I find broken entries before a meme uses them.

## Context
`sound check` reports entries without a file, files or folders without an entry, and a cue or trim outside the
length; a WAV the user swapped (its hash differs from the entry's) is measured again. A file dropped into a new
folder never becomes an entry by itself – that is `sound add` (Q21).

## Acceptance Criteria

Scenario: A swapped file is measured again
  Given the library holds "vine-boom" of 1.4 seconds
  And the user replaced its WAV with one of 2.0 seconds
  When the user checks the sound library
  Then "vine-boom" has the length 2.0 and the new file hash

Scenario: A folder without an entry is reported, not added
  Given the folder "library/sounds/bruh" holds a WAV and no sound.yaml
  When the user checks the sound library
  Then the check reports "bruh" as a file without an entry
  And the library does not list "bruh"

Scenario: A cue that no longer fits is reported
  Given the library holds "vine-boom" with the cue 1.2
  And the user replaced its WAV with one of 1.0 seconds
  When the user checks the sound library
  Then the check reports that the cue of "vine-boom" lies outside its length

Scenario: An entry without its file is reported
  Given the library holds "vine-boom" and its WAV was deleted
  When the user checks the sound library
  Then the check reports "vine-boom" as an entry without a file

## Out of Scope
- Fixing the reported entries automatically

## Open Questions
- none
