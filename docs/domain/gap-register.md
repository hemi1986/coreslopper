# Gap register

> Generated rows come from `docs/domain/events.yaml`; decisions and manual gaps live outside the managed block.
> As-is map: [context-map.as-is.md](context-map.as-is.md) · Target map: [context-map.md](context-map.md).

<!-- kataster:gap-register:begin -->
<!-- Generated from docs/domain/events.yaml by gap-register.ts. Do not edit inside this block. -->
| Gap | Kind | Aggregate | As-is | Target | Evidence | Next step |
|---|---|---|---|---|---|---|
| GAP-AGG-Project | as-is boundary | [AGG-Project](events.yaml) | [BC-Pipeline](context-map.as-is.md#bc-pipeline--pipeline) | – | state.json per project, loaded and saved as one document (packages/core/src/project.ts:171-184,233-236)<br>stage transitions mutate one State (packages/core/src/state.ts:250-324)<br>budget ledger inside the same State (packages/core/src/state.ts:326-341) | Decide the target boundary |
<!-- kataster:gap-register:end -->

## Gaps found by the adoption of the project and stage pipeline (2026-11-21)

Candidates only – no stories until the user asks (`/adopt <scope> --stories`). Priority is a suggestion.

| # | Class | Gap | Evidence | Source | Priority |
|---|---|---|---|---|---|
| G-1 | Exists but contradicts | `state.json` has no write lock; a long `generate` batch saves the state it loaded at its start and can overwrite a parallel `stage-*`, `spend`, wizard, or `render` write, losing recorded spend | `packages/cli/src/generate.ts:255,758-759`; `packages/core/src/project.ts:171-184` | HS-15 | high |
| G-2 | Exists but contradicts | No stage transition is guarded (start, complete, fail, skip from any status; interactive stages startable) | `packages/core/src/state.ts:250-324` | HS-11 | high |
| G-3 | Exists but contradicts | A stage reset accepts a running stage and leaves later done stages done, so a project can count as done with stale assets and renders | `packages/core/src/state.ts:310-324` | HS-12 | high |
| G-4 | Exists but contradicts | Seven stage skills call `stage-done` themselves, partly with other outputs (`preview-16x9.mp4` vs `preview-{master}.mp4`) | `workspace/.claude/skills/{audio-analysis,storyboard,assembly-render,video-qa,episode-track,style-bible,character-bible}/SKILL.md` | HS-7 | medium |
| G-5 | Exists but contradicts | All stages done without a release folder: next action says `/video-next` (qa-export), which stops as done | `packages/core/src/production.ts:105`; `workspace/.claude/commands/video-next.md` step 5 | HS-13 | medium |
| G-6 | Exists but contradicts | `/video-next` answers review rounds before it checks for an open interactive stage | `video-next.md` steps 4 and 6 | HS-14 | low |
| G-7 | Exists but contradicts | Hard stop lists diverge (`workspace/AGENTS.md` 3, `docs/pipeline.md` and `docs/architecture.md` 4, `video-next.md` adds two) | listed files | HS-4 | low |
| G-8 | Exists but contradicts | `workspace/AGENTS.md` and `docs/architecture.md` claim input hashes make the pipeline resumable; nothing passes or compares them | `packages/cli/src/index.ts:779`; `workspace/AGENTS.md` "Resumable and thrifty" | HS-10 | low |
| G-9 | Exists but contradicts | Next action and board ignore `review_mode: final`; only `/video-next` stops | `packages/core/src/production.ts:98`; `video-next.md` step 6 | HS-8 | low |
| G-10 | Exists but contradicts | The next-action reason is `retry`; the glossary word is resume | `packages/core/src/production.ts:28` | HS-2 | low |
| G-11 | Exists but contradicts | The phase value `setup` beside the stage ID `setup` | `packages/core/src/production.ts:11` | HS-1 | low |
| G-12 | Exists but contradicts | ADR 0016 still names `series/<slug>/` and says `/video-next` reads the stage list from `status`, while `video-next.md` hard-codes both lists | `docs/adr/0016-episode-projects.md:33`; `video-next.md` stage loop step 1 | – | low |
| G-13 | Missing | No command changes a project's budget; raising it means editing `project.yaml` and `state.json` by hand | `packages/cli/src/validate-file.ts:164-170` | HS-5 | medium |
| G-14 | Missing | The clock cannot be injected into core's transitions | `packages/core/src/state.ts` (`new Date()`) | conventions | low |
| G-15 | Dead | `budget.reservedUsd` – never set, still subtracted and shown as "reserved" | `packages/core/src/state.ts:199,327`; `packages/cli/src/board/production.js:241` | HS-9 | low |
| G-16 | Dead | `StageDefinition.mechanical` and `stageOutputs` have no reader in the packages | `packages/core/src/state.ts:9,158` | – | low |

## Decisions

- GAP-AGG-Project: the boundary stays as recovered (`as-is`); no target boundary was decided in this adoption.
- Exists and is intended (no action): kind-specific stage lists in code (ADR 0016); interactive stages run by
  the setup skill; budget check before a batch and on every recorded spend; the append-only error history
  (`state.errors`); the read-only production view and watchdog (ADR 0030, 0031); the import direction between
  packages (now checked).
