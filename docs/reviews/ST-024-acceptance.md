# Acceptance – ST-024: Add a library set by hand
Date: 2026-11-23 · Tests run: `npx vitest run tests/set-library.test.ts` → 3 passed / 0 failed; `npm test` → 849 passed, 2 skipped (opt-in render tests), 0 failed; `node .claude/skills/implement/scripts/verify.ts` → passed; `npm run typecheck` → green · Preview: none

Traceability: `check-scenarios.ts ST-024` → 3/3 scenarios covered, titles identical to the story.

## Scenarios
| Scenario | Test (file) | Given/When/Then really checked? | Result |
|---|---|---|---|
| A set is added by hand | `tests/set-library.test.ts:27` (`ST-024: A set is added by hand`) | **Given** an empty temp workspace (no `library/`). **When** `addLibrarySet` is called with the scenario's three literals; the project's seam catalog (`docs/engineering/conventions.md`, "Command") allows the command *or the function it calls* here, as the character library is tested. **Then** the returned entry has id `neon-bar`, the name/description/prompt from the scenario, `origin: manual`, `refs: []`, `plates: []`; the entry is read back from `library/sets/neon-bar/set.yaml` and equals it; `validateChangedFile` confirms the file is a `library set` (id = folder). I also ran `set new --name "Neon Bar" --description … --prompt …` by hand in a temp workspace root: exit 0, file as above, `tags` parsed, `added` in UTC. | pass |
| A taken id is refused | `tests/set-library.test.ts:36` (`ST-024: A taken id is refused`) | **Given** the first set is really written. **When** the second add uses the same name and the scenario's other literals. **Then** the call rejects with a message naming `neon-bar`, `library/sets` contains exactly `['neon-bar']`, and the first entry's description is unchanged — so the refusal left no trace. | pass |
| A set without a prompt is refused | `tests/set-library.test.ts:44` (`ST-024: A set without a prompt is refused`) | **Given** an empty workspace. **When** the add omits the prompt property. **Then** it rejects with `/prompt is required/` and no `library/sets/neon-bar` folder exists (the id is checked before the folder is created). Through the real command the refusal happens earlier, at `--prompt` (`requiredOption`), exit 1, and still creates no folder. | pass |

## Definition of done
| Item | Applies | Evidence | OK? |
|---|---|---|---|
| Usable at the project's design size | no | `ui: false`; CLI command only, no screen | n/a |
| Lists fast with realistic data | no | this story adds no list view (ST-032) | n/a |
| Every command writes its journal entry | no | there is no event journal in this repository (`docs/engineering/conventions.md`, "Commands and events"); the write is the atomic `set.yaml`. `EVT-LibrarySetCreated` exists only in `docs/domain/events.yaml` | n/a |
| Texts from the message catalogs | no | the CLI has no message catalog; messages are inline English (`docs/engineering/conventions.md`, "UI and texts"). New texts are English | n/a |
| No personal data in logs | yes | `set new` prints only `<id> in <relative path>`; nothing from `.env` or user data | yes |
| Critical security advisories of the stack within 48 h | no | the diff changes no dependency or lockfile (`git diff main...HEAD`: 3 files, code + test + CLI wiring) | n/a |
| AGG-LibrarySet invariants the command can violate | yes | id = folder name (test + `validateChangedFile`); every named file is a plain file of the folder (no files yet, ST-025); `update`/`init` never overwrite `library/` (`USER_OWNED_PREFIXES = ['projects/', 'series/', 'library/', …]` in `update.ts:46`; `library/` in `scripts/runtime-files.mjs:90`; `.gitignore` keeps `set.yaml` and ignores the media) | yes |
| Rules of CMD-AddLibrarySet | yes | id from the name in kebab-case (`slugOf`); taken id refused; name/description/prompt required (`text(..., true)` plus `LibrarySetSchema`); origin `manual` | yes |
| Scenario ↔ test traceability | yes | `check-scenarios.ts ST-024` → 3/3 | yes |
| Full gate | yes | `verify.ts` → `✓ verify passed`; typecheck green; full suite green | yes |

## Remarks
- The three tests enter at `addLibrarySet`, the function `set new` calls, not at commander. The project's seam catalog explicitly names "the CLI command **or the function it calls**" for a command and the character library is tested the same way, so this is within the project's own rules; the CLI wiring (`--name`, `--description`, `--prompt`, `--tags`) is only checked by my manual run, not automated. Worth a CLI-level test in this story if the team wants parity with `sound-library.test.ts`, but not a rule violation.
- `--prompt` is a `requiredOption` *and* the domain rule; scenario 3's "prompt is missing" therefore never reaches the domain error through the CLI. Both refuse and neither writes a folder, so the observable outcome still holds.
- `verify.ts` reports the repository map as stale (`runtime/`, `scripts/pose`); both predate this story (build output and ADR 0054), advisory only.

## Edge cases not covered by the story
| Case | Expected by a rule? (cite) | Recommendation |
|---|---|---|
| Two `set new` runs at the same moment for the same name: both `existsSync` pass, the second `writeTextAtomic` overwrites the entry | "An id the library already has is refused" (CMD-AddLibrarySet); library writes are atomic but unlocked — known gap G-130 (`docs/engineering/conventions.md`) | question (G-130 covers the whole library, not this story) |
| A name with no letters or digits (`"✨"`) silently gets the id `set` | none in the story; code fallback `\|\| 'set'` | question |
| A name over 200 characters, or description/prompt over 4000: refused by a cap the story never states | none in the story; `text()` caps | question (state the limits or accept them) |
| An existing `library/sets/<id>/` folder with stray files but no `set.yaml`: `set new` adds the entry beside them | invariant "every file in the entry's folder is named by set.yaml" (AGG-LibrarySet) | question |
| `--tags` is in the Context but no scenario tests it; an empty `--tags ""` yields `tags: []` | Context names the option only | question |
| Different names that slug to one id ("Neon Bar", "neon bar!", "Neon-Bar") | id comes from the name and a taken id is refused → refused, as intended | no test needed |
| Adding an id that an imported entry already holds (origin not `manual`) | same taken-id rule; import arrives in ST-026 | works by design, no gap |
| Library "belongs to the user": a hand-edited `set.yaml` stays tracked, its media ignored | ADR 0052 / invariant; `.gitignore` + `update.ts` verified | covered by ST-023's evidence |

Verdict: **accepted with remarks** — all three scenarios have a test that checks their Given/When/Then, every test passes, traceability and the gate are green, and the story's rules and the aggregate invariants the command can violate hold. The remarks are test-seam and edge-case questions, not gaps a rule requires.
