---
name: character-bible
description: Use when a video has recurring characters and needs consistent reference images, character sheets, and per-character prompt rules before AI shot generation.
license: MIT
---

# Character Bible

## When to use

- A storyboard has `ai-clip` or `mixed` shots with recurring people or creatures.
- The art director reports that a character changes face, costume, or silhouette.
- A new character enters the treatment.

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
6. Update the state with `npm run cli -- stage-done <project> style-character --outputs style.yaml,characters.yaml` when the style bible is also ready.

## Completion criteria

- Every recurring character has a sheet and at least one reference image.
- `characters.yaml` validates against `schema/characters.schema.json`.
- Every character shot in the storyboard references a character that exists.
- The art-director critic passes the sheet.
- The generated files are in the project, not the workflow repo, and the manifest records the cost.

## Common failures

- A text-only character description with no reference image.
- A sheet that looks good at 4K but has no readable silhouette at 200 px.
- A costume change between shots with no story reason.
- Committing a generated sheet that contains a recognizable real person or a copyrighted character.
