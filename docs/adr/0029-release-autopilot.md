# The release autopilot: one approval, then the calendar posts by API

## Status

Accepted — 2026-11-21. Changes [ADR 0023](0023-publish-command.md) ("nothing goes public by itself") and extends [ADR 0028](0028-release-board-and-calendar.md).

## Context

The release calendar of ADR 0028 tells the user when each post goes out, but every post was still a login on the platform: open YouTube Studio, TikTok, Instagram, X, and LinkedIn, upload the file, paste the text. A release has some twenty such events over three weeks. What the user wants to keep is the decision to release, not the twenty logins.

The platforms differ in what their APIs allow ([docs/release-platforms.md](../release-platforms.md), [docs/publishing.md](../publishing.md)):

- **YouTube** uploads, schedules, updates descriptions, and posts comments, but an API project Google has not audited uploads private only, even with a publication time. Premieres, community posts, the related video of a Short, and pinning a comment have no API.
- **TikTok** posts directly only for an audited app; otherwise an upload is an inbox draft.
- **Instagram** publishes Reels, feed posts, and stories for the user's own professional account without App Review, from a public URL only, and with no link sticker on stories.
- **X** posts with media for a per-call price (pay-per-use, about $0.015 a post, $0.20 with a link).
- **LinkedIn** posts with video on the member's profile through self-serve products; the token lasts 60 days without a refresh token.
- **Spotify for Artists** and distributors have no public API.
- No platform except YouTube schedules through its API.

## Decision

- **One click releases.** The release board's "Approve release" writes `approval` with the approved release day into `review/release-status.json`; a proposed release day becomes `release.release_date` in `project.yaml` in the same click. The approval holds for that day only: a moved release waits for a new approval. The board accepts writes only from its own page (loopback Host, same Origin, a JSON body), so no other website can approve. From then on the **release autopilot** posts every calendar event a platform API can post at its calendar time. Withdrawing the approval stops what has not gone out. The principle becomes: **nothing goes public without the user's approval.** Stage runners, `/video-next`, and agents never approve, never run `release-run`, and never install the timer.
- **`release-run` is a short, idempotent round** that claims each due event under a per-project lock shared with the board, started every five minutes by `release-timer install`: the Windows Task Scheduler under WSL (WSL stops when no terminal is open), a systemd user timer on Linux, launchd on macOS. One round at a time (a lock in `.cache/`). The computer must be on at the posting times.
- **The plan is pure and shared** (`packages/core/src/autopilot.ts`): per event its API action or none, and a state (manual, unapproved, waiting, due, blocked, running, pending, done, failed, stuck, missed). The board shows it; only the runner acts on it.
- **YouTube uploads go up a day ahead** (`youtube_ahead_hours`), private, or scheduled once `youtube_audited` is set. Switching a video public (or scheduling the Premiere) stays a click in Studio until the audit; the runner sees the video go public, marks it live with its URL, and posts the pinned comment. The posts that link to the main video (the X release post, LinkedIn) wait until it is public.
- **The rest posts at the calendar time:** Instagram Reels, the feed post, and the announcement story (files hosted in the user's fal.ai storage, which Instagram fetches); X with media and the link reply; LinkedIn with native video; TikTok as a draft, or directly with `tiktok_direct` for an audited app; the day after, the Spotify link into the YouTube description once the user entered it on the board; the microsite page copied into a configured directory and deployed by its command.
- **The release-day story, community posts, the distributor, the pitch, the canvas, and Spotify stay manual**: no API, or no link sticker.
- **Never twice:** a post whose answer was lost, or that failed with a server error after sending, is *stuck* and waits for the user to check the platform; it is never retried by itself. Other failures retry with a back-off up to `retries`; credentials and validation failures wait for the user at once. A post whose time passed by more than `late_hours` (the computer was off) is *missed*: the user posts it now or takes it over.
- **Per post the user can take over** ("Do it myself"); the autopilot then leaves it alone. Platforms without credentials stay manual and show as blocked.
- **Content that follows the calendar is mechanical:** `release` composes the announcement story and post images with the release date, the release-day story image, and the 4:5 feed image from the still of the cover's thumbnail recipe (or `announcement.image`), and cuts a 10 s teaser from the first chorus. It composes them again when the date moves.

## Alternatives considered

- **Keep every post a login (ADR 0023 as it was).** Twenty logins per release for content that is already finished and checked; the decision to release is the only judgement in them.
- **A click per post on the board.** No logins, but the user has to be at the board at every posting time, which is the calendar's job.
- **Platform scheduling only.** Only YouTube schedules through its API, and only after the audit.
- **A hosted scheduler or a third-party posting service.** The release folders live on a local media drive, and the user's tokens would leave the machine; a service also costs a subscription.
- **Retry everything.** A lost answer on X or LinkedIn would post twice in public; a wrong double post costs more than a late one.

## Consequences

- Credentials for X, LinkedIn, and Instagram join `.env` (`publish-auth x|linkedin|instagram`); YouTube needs the `youtube.force-ssl` scope, so existing tokens are authorized again. `doctor` and the board warn about missing and expiring tokens.
- X posts cost money per call; the autopilot logs an estimate per post.
- Full automation of YouTube and TikTok depends on audits only the user can apply for; until then those platforms keep one click each in their own apps.
- `review/autopilot.json` is a new log; `review/release-status.json` records who marked an event done.
