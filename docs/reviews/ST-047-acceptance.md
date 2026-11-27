# Acceptance – ST-047: The release package records whether an episode is a short episode
Date: 2026-11-27 · Tests run: `npx vitest run tests/release-shape.test.ts` → 8 passed, 0 failed; `npm run typecheck` green · Preview: none

## Scenarios
| Scenario | Test (file) | Given/When/Then really checked? | Result |
|---|---|---|---|
| A vertical episode of 170 seconds is a short episode | tests/release-shape.test.ts | Given: episode fixture, master 9:16 (1080x1920), timing duration 170. When: `buildRelease` (the release entry). Then: literal "short-episode" in the result and in manifest.json on disk. | OK |
| A 4:5 episode of exactly 180 seconds is a short episode | tests/release-shape.test.ts | 4:5 master (1080x1350), 180 s boundary; "short-episode" asserted on disk and in the result. | OK |
| A vertical episode of 181 seconds is an episode | tests/release-shape.test.ts | 9:16, 181 s; "episode" asserted from manifest.json on disk. | OK |
| A horizontal episode of 120 seconds is an episode | tests/release-shape.test.ts | 16:9, 120 s; "episode" asserted from manifest.json on disk. | OK |

Traceability: `check-scenarios.ts ST-047` → 4/4 covered. Extra tests cover the 1:1 case, a missing track length, music-video and meme taking their kind, and the manifest without a shape.

## Definition of done
| Item | Applies | Evidence | OK? |
|---|---|---|---|
| Manifest records `shape`; old manifest reads as its project kind | yes | `ReleaseShapeSchema`, optional `shape`, `manifestShape`; `schema/release-manifest.schema.json` regenerated | OK |
| Nothing in series.yaml or project.yaml sets it | yes | `releaseShape` derives from kind, master size and track length only | OK |
| Glossary and ADR | yes | glossary has "Release Shape"; ADR 0057 exists | OK |
| Journal entry, UI, performance, message catalogs, personal data | no | Derivation only; no new command, text, UI or logging | n/a |
| Typecheck | yes | green | OK |

## Edge cases not covered by the story
| Case | Expected by a rule? (cite) | Recommendation |
|---|---|---|
| Episode without a built timing (no track length) | Story: "the length is the built episode track's"; the code records "episode" (tested) | question: should a missing track be a TODO? Acceptable as is |
| Master wider than tall by pixels but declared aspect differs from width/height | Rule uses width/height, not the aspect label | question |
| Manifest from a changed shape after done mark or live URL (HS-268) | Separate rule in events.yaml, not in this story | question: belongs to a later story |
| Malformed project or timing input | Handled by existing schema validation, no new input path | none |

No merge blockers found: the change adds no input path, query or authorization surface.

Verdict: accepted
