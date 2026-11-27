---
id: ST-054
title: The microsite data names the video's aspect
type: task
ui: false
priority: could
size: null
risk: null
depends_on: [ST-048]
labels: [feature:platform-formats]
feature: platform-formats
sources: [docs/research/platform-video-formats.md]
status: ready
---

## Task
A short episode's microsite page shows a vertical video and a 9:16 cover, but the microsite data (`RM-MicrositeSong`,
a published language with a versioned schema, ADR 0045) gives no format. Decided by the user on 2026-11-27 (Q15).

- The microsite data gets an optional `aspect` (`16:9`, `9:16`, `4:5`, `1:1`), the master's. Additive: the schema
  version stays, older data stays valid.
- Its image is the short episode's cover instead of the first thumbnail.

## Acceptance Criteria
- [ ] A short episode's microsite data has `aspect: "9:16"` and the cover as its image (test)
- [ ] A music video's microsite data has `aspect: "16:9"` (test)
- [ ] Microsite data without `aspect` still validates (test)
