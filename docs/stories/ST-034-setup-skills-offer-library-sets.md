---
id: ST-034
title: The setup skills offer library sets while grilling
type: task
ui: false
priority: should
size: null
risk: null
depends_on: [ST-028]
labels: [feature:set-library]
status: done
---

## Task
`new-video` and `new-series` (and `style-bible` where it writes the set bible) offer matching library sets while
grilling, as they offer library characters today, and run `set use` for the sets the user chooses. The set bible
builds on a used set: it keeps its references and plates and adds what the new production needs. The workspace
`AGENTS.md`, the CLI docs and the glossary pages name the set library. Load `writing-for-agents` before editing a
skill.

Decided in the grilling of feature `set-library` (user, 2026-11-22, round 2 Q6; ADR 0052).

## Acceptance Criteria
- [x] `new-video` and `new-series` list matching library sets (`set list`) and use the chosen ones before the set bible is written
- [x] The set bible step keeps a used set's references and plates and only adds
- [x] The workspace docs and the CLI reference describe `set import|new|add-file|use|remove|list`
- [x] The skill changes pass the repository's skill checks (`npm test`)

## Out of Scope
- The wizard step (ST-033)

## Open Questions
- none
