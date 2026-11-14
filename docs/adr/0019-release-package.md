# A release package at the end of `qa-export`

## Status

Accepted — 2026-11-13. Extends [ADR 0018](0018-thumbnails.md) and [ADR 0005](0005-symbolic-timing-anchors.md).

## Context

A finished music video is not published alone. Users upload the main video with a title, a description, hashtags, studio tags, and a thumbnail, and then three Shorts over the following weeks, each with its own title, description, and vertical thumbnail. They did all of this by hand after the pipeline ended: ffmpeg one-liners for the cuts, ad-hoc scripts for the thumbnails, and texts written from memory, which drifted from the brief and once named a model the project had not used.

Like the thumbnails, this work splits cleanly: picking moments and writing texts is creative; cutting, composing, and checking files is mechanical.

## Decision

- **`qa-export` ends with a release package**: the master, three 16:9 thumbnails, three Shorts in `renders/shorts/`, a 1080x1920 thumbnail per Short beside it, and `review/upload.md`.
- **The creative part is in the `video-qa` skill** (`release.md`): pick three moments that work alone (typically hook or intro, chorus, climax or drop), cut on section boundaries, 30–50 s each; write the Short hooks; write the upload text in the project's language and the brief's tone. Facts come only from the project: spend from `state.json`, models from the manifest, credits from `song.json` and the brief.
- **The `short` command cuts** from `renders/9x16.mp4`. `--from` and `--to` take seconds or the storyboard's anchor kinds in a compact form (`section:chorus_1:end-0.5`, `beat:64`), resolved against the effective timing and snapped to frames. It re-encodes frame-accurately (H.264 crf 18, AAC 192k, six threads), fades the audio in over 0.15 s and out over 0.4 s with a frame-evaluated `volume` filter (some bundled ffmpeg builds lack `afade`), and refuses more than 60 s.
- **`thumbnail --format 9x16`** reuses the `Thumbnail` composition with a fixed vertical layout: the face in the upper middle, the hook in the lower part above the bottom 15 % that the Shorts UI covers, its first line inside the central square that grid views crop to.
- **`review/upload.md` has a fixed structure** in free language: a `##` section for the main video, a `## Shorts` section with one `###` per Short, bold labels for title, description, and tags (`qa` knows the labels in common languages), a hashtag line, and a checklist per Short.
- **QA checks the files, not the taste**: `Shorts` FAILs on a video that is not 9:16 or over 60 s, `Short thumbnails` on a wrong size, `Upload text` on an item without title, description, or hashtags; anything missing is a WARN. `status` lists the Shorts and the upload text.

## Alternatives considered

- **Cut the Shorts from the 16:9 master with a crop.** Loses the safe-area-aware 9:16 layout the renderer already produces.
- **Render each Short as its own Remotion range.** Exact, but re-renders minutes of video per Short; the 9:16 render exists already, and a re-encode of a range is seconds.
- **A JSON or YAML upload file.** Easier to validate, but the user copies the texts into YouTube Studio by hand; Markdown reads and copies well, and a small parser covers the structure.
- **Let `qa` judge titles and descriptions.** Taste and language belong to the agent and the art director; `qa` only checks that every item is complete.

## Consequences

- `qa-export` needs the 9:16 render, and takes a few minutes longer for three cuts, three more stills, and the text.
- `qa` reports `READY: yes` with a missing release package (WARN), so an unfinished package never blocks delivery of the master; the skill's completion criteria require it.
- The upload labels the checker knows are a fixed list; a project in a language outside it writes the labels in English.
