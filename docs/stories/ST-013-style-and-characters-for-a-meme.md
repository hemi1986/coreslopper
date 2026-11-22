---
id: ST-013
title: The style-character stage of a meme
type: task
ui: false
priority: must
size: null
risk: null
depends_on: [ST-007, ST-010]
labels: [feature:meme]
status: ready
---

## Task
A meme has no canon, so its `style-character` stage runs autonomously and asks nothing (Q11, Q12). The stage
skills `style-bible` and `character-bible` (workspace payload; load `writing-for-agents`) gain a meme section:

- Style bible and set bible from `pitch.md`, the script and the user references – one or two sets is typical.
- The chosen library characters are already in the character bible (`character use`); every other speaker of the
  script is invented with character sheet and reference voice, through the generation queue and the art director.
- Completing the stage takes new characters into the character library (POL-ImportFinishedCharacters, also for memes).

## Acceptance Criteria
- [ ] Both skills say what a meme reads and writes, and that the stage never asks the user
- [ ] `stage-done <meme> style-character` imports the meme's new characters into the library (test)
- [ ] `validate <meme>` after the stage checks every speaker against the character bible (test)
- [ ] Tried in a sandbox workspace: one library character plus one invented character
