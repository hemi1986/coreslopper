# The watchdog round and the board container

## Status

Accepted — 2026-11-21. Extends [ADR 0029](0029-release-autopilot.md) and [ADR 0030](0030-board-as-hub.md).

## Context

The board shows production as the files are when it is opened. Some things only show over time: a stage runner whose session ended leaves its stage `running` forever; a render in another terminal is invisible until its file appears; a render that crashed leaves nothing. The release autopilot already runs on a timer every few minutes, but the timer is a different mechanism on every system (Windows Task Scheduler under WSL, systemd, launchd), and it starts only where the user installed it.

## Decision

- **One watchdog round** (`watch`) runs the release autopilot, then a **production scan**. The scan takes a pulse of every project (phase, current stage, failed stages, renders, render progress, last file activity, queue items needing a fix, spent share), compares it with the last round, and appends **events** to `.cache/watch/events.jsonl`; the snapshot goes to `.cache/watch/snapshot.json`. It writes nothing else: it never changes `state.json`, never marks a stage, and never starts Claude Code. The comparison is a pure function in `packages/core/src/watch.ts`.
- **A running stage is stalled** after an hour without a change to the files the pipeline writes (the project's own files, `review/`, `assets/` with its queue, manifest, and verdicts, `renders/`). The board says so and leaves the decision to the user.
- **`render` writes its progress** to `review/progress/<output>.json` (frames done of total, at most every two seconds), removes it when done, and keeps the error when it fails. A progress file that stopped moving for 15 minutes is an interrupted render.
- **The first round reports only what needs the user now**, so a new watchdog does not replay a project's history.
- **The board ships a container** (`compose.yaml`, `docker/`): the same page and the watchdog every five minutes (`board --watch 5`) on Linux, macOS, and Windows, restarted with the computer. The workspace is mounted at `/app`, so every path is the same as on the computer; `node_modules` lives in a volume that the entrypoint installs whenever `package-lock.json` changes, never mixing the computer's binaries with the container's. The entrypoint drops to the workspace owner's uid and gid. The port is published on 127.0.0.1 only. The media drive of `media-link` is mounted at its own path so linked folders resolve.
- **The container and the computer share locks safely.** A long-held lock names its host; a lock held on another host counts as alive until it is stale, since a pid from another namespace cannot be checked. A long-running watchdog reads `.env` again before each round, so a token renewed by `publish-auth` on the computer reaches it.
- **`release-timer` runs the same round**, for users without the container. One of the two runs it, not both.

## Alternatives considered

- **Let the board compute everything live and drop the scan.** The board is not always open; events such as "render ready at 03:12" and "stalled since" need a record taken while nobody looks.
- **Mark stalled stages as failed.** A long ComfyUI batch or a slow review can be silent for a while; a wrong `failed` would send the user to retry a stage that is still working. Showing it and asking is cheaper than a wrong state.
- **A separate watchdog container or process.** Two services for one small round; the board process is up anyway.
- **Build `node_modules` into the image.** Every workspace update would need an image rebuild, and a stale image would run old code against new files. The lock-file check reinstalls exactly when needed.
- **Notifications.** Not needed for now; the events file is where they would come from.

## Consequences

- `.cache/watch/` is new workspace state, gitignored with the rest of `.cache/`.
- Docker Desktop on Windows needs the workspace inside WSL; a workspace on a Windows drive would be slow and lose file modes.
- The container plans release times in `TZ` (default UTC) unless the release schedule names a time zone.
