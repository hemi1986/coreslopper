---
id: ST-014
title: A meme's render carries German subtitles
type: domain
context: BC-Render
aggregate: AGG-Render
command: CMD-RenderFormat
ui: false
priority: should
size: null
risk: null
events: [EVT-FormatRendered, EVT-RenderFailed]
depends_on: [ST-007]
labels: [feature:meme]
status: in-progress
---

## Story
As a viewer who watches without sound, I want a meme's spoken lines as subtitles in the picture, so that the joke works muted.

## Context
Q18, HS-263: spoken language German; the subtitle language is a project setting (`de`, `en`, `off`) – `de` by
default for a meme, `en` stays the default for an episode. A meme's subtitles are burned in, in the format's safe area.
They come from `text_de` of the spoken and chat lines, timed by the effective timing. Today burned-in subtitles are
English only and only for an episode (CMD-RenderFormat rules, HS-113); this story adds `de` for a meme. An English
version is out of scope.

## Acceptance Criteria

Scenario: The meme's render carries its spoken lines
  Given the meme "office-prank" has the dialogue line "punchline" with the text "Ich drucke nicht mehr."
  When its 9:16 format is rendered
  Then the render shows "Ich drucke nicht mehr." while "punchline" plays

Scenario: A sound line shows no subtitle
  Given the meme "office-prank" has the sound line "reveal-boom" without on-screen text
  When its 9:16 format is rendered
  Then no subtitle is shown while "reveal-boom" plays

Scenario: Subtitles can be turned off
  Given the meme "office-prank" sets subtitles off
  When its 9:16 format is rendered
  Then the render shows no subtitles

## Out of Scope
- English subtitles or subtitle files for a meme

## Open Questions
- none
