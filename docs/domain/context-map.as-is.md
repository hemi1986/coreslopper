# As-is context map – coreslopper

> Recovered from code by `/adopt` on 2026-11-21 at b195086. This is **not a target**.
> Target: [context-map.md](context-map.md) · Gap register: [gap-register.md](gap-register.md).

Adopted slices: project and stage pipeline; human review (draft). Other areas – art-director verdicts, release, series canon,
character library, model bench, providers – appear only as neighbours until their own slice is adopted.

```mermaid
flowchart LR
  BC-Pipeline -->|reads canon, books canon spend separately| Series[Series canon - not adopted]
  BC-Review -->|open rounds come before the next autonomous stage; fixes reset qa-export| BC-Pipeline
  BC-Review -->|notes map to storyboard shots and timing sections| Storyboard[Storyboard and timing - not adopted]
  BC-Pipeline -->|done project feeds release| Release[Release - not adopted]
  BC-Pipeline -->|style-character done imports characters| Library[Character library - not adopted]
```

## Contexts

### BC-Pipeline – Pipeline
Purpose (as recovered): drives one project through the fixed stage list of its project kind (`music-video`,
`episode`), records each stage's status, outputs and attempts, and keeps the project budget.
Core terms: Project, Project Kind, Stage, Interactive Stage, Stage Reset, Review Mode, Hard Stop, Stage Runner,
budget, batch cap, next action, production phase (term unresolved, HS-1).
Evidence:
- control plane `projects/<slug>/state.json`, schema `StateSchema` (`packages/core/src/schema.ts:134-168`)
- configuration `projects/<slug>/project.yaml`, schema `ProjectConfigSchema` (`schema.ts:97-132`)
- stage lists and transitions (`packages/core/src/state.ts:18-341`), budget checks (`packages/core/src/cost.ts:13-38`)
- derived views (`packages/core/src/production.ts`), CLI writers `new`, `stage-*`, `spend`, `generate`
  (`packages/cli/src/index.ts:763-846`, `new-project.ts`, `generate.ts:757-759`)
Boundaries:
- Writers of `state.json`: the CLI (`new`, `stage-*`, `spend`, `generate`, `render` for `artifacts`) and the
  board wizard (`finishSetup`, `packages/cli/src/board-wizard.ts:344`). Agents never edit it directly; the
  workspace hook validates any edit (`workspace/.claude/hooks/validate-artifacts.mjs`).
- Readers only: `status`, the board production view, the watchdog (`packages/cli/src/production-watch.ts`).
- The orchestrating rules (interactive gate, review-mode stop, hard stops, batch size) live in agent
  instructions (`workspace/.claude/commands/video-next.md`, `workspace/.claude/agents/stage-runner.md`), not in code.

### BC-Review – Review
Purpose (as recovered): the user's frame-accurate notes on a render, sent to the agent in numbered rounds and
answered note by note; the human side of quality control, next to the automated critics.
Core terms: Review Note (draft, sent), Review Round (open, answered), reply and reply status, render.
Evidence:
- notes `review/notes/<video-stem>.json`, rounds `review/rounds/<NNN>.json`, replies `<NNN>.replies.json`
  (`packages/core/src/schema.ts:1349-1421`); pure helpers `packages/core/src/review.ts`
- writes and the lock `review/.notes.lock` (`packages/cli/src/board-review.ts:200-269`); board routes
  `/api/review/<slug>[/notes|/submit]` (`packages/cli/src/release-board.ts:373-392`)
- a second writer of notes: the desktop player (`scripts/review-player/review_notes.py`), without the lock
- replies validated by `validate-file` and the workspace hook; answered by a `review-fix` runner per
  `workspace/.claude/commands/video-next.md` and `workspace/.claude/skills/assembly-render/SKILL.md`
Boundaries:
- BC-Pipeline reads only the count of open rounds (`projectNextAction`, `status` `Review:` lines); the link
  back is the orchestrator's `stage-reset … qa-export`, an instruction, not code.
- The art director's verdicts (`assets/review/verdicts.jsonl`) share the word "review" but not this context.
