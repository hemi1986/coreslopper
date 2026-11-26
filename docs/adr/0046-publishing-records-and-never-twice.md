---
status: proposed
date: 2026-11-22
---

# Publishing: four records, publish versus post, never twice on every platform

## Status

Proposed — 2026-11-22. Records decisions already in the code and closes rules the code leaves open. Amends
[ADR 0023](0023-publish-command.md), [ADR 0029](0029-release-autopilot.md) and
[ADR 0031](0031-watchdog-and-board-container.md). The adoption of the publish slice recovered it from the code and
four questions about how the workflow is used; the code was not reviewed by a user.

## Context

ADR 0023 built `publish`, a private upload by hand. ADR 0029 added the release autopilot, which posts an approved
release at its calendar times, and ADR 0031 the watchdog round that runs it from the board container or a timer.
The code grew in a few days, and the sources now disagree:
- ADR 0023 and the adapter interface say that publishing never makes a video public. TikTok's direct mode posts
  through the same interface, and X, LinkedIn and Instagram got a second adapter family, not the platform enum
  ADR 0023 expected.
- ADR 0029 promises "never twice". The post adapters for X, LinkedIn and Instagram mark a send that may have gone
  out. The YouTube upload and TikTok do not, and `publish` drops the mark when it reports a failure. So a direct
  TikTok post could be sent again.
- `review/publish.json` and `.env` are written without a lock. With the board container, the computer and the
  container both write them, and X's refresh token is single-use.
- Withdrawing the approval is said to stop what has not gone out. A YouTube upload scheduled with `publishAt` still
  goes public. A post that may be live shows on the board as "automatic after approval".
- TikTok's direct mode has two switches, read in two ways. Readiness has two rules, one in `doctor` and one in the
  plan.
- The X price is recorded with every post and read by nothing. The YouTube quota counts only uploads.

Today the release is posted by hand from the release board. The autopilot is meant for every platform, run by the
board container, with the board as the place to see what went wrong.

See `docs/domain/adoption-report.md`, the publish slice.

## Decision

- **Four records, each with its lock.**
  - The publish log `review/publish.json` records every upload, from `publish` and from the autopilot. It is
    written under the project's release lock.
  - The autopilot log `review/autopilot.json` records every step on a calendar event. It is appended under the
    same lock. A post is claimed there only after the plan is made again from fresh files.
  - The autopilot round holds `.cache/release-run.lock`, one round per workspace across the computer and the
    container. The board container or the timer runs the round, never both: the other one says so and does not
    start.
  - The platform credentials live only in `.env`. Every write is atomic and takes a workspace lock. A long-running
    round reads the file again before each round.
- **Publish and post are different things.** A *publish* upload does not go public: a private or scheduled YouTube
  video, or a TikTok draft. The `publish` command does only this. A *post* goes public at a calendar event's time,
  through a post adapter (X, LinkedIn, Instagram) or TikTok's direct mode. Publish adapters and post adapters stay
  two families.
- **The autopilot state is derived.** Every round works out an event's state from the release status, the autopilot
  log, the settings, readiness and the clock. A take-over is the user's mark in the release status, beside the done
  mark. A done mark and a take-over win over every other state.
- **Never twice, on every platform.** A send that may have gone out is a stuck post and waits for the user. A
  configuration or validation failure waits for the user at once. Any other failure is tried again after
  attempts × 10 minutes, until `retries` failed attempts. A post more than `late_hours` late before its first
  attempt is missed. TikTok's direct mode has one switch, `autopilot.tiktok_direct`.
- **Withdrawing stops what the autopilot has not sent.** The board still shows what will go out anyway (a scheduled
  YouTube upload) and what may be live (running, stuck). Cancelling a scheduled upload stays a click in Studio.
- **One readiness rule** for `doctor`, the board and the plan. A token that can be refreshed counts as ready.
- **Posting has a price, but no budget.** The board shows what a release's posts cost, apart from the generation
  budget. Every YouTube call counts against the day's quota.
- **Instagram's files are hosted on the user's fal.ai storage.** They are uploaded when the post goes out and kept
  there. Instagram fetches only from a public URL, and the files belong to a public post.
- **The workspace names its time zone** when the board container runs, so that a release planned inside the
  container is not planned in UTC.

## Alternatives considered

- **One adapter interface for uploads and posts** (ADR 0023's plan). It hides the difference that matters most: an
  upload can be tried again without harm, a post cannot.
- **Retry everything with a back-off.** A lost answer then posts twice in public, which costs more than a late post.
- **Store the autopilot state.** It would drift from the release status the user changes on the board. Working it
  out each round costs nothing.
- **Count posting cost in the project budget.** The budget guards generation, which the queue spends on its own.
  Posting happens only after the user's approval, at known prices.
- **Delete Instagram's files after the post.** Nothing is gained, because the post is public, and a fetch that is
  still pending would fail.

## Consequences

- Several of these rules are ahead of the code. The gaps are G-167 and later in `docs/domain/gap-register.md`:
  - never twice is missing for the YouTube upload and TikTok;
  - the publish log and `.env` have no locks;
  - the board hides what goes out or may be live after a withdrawal;
  - the TikTok switch is read in two ways;
  - readiness has two rules;
  - posting cost and the YouTube quota are not counted;
  - the board's retry accepts any event in any state;
  - the container plans in UTC when the release schedule has no time zone.
- The texts that describe the older behaviour need a fix: ADR 0023's "nothing public", the adapter and schema
  comments, `docs/publishing.md`, `docs/release-platforms.md` and the board's "they stay manual". The accepted ADRs
  stay; this ADR amends them.
- The approval, done marks and live URLs stay the release context's (ADR 0045). The production scan in the watchdog
  round stays the pipeline's.
