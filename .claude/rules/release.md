---
paths:
  - "packages/core/src/release.ts"
  - "packages/core/src/calendar.ts"
  - "packages/cli/src/release.ts"
  - "packages/cli/src/release-files.ts"
  - "packages/cli/src/release-images.ts"
  - "packages/cli/src/release-media.ts"
  - "packages/cli/src/release-microsite.ts"
  - "packages/cli/src/release-texts.ts"
  - "packages/cli/src/release-qa.ts"
  - "packages/cli/src/release-calendar.ts"
  - "packages/cli/src/release-board.ts"
  - "packages/cli/src/release-board-data.ts"
  - "packages/cli/src/upload-text.ts"
  - "packages/cli/src/board/release.js"
  - "workspace/.claude/skills/release-backfill/**"
  - "workspace/.claude/skills/video-qa/release.md"
  - "tests/release-folder.test.ts"
  - "tests/release-calendar.test.ts"
  - "tests/release-characterization.test.ts"
  - "tests/helpers/release-fixture.ts"
  - "templates/channel/**"
---

# Release (BC-Release)

> Concept slice across core's release rules, the CLI's release commands, the release board and two workspace
> skills. Adopted 2026-11-22. Decided by recommendation plus four answers from the user. The model is in
> `docs/domain/events.yaml` (`AGG-ReleasePackage`, `AGG-ReleaseCalendar`, `AGG-ReleaseStatus`), the decisions in
> ADR 0045 (proposed), and gaps G-150–G-166 in `docs/domain/gap-register.md`.

## Purpose

Release turns a finished project into everything its release needs:
- the release folder with its manifest;
- the platform texts, laid out from the agent's upload data and checked against the limits;
- the release calendar, planned across the workspace;
- the release board, where the user posts by hand, ticks off what went live, and gives the one approval.

## Key terms

Release Package, Release Folder, Release Manifest, Upload Data, Upload Text, Release Metadata, AI Credits, Channel
Config, Release Schedule, Release Calendar, Calendar Event, Proposed Release Day, Release Board, Release Status,
Done Mark, Live URL, Release Approval, Announcement, Microsite, TODO. All are in `docs/glossary.md`. On the board,
"post" and "task" are only labels for a calendar event. "Upload package" is not a term.

## As-is boundary

- Core holds the pure rules:
  - `packages/core/src/release.ts`: facts and TODOs, release defaults, limits, chapters, the canvas window, LRC
    and SRT;
  - `packages/core/src/calendar.ts`: `buildCalendar`, the zone arithmetic and the iCalendar export;
  - `approvalHolds` in `packages/core/src/autopilot.ts`.
- `buildRelease` (`packages/cli/src/release.ts`) writes `renders/release/` through one `ReleaseWriter`:
  - it renders a stale format through the render command and plans `review/calendar.yaml`;
  - it composes the dated images (`release-images.ts`) and lays out `texts/` (`release-texts.ts`);
  - it writes `manifest.json` last.
- The agent writes `review/upload.yaml` (`video-qa/release.md`, `release-backfill`); no code writes it.
- The board's release view is `release-board.ts`, `release-board-data.ts` and `board/release.js`.
  - It writes `review/release-status.json` only through `updateStatus`/`writeStatus` under
    `review/.release.lock`.
  - `approveRelease` (in `release-autopilot.ts`) writes the approval. For a proposed day it first writes
    `release.release_date` into `project.yaml`.
- `release-qa.ts` adds the release rows to `qa`.

## Boundaries

- Read renders, render records, Shorts and composed images (render slice) and the effective timing. Never write
  them, except that a stale format is rendered again through the render command.
- Never invent a release fact; a missing one is a TODO, and a TODO never fails.
- The only write into `project.yaml` is `release.release_date` when a day is fixed (HS-177).
- Every write to the release status takes the release lock. The board writes only from its own page.
- An approval holds for one release day; read it through `approvalHolds`. Stage runners, `/video-next` and agents
  never approve.
- The release autopilot, publish, the timer and the watchdog are the publish slice. Change them there.

## Typical pitfalls

- A proposed day is fixed only by the approval, so a user who posts by hand keeps a TODO. `--replan` proposes
  again (G-150, high).
- The board's refresh (`render: false, stills: false`) deletes a stale format or a changed dated image from the
  folder (G-151, high).
- QA misses chapters, the description's bytes and `linkedin.md`. QA calls a missing upload text WARN (G-152).
- A broken `upload.yaml` shows on the board as no texts (G-153). The live URL never reaches `texts/x.md` and
  `texts/linkedin.md` (G-154).
- The microsite data has no schema (G-155). German labels and jurisdiction notes are hard-coded. Tests assume
  Berlin and German (G-156).
- The release context and the folder layout exist twice. `buildRelease` finds the workspace from the working
  directory (G-162).
- There is no lock around the folder, the manifest or the calendar (G-161). Checklist ticks are keyed by position
  (G-163).
- A new release day drops the times the user moved. That is intended, and ADR 0028's wording is stale.

## Read next

- `docs/glossary.md` (the release terms), `docs/adr/0019-release-package.md`,
  `docs/adr/0024-release-folder-manual-distribution.md`, `docs/adr/0028-release-board-and-calendar.md`,
  `docs/adr/0029-release-autopilot.md`, `docs/adr/0045-release-records-and-fixed-release-day.md`
- `docs/publishing.md`, `docs/release-platforms.md`, `docs/board.md`
- `.claude/rules/render.md` (renders, Shorts, composed images and recipes), `.claude/rules/pipeline.md`
  (qa-export, the next action)
