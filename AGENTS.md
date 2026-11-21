# coreslopper — engineering

This repository builds coreslopper: the CLI, the board, the providers, the Remotion compositions, and the media workflow every workspace gets. Work here is engineering on the product. Videos are produced in workspaces, never here.

## Two layers

- **Engineering layer**: this file, the root `CLAUDE.md` and `.claude/`, and the engineering workflow's documents. It is for working on this repository and never ships.
- **Workspace payload**: everything a workspace gets. The product code and docs ship at their own paths; `workspace/` becomes the workspace root (`workspace/.claude/` with the media skills, agents, commands, and hook; `workspace/AGENTS.md`; `workspace/CLAUDE.md`; `workspace/skills-lock.json`).

`scripts/runtime-files.mjs` classifies every tracked file: shipped, shipped from `workspace/`, or not shipped. The runtime build and `tests/runtime-files.test.ts` fail on a tracked file no list covers, so a new top-level path or docs page gets classified there in the same change. Agent docs (`AGENTS.md`, `CLAUDE.md`) outside `workspace/` never ship, at any depth.

Read `workspace/AGENTS.md` before changing the pipeline, a stage, a CLI command, a schema, or a skill: it is the product description, and its rules hold for the code here too. The skills in `workspace/.claude/skills/` are product files; in this repository they apply only to work under `workspace/`.

## Trying the media workflow

`npm run dev:workspace [-- <dir>]` builds the runtime and creates or updates a sandbox workspace (default `../coreslopper-sandbox`). Run `/new-video`, `/video-next`, and the board there. The sandbox stays outside this repository because Claude Code also loads the `CLAUDE.md` of parent directories.

## Checks

```bash
npm test              # Vitest, mock provider, no API keys
npm run typecheck
npm run python:test   # pytest for the audio-analysis and review-notes helpers
```

CI runs the same without API keys. GPU tests are opt-in. After a schema change, `npm run schema` regenerates `schema/`.

## Distribution

The root package is published as `coreslopper`. `npm run build` writes the workspace payload into `runtime/` and bundles `packages/cli/src/npx.ts` into `dist/cli.js`; `prepack` runs the same build and `npm run pack:check` inspects the tarball. The npm package ships the onboarding CLI plus the runtime, not the Remotion dependency tree. `npx coreslopper init` copies `runtime/` into a private workspace; `update` merges a newer runtime against the workspace's baseline. Release automation is release-please (`CONTRIBUTING.md`).

## Conventions

- Repository artifacts are in English; use the terms in `docs/glossary.md`.
- Decisions that are hard to reverse get an ADR in `docs/adr/` (`domain-modeling`).
- Load `writing-for-agents` before writing a skill, an agent, a command, or an `AGENTS.md`/`CLAUDE.md`. Own skills use only `name`, `description`, and `license` in frontmatter; vendored skills keep theirs (`grill-me` keeps `disable-model-invocation: true` as a Claude Code hint).
- Generated media, secrets, and copyrighted material are never committed.
