# Acceptance – ST-057: The board's project list with search, filters and series grouping
Date: 2026-11-28 · Tests run: `npx vitest run tests/board-projects.test.ts` → 12 passed; `npm test` → 1102 passed, 2 skipped, 0 failed; typecheck clean · Preview: none

Type task: the acceptance criteria are checklist items, not scenarios (`check-scenarios`: 0/0, traceability OK). Evidence per item below.

## Scenarios (checklist items)
| Item | Test (file) | Really checked? | Result |
|---|---|---|---|
| Every project and series, newest activity first | `tests/board-projects.test.ts` "shows every project and series of a fixture workspace…" | Fixture workspace with real `createProject`/`createSeries`, file mtimes set, real `productionOverview`; order asserted as literals (cat, neon, old, drift), kinds, first row, column headers | OK |
| Search "NACHT" finds title and slug match | "searches title and slug case-insensitively while typing" | Literal `NACHT` yields `nachtschicht-e01` and `nachtschicht`; typing through the input updates the hash and keeps the field | OK |
| Series filter with 3 episodes shows exactly those 3 | "shows exactly the 3 episodes of a series…" | `series=drift` returns exactly 3 slugs | OK |
| Grouping: episodes under the series, planned ones as planned, hidden with a search | "groups each episode under its series…" | Full row order asserted, indent only on episodes, `q=e0` and `status=yours` hide planned rows | OK |
| `#/projects?series=<slug>&group=series` restores after reload | "restores the series filter and the grouping…" | Opens the address; select value, checkbox and rows asserted; unknown values ignored; hash round trip | OK |
| No match text and Reset filters | "says when no project matches…" | Text, empty table, click on Reset, hash is `#/projects`, grouping and chip cleared | OK |
| No projects: text and link to the wizard | "says "No projects yet" with a link to the wizard…" | Text, the only link is `#/new`, no table | OK |
| Unreadable project is a row with its error | "shows an unreadable project as a row with its error" | Error text asserted; also found by search, excluded by the kind filter | OK |
| Further Task bullets (columns, sort, "or"/"and", Released rule, row click) | "shows per row…", "sorts by a column header…", "filters by kind and state…", "toggles a kind filter…" | Literals for cells, sort hash, filter combinations, row click navigates | OK |

Two items rely on a fake DOM (no DOM library in the repo, same approach as `board-nav.test.ts`), not on a browser. I accept that for this repo. The German strings are not covered by a test (see edge cases).

## Definition of done
| Item | Applies | Evidence | OK? |
|---|---|---|---|
| Usable at the design size, desktop | yes | Full-width table, CSS in `board.css`. No visual check (no preview). | OK, not verified in a browser |
| Lists fast with realistic data | yes | Search redraws only the result block; client-side filtering of one list | OK |
| Texts from the message catalogs | yes | All texts via `addStrings` (de and en) in `projects.js`; no literal UI text | OK |
| Reads only, no journal entry | yes | Only `GET /api/production` and `/api/projects`; no write | OK |
| Domain language | yes | "Projects" / "Projekte" matches the glossary (_Avoid_: catalogue, overview) | OK |
| Docs: `docs/board.md` and both guides | yes | All three have a new section; the German one is complete | OK |
| Screenshots of the board guides | see remark | The story's Task requires only that the guides "describe the list". No criterion asks for a new screenshot. The existing `production.webp` shows the production view and is not made stale by this change. | OK (minor below) |
| No personal data in logs, security advisories | n/a | No logging, no dependency change | n/a |
| Merge blockers: 5xx / crash on input, injection, rule bypass | yes | Hash input goes through `URLSearchParams` and a whitelist. `q` is set as a value and as text, never as HTML; series slug is checked against known series. Unknown `kind`, `status`, `sort` or `dir` are ignored (tested). Series, project and error text is set via text nodes. Case and space variants of the search only filter. | none found |

## Edge cases not covered by the story
| Case | Expected by a rule? (cite) | Recommendation |
|---|---|---|
| German UI: no test renders the list with `de` (Veröffentlicht rule, "geplant", "Folge 1 · Drift") | Context: both languages, G-rules on catalogs | question (minor) |
| `series=<slug>` of a series that was deleted or errored is dropped silently, so the user sees an unfiltered list with no hint | "Unknown values in the hash are ignored" | question |
| Series row with an episode count only, lastActivity taken from its episodes (a series without episodes sorts last) | not specified | question |
| A series filter combined with `kind=series` shows nothing (the series row is not an episode) | "Serie: <name> shows only that series' episodes" | no change, as written |
| Timezone: `Released` uses the browser's date for "release day past" while the old group may have used the server's | Task: "rule of the old Released group" | question |

## Minors (conventions and diff check)
1. German column header "Veröffentlichung" (`plCols.release`) vs "Release-Tag" in the German guide (and the existing guide wording). One term should be used in both.
2. No new board-guide screenshot of the list: not required by the story, so only a remark. If the guide should show the list later, that is a decision for the user.
3. `projects.js` adds the strings into the module itself with `addStrings`, as other board modules do – consistent, no deviation. The shared page frame (`#main`, `lib.js` helpers `el`, `api`, `go`) is used; no deviation found.
4. Test fixture creates its workspace from `config`, `templates` and `brand` only, not `projects/demo*`, so the git-ignored render leak (memory note) does not apply.

## Verdict
accepted with remarks

Findings: blocker 0, major 0, minor 2 (German header term; no new screenshot, not required), question 4. Merge blockers: 0.
