---
id: ST-059
title: The board's "Werkstatt" look
type: chore
ui: true
priority: should
size: null
risk: null
depends_on: [ST-056]
labels: [feature:board-redesign]
feature: board-redesign
status: done
---

## Context
Feature `board-redesign`, decided by the user on 2026-11-27. The user wants the board friendlier and more appealing
on a desktop. Guideline G8 (visual direction "Werkstatt": neutral, calm, system font, light or dark from the system).

Prototype: prototype/board-redesign – Wie sieht das Board auf dem Desktop aus: welche Navigation, welche Projekte-Liste, welche visuelle Richtung? – nav A (Leiste oben), list A (kompakte Tabelle), look A (Werkstatt)

The values are on the prototype branch: `git show prototype/board-redesign:docs/prototypes/board-redesign/index.html`,
`look=A`.

## Task
- `board.css` takes look A's tokens (colours, type scale, spacing, radii, borders) for light and dark, as CSS
  variables. The views use the variables, not their own colours. Platform colours on the release board stay.
- Cards, tables, tabs, chips, buttons and the stage strip follow the tokens across every view: production, project,
  series, review, release, calendar, characters, sets, sounds, wizard, guide.
- No layout or behaviour changes. Those belong to ST-056, ST-057 and ST-058.
- Contrast of text on its background is at least 4.5:1 in both modes.

## Acceptance Criteria
- [x] `board.css` defines the tokens once for light and once for dark, and no view stylesheet rule uses a hard-coded
      colour outside the platform badges (grep check)
- [x] Every view looks right in light and dark at 1440 px (checked by hand in the sandbox, screenshots in the PR)
- [x] Body text and muted text reach 4.5:1 against their backgrounds in both modes
