---
status: accepted
date: 2026-11-27
---

# Release shapes: short episodes, assets in the video's format, and Reels instead of feed posts

## Status

Accepted — 2026-11-27, feature `platform-formats`; accepted by the user on 2026-11-27. Amends [ADR 0018](0018-thumbnails.md) (three thumbnails per
video), [ADR 0019](0019-release-package.md) (three Shorts per video) and [ADR 0024](0024-release-folder-manual-distribution.md)
(the Instagram feed post and the story text). Follows the one release plan of
[ADR 0055](0055-one-release-plan.md) and the meme's one-video release of [ADR 0051](0051-memes-and-the-sound-library.md).

## Context

An episode is released like a music video today: a 16:9 main video with three thumbnails, three Shorts cut from the
9:16 render, an Instagram feed post, a story text, and an X post that carries a Short. Series of vertical episodes of
two or three minutes get nothing out of that: their 16:9 thumbnails are never shown, and cutting three Shorts out of
a two-minute episode repeats it. The platforms decide what counts as short-form, not the product
(`docs/research/platform-video-formats.md`):

- YouTube counts only a square or vertical video of at most 3 minutes as a Short; 16:9 stays long-form (F12).
- Instagram shares every new video under 15 minutes as a Reel, and the API knows no plain feed video (F1, F8); a Reel
  over 3 minutes is not recommended to non-followers (F2).
- A story has no text field (F7); the user sees a 120-character limit for a caption added to a story's video.
- X takes a whole video (F9, F10).

## Decision

- **A release has a shape**, derived from the project and recorded in the manifest: music video, meme, episode, or
  **short episode**. An episode is a short episode when its master is at least as tall as wide and its episode track
  lasts at most 180 seconds. Nothing in `series.yaml` sets it.
- **A short episode is one video**, posted on the release day to YouTube Shorts, TikTok, Instagram Reels, X, and the
  microsite, as a meme is. It has no main video, no Shorts, no community or pinned post, no story, and no LinkedIn.
  It gets one 1080x1920 cover and one 1080x1440 TikTok cover; its texts are written per platform; its announcement
  stays optional, with the teaser cut from its master. The series' YouTube playlist is a checklist line.
- **Assets follow the video's format.** A horizontal episode of at most 180 seconds keeps its main video and three
  thumbnails and posts its **Vertical Version**, the 9:16 render of the whole episode, as its one Short. A vertical
  episode over 180 seconds gets one main-video thumbnail and Shorts cut from its master.
- **The shape is kept once the release has started.** Until the release status holds a done mark or a live URL it
  follows the project; after that, a run whose shape differs fails and changes nothing.
- **Instagram gets Reels only.** The main video's feed post becomes its Reel and exists only when the main video
  lasts at most 180 seconds; the image post that stood in for a missing feed video is gone. A story carries no text;
  a story with a video may carry a caption of at most 120 characters.
- **X carries the main video by default.** A Short stays selectable; the reply with the YouTube link becomes
  optional, and the board notes that X takes more than 140 seconds only with Premium.

## Considered Options

- **A series setting "Shorts series".** Explicit, but a cut that grows an episode past 3 minutes would make YouTube
  treat it as long-form while the release still planned a Short. Deriving it from the master and the track keeps the
  release in step with what the platforms do.
- **Short episodes for every episode up to 3 minutes, horizontal too.** YouTube would publish a 16:9 episode as a
  long-form video without a main-video release around it (F12).
- **Keep three Shorts for short episodes.** Two or three minutes cut into three 30–50 s excerpts is most of the
  episode again.

## Consequences

- `ReleasePlanInput`, `buildCalendar`, the board and QA learn a fourth shape; the manifest and the microsite data
  each gain an optional field (`shape`, `aspect`), so older folders still parse.
- Released folders are untouched until `release` runs again; a released episode keeps its shape through the freeze.
- `video-qa/release.md` gets a short-episode path beside the meme's; `new-series` mentions that a vertical series
  of episodes up to 3 minutes is released as short episodes.
- The 120-character story caption rests on the user's observation in the app, not on a primary source (HS-267).
