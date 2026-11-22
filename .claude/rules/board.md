---
paths:
  - "packages/cli/src/release-board.ts"
  - "packages/cli/src/board/index.html"
  - "packages/cli/src/board/app.js"
  - "packages/cli/src/board/lib.js"
  - "packages/cli/src/board/board.css"
  - "tests/board-shell-characterization.test.ts"
  - "docs/board.md"
---

# Board shell (BC-Board)

> Concept slice across the board's server (`release-board.ts`), the `board` command and the page's shell modules.
> Adopted 2026-11-22. Decided by recommendation plus four answers from the user. The model is in
> `docs/domain/events.yaml` (`BC-Board`, no aggregate), the decisions in ADR 0049 (proposed, amends 0030), and gaps
> G-207–G-218 in `docs/domain/gap-register.md`.

## Purpose

The board is the workspace's local page. Its shell hosts the board views of the other contexts behind one
navigation:
- it starts the server (`board`, alias `release-board`; `--host`, `--port`, `--watch`);
- it routes requests and addresses, and serves the page and the whitelisted files;
- it guards every write and chooses the language.

It owns no state. Every write goes to the module of the context that owns it.

## Key terms

Board, Board View, Board Navigation, Write Guard, Activity. All are in `docs/glossary.md`. "Release board" is the
release view only. "Page", "screen" and "sidebar" are not terms; "tab" is only the switch between a project's views.

## As-is boundary

- `boardHandler` (`packages/cli/src/release-board.ts`) is one request handler, kept apart from `startBoard` so tests
  call it directly. The order is:
  - `trustedWrite` for every request that is not a GET;
  - the page (`/`, `/board/<lower-case>.js|css`) and the guide view's docs (`/docs/…`);
  - production and activity, review, the library, the wizard, the files, the channel, then the release routes,
    the calendar, `/calendar.ics` and `/media`;
  - 404 for anything else.
- Errors: a `ValidationError` is 400, anything else 500, both as `{ error }` with the message.
- File serving goes through `serveMedia`: `nosniff`, a sandboxing CSP, and single byte ranges.
  - Whitelists: `PROJECT_FILES`, `SERIES_FILES`, `PAGE_FILE`, `DOC_FILE` (the guide view's top-level docs and
    `docs/assets/` images).
  - `/media` checks only that the path stays inside the release folder.
- Two sets of projects. `projectDirs`/`seriesDirs` (every project and series) serve production, review, files and
  the wizard. `boardProjectDirs` (a release folder or a calendar) serves the release routes and `/media`, and the
  autopilot reads it too.
- The page (`packages/cli/src/board/`) is static ES modules with no build step:
  - `app.js` holds the hash routes, the navigation and the user's refresh (no poll, ADR 0049);
  - `guide.js` shows a page of the workspace's `docs/` with its own small markdown renderer, built as DOM nodes;
  - `lib.js` holds the DOM helper, `api`/`post`/`upload`, the string tables (`addStrings`/`t`/`setLang`), dates,
    and a project's tabs;
  - each view registers its own strings.

## Boundaries

- The shell never writes a workspace file itself. A new write goes into the owning context's module and is reached
  through a route, behind the write guard.
- Every new route that is not a GET passes `trustedWrite`. Uploads use `/api/upload/…` with a raw
  `application/octet-stream` body.
- Never serve `project.yaml`, `state.json`, a dot file or a path outside its folder. A served file never runs a script.
- The board listens on the loopback. `--host 0.0.0.0` is for the container only, whose port is published on the
  loopback.
- The release view speaks the project's language and every other view the browser's. Do not add a third language.
- The views (`production.js`, `review.js`, `release.js`, `wizard.js`, `characters.js`) and their server modules
  belong to their own slices (`.claude/rules/pipeline.md`, `review.md`, `release.md`, `publish.md`, `character.md`).

## Typical pitfalls

- Do not bring back a poll or a timer that redraws a view: the user refreshes by hand. A refresh keeps a view with a
  playing video or a field marked `data-edited` (`app.js` `busy`).
- Reads answer any `Host`, so a rebinding page can read unreleased renders (G-209, medium). Writes are guarded.
- `/media` serves dot files (G-210).
- A malformed body or address is a 500, an unknown slug a 400 (G-211). `--watch` is checked after the server listens.
- `serveMedia`'s read stream has no error handler, and a reversed range is a 416 (G-212).
- The refresh queue runs one refresh per change (G-213).
- Routes are half inline, half delegated, and the file is named `release-board` (G-214).
- The page has no CSP of its own (G-215). Server errors are English only (G-216).
- A route placed after the 404 fallthrough never answers. A new page file must match `PAGE_FILE`.

## Read next

- `docs/glossary.md` (the board terms), `docs/adr/0030-board-as-hub.md`, `docs/adr/0031-watchdog-and-board-container.md`,
  `docs/adr/0049-board-shell.md`
- `docs/board.md`; `tests/board-production.test.ts`, `tests/release-autopilot.test.ts` (the write guard),
  `tests/board-shell-characterization.test.ts`
