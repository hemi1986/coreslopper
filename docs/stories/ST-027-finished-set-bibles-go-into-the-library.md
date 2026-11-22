---
id: ST-027
title: The sets of a finished set bible go into the library by themselves
type: domain
context: BC-Library
aggregate: AGG-LibrarySet
command: CMD-ImportSets
ui: false
priority: should
size: null
risk: null
events: [EVT-LibrarySetCreated, EVT-LibrarySetExtended]
depends_on: [ST-026]
labels: [feature:set-library]
status: ready
---

## Story
As a user, I want the sets of a finished set bible to land in the set library by themselves, so that a place is in the library right after the video that made it.

## Context
POL-ImportFinishedSets: where the characters come in (POL-ImportFinishedCharacters) – `stage-done <project>
style-character` for a music video, and the canon once its references passed for a series (`new-series` runs the
import as it does for characters). The command is CMD-ImportSets (ST-026) with its rules and the invariants of
AGG-LibrarySet. A failed import only warns; it never fails the stage.

Decided in the grilling of feature `set-library` (user, 2026-11-22, round 1 Q4; ADR 0052).

## Acceptance Criteria

Scenario: Finishing style-character takes the sets in
  Given the music video "neon-rain" has the set "bar" with the plate "counter"
  And the set library is empty
  When the stage "style-character" of "neon-rain" is marked done
  Then the library holds the set "bar" with the plate "counter"

Scenario: A failed import does not fail the stage
  Given the music video "neon-rain" has the set "bar" whose plate file is missing
  When the stage "style-character" of "neon-rain" is marked done
  Then the stage is done
  And a warning names the missing plate file of "bar"

Scenario: A music video without a set bible takes nothing in
  Given the music video "neon-rain" has no sets.yaml
  When the stage "style-character" of "neon-rain" is marked done
  Then the stage is done and the set library is unchanged

## Out of Scope
- Plates an episode appends to its canon later

## Open Questions
- none
