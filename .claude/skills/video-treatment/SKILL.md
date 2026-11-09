---
name: video-treatment
description: Use when turning a music-video brief into a visual concept, dramaturgy, and shot-mix plan, or when revising the treatment before the storyboard.
license: MIT
---

# Video Treatment

## When to use

- `brief.md` exists and the project needs `treatment.md`.
- The visual direction is generic and needs a stronger idea.
- The shot mix changes between motion, AI clips, footage, and mixed shots.

## Inputs

- `brief.md`
- `lyrics.txt` and `song.json` (duration, language)
- `brand/<kit>/` or project brand overrides
- `docs/glossary.md`

## Process

1. Read the brief and lyrics. Identify the emotional arc and the sections that carry it.
2. Use the `grilling` skill to pressure-test the core idea, the visual world, and the shot mix. Ask what the viewer should feel at the first chorus and at the last frame.
3. Write `treatment.md` with: Core idea, Visual world, Dramaturgy (section by section), Shot mix, References.
4. Make the shot mix explicit: which sections are motion, AI, footage, or mixed, and why. A shot may still change in the storyboard; the treatment sets the intent.
5. Check every visual reference for license and availability. Do not build the treatment on footage the project cannot use.
6. Update the state with `npm run cli -- stage-done <project> treatment --outputs treatment.md`.

## Completion criteria

- The core idea can be stated in one sentence.
- Every song section has a visual intention.
- The shot mix names the source types and the reason for each.
- The treatment does not contradict the brief's budget, formats, or rights.
- References are either original, licensed, or clearly marked as inspiration only.

## Common failures

- A moodboard with no dramaturgy.
- "AI will figure it out" instead of a visual idea.
- Promising expensive AI shots without checking the project budget.
- Using copyrighted film stills as if they were production assets.
