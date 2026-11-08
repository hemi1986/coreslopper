# coreslopper

An open-source, Claude Code-native workflow for producing music videos from a brief to final renders. Creative work is done by agent skills; mechanical work is done by tested TypeScript and Python scripts. The repository is both the workflow and the home of its video projects.

## Principles

- **Tool-independent core.** Skills live in `.claude/skills/<name>/SKILL.md` with minimal frontmatter (`name`, `description`, optional `license`). `AGENTS.md` describes the project; `CLAUDE.md` imports it and adds Claude Code specifics.
- **Creative vs. mechanical.** Ideas, lyrics, treatments, storyboards, and prompts are agent work. Audio analysis, validation, caching, budget checks, rendering, and export are scripts.
- **Flexible image source.** A shot can be motion graphics, an AI clip, real footage, or mixed. The decision is made per shot in the storyboard.
- **Autonomous by default.** There are no creative approval gates. `review_mode: auto` runs the pipeline; it stops only for budget, missing credentials, or an unrecoverable validation failure. Quality comes from upfront grilling, automated critics, schema validation, and deterministic rendering.
- **Resumable and thrifty.** `state.json` tracks stages, hashes, attempts, and spend. Generated assets are cached by a hash of model, prompt, seed, references, and params.
- **No secrets.** API keys live in environment variables; `.env.example` documents them. Generated media and copyrighted material are gitignored.
- **Open source.** MIT for our code and docs. Remotion is source-available and documented separately.

## Quickstart

Create a workspace with the published onboarding CLI:

```bash
npx coreslopper@latest init my-video
cd my-video
claude
```

The wizard checks and optionally installs Node-adjacent tools, validates optional fal.ai and Higgsfield credentials, configures the Suno MCP server, and creates the first project. In Claude Code, run `/mcp` once and then `/video-next my-video`. Use `--yes` for a non-interactive run and see `docs/onboarding.md` for all flags.

Work in this repository instead:

```bash
npm install
npm run demo:audio
npm run cli -- validate projects/demo
npm run cli -- contact-sheet projects/demo
npm run cli -- render projects/demo --format 16x9
```

The demo is a 12-second motion-only project. It needs no API keys.

Create a real project:

```bash
npm run cli -- new my-video --budget 50
```

Then open Claude Code and run `/video-next my-video`.

## Repository map

```text
.claude/
  skills/          Own stage skills + vendored Matt Pocock skills
  commands/        /new-video, /video-next, /video-status
  agents/          art-director, qa-checker, stage-runner
  hooks/           PostToolUse validation for project artifacts
  settings.json    Hook registration
AGENTS.md          This file: the project description agents read
CLAUDE.md          @AGENTS.md + Claude Code specifics
config/            models.yaml and defaults.yaml
docs/              PLAN.md, glossary.md, architecture.md, pipeline.md, ADRs, third-party notices
packages/
  core/            Zod schemas, state, timing resolver, hash, cost, project loader
  providers/       generateImage/editImage/imageToVideo/lipSync, fal.ai + Higgsfield + mock, cache/manifest runner
  cli/             validate, status, new, render, contact-sheet, stage-*, estimate, doctor
                   npx entry, onboarding, tool checks, workspace init
  remotion/        MusicVideo composition, motion components, effects, 3D
schema/            Generated JSON Schema for cross-language validation
scripts/           Audio analysis (Python/uv), fixture generators, runtime build
templates/project/ Project template used by /new-video
brand/example/     Neutral synthwave/cyberpunk brand kit with OFL fonts
projects/          Video projects (media gitignored)
runtime/           Generated npm runtime snapshot (gitignored)
dist/              Generated npx bundle (gitignored)
```

## Pipeline

| # | Stage ID | Skill(s) | Output | Automated check |
|---|---|---|---|---|
| 1 | `brief` | `video-brief` | `brief.md` | Budget/formats present; brief critic |
| 2 | `treatment` | `video-treatment` | `treatment.md` | Critic vs. brief; bounded revisions |
| 3 | `lyrics` | `lyrics-writer` | `lyrics.txt`, `suno-style.txt` | Section tags; lyric critic |
| 4 | `song` | `suno-song` | `song.json`, `audio/song.wav`, stems | Variant scoring or import; budget |
| 5 | `audio-analysis` | `audio-analysis` | `timing.json`, `timing.report.md` | Schema; confidence flags |
| 6 | `style-character` | `style-bible`, `character-bible` | `style.yaml`, `characters.yaml`, refs | Schema; image QA |
| 7 | `storyboard` | `storyboard` | `storyboard.yaml`, `storyboard.md`, contact sheet | Schema, anchors, coverage, refs, source rules |
| 8 | `assets` | `remotion-motion`, `ai-clips`, `footage` | Components, keyframes, clips, footage | Per-batch cost + QA; cache |
| 9 | `assembly` | `assembly-render` | `renders/preview-16x9.mp4` | Preview; sync/legibility |
| 10 | `qa-export` | `video-qa` | `review/report.md`, all formats | Sync, readability, determinism |

No stage waits for a human. A stage can stop the pipeline only on a hard stop: budget exceeded, missing credentials, or a validation/QA failure that cannot be fixed after its retries.

## Context discipline

- `/video-next` dispatches **one fresh `stage-runner` subagent per stage**.
- The only interface is the project directory plus a short summary.
- The orchestrator reads `state.json`, `project.yaml`, `review/report.md`, and summaries; it never loads raw assets or full transcripts.
- Asset production is batched (default 5 shots) so a large batch does not fill a context.

## State, budget, cache

- `project.yaml` requires `budget_usd`. `batch_cap_usd` defaults to 30 % of the remaining budget.
- `state.json` tracks `pending`, `running`, `done`, `failed`, and `skipped` for every stage, plus attempts, outputs, input hashes, errors, and spend.
- Generated assets are cached under `.cache/generations/<hash>/`; every call is appended to `assets/manifest.jsonl`.
- `timing.overrides.json` is user-owned, always wins at load time, and is never overwritten.

## Schemas

Zod is the source of truth in `packages/core/src/schema.ts`. Generated JSON Schema lives in `schema/`; Python validates `timing.json` against it. Regenerate with:

```bash
npm run schema
```

## Commands

| Command | Purpose |
|---|---|
| `npm run cli -- validate <project>` | Validate timing, style, characters, and storyboard coverage. |
| `npm run cli -- status <project>` | Show stage state and budget. |
| `npm run cli -- contact-sheet <project>` | Write `review/contact-sheet.svg`. |
| `npm run cli -- render <project> --format 16x9` | Render with Remotion. |
| `npm run cli -- new <slug> --budget <usd>` | Create a project from the template. |
| `npm run cli -- generate <project> --batch <file>` | Run a cached, budget-checked generation batch. |
| `npm run cli -- qa <project> [--determinism <frame>]` | Write `review/report.md`; optionally check frame hashes. |
| `npm run cli -- normalize-audio <project> --input <file>` | Normalize audio to −14 LUFS / −1 dBTP. |
| `npm run cli -- footage <project> --input <file> --name <name>` | Normalize a footage proxy. |
| `npm run cli -- frame <project> --input <clip> --position last` | Extract a review or chaining frame. |
| `npm run cli -- audio-segment <project> --start <s> --end <s> --name <shot-id>` | Cut a vocal segment for a lip-sync shot. |
| `npm run cli -- stage-start/-done/-fail/-skip/-reset` | Update `state.json` from the orchestrator. |
| `npm run cli -- estimate --role <role> --units <n>` | Check a generation cost against the budget. |
| `npm run cli -- validate-file <file>` | Validate one changed artifact (used by the hook). |
| `npm run cli -- doctor` | Check workspace, tools, fonts, Remotion, and keys. |
| `npx coreslopper init [dir]` | Create a workspace, install tools, configure fal.ai, Higgsfield, and Suno. |
| `npx coreslopper@latest update [dir]` | Update a workspace to the latest workflow; keeps local edits (`--dry-run`, `--force`). |
| `npx coreslopper doctor` | Check a workspace from outside it. |
| `npx coreslopper new <slug> --budget <usd>` | Create a project inside a workspace. |
| `npm run build` | Build `runtime/` and the npx bundle in `dist/`. |
| `npm run pack:check` | Build and inspect the npm tarball. |

In Claude Code: `/new-video`, `/video-next`, `/video-status`.

## Distribution

The root package is published as `coreslopper`. `npm run build` copies the tracked workflow into `runtime/` and bundles `packages/cli/src/npx.ts` into `dist/cli.js`; `prepack` runs the same build. The npm package ships the onboarding CLI (init, update, doctor, new, status, validate) plus the runtime snapshot, not the Remotion dependency tree. `npx coreslopper init` copies `runtime/` into a private workspace, then the workspace's own `npm install` provides rendering and audio-analysis dependencies. Never publish generated media or `.env`.

## Skills

Own skills: `video-brief`, `video-treatment`, `lyrics-writer`, `suno-song`, `audio-analysis`, `style-bible`, `character-bible`, `storyboard`, `remotion-motion`, `ai-clips`, `footage`, `assembly-render`, `video-qa`.

Vendored from Matt Pocock (MIT, see `docs/THIRD_PARTY.md`): `grill-me`, `grilling`, `writing-for-agents`, `domain-modeling`.

Use `grilling` before briefs, treatments, and storyboards. Use `writing-for-agents` when creating or editing a skill. Use `domain-modeling` for terminology, `docs/glossary.md`, and ADRs.

## Conventions

- Repository artifacts are in English.
- Use the terms in `docs/glossary.md` in schemas, skills, docs, and code.
- Own skills use only `name`, `description`, and `license` in frontmatter.
- Time values in a storyboard are symbolic anchors, never hard-coded seconds unless there is no alternative.
- Remotion animation is frame-driven: `useCurrentFrame()`, `random(seed)`, no wall clock, no `useFrame` clock, no time-based CSS animation.
- Generated media, secrets, and copyrighted material are never committed.

## Testing

```bash
npm test              # Vitest: schemas, timing, state, providers, contact sheet
npm run typecheck     # TypeScript
npm run python:test   # pytest for the pure audio-analysis helpers
```

CI runs without API keys and uses the mock provider. GPU tests are opt-in.

## Documentation

- `docs/PLAN.md` — the agreed architecture and delivery plan.
- `docs/glossary.md` — ubiquitous language.
- `docs/architecture.md` — data flow, state, cache, providers, rendering.
- `docs/pipeline.md` — stage-by-stage runbook.
- `docs/providers.md` — provider selection, credentials, batches, budget, and model roles.
- `docs/adr/` — architecture decision records.
- `docs/THIRD_PARTY.md` — vendored skills, licenses, fonts, providers.
- `docs/mcp.md` — Suno and optional fal.ai MCP configuration; provider adapters.

## License

MIT. Remotion is source-available under its own license; see `docs/THIRD_PARTY.md`. Do not commit generated Suno/fal.ai/Higgsfield media or copyrighted music to this repository.
