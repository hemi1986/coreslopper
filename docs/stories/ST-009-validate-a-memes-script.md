---
id: ST-009
title: Validate a meme's script with library sounds
type: domain
context: BC-ScriptedAudio
aggregate: AGG-Script
command: CMD-ValidateScript
ui: false
priority: must
size: null
risk: null
events: [EVT-ScriptValidated]
depends_on: [ST-001, ST-007]
labels: [feature:meme]
status: ready
---

## Story
As a setup skill, I want every edit of a meme's script checked against the sound library and the meme's characters, so that the voice track never meets a sound or speaker that does not exist.

## Context
The workspace hook validates every edit of `script.yaml` (POL-ValidateEveryScriptEdit). For a meme:

- A sound line names a library sound (`sound: <id>`) or a prompt to generate one – exactly one of the two. A line
  with a library sound has no duration; its length comes from the sound's trim (Q13, CMD-WriteMemeScript).
- Speakers are characters of the meme's own character bible or the library characters it uses; there is no series
  canon. In the script stage the hook checks speakers and sets only as valid ids; `validate` checks them against
  the bibles once `style-character` is done; no placeholder characters or sets (HS-262).
- Script lines stay strictly one after another (ADR 0016, HS-257).
- A meme lasts at most 30 seconds. The script validation checks only the lengths it already knows – pauses and
  sound lengths; spoken lines are measured later and `episode-track` refuses a longer track (HS-264).

## Acceptance Criteria

Scenario: A script with a library sound passes
  Given the library holds "vine-boom" of 1.4 seconds
  And the meme "office-prank" has a script whose sound line "reveal-boom" names "vine-boom"
  When the script is validated
  Then the validation passes and "reveal-boom" lasts 1.4 seconds

Scenario: A sound line with both a sound and a prompt is refused
  Given the meme "office-prank" has a sound line "reveal-boom" with the sound "vine-boom" and the prompt "a deep boom"
  When the script is validated
  Then the validation fails because a sound line names a sound or a prompt, not both

Scenario: An unknown library sound is refused
  Given the library does not hold "air-horn"
  And the meme "office-prank" has a sound line that names "air-horn"
  When the script is validated
  Then the validation fails because there is no library sound "air-horn"

Scenario: Known lengths over 30 seconds are refused
  Given the meme "office-prank" has a script whose pauses and sound lines add up to 34 seconds
  When the script is validated
  Then the validation fails because a meme lasts at most 30 seconds

## Out of Scope
- Overlapping sound lines (HS-257: a later story if punch sounds come too late)
- Episodes' scripts: their rules stay as they are

## Open Questions
- none
