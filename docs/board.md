# The board

The board is the workspace's local page: the production of every project and series, and the release view of every finished one ([ADR 0030](adr/0030-board-as-hub.md)). Claude Code runs the pipeline in its own sessions; the board shows where each project stands and the command to type next.

## Start it

Either on the computer:

```bash
npm run cli -- board                  # http://127.0.0.1:4848
```

or in a container, which also runs the watchdog every five minutes and starts again with the computer:

```bash
docker compose up -d                  # http://127.0.0.1:4848
docker compose logs -f board          # the watchdog's rounds
docker compose down                   # stop it
```

The container works the same on Linux, macOS, and Windows (Docker Desktop; on Windows keep the workspace inside WSL and run `docker compose` there). The first start installs the dependencies into a volume, which takes a minute; it installs again by itself after `coreslopper update` changed `package-lock.json`. Rebuild the image with `docker compose build` after an update changed `docker/`.

Settings for the container go into the workspace's `.env`, which compose reads too:

| Variable | Purpose |
|---|---|
| `TZ` | Time zone for release planning, e.g. `Europe/Paris`; without it the container plans in UTC unless `config/release-schedule.yaml` sets `timezone`. |
| `CORESLOPPER_BOARD_PORT` | Port on the computer (default 4848). |
| `CORESLOPPER_MEDIA_DIR` | The media drive of `media-link`; mounted at the same path so linked `renders/` and `assets/` resolve. |
| `CORESLOPPER_MEDIA_MOUNT` | The folder to mount instead, when `CORESLOPPER_MEDIA_DIR` contains `{slug}`. |
| `CORESLOPPER_UID`, `CORESLOPPER_GID` | Linux: owner of the files the board writes; defaults to the workspace's owner. |

The port is published on 127.0.0.1 only, since the board writes release approvals. Run **either** the container **or** `release-timer install`, not both: each runs the watchdog.

## Production

The start page groups the projects: **your turn** (a command to run in Claude Code, or a release to approve), **running**, the **series**, and the projects whose release is approved. A card shows the stages as a strip, the current stage, the budget, the generation queue, failed art-director reviews, renders in progress, and the next step with a copy button. The page refreshes itself every ten seconds while it is open.

A project page lists every stage with its attempts, times, and errors, the budget, the written documents (brief, treatment, lyrics or script, timing report, storyboard, QA report), the renders with a player, the contact sheet, the queue items, and the reviewed images, failed ones first. A series page shows its canon with the gaps that keep episodes from starting, the series budget, and its planned and created episodes.

The next step follows the stages: an open interactive stage is `/new-video <slug>` or `/new-episode <slug>`; an open or failed stage after that is `/video-next <slug>`; a finished project goes to its release view. A series asks for `/new-series <slug>` until every on-screen character and set has a reference and every speaking character a reference voice, then for `/new-episode`.

## The watchdog

One round (`npm run cli -- watch`) runs the release autopilot (`release-run`, see [publishing.md](publishing.md#release-autopilot)) and then the production scan. The scan reads every project as the board does and writes `.cache/watch/snapshot.json` and `.cache/watch/events.jsonl`; it never changes `state.json` and never starts a stage. The board shows the events under **Activity**:

- a stage started, finished, or failed;
- a render is ready, failed, or stopped moving (no progress for 15 minutes);
- a stage is **stalled**: it is running, but no file of the project changed for an hour, which usually means the Claude Code session ended;
- queue items wait for a fix; the budget passed 80 %.

The container runs a round every five minutes (`board --watch 5`); on the computer, `release-timer install` runs `watch` on a timer, or run it by hand. `watch --every <minutes>` keeps it running in a terminal.

`render` writes its progress to `review/progress/<output>.json` while it runs, so the board shows a bar for a render in another terminal or session.
