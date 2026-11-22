# coreslopper

An open-source, Claude Code-native workflow for producing music videos for an existing song, episodes of a series from a script, and (planned) short vertical memes, from setup to final renders. Creative work is done by agent skills; mechanical work is done by tested TypeScript and Python scripts. A workspace is both the workflow and the home of its video projects.

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

Try the demo, which needs no API keys:

```bash
npm install
npm run demo:audio
npm run cli -- validate projects/demo
npm run cli -- contact-sheet projects/demo
npm run cli -- render projects/demo --format 16x9
```

The demo is a 12-second motion-only project. `projects/demo-episode` is a 9:16 demo episode of `projects/demo-series` on the mock provider: `npm run demo:episode`, then `voice-track`, `episode-track`, and `render` (see `docs/pipeline.md`).

Create a real project:

```bash
npm run cli -- new my-video --budget 50
```

Or open Claude Code and run `/new-video`, which asks for the project data itself. Then run `/video-next my-video`.

## Workspace map

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
comfyui/           README + workflows/ (tagged API exports) + sources/ for local ComfyUI generation
compose.yaml       The board and its watchdog in a container (image in docker/)
docs/              glossary.md, architecture.md, pipeline.md, ADRs, third-party notices
packages/
  core/            Zod schemas, state, timing resolver, hash, cost, project loader
  providers/       image, video, lip-sync, and audio operations; fal.ai + Higgsfield + Topview + ComfyUI + mock; cache/manifest runner;
                   publish adapters (YouTube, TikTok, mock), post adapters (X, LinkedIn, Instagram)
  cli/             validate, status, new, render, contact-sheet, stage-*, estimate, doctor, board (page in src/board/), watch
                   npx entry, onboarding, tool checks, workspace init
  remotion/        MusicVideo composition, motion components, effects, 3D
library/           The workspace character library: characters/<id>/character.yaml (media gitignored)
schema/            Generated JSON Schema for cross-language validation
scripts/           Audio analysis and pose extraction (Python/uv), fixture generators
templates/project/ Project template used by the new-video skill
templates/episode/ Episode template used by the new-episode skill
templates/meme/    Meme template: project.yaml (kind meme, 9:16) and an empty pitch.md
templates/series/  Series canon template used by the new-series skill
templates/channel/ Optional config/channel.yaml (links, footer, hashtag sets) and config/release-schedule.yaml templates
brand/example/     Neutral synthwave/cyberpunk brand kit with OFL fonts
bench/             Model bench: cases, targets, budget (fixtures and runs gitignored)
projects/          Every production: music videos and episodes (project.yaml), series canons (series.yaml); media gitignored
```

## Pipeline

| # | Stage ID | Skill(s) | Output | Automated check |
|---|---|---|---|---|
| 1 | `setup` ✋ | `new-video` | `project.yaml`, `lyrics.txt`, `song.json`, `audio/song.wav`, vocal stem | User confirms section tags; `import-song` |
| 2 | `brief` ✋ | `grilling`, `video-brief` | `brief.md` | Budget/formats present; grilling frontier empty |
| 3 | `treatment` ✋ | `grilling`, `video-treatment` | `treatment.md` | Critic vs. brief; user accepts |
| 4 | `audio-analysis` | `audio-analysis` | `timing.json`, `timing.report.md` | Schema; confidence flags |
| 5 | `style-character` | `style-bible`, `character-bible` | `style.yaml`, `characters.yaml`, `sets.yaml` (plates, props), refs, character states; characters into the library | Schema; image QA per reference |
| 6 | `storyboard` | `storyboard` | `storyboard.yaml`, `storyboard.md`, contact sheet | Schema, anchors, coverage, refs, source rules |
| 7 | `assets` | `remotion-motion`, `ai-clips`, `footage` | Components, keyframes, clips, footage | Per-batch cost + QA; cache |
| 8 | `assembly` | `assembly-render` | `renders/preview-16x9.mp4` | Preview; sync/legibility |
| 9 | `qa-export` | `video-qa` | `review/report.md`, `review/upload.yaml`, release folder `renders/release/` (all formats, 3 thumbnails, 3 Shorts, WAV, cover, canvas, lyrics, platform texts, release calendar, microsite data) | Sync, readability, determinism; art director on thumbnails and cover; release checks (PASS/FAIL/TODO) |

The song always exists already; the workflow never writes lyrics or generates music. ✋ marks the **interactive stages**: the `new-video` skill runs them in the main session with the user (project data, lyrics, song import, grilling). `/video-next` refuses to start while one is open.

### Episodes

A project with `kind: episode` is one episode of a series ([ADR 0016](docs/adr/0016-episode-projects.md)). Its style, characters, and sets come from the canon in `projects/<series>/`, and its audio is built from `script.yaml` instead of a song.

| # | Stage ID | Skill(s) | Output |
|---|---|---|---|
| 1 | `setup` ✋ | `new-episode` | `project.yaml` (copies formats, providers, brand from `series.yaml`) |
| 2 | `script` ✋ | `grilling`, `new-episode` | `script.yaml` |
| 3 | `voice-track` | `voice-track` | `takes.json`, `audio/lines/`, `audio/ambience/` |
| 4 | `episode-track` | `episode-track` | `timing.json`, `audio/episode.wav`, `audio/stems/<character>.wav` |
| 5–8 | `storyboard`, `assets`, `assembly`, `qa-export` | as above | renders in the master format, `renders/<slug>.en.srt` |

### Memes

Partly built ([ADR 0051](docs/adr/0051-memes-and-the-sound-library.md), proposed): the `meme` kind with its stages, the board wizard's meme form and `new <slug> --kind meme --idea "…" [--setting "…"]` (from `templates/meme/`, `pitch.md` written and setup done), and the `sound` command exist; the `new-meme` skill, copying library sounds in `voice-track`, and the meme's subtitle and release rules do not yet. `status` and the board already name `/new-meme <slug>` while an interactive stage is open. A project with `kind: meme` is a standalone 9:16 video of about 15 seconds (at most 30) with German speech and German subtitles burned in. The board's wizard writes the user's idea and setting to `pitch.md`, the starting point of the grilling; `new-meme` grills from it to the punchline. A sound line (`kind: sfx`) names exactly one of a library sound from the workspace's sound library (`library/sounds/<id>/`, `sound: <id>`, no duration: the sound's trim is its length) or a `prompt` with a `duration`; `voice-track` is to copy a library sound into the meme as a take (until then it stops on such a line: put the sound at `audio/lines/<line-id>.wav` and run `import-takes`). The hook checks every edit of `script.yaml` against the library and the 30 seconds the known lengths (pauses, effects, sounds) may fill; speakers and sets are ids until `style-character` writes the meme's bibles, then they must be in them.

| # | Stage ID | Skill(s) | Output |
|---|---|---|---|
| 1 | `setup` ✋ | board wizard, `new-meme` | `project.yaml` (kind `meme`, the one 9:16 format), `pitch.md`, chosen library characters, user references |
| 2 | `script` ✋ | `grilling`, `new-meme` | `script.yaml` |
| 3 | `style-character` | `style-bible`, `character-bible` | style and set bible from pitch and script; invented characters into the library |
| 4–5 | `voice-track`, `episode-track` | as for episodes | takes (generated or copied from the sound library), `timing.json`, `audio/episode.wav`; a track over 30 seconds is a hard stop |
| 6–9 | `storyboard`, `assets`, `assembly`, `qa-export` | as above | one 9:16 video, a 1080x1920 cover, TikTok, Shorts, and Reels texts |

From `audio-analysis` (or `voice-track`) on, no stage waits for a human. A stage can stop the pipeline only on a hard stop: budget exceeded, missing credentials, or a validation/QA failure that cannot be fixed after its retries.

A project with `distribution: internal` in `project.yaml` (`new <slug> --distribution internal`, or the wizard's "internal only" box) is never released publicly – a teaser sent by mail or chat. Its `qa-export` stops after the renders: no thumbnails, Shorts, upload texts, or release package; `qa` skips those checks, and the board shows the project as "Done – not released publicly". Without the option nothing is written and the project is public. To release it later, edit `distribution` and run `qa-export` again.

Publishing is not a stage. After `qa-export` the user approves the release on the release board, and the release autopilot (`release-run`, on a timer) posts each calendar event a platform API can post at its time; the rest stays on the board for the user ([ADR 0029](docs/adr/0029-release-autopilot.md)). `publish` uploads YouTube videos as private and TikTok videos as inbox drafts by hand ([ADR 0023](docs/adr/0023-publish-command.md), [docs/publishing.md](docs/publishing.md)). Agents and stage runners never approve a release, run `release-run` or `watch`, or install the timer.

## Context discipline

- `/video-next` dispatches **one fresh `stage-runner` subagent per stage**.
- The only interface is the project directory plus a short summary.
- The orchestrator reads `state.json`, `project.yaml`, `review/report.md`, and summaries; it never loads raw assets or full transcripts.
- Asset production is batched (default 5 shots) so a large batch does not fill a context.
- Stage runners do mechanical work only through `npm run cli -- …`; a step without a command is a missing command, not a reason for a shell one-liner.

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
| `npm run cli -- media-link <project> [--move]` | Move `assets/` and `renders/` to `CORESLOPPER_MEDIA_DIR` and symlink them. |
| `npm run cli -- new <slug> --budget <usd> [--distribution internal]` | Create a project from the template; `internal`: never released publicly. |
| `npm run cli -- new <slug> --kind episode --series <s> --episode <n> --budget <usd>` | Create an episode of a series. |
| `npm run cli -- voice-track <project> [--dry-run]` | Episode: generate missing or stale takes and scene ambience. |
| `npm run cli -- import-takes <project> [--lines <ids>]` | Episode: register recordings in `audio/lines/` as takes. |
| `npm run cli -- clip-audio <project> --line <id> [--shots <ids>]` | Episode: replace an `sfx` take with the sound of the clips that play during the line (cut at their on-screen position, levelled to -20 LUFS); then `episode-track`. |
| `npm run cli -- episode-track <project>` | Episode: place takes, write `timing.json`, mix the episode track and speaker stems. |
| `npm run cli -- subtitles <project>` | Episode: write `renders/<slug>.en.srt`. |
| `npm run cli -- series-status <series>` | Series canon, budget, planned and created episodes, stages, spend, length. |
| `npm run cli -- new-series <slug> --budget <usd> [--format <id>]` | Create a series canon in `projects/<slug>/`. |
| `npm run cli -- generate --series <series> --batch <file>` | Run a canon generation batch against the series budget. |
| `npm run cli -- generate <project> --batch <file> [--provider <p>] [--lipsync-provider <p>]` | Run a cached, budget-checked generation batch; an item's `out` files its result at that path; `--provider` overrides the project provider for one batch (lip-sync keeps its own), `--lipsync-provider` the lip-sync provider. |
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
| `npm run cli -- lyrics <project> --file <txt> [--propose]` | Write `lyrics.txt` once every line sits under a section tag; `--propose` prints proposed tags (repeated blocks become `[Chorus]`). |
| `npm run cli -- reference list\|add\|link\|remove [<project> \| --series <s>]` | The user references (`references.yaml`, files in `assets/references/`): mood boards, photos, storyboards, concepts, footage, voices, links, with kind, subject, and note. |
| `npm run cli -- migrate-layout [--dry-run]` | Move series canons from the old `series/<slug>/` to `projects/<slug>/` and rewrite the paths into them (ADR 0035); the user runs it once per old workspace. |
| `npm run cli -- character list\|import\|new\|add-file\|use\|remove` | The workspace character library (`library/characters/<id>/`): `import <project> [--series] [--id] [--into]` takes characters in (runs by itself at `stage-done … style-character`); `use <project> <id> [--series] [--states <ids>\|all]` copies one into a music video or canon with `library: <id>`. |
| `npm run cli -- import-song <project>` | Register `audio/song.wav` and `audio/stems/vocals.wav` in `song.json`; converts other formats. |
| `npm run cli -- normalize-audio <project> --input <file>` | Normalize audio to −14 LUFS / −1 dBTP. |
| `npm run cli -- footage <project> --input <file> --name <name>` | Normalize a footage proxy. |
| `npm run cli -- frame <project> --input <clip> --position first\|middle\|last` | Extract a review or chaining frame; `--at <seconds>` takes the frame at a time, also from a render. |
| `npm run cli -- pose-extract <project> --input <clip> --name <id> [--from <s\|m:ss>] [--to <s\|m:ss>] [--person largest\|center\|<n>] [--preview]` | Pose track of one person in a reference clip into `assets/poses/<id>.json` (COCO-17 keypoints, normalized, with confidence) and a quality report; `--preview` adds `<id>.preview.mp4` for review. A motion source only. |
| `npm run cli -- review-image <project\|series> --image <png[,png]>\|--clip <mp4> --shot <id>\|--ref <kind:id>` | Art-director verdict on one image or clip, headless in its own context; `--clip` extracts the first, middle, and last frame itself and measures the first against the keyframe. Prints `{verdict, score, issues, fix_prompt}` and appends to `verdicts.jsonl` (exit 2 on fail). |
| `npm run cli -- queue add <project> --kind keyframe\|clip [--shots <ids>] [--workflow <w>] [--overrides <file>]` | Queue keyframes or clips built from `storyboard.yaml` (prompt, references, dependencies); `--batch <file>` queues hand-written items with `id` and `out`. |
| `npm run cli -- queue run\|wait\|status <project>` | Work `assets/queue.json`: generate in order, review each result in the background, requeue failed images with the fix prompt, file approved results at `out`; `wait` blocks until an item needs a fix or the run ended. |
| `npm run cli -- queue retry\|accept\|drop <project> <id>` | Put an item back (`--prompt`, `--item <file>`, `--provider <p>` for the cloud attempt), approve an attempt by hand, or remove an item. |
| `npm run cli -- patch <project> --image <png> --box <x,y,w,h> --prompt "<edit>" [--refs <png,…>] [--shot <id>] [--replace]` | Edit one region: crop (grown to a standard aspect ratio), `image.edit` through `generate` (cache, manifest, budget), paste back with a soft edge and without stretching, file as the next attempt. `--series <s>` for a canon image. |
| `npm run cli -- sheet <project> --images <png,…> [--box <x,y,w,h>]` | Put images side by side (optionally zoomed into one region) as `assets/review/sheets/<name>.png`. |
| `npm run cli -- verdicts <project\|series> [--failed]` | Last art-director verdict per shot and reference. |
| `npm run cli -- probe <file…>` | Size, length, frame rate, and codecs of images, clips, and audio. |
| `npm run cli -- comfy status\|restart` | ComfyUI server, queue, and VRAM; restart through `COMFYUI_RESTART_COMMAND`. |
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

In Claude Code: `/new-video`, `/new-series`, and `/new-episode` (skills), `/video-next`, `/video-status`, `/series-status`.

## Skills

Own skills: `new-video`, `video-brief`, `video-treatment`, `audio-analysis`, `style-bible`, `character-bible`, `storyboard`, `remotion-motion`, `ai-clips`, `footage`, `assembly-render`, `video-qa`, and for series and episodes `new-series`, `new-episode`, `voice-track`, `episode-track`. Outside the pipeline: `model-bench` compares models and servers before a model switch; `release-backfill` brings an existing or already published project into the release board and calendar.

Vendored from Matt Pocock (MIT, see `docs/THIRD_PARTY.md`): `grill-me`, `grilling`.

Use `grilling` before briefs, treatments, and storyboards.

## Conventions

- Repository artifacts are in English.
- Use the terms in `docs/glossary.md` in schemas, skills, docs, and code.
- Own skills use only `name`, `description`, and `license` in frontmatter.
- Time values in a storyboard are symbolic anchors, never hard-coded seconds unless there is no alternative.
- Remotion animation is frame-driven: `useCurrentFrame()`, `random(seed)`, no wall clock, no `useFrame` clock, no time-based CSS animation.
- Generated media, secrets, and copyrighted material are never committed.

## Documentation

- `docs/glossary.md` — ubiquitous language.
- `docs/architecture.md` — data flow, state, cache, providers, rendering.
- `docs/pipeline.md` — stage-by-stage runbook.
- `docs/providers.md` — provider selection, credentials, batches, budget, and model roles.
- `docs/adr/` — architecture decision records.
- `docs/THIRD_PARTY.md` — vendored skills, licenses, fonts, providers.
- `docs/mcp.md` — optional exploration MCP servers; provider adapters.
- `docs/board.md` — the board: production view, the watchdog, and the board container.
- `docs/board-guide.md` — the board tour for a user new to the board, with screenshots (German: `board-guide.de.md`).
- `docs/publishing.md` — `publish` and the release autopilot: YouTube, TikTok, X, LinkedIn, and Instagram setup, limits, quota.
- `docs/release-platforms.md` — what each platform takes (fields, limits, links), posting times, legal notes for Germany.
- `docs/adr/0024-release-folder-manual-distribution.md` — the release folder and the manual distributor upload.

## License

MIT. Remotion is source-available under its own license; see `docs/THIRD_PARTY.md`. Do not commit songs, stems, generated fal.ai/Higgsfield/Topview media, or copyrighted music to this repository.
