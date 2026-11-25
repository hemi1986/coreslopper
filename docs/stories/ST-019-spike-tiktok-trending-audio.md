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
- [ ] Which official TikTok APIs list trending sounds, with their access conditions (cited, with retrieval date)
- [ ] Whether a trending sound may be downloaded and mixed into a video outside TikTok (terms, music licences)
- [ ] Whether the publish adapter can attach a TikTok sound to a draft, or the user adds it in the app
- [ ] A recommendation: a feature story, a "sound to add in the app" note in the release, or nothing
