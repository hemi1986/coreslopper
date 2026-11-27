---
id: ST-050
title: QA expects the thumbnails and covers of the release shape
type: task
ui: false
priority: must
size: null
risk: null
depends_on: [ST-047]
labels: [feature:platform-formats]
feature: platform-formats
sources: [docs/research/platform-video-formats.md]
status: ready
---

## Task
`qa` checks three 1280x720 thumbnails and the Shorts for every project (`checkThumbnails` in `packages/cli/src/qa.ts`;
ADR 0018, ADR 0019). Assets follow the video's format now (ADR 0057, `CMD-CheckRelease` in `docs/domain/events.yaml`;
user, 2026-11-27, Q8, Q9):

- horizontal main video: three thumbnails, as today;
- vertical main video (a vertical episode over 3 minutes): one 16:9 thumbnail is a PASS; YouTube shows its own 4:5
  image in the feeds (F14, F15 in `docs/research/platform-video-formats.md`);
- short episode: `Thumbnails`, `Shorts` and `Short thumbnails` are N/A; a new check `Cover` expects one 1080x1920
  JPEG and one 1080x1440 TikTok cover under 2 MB.

## Acceptance Criteria
- [ ] A horizontal episode with one thumbnail still WARNs "1 of 3" (test)
- [ ] A vertical episode over 180 s with one thumbnail is a PASS (test)
- [ ] A short episode reports `Thumbnails` and `Shorts` as N/A and FAILs `Cover` for a cover of the wrong size (test)
- [ ] `status` lists a short episode's cover and TikTok cover instead of thumbnails
