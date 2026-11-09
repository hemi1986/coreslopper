# coreslopper

An open-source, Claude Code-native workflow for making music videos: from an idea and a song to a validated storyboard and a finished Remotion render.

> **Status: work in progress.** The pipeline is being tested end to end. Stages, schemas, and provider integrations may still change. Treat it as an experiment, not a production tool.

![A frame from the motion-only demo](docs/assets/demo-still.png)

Agent skills do the creative work (brief, treatment, storyboard, prompts). Tested scripts do the mechanical work (audio analysis, validation, budget checks, caching, rendering). Each shot can be motion graphics, an AI clip, real footage, or a mix. The pipeline runs on its own and stops only for budget, missing credentials, or a validation failure it cannot fix.

## Requirements

- Node.js 22+, Python 3.12+, [uv](https://docs.astral.sh/uv/), `ffmpeg`, and [Claude Code](https://claude.com/claude-code). `init` checks them and offers to install the missing ones.
- For AI visuals: a [fal.ai](https://fal.ai) key or a [Higgsfield](https://higgsfield.ai) credential. Without one, the mock provider renders placeholders.
- A finished song: the mix, ideally its vocal stem, and the lyrics. coreslopper does not generate music.
- Optional: an NVIDIA GPU for faster lyric alignment. CPU works.

## 1. Create a workspace

A workspace is one folder that holds the workflow and all your video projects. Create it once:

```bash
npx coreslopper@latest init my-videos
cd my-videos
```

The wizard checks your tools, asks for provider keys (stored in `.env`, gitignored), and creates a first project. Every later command runs inside this folder. See [docs/onboarding.md](docs/onboarding.md) for all flags.

## 2. New project

coreslopper always starts from a finished song. Bring the mix, ideally its vocal stem, and the lyrics.

**Install the lyric aligner once per workspace** (WhisperX and Demucs, a large download):

```bash
(cd scripts/audio-analysis && uv sync --extra asr --extra stems)
```

**Start Claude Code and create the project:**

```bash
claude
```

```text
/new-video
```

The `new-video` skill walks you through setup:

1. It asks for the title, artist, slug, budget (USD, mandatory), visual provider (`mock`, `fal`, or `higgsfield`), the sung language, and the song's rights, then creates the project.
2. It asks you to paste the lyrics and adds section tags (`[Verse 1]`, `[Chorus]`, …) for you to confirm.
3. It tells you where to put the audio:
   - the mix at `projects/<slug>/audio/song.wav`,
   - the vocal stem at `projects/<slug>/audio/stems/vocals.wav`.

   WAV goes straight in; `song.mp3`, `vocals.flac`, and other formats with the same name are converted. Export both from the same session so they line up. The stem is optional, but it makes the lyric timing much more accurate. When you confirm, it runs `npm run cli -- import-song` to check the files and record them in `song.json`.
4. It grills you about the video and writes `brief.md` and `treatment.md` with you.

Higgsfield has no lip-sync yet. For lip-sync shots, add a `FAL_KEY` to `.env` and set `lipsync: fal` in `projects/<slug>/project.yaml` ([details](docs/providers.md)).

**Run the pipeline.** At the end, `new-video` offers to start it, or run it yourself:

```text
/video-next <slug>
```

It analyzes the song, builds the style and character bibles, writes and validates the storyboard, generates the assets, and renders `projects/<slug>/renders/` without further questions. If you stop halfway through setup, `/new-video <slug>` resumes where you left off.

## Everyday commands

Run these inside the workspace.

| Command | What it does |
|---|---|
| `npm run cli -- status <project>` | Stages, spend, and the next step. |
| `npm run cli -- validate <project>` | Check timing, storyboard, style, and characters. |
| `npm run cli -- render <project> --format 16x9` | Render a format (`16x9`, `9x16`, `1x1`). |
| `npm run cli -- estimate --role image.keyframe --units 8 --project projects/<project>` | Check a cost against the budget. |
| `npm run cli -- doctor` | Check tools, fonts, Remotion, and keys. |
| `/video-next <project>` | Run all open stages in Claude Code. |
| `/video-next <project> --stage storyboard` | Rerun one stage. |
| `/video-status <project>` | Read-only status in Claude Code. |

The pipeline is resumable: run `/video-next` again after a stop, and it continues where it left off. Generated assets are cached, so a rerun does not pay twice.

## Update the workspace

New releases bring new skills and fixes. Commit first, then update from inside the workspace:

```bash
git add -A && git commit -m "chore: before coreslopper update"
npx coreslopper@latest update
```

Your projects, `.env`, and your own edits to workflow files are kept. If a file you changed also changed upstream, the new version is saved next to it as `<file>.coreslopper-new`. Workspaces created with 0.1.0 need `update --force` once. Details: [docs/onboarding.md](docs/onboarding.md#updating-a-workspace).

## Learn more

| Topic | Document |
|---|---|
| Setup flags, credentials, updating, troubleshooting | [docs/onboarding.md](docs/onboarding.md) |
| What each stage does, and running one by hand | [docs/pipeline.md](docs/pipeline.md) |
| fal.ai, Higgsfield, budgets, and model roles | [docs/providers.md](docs/providers.md) |
| Optional MCP servers | [docs/mcp.md](docs/mcp.md) |
| How it works inside | [docs/architecture.md](docs/architecture.md), [docs/adr/](docs/adr/) |
| Terms used everywhere | [docs/glossary.md](docs/glossary.md) |
| Why it is built this way | [docs/PLAN.md](docs/PLAN.md) |

## License

The workflow is [MIT](LICENSE). **Remotion, the renderer, is source-available, not open source:** it is free for individuals, non-profits, and companies with up to 3 employees; larger for-profit companies need a Remotion license. Make sure you hold the rights to the song before you publish a video. See [docs/THIRD_PARTY.md](docs/THIRD_PARTY.md).

## Contributing and security

To work on coreslopper itself, clone the repository and follow [CONTRIBUTING.md](CONTRIBUTING.md); it includes the demo project, which needs no API keys. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
