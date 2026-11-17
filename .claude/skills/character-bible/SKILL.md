---
name: character-bible
description: Use when a video has recurring characters and needs consistent reference images, character sheets, character states, and per-character prompt rules before AI shot generation.
license: MIT
---

# Character Bible

## When to use

- A storyboard has `ai-clip` or `mixed` shots with recurring people or creatures.
- The art director reports that a character changes face, costume, or silhouette.
- A new character enters the treatment.
- The story changes how a character looks from some shot on (something opened, attached, worn, broken).

## Inputs

- `brief.md`, `treatment.md`, `style.yaml`
- `config/models.yaml` (character-sheet and image-edit roles)
- `packages/providers` (generation adapter)
- `docs/glossary.md`

## Process

1. Read the treatment and style bible. Decide which characters need a sheet. A one-off background figure may not.
2. Write a precise description for each character: age range, silhouette, face, hair, wardrobe, materials, palette anchors, and what must never change.
3. Generate a character sheet with `generateImage` or `editImage`. Use at least one reference image when revising a sheet; never rely on text alone for a recurring character.
4. Save the sheet and 2–4 usable reference images under the project's gitignored `characters/<id>/`. Record them in `characters.yaml` with `sheet`, `refs`, and the prompt.
5. Run the art-director critic on the sheet. Check identity, costume, palette, and readability at small sizes. Regenerate with a corrected prompt if it fails.
6. Add the **character states** the treatment or script needs (see below).
7. Update the state with `npm run cli -- stage-done <project> style-character --outputs style.yaml,characters.yaml` when the style bible is also ready.

## Character states

A **character state** is a named look the story puts a character in from some shot on: a hatch open, a cable plugged in, headphones on (`docs/glossary.md`, ADR 0025). Every later keyframe derives from the state's reference, so one wrong state reference spreads into every shot after it. Make each one right before anything uses it.

1. Per change in the story, add a state under the character's `states`: `id`, a `description` that says exactly what differs from the sheet and where things lead ("chest hatch open on its left hinge; red cable runs from inside the hatch out of frame to image-right, to the Walkman; no loose clips"), an optional `prompt`, and `from` when it builds on another state.
2. Generate the reference as an `editImage` of the sheet (or of the `from` state's reference) at the master format's size, with the character's full figure, and save it under `characters/<id>/states/<state>.png`; record it in `ref`.
3. Have the `art-director` review the state on its own, against its `description`: count limbs, check every attachment end to end (both ends of a cable, what holds what), and compare with the sheet for identity. Regenerate until it passes.
4. Never derive a state from a shot keyframe; derive it from the sheet or another reviewed state.


## Completion criteria

- Every recurring character has a sheet and at least one reference image.
- `characters.yaml` validates against `schema/characters.schema.json`.
- Every character shot in the storyboard references a character that exists.
- The art-director critic passes the sheet.
- Every state a shot names has a reference the art director passed against its description.
- The generated files are in the project, not the workflow repo, and the manifest records the cost.

## Common failures

- A text-only character description with no reference image.
- A sheet that looks good at 4K but has no readable silhouette at 200 px.
- A costume change between shots with no story reason.
- A state described only in the storyboard text, with no state reference: each keyframe re-imagines it differently.
- Committing a generated sheet that contains a recognizable real person or a copyrighted character.
