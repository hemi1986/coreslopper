---
id: ST-032
title: The board's Sets view
type: task
ui: true
priority: should
size: null
risk: null
depends_on: [ST-024, ST-025, ST-026, ST-028, ST-029, ST-030, ST-031]
labels: [feature:set-library]
status: done
---

## Task
A board view **Sets** (de: "Sets") as its own navigation entry beside **Characters**, built on the commands of
ST-024 to ST-031 (the board owns no state, ADR 0049). It reads RM-SetLibrary. Its one job: keep the reusable places
of the workspace and put one into a production.

Decided in the grilling of feature `set-library` (user, 2026-11-22, round 1 Q6, round 2 Q4, Q5, Q7):

- **Overview** `#/sets`: a card per library set with its cover (the first plate, else the first reference), name,
  number of plates, and "used in". A button imports the sets of an existing production (ST-026) and one adds a set
  by hand (ST-024).
- **Set page** `#/sets/<id>`: description and prompt (editable, ST-029), references, plates with their camera
  angle ("Kamerawinkel" / "Angle"), upload and remove files (ST-025, ST-030), "Use in project/series" with a choice of
  music videos and series canons (ST-028), and delete after a confirmation that names where the set is used (ST-031).
- **Empty library:** "Die Bibliothek hat noch keine Sets; sie füllt sich mit jedem fertigen Musikvideo und jeder
  Serie. Eigene Sets legst du hier an." / "The library has no sets yet; it fills with every finished music video and
  series. Add your own here."
- A refused write names the reason and keeps what was typed, as the character form does. Library set files are
  served from their own path, apart from character files, with the same sandboxing headers and the board's write
  guard.

## Acceptance Criteria
- [x] `#/sets` lists every library set with cover, name, plate count and "used in"; the navigation links it beside Characters
- [x] The empty library shows the decided text and the way to add a set
- [x] The set page edits, uploads, removes, uses and deletes through the commands of ST-024 to ST-031 and shows their refusals
- [x] Deleting asks first and names every production that uses the set
- [x] Library set files are served from their own path and only there; `set.yaml` and dot files are never served
- [x] The view speaks German and English and passes the board's write guard

## Out of Scope
- One "Library" navigation entry for characters, sets and sounds
- Props

## Open Questions
- none
