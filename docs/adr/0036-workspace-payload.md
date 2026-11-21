# The workspace payload is separated from the engineering layer

## Status

Accepted — 2026-11-21. Changes [ADR 0010](0010-npx-onboarding.md) ("the repository is both the workflow and the workspace") and the runtime build of [ADR 0012](0012-workspace-update.md).

## Context

The repository had one `.claude/`, one `AGENTS.md`, and one `CLAUDE.md` for two jobs: describing the media workflow every workspace gets, and instructing agents that work on coreslopper itself. The runtime build copied every tracked file, so anything added for engineering went to every workspace: skills, hooks, and instructions about stories, boundaries, or release automation that make no sense in a video production.

That became a blocker with an engineering workflow of its own (Kataster) that installs into `.claude/`, `AGENTS.md`, and `docs/`. Its hooks (a Stop gate running the type check and tests, Bash and path guards) would have run in every workspace, and its `grilling` skill shares a path with the product's `grilling`, which the media skills rely on, with different content. Merging the two at one path would compromise both: either the workspace gets the engineering variant or the engineering workflow loses its own.

## Decision

- **Two layers in one repository.** The engineering layer (root `AGENTS.md`, root `CLAUDE.md`, `.claude/`, the engineering workflow's documents) is for working on this repository and never ships. The workspace payload is what a workspace gets.
- **`workspace/` is the workspace root.** `workspace/.claude/` (media skills, agents, commands, the validation hook, settings), `workspace/AGENTS.md`, `workspace/CLAUDE.md`, and `workspace/skills-lock.json` ship at the root of the runtime. The product code and docs ship at their own paths, so a workspace looks exactly as before.
- **Every tracked file is classified.** `scripts/runtime-files.mjs` lists what ships and what does not; a tracked file in neither list fails the runtime build and its test. Agent docs outside `workspace/` never ship, at any depth.
- **The media workflow is tried in a sandbox workspace** outside the repository (`npm run dev:workspace`), because Claude Code also loads the `CLAUDE.md` of parent directories.
- **`writing-for-agents` and `domain-modeling` are engineering skills** and stay in the root `.claude/`; workspaces keep `grill-me` and `grilling`.

## Alternatives considered

- **Exclude the engineering files from the runtime by a deny list.** Small, but every new engineering path ships until someone adds it, and the shared `grilling` path still has only one content.
- **Strip engineering hooks and blocks from `settings.json` and `AGENTS.md` at build time.** Keeps one file per path, but the build would rewrite files written by another tool on every upgrade of it.
- **Keep the product's `grilling` and let the engineering workflow run without its additions.** No move needed, but the engineering workflow would be a modified install with a conflict on every upgrade.
- **Develop the product in a separate repository from its workflow files.** The hardest separation, but code, skills, and docs that change together would land in two repositories and two releases.

## Consequences

- `/new-video`, `/video-next`, and the stage agents no longer run in this repository; contributors run them in the sandbox.
- Product skills are edited under `workspace/.claude/skills/`. Claude Code treats them as nested skills that apply only to work under `workspace/`.
- Existing workspaces see no path change on `update`; the two engineering skills are removed from them when unchanged locally, like any file that left the runtime.
- A new top-level file or docs page needs a line in `scripts/runtime-files.mjs` before the build passes.
