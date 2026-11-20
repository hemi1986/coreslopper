---
name: style-bible
description: Use when defining or revising a project's palette, typography, look references, motion rules, and its sets with plates and prop references, or when the art director reports inconsistent stills or set geometry.
license: MIT
---

# Style Bible

## When to use

- The project needs `style.yaml` before the storyboard or asset production.
- A visual reference changes and the palette or type must follow.
- The art-director critic finds inconsistent stills.
- The treatment has recurring places or objects that AI shots show more than once.

## Inputs

- `brief.md`, `treatment.md`
- `brand/<kit>/` or project brand overrides
- `docs/glossary.md`

## Process

1. Read the brief and treatment. Extract the visual rules that must stay stable: palette, type, light, texture, composition, motion.
2. Start from the brand kit when one exists. Project-specific overrides belong in the project, not in the workflow repo: a project-local `brand/brand.yaml` (with its fonts under `brand/`) replaces `brand/<project.brand>/`. Give a font file `weight` (`700` or `"200 700"`) and `style` when a family has several files.
3. Write `style.yaml` with:
   - `palette`: named hex colors.
   - `roles` (optional): map the renderer roles `background`, `surface`, `primary`, `secondary`, `accent`, `text`, `muted` to palette keys or hex colors when the palette uses its own names. Unmapped roles fall back to name hints, then neutral defaults.
   - `typography`: display, body, and mono families with weights.
   - `look`: keywords, negative prompts, licensed references.
   - `motion`: easing and grain.
4. Use only fonts and references whose licenses allow the project. OFL fonts are safe; commercial fonts need a license.
5. Check contrast and legibility at the target sizes. A color that looks good as a swatch may fail on a 9:16 screen.
6. If AI shots return to the same place or show the same object more than once, write the project's `sets.yaml` (music videos; an episode uses the series canon) — see "Sets, plates, and props" below.
7. Update the state with `npm run cli -- stage-done <project> style-character --outputs style.yaml` (plus `sets.yaml` when written) when the character bible is also ready.

## Sets, plates, and props

A **plate** is an empty frame of a set from one fixed camera angle; a **prop reference** is the one look of a recurring object (see `docs/glossary.md` and ADR 0025). Keyframes in a plate's framing are edits of the plate, so geometry and light stay the same across shots.

1. List the sets from the treatment: per set `id`, `name`, `description`, and `prompt`.
2. Per set, list the camera angles the treatment needs more than once, as `plates`: `id`, `angle` (position, height, lens, framing), and an optional `prompt`. Typical: a wide establishing angle, a medium angle on the main action spot, a close angle where objects are handled. Three to five per set is usual.
3. List the recurring objects as `props`: `id`, `name`, a `description` concrete enough to draw it the same way twice (shape, colour, material, size, what is attached and where), and an optional `prompt`.
4. Generate each plate empty, with no character, in the set's light and the style's look, at the master format's size; generate each prop alone on a neutral ground. Save plates under `sets/<set>/plates/<id>.png` and props under `props/<id>/`, and record the paths in `ref` and `refs`.
5. Review each plate and prop as soon as it exists: `npm run cli -- review-image <project> --image <ref> --ref plate:<set>/<plate>` (or `prop:<id>`), the review loop in `.claude/skills/ai-clips/SKILL.md`, step 6. Regenerate what fails with its `fix_prompt` before any shot uses it.


## Completion criteria

- `style.yaml` validates against `schema/style.schema.json`.
- Every palette/typography key that the storyboard references exists.
- The look keywords and negatives describe the same direction.
- Fonts and references have a recorded license.
- The style works at 16:9, 9:16, and 1:1.
- Every plate and prop in `sets.yaml` has a reference image the art director passed.

## Common failures

- A palette with no semantic names (`color1`, `color2`).
- A display font that is unreadable in a 9:16 crop.
- A reference image with no license.
- Changing the palette per shot without a story reason.
- A plate with a character or a loose prop in it: the plate must be empty, so it can host any shot.
- Plates of one set in different light or time of day.
