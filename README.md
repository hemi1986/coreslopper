# coreslopper

An open-source, Claude Code-native workflow for making music videos: from a brief, through lyrics and a song, to a validated storyboard and a finished Remotion render.

![A frame from the motion-only demo](docs/assets/demo-still.png)

The demo is a 12-second, motion-only project. It runs without API keys and is the first vertical slice of the pipeline.

## Why this exists

Most AI music-video workflows are either a pile of prompts or a pile of scripts. coreslopper separates them:

- **Creative work** (brief, treatment, lyrics, storyboard, prompts) is done by focused agent skills.
- **Mechanical work** (audio analysis, schema validation, caching, budget checks, rendering, export) is done by tested TypeScript and Python.
- **Every shot chooses its source**: motion graphics, an AI clip, real footage, or a mix. The decision lives in the storyboard, not in the project setup.
- **The pipeline is autonomous by default.** It stops only for budget, missing credentials, or an unrecoverable validation failure. Quality is established before the run through grilling and enforced during the run by automated critics.
- **It is resumable and thrifty.** `state.json` tracks every stage; generated assets are cached by a hash of model, prompt, seed, references, and params.

Read [the plan](docs/PLAN.md) for the full rationale, [the ADRs](docs/adr/) for the decisions, and [the glossary](docs/glossary.md) for the language.

## Features

- **Brief → treatment → lyrics → song → timing → style → storyboard → assets → render → QA.**
- **Storyboard coverage validation.** Shots use symbolic anchors (`section`, `line`, `word`, `beat`, `downbeat`) and must cover the song with no gaps or overlaps.
- **Local-first audio analysis.** Demucs for stems, WhisperX for word alignment, librosa for BPM/beats/downbeats/onsets/energy. The lyrics are authoritative; only timestamps come from ASR.
- **Provider-agnostic generation.** `generateImage`, `editImage`, `imageToVideo` behind a narrow adapter. fal.ai is the first real adapter; a deterministic mock adapter powers tests and no-account runs.
- **Cost guard.** Mandatory per-project budget, batch cap, pre-batch estimate, manifest, and cache. Unknown pricing is a hard error.
- **Character consistency.** Reference images are required for recurring characters; frame chaining is available per storyboard transition.
- **Remotion renderer.** Frame-driven motion graphics, typography, 3D via `@remotion/three`, and a reusable effect library.
- **Claude Code layer.** `/new-video`, `/video-next`, `/video-status`, fresh-context stage runners, art-director and QA critics, and schema-validating hooks.
- **Open-source safe.** MIT for the workflow, no secrets, no copyrighted media, a license-safe demo, and explicit third-party notices.

## Requirements

- Node.js 22 or newer.
- Python 3.12 or newer and [uv](https://docs.astral.sh/uv/).
- `ffmpeg` and `ffprobe` on `PATH` for footage import and loudness normalization. The motion-only demo does not need them.
- Optional: a CUDA GPU for WhisperX/Demucs. CPU works but is slower.
- Optional: a Suno account for song generation and a `FAL_KEY` for AI image/video generation.

## Quickstart

```bash
git clone <your-fork> coreslopper
cd coreslopper
npm install

# Generate the license-safe demo audio and validate the project
npm run demo:audio
npm run cli -- validate projects/demo

# Contact sheet and 16:9 render
npm run cli -- contact-sheet projects/demo
npm run cli -- render projects/demo --format 16x9
```

The render is written to `projects/demo/renders/16x9.mp4`.

Check your environment at any time:

```bash
npm run cli -- doctor
```

## Create a project

```bash
npm run cli -- new my-video --budget 50
```

Budget is mandatory. The command creates `projects/my-video/` from `templates/project/` and initializes `state.json`. Then open Claude Code in the repository and run:

```text
/video-next my-video
```

Add `--stage <stage>` to run one stage, or `--dry-run` to inspect the next stage and budget.

## Pipeline

| # | Stage | What happens | Output |
|---|---|---|---|
| 1 | `brief` | Grill the idea; write topic, source, audience, length, formats, style, constraints. | `brief.md` |
| 2 | `treatment` | Core idea, visual world, dramaturgy, shot mix. | `treatment.md` |
| 3 | `lyrics` | Original lyrics with section tags plus a Suno style prompt. | `lyrics.txt`, `suno-style.txt` |
| 4 | `song` | Suno MCP (two variants, scored) or import. Stems when available. | `song.json`, `audio/song.wav` |
| 5 | `audio-analysis` | Demucs + WhisperX + librosa; section table with confidence flags. | `timing.json`, `timing.report.md` |
| 6 | `style-character` | Palette, typography, look, motion rules, character sheets. | `style.yaml`, `characters.yaml` |
| 7 | `storyboard` | Anchored shots, coverage validation, contact sheet. | `storyboard.yaml`, `storyboard.md` |
| 8 | `assets` | Motion components, AI keyframes/clips, footage proxies. | `assets/`, `manifest.jsonl` |
| 9 | `assembly` | Remotion timeline, preview, master, derivatives. | `renders/` |
| 10 | `qa-export` | Sync, readability, determinism, budget reconciliation, all formats. | `review/report.md`, renders |

No creative approval gate blocks the run. A stage stops only on budget, missing credentials, or an unrecoverable validation failure.

## Audio analysis

```bash
cd scripts/audio-analysis
uv sync                 # core: librosa, numpy, soundfile, jsonschema
uv sync --extra asr     # WhisperX word alignment
uv sync --extra stems   # Demucs vocal separation
uv run python analyze.py --project ../../projects/my-video --device cuda
```

The script writes `timing.json` and `timing.report.md`. It never writes `timing.overrides.json`; that file is yours and always wins at load time.

For a fixture or a motion-only demo, `--skip-asr` distributes lyric timings without speech recognition. Real lyric videos should use WhisperX.

## AI generation

The provider interface is intentionally small:

```ts
generateImage(input): Promise<ImageResult>;
editImage(input): Promise<ImageResult>;
imageToVideo(input): Promise<VideoResult>;
```

Model IDs and defaults live in [`config/models.yaml`](config/models.yaml), not in code. A change of model is a configuration change.

A generation batch is a JSON array:

```json
[
  {
    "operation": "editImage",
    "role": "image.keyframe",
    "prompt": "Nova stands in neon rain, cinematic close-up",
    "references": ["characters/nova/sheet.png"],
    "seed": 1234
  },
  {
    "operation": "imageToVideo",
    "role": "video.image_to_video.quality",
    "prompt": "slow push in, rain streaks, neon reflections",
    "references": ["assets/keyframes/shot-004.png"],
    "durationSeconds": 5,
    "seed": 1234
  }
]
```

Estimate and run:

```bash
npm run cli -- estimate --role image.keyframe --units 8 --project projects/my-video
npm run cli -- generate projects/my-video --batch assets/batches/scene-01.json
```

Every call is cached by a SHA-256 hash of the canonical request and recorded in `assets/manifest.jsonl` with model, prompt, seed, references, cost, and cache status. A cache hit costs nothing.

Set `FAL_KEY` in `.env` for the real adapter. Without it, use the mock provider:

```yaml
providers:
  image: mock
  video: mock
  song: import
```

## Claude Code layer

- **`/new-video`** creates a project from the template. Budget is required.
- **`/video-next`** runs all open stages, one fresh `stage-runner` subagent per stage. It stops only on hard stops.
- **`/video-status`** is read-only.
- **`art-director`** judges stills, keyframes, character sheets, and clip frames against the style bible.
- **`qa-checker`** runs schema, asset, sync, readability, determinism, and budget checks.
- **Hooks** validate `storyboard.yaml`, `timing.json`, `timing.overrides.json`, `project.yaml`, `state.json`, `style.yaml`, and `characters.yaml` after edits.
- **MCP** includes the official Suno server at `https://api.suno.com/mcp`. fal.ai is used through the adapter, not MCP.

See [CLAUDE.md](CLAUDE.md) for the Claude Code specifics.

## Repository layout

```text
.claude/          skills, commands, agents, hooks, settings
config/           model roles and defaults
docs/             plan, glossary, architecture, pipeline, ADRs, third-party notices
packages/
  core/           Zod schemas, state, timing, hash, cost, project loader
  providers/      fal.ai + mock, cache, manifest
  cli/            validate, status, new, render, contact-sheet, stage commands
  remotion/       MusicVideo composition, motion components, effects, 3D
schema/           generated JSON Schema
scripts/          audio analysis (Python/uv), fixtures
templates/project project template
brand/example/    neutral synthwave/cyberpunk kit, OFL fonts
projects/         video projects; media is gitignored
```

## State, caching, and budget

- `project.yaml` requires `budget_usd`. `batch_cap_usd` defaults to 30 % of the remaining budget.
- `state.json` records every stage, attempts, outputs, errors, and spend.
- `timing.overrides.json` is user-owned and never overwritten.
- Generated assets live in `.cache/generations/<hash>/` and are recorded in `assets/manifest.jsonl`.
- `timing.effective.json` is generated by validation; it is derived and gitignored.

## Formats

- Master: 16:9, 1920×1080, 30 fps, H.264.
- Derivatives: 9:16 1080×1920 and 1:1 1080×1080 by default; 4:5 optional.
- 4K/60 is not a default. Add it as a project-specific format when needed.

Derivatives are separate compositions with safe-area-aware layouts, not naive crops.

## Open source and licensing

- The workflow is **MIT** licensed. See [LICENSE](LICENSE).
- **Remotion is source-available, not OSI open source.** It is free for individuals, organizations with up to 3 employees, and non-profits; larger for-profit organizations need a Remotion license. See [docs/THIRD_PARTY.md](docs/THIRD_PARTY.md).
- The vendored Matt Pocock skills are MIT, pinned and attributed.
- The example brand uses OFL fonts (Orbitron, Space Grotesk, JetBrains Mono) and an original mark.
- The demo audio is generated by a script. No Suno/fal.ai output or copyrighted music is committed.

**Do not commit** API keys, `.env`, generated audio/video, or copyrighted media. The repository is open source; keep it license-safe.

## Documentation

- [docs/PLAN.md](docs/PLAN.md) — agreed architecture and delivery plan.
- [docs/architecture.md](docs/architecture.md) — data flow, state, cache, providers, rendering.
- [docs/pipeline.md](docs/pipeline.md) — stage-by-stage runbook.
- [docs/glossary.md](docs/glossary.md) — ubiquitous language.
- [docs/adr/](docs/adr/) — architecture decision records.
- [docs/THIRD_PARTY.md](docs/THIRD_PARTY.md) — licenses and attribution.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md), run `npm test`, `npm run typecheck`, and `npm run python:test`, and keep the demo green. For a new skill, use the vendored `writing-for-agents` guidance and keep frontmatter to `name`, `description`, and `license`.

## Security

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md). Never include a real API key in an issue, a screenshot, or a log.
