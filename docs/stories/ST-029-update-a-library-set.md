---
id: ST-029
title: Update a library set's name, description, prompt and tags
type: domain
context: BC-Library
aggregate: AGG-LibrarySet
command: CMD-UpdateLibrarySet
ui: true
priority: could
size: null
risk: null
events: [EVT-LibrarySetUpdated]
depends_on: [ST-024]
labels: [feature:set-library]
status: in-progress
---

## Story
As a user, I want to correct a library set's name, description, prompt and tags, so that the agent offers and uses the set with the right words.

## Context
The board's set page (ST-032); the CLI has no update, as for characters. Name, description and prompt stay
required. The id does not change with the name. Productions that use the set keep their copy.

Decided in the grilling of feature `set-library` (user, 2026-11-22, round 2 Q4; ADR 0052).

## Acceptance Criteria

Scenario: The description is corrected
  Given the library holds "bar" with the description "a bar"
  When the user changes the description of "bar" to "a narrow bar in blue neon"
  Then "bar" has the description "a narrow bar in blue neon" and keeps its id "bar"

Scenario: An emptied prompt is refused
  Given the library holds "bar" with the prompt "narrow bar, blue neon"
  When the user changes the prompt of "bar" to ""
  Then the change is refused because the prompt is missing
  And "bar" keeps the prompt "narrow bar, blue neon"

## Out of Scope
- Renaming the id

## Open Questions
- none
