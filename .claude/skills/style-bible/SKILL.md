---
name: style-bible
description: Use when defining or revising a project's palette, typography, look references, and motion rules, or when the art director reports inconsistent stills.
license: MIT
---

# Style Bible

## When to use

- The project needs `style.yaml` before the storyboard or asset production.
- A visual reference changes and the palette or type must follow.
- The art-director critic finds inconsistent stills.

## Inputs

- `brief.md`, `treatment.md`
- `brand/<kit>/` or project brand overrides
- `docs/glossary.md`

## Process

1. Read the brief and treatment. Extract the visual rules that must stay stable: palette, type, light, texture, composition, motion.
2. Start from the brand kit when one exists. Project-specific overrides belong in the project, not in the workflow repo.
3. Write `style.yaml` with:
   - `palette`: named hex colors.
   - `typography`: display, body, and mono families with weights.
   - `look`: keywords, negative prompts, licensed references.
   - `motion`: easing and grain.
4. Use only fonts and references whose licenses allow the project. OFL fonts are safe; commercial fonts need a license.
5. Check contrast and legibility at the target sizes. A color that looks good as a swatch may fail on a 9:16 screen.
6. Update the state with `npm run cli -- stage-done <project> style-character --outputs style.yaml` when the character bible is also ready.

## Completion criteria

- `style.yaml` validates against `schema/style.schema.json`.
- Every palette/typography key that the storyboard references exists.
- The look keywords and negatives describe the same direction.
- Fonts and references have a recorded license.
- The style works at 16:9, 9:16, and 1:1.

## Common failures

- A palette with no semantic names (`color1`, `color2`).
- A display font that is unreadable in a 9:16 crop.
- A reference image with no license.
- Changing the palette per shot without a story reason.
