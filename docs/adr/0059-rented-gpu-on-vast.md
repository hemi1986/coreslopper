---
status: proposed
date: 2026-11-28
---

# Clips on a rented GPU: the `vast` provider

## Status

Proposed — 2026-11-28 (feature `vast-gpu`; every decision below confirmed by the user in the event storming).
Extends [ADR 0014](0014-comfyui-local-video.md) (ComfyUI as a local video backend driven by tagged API workflow
exports) and [ADR 0053](0053-local-lipsync-by-default.md) (lip-sync runs on the video provider). The board rule of
[ADR 0049](0049-board-shell.md) – the user refreshes by hand, no polling – holds.

## Context

The user's own ComfyUI server cannot run every clip a production needs at the speed it needs. vast.ai offers its own
MiniMax H3 ComfyUI template on one RTX PRO 6000 (F1 in `docs/research/vast-gpu-rental.md`). Renting it means paying
by the hour for a machine that keeps billing until it is destroyed (F6), that is reachable from the internet, and
whose boot, URL discovery and workflows are not yet documented (HS-270, HS-271). The model is `AGG-GpuRental` in
`docs/domain/events.yaml` (`CMD-RentGpu`, `CMD-ShutDownGpu`, `POL-ShutDownIdleGpu`, `RM-GpuStatus`,
`FLOW-GpuRental`).

## Decision

- **A new provider `vast` beside `comfyui`.** It runs vast's own MiniMax H3 ComfyUI template (image `vastai/comfy`,
  template id `6c54167e40e8ceed220393d585126a1c` on the model page) on one rented GPU, by default an RTX PRO 6000 S.
  Plain MiniMax H3: no Pika LoRA, and nothing is installed by us at boot. The user's local `comfyui` keeps every
  existing workflow; the two servers coexist. A project chooses it with `providers.video: vast`.
- **Operations.** Text-, image-, first/last-frame- and reference-to-video, and lip-sync: the spike ST-070 showed that
  plain H3 with the vocal anchored by `MiniMaxH3AddGuide` at frame 0 lip-syncs speech, shouting and singing well
  enough (HS-269, F15 in the research). A project puts lip-sync on the rental with `providers.lipsync: vast`; the
  default stays the local `comfyui` (ADR 0053).
- **Workflows shipped, not fetched.** vast's H3 workflow templates are exported once (Export API) from a rental,
  tagged with `cs:` tags as in ADR 0014, and shipped in the workspace payload under `comfyui/vast/`. Prompts are
  plain text; a Flex prompt is rejected on `vast`.
- **Access through the portal's proxy, with a token per rental.** Each rental gets a fresh random `WEB_PASSWORD` at
  launch; the provider sends it as `Authorization: Bearer` to the Instance Portal's Caddy proxy over the HTTPS
  tunnel URL (F8, F9). A direct port (internal port = external port) is forbidden, because it bypasses the proxy's
  authentication.
- **Explicit rent, destroy on shutdown, a watchdog behind it.** The user rents with `gpu up` or the board's GPU
  panel; a production start never rents on its own. `gpu status` and the board's GPU chip show the state; `gpu down`
  and the panel shut it down. Shutting down destroys the instance, never only stops it (F6). The watchdog round
  destroys a rental idle for `VAST_IDLE_MINUTES` (30) or running for `VAST_MAX_HOURS` (8); a rental not ready within
  20 minutes is destroyed. A workspace has at most one rental, found on vast.ai by its label, so an instance a crashed
  session left behind is found and shut down. Only on-demand, verified offers at most `VAST_MAX_PRICE_PER_HOUR`
  (1.50) are rented.
- **Cost on the workspace, not on projects.** A rental's cost is its hourly price × its running time, recorded per
  rental at workspace level and shown in the board. A clip on `vast` costs $0 and is not billed to a project budget.
- **REST through `fetch` in `packages/providers`.** The adapter translates vast.ai's REST API into the domain (an
  anti-corruption layer) and is tested against a mock; no dependency on the Python `vastai` CLI.
- **The board streams the rent.** The rent action answers the click with its own progress (rented, booting,
  ready); the board still never refreshes itself (ADR 0049).

## Considered options

- **Fetch the workflows from the rental at runtime and tag them automatically.** Rejected: the template's workflow
  names and node layout are unknown (HS-271) and can change under us; an automatic tagger would guess the `cs:`
  inputs. A shipped, reviewed export fails visibly instead.
- **An SSH tunnel to the ComfyUI port.** Rejected: a long-lived process the board would have to watch and rebuild
  after every drop. SSH stays for manual debugging.
- **Stop instead of destroy.** Rejected: a stopped instance keeps billing storage (F6), and a restart may not find
  the same GPU free.
- **Install the Pika LoRA or our own nodes at boot.** Rejected for now: it lengthens boot, ties us to the template's
  internals, and the plain template is what vast maintains.

## Consequences

- A `vast` project needs a ready rental before its vast items run. A vast item whose rental is not ready, or
  vanished, goes back to pending and stops the queue run with the hint to rent the GPU (`CMD-RunQueue`); there is no
  automatic restart.
- Spend on the GPU is outside the project budget and its batch cap; the workspace's rental records and the board
  show it instead. The price cap, the idle and the max-runtime limits are the only guards on it.
- The spike ST-070 answered HS-269, HS-270 and HS-271 (F10–F16 in `docs/research/vast-gpu-rental.md`): ComfyUI is
  behind the portal's token check, its tunnel URL comes from the portal's `/get-all-quick-tunnels`, and the template
  downloads its models at boot (about 11.5 minutes to ready).
- vast.ai's rate limits answer HTTP 429 without `Retry-After` and publish no numbers (F7): the adapter backs off on its
  own, and status reads stay infrequent.
- A shipped workflow in `comfyui/vast/` goes stale when vast changes its template; the export is redone by hand.
