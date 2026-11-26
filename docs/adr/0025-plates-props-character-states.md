---
status: accepted
date: 2026-11-17
---

# Plates, prop references, and character states

## Status

Accepted — 2026-11-17. Extends [ADR 0016](0016-episode-projects.md) (sets of a series canon) to music videos and adds continuity references for both kinds.

## Context

A keyframe is generated from a prompt and a few references: the character sheet, a set start frame, sometimes the previous shot. Everything else, such as where the camera stands, what the room looks like from there, which props are in it and how they are attached, and how the story has changed a character, lives only in the storyboard text. Each keyframe re-imagines it.

The second episode of a test series showed the cost. A robot opens a hatch in his chest and runs a cable to a Walkman. One derived reference showed the alligator clips dangling loose in front of the hatch. Every later close-up was an edit of that reference, so about twelve shots inherited the error, and the art director passed each one, because each looked fine on its own. Another shot put the robot inside the shelf and lost the Walkman. The storyboard said the right thing every time; text-only continuity was not enough. Fixing it afterwards took two review rounds, overlays, and new clips.

Recurring framings have the same weakness. When the same corner of a room is generated five times, its geometry and light drift, and characters land in impossible places.

## Decision

### Three kinds of continuity references

- A **plate** is an empty frame of a set from one fixed camera angle, in the set's light. `sets.yaml` lists plates per set: `plates: [{ id, angle, prompt?, ref? }]`.
- A **prop reference** is the one look of a recurring object. `sets.yaml` lists them at the top level: `props: [{ id, name, description, prompt?, refs }]`.
- A **character state** is a named look the story puts a character in, such as an open hatch, a cable to the Walkman, or headphones on. `characters.yaml` lists them per character: `states: [{ id, description, prompt?, ref?, from? }]`. `from` names the state it derives from (the sheet when absent), so chains of changes stay explicit.

Ids are unique within their list. Reference paths are relative to the folder of `sets.yaml` or `characters.yaml`.

### Music videos get sets too

A music video may have its own `sets.yaml` next to `characters.yaml`; an episode keeps using the canon's. Sets, plates, and props mean the same in both kinds, so one schema serves both. Without a `sets.yaml`, nothing changes.

### Shots name them

`refs.plate` (`<set>/<plate>`), `refs.props` (prop ids), and `refs.states` (`{ <character>: <state> }`) are optional. `validate` checks that each exists, that a state belongs to a character in the shot, and, in an episode, that the plate belongs to the scene's set. QA fails when a named plate, prop, or state has no reference image on disk.

### Keyframes are edits of the plate

When a shot names a plate, its keyframe is an `editImage` with `references[0]` = the plate, then the character state references (or sheets), then the prop references. The prompt says what to insert where ("put the robot from image 2 on the floor in front of the shelf in image 1, the Walkman from image 3 on the shelf, its red cable running into his open hatch"). The existing `qwen-edit` workflow takes up to 16 references; no new workflow is needed.

### The references come first and are reviewed alone

Plates, prop references, and character states are generated before any shot that uses them and are reviewed by the art director on their own, against the storyboard's description of the state. A shot's keyframe is then checked against its named state and props: what is attached to what, what is open, where cables lead.

### Who writes them

- Series: `new-series` creates plates and props with the canon. An episode's storyboard may **append** plates, props, and character states to the canon when its story needs them; it never changes an existing entry, since that would change the look and the cache keys of every earlier episode. The images are generated through the episode's budget and copied into the canon folders (`sets/<set>/plates/`, `props/<id>/`, `characters/<id>/states/`). This relaxes ADR 0016's "an episode never writes the canon" to append-only.
- Music video: `style-character` creates the project's sets, plates, props, and states from the treatment; `storyboard` may append more.

## Consequences

- One wrong reference is caught once, before it spreads, instead of shot by shot in review.
- Framings repeat exactly: shots in the same plate share geometry and light, and placement errors (a character inside furniture) become rare.
- More up-front generations: a few plates per set and one image per prop and state. Local edits cost nothing; paid ones go through the normal batch estimate.
- Old projects and canons stay valid; all new fields are optional.
- If prompt-only insertion places characters unreliably, the next step is a masked inpaint workflow (plate + mask + character reference), compared with plain `qwen-edit` through `model-bench` before it is adopted. It is not part of this decision.
