---
id: ST-026
title: Take the sets of a production into the library
type: domain
context: BC-Library
aggregate: AGG-LibrarySet
command: CMD-ImportSets
ui: false
priority: should
size: null
risk: null
events: [EVT-LibrarySetCreated, EVT-LibrarySetExtended]
depends_on: [ST-023]
labels: [feature:set-library]
status: ready-for-human-review
---

## Story
As a user, I want to take the sets of an existing music video or series canon into the set library, so that places I already made can be used again.

## Context
`set import <production> [--series] [--id <set>] [--into <entry>]` and the board's Sets view (ST-032). The same
command runs by itself when a set bible is finished (ST-027).

Rules (CMD-ImportSets): a set with no file is skipped, or refused when it was named with `--id`; missing files are
reported, not fatal.

Invariants (AGG-LibrarySet): one set, one entry – an import goes into the entry it was taken from (`library: <id>`),
into a same-id entry that shares a file with it, or into the entry named with `--into`; anything else becomes a new
entry `<id>-<slug>` when the id is taken. A file is stored once by its content. An import keeps the entry's name,
description and prompt, fills in what is missing and appends references and plates; a plate id that exists with
another image becomes `<plate>-<slug>`; every later import is recorded in the history.

Decided in the grilling of feature `set-library` (user, 2026-11-22, round 1 Q4, round 2 Q2; ADR 0052).

## Acceptance Criteria

Scenario: The sets of a music video become library sets
  Given the music video "neon-rain" has the set "bar" with one reference and the plate "counter"
  And the set library is empty
  When the user takes the sets of "neon-rain" into the library
  Then the library holds the set "bar" with its reference and the plate "counter"
  And its origin is "projects/neon-rain"

Scenario: A set taken from the library extends its entry
  Given the library holds "bar" with the plate "counter"
  And the music video "after-midnight" has the set "bar" with "library: bar" and the plates "counter" and "door"
  When the user takes the sets of "after-midnight" into the library
  Then "bar" has the plates "counter" and "door"
  And its history names "projects/after-midnight" with the plate "door"

Scenario: A plate id with another image is renamed
  Given the library holds "bar" with the plate "counter"
  And the music video "after-midnight" has the set "bar" with "library: bar" and a different image for the plate "counter"
  When the user takes the sets of "after-midnight" into the library
  Then "bar" has the plates "counter" and "counter-after-midnight"

Scenario: A different set with a taken id becomes its own entry
  Given the library holds "bar" from "neon-rain"
  And the music video "after-midnight" has its own set "bar" that shares no file with it
  When the user takes the sets of "after-midnight" into the library
  Then the library holds "bar" and "bar-after-midnight"

## Out of Scope
- The automatic import after a finished set bible (ST-027)
- Props

## Open Questions
- none
