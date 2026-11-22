---
id: ST-025
title: Add a reference or a plate to a library set
type: domain
context: BC-Library
aggregate: AGG-LibrarySet
command: CMD-AddLibrarySetFile
ui: false
priority: should
size: null
risk: null
events: [EVT-LibrarySetFileAdded]
depends_on: [ST-024]
labels: [feature:set-library]
status: ready-for-human-review
---

## Story
As a user, I want to add reference images and plates to a library set, so that a production that uses the set starts from pictures that already passed.

## Context
`set add-file <id> <file> --role ref|plate [--angle "…"] [--plate <plate-id>]` and a board upload (ST-032).

Rules (CMD-AddLibrarySetFile): images are png, jpg or webp, at most 512 MB; a plate needs its camera angle. A plate
id comes from `--plate`, else from the angle (kebab-case).

Invariants (AGG-LibrarySet): every named file is a plain file of the entry's folder and exists; a file is stored
once by its content; plate ids are unique in the entry and every plate has an angle.

Decided in the grilling of feature `set-library` (user, 2026-11-22, round 1 Q5; ADR 0052).

## Acceptance Criteria

Scenario: A plate is added with its angle
  Given the library holds the set "neon-bar" without plates
  When the user adds "counter.png" to "neon-bar" as a plate with the angle "counter, frontal, waist height"
  Then "neon-bar" has the plate "counter-frontal-waist-height" with that angle and the image "counter.png"

Scenario: A plate without an angle is refused
  Given the library holds the set "neon-bar"
  When the user adds "counter.png" to "neon-bar" as a plate without an angle
  Then the file is refused because a plate needs its camera angle
  And the folder of "neon-bar" holds no "counter.png"

Scenario: The same image twice is stored once
  Given "neon-bar" has the reference "bar.jpg"
  When the user adds a copy of "bar.jpg" named "bar-copy.jpg" to "neon-bar" as a reference
  Then "neon-bar" still has one reference "bar.jpg"

Scenario: A file of another type is refused
  Given the library holds the set "neon-bar"
  When the user adds "bar.gif" to "neon-bar" as a reference
  Then the file is refused because only png, jpg and webp images are allowed

## Out of Scope
- Removing a file (ST-030)

## Open Questions
- none
