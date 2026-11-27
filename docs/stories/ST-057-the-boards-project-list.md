---
id: ST-057
title: The board's project list with search, filters and series grouping
type: task
ui: true
priority: must
size: null
risk: null
depends_on: [ST-056]
labels: [feature:board-redesign]
feature: board-redesign
status: ready
---

## Context
Feature `board-redesign`, decided by the user on 2026-11-27. ADR 0058. Read model `RM-ProjectCatalogue`
(**Project List** in `docs/glossary.md`, `_UI (de)_: Projekte`), flow `FLOW-ProjectCatalogue`. Guidelines G4, G5,
G6, G7.

Prototype: prototype/board-redesign – Wie sieht das Board auf dem Desktop aus: welche Navigation, welche Projekte-Liste, welche visuelle Richtung? – nav A (Leiste oben), list A (kompakte Tabelle), look A (Werkstatt)

- **Entry:** **Projekte** in the navigation. Its one job is to find a project and open it. The start page
  (Produktion) stays "what is pending".
- **Before acting:** per row the title, kind (with series and episode number for an episode), production phase or
  current stage, next step, release day with done marks, and last activity. Not shown: budget detail, queue, renders
  (those are on the project page).
- **Afterwards:** a click on a row opens `#/p/<slug>`, a series row `#/s/<slug>`. Back returns to the list with its
  filters.
- The data comes from `/api/production` and `/api/projects`, as the old navigation did. No new server route is
  needed unless the last activity is missing there. The list reads and never writes.

## Task
- `#/projects` shows one table row per music video, meme, episode and series, sorted by last activity, newest first.
  Clicking a column header sorts by title, release day or last activity. Clicking it again reverses the order.
- **Search** over title and slug, case-insensitive substring, applied while typing.
- **Filters:** Art (Musikvideo, Folge, Meme, Serie), Status (Du bist dran, Läuft, Fertig, Veröffentlicht), and
  Serie. The kinds within a filter combine with "or", and the filters combine with "and". Released projects are in
  the list by default. "Veröffentlicht" uses the rule of the old **Released** group: done, and every release event
  ticked off or the release day past, or internal and done.
- **Serie: <name>** shows only that series' episodes.
- **Nach Serie gruppieren** / **Group by series** is off by default. On, it puts every episode under its series
  row, and the planned episodes without a project appear as "geplant" / "planned". They appear only while no search
  and no state filter is active.
- The search, the filters, the sort and the grouping live in the hash, for example
  `#/projects?q=…&kind=…&status=…&series=…&group=series&sort=title&dir=asc`. Reload, Back and a pasted link restore
  them. Unknown values in the hash are ignored.
- An unreadable project or series is a row with its error.
- **Empty:**
  - With no project, the list says "Noch keine Projekte" / "No projects yet" and links **+ Neu**.
  - With no match, it says "Kein Projekt passt zu diesen Filtern" / "No project matches these filters" and offers
    **Filter zurücksetzen** / **Reset filters**.
- `docs/board.md` and both board guides describe the list.

## Acceptance Criteria
- [ ] The list shows every project and series, newest activity first (test with a fixture workspace)
- [ ] Searching "NACHT" finds a project titled "Nachtschicht" and one with slug `nachtschicht-e01` (test)
- [ ] Filter Serie = a series with 3 episodes shows exactly those 3 (test)
- [ ] Grouping on shows each episode under its series and the planned episodes as planned. With a search it hides
      the planned ones (test)
- [ ] `#/projects?series=<slug>&group=series` restores the filter and grouping after a reload
- [ ] A filter with no match shows the no-match text and **Reset filters** clears search, filters and grouping
- [ ] A workspace without projects shows "No projects yet" with a link to the wizard
- [ ] An unreadable project shows as a row with its error
