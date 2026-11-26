---
status: accepted
date: 2026-11-25
---

# One library lifecycle for characters and sets

## Status

Accepted — 2026-11-25. From architecture candidate 02 in
[the review](../reviews/architecture-review-2026-11-25.md). Extends [ADR 0034](0034-character-library.md) and
[ADR 0052](0052-set-library.md); the sound library stays its own context ([ADR 0051](0051-memes-and-the-sound-library.md)).
Implemented in cuts 0–5 on 2026-11-25 (commits `07140b0`, `e132af5`, `060dfbe`, `d3a53d1`); the user accepted it on
2026-11-25.

## Context

ADR 0052 made the character library and the set library one bounded context, `BC-Library`, with the same rules.
The code still has two full lifecycles: `character-library.ts` (480 lines) and `set-library.ts` (689 lines) repeat
the path, load/save, list/uses, add/update, file, import, use and remove verbs; `library-entry.ts` holds only the
shared primitives. The copies have already drifted in small ways (a `sheet`/`voice` role vs `angle`/`plate`, a
chosen state vs every plate, an optional vs required prompt), and the sets route resolves its target through the
character module. Both library modules import `projectDirs`/`seriesDirs` from the board's production read model.

These line counts and pairs are the before state; cuts 0–5 (see Implementation) collapsed them into the lifecycle
below.

## Decision

- **One lifecycle in `library-entry.ts`.** `defineLibraryKind(config)` returns the lifecycle for a kind. The
  kind's data is the entry file (`character.yaml` / `set.yaml`), its schema, the folder and target keys
  (`characters` / `sets`), its file roles, and its words.
- **The lifecycle owns the shared verbs:** paths, id and text checks, load/save, list/uses/cover, add/update,
  add-file/remove-file, import/use, target kind/target/targets, history and copy rollback.
- **A kind supplies hooks, not a second lifecycle** for what is genuinely its semantics: the import merge
  (character states with the canon's notes vs set plates and plate-id collisions), the use merge (chosen states vs
  every plate, `sets/<id>/plates/`), plate angle/id rules, the voice transcript, and the entry's file-write
  strategy (copy-then-record for characters, stage-then-commit for sets).
- **`character-library.ts` and `set-library.ts` stay as thin kind modules** holding the config, the hooks and the
  existing exported names, so the CLI, board, wizard, `stage-done`, tests and skills keep their imports.
- **Target resolution leaves the character module.** `projectDirs`, `seriesDirs` and `SLUG` live in
  `workspace-dirs.ts`; `libraryTarget`, `libraryTargets` and `libraryTargetKind` live in `library-entry.ts`. Library
  code no longer imports `board-production.ts`.
- **The board routes share one handler factory** in `release-board.ts`. `libraryRoutes(spec)` serves both URL
  families (`/api/library` + `/library-files/` and `/api/sets` + `/set-files/`) from one flow, driven by the kind's
  lifecycle descriptor and one spec per kind for the words where they genuinely differ; the public URLs, status
  codes and refusal text stay unchanged.
- **The two browser views stay separate.** `board/characters.js` and `board/sets.js` are not part of this decision;
  deduplicating them is a later candidate, not a second lifecycle.
- **The sound library is not part of this lifecycle** (ADR 0051): its entries become takes, not bible entries.

## Implementation

Cuts 0–5 landed on 2026-11-25 without changing behavior. The existing character and set suites stay the behavior
oracle; the new suites add the shared contract. `npm run typecheck` and the full `npm test` pass (963 passed,
2 skipped), and the sound library, `board/characters.js` and `board/sets.js` are untouched.

- `07140b0` — `workspace-dirs.ts` owns `SLUG`, `projectDirs` and `seriesDirs` (`board-production.ts` re-exports
  them); `defineLibraryKind` owns load/save/list/uses, target resolution and the manual add/update/file/remove verbs
  with one staged-copy path.
- `e132af5` — `importFrom` and `useIn` move into the lifecycle; a kind supplies its import reader, match rule and
  merge, and its use plan, row and merge.
- `060dfbe` — `libraryRoutes(spec)` in `release-board.ts` serves both URL families from the shared flow and two kind
  specs.
- `d3a53d1` — `tests/helpers/library-fixture.ts` (`LibraryKindFixture`, `describeLibraryLifecycle`),
  `tests/library-lifecycle.test.ts` and `tests/library-routes.test.ts` run the same scenarios for both kinds.

Files: `packages/cli/src/library-entry.ts` (931 lines with the lifecycle and the shared file primitives),
`character-library.ts` (375) and `set-library.ts` (495) as data and hooks, `workspace-dirs.ts`, and
`release-board.ts` with the route factory. No library module imports `board-production.ts`.

## Consequences

- A third bible library is config and hooks, not a copy of both modules.
- The suites exist: the kind-specific character and set suites stay, and `tests/library-lifecycle.test.ts` (over
  `describeLibraryLifecycle` and `tests/helpers/library-fixture.ts`) plus `tests/library-routes.test.ts` (over
  `boardHandler`) run the shared contract for both kinds.
- `docs/domain/context-map.md` does not change: both libraries already sit in `BC-Library`, and the sound library
  stays `BC-SoundLibrary`.
- The refactor is behavior-preserving; every current test, CLI output and board URL stays the same.
- The two browser views stay separate files; sharing their identical lines is an open follow-up candidate of its own,
  not part of this decision.

## Alternatives considered

- **Keep two modules and share only primitives.** The parallel verbs and their drift stay; candidate 02's problem.
- **Force states and plates into one generic file group.** States are chosen per story, plates are not; a shared
  group shape would either copy every state or lose the choice.
- **Move the lifecycle into core.** Core owns schemas and pure rules, not workspace file I/O; the lifecycle stays in
  the CLI next to the commands.
