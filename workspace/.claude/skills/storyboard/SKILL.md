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
- `style.yaml`, `characters.yaml`, `sets.yaml` (plates, props) when present
- The user references in `references.yaml` of kind `storyboard` and `footage`: shots the user drew or filmed keep their framing and timing unless the treatment changed them.
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
   - `focus: { x, y }` (0–1) when the essential subject sits off-centre, such as a mirror reflection or a face at the edge, so that 9:16 and 1:1 crops keep it in view. It applies only to formats narrower than 16:9.
   - AI shots follow the composition rules below and name their continuity references (next section).
4. Run `npm run cli -- validate projects/<slug>`. Fix schema errors, unresolved anchors, gaps, overlaps, missing references, and source-rule violations.
5. Run `npm run cli -- contact-sheet projects/<slug>`.
6. Write `storyboard.md` with a human-readable table and the coverage notes. Keep it derived from the YAML; do not invent shots there.
7. Ask the art-director or a storyboard critic to review the visual flow. Make at most three automatic revisions, then stop and record the remaining concerns in the review report.
8. Update the state with `npm run cli -- stage-done <project> storyboard --outputs storyboard.yaml,storyboard.md,review/contact-sheet.svg`.

## Episodes

For a project with `kind: episode` the storyboard covers the episode track instead of a song. What changes:

- Inputs: `script.yaml` replaces the treatment and lyrics. Style, characters, and sets come from the series canon in `projects/<series>/`; the project has no copies. You never change existing canon entries from an episode; you may only append plates, props, and character states (see "Continuity references").
- Each scene is one section. Anchor shots to `section` and `line` edges; an episode has no beats, so `beat` and `downbeat` anchors fail.
- A shot in a set names it in `refs.sets`. It must be the set of the shot's scene, and so must its plate; a cutaway to another place is its own scene in the script.
- Show chat lines with `motion.component: ChatWindow` and `motion.props.lines: [<chat line ids>]`, chat lines of the shot's own scene. The window types each message at the script's typing speed.
- Prompts name the set's prompt anchor from `sets.yaml`, so keyframes of one set match across episodes.
- Keep text overlays out of the lower fifth of a 9:16 frame: burned-in subtitles sit there.
- Copy lyric `text` from `lyrics.txt` as written, parentheses included. The renderer drops Suno parentheses on screen (`My Machine (my machine)` shows as `My Machine my machine`); leave out a backing vocal you do not want on screen.
- A lip-sync shot (`lipSync: { character: <id> }`) is driven by that character's speaker stem. Only characters with the display rule `full` or `screen-only` can have one. `validate` rejects a shot longer than `maxDuration` of `video.lipsync` for the selected provider or than `limits.lipsync_seconds_max` of the series; anchor it to the line's `start` and `end`.

## Memes

A project with `kind: meme` covers its episode track like an episode, but is one 9:16 clip of at most 30 seconds.

- A shot may land on the hit of a library sound: give a `line` anchor the edge `cue` (`edge: cue`) on a sound line – an `sfx` line with `sound: <id>`. It resolves to the line's start plus the sound's cue, and an offset in seconds still applies.
- `edge: cue` on any other line, or on a library sound without a cue, fails validation.

## Continuity references

A keyframe re-imagines everything its references do not pin down. Pin down what must stay the same (ADR 0025):

- **Plate:** an AI shot in a recurring framing names it as `refs.plate: <set>/<plate>`; its keyframe will be an edit of that empty frame. Shots that cut between each other in the same framing name the same plate.
- **Props:** `refs.props` lists every recurring object visible in the shot, by its prop id in `sets.yaml`.
- **States:** `refs.states: { <character>: <state> }` names how each character looks from the moment the story changed them, in every shot after that moment, not only the first. Write down where attachments lead in the shot's prompt as well ("the red cable runs from his open hatch to the Walkman on the shelf").
- Missing plates, props, or states: add them first. A music video adds them to its own `sets.yaml` and `characters.yaml`; an episode may **append** them to the canon, never change an existing entry. Generate and review them as the `style-bible` and `character-bible` skills describe before the assets stage uses them.
- Placement: say where a character stands relative to the plate's furniture ("on the floor in front of the shelf", not "at the shelf"), so nobody lands inside it.

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
- Every style, character, plate, prop, and state reference exists.
- Every AI shot after a story change names the character's state.
- Every source-specific rule is satisfied.
- `storyboard.md` and the contact sheet reflect the YAML.
- No shot uses an unlicensed asset or an unresolved character.

## Common failures

- Hard-coded seconds instead of anchors.
- A gap hidden by a long crossfade.
- A mixed shot with only one layer.
- Text highlights that are not in the on-screen text.
- A storyboard that ignores a whole section of the song.
- Continuity kept only in prose: a state change described in one shot's description and forgotten in the next shots' refs.
