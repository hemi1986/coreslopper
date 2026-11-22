# Acceptance – ST-002: Edit a library sound's description
Date: 2026-11-22 · Tests run: `npx vitest run tests/sound-library.test.ts` → 13 passed, 0 failed (4 ST-002 tests + 2 extra edit tests) · Preview: none (CLI run by hand in a scratch workspace)

## Scenarios
| Scenario | Test (file) | Given/When/Then really checked? | Result |
|---|---|---|---|
| The use when and the tags are changed | `tests/sound-library.test.ts` | Given: real tone added via `addLibrarySound`. When: `updateLibrarySound` (the function behind `sound edit`, not the CLI parser). Then: literals "a shocking twist", `['reveal','shock']`, re-read from disk; the file hash equals the hash before. Yes. | pass |
| An empty use when is refused | same | Refusal is a `SoundRefused` matching /needs a use when/ (a whitespace-only value is used); the stored use when is re-read and is "a dramatic reveal". Yes. | pass |
| A cue outside the trim is refused | same | Given: 1.4 s sound with trim 0.0-1.0. When: cue 1.2. Then: refused with reason `outside` and /cue 1.2 lies outside the trim/; the stored cue stays unset. Yes. | pass |
| The length cannot be typed | same | Given: 1.4 s sound. When: length "3". Then: refused with /length is measured from the file/; the stored length is still about 1.4. Yes. | pass |

Traceability: `check-scenarios.ts ST-002` → 4/4 covered. By hand through the real CLI (`sound edit`) I got the same outcomes: the cue 1.2 is refused, `--length 3` is refused, an empty `--use-when` is refused, and the use when plus tags edit succeeds and writes sound.yaml. The CLI refusals exit with code 1.

## Definition of done
| Item | Applies | Evidence | OK? |
|---|---|---|---|
| Invariants of AGG-LibrarySound the command can violate (title/use when non-empty, length/loudness not typed, cue/trim inside length, cue inside trim) | yes | Code in `updateLibrarySound`. Extra test covers an empty title, loudness, an unknown id and clearing optional fields. Cue-inside-trim and trim-inside-length are checked by the CLI run. | yes |
| File unchanged, metadata only | yes | Hash asserted in scenario 1. | yes |
| Refused edit leaves the entry as it was | yes | Validation runs before `writeSound`; asserted in scenarios 2 and 3. | yes |
| Journal entry per command | n/a | `conventions.md` says there is no event journal. | n/a |
| Texts from message catalogs | n/a | CLI texts in English, like `sound add`; no catalog applies to the CLI. | n/a |
| Design size / list speed | n/a | `ui: false`, no list. | n/a |
| No personal data in logs | yes | Messages contain only id, title and use when. | yes |
| Stale takes after a trim or cue change (POL-TakeChosenLibrarySounds) | no | Belongs to ST-011. | n/a |

## Edge cases not covered by the story
| Case | Expected by a rule? | Recommendation |
|---|---|---|
| Trim with end before start (`--trim 0.5-0.4`) is refused, but the message says "lies outside the sound's length of 1.4 s", which misleads | no | question: wording only, not blocking |
| `--tags ""` or an empty `--cue` clears the value (a documented "empty clears" convention in the CLI help, but not in the story) | no | question: confirm that clearing is wanted |
| Shrinking the trim so that an existing cue falls outside is refused (checked together with the stored cue) | yes (the invariant "cue inside the trim") | none |
| Concurrent edits of the same sound.yaml (read-modify-write, last writer wins) | no | question |
| Hand edit of sound.yaml | covered by ST-005 | none |
| `--length` and `--loudness` are hidden options, so they do not show in `--help`, but are still refused with a clear message | yes | none |

## Verdict
accepted with remarks. All 4 scenarios have a real test, all pass, and the CLI behaves as the story says. The only remarks are the two questions above (the trim wording, and the undocumented clearing convention).
