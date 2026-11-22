# Update workspaces with a recorded baseline

## Status

Accepted — 2026-11-08

## Context

A workspace is a runtime snapshot, not a git clone (ADR 0010). Until now the only way to pick up a newer workflow was `npx coreslopper@latest init . --force`, which copies the runtime over the workspace. That overwrites every local edit to a skill, command, or config file, and it never deletes a file that upstream removed, so stale skills keep loading in Claude Code.

## Decision

Add `npx coreslopper@latest update [dir]`, a three-way merge between the recorded baseline, the workspace, and the new runtime.

- `init` and `update` store the SHA-256 of every installed runtime file in `coreslopper.workspace.json` (`files`). This is the **baseline**.
- A file unchanged since the baseline follows upstream: it is updated, or deleted when upstream removed it.
- A locally changed file is kept. When upstream changed it as well, the new version is written next to it as `<file>.coreslopper-new` for a manual merge; `--force` overwrites instead.
- `projects/**` is user-owned: missing upstream files are added, but nothing is overwritten or deleted. `.env`, `.mcp.json`, `GETTING_STARTED.md`, and the marker itself are never touched. `package-lock.json` always follows upstream, because `npm install` rewrites it locally.
- A downgrade is refused unless `--force` is passed. `--dry-run` reports without writing.
- A workspace created before this ADR has no baseline. Every file that differs from upstream is then a conflict; the user commits and runs `update --force` once, which records the baseline.

## Consequences

- Updating keeps local customizations and removes obsolete workflow files.
- The marker grows by one hash per runtime file (about 200 entries) and is committed with the workspace.
- `init --force` remains for repairing a workspace but is no longer the documented update path.
- There is no line-level merge; a file changed on both sides needs a manual merge of the `.coreslopper-new` copy.

## Note — 2026-11-22

[ADR 0047](0047-workspace-marker-and-visible-conflicts.md) (proposed) amends this ADR. `update` now does the following:
- It treats `projects/`, the old `series/` folder, `library/`, and the model bench's `bench/bench.yaml`, `bench/targets.yaml`, and `bench/cases/` as the user's: missing upstream files are added, and nothing there is overwritten or deleted.
- It skips upstream files below `projects/<slug>/` while a series canon of that slug still sits in `series/<slug>/`, and points to `migrate-layout`.
- It refuses a directory that is not a workspace and the coreslopper source repository.
- It runs `npm install` and `uv sync` after it changed a file, unless `--no-install` is given.
- It writes the upstream version of `package-lock.json` back even after a local delete.
- A workspace without a baseline needs no `--force`. A plain `update` writes a conflict copy for every file that differs from upstream and records the baseline, so later updates merge normally. `--force` would overwrite the local edits instead.
