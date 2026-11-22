# Acceptance – ST-009: Validate a meme's script with library sounds
Date: 2026-11-22 · Tests run: `npm test -- -t "ST-009"` → 4 passed; full `npm test` → 753 passed, 2 skipped, 0 failed; `npm run typecheck` clean · Preview: none

## Scenarios
| Scenario | Test (file) | Given/When/Then really checked? | Result |
|---|---|---|---|
| A script with a library sound passes | `ST-009: A script with a library sound passes` (tests/meme-script.test.ts) | Given: library `{ 'vine-boom': 1.4 }` and a script with sound line "reveal-boom" naming it. When: `validateScript` with a meme canon. Then: no throw, and `knownLineSeconds` gives 1.4 (literal). The When is the validation function, not the hook; the hook is covered in a separate test (workspace hook, real library file with trim 0..1.4). | pass |
| A sound line with both a sound and a prompt is refused | `ST-009: A sound line with both a sound and a prompt is refused` | Given: sound "vine-boom" and prompt "a deep boom". Then: exactly one issue matching "names a library sound or a prompt, not both" for "reveal-boom". | pass |
| An unknown library sound is refused | `ST-009: An unknown library sound is refused` | Given library without "air-horn"; Then: exactly one issue "there is no library sound "air-horn"". | pass |
| Known lengths over 30 seconds are refused | `ST-009: Known lengths over 30 seconds are refused` | Given: 1.4 + 0.6 + 30 + 2 = 34 s, built from pauses, a pause_after and sound lines. Then: issue matches "a meme lasts at most 30 seconds" and "34 s" (literal). | pass |

Traceability: `check-scenarios.ts ST-009` reports 4/4 covered. Extra tests cover the no-duration rule for a library sound, HS-262 (ids only without bibles, bible check once they exist), episodes refusing library sounds, and the hook on a real meme project.

## Definition of done
| Item | Applies | Evidence | OK? |
|---|---|---|---|
| Rules from the context (one-of sound/prompt, no duration on a library sound, speakers/sets, strictly sequential lines, 30 s) | yes | `validateScript` in packages/core/src/episode.ts; overlap rule (`with`) unchanged and still checked | OK |
| Entry points (hook, `validate`, `episode-track`, `voice-track`) use the new canon | yes | validate-file.ts, validate.ts, episode-track.ts, voice-track.ts call `scriptCanon` | OK |
| Episodes' scripts unchanged | yes | full suite green; episode rejects `sound` lines | OK |
| Schema regenerated | yes | schema/script.schema.json changed | OK |
| Docs (data-model, pipeline, workspace/AGENTS.md) | yes | updated in the diff | OK |
| Journal entry per command | partly | EVT-ScriptValidated is a check without state change; the existing validate-file path writes no journal and this story does not change that | OK (no regression) |
| Texts / UI / performance / personal data | n/a (no UI, no logs of personal data; issue texts are validation messages in English like the existing ones) | – | OK |

## Edge cases not covered by the story
| Case | Expected by a rule? | Recommendation |
|---|---|---|
| Sound line with neither sound nor prompt | Implied by "exactly one of the two"; implemented ("needs a library sound or a prompt") | covered in code; no test of its own, fine |
| A broken library sound entry (unreadable sound.yaml) | Not in story; loader fails with its own message | question, low |
| `voice-track` refuses a library-sound line with a message to import a take manually | Out of this story (ST-011 copies the sound) | deliberate, noted in the code |
| 30 s limit exactly (30.0) passes; tolerance 1e-9 | Rule says "at most 30" | ok |
| Spoken lines not counted toward 30 s | Context states it (HS-264) | ok |
| Library sound with a trim: length from trim end-start | Context says "from the sound's trim" | ok |

Verdict: accepted
