---
id: ST-006
title: List the sound library for the meme skill
type: task
ui: false
priority: must
size: null
risk: null
depends_on: [ST-001]
labels: [feature:meme]
status: ready
---

## Task
Read model RM-SoundLibrary: `sound list [--tag <t>] [--json]` prints every library sound with id, title, use when,
tags, length, loudness, cue, trim, licence, and the memes whose takes came from it ("used in"). The `new-meme` skill
reads the JSON to propose one to three candidates per moment of a script (ST-010); the user reads the table.

## Acceptance Criteria
- [ ] `sound list` prints one row per library sound, sorted by id; an empty library prints a hint to `sound add`
- [ ] `--tag reveal` lists only sounds with that tag
- [ ] `--json` prints every field of RM-SoundLibrary, including "used in" from the memes' take registries
- [ ] Covered by a test on a fixture library with two sounds and one meme that took one of them
