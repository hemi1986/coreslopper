---
status: accepted
date: 2026-11-21
---

# Storyboard: one model for both kinds, checked as a whole, written only by the agent

## Status

Accepted — 2026-11-21; accepted by the user on 2026-11-26. Records decisions already in the code; amends
[ADR 0005](0005-symbolic-timing-anchors.md) (coverage within one frame) and
[ADR 0016](0016-episode-projects.md) (lip-sync checks for music videos, unused storyboard path fields). The
adoption of the storyboard slice recovered it. The user answered four questions about how they work and has not
reviewed the code.

## Context

ADR 0005 makes shot boundaries symbolic anchors and requires full coverage. ADR 0016 lets episodes reuse the
storyboard with extra checks for sets and lip-sync. ADR 0025 adds plates, props and character states. No ADR
decides the shot sources, mixed shots and layers, frame chaining, highlights, transitions, the contact sheet, or
who may change the storyboard. The code answers each of these, and the skill, the glossary and the code partly
disagree (`docs/domain/adoption-report.md`, storyboard).

## Decision

- **One storyboard for both kinds.** `storyboard.yaml` follows one schema for a music video and an episode.
  `resolveStoryboard` in core checks it as a whole against the effective timing and the bibles. An episode adds
  checks through an optional context (`EpisodeContext`): the shot's set and plate belong to its scene,
  ChatWindow shows the scene's chat lines, and lip-sync shots stay within the series' limit.
- **Coverage within one frame.** Shots are in start order and have unique ids `shot-NNN`. Each shot lasts at
  least one frame and names a section of the timing. Together the shots cover frame 0 to the end of the song or
  episode track, with no gap or overlap of more than one frame.
- **Each source has what it needs.**
  - A motion shot names a known motion component.
  - An AI clip has a keyframe prompt and a video prompt. A lip-sync shot needs only the keyframe prompt, and a
    chained shot needs only the video prompt.
  - A footage shot has an asset.
  - A mixed shot has two or more layers, and every layer can be rendered; an AI-clip layer needs an asset.
- **Continuity references exist.** Every style token, character, set, plate, prop and character state a shot
  names exists. A plate belongs to one of the shot's sets, and a character state belongs to a character on screen
  in the shot.
- **Lip-sync shots are checked in both kinds.** A lip-sync shot is an AI clip of an existing character who shows a
  face. Its length is at most `maxDuration` of `video.lipsync` for the project's provider. An episode also
  applies the series' creative limit.
- **One validated storyboard feeds every consumer.** Render, queue items, QA, subtitles, the contact sheet and the
  board review read the storyboard through `validateProject`. Remotion gets the resolved shots as props.
- **The agent is the only writer.** The agent writes `storyboard.yaml` in the storyboard stage. It changes the
  file only when the user asks, in the chat or in a review round. The hook validates every edit and blocks a
  failing one. `storyboard.md` and the contact sheet are derived from the YAML.
- **The contact sheet lives on the board.** It is a grid of the shots in the board's view of an active project,
  and it shows each shot's keyframe once one exists.

## Consequences

- Several of these rules are ahead of the code (gaps G-69 and later in `docs/domain/gap-register.md`):
  - A music-video lip-sync shot is not checked at all.
  - An AI clip must carry both prompts.
  - An AI-clip layer with only a video prompt passes validation and renders empty.
  - The queue and QA read the unvalidated storyboard.
  - `storyboard.md` is written by hand.
  - The contact sheet is an SVG of text cards with no images.
- The storyboard's `timing`, `style` and `characters` path fields are read by nothing and will be removed. The
  project layout fixes those paths for both kinds, not only for episodes as ADR 0016 says.
- The motion component list, continuity reference resolution and highlight matching each live in more than one
  place. These are gaps, not decisions.
- The composition rules for AI shots, the 3–6 s clip length, and the three-revision cap stay agent guidance in
  the storyboard and ai-clips skills; no code checks them.
