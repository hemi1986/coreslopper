# Onboarding with npx

`npx coreslopper init` creates a self-contained workspace and configures the tools and credentials the pipeline needs. It is the fastest path from a clean machine to a first project.

## Requirements

- Node.js 22 or newer (needed to run `npx` and the TypeScript pipeline).
- npm (ships with Node).
- Optional but recommended: `uv`, Python 3.12+, `ffmpeg`, `git`, and Claude Code. The wizard checks all of them and offers to install what it can.

## Interactive

```bash
npx coreslopper@latest init my-video
```

The wizard:

1. Picks a target directory and refuses to overwrite a non-empty directory unless you confirm or pass `--force`.
2. Checks Node, npm, git, uv, Python, ffmpeg, and Claude Code.
3. Offers to install uv, Python 3.12 (via uv), ffmpeg, and Claude Code.
4. Asks how visuals are generated:
   - `mock` — motion graphics and dry runs, no API key;
   - `fal` — AI keyframes and image-to-video, needs `FAL_KEY`;
   - `higgsfield` — AI keyframes and image-to-video, needs a Higgsfield credential.
5. Validates optional fal.ai and Higgsfield credentials and writes them to `.env` with mode `0600`.
6. Creates the first project and runs `npm install` plus `uv sync --group dev`.

At the end, open Claude Code in the workspace and run `/new-video <slug>`. The skill asks for the lyrics, tells you where to put the song and its vocal stem, and grills you into the brief and treatment. Then `/video-next <slug>` runs the rest. coreslopper always works from a finished song; it does not generate music.

## Non-interactive

Use `--yes` in scripts, CI, or when you already know the answers:

```bash
npx coreslopper@latest init my-video \
  --yes \
  --visual higgsfield \
  --budget 50 \
  --project my-video
```

`--yes` uses the `mock` visual provider by default. Set `FAL_KEY` or `HIGGSFIELD_API_KEY` in the environment for a real provider. Prefer environment variables or the interactive prompt; a key passed on the command line can end up in your shell history. Use `--image-provider` and `--video-provider` to mix providers, for example Higgsfield for keyframes and fal.ai for video.

Add `--install-tools` to let the non-interactive run install missing uv, Python, ffmpeg, and Claude Code.

## Flags

| Flag | Default | Purpose |
|---|---|---|
| `[dir]` | `.` | Target workspace directory. |
| `-y, --yes` | off | Skip prompts and use defaults. |
| `--force` | off | Merge into a non-empty directory. |
| `--no-install` | install | Skip `npm install` and `uv sync`. |
| `--no-git` | git init | Do not initialize a git repository. |
| `--install-tools` | off | Install missing uv, Python, ffmpeg, and Claude Code in non-interactive mode. |
| `--no-tool-install` | off | Do not offer to install system tools in interactive mode. |
| `--visual <mock\|fal\|higgsfield>` | `mock` | Image and video provider for the first project. |
| `--image-provider <mock\|fal\|higgsfield>` | `--visual` | Image provider override. |
| `--video-provider <mock\|fal\|higgsfield\|comfyui>` | `--visual` | Video provider override. `comfyui` renders clips locally ([comfyui/README.md](../comfyui/README.md)). |
| `--budget <usd>` | `50` | First project budget. Minimum $5. |
| `--project <slug>` | target folder name | First project slug. |
| `--title <title>` | derived from slug | First project title. |
| `--fal-key <key>` | `FAL_KEY` | fal.ai API key. |
| `--higgsfield-key <key>` | `HIGGSFIELD_API_KEY` | Higgsfield credential (`key_id:key_secret`). |
| `--skip-project` | off | Create the workspace without a first project. |

Run `npx coreslopper init --help` for the current list.

## What gets created

```text
my-video/
  .claude/                 skills, commands, agents, hooks
  .env                     local secrets (gitignored, mode 0600)
  coreslopper.workspace.json
  GETTING_STARTED.md
  config/                  defaults and model roles
  docs/                    workflow documentation
  packages/                core, CLI, providers, Remotion composition
  projects/
    demo/                  the license-safe motion demo
    my-video/              your first project
  scripts/                 audio analysis and fixtures
  templates/project/       template for new projects
  package.json
```

The workspace is private and self-contained. It is not a git clone; `npx coreslopper init` copies a versioned runtime snapshot into the folder. That makes onboarding deterministic and independent of GitHub availability.

## Credentials

`.env` is gitignored and created with mode `0600`.

```bash
# fal.ai
FAL_KEY=...

# Higgsfield: complete credential from open.higgsfield.ai ...
HIGGSFIELD_API_KEY=key_id:key_secret

# ... or the split values. HF_API_KEY, HF_KEY, and HF_CREDENTIALS are also accepted.
HF_API_KEY_ID=...
HF_API_KEY_SECRET=...
```

The song needs no credential; you bring it yourself. The mock provider and the motion-only demo need no credentials.

## Day-to-day commands

Inside the workspace, use the local CLI:

```bash
npm run cli -- doctor
npm run demo
npm run cli -- new another-video --budget 50
npm run cli -- status another-video
npm run cli -- validate another-video
npm run cli -- render another-video --format 16x9
```

`npx coreslopper` also works inside a workspace for `doctor`, `new`, `status`, and `validate`:

```bash
npx coreslopper doctor
npx coreslopper status my-video
```

Rendering and asset generation use the workspace's own dependencies, so run them through `npm run cli -- ...`.

For real lyric alignment and stem separation, add the optional WhisperX and Demucs extras:

```bash
cd scripts/audio-analysis
uv sync --extra asr --extra stems
```

The base install is enough for the motion-only demo and for projects that import a song with existing timing.

## Updating a workspace

The workspace is a snapshot. Pick up a newer workflow version with `update`, run from inside the workspace. Commit first, so `git diff` shows exactly what the update changed:

```bash
git add -A && git commit -m "chore: before coreslopper update"
npx coreslopper@latest update --dry-run   # optional: preview
npx coreslopper@latest update
```

`update` compares three states per file: the **baseline** recorded in `coreslopper.workspace.json` at the last init or update, your workspace, and the new runtime.

| Your file | Upstream | Result |
|---|---|---|
| unchanged | changed | updated |
| unchanged | removed | deleted |
| changed | unchanged | kept |
| changed | changed | kept; new version written as `<file>.coreslopper-new` |
| changed | removed | kept |
| deleted | any | stays deleted |

Merge each `.coreslopper-new` file into the original and delete it. `--force` overwrites changed files instead.

`projects/` belongs to you: `update` adds new upstream files there but never overwrites or deletes anything. `.env`, `.mcp.json` (if you added one), and `GETTING_STARTED.md` are never touched. `package-lock.json` always follows upstream. Afterwards `update` runs `npm install` and `uv sync`; pass `--no-install` to skip them.

| Flag | Effect |
|---|---|
| `--dry-run` | List the changes without writing anything. |
| `--force` | Overwrite locally changed files; also allows a downgrade. |
| `--no-install` | Skip `npm install` and `uv sync`. |

Workspaces created before `update` existed have no baseline, so every file that differs from upstream counts as a conflict. Commit, then run `npx coreslopper@latest update --force` once; it records the baseline for later updates.

## Troubleshooting

- **`uv: command not found` after installation** — open a new shell or add `~/.local/bin` to `PATH`.
- **ffmpeg missing** — on Linux x64, run `./scripts/install-ffmpeg.sh` in the workspace; otherwise install it with your package manager. It is optional for the motion-only demo.
- **`FAL_KEY` rejected** — create a key on the `API` preset at <https://fal.ai/dashboard/keys> and update `.env`.
- **Higgsfield credential rejected** — create or rotate an API key in the Higgsfield Console at <https://console.higgsfield.ai> and update `.env`. Use `key_id:key_secret` as one value or set `HF_API_KEY_ID` and `HF_API_KEY_SECRET`.
- **`npm install` failed** — run it again in the workspace. The rest of the onboarding output is still valid.
- **`uv sync` failed** — run `npm run python:sync` inside the workspace. Audio analysis needs it; the motion-only demo does not.
- **A paid generation is refused** — check the project budget and the batch cap with `npm run cli -- status <slug>`.
