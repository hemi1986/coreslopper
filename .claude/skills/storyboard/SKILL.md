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
   - Lip-sync shots: `source: ai-clip` plus `lipSync: { character: <id> }`. Anchor start/end tightly to the sung line (word timestamps), keep each ≤ 30 s, and write `prompts.keyframe` for a frontal face shot.
   - Text, highlights, transition, style refs, character refs, and chaining when relevant.
   - `focus: { x, y }` (0–1) when the essential subject sits off-centre, such as a mirror reflection or a face at the edge, so that 9:16 and 1:1 crops keep it in view.
   - AI shots follow the composition rules below.
4. Run `npm run cli -- validate projects/<slug>`. Fix schema errors, unresolved anchors, gaps, overlaps, missing references, and source-rule violations.
5. Run `npm run cli -- contact-sheet projects/<slug>`.
6. Write `storyboard.md` with a human-readable table and the coverage notes. Keep it derived from the YAML; do not invent shots there.
7. Ask the art-director or a storyboard critic to review the visual flow. Make at most three automatic revisions, then stop and record the remaining concerns in the review report.
8. Update the state with `npm run cli -- stage-done <project> storyboard --outputs storyboard.yaml,storyboard.md,review/contact-sheet.svg`.

## Composition rules for AI shots

Image and video models reliably break hands, limbs, and touching bodies. Prompting against a defect rarely fixes it; compose so it cannot occur.

- **Hands:** no hand-on-hand contact, interlaced fingers, or hands manipulating small objects (controllers, cups, phones) in close-up. Keep hands out of frame, resting, or at a distance; cut to the face instead.
- **Groups:** no seated groups or people overlapping in depth (table scenes, over-the-shoulder shots across several people). Use single-person shots, or a frontal shot with clear gaps between people.
- **Full body in motion:** walking or spinning wide shots risk extra limbs. Prefer medium framing, or hide the lower legs behind foreground objects.
- **Location:** every `prompts.keyframe` names the scene's location explicitly (for example "on the gravel path between headstones in the cemetery"). Close-ups otherwise drift into a generic default background such as a city street.
- **Lip-sync keyframes:** frontal face, modest clothing (high neckline, covered shoulders), neutral wording. Lip-sync models reject revealing outfits and words such as "sexy", "intimate", or "seductive".

## Completion criteria

- `storyboard.yaml` passes schema validation.
- Every AI shot follows the composition rules.
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
