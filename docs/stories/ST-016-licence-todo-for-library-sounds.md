---
id: ST-016
title: The release check flags sounds of unknown licence
type: domain
context: BC-Release
aggregate: AGG-ReleasePackage
command: CMD-CheckRelease
ui: false
priority: must
size: null
risk: null
events: [EVT-ReleaseChecked]
depends_on: [ST-015]
labels: [feature:meme]
status: done
---

## Story
As a user, I want the release check to tell me which sounds of a meme I have not cleared, so that I decide before it goes online.

## Context
HS-261: the user decides whether a sound may be used. A used library sound with the licence `unknown`, or one that
asks for attribution without a credit (HS-265), is a TODO in the release checks and on the release board; it never fails the
release (CMD-CheckRelease rules; a gap only the user can close is a TODO, HS-172).

Follow-up from ST-015 (user, 2026-11-23): the autopilot's YouTube Short and TikTok uploads still take their text from
`review/upload.yaml`, so the credit misses the posted caption; the upload path must carry the release caption with the
credit, like the board and the Instagram Reel already do.

## Acceptance Criteria

Scenario: A sound of unknown licence is a TODO
  Given the meme "office-prank" uses "vine-boom" with the licence "unknown"
  When its release is checked
  Then the check lists a TODO for "vine-boom" and the release does not fail

Scenario: A cleared sound needs nothing
  Given the meme "office-prank" uses "vine-boom" with the licence "own"
  When its release is checked
  Then the check lists no TODO for "vine-boom"

Scenario: A missing credit is a TODO
  Given the meme "office-prank" uses "vine-boom" with the licence "cc-by" and no credit
  When its release is checked
  Then the check lists a TODO for the credit of "vine-boom" and the release does not fail

## Out of Scope
- Deciding licences for the user

## Open Questions
- none
