# Release board, release calendar, and the workspace release schedule

## Status

Accepted — 2026-11-21. Extends [ADR 0024](0024-release-folder-manual-distribution.md).

## Context

The release folder of ADR 0024 holds every file and one Markdown text per platform, but publishing still meant reading six files side by side to find which image goes where, which text belongs to which post, and when. The release plan was a fixed list of days relative to a release date that was often missing, so it never said which Monday a Short goes out, and the Shorts of several songs in one workspace collided unless they were planned by hand.

Platforms also differ more than the texts showed: Shorts links are not clickable (only the related video is), Instagram allows five hashtags, Spotify has no YouTube link field and stopped Clips in June 2026, X without Premium has 280 characters and links reach fewer people, LinkedIn shows about 210 characters before "see more". The research is in [docs/release-platforms.md](../release-platforms.md).

## Decision

- **`config/release-schedule.yaml` holds the workspace's release rules** (optional; times in the computer's time zone unless `timezone` is set): release on Friday, the song at 00:00 and the main video at 18:00 as a Premiere, at least a week between releases, 21 days of lead, the distributor at T−21, the pitch at T−14, the announcement and the canvas at T−7, the Spotify link at T+1, Shorts on Mo/We/Fr with at most one Short of a song per week, posting times per platform (YouTube 18:00, TikTok and Instagram 20:00, LinkedIn Tuesday 09:00), Christmas and New Year kept free (`skip`), and slots booked by hand.
- **Each project gets `review/calendar.yaml`**, written by `release` (and `calendar`): the next free release day and Short slots under the schedule, never colliding with another project's calendar. `release.release_date` in `project.yaml` always wins; without it the date is a proposal and stays a TODO. Times already in the calendar are kept, so the user may move an event by hand; `--replan` plans again. The release folder gets `texts/release-plan.md` with real dates and times and `calendar.ics`.
- **`release-board` is a local web page** (127.0.0.1, no dependencies) over every project with a release folder or calendar: per platform the posts with their files (previews from the release folder), the texts to copy with live counters against the limits, the settings to check, and where each post points; a calendar of all projects; and an `.ics` export. Ticking a post off and entering its live URL writes `review/release-status.json`. The posts' ids are the calendar's event ids, so a ticked post is a done calendar entry. The live YouTube URL replaces the `[link to the main video]` slot in the X and LinkedIn texts.
- **Upload data grows by four optional blocks:** `announcement` (T−7, Instagram story, YouTube post, X), `x` (the release post with a native video and a reply carrying the link; optionally per Short), `linkedin` (the agent decides `post` or `skip` with a reason from the song's theme: political, work, tech, or AI angles post), and `microsite` (teaser, page text, quote). A missing block is a text still to write, as before.
- **The artist microsite is a platform of the board**: `release` writes `renders/release/microsite/<slug>.json` with the texts, lyrics, images, credits, the AI disclosure line, and the live URLs from the status, for a microsite built elsewhere. Which link a bio carries stays the channel's choice.
- **The feed format has a home:** the 4:5 or 1:1 render is the Instagram feed post of the release (`instagram_post`, now a required text) and the LinkedIn video; the cover stays the fallback without a square render.
- **Limits follow the research:** X `post` 280 and `hashtags` 2, LinkedIn `post` 3000, `hook` 210, and `hashtags` 3, overridable in `config/channel.yaml` like the others.

## Alternatives considered

- **A static HTML file per release folder.** No place to tick off posts or record URLs, and no view across projects; the calendar's value is the cross-project view.
- **Plan each project in isolation.** Two songs would release on the same Friday and their Shorts would share slots, which is what the hand-made plan avoided.
- **The microsite as the fixed link in every bio.** Not every channel has one, and the bio link is the channel's choice.
- **A hosted dashboard.** The release folders live on a local media drive; a local server reads them in place and publishes nothing.

## Consequences

- `release` now also writes `review/calendar.yaml`; a stage runner may run it, since the user owns only `project.yaml` and the overrides.
- Songs released before the calendar existed need their slots: `release.release_date` in their `project.yaml` or `booked:` entries in the schedule, otherwise a new calendar may propose a Friday they already took.
- Platform rules change; the notes on the board, the limits, and `docs/release-platforms.md` are the places to update.

## Note — 2026-11-22

[ADR 0045](0045-release-records-and-fixed-release-day.md) (proposed) amends three statements of this ADR, and the code follows it in part:
- Times in the calendar are kept only while the release day stays. A new release day plans every event again.
- A proposed release day never collides with another project's calendar. A day the user sets in `release.release_date` wins and is not yet checked against other releases, skip days or the lead time (G-160).
- The live YouTube URL fills the X and LinkedIn texts on the board and the microsite data. The files in `texts/` keep the placeholder (G-154).
