---
id: ST-075
title: The queue run stops when the vast GPU is gone
type: domain
context: BC-GenerationQueue
aggregate: AGG-GenerationQueue
command: CMD-RunQueue
ui: false
priority: must
size: null
risk: null
events: [EVT-AttemptGenerated, EVT-AttemptGenerationFailed, EVT-QueueRunStopped]
depends_on: [ST-074]
labels: [feature:vast-gpu]
feature: vast-gpu
sources: [docs/research/vast-gpu-rental.md]
status: ready
---

## Story
As a user, I want the queue run to stop cleanly when the rented GPU is not ready or vanishes, so that no attempt is
lost and I know to rent the GPU again.

## Context
Feature `vast-gpu`, decided by the user on 2026-11-28 (CMD-RunQueue rule on `vast`). A rental can vanish through the
idle shutdown (ST-073), a shutdown by the user (ST-072) or a failure at vast.ai.

- A vast item whose rental is not ready, or vanished during the generation, goes back to pending and stops the run,
  like a budget or configuration error. It spends none of the item's attempts.
- There is no restart command for the rental: `COMFYUI_RESTART_COMMAND` and POL-RestartComfyUIOnFailure stay for
  the local ComfyUI only.
- The stop message is "No vast GPU is ready. Rent one with gpu up or Rent GPU in the board." (G11).

## Acceptance Criteria
Scenario: A vanished rental puts the item back and stops the run
  Given a queue run generating a vast item when the GPU rental is destroyed
  When the generation fails as unreachable
  Then the item is pending again with its attempt count unchanged
  And the queue run stops with "No vast GPU is ready. Rent one with gpu up or Rent GPU in the board."

Scenario: No ComfyUI restart for the vast GPU
  Given COMFYUI_RESTART_COMMAND is set and a vast item fails because the rental is gone
  When the queue run handles the failure
  Then the restart command is not run

## Out of Scope
- Renting a new GPU automatically and going on

## Open Questions
- none
