# Acceptance – ST-001: Add a library sound
Date: 2026-11-22 · Tests run: `npx vitest run tests/sound-library.test.ts` → 4 passed, 0 failed; full `npx vitest run` → 678 passed, 2 skipped, 0 failed; `npm run typecheck` clean · Preview: none (CLI smoke test run by hand)

## Scenarios
| Scenario | Test (file) | Given/When/Then really checked? | Result |
|---|---|---|---|
| An mp3 becomes a measured library sound | tests/sound-library.test.ts | Given: empty workspace, real 1.4 s mp3 made by ffmpeg. When: `addLibrarySound` (the function the CLI action calls). Then: id `vine-boom`, folder holds exactly `sound.wav` + `sound.yaml`, WAV codec is pcm, length about 1.4, loudness measured (-40 to 0), cue 0.12 and licence `unknown` as literals. | pass |
| The same file under another id is refused | tests/sound-library.test.ts | Given: first add of boom.mp3. When: same file added as "Boom 2". Then: SoundRefused, reason `duplicate`, existing `vine-boom`, message "already stored as "vine-boom"", library still has one sound. | pass |
| A taken id is refused | tests/sound-library.test.ts | Given: "vine-boom" exists. When: other.wav (different content) with the same title. Then: refused with reason `id-taken`, message "id "vine-boom" is taken", library unchanged. | pass |
| A cue outside the sound is refused | tests/sound-library.test.ts | Given: 1.4 s mp3. When: cue 2.0. Then: refused with reason `outside`, message matches "cue … outside", no `vine-boom` folder and the library is empty (the temp `.incoming-` folder is ignored by the helper but is removed in `finally`). | pass |

Remark: the tests call `addLibrarySound` and not the `sound add` command line. The CLI action is thin, and I checked it by hand (see below).

Hand check of `npm run cli -- sound add` with a 1.4 s mp3:
- Add with cue 0.12 printed `✔ vine-boom … 1.4 s, -22.2 LUFS, licence unknown`.
- The same file as "Boom 2" printed `✖ this file is already stored as "vine-boom"`.
- A cue of 2 printed `✖ the cue 2 lies outside the sound's length of 1.4 s`.
- The exit code was non-zero on refusal.

Note: `npm --prefix` makes the CLI use the repo root as the workspace. I removed the `library/` this created in the repo. It is not tracked.

## Definition of done
| Item | Applies | Evidence | OK? |
|---|---|---|---|
| Journal entry per command | no | `docs/engineering/conventions.md` l.62: there is no event journal | n/a |
| Texts from message catalogs | no (CLI, English error strings, same as `character`) | `index.ts` | ok |
| Design size, lists fast | no (`ui: false`, no list) | n/a | n/a |
| WAV gitignored, `sound.yaml` tracked | yes | `.gitignore` and `workspace/.gitignore` add `library/sounds/*/*` with `!…/sound.yaml`; observed in `git status --ignored` | ok |
| Invariants: measured length and loudness, never normalised | yes | `convertToWav` has no gain; measured by ffprobe and `measureLoudness` | ok |
| Invariant: cue and trim inside the length, cue inside the trim | yes | `librarySoundTimeProblems`, also enforced in the schema | ok (trim not tested, see below) |
| Atomic add, no half entries on refusal | yes | temp dir then `rename`, removed in `finally` | ok |
| No personal data in logs | yes | only id, length and loudness are printed | ok |
| Update and init never overwrite the library | not this story | `library/` is user data and is not in the runtime payload | no gap seen |

## Edge cases not covered by the story
| Case | Expected by a rule? (cite) | Recommendation |
|---|---|---|
| Refusal of an empty title or use-when | Yes, invariant "title and use when are never empty"; implemented (`text(... required)`), CLI also marks them required | no action; optional test |
| A trim outside the length, or a cue outside the trim | Yes, invariant; implemented and refused with reason `outside`, no scenario or test | question: add a test where the story's 4-scenario cap allows, or accept |
| A non-audio file, a URL, a missing file | Yes, EVT-LibrarySoundRefused and "only a local file"; implemented, untested | question |
| A video file as input (`-vn -map 0:a:0`) | Yes, "every format ffmpeg reads" | fine; a video without an audio stream is refused as `not-audio` |
| Silent file (loudness not finite) | No rule | question: refusing it as `not-audio` may be the wrong reason |
| The same content in a different format, for example wav and mp3 of one recording | The rule says "same file content". Hash is of the converted WAV, so different encodings of one sound are not caught | question |
| Taken id check comes before the content check | Story order is not stated | question: a file that is both a duplicate and has a taken id is reported as `id-taken` |
| Two simultaneous adds of the same id | No rule | question: `rename` onto an existing non-empty folder fails, so the library stays consistent |
| Title with only non-latin characters (for example "ビーム") | Id falls back to `sound` | question: a second such title is refused as id taken, which asks for `--id` |
| Licence that asks for attribution without a credit | Invariant: allowed, becomes a release TODO (HS-265) | by design; the release-TODO side is not part of this story |

## Verdict
accepted with remarks

All four scenarios have a real test that checks every Then line with literals from the scenario. The tests pass, and so do the full suite and the typecheck. The remarks above are about untested refusals that the implementation already covers, and about open questions on duplicate detection by content after conversion. None of them contradicts a rule in the story.
