# Acceptance – ST-068: A demo production is not released
Date: 2026-11-28 · Tests run: `npx vitest run -t "ST-068"` → 4 passed, 0 failed (1210 skipped); `npm run typecheck` green; `check-scenarios.ts ST-068` 4/4 covered · Preview: none

## Scenarios
| Scenario | Test (file) | Given/When/Then really checked? | Result |
|---|---|---|---|
| A demo cannot be approved | tests/release-autopilot.test.ts | Given: demo flag set, release built, calendar proposes 2026-12-04. When: `approveRelease` (the real entry). Then: rejects with "demo production"; project.yaml and release-status.json byte-identical, no approval. Literals from the scenario. | pass |
| A demo's release day is free for another release | tests/release-internal.test.ts | Given: sibling calendar with `demo: true` on 2026-12-04. When: the public project's calendar is planned. Then: release_date is "2026-12-04" (literal). The companion test shows a demo still gets its package and its own calendar. | pass |
| The autopilot leaves a demo alone | tests/release-autopilot.test.ts | Given: approval made before the demo flag (a demo cannot be approved), event due. When: autopilot round. Then: log entries empty, no post call, output line contains "demo production", `autopilotOverview` plan has no event. All asserted. | pass |
| A public project is still approved and posted | tests/release-autopilot.test.ts | Given: public project with a demo sibling, proposed 2026-12-04. When: `approveRelease`. Then: approval and project.yaml release day are "2026-12-04". The title says "and posted", but the Then lines only cover the approval, so this is as the story is written. | pass |

## Definition of done
| Item | Applies | Evidence | OK? |
|---|---|---|---|
| One predicate for "released publicly" | yes | `releasedPublicly` = `getsReleasePackage` and not demo; the release package, qa, status and board paths keep `getsReleasePackage`, so a demo still gets its package | OK |
| Every command's rules in events.yaml covered | yes | the three commands' demo rules are implemented at release-autopilot.ts:74, 233, 506 and release-calendar.ts:58 | OK |
| Journal entry / no write on refusal | yes | the refusal comes before any write (test compares files) | OK |
| Texts from message catalogs | n/a | CLI log wording, one function `notReleasedPublicly` | OK |
| No personal data in logs | yes | the log line has only the slug | OK |
| Docs | yes | docs/onboarding.md updated | OK |
| Design size, list performance | n/a | no UI | n/a |

## Edge cases not covered by the story
| Case | Expected by a rule? (cite) | Recommendation |
|---|---|---|
| A project that is both demo and internal gets the "internal" wording | no | question (harmless) |
| A demo with an old approval on disk: the board approve route and `release-run` end in the same refusal or skip | covered by the same predicate | none |
| A demo whose project.yaml is unreadable counts as public in `otherCalendars` | existing documented behaviour (release-calendar.ts doc) | question |
| Board calendar and /calendar.ics show the demo | Out of scope, ST-069 | none |

No malformed-input, authorization or injection path was added: the only new input is the boolean `demo`, which is schema-validated.

Merge blockers: 0.

Verdict: accepted
