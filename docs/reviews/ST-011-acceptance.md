# Acceptance – ST-011: The voice track takes library sounds into a meme
Date: 2026-11-22 · Tests run: `npx vitest run tests/meme-voice-track.test.ts` → 4 passed, 0 failed (ffmpeg present); `check-scenarios.ts ST-011` → 4/4 covered · Preview: none

## Scenarios
| Scenario | Test (file) | Given/When/Then really checked? | Result |
|---|---|---|---|
| A library sound becomes a take without cost | tests/meme-voice-track.test.ts | Given: real 2 s tone added via addLibrarySound with trim 0.0-1.0, meme with sound line. When: voiceTrack. Then: source "library:vine-boom", duration 1.0 (literal), spentUsd 0; also episodeTrack accepts the take. | pass |
| A changed trim takes the sound again | same | Given: current take, then trim changed via updateLibrarySound. Then: duration 0.8 (literal), hashes changed. | pass |
| A removed library sound keeps the take and warns | same | Given: current take, sound dir removed. Then: takes.json byte-identical, exactly one warning matching "vine-boom" is no longer in the library. | pass |
| A line naming a sound that never was taken and is gone stops the voice track | same | Given: no library sound, no take. Then: voiceTrack rejects with a detail naming "reveal-boom" and "vine-boom"; no take is written. Already green on main via ST-009 validation; the test pins it for the voice track. | pass |

## Definition of done
| Item | Applies | Evidence | OK? |
|---|---|---|---|
| Journal entry per command | partly | Pre-existing voice-track behaviour, unchanged; no new command | OK |
| Texts from message catalogs | n/a | CLI warning/log strings follow the existing inline style of voice-track.ts | OK |
| No personal data in logs | yes | Warning contains line and sound ids only | OK |
| Cost | yes | Copies are made before runBatch, never billed; spentUsd 0 asserted | OK |
| UI / list performance / security advisories | n/a | ui: false, no new dependency | OK |

## Edge cases not covered by the story
| Case | Expected by a rule? | Recommendation |
|---|---|---|
| `--dry-run` with a library sound | Code reports "N to copy" and copies nothing; no scenario | question (untested, behaviour looks right) |
| Removed sound AND the take file was replaced/missing | Invariant "imported take never generated over"; code blocks via blockingReason | question (untested) |
| Trim changed to a value that is the same range written differently | none | question |
| Library sound file changed (not only trim) | Context says it makes the take stale; only the trim is tested, same hash path | question |

Verdict: accepted
