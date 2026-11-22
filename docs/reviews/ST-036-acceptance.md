# Acceptance – ST-036: An internal project gets no release package
Date: 2026-11-22 · Tests run: `npx vitest run tests/release-internal.test.ts` → 3 passed, 0 failed; `npx vitest run -t release` → 62 passed; `npm run typecheck` green · Preview: none

## Scenarios
| Scenario | Test (file) | Given/When/Then really checked? | Result |
|---|---|---|---|
| An internal project builds no release folder | tests/release-internal.test.ts | Given: fixture with `distribution: internal` written into project.yaml. When: `runRelease`, the real CLI entry (index.ts calls it). Then: no `renders/release`, output contains "not released publicly" (literals). "Renders current" comes from the shared fixture, not asserted separately. | pass |
| An internal project plans no release calendar | tests/release-internal.test.ts | Given: internal project plus a second project's calendar on disk. Then: internal project has no `review/calendar.yaml`; the other calendar is byte-identical to what was written. | pass |
| A project without distribution is released publicly | tests/release-internal.test.ts | Given: field removed from project.yaml. Then: `renders/release/manifest.json` exists. | pass |

check-scenarios: 3/3 covered.

## Definition of done
| Item | Applies | Evidence | OK? |
|---|---|---|---|
| Real entry point, no journal change | yes | `runRelease` short-circuits before `buildRelease`; the story adds no domain event | OK |
| Exit 0 | yes | `runRelease` returns undefined, no throw; the test would fail on a throw | OK |
| Schema regenerated | yes | `schema/project.schema.json` has `distribution` enum | OK |
| Docs and glossary | yes | glossary "Distribution", architecture.md updated | OK |
| Board quick refresh skips internal projects | yes | `quickRelease` guard in release-board.ts (no test, but the guard is trivial) | OK |
| UX, performance, logs with personal data | no | no UI, no lists | n/a |

## Edge cases not covered by the story
| Case | Expected by a rule? | Recommendation |
|---|---|---|
| `buildRelease` called directly on an internal project throws a ValidationError (only `runRelease` and the board skip quietly) | Not in the story; no other caller exists today | question: fine as defence in depth |
| Quick refresh skip on the board has no test | No scenario requires it | question: optional |
| Invalid value such as `distribution: private` | Schema enum rejects it at load | none |
| `qa-export` / `/video-next` on an internal project: the story says it "stays green", which holds for `release` only; QA without release checks is ST-037 | Story Context assigns this to ST-037 | question: confirm in ST-037 |
| Existing release folder or calendar left as is | Yes, Out of Scope | none |

## Verdict
accepted
