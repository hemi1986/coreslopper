# The board is the workspace's hub: production next to release

## Status

Accepted — 2026-11-21. Extends [ADR 0028](0028-release-board-and-calendar.md).

## Context

The release board of ADR 0028 shows a project once it has a release folder. Everything before that (which stage a project is in, whether a stage runner is still going, what the generation queue and the art director say, which render is new, what to type next in Claude Code) was spread over `state.json`, `assets/queue.json`, `verdicts.jsonl`, `renders/`, and `status` / `series-status` output in a terminal. A workspace with several songs and a series in flight has no single place that answers "what is going on, and what do I do next?".

Claude Code runs the pipeline in its own sessions, started by the user. The page that answers the question must not depend on a session being open, and must not start one.

## Decision

- **`board` is the workspace's page** (`release-board` stays as an alias). It has a **production view** beside the release view: every project and series of the workspace, not only those with a release folder.
- **The production view is read-only and derived from files.** Per project: the stages from `state.json` with attempts, times, and errors; the budget; the generation queue (`assets/queue.json`) by status; the last art-director verdict per subject (`assets/review/verdicts.jsonl`); the written documents (a document counts once it differs from its template); the contact sheet; the renders in `renders/`. Per series: the canon's characters and sets with their gaps (no reference, missing reference voice), the series budget, and the planned and created episodes.
- **The next step is one pure function** (`packages/core/src/production.ts`): an open interactive stage → `/new-video <slug>` or `/new-episode <slug>`; a running stage → wait; an open or failed autonomous stage → `/video-next <slug>`; all stages done → the release view, or nothing once the release is approved; a series → `/new-series <slug>` until its canon is complete, then `/new-episode`. The page shows the command with a copy button. The user starts Claude Code; the board never does.
- **The page polls** while it is visible (every 10 s) and redraws only when the data changed and no video is playing.
- **Project files are served from a whitelist**: `renders/`, `review/`, `assets/`, `characters/`, `sets/`, `props/`, and the written documents; never `project.yaml`, `state.json`, dot files, or anything outside the project. Served files carry a sandboxing content security policy, so an SVG or HTML file opened from the board runs no script.
- **The page stays dependency-free and build-free**: static ES modules in `packages/cli/src/board/` (`app.js` routes, `production.js`, `release.js`, `lib.js`, `board.css`), served by the same Node server.

## Alternatives considered

- **A separate production page.** Two local servers and two tabs for one workspace; the release view is where a finished production goes next.
- **A front-end framework with a build step.** The board ships inside the workspace runtime, which runs from source with `tsx`; a build step would add a toolchain to every workspace for a page of cards and tables.
- **Let the board start `/video-next`.** A headless Claude Code run spends money and tokens without the user present, and two sessions on one project race on `state.json`. The user keeps starting Claude Code.
- **Push updates over a socket.** The data changes at stage granularity; polling a few small JSON files is simpler and survives a server restart.

## Consequences

- The board lists projects whose files do not load as unreadable, with the error, instead of hiding them.
- `--host` lets the board listen beyond 127.0.0.1 for a container whose port is published to the host's loopback only; writes still need a loopback `Host` and the board's own origin.
- Later work builds on this page: a watchdog round that records production events, a web review player whose notes go back to the agent, and a project and series wizard with references.
