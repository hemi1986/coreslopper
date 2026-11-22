---
paths:
  - "packages/core/src/state.ts"
  - "packages/core/src/project.ts"
  - "packages/core/src/production.ts"
  - "packages/core/src/cost.ts"
  - "packages/cli/src/status.ts"
  - "packages/cli/src/new-project.ts"
  - "packages/cli/src/board-production.ts"
  - "packages/cli/src/production-watch.ts"
  - "packages/cli/src/board/production.js"
  - "workspace/.claude/commands/video-next.md"
  - "workspace/.claude/agents/stage-runner.md"
---

# Pipeline (BC-Pipeline)

> Concept slice across `core`, `cli`, and the workspace orchestrator. Adopted 2026-11-21; model in
> `docs/domain/events.yaml` (`AGG-Project`), gaps in `docs/domain/gap-register.md`.

## Purpose

Drives one project through the fixed stage list of its project kind, from setup to qa-export, and keeps its
budget. The orchestrator (`/video-next`) runs autonomous stages; the setup skill runs interactive ones.

## Key terms

Project, Project Kind, Stage, Interactive Stage, Stage Runner, Stage Attempt, Stage Skip, Stage Reset, Review
Mode, Hard Stop, Production Phase – defined in `docs/glossary.md`. Resume a failed stage; reset a finished one.

## As-is boundary

- `projects/<slug>/state.json` is the consistency boundary: `loadProject` → one transition in
  `packages/core/src/state.ts` → `saveState`. `project.yaml` owns the configuration; `budget_usd` there is the
  budget's source, `state.json` holds an equal copy.
- Writers: the CLI (`new`, `stage-*`, `spend`, `generate`, `render`) and the board wizard for `setup` only
  (ADR 0037, proposed). Readers: `status`, the board production view, the watchdog.
- Orchestration rules (interactive gate, review-mode stop, hard stops) live in
  `workspace/.claude/commands/video-next.md`; the next step for the board is `projectNextAction`.

## Boundaries

- Change a state rule in `packages/core/src/state.ts` and its schema in `schema.ts` (then `npm run schema`).
- Keep `production.ts` pure and the production view and watchdog read-only.
- Route every state write through core's transitions and `saveState`; agents change state only via `stage-*`.
- The confirmed lifecycle (legal transitions, reset cascade, concurrent writers) is ahead of the code: build it
  as stories from the gap register, and keep `tests/state-characterization.test.ts` green.

## Typical pitfalls

- Transitions mutate the loaded `State` and read the clock themselves; there is no write lock (G-1, G-14).
- `migrateState` runs in memory on every load; a migration persists only with the next write.
- Stage lists exist per kind (`stagesFor`); `STAGES`/`STAGE_IDS` are the music-video list only.
- A stage-ID change touches the stage list, `video-next.md`'s hard-coded lists, and the skills' `stage-done` lines.

## Read next

- `docs/glossary.md` and `CONTEXT.md`
- `docs/domain/events.yaml`, `docs/domain/context-map.as-is.md`, `docs/domain/gap-register.md`
- `docs/architecture/data-model.md`, `docs/engineering/conventions.md`
