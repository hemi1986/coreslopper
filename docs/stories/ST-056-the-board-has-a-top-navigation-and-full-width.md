---
id: ST-056
title: The board has a top navigation and uses the full width
type: task
ui: true
priority: must
size: null
risk: null
depends_on: []
labels: [feature:board-redesign]
feature: board-redesign
status: ready
---

## Context
Feature `board-redesign`, decided by the user on 2026-11-27. ADR 0058 amends ADR 0049. Read models
`RM-BoardNavigation` and the rules of `CMD-OpenBoardView` (`docs/domain/events.yaml`). Guidelines G1, G2, G3, G9.

Prototype: prototype/board-redesign – Wie sieht das Board auf dem Desktop aus: welche Navigation, welche Projekte-Liste, welche visuelle Richtung? – nav A (Leiste oben), list A (kompakte Tabelle), look A (Werkstatt)

The screen's one job is to get the user to a view. The navigation is the board's only entry point to every view.

## Task
- `index.html`/`app.js`/`board.css` replace the left column with a bar across the top. It has the work group
  (Produktion / Production, Projekte / Projects, Release-Kalender / Release calendar) and the library group
  (Figuren, Sets, Sounds), then **+ Neu** / **+ New** as the one primary button, and **Anleitung** / **Guide** and
  **↻ Aktualisieren** / **Refresh** set apart. The active view's entry is marked, and a project's views mark
  Projects. The channel's motto stays.
- The navigation lists no project and no series. The **Released** group and its fold state are removed.
- `#/projects` is routed to the project list (ST-057). Until that lands, the entry may open a placeholder.
- `main` drops `max-width: 1180px` and uses the full window width. Running text (formatted documents, the guide, the
  wizard's forms) stays at about 80 characters per line.
- No view needs horizontal scrolling at 1280 px window width, with the navigation included.
- The refresh keeps its behaviour (ADR 0049): it reloads the navigation and the current view, and keeps a view with
  playing media or an edited field.
- `docs/board.md`, the board guide (`docs/board-guide.md`, `docs/board-guide.de.md`, with new screenshots),
  `docs/engineering/conventions.md` (board shell) follow.

## Acceptance Criteria
- [ ] The navigation shows the entries of both groups, + New, Guide and Refresh in this order, and no project or
      series (test of the page script or a DOM check)
- [ ] The active entry is marked for every route, Projects for `#/p/<slug>` and its tabs
- [ ] At 1280 px and 1440 px window width no view scrolls horizontally (checked by hand with the sandbox workspace)
- [ ] A formatted document and the guide keep a line length of about 80 characters at 1440 px
- [ ] Refresh with a playing render keeps the review view and reloads the navigation (existing behaviour, still green)
- [ ] `docs/board.md` and both board guides describe the new navigation
