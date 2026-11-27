---
status: accepted
date: 2026-11-27
---

# The board's navigation lists no projects; the project list does

## Status

Accepted – 2026-11-27; accepted by the user on 2026-11-27. Amends [ADR 0049](0049-board-shell.md) in one point: the navigation's project list and the
folding away of finished projects.

## Context

ADR 0049 kept every project and series in the board's left column and let finished and released projects fold into
**Released** once the list grows (G-208). With more projects, the column still grows, the series with their episodes
take most of it, and the main area stays narrow (`main { max-width: 1180px }`). The user wants the board laid out for
a desktop, the main area at full width, and a better menu. To find a project they want a page that can be searched,
filtered, and grouped by series, so that only one series' episodes are shown.

A throwaway prototype compared three navigations (a top bar, an icon rail, a collapsible sidebar) and three project
lists (a table, a card grid, a table with series groups). The user picked the top bar and the table
(`prototype/board-redesign`, 2026-11-27).

## Decision

- **The navigation is a bar across the top with fixed entries only**: work (Production, Projects, Release calendar)
  and library (Characters, Sets, Sounds), with **+ New** as the primary action and Guide and Refresh set apart. It
  lists no project and no series.
- **The project list is its own view (`#/projects`)**: every music video, meme, episode and series in one table,
  newest activity first. It can be searched by title and slug, filtered by kind, state and series, and grouped by
  series. A series group shows its planned episodes. The search, the filters and the grouping live in the address, so
  a refresh, the back button and a link keep them.
- **Released projects stay in the list.** The state filter replaces the folded **Released** group of ADR 0049.
- **The production view stays the start page**: what is the user's turn and what is running.
- **Desktop only.** The design size is a 1440 px wide window, and nothing needs horizontal scrolling down to 1280 px.
  The main area uses the full width, while running text stays at about 80 characters.

Unchanged from ADR 0049: the manual refresh, the loopback-only reads, and the board as a host without state. The
project list reads the same production data as the navigation did and writes nothing.

## Consequences

- One more click to reach a project that is not on the start page: Projects, then the row. The start page still
  links every project that is the user's turn or running.
- The navigation no longer shows a project's stage or release progress at a glance. The table's columns carry that.
- `docs/board.md`, the board guide (both languages, with its screenshots), `docs/glossary.md` (**Board Navigation**,
  **Project List**) and `docs/engineering/conventions.md` change with the shell.
- The navigation's error line for an unreadable project moves into the list.

## Alternatives considered

- **Keep the projects in a collapsible left sidebar.** The project stays one click away, but the sidebar takes about
  240 px of a 1280 px window and grows with every project. The prototype showed the table squeezed beside it.
- **A narrow icon rail.** It is compact, but it needs an icon for every entry and gains nothing over a top bar with
  six entries.
- **A card grid for the list.** Friendlier, but it shows fewer projects per screen and cannot be sorted by its column
  headers.
