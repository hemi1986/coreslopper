---
id: ST-028
title: Use a library set in a music video or series canon
type: domain
context: BC-Bibles
aggregate: AGG-SetBible
command: CMD-UseLibrarySet
ui: false
priority: should
size: null
risk: null
events: [EVT-LibrarySetUsed, EVT-LibrarySetUseRefused]
depends_on: [ST-025]
labels: [feature:set-library]
status: ready-for-human-review
---

## Story
As a user, I want to use a library set in a new music video or series canon, so that the place looks the same as before without generating its plates again.

## Context
`set use <target> <id> [--series]`, the board's set page (ST-032), the wizard step (ST-033), and the setup skills
for the sets the user chooses while grilling (ST-034).

Rules (CMD-UseLibrarySet): the references and every plate always come along – there is no choice of plates; an
episode takes its sets from its series canon, so use goes to the series; the target keeps the library id as the
set's id, and a target set of that id that is not linked to the entry refuses the use.

The use copies the files into the target's `sets/<id>/` (plates into `sets/<id>/plates/`) and adds the set to its
`sets.yaml` with `library: <id>`; a `sets.yaml` is created when the target has none. A second use adds what the
target lacks. Invariants (AGG-SetBible): set and plate ids are unique.

Decided in the grilling of feature `set-library` (user, 2026-11-22, round 1 Q2–Q3, round 2 Q3; ADR 0052).

## Acceptance Criteria

Scenario: A library set is copied with every plate
  Given the library holds "bar" with one reference and the plates "counter" and "door"
  And the music video "neon-rain" has no sets.yaml
  When the user uses "bar" in "neon-rain"
  Then the set bible of "neon-rain" has the set "bar" with "library: bar", its reference and the plates "counter" and "door"
  And the files lie in "sets/bar/" of "neon-rain"

Scenario: A second use adds only what is missing
  Given "neon-rain" uses "bar" with the plate "counter"
  And the library's "bar" has gained the plate "door"
  When the user uses "bar" in "neon-rain" again
  Then the set "bar" of "neon-rain" has the plates "counter" and "door" once each

Scenario: A set of the same id that is not from the library refuses the use
  Given the music video "neon-rain" has its own set "bar" without "library"
  When the user uses the library set "bar" in "neon-rain"
  Then the use is refused because "neon-rain" has its own set "bar" already
  And the set bible of "neon-rain" is unchanged

Scenario: An episode refuses the use
  Given the episode "night-desk-02" of the series "night-desk"
  When the user uses "bar" in "night-desk-02"
  Then the use is refused because an episode takes its sets from the series canon

## Out of Scope
- Choosing plates on use
- Props

## Open Questions
- none
