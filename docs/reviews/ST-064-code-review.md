# Code review – ST-064: The New chooser offers the library, and a wizard creates or imports characters
Base: marathon/2026-11-28-2 · Commits: 3 · Date: 2026-11-28

Scope: `packages/cli/src/board/character-wizard.js` (new), `wizard.js` (chooser groups, exported `step`), `characters.js`
(inline forms removed, **+ New**), `app.js` (route), `board.css`, the board docs and guides,
`tests/board-character-wizard.test.ts`, `tests/board-characters.test.ts`. No server route changed; the wizard reuses
`/api/library/new`, `/api/upload/library/<id>` and `/api/library/import`. `check-language.ts`: OK.

Security pass (requested): no `innerHTML` with data – the wizard uses `innerHTML = ''` only to clear, and every
user or server value (name, description, transcript, file names, import results, error messages) reaches the DOM through
`el(..., { text })`, a text node, or `setAttribute`. The id in the upload URL and in `libraryFile` goes through
`encodeURIComponent`, and so do the file name and the transcript in the query. `role` is a constant. The `#/new/character/<id>`
route takes only `[a-z0-9][a-z0-9_-]*`, the same pattern as `#/characters/<id>`. `#/characters/<id>` links are built from ids the
server produced, so they cannot become `javascript:` URLs. On file types, the `accept` attribute is only a hint. The server still
decides: `libraryFileTarget` checks the extension per role (`.png .jpg .jpeg .webp` / `.wav`), the role list and
`LIBRARY_FILE_LIMITS.bytes`, `recordLibraryFile` removes the written file on a refusal, and the board answers with
`x-content-type-options: nosniff`. The diff adds no merge blocker.

| # | Severity | Area | File:line | Finding | Source (ADR, rule, glossary, smell) | Suggested direction |
|---|---|---|---|---|---|---|
| 1 | major | Behaviour / retry | packages/cli/src/board/character-wizard.js:136 (`sendFiles`), :175, :195 | A retry sends the files a second time. The file inputs keep their files after a partial failure and after a success. When a sheet and two images are chosen and the second image is refused, **Upload** sends all three again: the sheet and the first image already landed and now come back as `-2` copies (`freeName`), and the second sheet upload moves the first sheet into `refs` (`recordFile`, role `sheet`). A second click after a full success does the same to every file. The story asks that "a failed upload can be retried in its step", not that it duplicates what already landed. | Story "Rejected"; ADR 0034 (an entry's files) | Drop each item from the pending set once its upload resolves, and retry only the rest. Clear the inputs after a full success. Extend the retry test to a multi-file batch where a later file fails. |
| 2 | minor | Test quality | tests/board-character-wizard.test.ts:227, :239 | The "taken name" half of the test depends on `nova-lee` that an earlier `it` created. Run alone (`-t`) or in another order, it fails or passes for the wrong reason. | tdd: tests independent through the interface | Create the clashing entry inside the test, or use a name that only this test creates twice. |
| 3 | minor | Test quality | tests/board-character-wizard.test.ts:212 | The retry scenario covers only a one-file batch. It cannot see finding 1, the behaviour that matters for a retry. | tdd: the test must check the scenario's "Then" | Covered by the direction of finding 1. |
| 4 | minor | Design / Duplicated Code | packages/cli/src/board/character-wizard.js:37-39 | `input`, `field` and `targetLabel` are copies of the same helpers in `characters.js:53-55`. The import `<option>` value repeats `targetValue`. | Smell: Duplicated Code | Export the helpers from one board module (or `lib.js`) and import them. |
| 5 | minor | Design / hidden coupling | packages/cli/src/board/character-wizard.js:8 | The wizard reads strings that `characters.js` registers (`name`, `face`, `faces`, `roles`, `sheet`, `images`, `voice`, `transcript`, `createChar`, `uploading`, `series`, `project`). It works only because it imports `libraryFile` from that module. If that import is removed, the labels go blank and nothing fails. | Smell: Feature Envy / leaking module | Register the strings the wizard needs in its own `addStrings`, or move the shared library labels into one module that both import on purpose. |
| 6 | minor | UX / behaviour | packages/cli/src/board/character-wizard.js:50 | Switching **Create new** → **Import** → **Create new** builds step 1 again and drops what was typed. The story's "keeps what was typed" is about refusals, so this is a judgement call. | Story "Rejected" (spirit) | Build both panes once and toggle which one shows. |
| 7 | minor | UX / domain rule | packages/cli/src/board/character-wizard.js:69 | The server requires the description (`entryText(..., true)`) and the field has `aria-required`, but nothing on screen marks it as required. The story names only the name as required. Users first learn about it from the refusal. | Story step 1; library-entry.ts:395 | Mark the description label as required (in both languages), or confirm with the story that a refusal alone is enough. |

Verdict: ready to merge
Most important finding: #1, a retry or a second click on **Upload** sends files that already landed again, so it duplicates them and moves the sheet into `refs`.
