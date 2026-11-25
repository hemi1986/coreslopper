# Code review – ST-042: An internal project cannot be approved
Base: main · Commits: 5 · Date: 2026-11-24

Checks run at HEAD `0471605`: `npx vitest run tests/release-autopilot.test.ts` → 23/23 green;
`npx vitest run tests/release-folder.test.ts` → 48/48 green; `npx tsc --noEmit` → exit 0;
`check-language.ts` → "Glossary language OK"; `check-scenarios.ts ST-042` → 3/3 scenarios with exact titles;
`lint-story.ts` → green.

Where the rule lives: the guard (`packages/cli/src/release-autopilot.ts:70-76`) runs at the top of
`approveRelease`, before `loadCalendar`, the date check, `setReleaseDate`, `runCalendar` and `writeStatus`. So the
refusal precedes every write and `project.yaml`, `review/calendar.yaml` and `review/release-status.json` are untouched
— the regression the story names is gone. Both entry points reach the same function: the board's
`POST /api/projects/:slug/approve` (`release-board.ts:547-559`) and `release-approve <project>`
(`index.ts:415-431`). The board's top-level catch turns the `ValidationError` into a 400 with the message
(`release-board.ts:600-603`); the CLI's `run()` prints `✖ …` and sets exit code 1 (`utils.ts:28-35`). The message is
`notReleasedPublicly(project.config.slug)` + `: it is never approved.`, so it contains the scenario's "not released
publicly". `releasedPublicly`/`notReleasedPublicly` are the same core predicates used by `release`, `release-calendar`,
`status`, `qa`, `board-production` and `release-board`; no second definition of "internal" and no new cross-module edge.

The three scenarios are covered at the agreed command seam and genuinely check their *Then*: scenario 1 pins
`release.release_date` absent in `project.yaml` and the calendar still `{release_date: '2026-12-04', proposed: true}`
(a guard placed after `setReleaseDate` would leave the day behind and fail), scenario 2 pins no approval, scenario 3
pins the public path. The story's prose docs (glossary **Distribution**, `docs/architecture.md`, `docs/pipeline.md`,
`docs/publishing.md`, shipped `workspace/AGENTS.md`) are updated consistently, and `events.yaml` already carries the
CMD-ApproveRelease rule.

| # | Severity | Area | File:line | Finding | Source (ADR, rule, glossary, smell) | Suggested direction |
|---|---|---|---|---|---|---|
| 1 | major | Design / failure surface | `packages/cli/src/release-autopilot.ts:73` (guard `:71-76`) | The guard reads the whole project (`loadProject`) to get one field, `distribution`. `loadProject` loads state (and migrates it), `timing.json` + `timing.overrides.json`, merges and asserts the timing (`timing.ts:62-97,164`), and reads storyboard, style, characters and sets; for an episode it requires the series canon (`project.ts:275-280`). `approveRelease` previously needed only the calendar and the status. A **public** project with a broken/unreadable timing, storyboard or state (or an episode whose `series.yaml` is missing) now fails approval with an unrelated message, and an **internal** episode with a missing series canon throws the series error before the guard can report "not released publicly" — a wording the scenario names. The conventions note this fragility as G-54 ("a broken timing breaks every command" that loads the project); the approval does not need to join that set. | codebase-design: a module's interface should require only what it uses; conventions.md:105-107 (loadProject asserts timing on every load, G-54); scenario 3 ("A public project is still approved") and the "not released publicly" wording. Counterpoint: conventions.md:52 names `loadProject` as the command entry; `release.ts` and `release-calendar.ts` use it because they need more than the config. | Read only the config, as the sibling internal check does: `readYamlFile(join(projectRoot, 'project.yaml'), ProjectConfigSchema)` (the file already imports `ProjectConfigSchema`; `release-calendar.ts:61` uses exactly this). Then the refusal depends on `distribution` alone and the public path keeps its old failure surface. |
| 2 | minor | Documentation – stale line references | `docs/domain/events.yaml:490,1116,1132,1137,1142,2139,2141,2142,2149`; `docs/domain/context-map.as-is.md:395`; `docs/domain/gap-register.md:399,407,410` | The six guard lines and the new import shift every line below the function. The domain artifacts still cite the pre-story ranges: `approveRelease` is `70-91` now (cited `66-82`/`66-89`/`66-98`), `setReleaseDate` is `101-108` (cited `74-76,91-98`), `revokeApproval` is `93-98` (cited `84-89`), the date check is `81-83` (cited `70-72`), the internal reason is `71-76` (cited `66-73`). Several were already slightly stale on `main`, so this is worsening drift rather than a regression; still, the story documents the same command and leaves the references it touches further off. | conventions.md:5 ("When code and this file disagree, raise it – don't silently follow either"). | Refresh the references to `approveRelease`, `setReleaseDate`, `revokeApproval` (and the guard) in `events.yaml`, `context-map.as-is.md` and the gap-register rows, or drop exact line numbers from the descriptions so they cannot drift. |

Bug-focused pass over the diff (no further findings):

- **Ordering vs writes:** correct. The guard is the first statement of `approveRelease`; `setReleaseDate` (`:101-108`), `runCalendar` (`release-calendar.ts:157-173`) and `writeStatus` (`:56-63`) are all after it, so an internal project cannot reach a write. The scenario-1 test would fail if the guard moved below `setReleaseDate`.
- **Board route:** `boardProjectDirs` includes an internal project when it has an earlier calendar (`release-board.ts:81-88`), so the approve route resolves the dir and `approveRelease` throws; the catch (`:600-603`) returns 400 `{error}` and `scheduleRefresh` (`:557`) is skipped because the throw precedes it. The hidden release tab (ST-037) is out of scope and unchanged.
- **CLI:** `run()` catches and prints the message with exit code 1; `--revoke` is unaffected (withdrawing an approval given before the project became internal is explicitly out of scope).
- **Public path:** the predicate is false only for `distribution: internal` (`DistributionSchema = ['public','internal']`, `schema.ts:44`), so unset and `public` pass; scenario 3 and the older `approveRelease` tests stay green.
- **Time / locks / security:** no `new Date()` added (`options.now` unchanged); no personal data or internal IDs in the message beyond the project slug; no CSRF change — the board's `trustedWrite` is untouched. The guard is a read outside the release lock; a concurrent flip to `internal` between the guard and the write is still theoretically possible, but that is the pre-existing multi-step approval gap (HS-174/G-161), not this story.
- **Scope:** nothing of ST-037 (button) or of withdrawing an earlier approval leaked in; `docs/stories/BACKLOG.md` and the story's `status: in-progress` are bookkeeping.

Working-tree state (not in `main...HEAD`): `packages/cli/src/release-autopilot.ts` carries an uncommitted edit that
already replaces `loadProject` with `readYamlFile(join(projectRoot, 'project.yaml'), ProjectConfigSchema)` — exactly
finding 1's direction. On that working tree the autopilot tests are 23/23 green and `tsc --noEmit` exits 0. If the
edit is committed, finding 1 is resolved (and the references in finding 2 shift by one more line). This review is
written against `0471605` (`main...HEAD`), per the brief.

Verdict: **ready to merge** — 0 blockers, 1 major, 1 minor (the major is already fixed in the working tree).
Most important: the guard reads the entire project to obtain `distribution`; the config-only read already present in the working tree keeps a public project's approval from failing on an unrelated broken artifact and keeps the internal refusal's exact wording.
