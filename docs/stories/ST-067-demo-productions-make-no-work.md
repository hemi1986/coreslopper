---
id: ST-067
title: Demo productions are marked and make no work
type: task
ui: false
priority: should
size: null
risk: null
depends_on: []
labels: [feature:demo-projects]
feature: demo-projects
status: done
---

## Context
Feature `demo-projects`, decided by the user on 2026-11-28 (flow `FLOW-DemoProductions`, glossary **Demo
Production**). Every workspace ships `projects/demo` ("Neon Rain"), `projects/demo-episode` ("After Midnight") and
`projects/demo-series` ("Night Desk"). They stay in the workspace for the docs, `npm run demo:*` and the tests, but
today they behave like real productions: `demo-episode` sits at voice-track with `/video-next demo-episode` as its
next step, and the production watch reports them.

Rules (AGG-Project, AGG-Series, RM-NextAction, RM-BoardActivity):
- A project or series is a demo only when its **own** `project.yaml` / `series.yaml` says `demo: true`. An episode
  does not inherit it from its series. Nothing but a hand edit writes it – not the wizard, not `new`, not
  `new-series`. Demos are never detected by slug.
- A demo has no next action: `projectNextAction` answers `{ where: 'none', reason: 'demo' }` before every other
  rule (`packages/core/src/production.ts:108-118`), also while one of its stages runs.
- The production scan (`scanProduction`, `packages/cli/src/production-watch.ts`) leaves a demo out of the snapshot,
  so it produces no watch event and no stall warning. No push channel exists today; whatever later reads the
  watch events gets none for a demo.
- `update` keeps a locally deleted demo deleted (`packages/cli/src/update.ts:245`, `skipped-deleted-locally`) –
  already the case, pinned by a test here.

## Task
- `demo` as an optional boolean on `ProjectConfigSchema` and `SeriesSchema` (`packages/core/src/schema.ts`), unset
  meaning `false`; `npm run schema` regenerates `schema/`; `validate-file` accepts it.
- `demo: true` in the three shipped demos.
- The reason `demo` in `projectNextAction` and wherever a next action is shown (the board's card shows no command
  for it).
- The production scan skips demos.
- A test for `update` with a deleted demo.
- `docs/onboarding.md` says the demos can be deleted and that `update` does not bring them back.

## Acceptance Criteria
- [x] `project.yaml` and `series.yaml` validate with `demo: true` and with no `demo`; `demo: "yes"` is refused with
      the field named (test)
- [x] `projects/demo`, `projects/demo-episode` and `projects/demo-series` carry `demo: true`, and `schema/` is
      regenerated
- [x] A demo whose voice-track stage is pending has the next action `{ where: 'none', reason: 'demo' }` with no
      command; an episode without `demo` in a demo series still gets `/video-next <slug>` (test)
- [x] A production scan over a workspace with a stalled demo and a stalled real project writes events and a stall
      warning for the real project only (test)
- [x] `update` after the user deleted `projects/demo-episode` leaves it deleted and reports it (test)
- [x] `docs/onboarding.md` names the three demos and says they can be deleted

## Out of Scope
- The board's filter and the **Show demos** switch (ST-069)
- The release side: calendar slots, autopilot, approval (ST-068)
- `status <demo>` on the command line keeps showing the stages as it does today

## Open Questions
- none
