---
id: ST-021
title: The wizard's last step leads to the new project or series
type: chore
ui: true
priority: must
size: null
risk: null
depends_on: []
labels: [board]
status: done
---

## Task
The board's wizard (`#/new`) has no way out once its last step shows the Claude Code command. The person types the
command in Claude Code, comes back to the board, and is still on the wizard page with nothing to click. The nav
lists the project, but the wizard itself offers no "done" or "next". Seen with the board on 2026-11-22.

All three wizards in `packages/cli/src/board/wizard.js` end like this:

- music video (`videoSteps`): step 6 "Fertig" shows `/new-video <slug>` after "Setup abschließen".
- series (`seriesSteps`): step 3 shows `/new-series <slug>`.
- episode (`episodeSteps`): the command box `/new-episode <slug>` sits above the references step.

The project page (`#/p/<slug>`) and the series page (`#/s/<slug>`) already show the next command through
`nextBox` (`next.command` from `packages/core/src/production.ts`): `/new-video <slug>`, `/new-series <slug>`, or
`/new-episode <slug>` while setup or the canon is open. So the wizard only needs a link there. It doesn't need a new
place to show the command.

Fix:

- The command box of each wizard's last step gets a link "Zum Projekt →" / "Go to the project →" (`#/p/<slug>`). For
  a series, the link reads "Zur Serie →" / "Go to the series →" (`#/s/<slug>`). The link uses the existing copy and
  link styles.
- The music video wizard shows the link in step 6 even before "Setup abschließen". A person who finishes the setup in
  Claude Code (`/new-video` covers lyrics and the song too) can leave the wizard as well.
- UI texts in German and English, like the other wizard texts.

## Acceptance Criteria
- [x] The music video wizard's step 6 links to `#/p/<slug>`, before and after "Setup abschließen".
- [x] The series wizard's last step links to `#/s/<slug>`.
- [x] The episode wizard's command box links to `#/p/<slug>`.
- [x] After the link, the project or series page shows the same Claude Code command the wizard showed, as long as
      that stage is still open (checked in the sandbox from `npm run dev:workspace` for all three kinds).
- [x] The link texts exist in German and English.

## Out of Scope
- Detecting on the board that the Claude Code command has run and leaving the wizard automatically.
- Changing the project or series page's next-step box.

## Open Questions
- none
