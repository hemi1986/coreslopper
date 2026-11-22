---
id: ST-022
title: The board shows when it loads and when a button is working
type: chore
ui: true
priority: must
size: null
risk: null
depends_on: []
labels: [board, feature:set-library]
status: done
---

## Task
The board gives no feedback while it waits for the server. A view stays blank or shows the old content until its
data arrives, and a button that sends a request looks the same before and after the click. A person clicks again
and does not know whether anything happens. Seen by the user on 2026-11-22.

Decided in the grilling of feature `set-library` (user, 2026-11-22, round 1 Q9–Q10, round 2 Q8):

- **Loading a view:** while a view loads its data, the main area shows a spinner. It appears only after 200 ms, so
  a fast answer does not flicker. It has no text, only the accessible label "lädt …" / "loading …".
- **A button that sends a request** (a write, a finish, a use, a delete, a form submit) is disabled until the
  answer arrives and shows a small spinner beside its label; the label stays. A double click sends one request.
  After an error the button is enabled again and the error shows where it shows today.
- **Uploads** keep their percentage and get no extra spinner.
- The board does not poll (ADR 0049), so a spinner only follows something the person did.

The board's views live in `packages/cli/src/board/*.js` with the shared helpers `api`, `post` and `upload` in
`lib.js`. One shared helper per case keeps the views from each building their own.

## Acceptance Criteria
- [x] Every view of the board (production, project, series, calendar, characters, wizard, guide, release) shows the spinner in the main area when its data takes longer than 200 ms, and none when it answers faster
- [x] Every button that sends a request is disabled with a spinner until the answer arrives; a double click sends one request (checked with a slowed request in the sandbox)
- [x] After a refused request the button is enabled again and the refusal is shown as before
- [x] Uploads show their percentage as before
- [x] The spinner's label exists in German and English and a screen reader announces it

## Out of Scope
- A spinner for work that runs outside the board's requests (a stage, a render); the production view already shows those states
- Polling or live updates

## Open Questions
- none
