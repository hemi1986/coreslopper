# coreslopper

An open-source, Claude Code-native workflow for making music videos: from an idea and a song to a validated storyboard and a finished Remotion render.

> **Status: work in progress.** The pipeline is being tested end to end. Stages, schemas, and provider integrations may still change. Treat it as an experiment, not a production tool.

![A frame from the motion-only demo](docs/assets/demo-still.png)

Agent skills do the creative work (brief, treatment, lyrics, storyboard, prompts). Tested scripts do the mechanical work (audio analysis, validation, budget checks, caching, rendering). Each shot can be motion graphics, an AI clip, real footage, or a mix. The pipeline runs on its own and stops only for budget, missing credentials, or a validation failure it cannot fix.

## Requirements

- Node.js 22+, Python 3.12+, [uv](https://docs.astral.sh/uv/), `ffmpeg`, and [Claude Code](https://claude.com/claude-code). `init` checks them and offers to install the missing ones.
- For AI visuals: a [fal.ai](https://fal.ai) key or a [Higgsfield](https://higgsfield.ai) credential. Without one, the mock provider renders placeholders.
- For song generation: a Suno account. Not needed when you bring your own song.
- Optional: an NVIDIA GPU for faster lyric alignment. CPU works.

## 1. Create a workspace

A workspace is one folder that holds the workflow and all your video projects. Create it once:

```bash
npx coreslopper@latest init my-videos
cd my-videos
```

The wizard checks your tools, asks for provider keys (stored in `.env`, gitignored), sets up the Suno MCP server, and creates a first project. Every later command runs inside this folder. See [docs/onboarding.md](docs/onboarding.md) for all flags.

## 2. New project with an existing Suno song

You have a finished song, ideally with its vocal stem, and the lyrics.

**Create the project.** Pick `--visual higgsfield`, `fal`, or `mock`. Budget is in USD and mandatory:

```bash
npm run cli -- new neon-rain --budget 50 --visual higgsfield
```

Higgsfield has no lip-sync yet. For lip-sync shots, add a `FAL_KEY` to `.env` and set `lipsync: fal` in `projects/neon-rain/project.yaml` ([details](docs/providers.md)).

**Add the song.** WAV goes straight in; MP3, M4A, and other formats are converted. The vocal stem is optional, but it makes the lyric timing much more accurate:

```bash
cp ~/Downloads/neon-rain.wav projects/neon-rain/audio/song.wav
# or: npm run cli -- normalize-audio neon-rain --input ~/Downloads/neon-rain.mp3

mkdir -p projects/neon-rain/audio/stems
cp ~/Downloads/neon-rain-vocals.wav projects/neon-rain/audio/stems/vocals.wav
```

**Add the lyrics** to `projects/neon-rain/lyrics.txt`, exactly as sung, with section tags:

```text
[Verse 1]
Line one
Line two

[Chorus]
Line three
Line four
```

**Describe the song** in `projects/neon-rain/song.json`. `language` matters: it selects the speech model for the lyric alignment.

```json
{
  "source": "suno",
  "title": "Neon Rain",
  "path": "audio/song.wav",
  "language": "en",
  "hasVocals": true,
  "stems": true,
  "license": "Suno output; check your plan and local law"
}
```

**Write your idea** in a few sentences into `projects/neon-rain/brief.md`: what the video is about, the mood, the look.

**Tell the pipeline what you supplied**, so it does not write a new brief, new lyrics, or a new song:

```bash
npm run cli -- stage-done neon-rain brief --outputs brief.md
npm run cli -- stage-skip neon-rain lyrics --reason "Imported lyrics"
npm run cli -- stage-skip neon-rain song --reason "Imported Suno song"
```

**Install the lyric aligner once per workspace** (WhisperX and Demucs, a large download):

```bash
(cd scripts/audio-analysis && uv sync --extra asr --extra stems)
```

**Run the pipeline** in Claude Code:

```bash
claude
```

```text
/video-next neon-rain
```

It analyzes the song, builds the style and character bibles, writes and validates the storyboard, generates the assets, and renders `projects/neon-rain/renders/`.

## 3. New project without a song

Suno writes and sings the song. The pipeline writes the lyrics.

```bash
npm run cli -- new my-video --budget 50 --visual higgsfield --song-provider suno
```

Write your idea into `projects/my-video/brief.md` and mark it done (or skip this, and the pipeline drafts a brief from the title):

```bash
npm run cli -- stage-done my-video brief --outputs brief.md
```

Then, in Claude Code, authenticate Suno once and start:

```text
/mcp
/video-next my-video
```

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
| Suno MCP | [docs/mcp.md](docs/mcp.md) |
| How it works inside | [docs/architecture.md](docs/architecture.md), [docs/adr/](docs/adr/) |
| Terms used everywhere | [docs/glossary.md](docs/glossary.md) |
| Why it is built this way | [docs/PLAN.md](docs/PLAN.md) |

## License

The workflow is [MIT](LICENSE). **Remotion, the renderer, is source-available, not open source:** it is free for individuals, non-profits, and companies with up to 3 employees; larger for-profit companies need a Remotion license. Check your Suno plan before you publish a video with a Suno song. See [docs/THIRD_PARTY.md](docs/THIRD_PARTY.md).

## Contributing and security

To work on coreslopper itself, clone the repository and follow [CONTRIBUTING.md](CONTRIBUTING.md); it includes the demo project, which needs no API keys. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
