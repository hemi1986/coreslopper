---
status: proposed
date: 2026-11-22
---

# Workspace: the marker as identity, conflicts visible until resolved, only what a workspace runs ships

## Status

Proposed — 2026-11-22. Records decisions already in the code and closes rules the code leaves open. Amends
[ADR 0010](0010-npx-onboarding.md) and [ADR 0012](0012-workspace-update.md). The adoption of the workspace slice
recovered it from the code and four questions about how the workflow is used; the code was not reviewed by a user.

## Context

ADR 0010 made a workspace a private copy of the runtime, created by `npx coreslopper init`. ADR 0012 added `update`,
a three-way merge against a recorded baseline. ADR 0031 added the board container, and ADR 0036 split the workspace
payload from the engineering layer. The sources now disagree:
- ADR 0010 says that init writes a Suno server into `.mcp.json`, and that a workspace is updated with `init --force`.
  Neither holds any more. `docs/architecture.md` still says `init --force`.
- The glossary calls the baseline the hash of every file "as last installed". `update` records upstream's hash also
  for a file it did not install: a conflict, a local change, a local deletion. So a conflict is reported once. At the
  next update the unmerged file counts as the user's own change and is kept silently, and its conflict copy is never
  named again.
- `docs/onboarding.md` tells a workspace without a baseline to run `update --force` once. A plain update records the
  baseline too, and `--force` overwrites the user's edits.
- A directory counts as a workspace with the marker, or with a `package.json` named `coreslopper` and a project
  template. So a half-finished init passes, and so does the upstream repository.
- `init` records the CLI's version in the marker, `update` the runtime's.
- The upstream CI ships into every workspace and calls a build the workspace does not have.
- `update` exists only in the npx CLI. The workspace CLI has an `init` that cannot find a runtime in a workspace.
- `update` never says that `docker/` changed and the board image must be built again. Every workspace's container
  uses one image name.

The user created their workspace with `npx coreslopper init` and updates it with `update`. They sometimes edit
workflow files there with Claude and carry the change upstream. They mean to run the board in the container.

See `docs/domain/adoption-report.md`, the workspace slice.

## Decision

- **The marker is the workspace's identity.** `coreslopper.workspace.json` holds the runtime version, when the
  workspace was created and last updated, the first project and the baseline. Only `init` and `update` write it, whole,
  as their last step before installing the dependencies. A directory with the marker is a workspace. The upstream
  repository is not a workspace.
- **The baseline is upstream's last offer.** It holds upstream's hash of every file of the runtime last installed or
  offered. Each runtime file is decided by three states – baseline, workspace, new runtime:
  - an untouched file follows upstream, and an untouched file upstream removed is deleted;
  - a file only the user changed stays;
  - a file both changed keeps the user's version and gets upstream's beside it as a conflict copy;
  - a file identical to upstream needs nothing, so a change carried upstream byte for byte is taken silently.
- **A conflict stays visible until the user resolved it.** Every `update` and `doctor` name each conflict copy left
  in the workspace. The copy stays out of `.gitignore`. `update` also names the workspace's own changes to workflow
  files, so the user can carry them upstream.
- **The user's paths.** `update` never writes `.env`, `.mcp.json`, `GETTING_STARTED.md` or the marker. Under
  `projects/`, `series/` and `library/` it only adds missing files. `package-lock.json` always follows upstream.
  Overwriting a changed file and downgrading need `--force`. A workspace without a baseline gets a plain update,
  which records the baseline. A series canon still in `series/` gets no copy in `projects/` until `migrate-layout`
  moved it; the user commits first, and the moves come before the rewritten paths.
- **One runtime version.** The marker records the runtime's own version, at init as at update.
- **Only what a workspace can run ships into it.** Every tracked file is classified (ADR 0036). The upstream CI and
  the issue and pull request templates stay upstream; a workspace CI is a later decision. The npx CLI carries no
  render stack.
- **The npx CLI owns `init` and `update`.** The workspace CLI drops its `init` and runs `doctor` and `validate`
  through the same code. Tools are installed only after the user confirmed the workspace.
- **The board container per workspace.** Each workspace's container builds its own image. `update` says when it
  changed `docker/` and the image needs `docker compose build`. The container's time zone is ADR 0046's.

## Consequences

- Several of these rules are ahead of the code. The gaps are G-181 to G-192 in `docs/domain/gap-register.md`:
  - conflicts are reported once, and the user's own changes are only counted;
  - the upstream CI and the templates ship;
  - nothing points at a changed `docker/`, and the image name is shared;
  - a directory without a marker passes as a workspace;
  - the marker records two kinds of version;
  - the workspace CLI's `init` cannot work there;
  - onboarding installs tools before the last question;
  - `migrate-layout` writes paths before it moves;
  - three skip lists, and missing tests.
- The texts that describe the older behaviour need a fix: ADR 0010's Suno server and `init --force`,
  `docs/architecture.md`, `docs/onboarding.md`'s `--force once`, the user's folders and the deleted
  `package-lock.json`, `workspace/CLAUDE.md`'s hook matcher, and the doctor and next-step texts (G-186). The accepted
  ADRs stay; this ADR amends them.
- The board server, its routes and the watchdog round stay the release, publish and pipeline contexts'.
