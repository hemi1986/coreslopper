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
