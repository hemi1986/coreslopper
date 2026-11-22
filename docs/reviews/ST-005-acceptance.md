# Acceptance – ST-005: Validate a hand-edited sound entry
Date: 2026-11-22 · Tests run: `npx vitest run tests/sound-library.test.ts` → 21 passed, 0 failed · Preview: none
Traceability: `check-scenarios.ts ST-005` → 4/4 scenarios covered.

## Scenarios
| Scenario | Test (file) | Given/When/Then really checked? | Result |
|---|---|---|---|
| A valid hand edit passes | tests/sound-library.test.ts | Given: folder vine-boom with sound.wav and entry; When: save with tags reveal,shock, through `validateChangedFile` (the hook's CLI entry); Then: passes (returns 'library sound'). Yes | OK |
| An id that is not the folder name is refused | same | id "boom" saved; asserts message "the id must be the folder name "vine-boom"". Yes | OK |
| A missing file is refused | same | sound.wav removed, entry saved (matches revised scenario 3: no file named in the yaml); asserts `sound.wav does not exist`. Yes | OK |
| An empty title is refused | same | title '' saved; asserts "a library sound needs a title". Yes | OK |

## Definition of done
| Item | Applies | Evidence | OK? |
|---|---|---|---|
| Hook blocks a failing edit (Context) | yes | validate-artifacts.mjs tracks sound.yaml in library/sounds/<id>/ only, runs `validate-file`, exit 2. Manual run with a bad entry: exit 2 with reasons. No automated test covers the hook itself (same as character.yaml) | OK (remark) |
| Hook ignores a sound.yaml outside library/sounds | yes | early exit in hook; not tested | OK (remark) |
| Journal entry | n/a | validation is a read-only check; no state written | OK |
| Messages from catalog | n/a | CLI error text like the other validators; the repo has no UI catalog for this | OK |
| No personal data in logs | yes | messages contain only id/folder name | OK |
| Other invariants (cue/trim inside length, use when) | yes | schema; test "refuses a cue outside the sound and an empty use when" | OK |
| UX/perf | n/a | no UI, one file | OK |

## Edge cases not covered by the story
| Case | Expected by a rule? | Recommendation |
|---|---|---|
| Hook behaviour itself (block on sound.yaml, skip elsewhere) has no automated test | Story Context names it | question: optional; character.yaml has none either |
| Trim outside length / cue outside trim | Invariant in Context | covered by schema; only the cue case is tested; no action |
| Folder name that is not a valid ScriptId | none | question |
| sound.wav present but empty/not a real WAV (test uses 'RIFF') | story says only "exists" | no action |
| A syntactically broken YAML | none | covered by readYamlFile; no action |

Verdict: accepted with remarks (remarks: hook wiring verified manually only, not by a test).
