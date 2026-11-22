---
id: ST-024
title: Add a library set by hand
type: domain
context: BC-Library
aggregate: AGG-LibrarySet
command: CMD-AddLibrarySet
ui: false
priority: should
size: null
risk: null
events: [EVT-LibrarySetCreated]
depends_on: [ST-023]
labels: [feature:set-library]
status: ready-for-human-review
---

## Story
As a user, I want to add a set to the set library by hand, so that a place I already have pictures of can be used in my next music video or series.

## Context
`set new --name "…" --description "…" --prompt "…" [--tags a,b]` and the board's form (ST-032). The entry is
`library/sets/<id>/set.yaml`; its files come with ST-025.

Rules (CMD-AddLibrarySet): the id comes from the name (kebab-case); an id the library already has is refused;
name, description and prompt are required, as in a set bible. Origin is `manual`.

Invariants (AGG-LibrarySet): the id is the folder's name; every file in the folder is named by `set.yaml`; update
and init never overwrite the library.

Decided in the grilling of feature `set-library` (user, 2026-11-22, round 1 Q5; ADR 0052).

## Acceptance Criteria

Scenario: A set is added by hand
  Given the set library is empty
  When the user adds a set named "Neon Bar" with the description "a narrow bar in blue neon" and the prompt "narrow bar, blue neon, wet counter"
  Then the library holds the set "neon-bar" with that name, description and prompt
  And its origin is "manual" and it has no references and no plates

Scenario: A taken id is refused
  Given the library holds the set "neon-bar"
  When the user adds a set named "Neon Bar" with the description "another bar" and the prompt "bar"
  Then the set is refused because the id "neon-bar" is taken
  And the library still holds one set

Scenario: A set without a prompt is refused
  Given the set library is empty
  When the user adds a set named "Neon Bar" with the description "a narrow bar in blue neon" and no prompt
  Then the set is refused because the prompt is missing
  And no folder "library/sets/neon-bar" exists

## Out of Scope
- Files of the set (ST-025)
- The board's form (ST-032)

## Open Questions
- none
