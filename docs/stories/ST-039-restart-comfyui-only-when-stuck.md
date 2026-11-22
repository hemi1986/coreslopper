---
id: ST-039
title: Restart ComfyUI only when it is stuck
type: task
ui: false
priority: should
size: null
risk: null
depends_on: []
labels: [feature:comfyui-watchdog]
status: done
---

## Task
`comfy restart` runs `COMFYUI_RESTART_COMMAND` unconditionally. Whether ComfyUI is stuck is decided by the
workspace's local scripts (`.local/comfyui-restart.sh --if-stuck`, `pipeline-watchdog.sh`): "down" means `/queue`
did not answer within 5 s, re-checked once after 20 s. On 2026-11-22 that rule killed a healthy ComfyUI while it was
loading a large model (VRAM 14.6 of 16 GB, slow `/queue` answers) and aborted a running job.

`comfy restart --if-stuck` observes the server before it restarts. It checks every 30 s for up to 3 minutes and
returns "not stuck" as soon as one check is healthy. It restarts only when every check in the window says stuck:
- no answer from `/queue` within 10 s, or
- at least one pending prompt, none running, and the same prompt first in the queue.

A running prompt is never "stuck" here; a hung generation is the queue run's timeout (`queue.ts`). The `watch`
round calls the same check when `COMFYUI_RESTART_COMMAND` is set. Its stall report (no new file for N minutes)
exists already. Decided by the user (2026-11-22).

## Acceptance Criteria
- [x] `comfy restart --if-stuck` restarts only when every check across the 3-minute window is stuck, and prints which rule held; one healthy check ends it with "not stuck" and no restart
- [x] A single slow or failed `/queue` answer followed by a healthy one never restarts
- [x] The `watch` round runs the check when `COMFYUI_RESTART_COMMAND` is set and logs a restart as a production event; without the variable it skips the check
- [x] `CMD-RestartComfyUI` in `docs/domain/events.yaml` gets the rule; `comfyui/README.md` and `docs/board.md` describe `--if-stuck` and the watch round
- [x] Tests with a fake fetch and clock cover: down for the whole window, a pending prompt that never starts, a slow answer that recovers, a running prompt; `npm test` and `npm run typecheck` are green

## Out of Scope
- Detecting a hung running prompt (the queue run's hung timeout covers it)
- The machine-specific restart itself: it stays `COMFYUI_RESTART_COMMAND`
