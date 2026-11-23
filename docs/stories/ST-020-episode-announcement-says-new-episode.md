---
id: ST-020
title: An episode's announcement images say "new episode", not "new song"
type: chore
ui: false
priority: should
size: null
risk: null
depends_on: []
labels: [bug]
status: in-progress
---

## Task
Bug: `release` composes the dated announcement images (`renders/release/announce/story-9x16.jpg` and
`post-16x9.jpg`) with a fixed tag `newSong` ("NEUER SONG" / "NEW SONG"), no matter what the project's kind is. An
episode (`kind: episode`) has no song release, so its announcement is wrong. Seen with the four episodes of a
series in a 0.9.0 workspace (2026-11-22). Every episode announcement was tagged "NEUER SONG".

Cause: `derivedImages()` in `packages/cli/src/release-images.ts` only knows the words `newSong`, `now`,
`onYouTube`, and `fresh`. `composeReleaseImages` in `packages/cli/src/release.ts` doesn't pass the project's kind.

Fix (tried in the workspace as a local patch):

- `WORDS` gains `newEpisode` ("NEUE FOLGE" / "NEW EPISODE").
- `derivedImages()` takes an optional `episode` flag. The two announcement images use `newEpisode` when the flag is
  set, and `newSong` otherwise.
- `release.ts` passes `episode: project.config.kind === 'episode'`.

A music video keeps "NEUER SONG". The story and feed images ("JETZT", "NEU") already fit both kinds and stay as
they are. Words outside `en` come from the channel config under ADR 0045; this fix follows the built-in table that
exists today.

## Acceptance Criteria
- [x] `derivedImages()` with `episode: true` tags both announcement images with the episode word in `de` and `en` (test)
- [x] Without the flag, the tags stay `newSong` (test)
- [x] `release <episode> --no-render` writes announcement images tagged "NEUE FOLGE" for a German episode
- [x] A music video's announcement images are unchanged
