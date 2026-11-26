---
status: accepted
date: 2026-11-18
---

# Lip-sync on Higgsfield and Topview, and lead-only lip-sync audio

## Status

Accepted — 2026-11-18. Revises the lip-sync part of [ADR 0021](0021-topview-provider.md).

## Context

Lip-sync ran only on fal.ai (OmniHuman 1.5) and locally on ComfyUI. Higgsfield and Topview threw a configuration error, so a project on either provider needed a second account for its singing shots, and comparing lip-sync models meant ad-hoc scripts, because `generate --provider` never applied to lip-sync.

Both providers have a lip-sync product. Higgsfield serves Speak v2 as a model route of its current API (`higgsfield-ai/speak`), and Kling Avatar on a legacy job-set route (`v1/speak/kling`). Topview's Avatar 4 is not on the platform API; it lives on the older Topview OpenAPI (`api.topview.ai`) with a `Topview-Uid` header, its own key, a separate upload flow, and plan credits.

A second problem showed in review: generated songs carry backing vocals and echoes in the vocal stem. A face driven by that stem mouths them: after "Ihr seid der Prompt" it sings the choir's echo "Prompt" too. Suno writes some backing lines in parentheses in the lyrics, which the timing keeps as words; other echoes are not in the lyrics at all.

## Decision

- `HiggsfieldProvider.lipSync` uploads face and audio and posts the flat body (`image_url`, `audio_url`, `prompt`, `duration`) to the role's model; `request_format: job_set` selects the legacy `{ params: { input_image, input_audio } }` shape polled at `/v1/job-sets/<id>`. `duration` is the audio length snapped to the model's `durations`. Speak's quality field is the adapter param `model_quality`, because `quality` is the local draft/final clip option.
- `TopviewProvider.lipSync` runs Avatar 4 on the OpenAPI with `TOPVIEW_UID` and `TOPVIEW_OPENAPI_KEY`. The platform key stays the credential for images and clips; either set of credentials is enough to build the adapter. The submission is not retried, because the OpenAPI has no idempotency key.
- `topview` joins the lip-sync provider kinds. A Topview project still defaults lip-sync to fal.ai, because Avatar 4 needs the second credential set.
- `generate --lipsync-provider <p>` overrides `providers.lipsync` for one batch. Higgsfield and Topview lip-sync items get the audio length as `durationSeconds`; fal items do not, so their cache keys stay unchanged. A lip-sync role with fixed clip lengths is estimated at the snapped length, since that is what the provider bills.
- Lip-sync segments are lead-only. `audio-segment` mutes the parenthesized words of the timing and every `--mute` span with 40 ms fades outside the span, prefers `audio/stems/lead.wav` when it exists, and can write WAV for providers that reject MP3.
- `audio-analysis` lists sung passages of the vocal stem that no lyric word covers in `timing.report.md` ("Unwritten vocals"); `echo_scan.py` prints them for a time range. `separate_lead.py` optionally splits the stem into lead and backing with a karaoke MelBand-Roformer model; it is not part of `uv sync` because of PyTorch and a 900 MB model.

## Consequences

A Higgsfield or Topview project lip-syncs without a fal.ai key, and a batch can compare providers on the same shot. Speak v2 bills 5 s per generation even for a 3 s line ($1.125 at high quality on 2026-11-18), so fal.ai stays the cheaper default for short lines; a Higgsfield project now lip-syncs on Speak unless `providers.lipsync` says otherwise. Avatar 4 prices are in Topview credits, so the USD estimate in `config/models.yaml` is a planning figure.

The unwritten-vocal scan only sees echoes in pauses. An echo that overlaps a lead word stretches that word in the timing and is not listed; the karaoke split catches it only when the echo has a different voice, which generated songs often do not. Those spans still need a listen and an explicit `--mute`, or a shot that ends before the echo.
