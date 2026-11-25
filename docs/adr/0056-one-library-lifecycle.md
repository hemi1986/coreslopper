# One library lifecycle for characters and sets

## Status

Proposed — 2026-11-25. From architecture candidate 02 in
[the review](../reviews/architecture-review-2026-11-25.md). Extends [ADR 0034](0034-character-library.md) and
[ADR 0052](0052-set-library.md); the sound library stays its own context ([ADR 0051](0051-memes-and-the-sound-library.md)).

## Context

ADR 0052 made the character library and the set library one bounded context, `BC-Library`, with the same rules.
The code still has two full lifecycles: `character-library.ts` (480 lines) and `set-library.ts` (689 lines) repeat
the path, load/save, list/uses, add/update, file, import, use and remove verbs; `library-entry.ts` holds only the
shared primitives. The copies have already drifted in small ways (a `sheet`/`voice` role vs `angle`/`plate`, a
chosen state vs every plate, an optional vs required prompt), and the sets route resolves its target through the
character module. Both library modules import `projectDirs`/`seriesDirs` from the board's production read model.

## Decision

- **One lifecycle in `library-entry.ts`.** A `defineLibraryKind(config)` returns the lifecycle for a kind. The
  kind's data is the entry file (`character.yaml` / `set.yaml`), its schema, the folder and target keys
  (`characters` / `sets`), its file roles, and its words.
- **The lifecycle owns the shared verbs:** paths, id and text checks, load/save, list/uses/cover, add/update,
  add-file/remove-file, import/use, target kind/target/targets, history and copy rollback.
- **A kind supplies hooks, not a second lifecycle** for what is genuinely its semantics: the import merge
  (character states with the canon's notes vs set plates and plate-id collisions), the use merge (chosen states vs
  every plate, `sets/<id>/plates/`), plate angle/id rules, the voice transcript, and the entry's file-write
  strategy (copy-then-record for characters, stage-then-commit for sets).
- **`character-library.ts` and `set-library.ts` stay as thin kind modules** holding the config and the existing
  exported names, so the CLI, board, wizard, `stage-done`, tests and skills keep their imports.
- **Target resolution leaves the character module.** `projectDirs`, `seriesDirs` and `SLUG` live in
  `workspace-dirs.ts`; `libraryTarget`, `libraryTargets` and `libraryTargetKind` live in `library-entry.ts`. Library
  code no longer imports `board-production.ts`.
- **The board routes share one handler factory** driven by the same descriptor; the public URLs, status codes and
  refusal text stay unchanged. The two browser views may stay separate.
- **The sound library is not part of this lifecycle** (ADR 0051): its entries become takes, not bible entries.

## Consequences

- A third bible library is config and hooks, not a copy of both modules.
- The character and set suites keep their kind-specific tests; one lifecycle suite over a kind fixture and one
  route suite over `boardHandler` add the shared contract.
- `docs/domain/context-map.md` does not change: both libraries already sit in `BC-Library`, and the sound library
  stays `BC-SoundLibrary`.
- The refactor is behavior-preserving; every current test, CLI output and board URL stays the same.

## Alternatives considered

- **Keep two modules and share only primitives.** The parallel verbs and their drift stay; candidate 02's problem.
- **Force states and plates into one generic file group.** States are chosen per story, plates are not; a shared
  group shape would either copy every state or lose the choice.
- **Move the lifecycle into core.** Core owns schemas and pure rules, not workspace file I/O; the lifecycle stays in
  the CLI next to the commands.
