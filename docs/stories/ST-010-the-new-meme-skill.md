---
id: ST-010
title: The new-meme skill grills the pitch into a script
type: task
ui: false
priority: must
size: null
risk: null
depends_on: [ST-006, ST-008, ST-009]
labels: [feature:meme]
status: in-progress
---

## Task
CMD-WriteMemeScript is agent work: a new workspace skill `workspace/.claude/skills/new-meme/SKILL.md` (load
`writing-for-agents` first; frontmatter only `name`, `description`, `license`). `/new-meme <slug>` resumes a meme
whose setup or script is open; without a wizard run it asks for the pitch itself and runs `new --kind meme`.

What it does (Q9, Q15):
1. Reads `pitch.md`, the user references, the chosen characters and `sound list --json` before the first question.
2. Grills the user with the `grilling` skill to the punchline: setup → twist → payoff, who speaks, what is seen,
   where the sound lands. The pitch is a starting point, not a decision.
3. Per moment it proposes one to three library sounds by use when, tags, length and cue and names why; the user
   picks. With none fitting it writes a generated sound line (`prompt`) and notes it as a candidate for the library.
   An empty sound library is said once, at the start.
4. Writes `script.yaml` (German spoken text, the TTS rule), aims at about 15 seconds and never over 30, and
   completes the `script` stage; then names `/video-next <slug>`.

## Acceptance Criteria
- [ ] The skill exists in `workspace/.claude/skills/new-meme/` and is listed in `workspace/AGENTS.md` and `skills-lock.json` where own skills are listed
- [ ] It reads pitch, references, characters and the sound library before the first question
- [ ] It proposes library sounds with the reason from their use when and writes `sound: <id>` lines; it falls back to a prompt line and says so
- [ ] Its script passes the meme validation (ST-009) and it completes `script` through `stage-done`
- [ ] Tried end to end in a sandbox workspace (`npm run dev:workspace`) with a library of three sounds
