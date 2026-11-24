---
id: ST-030
title: Remove a reference or a plate from a library set
type: domain
context: BC-Library
aggregate: AGG-LibrarySet
command: CMD-RemoveLibrarySetFile
ui: false
priority: could
size: null
risk: null
events: [EVT-LibrarySetFileRemoved]
depends_on: [ST-025]
labels: [feature:set-library]
status: done
---

## Story
As a user, I want to remove a reference or a plate from a library set, so that a picture that no longer fits is not copied into the next production.

## Context
`set remove <id> --file <name>` and the board's set page (ST-032). The file is deleted and the reference or the
plate naming it is removed from `set.yaml`. Productions that use the set keep their copy.

Invariant (AGG-LibrarySet): every file in the entry's folder is named by `set.yaml`.

## Acceptance Criteria

Scenario: A plate is removed with its file
  Given the library's "bar" has the plates "counter" and "door"
  When the user removes the file of the plate "door" from "bar"
  Then "bar" has only the plate "counter"
  And the folder of "bar" holds no file of "door"

Scenario: A file the set does not name is refused
  Given the library's "bar" has no file "old.png"
  When the user removes "old.png" from "bar"
  Then the removal is refused because "bar" has no file "old.png"

## Out of Scope
- Removing files from a production's copy

## Open Questions
- none
