# Code review – ST-057: The board's project list with search, filters and series grouping
Base: marathon/2026-11-28 · Commits: 3 · Date: 2026-11-28

Scope: `packages/cli/src/board/projects.js`, `board.css`, `tests/board-projects.test.ts`, `docs/board.md`, both board
guides. `tests/board-projects.test.ts` passes (12 tests). `check-language.ts`: Glossary language OK.

**Security pass (hash values and project fields reaching the DOM): clean.** Every value goes through `el()`
(`lib.js:19`), which writes `textContent`, `setAttribute` or `createTextNode`. `innerHTML` is only ever set to `''`.
`q` reaches only `input.value` and the substring match. `kind`, `status`, `sort` and `dir` are checked against fixed
lists, and `series` against the slugs that exist (`parseListState`). The class name `'pl-' + item.state` comes from
the fixed `STATES`. The only `<a href>` is the constant `#/new`. A row's target is `'#/p/' + slug` or `'#/s/' + slug`,
set through `location.hash`, so a `javascript:` URL is not possible. `listHash` encodes `q` and `series` with
`encodeURIComponent`. No attribute injection and no unescaped HTML.

**Hash-state pass.** `replaceState` updates the current history entry. It fires no `hashchange`, so the search field
keeps its focus. Back from `#/p/<slug>` traverses to the replaced entry and fires `hashchange`, so `route()` →
`showProjects()` rebuilds the list from the address. The refresh guard works: the search, the select and the checkbox
stop `input` from bubbling (`quiet`), so `main` does not get `data-edited`, and a refresh redraws from the address.
The findings below are the gaps.

| # | Severity | Area | File:line | Finding | Source (ADR, rule, glossary, smell) | Suggested direction |
|---|---|---|---|---|---|---|
| 1 | blocker | fixed in round 2 (was merge blocker server-error) | packages/cli/src/board/app.js:35 (reached through projects.js `listHash`/`showProjects`) | `route()` runs `decodeURIComponent` on the whole hash. A pasted or hand-edited link with a stray `%`, such as `#/projects?q=100%`, throws `URIError`. On `hashchange` the exception goes uncaught and the view never changes. On reload, `loadNav().then(route)` rejects and the main area stays empty. The line is older than this story (2026-11-21), but ST-057 is the first route that puts free text in the hash and promises that "a pasted link restore[s] them. Unknown values in the hash are ignored". A related case: a decoded `%0A` or `%E2%80%A8` in `q` defeats `/^#\/projects(?:\?.*)?$/` (`.` does not match line terminators), so the link silently opens Production. | Crash on input a client can send. Story Task: "Reload, Back and a pasted link restore them. Unknown values in the hash are ignored". ADR 0058 ("a link keep[s] them") | Conservative fix: in `route()`, wrap the decode in `try`/`catch` and fall back to the raw `location.hash`. `showProjects` already reads the raw hash, and `URLSearchParams` is lenient. Match the projects route with `/^#\/projects(?:\?[\s\S]*)?$/`, or test the raw hash for `#/projects`. Add a test with `#/projects?q=100%`. |
| 2 | minor | Bug (hash state / UI) | packages/cli/src/board/projects.js:224, :244 | **Filter zurücksetzen / Reset filters** in the filter bar exists only after a full `draw()`. Typing a search redraws only the results (`setState(…, false)`), so when the search is the only filter, the reset button does not appear. Once the field is cleared and a chip is clicked, the button state is correct again. | Story Task ("offers Reset filters"); smell: state kept in two drawing paths | Keep the bar's reset button in a slot that `drawResults` also updates, or always render it and disable it while `anyFilter` is false. |
| 3 | minor | Bug (count) | packages/cli/src/board/projects.js:307-308 | "n of N": in the grouped view, `shown` counts series head rows that are shown only because their episodes match. With `group=series&q=e0`, it counts `drift` and `fog`, although neither matches the search. | Smell: Mysterious Name (the count means different things flat and grouped) | Count the rows whose item `matches` the state, or count only the matching items (`hit.length`). |
| 4 | minor | Test quality | tests/board-projects.test.ts:192 | The **Released** rule (`isReleased`, moved from the old `nav.js`, G-208) is tested only through "done and every release event ticked off" (3/3). Two branches have no test: "release day past" (`releaseDate < today`) and "internal and done" (`next.reason === 'internal-done'`). A wrong comparison or an inverted date would pass. | tdd: a scenario's "Then" checked only in part. Story Task ("Veröffentlicht uses the rule of the old Released group") | Add two fixture rows: a done project with a past release day and 0/3, and an internal done project. Assert `status=released`. Use a literal `today` (already injectable through `listItems`). |
| 5 | minor | Test seam | tests/board-projects.test.ts:1-60 | The test drives the page module with a fake `document`, `location`, `history` and `fetch`. Its precedent is `board-nav.test.ts`, but the seam catalog in `docs/engineering/conventions.md` has no row for a board page module. Rows exist only for the board's HTTP API and the server read models. The exported pure functions (`parseListState`, `listHash`, `listItems`, `listRows`) are a good seam, and the DOM part is fine as the second seam. | tdd: "Test only at pre-agreed seams". conventions.md seam catalog | Add a catalog row such as "Board page view – its exported pure functions plus a fake document (`board-nav.test.ts`, `board-projects.test.ts`)" so the next view does not have to decide again. |
| 6 | minor | Speculative Generality | packages/cli/src/board/projects.js:195-196 | The fallback `else location.hash = hash` covers browsers without `history.replaceState`, which the board does not support (desktop only, ADR 0058). The fallback would also break the focus behaviour the comment promises, because it fires `hashchange` → `route()` → a full redraw on every keystroke. | Smell: Speculative Generality | Call `history.replaceState` unconditionally. The test stub provides it. |
| 7 | minor | Design (locality) | packages/cli/src/board/projects.js:77-88 | The kind/state classification of `RM-ProjectCatalogue` lives in the browser module: `isReleased`, `projectState`, and the join of `/api/production` with `/api/projects`. The production view (`production.js:203`) groups by `next.reason` on its own, so the meaning of "your turn / running / done / released" now has two client copies besides the server's `projectNextAction`. This is in line with the story ("no new server route is needed"). | codebase-design: locality. conventions.md "Read models – pure functions over loaded files" | No change in this story. If a third view needs the state, move the classification into the server read model (`board-production.ts`) as one field. |

Verdict: fix blockers first
Most important: the router's `decodeURIComponent` crashes on a pasted `#/projects?…` link with a stray `%` (finding 1). It is a one-line `try`/`catch` in `app.js:35` plus a test.

## Round 2
Base: marathon/2026-11-28 · Commits: 7 (fixes in 1ba82d3, 6acf488) · Date: 2026-11-28

`tests/board-projects.test.ts` and `tests/board-nav.test.ts` pass (21 tests). `check-language.ts`: Glossary language OK.

**Round 1 status.**
- **#1 (merge blocker, server-error): fixed.** `route()` now calls `decodedHash` (`lib.js:100`). It returns the raw
  hash when `decodeURIComponent` throws, so `#/projects?q=100%` no longer raises `URIError`, both on `hashchange` and
  in `loadNav().then(route)`. `PROJECTS_ROUTE` (`projects.js:37`) uses `[\s\S]*`, so a decoded `%0A`, U+2028 or
  U+2029 still matches. `showProjects` reads the raw `location.hash`, and `URLSearchParams` keeps a stray `%` as text
  (`q` = `100%`, as the test confirms). A raw hash with a stray `%` on any other route falls through to Production or
  fails the route's own `[a-z0-9-]` pattern, but nothing throws. `#/p/<slug>/doc/<path>` with a stray `%` gets the
  still-encoded path, and `showDocument` checks it against the server's document list (`production.js:329`), so
  this opens nothing new.
- **#2: fixed.** `view.reset` is a slot in the bar that `drawResults` fills on every redraw, the search-only redraw
  included. A test covers it.
- **#3: fixed.** A series head row now counts only when `match` (the row matches the filters itself) is true. The
  literal `4 of 11` holds both flat and grouped for `q=e0`.
- **#4: fixed.** The release-day-past branch (`2026-11-27 < 2026-11-28`), the boundary (`2026-11-28` is not past) and
  the `internal-done` branch have literal fixtures.
- **#5: fixed.** `conventions.md` now has the "Board page view" row in the seam catalog.
- **#6, #7:** skipped on purpose. Both were minor judgement calls, so this round does not count them as open.

**Security pass over the whole diff (hash → DOM): clean.** Nothing changed since round 1. The new `view.reset` slot
is built with `el()`. `q`, raw or decoded, reaches only `input.value`, `textContent` and an `indexOf` match (no
`RegExp` is built from it). `innerHTML` is only set to `''`.

| # | Severity | Area | File:line | Finding | Source (ADR, rule, glossary, smell) | Suggested direction |
|---|---|---|---|---|---|---|
| 8 | minor | Test quality | tests/board-projects.test.ts:229-241 | The regression test for #1 calls `decodedHash` and `PROJECTS_ROUTE` itself and then opens the view through `showProjects`. It never runs `route()`. If `app.js` went back to `decodeURIComponent` or its own `.*` regex, the test would still pass. That is the line that crashed in round 1. The reason is that `app.js` runs side effects on import (`hashchange` listener, `loadNav().then(route)`). | tdd: the scenario's "Then" (a pasted link opens) checked only through its parts | Accept as is, or let the test read `app.js` as text and assert that it uses `decodedHash(` and `PROJECTS_ROUTE`. Exporting a pure `routeOf(hash)` would be a deeper seam, but it goes beyond this story. |

Verdict: ready to merge
Most important: the round-1 merge blocker (#1, a stray `%` crashing `route()`) is fixed. The only new finding is the minor #8: the regression test does not go through `route()` itself.
