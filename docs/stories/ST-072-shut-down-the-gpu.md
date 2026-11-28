---
id: ST-072
title: Shut down the rented GPU and record its cost
type: domain
context: BC-Generation
aggregate: AGG-GpuRental
command: CMD-ShutDownGpu
ui: false
priority: must
size: null
risk: null
events: [EVT-GpuShutDown]
depends_on: [ST-071]
labels: [feature:vast-gpu]
feature: vast-gpu
sources: [docs/research/vast-gpu-rental.md]
status: ready
---

## Story
As a user, I want to shut the rented GPU down with one command and see what it cost, so that I pay only while I
produce.

## Context
Feature `vast-gpu`, decided by the user on 2026-11-28. The entry point is `gpu down`; the board's Shut down button
(ST-077) and the watchdog round (ST-073) call the same command.

- **Shutdown destroys.** A stopped vast.ai instance keeps costing storage (F6), so a GPU rental is never only
  stopped (AGG-GpuRental invariant).
- **Cost.** The rental's cost is its hourly price times its running time from rented to shut down; it is recorded
  with the rental in the workspace and never billed to a project budget.
- **Found by label.** The rental to shut down is the instance labelled `coreslopper:<workspace name>` on vast.ai,
  also when the local record is missing after a crash.
- A generation running on the rental fails as unreachable; the queue run handles it (ST-075). The board's
  confirmation when vast items are pending is ST-077 (G11).

## Acceptance Criteria
Scenario: Shutting down destroys the rental and records its cost
  Given a ready GPU rental at 1.20 per hour that has run for 90 minutes
  When the user runs gpu down
  Then the instance is destroyed with the shutdown reason "user"
  And the rental is recorded with the cost 1.80

Scenario: A rental left behind by a crash is shut down
  Given vast.ai has a running instance labelled "coreslopper:demo-workspace" and the workspace has no record of it
  When the user runs gpu down
  Then that instance is destroyed with the shutdown reason "user"

Scenario: Without an active rental nothing is shut down
  Given no instance labelled "coreslopper:demo-workspace" on vast.ai
  When the user runs gpu down
  Then the command reports "no vast GPU is active"
  And vast.ai is asked to destroy nothing

## Out of Scope
- Stopping an instance to resume it later
- Splitting a rental's cost across projects

## Open Questions
- none
