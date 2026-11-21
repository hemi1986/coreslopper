# coreslopper

An open-source, Claude Code-native workflow for producing music videos for an existing song, and episodes of a series from a script, from setup to final renders. Creative work is done by agent skills; mechanical work is done by tested TypeScript and Python scripts. The repository is both the workflow and the home of its video projects.

## Principles

- **Tool-independent core.** Skills live in `.claude/skills/<name>/SKILL.md` with minimal frontmatter (`name`, `description`, optional `license`). `AGENTS.md` describes the project; `CLAUDE.md` imports it and adds Claude Code specifics.
- **Creative vs. mechanical.** Ideas, treatments, storyboards, and prompts are agent work. Song import, audio analysis, validation, caching, budget checks, rendering, and export are scripts.
- **Flexible image source.** A shot can be motion graphics, an AI clip, real footage, or mixed. The decision is made per shot in the storyboard.
- **Interactive setup, autonomous pipeline.** The `new-video` skill collects project data, lyrics, and the song, then grills the user into brief and treatment. After that there are no creative approval gates: `review_mode: auto` runs the pipeline; it stops only for budget, missing credentials, or an unrecoverable validation failure. Quality comes from upfront grilling, automated critics, schema validation, and deterministic rendering.
- **Local or cloud generation.** `comfyui` renders from tagged workflow exports in `comfyui/workflows/`: stills and edits (`providers.image`), clips (`providers.video`), lip-sync (`providers.lipsync`), and stingers, SFX, and voice-overs (`audio.*` roles). Each provider is chosen separately.
- **Resumable and thrifty.** `state.json` tracks stages, hashes, attempts, and spend. Generated assets are cached by a hash of model, prompt, seed, references, and params.
- **No secrets.** API keys live in environment variables; `.env.example` documents them. Generated media and copyrighted material are gitignored.
- **Nothing goes public without the user's approval.** `publish` is the user's command and uploads private videos and drafts only; the release autopilot posts a release only after the user approved it on the release board ([ADR 0029](docs/adr/0029-release-autopilot.md)).
- **Open source.** MIT for our code and docs. Remotion is source-available and documented separately.

## Quickstart

Create a workspace with the published onboarding CLI:

```bash
npx coreslopper@latest init my-video
cd my-video
claude
```

The wizard checks and optionally installs Node-adjacent tools, validates optional fal.ai, Higgsfield, and Topview credentials, and creates the first project. In Claude Code, run `/new-video my-video` to add lyrics, import the song, and write the brief, then `/video-next my-video`. Use `--yes` for a non-interactive run and see `docs/onboarding.md` for all flags.

Work in this repository instead:

```bash
npm install
npm run demo:audio
npm run cli -- validate projects/demo
npm run cli -- contact-sheet projects/demo
npm run cli -- render projects/demo --format 16x9
```

The demo is a 12-second motion-only project. It needs no API keys. `projects/demo-episode` is a 9:16 demo episode of `series/demo-series` on the mock provider: `npm run demo:episode`, then `voice-track`, `episode-track`, and `render` (see `docs/pipeline.md`).

Create a real project:

```bash
npm run cli -- new my-video --budget 50
```

Or open Claude Code and run `/new-video`, which asks for the project data itself. Then run `/video-next my-video`.

## Repository map

```text
.claude/
  skills/          Own stage skills + vendored Matt Pocock skills
  commands/        /video-next, /video-status, /series-status
  agents/          art-director, qa-checker, stage-runner
  hooks/           PostToolUse validation for project artifacts
  settings.json    Hook registration
AGENTS.md          This file: the project description agents read
CLAUDE.md          @AGENTS.md + Claude Code specifics
config/            models.yaml and defaults.yaml
comfyui/           README + workflows/ for local ComfyUI generation (tagged API exports)
compose.yaml       The board and its watchdog in a container (image in docker/)
docs/              glossary.md, architecture.md, pipeline.md, ADRs, third-party notices
packages/
  core/            Zod schemas, state, timing resolver, hash, cost, project loader
  providers/       image, video, lip-sync, and audio operations; fal.ai + Higgsfield + Topview + ComfyUI + mock; cache/manifest runner;
                   publish adapters (YouTube, TikTok, mock), post adapters (X, LinkedIn, Instagram)
  cli/             validate, status, new, render, contact-sheet, stage-*, estimate, doctor, board (page in src/board/), watch
                   npx entry, onboarding, tool checks, workspace init
  remotion/        MusicVideo composition, motion components, effects, 3D
schema/            Generated JSON Schema for cross-language validation
scripts/           Audio analysis and review player (Python/uv), fixture generators, runtime build
templates/project/ Project template used by the new-video skill
templates/episode/ Episode template used by the new-episode skill
templates/series/  Series canon template used by the new-series skill
templates/channel/ Optional config/channel.yaml (links, footer, hashtag sets) and config/release-schedule.yaml templates
brand/example/     Neutral synthwave/cyberpunk brand kit with OFL fonts
bench/             Model bench: cases, targets, budget (fixtures and runs gitignored)
projects/          Video projects and episodes (media gitignored)
series/            Series canons: series.yaml, bible, style, characters, sets (references gitignored)
runtime/           Generated npm runtime snapshot (gitignored)
dist/              Generated npx bundle (gitignored)
```

## Pipeline

| # | Stage ID | Skill(s) | Output | Automated check |
|---|---|---|---|---|
| 1 | `setup` ✋ | `new-video` | `project.yaml`, `lyrics.txt`, `song.json`, `audio/song.wav`, vocal stem | User confirms section tags; `import-song` |
| 2 | `brief` ✋ | `grilling`, `video-brief` | `brief.md` | Budget/formats present; grilling frontier empty |
| 3 | `treatment` ✋ | `grilling`, `video-treatment` | `treatment.md` | Critic vs. brief; user accepts |
| 4 | `audio-analysis` | `audio-analysis` | `timing.json`, `timing.report.md` | Schema; confidence flags |
| 5 | `style-character` | `style-bible`, `character-bible` | `style.yaml`, `characters.yaml`, `sets.yaml` (plates, props), refs, character states | Schema; image QA per reference |
| 6 | `storyboard` | `storyboard` | `storyboard.yaml`, `storyboard.md`, contact sheet | Schema, anchors, coverage, refs, source rules |
| 7 | `assets` | `remotion-motion`, `ai-clips`, `footage` | Components, keyframes, clips, footage | Per-batch cost + QA; cache |
| 8 | `assembly` | `assembly-render` | `renders/preview-16x9.mp4` | Preview; sync/legibility |
| 9 | `qa-export` | `video-qa` | `review/report.md`, `review/upload.yaml`, release folder `renders/release/` (all formats, 3 thumbnails, 3 Shorts, WAV, cover, canvas, lyrics, platform texts, release calendar, microsite data) | Sync, readability, determinism; art director on thumbnails and cover; release checks (PASS/FAIL/TODO) |

The song always exists already; the workflow never writes lyrics or generates music. ✋ marks the **interactive stages**: the `new-video` skill runs them in the main session with the user (project data, lyrics, song import, grilling). `/video-next` refuses to start while one is open.

### Episodes

A project with `kind: episode` is one episode of a series ([ADR 0016](docs/adr/0016-episode-projects.md)). Its style, characters, and sets come from the canon in `series/<series>/`, and its audio is built from `script.yaml` instead of a song.

| # | Stage ID | Skill(s) | Output |
|---|---|---|---|
| 1 | `setup` ✋ | `new-episode` | `project.yaml` (copies formats, providers, brand from `series.yaml`) |
| 2 | `script` ✋ | `grilling`, `new-episode` | `script.yaml` |
| 3 | `voice-track` | `voice-track` | `takes.json`, `audio/lines/`, `audio/ambience/` |
| 4 | `episode-track` | `episode-track` | `timing.json`, `audio/episode.wav`, `audio/stems/<character>.wav` |
| 5–8 | `storyboard`, `assets`, `assembly`, `qa-export` | as above | renders in the master format, `renders/<slug>.en.srt` |

From `audio-analysis` (or `voice-track`) on, no stage waits for a human. A stage can stop the pipeline only on a hard stop: budget exceeded, missing credentials, or a validation/QA failure that cannot be fixed after its retries.

Publishing is not a stage. After `qa-export` the user approves the release on the release board, and the release autopilot (`release-run`, on a timer) posts each calendar event a platform API can post at its time; the rest stays on the board for the user ([ADR 0029](docs/adr/0029-release-autopilot.md)). `publish` uploads YouTube videos as private and TikTok videos as inbox drafts by hand ([ADR 0023](docs/adr/0023-publish-command.md), [docs/publishing.md](docs/publishing.md)). Agents and stage runners never approve a release, run `release-run` or `watch`, or install the timer.

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
| `npm run cli -- render <project> [--format <id>]` | Render with Remotion in segments; the default is the master format. `--frames <a>-<b>` renders a test range; `--subtitles en` burns in episode subtitles. |
| `npm run cli -- thumbnail <project> --still <file> --text "<a\|b>" --out <file>` | Compose a 1280x720 JPEG thumbnail with the brand fonts and palette; `--format 9x16` for a 1080x1920 Short thumbnail, `--format 1x1` for the 3000x3000 streaming cover (artist and title only); `--tag`, `--layout left\|right\|bottom`, `--accent <role>`, `--focus x,y`. |
| `npm run cli -- short <project> --from <anchor\|s> --to <anchor\|s> --name <stem>` | Cut a Short (at most 60 s) from `renders/9x16.mp4` into `renders/shorts/<stem>-9x16.mp4`; anchors like `section:chorus_1:end-0.5`. |
| `npm run cli -- review <project> [--format <id>] [--video <file>]` | The desktop review player (play, step frames, type notes); notes go to `review/notes/<video>.json`. The board's review view writes the same notes and sends them to the agent as review rounds (`review/rounds/`). |
| `npm run cli -- media-link <project> [--move]` | Move `assets/` and `renders/` to `CORESLOPPER_MEDIA_DIR` and symlink them. |
| `npm run cli -- new <slug> --budget <usd>` | Create a project from the template. |
| `npm run cli -- new <slug> --kind episode --series <s> --episode <n> --budget <usd>` | Create an episode of a series. |
| `npm run cli -- voice-track <project> [--dry-run]` | Episode: generate missing or stale takes and scene ambience. |
| `npm run cli -- import-takes <project> [--lines <ids>]` | Episode: register recordings in `audio/lines/` as takes. |
| `npm run cli -- episode-track <project>` | Episode: place takes, write `timing.json`, mix the episode track and speaker stems. |
| `npm run cli -- subtitles <project>` | Episode: write `renders/<slug>.en.srt`. |
| `npm run cli -- series-status <series>` | Series canon, budget, planned and created episodes, stages, spend, length. |
| `npm run cli -- new-series <slug> --budget <usd> [--format <id>]` | Create a series canon in `series/<slug>/`. |
| `npm run cli -- generate --series <series> --batch <file>` | Run a canon generation batch against the series budget. |
| `npm run cli -- generate <project> --batch <file> [--provider <p>] [--lipsync-provider <p>]` | Run a cached, budget-checked generation batch; `--provider` overrides the project provider for one batch (lip-sync keeps its own), `--lipsync-provider` the lip-sync provider. |
| `npm run cli -- qa <project> [--determinism <frame>]` | Write `review/report.md`; optionally check frame hashes. |
| `npm run cli -- release <project> [--no-render] [--canvas-from <anchor\|s>] [--canvas-seconds <n>]` | Build `renders/release/`: every format, thumbnails, Shorts, WAV, cover, canvas, lyrics, platform texts, README, manifest; renders only missing or stale formats; idempotent. |
| `npm run cli -- calendar <project> [--replan] [--done-until <date>]` | Plan `review/calendar.yaml` (when what goes online where) in the next free slots of `config/release-schedule.yaml`, without colliding with other projects; `release` does it too. `--done-until` marks a published song's past events done. |
| `npm run cli -- board [--port <n>] [--host <a>]` | User command (alias `release-board`): the workspace's local page. Production: every project and series with stages, budget, queue, reviews, renders, and the next Claude Code command. Release: per platform files, texts, limits, settings, and links, the calendar of all projects (`.ics`), and what is posted (`review/release-status.json`). |
| `npm run cli -- upload-text <project>` | Render `review/upload.md` (a pointer to the release folder) from `review/upload.yaml`. |
| `npm run cli -- publish <project> [--platform youtube\|tiktok\|all] [--only main\|shorts\|<name>] [--schedule <iso>] [--dry-run] [--force]` | User command, never a stage: upload the release package to YouTube (private or scheduled) and TikTok (inbox drafts); idempotent through `review/publish.json`. |
| `npm run cli -- publish-auth youtube\|tiktok\|x\|linkedin\|instagram` | One-time consent; stores the tokens in `.env`. |
| `npm run cli -- release-approve <project> [--revoke]` | User command: approve a release for the autopilot (the board's button); a proposed release day becomes `release.release_date`. |
| `npm run cli -- release-run [--project <slug>] [--dry-run] [--plan]` | The release autopilot's round: post what is due of every approved release by API; run by the timer, never by a stage. |
| `npm run cli -- watch [--every <min>] [--no-autopilot]` | The watchdog round: `release-run`, then the production scan (stage, render, queue, budget events and stalled stages in `.cache/watch/`); run by the timer or the board container (`board --watch`, `docker compose up -d`), never by a stage. |
| `npm run cli -- release-timer [show\|install\|remove\|status] [--every <min>]` | User command: the timer that runs `watch` (Windows Task Scheduler under WSL, systemd, launchd); not with the board container. |
| `npm run cli -- import-song <project>` | Register `audio/song.wav` and `audio/stems/vocals.wav` in `song.json`; converts other formats. |
| `npm run cli -- normalize-audio <project> --input <file>` | Normalize audio to −14 LUFS / −1 dBTP. |
| `npm run cli -- footage <project> --input <file> --name <name>` | Normalize a footage proxy. |
| `npm run cli -- frame <project> --input <clip> --position last` | Extract a review or chaining frame. |
| `npm run cli -- review-image <project\|series> --image <png[,png]>\|--clip <mp4> --shot <id>\|--ref <kind:id>` | Art-director verdict on one image or clip, headless in its own context; `--clip` extracts the first, middle, and last frame itself and measures the first against the keyframe. Prints `{verdict, score, issues, fix_prompt}` and appends to `verdicts.jsonl` (exit 2 on fail). |
| `npm run cli -- audio-segment <project> --start <s> --end <s> --name <shot-id> [--mute <a-b,...>] [--format wav]` | Cut a lead-only vocal segment for a lip-sync shot: backing words (parenthesized lyrics) and `--mute` spans are silenced; cuts from `audio/stems/lead.wav` when it exists. |
| `npm run cli -- stage-start/-done/-fail/-skip/-reset` | Update `state.json` from the orchestrator. |
| `npm run cli -- estimate --role <role> --units <n>` | Check a generation cost against the budget. |
| `npm run cli -- validate-file <file>` | Validate one changed artifact (used by the hook). |
| `npm run cli -- bench list\|import\|run\|report` | Model bench: compare models and servers on fixed scenes from past projects (`bench/README.md`). |
| `npm run cli -- doctor` | Check workspace, tools, fonts, Remotion, and keys. |
| `npx coreslopper init [dir]` | Create a workspace, install tools, configure fal.ai, Higgsfield, and Topview. |
| `npx coreslopper@latest update [dir]` | Update a workspace to the latest workflow; keeps local edits (`--dry-run`, `--force`). |
| `npx coreslopper doctor` | Check a workspace from outside it. |
| `npx coreslopper new <slug> --budget <usd>` | Create a project inside a workspace. |
| `npm run build` | Build `runtime/` and the npx bundle in `dist/`. |
| `npm run pack:check` | Build and inspect the npm tarball. |

In Claude Code: `/new-video`, `/new-series`, and `/new-episode` (skills), `/video-next`, `/video-status`, `/series-status`.

## Distribution

The root package is published as `coreslopper`. `npm run build` copies the tracked workflow into `runtime/` and bundles `packages/cli/src/npx.ts` into `dist/cli.js`; `prepack` runs the same build. The npm package ships the onboarding CLI (init, update, doctor, new, status, validate) plus the runtime snapshot, not the Remotion dependency tree. `npx coreslopper init` copies `runtime/` into a private workspace, then the workspace's own `npm install` provides rendering and audio-analysis dependencies. Never publish generated media or `.env`.

## Skills

Own skills: `new-video`, `video-brief`, `video-treatment`, `audio-analysis`, `style-bible`, `character-bible`, `storyboard`, `remotion-motion`, `ai-clips`, `footage`, `assembly-render`, `video-qa`, and for series and episodes `new-series`, `new-episode`, `voice-track`, `episode-track`. Outside the pipeline: `model-bench` compares models and servers before a model switch; `release-backfill` brings an existing or already published project into the release board and calendar.

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
npm run python:test   # pytest for the pure audio-analysis and review-notes helpers
```

CI runs without API keys and uses the mock provider. GPU tests are opt-in.

## Documentation

- `docs/glossary.md` — ubiquitous language.
- `docs/architecture.md` — data flow, state, cache, providers, rendering.
- `docs/pipeline.md` — stage-by-stage runbook.
- `docs/providers.md` — provider selection, credentials, batches, budget, and model roles.
- `docs/adr/` — architecture decision records.
- `docs/THIRD_PARTY.md` — vendored skills, licenses, fonts, providers.
- `docs/mcp.md` — optional exploration MCP servers; provider adapters.
- `docs/board.md` — the board: production view, the watchdog, and the board container.
- `docs/publishing.md` — `publish` and the release autopilot: YouTube, TikTok, X, LinkedIn, and Instagram setup, limits, quota.
- `docs/release-platforms.md` — what each platform takes (fields, limits, links), posting times, legal notes for Germany.
- `docs/adr/0024-release-folder-manual-distribution.md` — the release folder and the manual distributor upload.

## License

MIT. Remotion is source-available under its own license; see `docs/THIRD_PARTY.md`. Do not commit songs, stems, generated fal.ai/Higgsfield/Topview media, or copyrighted music to this repository.
