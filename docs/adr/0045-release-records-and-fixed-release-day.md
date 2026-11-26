---
status: proposed
date: 2026-11-22
---

# Release: three records, a release day fixed without the approval, refreshes that never remove a file, and one set of checks

## Status

Proposed — 2026-11-22. Records decisions already in the code and closes rules the code leaves open. Amends
[ADR 0019](0019-release-package.md), [ADR 0024](0024-release-folder-manual-distribution.md),
[ADR 0028](0028-release-board-and-calendar.md) and [ADR 0029](0029-release-autopilot.md). The adoption of the
release slice recovered it from the code and four questions about how the workflow is used; the code was not
reviewed by a user.

## Context

ADRs 0019, 0024, 0028 and 0029 built the release step by step: the package, the release folder, the board and
calendar, and the approval for the autopilot. Since then the code has moved on, and the sources disagree:
- A proposed release day becomes the project's day only through the approval. A user who posts by hand never
  approves, so the day stays a proposal and a TODO, also at the distributor step three weeks ahead, and a replan
  proposes a new one.
- The board refreshes the release folder in the background after a live URL or an approval, without renders and
  stills. A stale format or a changed dated image is skipped, and the clean-up then deletes the earlier copy from
  the folder the user uploads from.
- `release` and QA check different things. `release` fails on invalid chapters and an over-long YouTube
  description; QA checks neither, and never checks the LinkedIn text. QA calls a missing upload text a WARN, the
  release checks a TODO.
- ADR 0028 says the live YouTube URL goes into the X and LinkedIn texts. Only the board shows it; the files in the
  folder keep the placeholder.
- ADR 0028 says times in the calendar are kept, and that the calendar never collides with another project. Times
  are kept only while the release day stays, and a day the user sets is never checked.
- The approval is checked against its blockers only by the board's button, and the production view counts an
  approval of a day that has moved.
- The microsite reads its song data from the release folder, but the data has no schema.
- The release texts, images and board ship German jurisdiction notes and a German/English switch upstream.

The common way to release is by hand from the release board: the texts go out as the agent wrote them, the
release day is the one the calendar proposes, and the distributor and the microsite get the song.

See `docs/domain/adoption-report.md`, the release slice.

## Decision

- **Three records, one writer each.**
  - The release folder with its manifest is written only by `release`. Its input is the upload data, which the
    agent writes.
  - The release calendar is planned only by `buildCalendar`.
  - The release status (done marks, live URLs, the approval) is written only under the project's release lock.
  - Fixing a release day writes `release.release_date` into `project.yaml`. This is the one exception to "a tool
    never writes a user-owned file". It keeps every comment.
- **The user fixes a proposed release day without approving.** The board fixes the proposed day as the approval
  does, but hands nothing to the autopilot. Until then the distributor step says that the day is still a proposal.
  A replan keeps a proposed day while no other release holds it.
- **A refresh never removes a file it could not refresh.** A run without renders or stills keeps the earlier copy
  in the folder and in the manifest, and reports the TODO. Only a full `release` composes the dated images again.
- **One set of checks.** `release` and QA run the same checks on the same texts: limits, chapters, the
  description's bytes, and every text file written. A gap only the user can close is a TODO everywhere; WARN is
  advice.
- **One layout for folder and board.** The live URL reaches every text that points to the main video, in the folder
  and on the board. Both come from one release context and one folder layout.
- **A new release day plans every event again.** Times the user moved are kept while the day stays. Done marks are
  facts and stay. The user's own day wins. When it collides with another release, lies on a skip day or leaves
  less than the lead time, the board and `release` report it.
- **The approval covers one release day, not the content.** Texts, times and files may change after it. Every
  reader uses `approvalHolds`. The approval checks the same blockers wherever it is given.
- **The microsite data is a published language.** It has a versioned schema in core and one producer, `release`.
  It names a release day only once the day is fixed.
- **English is the one built-in language.** Other languages and jurisdiction notes, such as an imprint line, come
  from the workspace's channel config. Examples and tests assume no country.

## Alternatives considered

- **Fix the day only through the approval** (as now). This ties a fact the distributor needs three weeks ahead to
  a consent for automatic posting, which a user who posts by hand never gives.
- **Let the board refresh render.** A render takes minutes and can cost a run of the generation queue. A refresh
  that keeps the earlier copy and reports the TODO is quick and loses nothing.
- **Keep QA as the only check.** `release` then could not refuse a broken limit before the user copies the text.
  One function used by both keeps them in step.
- **Shift moved times with the release day.** A time moved for one day rarely suits another, so planning again is
  the safer default. The user can still move a time afterwards.

## Consequences

- Several of these rules are ahead of the code. The gaps are G-150 and later in `docs/domain/gap-register.md`:
  - the day is fixed only by the approval;
  - a refresh deletes files;
  - QA and `release` check differently;
  - the board hides a broken `upload.yaml`;
  - the live URL is missing from the files;
  - the microsite data has no schema;
  - locale defaults ship upstream;
  - the approval's blockers and its staleness are not checked everywhere;
  - there are no locks around the folder and the calendar.
- The skill and doc texts that describe the older behaviour need a fix (G-157). `/video-next` sends the user to the
  release board after the pipeline, not only to `publish --dry-run`.
- The release autopilot's use of the approval, and publish, are the publish slice's. This ADR leaves ADR 0029's
  posting rules unchanged.
