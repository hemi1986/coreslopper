---
id: ST-033
title: The wizard's step "Sets from the library"
type: task
ui: true
priority: should
size: null
risk: null
depends_on: [ST-028]
labels: [feature:set-library]
status: ready-for-human-review
---

## Task
The **+ New** wizard for music videos and for series gets a step "Sets aus der Bibliothek" / "Sets from the
library" beside "Figuren aus der Bibliothek", with the same picker: a card per library set, ticked sets are used in
the new production (CMD-UseLibrarySet, ST-028). An episode takes its sets from its series canon, so the episode
wizard gets no such step. An empty set library shows the empty text of ST-032 and a link to the Sets view.

Decided in the grilling of feature `set-library` (user, 2026-11-22, round 1 Q7, round 2 Q7).

## Acceptance Criteria
- [ ] The music video wizard and the series wizard show the step "Sets from the library" after the characters step
- [ ] Ticking a set uses it in the new production; its sets.yaml names it with `library`
- [ ] A refused use (an own set of the same id) shows its reason in the step
- [ ] The episode wizard has no sets step
- [ ] The step's texts exist in German and English

## Out of Scope
- Choosing plates

## Open Questions
- none
