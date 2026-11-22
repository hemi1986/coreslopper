---
id: ST-037
title: Internal projects are created as such and end after QA
type: task
ui: true
priority: must
size: null
risk: null
depends_on: [ST-036]
labels: [feature:internal-projects]
status: in-progress
---

## Task
ST-036 makes `release` skip an internal project. This task makes the rest of the workflow treat it as finished.
Today `qa` reports thumbnails, Shorts, upload text and upload data as WARN and the release package as TODO. And the
board's `projectNextAction` returns `/video-next <slug>` with reason `release-missing` forever, so the card stays
under "your turn" and never folds away.

## Acceptance Criteria
- [ ] `new <slug> --distribution internal` and the board wizard (music video, episode, meme) write `distribution: internal` into `project.yaml`; without the option nothing is written
- [ ] `qa` on an internal project runs no thumbnail, Shorts, upload-text, upload-data or release-package checks and reports none of them as WARN or TODO; READY depends on the render checks only
- [ ] `projectNextAction` returns `where: none` with a new reason `internal-done` once every stage is done; the production view lists such a project in the finished group with the wording "Fertig – nicht öffentlich" / "Done – not released publicly", and it has no release tab
- [ ] The `video-qa` skill skips its release-package step for an internal project; `docs/pipeline.md`, `workspace/AGENTS.md` and `docs/glossary.md` describe `distribution`
- [ ] Tests cover the QA checks of an internal project and the next action; `npm test` and `npm run typecheck` are green

## Out of Scope
- Turning an internal project public again later beyond editing `distribution` and running `qa-export` once more
