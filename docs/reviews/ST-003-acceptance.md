# Acceptance – ST-003: Remove a library sound
Date: 2026-11-23 · Tests run: `npx vitest run tests/sound-library.test.ts tests/meme-voice-track.test.ts` → 51 passed, 0 failed (44 + 7); `npm test` → 817 passed, 2 skipped, 0 failed · `npm run typecheck` clean · `verify.ts` green · `check-scenarios.ts ST-003` → 3/3 · Preview: none (CLI story)

Branch `st-003-remove-a-library-sound`, HEAD `0cd98ac` (5 commits since `main`), worktree clean. The code review's
first-round blockers are fixed in this story (`0cd98ac`): the folder's presence decides instead of a valid
`sound.yaml`, removal renames into a hidden `.removing-*` before deleting, and the command names the memes that
keep the take and warns about the lost licence.

Note on ffmpeg: it was not on `PATH` when I started, so the second scenario's test (inside
`describe.skipIf(!hasFfmpeg())`) would have been skipped and the scenario unverified. I ran the repository's
`scripts/install-ffmpeg.sh`, which installs a static build into the gitignored `.tools/ffmpeg/` (the same binary
CI installs), and every run below has the test executed, not skipped.

## Scenarios
| Scenario | Test (file) | Given/When/Then really checked? | Result |
|---|---|---|---|
| A removed sound leaves the library | `tests/sound-library.test.ts:282` | Given: `vine-boom` and `sad-trombone` written by hand into `library/sounds/<id>/` (sound.yaml + WAV). When: `removeLibrarySound` (the function the CLI action calls). Then: `listLibrarySounds` ids equal `['sad-trombone']` and `library/sounds/vine-boom` does not exist — both literals from the scenario. Pass. | pass |
| A meme keeps the take of a removed sound | `tests/meme-voice-track.test.ts:110` | Given: a real `office-prank` meme created with `createProject`, `vine-boom` added by `addLibrarySound` from an ffmpeg tone, the take copied by `voiceTrack`. When: `removeLibrarySound`. Then: the `takes.json` entry for `reveal-boom` is `toEqual` the one before, `audio/lines/reveal-boom.wav` exists and its bytes equal the previous bytes. "Is current" is the derived Take status and is not asserted in this test; the adjacent `ST-011: A removed library sound keeps the take and warns` (same file, now calling `removeLibrarySound`) re-runs `voiceTrack`, asserts `takes.json` is byte-identical and only the warning is printed, which is the current-at-the-pipeline meaning. | pass (remark: assert the status directly) |
| An unknown sound is refused | `tests/sound-library.test.ts:291` | Given: the library holds only `sad-trombone`. When: `removeLibrarySound(root, 'vine-boom')`. Then: `ValidationError` whose message matches `/no library sound "vine-boom"/`, and the list is still `['sad-trombone']`. Pass. | pass |

Traceability: `check-scenarios.ts ST-003` → 3/3, titles verbatim. Extra, untitled tests carry the failure paths
(a `sound.yaml` that does not parse, a folder without an entry, an id that is not a library id, the memes named,
a delete that fails, and the command line end to end) — they support the scenarios, they do not replace them.

## Definition of done
| Item | Applies | Evidence | OK? |
|---|---|---|---|
| Journal entry per command | no | `docs/engineering/conventions.md`, "Commands and events": there is no event journal | n/a |
| Texts from message catalogs | no | CLI messages are inline English strings; there is no catalog (conventions, "UI and texts"); `check-language` green via `verify.ts` | n/a |
| Usable at the design size, lists fast with realistic data | no | `ui: false`; the command has no list or screen | n/a |
| No personal data in logs | yes | the success line names the id, the warning adds the meme slugs (`office-prank`) and the licence note; no author, path or user data | ok |
| Critical security advisories of the stack within 48 h | no | no dependency change in the diff (`package.json`/`package-lock.json` untouched) | n/a |
| Module layout | yes | the command lives in `packages/cli/src/sound-library.ts` next to add/edit/check and is wired in `packages/cli/src/index.ts`; no core import direction violated | ok |
| Domain language | yes | Library Sound, Take, Use when; the warning speaks of the take, the licence and the credit as in `CONTEXT.md`; `verify.ts` glossary check green | ok |
| CLI message style | yes | `✔ … removed from the library`, `! … keeps its take …` (the warning style `voice-track.ts` already uses), `✖` with exit 1 on refusal via `run()` | ok |
| Invariant: the entry's id is its folder name, its WAV exists | yes | existence is decided by the folder now; a broken `sound.yaml` is removed all the same (test `removes an entry whose sound.yaml does not load`), `sound check` still reports validity | ok |
| The library belongs to the user; nothing outside it is touched | yes | only `library/sounds/<id>` is renamed/deleted; scenario 2 proves the take registry and the take file are unchanged; `used_in` is read-only over `takes.json` | ok |
| A refusal leaves the library as it was | yes | the unknown-id scenario asserts the list is unchanged; the id is checked before any file operation (`checkId`) | ok |
| A failed delete leaves no half-deleted entry | yes | rename to `.removing-<uuid>` first, then delete; the leftover is hidden and named in a typed `ValidationError` (`leaves the library consistent when the folder cannot be deleted`, skipped for root because `chmod` cannot block root) | ok |
| HS-260 (take stays current) and HS-261 (licence) | yes | the take and its file are byte-unchanged; `sound remove` prints which memes keep the take and that the licence is gone; `sound check`/`sound list` ignore the hidden leftover | ok |

## Edge cases not covered by the story
| Case | Expected by a rule? (cite) | Recommendation: fix now / question |
|---|---|---|
| A `sound.yaml` that does not parse | AGG-LibrarySound "the entry's id is its folder's name" + the story's Context "deletes the entry and its file"; fixed in `0cd98ac` | none — removed, returns `sound: undefined`, tested; probed through the CLI (`✔ broken removed from the library`) |
| A folder without `sound.yaml` (a leftover of a failed delete or a hand-created folder) | No story rule; the command now deletes it (folder presence decides) | question: confirm that deleting any `library/sounds/<id>` folder that holds no entry is wanted (it could hold only user files); tested, and it is the only CLI remedy after a failed delete |
| An entry whose `sound.yaml` id differs from its folder name | AGG invariant 1; `sound check` reports it invalid; `sound remove` deletes the folder and prints the requested id | question: removal now cleans up an invalid entry instead of refusing — consistent with the code review's direction, but the deliberate choice should be stated in the review |
| An entry with a missing WAV | No story rule; `sound check` says "copy it back or remove the entry"; the command removes it | none; optional test (the path is not asserted today) |
| A failed delete | No story rule; the leftover is hidden and reported, the library is consistent | none; the test is skipped when the suite runs as root (`chmod` cannot block root), so on a root CI runner this branch is unverified — say so when merging |
| The same sound used by several memes | HS-260; `used_in` is sorted and the warning picks singular/plural | question: only one meme is tested; a two-meme case is untested (join format, plural) |
| Removal repeated | Scenario 3 covers the missing sound | none |
| Concurrent `sound remove` and `sound edit` of the same sound | No rule; library writes are unlocked by convention (G-130); rename-first narrows the window | question |
| A licence and credit of a used sound removed with it; the release TODO still offers `sound edit <id>`, which now refuses | HS-261 (TODO, never a failure); the command warns, the release check degrades to a TODO | question for the user: accept the warning, or change the release remedy to name the missing sound |
| `sound check`'s advice for a folder without an entry ("sound add … adds one") is stale now that `sound remove` can delete it | No rule; code review #1 noted the remedy text | question (low): name `sound remove` in the check message, as ST-004's acceptance already asked |
| Removal deletes any file the user put in the sound folder | No rule; the command is user-invoked and the help says it deletes the sound and its file | question (low): no confirmation, no `--force` |
| Scenario 2 does not assert the Take status | Then "still exists and is current"; the facts that make it current are asserted, the status itself only in the adjacent ST-011 test | remark: add `takeStatus(take, file, expected) === 'current'` or keep the re-run assertion in the scenario's own test |

## Verdict
**accepted with remarks**

All three scenarios have a real test with the exact title, every Given/When/Then is exercised through the
command's own seam, the tests pass at HEAD `0cd98ac`, and the full suite, typecheck, `verify.ts`, the story linter
and `check-scenarios` are green. The first-round code-review blockers are genuinely fixed and covered by tests: a
broken entry and a folder without an entry are removable, a failed delete leaves a hidden leftover instead of a
half-deleted entry, the id guard is exercised, and the memes that keep the take plus the lost licence are named.
The remarks are the partial "is current" assertion in the scenario's own test, the one-meme-only coverage of
`used_in`, the root-skipped failure test, and the open product questions (deleting entry-less folders, cleaning up
invalid entries, the release remedy for a removed sound). None contradicts a scenario or a rule in the story or
the context pack, so the story is accepted.

## Resolution (main session, 2026-11-23)

- **Scenario 2 asserts the status directly.** `ST-003: A meme keeps the take of a removed sound` now calls
  `takeStatus(take, file, take.text_hash)` and expects `'current'` next to the unchanged registry entry and bytes.
- **`used_in` is covered with two memes** (`cat-video`, `office-prank`), so the sorted join and the plural are tested.
- **`sound check` names `sound remove`** in its three remedies (a loose file, a folder without an entry, an entry
  without its file); the folder-without-entry test asserts the hint and then removes the folder with it.
- **Kept as deliberate:** a `library/sounds/<id>` folder without a loadable `sound.yaml` is removable — it is the
  only CLI remedy after a failed delete, and the function comment says the folder's presence decides. The same
  applies to an entry whose `sound.yaml` id differs from its folder name.
- **Open for the developer:** the release TODO for a removed sound still offers `sound edit <id>`, which refuses;
  whether the release check should name the missing entry instead is a change to ST-016's accepted behaviour.
- **Note for the merge:** the failed-delete test is skipped when the suite runs as root (`chmod` cannot block root);
  CI runs it as a normal user.

