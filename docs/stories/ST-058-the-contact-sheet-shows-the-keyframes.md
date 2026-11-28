---
id: ST-058
title: The board's contact sheet shows each shot's keyframe
type: chore
ui: true
priority: should
size: null
risk: null
depends_on: []
labels: [bug, feature:board-redesign]
feature: board-redesign
status: in-progress
---

## Context
Bug: the glossary (**Contact Sheet**) and the rule of `CMD-WriteContactSheet` (HS-71, user 2026-11-21) say the board
shows each shot's keyframe once it exists. The code draws an SVG of text cards in the storyboard stage
(`packages/cli/src/contact-sheet.ts`), before any keyframe exists. The production view embeds it as an image
(`packages/cli/src/board/production.js:260`). Gap G-70. Read model `RM-ContactSheet` (target in
`docs/domain/events.yaml`).

Decided by the user on 2026-11-27 (feature `board-redesign`): the board builds the contact sheet itself as an HTML grid
from the resolved storyboard and the keyframes in `assets/keyframes/`. It is a tab of the project page at the full
width (G2). `review/contact-sheet.svg` stays as the storyboard stage's output.

Prototype: prototype/board-redesign – Wie sieht das Board auf dem Desktop aus: welche Navigation, welche Projekte-Liste, welche visuelle Richtung? – nav A (Leiste oben), list A (kompakte Tabelle), look A (Werkstatt)

## Task
- A project with a valid storyboard gets a **Contact Sheet** tab. It shows one card per shot in playing order, with
  the id, source, section, start–end, description, on-screen text, and the keyframe image from
  `assets/keyframes/<shot>.png` when it exists. A shot without a keyframe shows a placeholder with its source.
- The data comes from a read route that takes the shots from `validateProject` (conventions: consumers take the
  resolved storyboard) and serves the keyframes through the existing project file route.
- A project without a storyboard has no tab, or the tab says "Noch kein Storyboard" / "No storyboard yet". An
  invalid storyboard shows the validation error instead of a stale grid.
- A click on a keyframe opens it full size.
- The grid takes the full width and fits 4 to 6 cards per row at 1280 to 1440 px.
- The embedded SVG is removed from the production view.

## Acceptance Criteria
- [ ] Regression: a project with a storyboard of 3 shots and a keyframe for shot-002 lists 3 cards, and only
      shot-002 shows an image (test)
- [ ] A keyframe filed after the page loaded shows after **Refresh**, with no new `contact-sheet` run (test or by hand)
- [ ] A project without `storyboard.yaml` shows no grid and no error (test)
- [ ] An invalid storyboard shows its validation error in the tab (test)
