---
id: ST-070
title: "Spike: MiniMax H3 on a rented vast.ai GPU – access, workflows, lip-sync"
type: spike
ui: false
priority: must
size: null
risk: null
depends_on: []
labels: [feature:vast-gpu]
feature: vast-gpu
sources: [docs/research/vast-gpu-rental.md]
status: in-progress
---

## Question
HS-269, HS-270, HS-271: What does vast.ai's MiniMax H3 ComfyUI template (image `vastai/comfy`, model page
`https://vast.ai/model/minimax-h3`, template id `6c54167e40e8ceed220393d585126a1c`) give a client, and does plain
MiniMax H3 lip-sync? The research (`docs/research/vast-gpu-rental.md`) answers the REST API but not the template:
its `template_hash_id`, where ComfyUI listens, whether the portal's token check guards it, how a client finds its
URL, which workflows and model files it ships, and how long it takes to become ready.

## Timebox
Half a day and at most $5 of rental, one RTX PRO 6000 S rented with the user's `VAST_API_KEY` from `.env`. The
instance is destroyed at the end even when a question stays open. Run by the user with `/implement ST-070`.

## Acceptance Criteria
- [x] The `template_hash_id` to rent with, the image tag, the disk the template needs, and the hourly price paid
- [x] Where ComfyUI listens, and that a request with `WEB_PASSWORD` as `Authorization: Bearer` gets an answer while one without it gets 401 (F8)
- [x] How a client finds the ComfyUI URL of a new rental through the REST API (tunnel URL or mapped port), or that it cannot (HS-270)
- [x] Time from renting to the first answer of ComfyUI, and whether the models are in the image or downloaded at boot (HS-271)
- [x] The MiniMax H3 workflow templates the install ships (names), exported with Export (API) into `docs/research/vast-minimax-h3/` with their model file names
- [x] One clip each for text-, image-, first/last-frame- and reference-to-video, with time per clip and a note on the prompt form that worked
- [x] Lip-sync: the template's reference-to-video graph plus `LoadAudio`, `TrimAudioDuration` and `MiniMaxH3AddGuide` at frame 0 (as in ADR 0027, without the Pika LoRA) on a lead-only segment of a real shot; the user's verdict on mouth sync and identity (HS-269)
- [x] The instance was destroyed, and the total cost of the spike
- [x] A recommendation per open hotspot, recorded in `docs/research/vast-gpu-rental.md`

## Results
Answered 2026-11-28 in `docs/research/vast-gpu-rental.md` (F10–F16, *Recommendations (ST-070)*), exports in
`docs/research/vast-minimax-h3/`. Rented an RTX PRO 6000 WS (no S below $1.47/h) at $1.42/h for 39.5 min; total
cost about $1.03; the instance was destroyed. The user judged the four operations good (first/last frame showed a
cross-fade into the last frame) and plain H3 lip-sync usable for speech, shouting and singing.
