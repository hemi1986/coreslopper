# Code review – ST-058: The board's contact sheet shows each shot's keyframe
Base: marathon/2026-11-28 · Commits: 3 · Date: 2026-11-28

Security pass, summary. **Path traversal:** the slug passes `SLUG.test` and must also match an entry of `projectDirs`
(`release-board.ts:205-208`). `%2e%2e`, `..%2F..` and absolute paths fail both checks and get a 400 or 404. Shot ids only
reach `stat` after `resolveStoryboard` accepted them against `/^shot-[0-9]{3}$/` (`schema.ts:345`), so
`assets/keyframes/<shot>.png` cannot escape the project. The keyframe goes out through the existing `/files/` route, which
has the `PROJECT_FILES` allow-list and the `..`/dot-segment guard. **DOM:** every shot and project field reaches the page
through `el(..., { text })` / `setAttribute`, and the href is built by `projectFile` (`encodeURIComponent` per segment)
plus an encoded `?v=`. Nothing goes through `innerHTML`. **Malformed input:** an unknown or ill-formed slug answers 400
through the shared `ValidationError` path. Any failure inside `contactSheet` turns into a 200 `invalid` body, never a
5xx. The one exception is the shared percent-decoding, finding 1. **Error details:** these are the same `validateProject`
messages the review tab already shows (`board-review.ts:122-129`). They include the absolute project root (for example
"timing.json is missing in /…/projects/x"). The board binds to 127.0.0.1 and has no public page, so this is finding 5,
not a privacy blocker.

Routing pass: the new `#/p/<slug>/contact-sheet` hash is matched before the old-link redirect `#/p/<slug>/([a-z]+)`. The
redirect could not catch it anyway, because of the hyphen. The nav entry stays `project:<slug>`. `viewTabs` gets one tab
added and no callers changed. Removing the SVG embed is clean: `ProductionDetail.contactSheet` and its destructuring in
`productionProject`, and the `contact` UI string in both languages, are all gone. `paths.contactSheet` stays for the
`contact-sheet` CLI command (`index.ts:173-180`), as the story says.

| # | Severity | Area | File:line | Finding | Source (ADR, rule, glossary, smell) | Suggested direction |
|---|---|---|---|---|---|---|
| 1 | blocker | fixed in round 2 (was merge blocker server-error) | packages/cli/src/release-board.ts:447 | `decodeURIComponent(url.pathname)` throws `URIError` on a malformed percent sequence, for example `GET /api/production/projects/%E0/contact-sheet`. The outer catch answers 500 for anything that is not a `ValidationError` (`:540-542`). Any client can send this, and the new route can be reached with it. The bug is older than this story (the line is unchanged), but it sits in the shared routing the new route depends on, and a 5xx on client input is never a judgement call. | Merge blockers: 5xx on input a client can send | Treat a malformed path as invalid input: catch `URIError` around the decode and answer 400 (or throw `ValidationError`). Add one request test with `%E0`. |
| 2 | major | Docs / domain model | docs/domain/events.yaml:2675, :1707; docs/engineering/conventions.md:178-192; docs/domain/gap-register.md:179 | The worker left these unchanged, and they are now wrong. The `RM-ContactSheet` description still calls the SVG "embedded in the production view" its as-is, but the embed is removed and the target is built. The `CMD-WriteContactSheet` rule still says "today an SVG of text cards nobody opens – gap register". The read-model paragraph in conventions lists the board's read models without `board-contact-sheet.ts`, and still names `review/contact-sheet.svg` as a stale derived document under G-70, as if the board relied on it. G-70 is still "Missing" and cites `board-production.ts:314`, which this diff removed. | Traceability: `events.yaml` and the gap register are sources of truth; conventions are binding | Change RM-ContactSheet to as-is = built on read by `contactSheet()` (`board-contact-sheet.ts`), shown in the tab. Drop "today …" from the CMD rule. Add `board-contact-sheet.ts` to the conventions read-model list, and note that the SVG is only the stage's artifact now. Close or narrow G-70 to what is left (the SVG still goes stale). |
| 3 | major | Test quality | tests/board-contact-sheet.test.ts:113 | `expect(production.js source).not.toContain('contact-sheet.svg')` is vacuous: the base version of `production.js` never contained that literal (it used `p.contactSheet`), so the assertion passed before the change. It also checks the source text rather than behaviour. The `productionDetail` assertion on the line before already covers the data side. | tdd: tautological / implementation-coupled | Drop the source-grep. If the view side needs a check, render `showProduction` with the fake DOM, as the tab test does, and assert there is no `img.contact` / no contact-sheet image. |
| 4 | minor | Behaviour / UI text | packages/cli/src/board-contact-sheet.ts:46-48; packages/cli/src/board/contact-sheet.js:49-50 | The catch-all turns every failure of `validateProject` into `status: 'invalid'`, and the tab prefixes it with "The storyboard is not valid:". This includes an invalid `project.yaml`, a budget mismatch, a broken `config/models.yaml`, a missing series canon, or a programming error. The tab then blames the storyboard for something else. | Glossary / UI text accuracy | Keep the conservative 200, but use a neutral prefix ("The storyboard cannot be checked:") or only use the storyboard wording when the error is a `ValidationError`. |
| 5 | minor | Privacy (local board) | packages/cli/src/board-contact-sheet.ts:47 | The tab shows the full `message` plus all `details` of `validateProject`. Messages such as "storyboard.yaml is missing in ${paths.root}" carry the absolute workspace path, and the review tab shows only the first line (`board-review.ts:128`). It is a local board with no public page, so this is not a merge blocker, but it shows more than the board shows elsewhere. | Security criterion 4 (judgement: local-only) | Use the first line, as `shotSpans` does, or make the messages relative to the project. Decide once for both tabs. |
| 6 | minor | Duplicated Code | packages/cli/src/board-contact-sheet.ts:37-48; packages/cli/src/board-review.ts:122-130 | There are now two board adapters doing "validate the project read-only and take the resolved shots, or an error string", each with its own error shaping. Both import `validateProject` on their own. | Smell: Duplicated Code; codebase-design: locality | A deeper module, for example `resolvedShots(projectDir) → { shots } \| { error, details }`, used by both tabs. Naming only, no design here. |
| 7 | minor | Domain fit | packages/cli/src/board-contact-sheet.ts:31-35 | A chained shot never gets `assets/keyframes/<shot>.png`: its start frame is `assets/keyframes/chain/<shot>-start.png` (`queue.ts:380`, HS-73). Its card will say "no keyframe yet" forever. This matches the story text, but the placeholder wording promises something that will not come. | HS-73, glossary **Contact Sheet** ("its keyframe once one exists") | Either show the chain start frame when it exists, or make the placeholder say the shot is chained. The main session decides whether this belongs in this story. |
| 8 | minor | Duplicated Code | packages/cli/src/board-contact-sheet.ts:38 | `join(projectDir, 'storyboard.yaml')` repeats the layout that `projectPaths` already owns. | Smell: Duplicated Code (layout knowledge) | Use the project paths helper (`paths.storyboard`) if one is available without loading the whole project. |

fix blockers first
Most important: the shared `decodeURIComponent` answers 500 on a malformed percent sequence (finding 1, fixed in round 2 (was merge blocker server-error)). It is a one-line fix to answer 400.

## Round 2
Base: marathon/2026-11-28 · Commits: 9 (4 new: 8fd1619, e384fde, ec0b9f0, 4ebdcd5) · Date: 2026-11-28

Fix check. **#1 holds:** `decodeURIComponent` sits in its own try and answers 400 `malformed address` before the
write guard and every route (`release-board.ts:447-453`). The request test on `%E0` pins status and body. Answering
400 before `trustedWrite` on a non-GET is safe, because nothing is written. **#2 holds:** RM-ContactSheet,
CMD-WriteContactSheet, the conventions read-model paragraph and G-70 (closed, the dead `board-production.ts:314`
citation removed) now match the code. **#3 holds:** the source grep is gone. The test now checks that the demo still
has the SVG and that `productionDetail` has no `contactSheet`, so the assertion would have failed on the base. **#4
holds:** `scope` separates the storyboard from the project. A project-level failure (budget mismatch) is tested
end to end and in the tab, with the neutral text "cannot be checked because the project is not valid". **#8
holds:** the path now comes from `projectPaths(projectDir).storyboard`. #5–#7 were left open on purpose, and the
main session decides on them.

Security view of `StoryboardValidationError` (`validate.ts:49-50, 119-133`). It extends `ValidationError` and does not
override `name`, because the base constructor sets `'ValidationError'`. It is rethrown with the same `message` and the
same `details` array. So every `instanceof ValidationError` consumer behaves as before: `printError`
(`utils.ts:7`, the CLI and hook output), the board's 400 mapping (`release-board.ts:547`), `qa.ts:281`, and the review
tab. Only the stack trace changes, and nothing prints it. Non-`ValidationError` failures of `resolveStoryboard` are
rethrown unchanged. `npm test` (1129 passed) and `npm run typecheck` are green, and `check-language.ts` is OK.

| # | Severity | Area | File:line | Finding | Source (ADR, rule, glossary, smell) | Suggested direction |
|---|---|---|---|---|---|---|
| 9 | blocker | fixed in round 3 (was merge blocker server-error) | packages/cli/src/release-board.ts:446 | `new URL(req.url ?? '/', 'http://localhost')`, one line above the #1 fix, is still outside the new guard. It throws `TypeError [ERR_INVALID_URL]` on request targets Node's HTTP parser accepts, for example `GET //[ HTTP/1.1` or the absolute form `GET http://[ HTTP/1.1`. I reproduced this with a raw socket against a plain `http.createServer`. The outer catch answers 500 with "Invalid URL" for any non-`ValidationError` (`:546-548`). The line is older than this story, but it is the same shared address parsing as #1, and every route, including the new one, goes through it. | Merge blockers: 5xx on input a client can send | Put `new URL(...)` inside the same try as the decode, so both answer 400 `malformed address`. Add one request test with `//[` next to the `%E0` test. |
| 10 | minor | Design / Primitive Obsession | packages/cli/src/board-contact-sheet.ts:51 | `scope` is partly inferred by reading the message text: `message.includes(storyboardPath)` catches storyboard.yaml read, YAML and schema failures from `readYamlFile`. This works today, because `loadProject` and `contactSheet` both build the path with `projectPaths`. It breaks silently if the message wording or the path form changes. The scope then turns to `project` without any failing test, because no test covers an unparsable storyboard. | Smell: Primitive Obsession (meaning in a string); codebase-design: locality | Either let the storyboard's load failure carry the same typed marker (`StoryboardValidationError`, or a `file` field on `ValidationError`), or add one test with a storyboard.yaml that does not parse, so the inference is pinned. |

fix blockers first
Most important: `new URL(req.url)` at `release-board.ts:446` still answers 500 on a request target such as `//[` (finding 9, fixed in round 3 (was merge blocker server-error)). It is the same one-line widening of the #1 guard.

## Round 3
Base: marathon/2026-11-28 · Commits: 11 (1 new: d6d9641) · Date: 2026-11-28

Fix check. **#9 holds:** `new URL(req.url ?? '/', 'http://localhost')` now sits in the same inner try as the decode
(`release-board.ts:446-453`), so an address that is no URL and a malformed percent sequence both answer 400
`malformed address` before the write guard and every route. `url` is declared with `let` outside the try. The catch
returns, so the type checker accepts the later reads. The new request test sends `//[` and pins status and body. Node
throws `ERR_INVALID_URL` on that input, so on the parent commit the outer catch answered 500 "Invalid URL" and the test
would have failed. Nothing in the handler runs before the inner try, so no other client-sent address can reach the
500 path through parsing. `tests/board-contact-sheet.test.ts` (11 passed) and `npm run typecheck` are green, and
`check-language.ts` is OK.

No new findings. #5, #6, #7 and #10 (all minor) are still open, and the main session decides on them. No merge
blocker is open.

ready to merge
Most important: #9 is fixed. `new URL` and the decode share one guard, so `//[` answers 400 and no longer 500.
