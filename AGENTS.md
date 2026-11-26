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
npm run python:test   # pytest for the audio-analysis helpers
```

CI runs the same without API keys. GPU tests are opt-in. After a schema change, `npm run schema` regenerates `schema/`.

## Distribution

The root package is published as `coreslopper`. `npm run build` writes the workspace payload into `runtime/` and bundles `packages/cli/src/npx.ts` into `dist/cli.js`; `prepack` runs the same build and `npm run pack:check` inspects the tarball. The npm package ships the onboarding CLI plus the runtime, not the Remotion dependency tree. `npx coreslopper init` copies `runtime/` into a private workspace; `update` merges a newer runtime against the workspace's baseline. Release automation is release-please (`CONTRIBUTING.md`).

## Conventions

- Repository artifacts are in English; use the terms in `docs/glossary.md`.
- Commits and pull request titles are Conventional Commits; a story's work message ends with its ID, e.g.
  `feat(meme): create a meme in the wizard (ST-008)` (`CONTRIBUTING.md`, `/implement`).
- Decisions that are hard to reverse get an ADR in `docs/adr/` (`domain-modeling`).
- Load `writing-for-agents` before writing a skill, an agent, a command, or an `AGENTS.md`/`CLAUDE.md`. Own skills use only `name`, `description`, and `license` in frontmatter; vendored skills keep theirs (`grill-me` keeps `disable-model-invocation: true` as a Claude Code hint).
- Generated media, secrets, and copyrighted material are never committed.

<!-- kataster:begin – managed by kataster; edits inside are overwritten on upgrade -->
## coreslopper – agent workflow (Kataster)

This repository runs the Kataster workflow. Discovery lives in `.claude/skills/`, the OpenCode wiring in
`.opencode/`; Claude Code uses the same skills and hooks.

- **Profile:** `.claude/project.json` – name, stack, languages, commands, backlog backend. Read it before assuming anything.
- **Backlog:** `backlog.provider` is `local` (default), `github` or `jira`. With a tracker, `docs/stories/` is the
  local mirror and the tracker is the source of truth – sync with `/backlog-sync`; `BACKLOG.md` stays generated.
- **Map:** `docs/workflow.md` – sources of truth, commands, phases, rules. Read it when unsure where something
  belongs.
- **Research:** cross-cutting questions go through the read-only `researcher` (`/research`,
  `/feature --research`); findings live in `docs/research/<topic>.md` with an expiry and are cited from a story's
  `sources:`. Evidence, not a specification.
- **Repo map (brownfield):** `docs/architecture/repo-map.md` – packages, dependency edges, consumers, adopted
  slices. A package's `AGENTS.md` is loaded only when you work there; the root file stays free of domain.
- **Start:** greenfield → `/bootstrap`; existing code → `/adopt` (in slices, not the whole monorepo).
- **Never guess:** unclear → a hotspot (`HS-n`) or `[OPEN]` plus a row in `OPEN_QUESTIONS.md`.
- **Project checks:** `docs/engineering/checks.yaml` – what runs at edit time and Stop/CI; architecture boundaries
  in `docs/architecture/boundaries.yaml` with existing debt in the baseline (only new violations fail).
- **Language:** domain terms exactly as in `CONTEXT.md`; UI words from its `_UI (<lang>)_` lines. Write docs,
  stories and ADRs in `languages.artifacts`; the installed templates are English and are translated as you fill them.
  What scripts read stays as in the template: frontmatter keys and values, the headings and markers listed in
  `docs/workflow.md`, Gherkin keywords and IDs.
- **1-command rule:** one story = one command + its events on one aggregate, at most 4 Gherkin scenarios. Full
  domain stories are `type: domain`; UI tweaks, refactors, dependencies and setup use the fast lane
  (`type: chore` or `type: task`).
- **Spec gate:** `node .claude/skills/user-stories/scripts/lint-story.ts <file>` must be green. A story the linter
  accepts becomes `ready-for-human-review`; only the user approves `ready`.
- **Traceability:** every domain scenario has a test titled `ST-NNN: <scenario title>`; domain IDs come from
  `docs/domain/events.yaml`.
- **ADRs:** new ones are `proposed`; only the user sets `accepted`. A `done` story is never reopened.
- **Reviews:** `/implement` scales review to the diff. `code-reviewer` and `acceptance-tester` report findings and
  never create stories; fast-lane stories skip the formal review pass.
- **Worker:** `/implement --worker ST-NNN --base <branch>` (agent `story-worker`) builds one given story and
  returns a JSON report instead of asking; an open decision is `blocked`, never code. It starts no subagent.
- **Marathon:** `/marathon` makes the main session the orchestrator of a run: story after story it claims the
  planned story, starts a `story-worker`, runs the reviews and merges into `marathon/<date>`; one pull request at
  the end. `.claude/state/marathon.json` changes only through `marathon-state.ts`; `/marathon resume` goes on.
- **Gate:** `node .claude/skills/implement/scripts/verify.ts`.
- **Metrics:** workflow skills mark their phases with `story-metrics.ts mark` (the `metrics` skill); never edit
  `docs/stories/metrics/`, commit it with the work.

Keep this block short: it is loaded into every session. Put rules into the skill that owns them, not here.
<!-- kataster:end -->

<!-- kataster:repo:begin -->
<!-- Generated from docs/architecture/repo-map.json by repo-map.ts. Do not edit inside this block. -->
## Repository map

- **Tooling:** npm workspaces · **Packages:** 5 · **Adopted:** 1 of 5
- **Layout:** `packages/` (4), `scripts/` (1)
- **Detail:** `docs/architecture/repo-map.md` – package list, dependency edges, consumers, adoption ranking.
- **Concept slices:** `episode` (cli, core, tests), `generate` (cli, scripts, tests), `sery` (cli, tests), `init` (cli, tests), `lipsync` (cli, tests) – candidates for `/adopt`, not confirmed domains.
- **Adopted slices:** `packages/remotion`, concept `timing`, concept `release`, concept `thumbnail`, concept `bench`, concept `review`, concept `media`, concept `board`, concept `publish`, concept `character`, concept `render`, concept `pipeline`, concept `verdict`, concept `storyboard`, concept `generation`, concept `series`, concept `workspace`. Everything else is **not adopted**: run `/adopt` before inferring domain there.

## Commands

| Scope | Command |
|---|---|
| Install | `npm install` |
| Typecheck | `npm run typecheck` |
| Test | `npm run test` |
| One package | `npm run test --workspace <package>` |
| Gate | `node .claude/skills/implement/scripts/verify.ts` |

## Read next

- `docs/architecture/repo-map.md` – where domains and shared libraries live
- `docs/engineering/conventions.md` – how code is built in this repository
- `CONTEXT.md` – domain language; this file stays free of domain rules on purpose
- Package docs: `<package>/AGENTS.md` (loaded when you work there) with `<package>/CLAUDE.md` as the Claude Code entry
<!-- kataster:repo:end -->

## Hard conventions

- Package import direction: `core` imports no other package; `providers` and `remotion` import only `core`.
  Enforced by `tests/package-boundaries.test.ts` (package names) and `docs/architecture/boundaries.yaml`
  (relative imports, `docs/engineering/checks.yaml`).
- `runtime/` is build output; read and change the sources. Enforced by `boundaries.yaml` (`no-build-output`).
