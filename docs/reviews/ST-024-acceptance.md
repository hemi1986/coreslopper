# Acceptance – ST-024: Add a library set by hand
Date: 2026-11-23 · Tests run: `npx vitest run tests/set-library.test.ts` → 4 passed / 0 failed (3 scenarios + 1 invariant test); `npm test` → 850 passed, 2 skipped (opt-in render tests), 0 failed; `npm run typecheck` → green; `node .claude/skills/implement/scripts/verify.ts` → passed · Preview: none

Verified at HEAD `ae5f389` (base `main`, `git diff main...HEAD`). The branch advanced from the named `08cca34` during the re-check: `ae5f389 ST-024: name the taken folder's cause and shrink the entry module` is included, and all runs above were made on that tree. Traceability: `check-scenarios.ts ST-024` → 3/3 scenarios covered, titles identical to the story.

## Scenarios
| Scenario | Test (file) | Given/When/Then really checked? | Result |
|---|---|---|---|
| A set is added by hand | `tests/set-library.test.ts:27` (`ST-024: A set is added by hand`) | **Given** an empty temp workspace (no `library/`). **When** `addLibrarySet` is called with the scenario's three literals and a fixed clock; the project's seam catalog (`docs/engineering/conventions.md`, "Test data and seams", "Set library" row) names exactly this function and file. **Then** the returned entry has id `neon-bar`, the scenario's name/description/prompt, `origin: manual`, `refs: []`, `plates: []`; the entry is read back from `library/sets/neon-bar/set.yaml` and checked against **literals** — including `added: '2026-11-23T10:00:00.000Z'` from the injected clock, `tags: []`, `history: []`; `validateChangedFile` confirms it is a `library set` (id = folder). I also ran `set new` through the real command in a temp workspace root: exit 0, file as above, `tags` parsed, `added` in UTC. | pass |
| A taken id is refused | `tests/set-library.test.ts:36` (`ST-024: A taken id is refused`) | **Given** the first set is really written. **When** the second add uses the same name and the scenario's other literals. **Then** it rejects with `/already/` (the taken-id refusal), `library/sets` contains exactly `['neon-bar']`, and the stored description is still the literal from the first add. The command behaves the same: exit 1, `✖ the library has a set "neon-bar" already`. | pass |
| A set without a prompt is refused | `tests/set-library.test.ts:55` (`ST-024: A set without a prompt is refused`) | **Given** an empty workspace. **When** the add omits the prompt property. **Then** it rejects with `/prompt is required/` and no `library/sets/neon-bar` folder exists (the id check runs before `mkdir`). Through the real command the refusal comes earlier from `--prompt` (`requiredOption`), exit 1, and also creates no folder. | pass |

The extra test `refuses a folder with unnamed files, but reuses an empty one` (`tests/set-library.test.ts:44`) is not a scenario; it pins the new invariant branch described below, including the distinct `/holds files/` refusal.

## Definition of done
| Item | Applies | Evidence | OK? |
|---|---|---|---|
| Usable at the project's design size | no | `ui: false`; CLI command only, no screen | n/a |
| Lists fast with realistic data | no | this story adds no list view (ST-032) | n/a |
| Every command writes its journal entry | no | there is no event journal in this repository (`docs/engineering/conventions.md`, "Commands and events"); the write is the atomic `set.yaml`. `EVT-LibrarySetCreated` exists only in `docs/domain/events.yaml` | n/a |
| Texts from the message catalogs | no | the CLI has no message catalog; messages are inline English (`docs/engineering/conventions.md`, "UI and texts"). New texts are English | n/a |
| No personal data in logs | yes | `set new` prints only `<id> in <relative path>`; nothing from `.env` or user data | yes |
| Critical security advisories of the stack within 48 h | no | the diff changes no dependency or lockfile (10 files: CLI code, tests, story/backlog, review docs, conventions) | n/a |
| AGG-LibrarySet invariants the command can violate | yes | id = folder name (test + `validateChangedFile`); **every file in the folder is named by `set.yaml`** — `idTaken` refuses a non-empty folder without an entry and reuses an empty one left by an interrupted write, covered by the extra test and verified through the command; `update`/`init` never overwrite `library/` (`USER_OWNED_PREFIXES` includes `library/` in `update.ts:46`; `scripts/runtime-files.mjs:90`; `.gitignore` keeps `set.yaml`, ignores the media) | yes |
| Rules of CMD-AddLibrarySet | yes | id from the name in kebab-case (`slugOfName`); taken id refused (`idTaken`); name/description/prompt required (`entryText(..., true)` plus `LibrarySetSchema`); origin `manual` | yes |
| Shared library-entry primitives stay one copy | yes | `packages/cli/src/library-entry.ts` holds the id, folder/file, field text, tags and name→id; the kind type is derived from the kind table; `set-library.ts` and `character-library.ts` both use it, the fourth copy is gone, and `character-library.test.ts` stays green (6/6) | yes |
| Scenario ↔ test traceability | yes | `check-scenarios.ts ST-024` → 3/3 | yes |
| Full gate | yes | `verify.ts` → `✓ verify passed`; typecheck green; full suite green | yes |

## Remarks
- The scenario tests enter at `addLibrarySet`, the function `set new` calls, not at commander; the seam catalog now names this seam explicitly, and the character library has always been tested the same way. I checked the command itself end to end in a temp workspace root (success, duplicate, non-empty folder with the distinct message, missing `--prompt`), so the option wiring is verified but not automated.
- `--prompt` is a `requiredOption` and a domain rule; scenario 3's "prompt is missing" therefore never reaches the domain error through the CLI. Both refuse and neither writes a folder, so the observable outcome holds.
- The re-check's code-review minors are settled in `ae5f389`: the non-empty-folder branch names its own cause and the extra test matches `/holds files/`; `LibraryEntryKind` derives from the `KINDS` table; the unused root export is gone.
- `verify.ts` reports the repository map as stale (`runtime/`, `scripts/pose`); both predate this story (build output and ADR 0054), advisory only.

## Edge cases not covered by the story
| Case | Expected by a rule? (cite) | Recommendation |
|---|---|---|
| Two `set new` runs at the same moment for the same name: both pass `idTaken`, the second `writeTextAtomic` overwrites the entry | "An id the library already has is refused" (CMD-AddLibrarySet); library writes are atomic but unlocked — known gap G-130 (`docs/engineering/conventions.md`) | question (G-130 covers the whole library, not this story) |
| A name with no letters or digits (`"✨"`) gets the fallback id `set` | none in the story; `slugOfName(name, 'set')` | question |
| A name over 200 characters, or description/prompt over 4000: refused by a cap the story never states | none in the story; `entryText` caps | question (state the limits or accept them) |
| `--tags` is in the Context but no scenario tests it; a comma-separated list lands in `tags` | Context names the option only | question (my manual run confirms the parsing) |
| `library/sets/<id>` exists as a **plain file**: `idTaken` calls `readdir` on it and the command exits with a raw `ENOTDIR` error, not the library message | none; defensive-filesystem case | question (rare, fix if cheap) |
| A hidden OS file (for example `.DS_Store`) in `library/sets/<id>/` counts as an unnamed file and refuses the id | invariant "every file in the entry's folder is named by set.yaml" → refusing is correct | no action; the extra test already documents the stray-file rule |
| Different names that slug to one id ("Neon Bar", "neon bar!", "Neon-Bar") | id comes from the name and a taken id is refused → refused, as intended | no test needed |
| Adding an id that an imported entry already holds (origin not `manual`) | same taken-id rule; import arrives in ST-026 | works by design, no gap |
| Library "belongs to the user": a hand-edited `set.yaml` stays tracked, its media ignored | ADR 0052 / invariant; `.gitignore` + `update.ts` verified | covered by ST-023's evidence |

Verdict: **accepted with remarks** — all three scenarios have a test that checks their Given/When/Then, every test passes, traceability, typecheck and the gate are green, and the story's rules and the aggregate invariants the command can violate hold (the folder invariant is now enforced and tested). The remarks are test-seam and edge-case questions; none is a violated rule or a scenario without a real test.
