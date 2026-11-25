# The board's shell: a host without state, a manual refresh, guarded reads

## Status

Accepted — 2026-11-22; accepted by the user on 2026-11-25. Amends [ADR 0030](0030-board-as-hub.md). The adoption of
the board shell recovered it from the code and four questions about how the board is used.

## Context

ADR 0030 made the board the workspace's hub. Its shell is `packages/cli/src/release-board.ts` and the static modules
`index.html`, `app.js`, `lib.js` and `board.css`. ADR 0031 to 0034 then added the activity, review rounds, the wizard
and the character library, each as routes in the same handler. The sources now disagree:
- **The refresh.** ADR 0030 has the page refresh itself while it is visible, and `app.js` polls every 10 s. The user
  has not tried it, finds it annoying and bad while typing, and a manual refresh is enough for them.
- **Reads.** The write guard of ADR 0029/0030 needs a loopback `Host` for a write, but reads answer any `Host`. A web
  page in the browser that rebinds its own domain to 127.0.0.1 can read projects, lyrics and unreleased renders. The
  user opens the board only on the computer it runs on.
- **The release folder.** ADR 0030 promises a whitelist and never a dot file. `/files` keeps that promise, but
  `/media` serves any file under the release folder.
- **Status codes.** A malformed JSON body or address is a 500. An unknown project is a 400. A wrong `--watch` stops the
  board after it started.
- **Structure.** Routes for production, review, release and the autopilot are inline in the handler. The wizard and the
  library have their own route functions. The server file is named for one of its views. ADR 0030 lists five page
  modules; there are eight.
- **The page.** Served files carry a sandboxing content security policy. The page itself carries none.

The user keeps the language rule: the browser's language, and the project's in the release view. They expect the
navigation to become unclear as projects accumulate.

See `docs/domain/adoption-report.md`, the board shell slice.

## Decision

- **The board is a host without state.** The shell routes, serves, guards and chooses the language. Every write goes to
  the module of the context that owns it. A view's routes live in that view's module, as for the wizard and the
  library. The server file is named for the board, and `release-board` stays only as an alias of the command.
- **The user refreshes the board.** The page no longer polls. A refresh button reloads the navigation and the current
  view. A refresh never restarts a playing video and never discards what the user is typing.
- **Every request needs a loopback `Host`, reads too.** The write guard stays as it is: the board's own origin, and a
  JSON body or a raw upload. The container keeps publishing its port on the loopback only.
- **The release folder follows the dot-file rule** of a project's files. A served file never runs a script.
- **The page has its own content security policy:** only its own scripts and styles, and the board's files.
- **Status codes:** malformed input is 400, an unknown project, series or file is 404, an error of the board is 500.
  `--watch` is checked before the server listens. A read error while a file is sent ends that one response, and an
  invalid byte range is ignored.
- **The navigation can fold away** finished and released projects once the list grows. A series keeps its episodes
  under it.

## Consequences

- `docs/board.md` ("refreshes itself every ten seconds"), `docs/engineering/conventions.md` and the server's comments
  change with the refresh. ADR 0030 stays accepted; this ADR amends its refresh, its module list and the reach of its
  whitelist.
- Without polling, a stage that finishes in Claude Code shows on the board only after the user refreshes. The
  watchdog's activity still records it.
- The gaps G-207 to G-218 in `docs/domain/gap-register.md` carry the work. None of it is a story yet.

## Alternatives considered

- **Keep polling and pause it while a form has focus.** The data refreshes by itself, but the board stays busy in the
  background. The user does not need it, so the simpler page wins.
- **Push updates (server-sent events).** Live without polling, but the board would need to watch files and hold
  connections, which is more than a page of cards and tables needs.
- **Let the board listen on the home network** for a phone. The user does not use it that way, and one approval posts
  a release in public. The loopback stays.
