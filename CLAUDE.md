@AGENTS.md

# Claude Code specifics

## Commands

- `/new-video <slug> --budget <usd>` — create a project from `templates/project/`. Budget is mandatory.
- `/video-next <slug>` — run all open stages. Add `--stage <stage>` to run one stage, or `--dry-run` to inspect the next stage.
- `/video-status [slug]` — read-only stage and budget report.

`/video-next` dispatches one `stage-runner` subagent per stage. Do not inline a whole stage into the main context.

## Agents

- `stage-runner` — executes exactly one stage in a fresh context and returns a compact summary.
- `art-director` — reviews stills, keyframes, character sheets, and clip frames against the style bible.
- `qa-checker` — runs schema, asset, sync, readability, determinism, and budget checks; writes `review/report.md`.

## Hooks

`.claude/settings.json` registers a `PostToolUse` hook for `Write|Edit`. It validates changes to `storyboard.yaml`, `timing.json`, `timing.overrides.json`, `project.yaml`, `state.json`, `style.yaml`, and `characters.yaml`. Exit code 2 blocks the edit and returns the validation message.

The hook calls `npm run cli -- validate-file <file>`, which is also runnable by hand.

## MCP

`.mcp.json` configures the official Suno MCP server at `https://api.suno.com/mcp`. Authentication is handled by Claude Code's MCP login flow. Suno is optional when a project imports an existing song.

fal.ai is used through the pipeline adapter (`FAL_KEY`), not through MCP. If you want to explore fal.ai models interactively, add a project-scoped MCP server for fal.ai and keep it out of the pipeline.

## Permissions and safety

- Never echo, commit, or hard-code API keys.
- Never commit `audio/`, `assets/`, `renders/`, or `.env`.
- Generated media belongs to the project, not the workflow repo.
- Do not overwrite `timing.overrides.json` or `project.yaml` from a stage runner.
- A paid batch must pass the cost estimate and the project budget before the first call.

## Skill frontmatter

Our skills use only `name`, `description`, and `license`. Vendored skills keep their upstream frontmatter; `grill-me` intentionally keeps `disable-model-invocation: true` as a Claude Code hint. Other agents ignore that key.

## Subagent orchestration

The main session is the orchestrator. It should:

1. Read `state.json`, `project.yaml`, and `review/report.md`.
2. Dispatch `stage-runner` with the project path, stage ID, and skill names.
3. Mark the stage done or failed through the CLI.
4. Stop on budget, credential, or unrecoverable validation failures.
5. Never paste raw assets or full transcriptions into the main context.

See `AGENTS.md` for the full pipeline and `docs/PLAN.md` for the rationale.
