---
name: storyboard
description: Use when turning a treatment and timing into a validated shot list, checking full-song coverage, writing storyboard.md, or generating a contact sheet.
license: MIT
---

# Storyboard

## When to use

- `timing.json` (or effective timing) and a treatment exist.
- The user wants to add, remove, reorder, or re-time shots.
- Validation reports a gap, overlap, missing reference, or source-rule violation.

## Inputs

- `treatment.md`, `timing.json`, `timing.overrides.json`
- `style.yaml`, `characters.yaml`
- `docs/glossary.md`
- The storyboard schema in `packages/core/src/schema.ts`

## Process

1. Read the treatment, effective timing, style bible, and character bible.
2. Use the `grilling` skill to sharpen the shot list before writing it: what each shot must accomplish, which lyric or beat it lands on, and why its source is motion, AI clip, footage, or mixed.
3. Write `storyboard.yaml`:
   - Shots ordered by start time, IDs `shot-001`, `shot-002`, …
   - Symbolic anchors (`section`, `line`, `word`, `beat`, `downbeat`, or `time` only as an escape hatch).
   - Source-specific fields: `motion.component`, `prompts.keyframe`/`prompts.video`, `asset`, or `layers` for mixed shots.
   - Text, highlights, transition, style refs, character refs, and chaining when relevant.
4. Run `npm run cli -- validate projects/<slug>`. Fix schema errors, unresolved anchors, gaps, overlaps, missing references, and source-rule violations.
5. Run `npm run cli -- contact-sheet projects/<slug>`.
6. Write `storyboard.md` with a human-readable table and the coverage notes. Keep it derived from the YAML; do not invent shots there.
7. Ask the art-director or a storyboard critic to review the visual flow. Make at most three automatic revisions, then stop and record the remaining concerns in the review report.
8. Update the state with `npm run cli -- stage-done <project> storyboard --outputs storyboard.yaml,storyboard.md,review/contact-sheet.svg`.

## Completion criteria

- `storyboard.yaml` passes schema validation.
- Shots start at 0, end at the song duration, and have no gaps or overlaps.
- Every style and character reference exists.
- Every source-specific rule is satisfied.
- `storyboard.md` and the contact sheet reflect the YAML.
- No shot uses an unlicensed asset or an unresolved character.

## Common failures

- Hard-coded seconds instead of anchors.
- A gap hidden by a long crossfade.
- A mixed shot with only one layer.
- Text highlights that are not in the on-screen text.
- A storyboard that ignores a whole section of the song.
