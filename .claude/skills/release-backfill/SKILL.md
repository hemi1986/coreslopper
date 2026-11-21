---
name: release-backfill
description: Backfill a project into the release board and calendar — a project finished before the release calendar existed, or a song that is already partly or fully published.
license: MIT
---

# Release backfill

A **backfill** brings a project whose release package predates the release calendar ([ADR 0028](../../../docs/adr/0028-release-board-and-calendar.md)) into it: the missing texts come from you without a question, facts about what is already out from the user, the dates from `calendar`. Run it in the main session; step 3 asks the user.

Backfill several projects oldest release first: each calendar takes the slots the earlier ones left free.

## 1. Check the project

```bash
npm run cli -- status projects/<slug>
```

The project needs a release folder (`renders/release/manifest.json`) and `review/upload.yaml`. Without them the release package is not built yet: that is `qa-export` (`/video-next <slug>`), not a backfill. Stop here and say so.

Done when the release folder and the upload data exist.

## 2. Write the missing texts

Read [`video-qa/release.md`](../video-qa/release.md), section 7, and add what `review/upload.yaml` lacks of `announcement`, `x`, `linkedin`, and `microsite` (and `x` per Short, when the Short goes to X). The rules there apply in full: the project's language, the brief's tone, facts only from the project files, the LinkedIn decision with its reason. Existing texts stay as they are; the user may have posted them. This step needs no answer from the user: hand it to a `stage-runner` subagent with this section when the main context is busy, and ask step 3's questions meanwhile.

Done when `npm run cli -- validate-file projects/<slug>/review/upload.yaml` passes and the four blocks exist.

## 3. Ask what is out

Ask the user, in one message, and wait for the answers:

- Is the song on the streaming services, and since which day? Is it scheduled at the distributor for a day?
- Is the main video on YouTube, and since when (or scheduled for when)?
- Per Short in `renders/release/shorts/`: posted or scheduled on YouTube, TikTok, Instagram, X, and when?
- Anything else published or scheduled by hand that is not in a project (another song, Shorts of a deleted project)?

Dates are facts: take them only from the user. An answer like "last month" gets a follow-up for the day.

Done when every item has a state: out on a day, scheduled for a day, or open.

## 4. Record the facts

- **Release day:** the user confirms, then you set `release.release_date` in `project.yaml` to the day the song went (or goes) out; without a song release, the main video's day. The hook validates the edit.
- **Slots outside projects:** add each to `booked:` in `config/release-schedule.yaml` (`kind: release` for a release day, `short` for a Short slot). Without the file, copy `templates/channel/release-schedule.yaml` there first.

Done when the release day is in `project.yaml` and every outside slot is booked.

## 5. Plan the calendar

```bash
npm run cli -- release projects/<slug> --no-render
```

`release` lays out the new texts and writes `review/calendar.yaml`. Then put the true times of everything from step 3 that is out or scheduled: edit the `at` of each such event in `review/calendar.yaml` (local time with offset, e.g. `2026-11-23T18:00:00+01:00`; the hook validates). Run `npm run cli -- calendar projects/<slug>` again: it keeps those times and places what is still open in free slots from today on.

Done when every event from step 3 carries its true time and `calendar` prints no open Short in the past.

## 6. Mark the past done

```bash
npm run cli -- calendar projects/<slug> --done-until <YYYY-MM-DD>
```

Use the last day up to which everything in the calendar happened (`today` when the song and all its posts so far are out). An event the user skipped on purpose stays open; tell the user which ones.

Done when the events still open are exactly the ones the user has yet to do.

## 7. Hand over

Tell the user: the release day, the open events with their dates, and that `npm run cli -- release-board` shows them and takes the live URLs of what is already posted (the URLs fill the links in the X and LinkedIn texts and the microsite data). Their **Approve release** on the board hands the open events to the release autopilot ([ADR 0029](../../../docs/adr/0029-release-autopilot.md)), which posts each one an API can post at its time; everything marked done in step 6 stays untouched. The approval is theirs: never approve for them.

## Completion

- `release.release_date` is set and the calendar is not `proposed`.
- `npm run cli -- qa projects/<slug>` has no FAIL in `Release texts`; TODOs are only facts the user still owes.
- The open events are exactly the user's remaining work, none of them in the past.
