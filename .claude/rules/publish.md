---
paths:
  - "packages/core/src/autopilot.ts"
  - "packages/cli/src/publish.ts"
  - "packages/cli/src/publish-auth.ts"
  - "packages/cli/src/publish-setup.ts"
  - "packages/cli/src/social-auth.ts"
  - "packages/cli/src/release-autopilot.ts"
  - "packages/cli/src/autopilot-state.ts"
  - "packages/cli/src/release-timer.ts"
  - "packages/providers/src/publish/**"
  - "tests/publish*.test.ts"
  - "tests/release-autopilot*.test.ts"
---

# Publishing (BC-Publish)

> Concept slice across core's autopilot plan, the CLI's publish, auth, autopilot and timer commands, and the
> providers' publish and post adapters. Adopted 2026-11-22. Decided by recommendation plus four answers from the
> user. The model is in `docs/domain/events.yaml` (`AGG-PublishLog`, `AGG-AutopilotLog`, `AGG-AutopilotRound`,
> `AGG-PlatformCredentials`), the decisions in ADR 0046 (proposed), and gaps G-167–G-180 in
> `docs/domain/gap-register.md`.

## Purpose

Publishing gets an approved release onto the platforms:
- `publish` uploads by hand: YouTube as private or scheduled videos, TikTok as drafts;
- the release autopilot posts every calendar event a platform API can post, at its time, once the user approved
  the release, and never posts twice;
- the platform credentials come from `publish-auth`;
- the watchdog round runs the autopilot every few minutes, from the board container or the timer.

## Key terms

Publish, Post, Platform, Publish Adapter, Post Adapter, Publish Log, Publish Plan, Draft, Platform Credentials,
Release Autopilot, Autopilot State, Autopilot Log, Take-over, Stuck Post, Missed Post, Pinned Comment, Watchdog.
All are in `docs/glossary.md`. A publish upload never goes public; a post does.

## As-is boundary

- Core: `planAutopilot` (`packages/core/src/autopilot.ts`) derives each calendar event's autopilot state from the
  release status, the autopilot log, the settings, readiness and `now`. `approvalHolds` there is the release slice's.
- `publishProject` (`packages/cli/src/publish.ts`) uploads YouTube and TikTok and writes `review/publish.json`, for
  the `publish` command and for the autopilot.
- `runAutopilot` (`packages/cli/src/release-autopilot.ts`) is one round under `.cache/release-run.lock`:
  - it reads pending YouTube uploads, then claims each due event under `review/.release.lock`;
  - it acts through `AutopilotDeps` and appends to `review/autopilot.json` (`autopilot-state.ts`);
  - it posts the pinned comment.
- The release status's writers (done marks, take-overs) are the release slice's. The autopilot calls them.
- `publish-auth.ts` and `social-auth.ts` write tokens into `.env`. `autopilotReadiness` and `doctor` read them.
- `release-timer.ts` installs a timer that runs `watch`; `production-watch.ts` runs the round (pipeline slice).
- Providers: `PublishAdapter` (YouTube, TikTok) and `SocialAdapter` (X, LinkedIn, Instagram), plus their mocks.

## Boundaries

- Read the release folder, the upload data, the calendar and the approval; never write them.
- Write into the release status only through the release slice's writers, under the release lock.
- Never send a post again by itself when it may have gone out: mark it uncertain (`markUncertain`). A
  `ConfigError` or `ValidationError` waits for the user.
- Go through `publishProject` for YouTube and TikTok; never call those adapters around it.
- Keep the plan pure and the state derived; never store an autopilot state.
- Stage runners, `/video-next` and agents never approve, never run `release-run`, never install the timer.
- Tokens stay in `.env`; mask every message before it is logged or written.

## Typical pitfalls

- An adapter's error after the last byte of a file was sent is uncertain (YouTube's `uploadChunks`, TikTok's last
  chunk and status polls in direct mode). Keep the mark when wrapping an error: `publishProject` rethrows it with
  `markUncertain` and writes `uncertain` into `review/publish.json`.
- Write `review/publish.json` only through `appendPublishEntry` (fresh read under the release lock) and `.env` only
  through `saveEnvValue` (lock and atomic rename): the container and the computer both write them, and X's refresh
  token is single-use.
- `planEvent` derives running, stuck, pending and done before it checks the approval: a withdrawal stops only what
  has not gone out. A scheduled YouTube upload still goes public; the board says so.
- The board container plans in UTC when the release schedule names no time zone; the board's autopilot box and
  `doctor` warn (G-167, closed).
- `TIKTOK_DIRECT_POST` is read as `1/true/yes` for the scopes, but only as `1` by the runner (G-172).
- `retries` counts failed attempts. Lateness counts from the calendar time, also for the upload a day ahead.
- The timer, its script and its lock are named after `release-run` but run the whole watchdog round (G-178).
- Docs drifted: ADR 0023's "nothing public", `docs/publishing.md`, the board's "they stay manual" (G-171).

## Read next

- `docs/glossary.md` (the publishing terms), `docs/adr/0023-publish-command.md`,
  `docs/adr/0029-release-autopilot.md`, `docs/adr/0031-watchdog-and-board-container.md`,
  `docs/adr/0046-publishing-records-and-never-twice.md`
- `docs/publishing.md`, `docs/release-platforms.md`, `docs/board.md`
- `.claude/rules/release.md` (the approval, done marks, the calendar), `.claude/rules/pipeline.md` (the production
  scan)
