---
id: ST-055
title: The release skill and the platform docs follow the release shapes
type: task
ui: false
priority: must
size: null
risk: null
depends_on: [ST-044, ST-045, ST-046, ST-048, ST-049]
labels: [feature:platform-formats]
feature: platform-formats
sources: [docs/research/platform-video-formats.md]
status: ready
---

## Task
The agent writes the upload data and composes the assets from `workspace/.claude/skills/video-qa/release.md` and
`thumbnails.md`; the user reads `docs/release-platforms.md`. Both describe the old release. Load
`writing-for-agents` before editing the skill.

- `release.md` gets a short-episode path beside the meme's: one 9:16 cover and one TikTok cover, texts per platform
  in `main`, `tiktok`, `instagram`, `x`, the microsite and an optional announcement; no Shorts and no 16:9
  thumbnails.
- It gets the vertical-version path for a horizontal episode up to 3 minutes, and one main-video thumbnail for a
  vertical episode over 3 minutes.
- The story text becomes an optional caption of at most 120 characters; `x.media` defaults to `main`, `x.reply` is
  optional; `instagram_post` is the main video's Reel and only up to 3 minutes.
- `docs/publishing.md` and the comments in `packages/core/src/autopilot.ts` and
  `packages/cli/src/release-calendar.ts` no longer describe the Instagram feed post (ST-045 review).
- `new-series` says that a vertical series of episodes up to 3 minutes is released as short episodes.
- `docs/release-platforms.md` takes the findings of `docs/research/platform-video-formats.md`: Reels up to 20 min
  with recommendation only up to 3 min, no feed video, Shorts only square or vertical, show playlists, X API lengths,
  TikTok caption 2,200, the 120-character story caption (user observation).

The upload data rules the skill describes get their small fixes in the same change (marathon 2026-11-27-2 reviews of
ST-044 to ST-048, decided by recommendation, delegated by the user):

- An optional `announcement.story` is the announcement story's caption (at most 120 characters); the shared
  announcement text and its hashtags no longer count against that limit.
- QA WARNs, naming the field, for a story text on a Short the release-day story does not show, and for
  `instagram_post` when the main video is over 3 minutes.
- The upload data schema refuses a Short named `main` (`x.media: main` means the main video).
- An episode without a built episode track gets a TODO that its release shape is provisional.
- A short episode in `publish` and the autopilot is one video: no leftover `shorts` uploads, its TikTok upload from
  the plan whatever `main.platforms` says, no Premiere step and no pinned comment.

## Acceptance Criteria
- [ ] `release.md` describes the short-episode and the vertical-version paths with their commands
- [ ] No skill or doc asks for a story text, an Instagram feed image, or a Short for the X post by default
- [ ] `docs/release-platforms.md` cites the research file for every changed figure
- [ ] `announcement.story` is the announcement story's caption; an announcement text over 120 characters no longer fails release (test)
- [ ] QA WARNs for a story text on another Short and for `instagram_post` over 3 minutes; a Short named `main` is invalid upload data (test)
- [ ] An episode without `timing.json` gets the provisional-shape TODO (test)
- [ ] A short episode publishes only its one video, reaches TikTok without `tiktok` in `main.platforms`, and gets no Premiere step or pinned comment (test)
- [ ] `npm test` passes (the skill and doc checks)
