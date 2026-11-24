# Code review – ST-027: The sets of a finished set bible go into the library by themselves

Base: main (fdbfc79) · Commits: 5 · Date: 2026-11-24

Checks run: `npm test` → 876 passed / 2 skipped; `npm run typecheck` → green;
`npx vitest run tests/set-library.test.ts` → 30/30 green; `check-language` → “Glossary language OK”;
story linter and scenario traceability → green (3/3); `git diff --check` → clean. The three scenario tests use
the public CLI seam on a temp workspace. The command diff also received a second failure-path pass. There are no
open questions.

## Findings

| # | Severity | Area | File:line | Finding | Source (ADR, rule, glossary, smell) | Suggested direction |
|---|---|---|---|---|---|---|
| 1 | blocker | Command failure policy | packages/cli/src/index.ts:979-985 | The warning guard starts only after `await import('./set-library.js')`. If loading the library module rejects (for example, an incomplete or corrupt runtime installation), the rejection escapes to `run`, which sets `process.exitCode = 1` (`packages/cli/src/utils.ts:28-34`). The stage has already been persisted as done at `index.ts:968`, but the command now fails and the orchestrator can mark it failed. That violates the explicit rule that a finished-bible library import only warns and never fails the stage. The character block at `index.ts:972-977` has the same guard placement. | ADR 0052 (sets enter where characters do); ST-027 Context and POL-ImportFinishedSets (“A failed import only warns; it never fails the stage”) | Put the dynamic import, root resolution, `importSets` call and printing inside the same `try`. Apply the same warning-only guard to the character import for parity. |
| 2 | major | Test quality / failure path | tests/set-library.test.ts:517-528 | The “failed import” fixture names only a missing plate. `importSets` handles that without throwing: it returns a skipped result at `packages/cli/src/set-library.ts:236-239`. The test therefore checks the missing-file reporter, but never enters the command's catch at `index.ts:983`; it would still pass if that catch were removed. The broader story rule for a rejected import is unpinned. | ADR 0052; ST-027 Context / POL-ImportFinishedSets; tdd skill (the test must exercise the behaviour it claims to protect) | Keep the scenario test and add a command-seam regression that makes `importSets` reject (for example malformed `sets.yaml` or an unwritable library destination), then assert exit 0, stage done, and a warning naming the set library failure. |
| 3 | minor | Skill documentation / stage outputs | workspace/.claude/skills/character-bible/SKILL.md:32 | This line now says `stage-done` imports the project's sets, but still records only `--outputs style.yaml,characters.yaml`. When a set bible was written, `sets.yaml` is omitted from the stage's recorded outputs. The style-bible skill already says to add `sets.yaml` when written (`workspace/.claude/skills/style-bible/SKILL.md:36`). | ADR 0043 (“The set bible is an output of style-character”); HS-129 resolution in `docs/domain/events.yaml:3480-3484` (both skills' stage-done lines must include it) | Make the command conditional, as the style-bible skill does: use `--outputs style.yaml,characters.yaml,sets.yaml` when `sets.yaml` exists, otherwise omit it. |
| 4 | minor | Test quality / unchanged library | tests/set-library.test.ts:530-542 | The no-set-bible test snapshots `set.yaml` and the list of set ids, but not the existing entry's media. `libraryBar` creates `counter.png`; an erroneous import could overwrite or add media inside `library/sets/bar` while leaving both assertions green. The scenario says the set library is unchanged, which includes its files. | ADR 0052 (the library and its media belong to the user); ST-027 scenario “A music video without a set bible takes nothing in”; tdd skill | Snapshot the whole `bar` entry (directory names and file bytes, including `counter.png`) before and after, or hash every file in the entry and compare. |

**fix blockers first** – 1 blocker, 1 major, 2 minors; no questions.
Most important: the dynamic set-library import sits outside the warning-only guard, so a module-load failure exits nonzero after the stage has already been saved as done.

## Resolutions

| # | Resolution | Where |
|---|---|---|
| 1 | **fixed** – the dynamic import, root resolution, import call and printing for both characters and sets now sit inside the warning-only `try`; a module-load failure cannot change the saved stage into a failed command. | `packages/cli/src/index.ts:971-988` |
| 2 | **fixed** – a command-seam regression makes the library destination invalid so `importSets` rejects, then asserts exit 0, the stage remains done, and stderr names the set-library failure. | `tests/set-library.test.ts:530-543` |
| 3 | **fixed** – the character-bible skill says to append `sets.yaml` to the recorded outputs when the project has a set bible. | `workspace/.claude/skills/character-bible/SKILL.md:32` |
| 4 | **fixed** – the no-set-bible scenario now compares the entry YAML, every entry filename, and the existing image bytes before and after `stage-done`. | `tests/set-library.test.ts:545-561` |
