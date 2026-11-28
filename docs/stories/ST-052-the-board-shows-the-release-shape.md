---
id: ST-052
title: The release board names the release shape and shows only its platforms
type: task
ui: true
priority: should
size: null
risk: null
depends_on: [ST-047, ST-048]
labels: [feature:platform-formats]
feature: platform-formats
sources: [docs/research/platform-video-formats.md]
status: done
---

## Task
Read model `RM-ReleaseBoard` (`docs/domain/events.yaml`). Decided by the user on 2026-11-27 (Q12).

- The project's release view names the shape and why, above the platform tabs: "Short-Folge · 9:16 · 2:41" /
  "Short episode · 9:16 · 2:41"; for an episode "Folge · 9:16 · 3:12 · länger als 3 min" / "Episode · 9:16 · 3:12 ·
  over 3 min"; for a horizontal episode up to 3 minutes "Folge · 16:9 · 2:30 · Hochkant-Fassung als Short" / "Episode ·
  16:9 · 2:30 · vertical version as its Short". Music videos and memes show no line.
- The tabs show only the platforms the shape has posts on: a short episode shows YouTube, TikTok, Instagram, X and
  Microsite, and no Spotify or LinkedIn.
- A short episode's YouTube post is headed "Short" and shows the cover, title, description and hashtags (ST-043 form).
- A short episode's TikTok and Instagram tabs show its one video's posts from the plan (TikTok: caption, hashtags,
  cover; Instagram: the Reel), and no Story card for a story the plan does not have (marathon 2026-11-27-2, ST-048
  review; decided by recommendation, delegated by the user).
- The wording follows the glossary: `_UI (de)_: Short-Folge`, `_UI (en)_: Short episode`.

## Acceptance Criteria
- [x] A short episode's release view shows "Short episode · 9:16 · 2:41" for a 161 s 9:16 episode (test)
- [x] A vertical episode of 192 s shows "Episode · 9:16 · 3:12 · over 3 min" (test)
- [x] A short episode's board data has no Spotify and no LinkedIn tab (test)
- [x] A music video's release view shows no shape line
- [x] A short episode's TikTok and Instagram tabs show the plan's posts, and no Story card (test)
