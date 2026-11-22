---
id: ST-007
title: Project kind meme with its stages
type: tech-task
ui: false
priority: must
size: null
risk: null
depends_on: []
labels: [feature:meme]
status: done
---

## Task
Groundwork every other meme story needs: the third project kind `meme` (ADR 0051, proposed) with its stages, so
`state.json`, `/video-next`, `status`, and the board's production view treat a meme like the other kinds.

Stages (Q11): `setup` ✋, `script` ✋, `style-character`, `voice-track`, `episode-track`, `storyboard`, `assets`,
`assembly`, `qa-export`. The interactive stages belong to `/new-meme`; `/video-next` refuses to start while one is
open, as for the other kinds.

## Acceptance Criteria
- [x] `ProjectKindSchema` accepts `meme`; a missing kind still means `music-video`; `npm run schema` regenerated
- [x] A meme's state has exactly the nine stages above, in that order; `setup` and `script` are interactive
- [x] `status <meme>` and the production view name `/new-meme <slug>` as the next command while `script` is open
- [x] The template `templates/meme/` holds `project.yaml` (kind meme, the one 9:16 format) and an empty `pitch.md`
- [x] `docs/glossary.md`, `workspace/AGENTS.md`, and `docs/pipeline.md` describe the kind; `scripts/runtime-files.mjs` classifies every new path
- [x] `episode-track` refuses a meme track over 30 seconds as a hard stop (HS-264)
- [x] Tests cover the stage list and the next command; `npm test` and `npm run typecheck` are green
