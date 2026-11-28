---
id: ST-069
title: The board hides demo productions unless Show demos is on
type: task
ui: true
priority: should
size: null
risk: null
depends_on: [ST-067]
labels: [feature:demo-projects]
feature: demo-projects
status: done
---

## Context
Feature `demo-projects`, decided by the user on 2026-11-28 (flow `FLOW-DemoProductions`, glossary **Demo
Production**; RM-ProjectCatalogue, RM-ProductionView, RM-WorkspaceReleaseCalendar, RM-CharacterLibrary,
RM-SetLibrary). With real projects, the shipped demos are permanent noise on the board: `demo` sits among the
finished projects and `demo-episode` among the open ones.

- **Hidden by default** in the production view, the project list (`#/projects`) and the library's "used in".
- **Show demos** / **Demos zeigen**: one switch for the whole board, in the production view and in the project
  list, kept in the browser (`localStorage`), not in the address (G5 covers search and filters, not a
  preference). On, the demos appear in a group **Demos** after the other groups.
- **Fresh workspace:** while there is no project or series without `demo: true` (an internal one counts as real),
  the board shows the demos in the group **Demos** and no switch.
- **Library:** while demos are hidden, a use in a demo does not count for a character's or set's **Used in** column
  or the **unused** filter, so the bulk delete of ST-063 can clear what only demos use; the entry's page still lists
  the use, marked "(Demo)". The demos keep their copies.
- **Calendar:** a demo's calendar never shows on the board's calendar or in `/calendar.ics`, whatever the switch
  says (ST-068: a demo is not released).
- A demo's card shows a chip **Demo** and no next step (ST-067).
- Guidelines G4, G6, G9.

## Task
- `demo` on every project and series the board's production, project-list and library routes return; the uses of
  a library character or set say whether the using production is a demo.
- The switch, its stored value and the group **Demos** in the production view and the project list, from one piece
  of shared code.
- The library lists' count and **unused** filter follow the switch; the entry pages mark demo uses.
- The board's calendar and `/calendar.ics` leave demos out.
- `docs/board.md` and both board guides describe it; `docs/board.md` says the demos can be deleted.

## Acceptance Criteria
- [x] With one real project and the three demos, the production view and the project list show only the real
      project, and the switch **Show demos** (test with a fixture workspace)
- [x] Turning the switch on shows the demos in a group **Demos** after the other groups and keeps that after a
      reload (stored value) (test)
- [x] A workspace with only the demos shows them in the group **Demos** without the switch (test)
- [x] A library character used only by `demo` counts 0 in **Used in** and matches **unused** while demos are hidden,
      and 1 when they are shown; its page lists "Neon Rain (Demo)" (test)
- [x] The board's calendar and `/calendar.ics` list no event of a demo with a calendar (test)

## Out of Scope
- The sound library: no shipped demo is a meme
- Deleting the demos from the board
- The release side (ST-068) and the next action (ST-067)

## Open Questions
- none
