---
id: ST-031
title: Delete a library set
type: domain
context: BC-Library
aggregate: AGG-LibrarySet
command: CMD-DeleteLibrarySet
ui: true
priority: could
size: null
risk: null
events: [EVT-LibrarySetDeleted]
depends_on: [ST-024]
labels: [feature:set-library]
status: ready
---

## Story
As a user, I want to delete a set from the library, so that the library offers only places I want to use again.

## Context
`set remove <id>` and the board's set page (ST-032). In the board a confirmation names every production that uses
the set before it is deleted. The productions keep their copies; their `library: <id>` stays as a record of where
the set came from.

Decided in the grilling of feature `set-library` (user, 2026-11-22, round 2 Q5; ADR 0052).

## Acceptance Criteria

Scenario: A used set is deleted and its copies stay
  Given the library holds "bar", used in the music video "neon-rain"
  When the user deletes "bar" from the library
  Then the library has no set "bar"
  And the set "bar" of "neon-rain" keeps its plates and files

Scenario: An unknown set is refused
  Given the library has no set "garage"
  When the user deletes "garage" from the library
  Then the deletion is refused because the library has no set "garage"

## Out of Scope
- Deleting a production's copy

## Open Questions
- none
