---
id: ST-008
title: Create a meme in the board's wizard
type: domain
context: BC-Pipeline
aggregate: AGG-Project
command: CMD-CreateMeme
ui: true
priority: must
size: null
risk: null
events: [EVT-MemeCreated, EVT-MemeRefused]
depends_on: [ST-007]
labels: [feature:meme]
status: ready
---

## Story
As a user, I want to start a meme in the board's wizard with my idea, a setting, and the characters I want, so that Claude Code starts grilling me from there.

## Context
Entry: the board's **+ New** shows a fourth tile, "Meme" – _"A short, funny vertical video (~15 s) for TikTok,
Shorts, and Reels."_ (de: _„Ein kurzes, witziges Hochkant-Video (~15 s) für TikTok, Shorts und Reels.“_). The
screen's one job: collect what a form can hold and hand over to `/new-meme <slug>`.

Fields (Q19): title, slug, budget (default 10 USD, at least the configured minimum), providers, idea (required),
setting (optional), characters from the library (optional, several or none), user references. The same command
runs as `new <slug> --kind meme --idea "…" [--setting "…"]`.

Rules (CMD-CreateMeme): idea and setting go into `pitch.md` in the user's words – the pitch is where the grilling
starts, not a decision (ADR 0051 amends ADR 0033); the master format is 9:16 and the only one; setup is done
afterwards through core's transition (ADR 0037). The chosen characters are copied with the existing
CMD-UseLibraryCharacter.

States (Q22): an empty character library shows _"No characters in the library yet – Claude invents them from your
idea."_ and the step can be skipped; an empty sound library is not mentioned here. A rejection names the reason
above the button and keeps what was typed, like the music-video form. Afterwards the wizard shows
`/new-meme <slug>` to type in Claude Code.

## Acceptance Criteria

Scenario: A meme is created with its pitch and a library character
  Given the character library holds "office-robot"
  When the user creates the meme "office-prank" with the idea "The printer takes revenge", the setting "an open-plan office" and the character "office-robot"
  Then the project "office-prank" has the kind meme and the one format 9:16
  And its pitch holds "The printer takes revenge" and "an open-plan office"
  And its character bible names "office-robot" and its setup is done

Scenario: A meme without characters is valid
  Given the character library is empty
  When the user creates the meme "office-prank" with the idea "The printer takes revenge" and no characters
  Then the project "office-prank" exists with its setup done and no characters

Scenario: An empty idea is refused
  Given no project "office-prank" exists
  When the user creates the meme "office-prank" without an idea
  Then the meme is refused because it needs an idea
  And no folder "projects/office-prank" exists

Scenario: A taken slug is refused
  Given the project "office-prank" exists
  When the user creates the meme "office-prank" with the idea "The printer takes revenge"
  Then the meme is refused because the slug "office-prank" is taken

## Out of Scope
- Creative questions in the wizard beyond idea and setting
- Starting Claude Code from the board (ADR 0030)

## Open Questions
- none
