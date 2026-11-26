---
status: accepted
date: 2026-11-22
---

# Memes: a third project kind, a pitch in the wizard, and the sound library

## Status

Accepted — 2026-11-22; accepted by the user on 2026-11-26. Amends [ADR 0033](0033-board-wizard.md) ("it asks no creative questions"). Builds on
[ADR 0016](0016-episode-projects.md) and [ADR 0034](0034-character-library.md).

## Context

The user wants short vertical memes for TikTok, YouTube Shorts and Instagram Reels: about 15 seconds, at most 30,
one punchline, German speech with German subtitles burned in, characters from the character library or invented
for the meme. Such a video has no song and no series. Its audio is a few spoken lines and the recurring sounds
memes live on – the same boom, the same record scratch, used again and again – which a generator should not
reinvent every time. The feature was grilled with the user on 2026-11-22; the model is in
`docs/domain/events.yaml` (`FLOW-Meme`, `FLOW-SoundLibrary`, `BC-SoundLibrary`, `BC-ScriptedAudio`, HS-257 to HS-265).

## Decision

- **A third project kind, `meme`**, with its own stage list: `setup` ✋, `script` ✋, then autonomously
  `style-character`, `voice-track`, `episode-track`, `storyboard`, `assets`, `assembly`, `qa-export`. The master
  format is 9:16 and the only format. Its audio reuses the episode's script, take registry and episode track
  (ADR 0016), which move into their own context, Scripted audio (HS-258; documentation only, the code stays put).
- **The wizard takes a pitch.** For a meme the board's wizard asks for title, slug, budget (default 10 USD),
  providers, the idea (required) and the setting (optional), written to `pitch.md` in the user's words, plus
  optional library characters (through `character use`) and user references; it completes setup. This amends
  ADR 0033: the wizard now holds one creative input, but as the starting point of the grilling, never as a
  decision – the `new-meme` skill grills from the pitch to the punchline and writes `script.yaml`, which may end
  far from the pitch.
- **Style and characters come after the script.** `style-character` writes the style and set bible from pitch and
  script and invents the characters the user did not choose; they go into the character library like any other
  finished characters (ADR 0034).
- **A workspace sound library**, `library/sounds/<id>/sound.yaml` and one WAV (the WAV gitignored, the yaml
  tracked), owned by the user: title, use when, tags, measured length and loudness, optional cue, trim, source and
  licence (default unknown). `sound add|edit|remove|list|check`; hand edits are validated by the hook.
- **A sound is copied, not linked.** A script's sfx line names either `sound: <id>` or a `prompt`, exactly one.
  `voice-track` copies the trimmed library sound into the meme as a take of source `library:<id>` and records its
  hash: a changed library sound makes the take stale and it is copied again; a removed one only warns (HS-260).
  The anchor `line:<id>:cue` lands a shot on the sound's hit: it adds the `cue` edge to ADR 0005's line anchors
  and resolves to the line's start plus the library entry's cue, with an offset. Lines stay strictly sequential
  (ADR 0016, HS-257).
- **The licence is the user's call.** The release check turns every used sound with an unknown licence, or one that
  needs a credit, into a TODO and never fails the release (HS-261). The release folder holds one 9:16 video, a
  1080x1920 cover and the TikTok, Shorts and Reels texts – no Shorts, WAV, canvas or lyrics.

## Alternatives considered

- **A meme as an episode without a series.** The episode's stages fit, but an episode's canon, number, series
  budget and length limit would all need "unless there is no series" everywhere, and the canon would be the place
  invented characters go. A kind of its own keeps the series rules unconditional.
- **A meme as a variant of the music video.** Every music-video rule assumes an existing song, lyrics and the
  audio analysis (ADR 0013, ADR 0008); a meme has none of them and needs the script instead.
- **A live link to the library sound** instead of a copy as a take. The meme would change, or break, when the user
  edits or deletes a library sound; the copy keeps a finished meme reproducible, and the hash still says when the
  library moved on.
- **Sounds per project** instead of a workspace library. The point of meme sounds is that they recur; per project
  the user would import the same boom into every meme and the agent could not pick from what exists.

## Consequences

- The script's checks are written for a series canon; for a meme they must name its own bibles, which do not exist
  yet when the script is written (HS-262). The subtitle language is decided (HS-263: a project setting, `de` by
  default for a meme, burned in by ST-014); the 30-second limit (HS-264) and the credit text (HS-265) still need
  decisions. Trending platform audio stays out: no public API lists the general sound library, a trending sound may
  not be mixed into a file outside TikTok, and the Content Posting API cannot attach one – it is added in the TikTok
  app (HS-259, `docs/research/tiktok-trending-audio.md`).
- A library sound in a meme is someone else's material more often than not; the release board shows the TODO, the
  user decides.
