---
id: ST-073
title: The watchdog shuts down an idle or overdue GPU rental
type: domain
context: BC-Generation
aggregate: AGG-GpuRental
command: CMD-ShutDownGpu
ui: false
priority: must
size: null
risk: null
events: [EVT-GpuShutDown]
depends_on: [ST-072]
labels: [feature:vast-gpu]
feature: vast-gpu
sources: [docs/research/vast-gpu-rental.md]
status: ready
---

## Story
As a user, I want an idle or forgotten GPU rental to be shut down for me, so that it never runs overnight at my
cost.

## Context
Feature `vast-gpu`, decided by the user on 2026-11-28 (POL-ShutDownIdleGpu, EVT-GpuRentalOverdue). The watchdog round
(ACT-Watchdog, ADR 0031) runs every few minutes in the board container or from release-timer.

- **Idle.** No vast generation ran or waited in any queue of the workspace for `VAST_IDLE_MINUTES` (default 30)
  since the rental became ready or since the last vast generation ended.
- **Overdue.** The rental has run `VAST_MAX_HOURS` (default 8), whatever runs on it.
- The shutdown is CMD-ShutDownGpu with the reason "idle" or "max runtime", recorded as a production event like the
  ComfyUI restart.
- A rental found only by its label (no local record) counts its time from vast.ai's start time.

## Acceptance Criteria
Scenario: A rental idle for 30 minutes is shut down
  Given a ready GPU rental and no vast generation running or pending for 31 minutes
  When the watchdog round runs
  Then the instance is destroyed with the shutdown reason "idle"

Scenario: A rental with pending vast items is kept
  Given a ready GPU rental, idle for 31 minutes, and a queue with one pending vast item
  When the watchdog round runs
  Then the instance keeps running

Scenario: A rental that has run 8 hours is shut down while it works
  Given a GPU rental that has run for 8 hours and 1 minute with a vast generation running
  When the watchdog round runs
  Then the instance is destroyed with the shutdown reason "max runtime"

## Out of Scope
- A warning before the shutdown
- Shutting down the local ComfyUI server

## Open Questions
- none
