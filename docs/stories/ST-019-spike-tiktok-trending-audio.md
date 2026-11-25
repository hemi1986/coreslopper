---
id: ST-019
title: "Spike: can a meme use TikTok's trending audio?"
type: spike
ui: false
priority: could
size: null
risk: null
depends_on: []
labels: [feature:meme]
sources: [docs/research/tiktok-trending-audio.md]
status: in-progress
---

## Question
HS-259: Can coreslopper find TikTok's trending sounds and use one in a meme? Is there an official API that lists
them, may such a sound leave TikTok and be mixed into a rendered video at all, and what do TikTok's terms and the
Commercial Music Library allow – or is the only legal path to post the meme as an inbox draft (ADR 0023) and add the
sound in the TikTok app?

## Timebox
One working day, research only: the `research` skill and `researcher`, findings in `docs/research/tiktok-trending-audio.md`.

## Acceptance Criteria
- [x] Which official TikTok APIs list trending sounds, with their access conditions (cited, with retrieval date)
- [x] Whether a trending sound may be downloaded and mixed into a video outside TikTok (terms, music licences)
- [x] Whether the publish adapter can attach a TikTok sound to a draft, or the user adds it in the app
- [x] A recommendation: a feature story, a "sound to add in the app" note in the release, or nothing

## Findings

Evidence: `docs/research/tiktok-trending-audio.md` (F1–F14, retrieved 2026-11-25).

- **Discovery: no public API for the general Sounds library.** None of the documented developer products
  (Share Kit, Login Kit, Content Posting API, Research API, Display API, Embed, Data Portability, Green Screen Kit,
  Commercial Content) is a sound catalogue (F1). The Research API only returns a numeric `music_id` per video, with
  no title, artist or ranking, and only for non-profit academic researchers (F2); the Display API has no music fields
  (F3).
- **A trending sound may not leave TikTok.** The general Sounds library is licensed for personal, non-commercial use
  inside TikTok only (F10); TikTok's terms forbid downloading or extracting its content (F11); and API posting
  requires the poster to confirm either that the video holds no copyright-protected music or that they hold all
  licences (F12). The in-app library grants no rights to the recording, so there is nothing to mix offline.
- **No adapter path attaches a trending sound.** Direct Post has no sound parameter (F4) and the inbox upload has no
  `post_info` at all (F5); the only music field, `auto_add_music`, is for photos and picks no track (F6). The TikTok
  for Business API can attach a *Commercial Music Library* track (`music_sound_info`), but only on a direct public
  post – a draft ignores `post_info` (F7, F8) – and CML tracks may only be used inside TikTok (F9). F7/F8 rest on a
  mirror of the Business API docs; the official portal could not be fetched (see caveats).

## Recommendation

**Take the "sound to add in the app" note, not a feature story and not nothing.**

- The release already carries the note: the inbox path's manual steps in
  `packages/providers/src/publish/tiktok.ts` say "Open the TikTok app: the inbox notification holds the draft. Add
  sound and text, set the cover, and post it." No pipeline code is needed.
- Memes therefore stay on the TikTok inbox path. A direct post (`TIKTOK_DIRECT_POST=1`, the release autopilot) cannot
  attach a sound through the Content Posting API and cannot be edited afterwards, so a meme that should carry a
  trending sound must not go out through the direct path.
- The sound library stays as ADR 0051 defines it: the user's own or licensed sounds, copied into the meme as takes,
  with the licence a release TODO when it is unknown. Trending audio is not a library sound – there is no licence to
  store, only an in-app use permission – so it needs no new `sound.yaml` licence value.

This answers HS-259 in the direction ADRs 0023 and 0051 already assume; it needs no new ADR.

