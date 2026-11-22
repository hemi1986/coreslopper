---
paths:
  - "packages/cli/src/npx.ts"
  - "packages/cli/src/init.ts"
  - "packages/cli/src/init-command.ts"
  - "packages/cli/src/onboarding.ts"
  - "packages/cli/src/update.ts"
  - "packages/cli/src/workspace.ts"
  - "packages/cli/src/tools.ts"
  - "packages/cli/src/doctor.ts"
  - "packages/cli/src/migrate-layout.ts"
  - "scripts/build-runtime.mjs"
  - "scripts/runtime-files.mjs"
  - "scripts/dev-workspace.mjs"
  - "scripts/setup.sh"
  - "scripts/install-ffmpeg.sh"
  - "tsup.config.ts"
  - "docker/**"
  - "compose.yaml"
  - "workspace/.gitignore"
  - "workspace/skills-lock.json"
  - "workspace/.claude/settings.json"
  - "tests/init.test.ts"
  - "tests/update.test.ts"
  - "tests/migrate-layout.test.ts"
  - "tests/runtime-files.test.ts"
  - "tests/workspace-characterization.test.ts"
  - "docs/onboarding.md"
---

# Workspace (BC-Workspace)

> Concept slice across the npx CLI, init, onboarding, update, doctor and migrate-layout in the CLI, the runtime
> build, and the board container. Adopted 2026-11-22. Decided by recommendation plus four answers from the user. The
> model is in `docs/domain/events.yaml` (`AGG-WorkspaceMarker`, `AGG-RuntimeSnapshot`), the decisions in ADR 0047
> (proposed), and gaps G-181–G-192 in `docs/domain/gap-register.md`.

## Purpose

A workspace is the user's private copy of the runtime. Its lifecycle:
- `npx coreslopper init`, interactive as onboarding, copies the runtime, stores the provider keys, and records the
  baseline in the workspace marker;
- `npx coreslopper@latest update` merges a newer runtime against the baseline and keeps the user's own edits;
- `doctor` checks the workspace, and `migrate-layout` moves a legacy layout once;
- the board container runs the board and its watchdog.

Upstream, the runtime build decides what ships.

## Key terms

Workspace, Runtime Snapshot, Baseline, Workspace Marker, Conflict Copy, Onboarding, Doctor, Legacy Layout, Board
Container (`docs/glossary.md`); Workspace Payload, Engineering Layer, Sandbox Workspace (`CONTEXT.md`).

## As-is boundary

- `initWorkspace` (`packages/cli/src/init.ts`) works in this order: guards, copy the runtime, `.env`, tools, git,
  the first project, the marker, the install, then `GETTING_STARTED.md`. `onboarding.ts` asks the questions;
  `init-command.ts` handles `--yes` and flags.
- `updateWorkspace` (`update.ts`) decides each runtime file against the baseline and the workspace in one pass.
  It installs file by file, then writes the marker, then runs `runSetup` (`tools.ts`) when something changed.
- The marker's schema, workspace detection and the runtime's location are in `workspace.ts`.
- `doctor.ts`: the workspace, file, key, tool and ComfyUI checks. Its publish and autopilot rows are the publish
  slice's.
- `migrate-layout.ts` moves `series/<slug>/` into `projects/<slug>/` (ADR 0035).
- `scripts/runtime-files.mjs` classifies every tracked file; `build-runtime.mjs` writes `runtime/`. tsup bundles
  `npx.ts` into `dist/cli.js`; `dev-workspace.mjs` builds the sandbox.
- `docker/` and `compose.yaml` hold the board container. The board server and the watchdog round it runs belong to
  the release, publish and pipeline slices.

## Boundaries

- Write the marker only from `init` and `update`, whole, as the last step before the install.
- In `update`, leave `.env`, `.mcp.json`, `GETTING_STARTED.md` and the marker alone. Under `projects/`, `series/` and
  `library/`, only add missing files. A new user-owned path goes into `USER_OWNED_FILES` or `USER_OWNED_PREFIXES`
  and into `docs/onboarding.md` together.
- Keep the user's version of a file both sides changed, and write upstream's as the conflict copy. Overwrite only
  with `--force`.
- Classify every new tracked path in `runtime-files.mjs` in the same change. Ship only what a workspace can run.
- A test that ships imports only shipped files. Tests of the runtime build go into `tests/runtime-files.test.ts`.
- Keep the npx path free of Remotion and React: they are development dependencies the workspace installs.

## Typical pitfalls

- A conflict is reported once. The next update keeps the unmerged file silently, and the conflict copy stays
  unnamed (G-181, medium).
- The upstream CI ships into workspaces and calls `npm run build`, which the runtime's `package.json` removed
  (G-183, medium).
- Without a baseline a plain update writes a conflict copy for every file that differs and records the baseline;
  `--force` overwrites local edits instead (G-186, closed).
- A directory without a marker passes as a workspace, and so does the upstream repository (G-185).
- `update` is in the npx CLI only, `migrate-layout` in the workspace CLI only. The workspace CLI's `init` finds no
  runtime in a workspace (G-188).
- The skip lists and `.env` filters exist three times (G-190).

## Read next

- `docs/glossary.md` (the workspace terms), `docs/onboarding.md`, `docs/board.md` (the container)
- `docs/adr/0010-npx-onboarding.md`, `docs/adr/0012-workspace-update.md`, `docs/adr/0031-watchdog-and-board-container.md`,
  `docs/adr/0036-workspace-payload.md`, `docs/adr/0047-workspace-marker-and-visible-conflicts.md`
- `.claude/rules/publish.md` (the watchdog round, `doctor`'s publish rows, the container's time zone)
