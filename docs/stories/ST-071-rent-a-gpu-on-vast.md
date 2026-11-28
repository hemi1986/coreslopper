---
id: ST-071
title: Rent a GPU on vast.ai for MiniMax H3
type: domain
context: BC-Generation
aggregate: AGG-GpuRental
command: CMD-RentGpu
ui: false
priority: must
size: null
risk: null
events: [EVT-GpuRented, EVT-GpuRentalRefused, EVT-GpuReady, EVT-GpuShutDown]
depends_on: [ST-070]
labels: [feature:vast-gpu]
feature: vast-gpu
sources: [docs/research/vast-gpu-rental.md]
status: ready
---

## Story
As a user, I want to rent a GPU with MiniMax H3 on vast.ai with one command, so that I can produce clips without a
GPU of my own and without setting up a server.

## Context
Feature `vast-gpu`, decided by the user on 2026-11-28 (FLOW-GpuRental, glossary **GPU Rental**, ADR 0059 proposed).
The entry point here is `gpu up`; the board's Rent GPU button calls the same command (ST-077).

- **Template, nothing installed by us.** The rental runs vast.ai's own MiniMax H3 ComfyUI template (the
  `template_hash_id` from ST-070, overridable with `VAST_TEMPLATE`). No Pika LoRA, no download script.
- **Offer.** On-demand, verified, a GPU from `VAST_GPU` (default `RTX PRO 6000 S`, a comma list allowed), disk
  `VAST_DISK_GB` (150), the cheapest offer at most `VAST_MAX_PRICE_PER_HOUR` (1.50) (AGG-GpuRental invariant).
- **Access.** A fresh random access token per rental, passed as `WEB_PASSWORD` and sent as `Authorization: Bearer`
  over the HTTPS URL (F8, F9). No direct port. Ready means ComfyUI answers with the token and refuses a request
  without it.
- **One per workspace.** The rental is labelled `coreslopper:<workspace name>`; vast.ai is asked for that label, so a
  rental left behind by a crash counts as active.
- **Boot limit.** A rental not ready within 20 minutes is shut down (destroyed) with the reason "boot timeout".
- **Configuration.** `VAST_API_KEY` is required; a missing key or a value that is not a positive number is a
  configuration error before vast.ai is asked ("VAST_API_KEY is missing in .env.").
- Texts of the refusals: G11 in `docs/product/ux-guidelines.md`. vast.ai's own message for too little credit is
  passed through with "Top up your vast.ai credit."
- vast.ai answers 429 without Retry-After (F7): the client waits and tries again, it never fails the rental on the
  first 429.
- Tests use a mocked vast.ai API; no key in CI.

## Acceptance Criteria
Scenario: A GPU under the price cap is rented and becomes ready
  Given no active GPU rental for the workspace and an offer for "RTX PRO 6000 S" at 1.20 per hour
  When the user runs gpu up
  Then the GPU rental is labelled "coreslopper:demo-workspace" with the hourly price 1.20
  And it is ready once ComfyUI answers with the access token and refuses a request without it

Scenario: No offer under the price cap rents nothing
  Given VAST_MAX_PRICE_PER_HOUR is 1.50 and the cheapest "RTX PRO 6000 S" offer costs 1.89 per hour
  When the user runs gpu up
  Then the rental is refused with "No RTX PRO 6000 S under $1.50/h. Cheapest now: $1.89/h."
  And no instance is created

Scenario: An active rental is not rented twice
  Given vast.ai has a running instance labelled "coreslopper:demo-workspace"
  When the user runs gpu up
  Then the rental is refused with "a vast GPU is already active"
  And no instance is created

Scenario: A rental not ready within 20 minutes is shut down
  Given a new rental whose ComfyUI does not answer within 20 minutes
  When the user runs gpu up
  Then the instance is destroyed with the shutdown reason "boot timeout"
  And the command fails with "The GPU did not become ready within 20 min and was shut down"

## Out of Scope
- Picking an offer by hand, bid or reserved instances, several GPUs
- Installing anything on the instance (the template is used as it is)
- Running generations on the rental (ST-074)

## Open Questions
- none (the template facts come from ST-070)
