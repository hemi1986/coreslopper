---
id: ST-001
title: Add a library sound
type: domain
context: BC-SoundLibrary
aggregate: AGG-LibrarySound
command: CMD-AddLibrarySound
ui: false
priority: must
size: null
risk: null
events: [EVT-LibrarySoundAdded, EVT-LibrarySoundRefused]
depends_on: []
labels: [feature:meme]
status: done
---

## Story
As a user, I want to add a sound file to the sound library with what it is used for, so that the meme skill can pick it when it writes a meme's script.

## Context
`sound add <file> --title "…" --use-when "…" [--tags a,b] [--cue <s>] [--trim <a>-<b>] [--source <url>] [--licence <l>] [--credit "…"] [--id <id>]`.
The entry is `library/sounds/<id>/sound.yaml` beside one WAV; the WAV is gitignored, `sound.yaml` stays tracked.

Rules (CMD-AddLibrarySound): without `--id` the id comes from the title (kebab-case); a taken id is refused; every
format ffmpeg reads is stored as WAV; length and loudness are measured, the file is never normalised; the licence is
`unknown` unless named; only a local file.

Invariants (AGG-LibrarySound): the id is the folder's name and its one WAV exists; title and use when are never
empty; length and loudness are measured, never typed; a cue and a trim lie inside the length, a cue inside the trim;
the same file content is never stored under a second id; update and init never overwrite the library; the credit is optional, and a licence that asks for attribution without one becomes a release TODO (HS-265).

Decided in the grilling of feature `meme` (user, 2026-11-22, Q4, Q5, Q20).

## Acceptance Criteria

Scenario: An mp3 becomes a measured library sound
  Given the sound library is empty
  And a file "boom.mp3" of 1.4 seconds
  When the user adds "boom.mp3" with the title "Vine Boom", use when "a dramatic reveal" and the cue 0.12
  Then the library holds the sound "vine-boom" as a WAV of 1.4 seconds with its measured loudness
  And its cue is 0.12 and its licence is "unknown"

Scenario: The same file under another id is refused
  Given the library holds "vine-boom" made from "boom.mp3"
  When the user adds "boom.mp3" again with the title "Boom 2"
  Then the sound is refused because it is already stored as "vine-boom"
  And the library still holds one sound

Scenario: A taken id is refused
  Given the library holds "vine-boom"
  When the user adds "other.wav" with the title "Vine Boom"
  Then the sound is refused because the id "vine-boom" is taken

Scenario: A cue outside the sound is refused
  Given a file "boom.mp3" of 1.4 seconds
  When the user adds "boom.mp3" with the title "Vine Boom", use when "a dramatic reveal" and the cue 2.0
  Then the sound is refused because the cue lies outside its length
  And no folder "library/sounds/vine-boom" exists

## Out of Scope
- Adding a sound by download URL
- Taking a generated sound into the library
- The board's Sounds view (ST-019)

## Open Questions
- none
