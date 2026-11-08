# Folder-based projects in one workflow repository

**Status:** Accepted

## Context

Every video project needs the same skills, schemas, scripts, renderer, hooks, and validation. Separate repositories per video would require syncing workflow versions, duplicating configuration, and opening a different Claude Code window for each project.

## Decision

Video projects live in `projects/<slug>/` inside this repository. Large media (audio, generated clips, renders) is gitignored; only text artifacts, small stills, and review sheets are committed. A future `export-project` command can extract a project into its own repository pinned to a workflow commit.

## Consequences

- One clone, one Claude Code window, no workflow drift.
- The repository stays small if media is excluded.
- Extraction is an additive feature; projects do not depend on it.
