# npx onboarding with a versioned runtime snapshot

> Extended by [ADR 0011](0011-higgsfield-provider.md): onboarding also checks and stores Higgsfield credentials.

**Status:** Accepted

## Context

The repository is both the workflow and the workspace. Cloning it is fine for contributors, but it is a poor first-run experience for someone who only wants to make a video: they must know to clone, install Node and Python dependencies, configure fal.ai, and add the Suno MCP server. A single `npx` command can remove that setup tax without turning the project into a hosted service.

## Decision

Publish the root package as `coreslopper` with a small `init`/`doctor`/`new`/`status` CLI. `npx coreslopper init` copies a versioned runtime snapshot from the package into a new workspace, checks the local toolchain, optionally installs uv, Python, ffmpeg, and Claude Code, validates and stores `FAL_KEY` in `.env`, and writes the Suno server to `.mcp.json`. The workspace is a private, self-contained copy of the repository; day-to-day commands run through its local `npm run cli`. The npm package contains only the onboarding bin, the runtime snapshot, and its runtime dependencies; Remotion and the rendering dependencies stay in the workspace, so `npx` does not download the full render stack.

## Consequences

- Onboarding is one command and works without git or GitHub access.
- The workspace is a snapshot, not a clone. Updating means re-running `init --force` (documented in `docs/onboarding.md`), not `git pull`.
- The npm tarball includes the runtime (~1.2 MB compressed) and must be rebuilt with `npm run build` before publishing.
- Tool installation is best-effort: Node itself and fal.ai/Suno accounts remain the user's responsibility.
- Secrets never enter the package or the repository: `.env` is local and gitignored, Suno uses MCP OAuth, and `--fal-key` is supported only for automation.
