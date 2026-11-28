---
id: ST-077
title: The vast GPU chip and panel in the board
type: task
ui: true
priority: must
size: null
risk: null
depends_on: [ST-071, ST-072]
labels: [feature:vast-gpu]
feature: vast-gpu
sources: [docs/research/vast-gpu-rental.md]
status: ready
---

## Task
Feature `vast-gpu`, decided by the user on 2026-11-28 (RM-GpuStatus; G9 amended and G11 in
`docs/product/ux-guidelines.md`; ADR 0030 board as hub). The board's one place to see, rent and shut down the GPU,
and `gpu status` on the CLI from the same read model.

- **Entry.** A chip at the right of the top bar next to Refresh, on every page; not a navigation entry (G3).
- **One job.** Show whether the workspace pays for a GPU right now, and rent or shut it down.
- **Chip texts** (G11): `vast GPU: off`, `vast GPU: starting…`, `vast GPU: ready · $1.23/h · 0:42 · $0.86`,
  `vast GPU: stopping…`. The state is read from vast.ai by the rental label, so a rental left behind is shown.
- **Panel.** GPU, hourly price, running time, cost so far, idle time left; one action: Rent GPU (off) or Shut down
  (ready). Rent GPU is not offered while a rental is active.
- **Rent GPU** streams its own progress as the answer to the click – rented, booting, ready – or the refusal text
  (G9 amended); the chip then changes only on Refresh.
- **Shut down** asks for confirmation when vast items are generating or pending, naming how many.
- **Notice.** The production page of a project whose video provider is `vast` shows "No vast GPU is ready" with its
  own Rent GPU button while no rental is ready.
- **Without a key.** With no `VAST_API_KEY` the chip is not shown at all, unless a project uses `vast`; then the
  panel says "VAST_API_KEY is missing in .env."

## Acceptance Criteria
- [ ] The chip shows each of the four states with the G11 texts, read from a mocked vast.ai
- [ ] Rent GPU streams rented → booting → ready, and a refusal shows its G11 text
- [ ] Shut down with two pending vast items asks "2 vast items are waiting. Shut down anyway?" before it calls gpu down
- [ ] The production page of a `vast` project shows the notice with Rent GPU while no rental is ready, and not once one is
- [ ] `gpu status` prints the same state, price, running time, cost so far and idle time left
- [ ] No polling: apart from the streamed Rent GPU answer, nothing on the page changes without Refresh (G9)
