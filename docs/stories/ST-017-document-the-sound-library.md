---
id: ST-017
title: Document how the user maintains the sound library
type: task
ui: false
priority: must
size: null
risk: null
depends_on: [ST-001, ST-002, ST-003, ST-004]
labels: [feature:meme]
status: in-progress
---

## Task
The user asked how to maintain the meme sounds by hand. A workspace docs page `docs/sound-library.md` (English; a
German `sound-library.de.md` like the board guide) explains:

- where the library lives (`library/sounds/<id>/sound.yaml` + one WAV), what is tracked and what is gitignored
- every field, with examples of a good `use when` (what the sound means in a meme, not what it sounds like) and how
  to find a cue (seconds from the trimmed start to the hit)
- `sound add|edit|remove|list|check` with examples, and that hand edits of `sound.yaml` are allowed and validated
  (`sound remove` is ST-003's; the page ships after that story, see `OPEN_QUESTIONS.md`)
- licences: `unknown` by default, what the release check makes of it, where to note a credit
- what happens to memes when a sound changes or is removed

## Acceptance Criteria
- [x] Both pages exist, are listed in `workspace/AGENTS.md` Documentation and shown in the board's guide view
- [x] `scripts/runtime-files.mjs` classifies them as shipped; `tests/runtime-files.test.ts` is green
- [x] Every command and field in the page exists in the CLI and the schema (checked against `sound --help` and `LibrarySoundSchema`)
