# Code review – ST-024: Add a library set by hand
Base: main · Commits: 4 · Date: 2026-11-23

Re-check after `08cca34` ("share the library entry primitives"): only that commit was re-reviewed, against the
first pass of this file. The touched suites are green (`tests/set-library.test.ts` 4/4, `tests/character-library.test.ts`
6/6, `tests/library-set.test.ts`, `tests/runtime-files.test.ts`; 31/31 in one run), `npm run typecheck` is green and
`check-language` reports "Glossary language OK". No event journal exists in this repository (conventions,
"Commands and events"), so the journal and one-transaction criteria still do not apply.

## Resolved since the first pass

| # | Was | Status | Evidence |
|---|---|---|---|
| 1 | major – fourth copy of the library-entry primitives | **resolved** | `packages/cli/src/library-entry.ts:1-48` holds the id (`checkLibraryId`, now built on core `isScriptId` and the 80-char cap), the entry folder and file for `characters`/`sets`, `entryText`, `parseTags` and `slugOfName(name, fallback)`. `set-library.ts:6,15-16` and `character-library.ts:17,36-37,304` import them; the local `ID`, `text`, `parseTags`, `slugOf`, `checkId` copies are gone from both modules, and `character-library.ts:97,280` now use `isScriptId` instead of the private regex. The kind-specific id message is preserved through `KINDS[kind].noun`. `sound-library.ts` keeps its own copies, which the first pass left out of scope (ADR 0051 context). |
| 2 | minor – `libraryRoot`/`entryDir` exported twice with different folders | **resolved** | The set module now exports `setLibraryRoot`/`setEntryDir` (`set-library.ts:14-15`); `index.ts:806` was updated; `character-library.ts` keeps `libraryRoot`/`entryDir`. No caller has to alias anymore. |
| 3 | question – refusal keyed to `set.yaml`, so a non-empty folder is adopted | **settled (option a)** | `idTaken` (`set-library.ts:29-39`) refuses when the entry exists or when the folder holds anything else, and reuses an empty folder left by an interrupted write; `addLibrarySet` uses it at line 57. The new test `refuses a folder with unnamed files, but reuses an empty one` (`tests/set-library.test.ts:44-53`) covers both halves. No question is left open. |
| 4 | minor – `/neon-bar/` did not prove the refusal reason | **resolved** | `tests/set-library.test.ts:39` now matches `/already/`, like `tests/character-library.test.ts:171`. |
| 5 | minor – `toEqual(entry)` compared the module's output with itself | **resolved** | `tests/set-library.test.ts:32` is a literal `toMatchObject` including `added` from the injected clock, `tags: []` and `history: []`. |
| 6 | minor – two scenarios shipped before their tests | **stands** (process, no code action) | Still visible: `ef45ede` and `59a3803` add tests only. Nothing to change in this story; the note is for the next one. |
| 7 | minor – conventions did not name the set library | **resolved** | `docs/engineering/conventions.md`: the library bullet now names `set-library.ts` and `library-entry.ts`, and the seam catalog has a "Set library" row (`addLibrarySet`, temp workspace, `tests/set-library.test.ts`). |

## Findings after the re-check

| # | Severity | Area | File:line | Finding | Source (ADR, rule, glossary, smell) | Suggested direction |
|---|---|---|---|---|---|---|
| 8 | minor | UX / message | packages/cli/src/set-library.ts:57 | The new second refusal branch reuses the message "the library has a set \"<id>\" already". When the folder holds files but no `set.yaml`, no set exists, yet the user is told one does; the only hint that the folder is the problem is the id. Both branches now share this message and `tests/set-library.test.ts:52` matches `/already/`, so nothing pins the branch's meaning either. | Mysterious Name (a message that names the wrong cause); CMD-AddLibrarySet "An id the library already has is refused" (here the id is not the only reason) | Name the real cause in the non-empty-folder branch (for example "the folder library/sets/<id> holds files that no set.yaml names", with the count or the first name), and assert that text in the test. |
| 9 | minor | Design / knowledge in two places | packages/cli/src/library-entry.ts:9 vs 11-14 | `LibraryEntryKind = 'characters' \| 'sets'` is a hand-written union beside the `KINDS` table that lists the same keys, so a third library kind can be added to the table without the type following, and the compiler would not say so. | Repeated knowledge (a small Repeated Switches/primitive variant); the module is the one place a kind is declared | Derive the type from the table (`type LibraryEntryKind = keyof typeof KINDS`) so the keys exist once. |
| 10 | minor | Speculative generality | packages/cli/src/set-library.ts:14 | `setLibraryRoot` is exported but has no consumer (`index.ts` uses `setEntryDir`; nothing else imports it), and it repeats the `'sets'` path segment that `libraryEntryDir(root, 'sets', …)` already builds, so the folder would have to change in two places. | Speculative Generality; Duplicated knowledge | Drop it until ST-025/ST-032 need a root, or build the root from the kind in `library-entry.ts` so the folder segment exists once. |

**ready to merge** — no blocker and no major against an ADR, a domain rule or a scenario; the three minors are judgement calls.
Most important: the second refusal branch tells the user a set already exists when only stray files are in the way (#8).
