# UX guidelines – coreslopper

<!--
  The yardstick, not the method. The method is `.claude/skills/ux-design/SKILL.md`.
  Every guideline is a rule someone can point at, with the date and the reason it was decided.
  `ux-designer` maintains this file; the user approves a guideline before it is written here.
  A prototype verdict that becomes a recurring rule lands here as a G-number; the prototype itself stays on
  its throwaway branch (`docs/prototypes/<slug>/`).

  Format:
  ## G1 – <short rule>
  <One or two sentences, in the voice of a rule.> (YYYY-MM-DD – reason)
-->

## Devices and context

## G1 – Desktop only, designed at 1440 px
The board is built for a desktop window 1440 px wide; nothing needs horizontal scrolling down to 1280 px, and there is no mobile layout. (2026-11-27 – the board is a production workbench used at a desk; prototype `prototype/board-redesign`, feature `board-redesign`)

## Language

UI language: en. [OPEN] Which terms appear, and which pages are in another language?

## The states every screen needs

[OPEN] Empty, full, rejected, no permission – how does each one look and what does it say?

## G6 – Empty states name the cause and offer the way out
A list with nothing yet says so and links the action that creates the first item ("Noch keine Projekte" + "+ Neu"); a filter with no match says "Kein Projekt passt zu diesen Filtern" and offers "Filter zurücksetzen". (2026-11-27 – an empty list and an over-filtered list need different next steps; prototype `prototype/board-redesign`)

## Layout

## G2 – The main area uses the full window width
Grids, tables, players and the contact sheet grow with the window; running text (documents, guide, wizard forms) stays at about 80 characters per line. (2026-11-27 – wide data needs the space, long lines of prose are hard to read; prototype `prototype/board-redesign`)

## Navigation

## G3 – A top bar with fixed entries, no projects in it
Navigation is a bar across the top with fixed entries only, in two groups: work (Production, Projects, Release calendar) and library (Characters, Sets, Sounds). "+ New" is the one primary button; Guide and Refresh are set apart. Projects never appear as navigation entries. (2026-11-27 – a bar that does not grow with the data stays learnable; prototype verdict nav A, ADR 0058 proposed)

## Patterns

## G10 – Everything that creates something starts at + New
Every new item – a music video, series, episode, meme, or a library character, set or sound – is created through a wizard reached from + New (`#/new`), whose chooser groups Production (video, series, episode, meme) and Library (character, set, sound). A list has a "+ Neu" button that opens its wizard directly, never an inline creation form. Importing characters or sets from a production is a path inside the character/set wizard. Wizards create the item in their first step and stay resumable by address (`#/new/<kind>/<id>`); the last step leads to the new item. (2026-11-28 – one place and one pattern for creating anything; feature `asset-library`)

## G4 – Many records are a dense, sortable table
A list of many records (the project list) is a dense table, sortable by clicking its column headers, newest activity first by default; cards are used only where the item is visual (e.g. contact sheet shots). (2026-11-27 – a table scans and compares faster than cards; prototype verdict list A)

Amended 2026-11-28 (feature `asset-library`): the library lists (Characters, Sets, Sounds) are dense, sortable tables too, like the project list. For visual items (characters, sets) the row carries a small cover thumbnail (about 48 px) instead of switching to cards. Cards stay only for items whose image is the content being judged (e.g. contact-sheet shots). (2026-11-28 – one list pattern across the board is easier to learn; a thumbnail is enough to recognise a character or set; the detail page shows the large images)

## G5 – List state lives in the address hash
A list's search, filters and grouping live in the address hash (e.g. `#/projects?series=x&group=series`), so refresh, back and links keep them. (2026-11-27 – the view survives refresh and can be shared; prototype `prototype/board-redesign`)

## G7 – Grouping is opt-in
Grouping is a switch that is off by default. A grouped series shows its planned episodes only while no search and no state filter is active. (2026-11-27 – a flat list is the common case; planned episodes would otherwise hide real matches; prototype `prototype/board-redesign`)

## G9 – The board never refreshes by itself
The user refreshes; the board does not poll or reload on its own. (2026-11-27 – already decided in ADR 0049; recorded so no screen adds auto-refresh)

## Look

## G8 – Visual direction "Werkstatt", light or dark by system
The look is neutral and calm with the system font and restrained accents; light or dark follows the system setting. (2026-11-27 – a workbench should stay out of the way of the media being reviewed; prototype verdict look A)
