---
status: accepted
date: 2026-11-25
---

# One release post plan for every consumer

## Status

Accepted — 2026-11-25. From architecture candidate 01 in
[the review](../reviews/architecture-review-2026-11-25.md). Aligns with [ADR 0019](0019-release-package.md) and
[ADR 0024](0024-release-package-split.md); no accepted decision changes.

## Context

Five modules built a release post from raw `review/upload.yaml` data: the folder writer (`release.ts` with
`release-texts.ts`), QA (`release-qa.ts`), the board (`release-board-data.ts`), the autopilot
(`release-autopilot.ts`), and the uploader (`publish.ts` with the publish adapters). Each decided its own caption,
limit, and default. They already disagreed: a music video's Short showed `tiktok.caption + overlay + hashtags` in
the folder and board, while the uploader sent the title and hashtags. Text limits lived in four tables, and QA's
list of expected texts missed the conditionally written `linkedin.md`.

The consumers also load different inputs. `release` has the timing, the board and QA have a manifest, and `publish`
has only the upload data. Rebuilding the plan in each consumer would let them drift again.

## Decision

- **One plan states every post's exact text, its files, its source, and its limits.** `buildReleasePlan` in
  `packages/core/src/release-plan.ts` is pure: project facts, `review/upload.yaml`, the channel, limits, chapters,
  credits, and the release-folder files in; a list of posts keyed by the calendar event id out. It is the **Release
  Post Plan** of `CONTEXT.md`, not the `release-plan.md` table, which is the calendar laid out.
- **Posts use the calendar's ids.** `youtube`, `short:Z1-intro:tiktok`, `x`, `linkedin`, and the tasks keep the
  identity the board, calendar, and autopilot already share. A post carries a closed set of text fields with a
  `{youtube}`/`{spotify}` slot for live URLs, its release-folder files, and its render or social media source.
- **A missing text is absent, never a TODO string.** The plan reports it under `problems.missing`; the folder and
  board turn that key into their localized TODO. The uploader only ever sees platform text.
- **`release` persists the plan in `manifest.json`.** `manifest.plan` is optional so older folders still parse.
  The folder texts, QA, the board, the autopilot, and `publish` read it; the folder writer and board build the same
  plan in process, and `publish` falls back to an upload-only plan when no release folder exists.
- **Text limits have one source:** `platformLimits(channel)` over `PLATFORM_LIMITS`. The plan carries each text's
  limit and its hashtag count; `planProblems` is the one checker. `platformTextProblems` is a thin wrapper over a
  plan built from upload data. Publish and the adapters read the same table.
- **Hashtag counting is one function**, including hashtags written in the caption itself.

## Consequences

- A TikTok Short uploads the caption the folder and board show. A YouTube upload sends the planned description,
  including chapters, footer, and credits; unresolved `<ID>` links stay a folder TODO and never reach a payload.
- QA derives its expected texts and its text verdict from the plan, so `linkedin.md` is expected whenever the plan
  holds a LinkedIn post.
- `manifest.json` grows by the plan; the release-manifest schema and `schema/` change with it. A folder released
  before this decision keeps working through the fallbacks.
- The plan is the vocabulary candidates 03 and 04 build on: release records and release facts no longer need to
  re-derive text.

## Alternatives considered

- **Rebuild the plan in every consumer.** No persisted field, but the inputs differ (timing, manifest, upload data)
  and the live TikTok disagreement returns whenever one input is missing.
- **A separate `renders/release/plan.json`.** One more file and schema without a reader that the manifest does not
  already serve.
- **Keep the upload data as the source and only share the captions.** The other texts (YouTube description, X reply,
  LinkedIn post) would keep their copies, and the plan would not be the one place.
