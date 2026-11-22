---
id: ST-005
title: Validate a hand-edited sound entry
type: domain
context: BC-SoundLibrary
aggregate: AGG-LibrarySound
command: CMD-ValidateLibrarySound
ui: false
priority: must
size: null
risk: null
events: [EVT-LibrarySoundUpdated, EVT-LibrarySoundRefused]
depends_on: [ST-001]
labels: [feature:meme]
status: ready
---

## Story
As a user, I want my own edits of a sound.yaml checked the moment I save them, so that a typo never reaches a meme.

## Context
The workspace hook runs `validate-file` on every edit of `library/sounds/<id>/sound.yaml`
(POL-ValidateEverySoundEntryEdit) and blocks a failing edit, as it does for `character.yaml`.

Invariants (AGG-LibrarySound): the id is the folder's name and its WAV exists; title and use when are never empty;
a cue and a trim lie inside the length, a cue inside the trim.

## Acceptance Criteria

Scenario: A valid hand edit passes
  Given the library holds "vine-boom"
  When the user saves its sound.yaml with the tags "reveal,shock"
  Then the validation passes

Scenario: An id that is not the folder name is refused
  Given the library holds "vine-boom"
  When the user saves its sound.yaml with the id "boom"
  Then the validation fails because the id must be the folder name "vine-boom"

Scenario: A missing file is refused
  Given the library holds "vine-boom"
  When the user saves its sound.yaml naming the file "missing.wav"
  Then the validation fails because "missing.wav" does not exist

Scenario: An empty title is refused
  Given the library holds "vine-boom"
  When the user saves its sound.yaml with an empty title
  Then the validation fails because a library sound needs a title

## Out of Scope
- Checking the whole library (ST-004)

## Open Questions
- none
