# Gap register

> Generated rows come from `docs/domain/events.yaml`; decisions and manual gaps live outside the managed block.
> As-is map: [context-map.as-is.md](context-map.as-is.md) · Target map: [context-map.md](context-map.md).

<!-- kataster:gap-register:begin -->
<!-- Generated from docs/domain/events.yaml by gap-register.ts. Do not edit inside this block. -->
| Gap | Kind | Aggregate | As-is | Target | Evidence | Next step |
|---|---|---|---|---|---|---|
| GAP-AGG-Project | as-is boundary | [AGG-Project](events.yaml) | [BC-Pipeline](context-map.as-is.md#bc-pipeline--pipeline) | – | state.json per project, loaded and saved as one document (packages/core/src/project.ts:171-184,233-236)<br>stage transitions mutate one State (packages/core/src/state.ts:250-324)<br>budget ledger inside the same State (packages/core/src/state.ts:326-341) | Decide the target boundary |
| GAP-AGG-ProjectReview | as-is boundary | [AGG-ProjectReview](events.yaml) | [BC-Review](context-map.as-is.md#bc-review--review) | – | one lock per project review folder, review/.notes.lock, around every note change and every send (packages/cli/src/board-review.ts:38,202,238)<br>round numbers from all rounds of the project (packages/core/src/review.ts:37; board-review.ts:242)<br>notes per render in review/notes/<video-stem>.json, rounds in review/rounds/<NNN>.json (board-review.ts:50,62-78) | Decide the target boundary |
| GAP-AGG-GenerationQueue | as-is boundary | [AGG-GenerationQueue](events.yaml) | [BC-GenerationQueue](context-map.as-is.md#bc-generationqueue--generation-queue) | – | assets/queue.json per project, read, changed and written whole on every change (packages/cli/src/queue.ts:101-119)<br>an item waits for the items in its after list across the whole queue (queue.ts:524-529); order numbers are taken from the whole queue (queue.ts:127)<br>one queue run per project, pid lock assets/queue.lock (queue.ts:562-578,671-674) | Decide the target boundary |
| GAP-AGG-ProjectTiming | as-is boundary | [AGG-ProjectTiming](events.yaml) | [BC-Timing](context-map.as-is.md#bc-timing--timing) | – | timing.json and timing.overrides.json per project are parsed and merged into one effective timing on every project load, and the merge ends in one check of the whole timing (packages/core/src/project.ts:237-241; packages/core/src/timing.ts:61-94)<br>assertTiming checks sections, lines, words, beats and energy of the merged timing together, so one bad override fails the whole timing (timing.ts:96-165)<br>the analysis writes timing.json whole and never writes the overrides (scripts/audio-analysis/analyze.py:430-432, README.md:10) | Decide the target boundary |
| GAP-AGG-Lyrics | as-is boundary | [AGG-Lyrics](events.yaml) | [BC-Timing](context-map.as-is.md#bc-timing--timing) | – | writeLyrics checks the whole text for section tags and writes lyrics.txt atomically (packages/cli/src/board-wizard.ts:271-278), used by the lyrics command and the board wizard (packages/cli/src/index.ts:588-608; packages/cli/src/release-board.ts:206) | Decide the target boundary |
| GAP-AGG-Storyboard | as-is boundary | [AGG-Storyboard](events.yaml) | [BC-Storyboard](context-map.as-is.md#bc-storyboard--storyboard) | – | storyboard.yaml per project is parsed whole with StoryboardSchema, only by loadProject (packages/core/src/project.ts:242-243)<br>resolveStoryboard checks all shots together – unique ids, order, coverage, chaining – against the effective timing and the bibles, in one call whose only caller is validateProject (packages/core/src/timing.ts:455-577; packages/cli/src/validate.ts:106)<br>the hook validates the whole project on every edit of storyboard.yaml and blocks a failing edit (workspace/.claude/hooks/validate-artifacts.mjs:13-15; packages/cli/src/validate-file.ts:124-127) | Decide the target boundary |
| GAP-AGG-CachedGeneration | as-is boundary | [AGG-CachedGeneration](events.yaml) | [BC-Generation](context-map.as-is.md#bc-generation--generation) | – | one record per cache key, .cache/generations/<key>/result.json with the provider's files, shared by every project and series of the workspace (packages/providers/src/runner.ts:86-87,167-195; packages/cli/src/generate.ts:711)<br>the key is the SHA-256 of the canonical request – operation, provider, model, prompt, negative prompt, seed, size, duration, params, each reference's path and content hash, the audio hash and start, the workflow fingerprint (runner.ts:53-84; packages/core/src/hash.ts:25-45)<br>runBatch is the one path every generation takes – generate, the queue, region patches, the voice track and the bench (generate.ts:667-672; queue.ts:628; patch.ts:96; voice-track.ts:137,191; bench.ts:577,634,675) | Decide the target boundary |
| GAP-AGG-ModelRoles | as-is boundary | [AGG-ModelRoles](events.yaml) | [BC-Generation](context-map.as-is.md#bc-generation--generation) | – | config/models.yaml is parsed whole with ModelsConfigSchema on every batch and estimate (packages/core/src/schema.ts:714-762; packages/cli/src/generate.ts:678)<br>resolveModelRole and providerForRole pick a role's model, params and price for the project's provider in one place (packages/core/src/models.ts:26-98) | Decide the target boundary |
| GAP-AGG-Series | as-is boundary | [AGG-Series](events.yaml) | [BC-Series](context-map.as-is.md#bc-series--series) | – | series.yaml and state.json of projects/<slug>/, loaded together by loadSeries (packages/core/src/project.ts:380-416), created together by new-series (packages/cli/src/new-series.ts:67-104)<br>the uncommitted series budget is computed in one place from the series state and the project.yaml of every episode that names the series (packages/cli/src/series.ts:43-74) and checked by createProject for the CLI and the board wizard (packages/cli/src/new-project.ts:205-216; board-wizard.ts:394)<br>canon generations are booked in the series' own state.json and manifest (packages/cli/src/generate.ts:260-277) | Decide the target boundary |
| GAP-AGG-Script | as-is boundary | [AGG-Script](events.yaml) | [BC-Series](context-map.as-is.md#bc-series--series) | – | script.yaml of an episode, parsed whole with ScriptSchema by loadProject (packages/core/src/project.ts:262; schema.ts:587-657)<br>validateScript checks the whole script against the series canon and throws one error listing every issue (packages/core/src/episode.ts:59-104); the workspace hook runs it on every edit (packages/cli/src/validate-file.ts:134-145) | Decide the target boundary |
| GAP-AGG-TakeRegistry | as-is boundary | [AGG-TakeRegistry](events.yaml) | [BC-Series](context-map.as-is.md#bc-series--series) | – | takes.json of an episode, written whole and sorted by saveTakes (packages/cli/src/takes.ts:51-57); its writers are voice-track and import-takes (packages/cli/src/voice-track.ts:99-200; media.ts:395-460)<br>every take's status follows from its file, the registered file hash and the text hash of its script line (takes.ts:65-87; packages/core/src/episode.ts:139-153) | Decide the target boundary |
| GAP-AGG-EpisodeTrack | as-is boundary | [AGG-EpisodeTrack](events.yaml) | [BC-Series](context-map.as-is.md#bc-series--series) | – | episodeTrack places the lines from the take durations and writes timing.json, timing.effective.json, audio/episode.wav and audio/stems/<character>.wav together in one run from the effective timing (packages/cli/src/episode-track.ts:148-253) | Decide the target boundary |
| GAP-AGG-StyleBible | as-is boundary | [AGG-StyleBible](events.yaml) | [BC-Bibles](context-map.as-is.md#bc-bibles--bibles) | – | style.yaml of a music video or series canon, parsed whole with StyleBibleSchema (packages/core/src/schema.ts:373-419) by loadProject (packages/core/src/project.ts:227-250) and by validate-file on every edit (packages/cli/src/validate-file.ts:86-97)<br>an episode's style bible is the canon's (project.ts:89,105-107); new-series writes a starter from the brand kit (packages/cli/src/new-series.ts:48-58) | Decide the target boundary |
| GAP-AGG-CharacterBible | as-is boundary | [AGG-CharacterBible](events.yaml) | [BC-Bibles](context-map.as-is.md#bc-bibles--bibles) | – | characters.yaml of a music video or series canon, parsed whole with CharacterBibleSchema (packages/core/src/schema.ts:436-489); the files lie in characters/<id>/ beside it<br>written by the character-bible and new-series skills, and by character use through the YAML document with a whole-file schema check before an atomic write (packages/cli/src/character-library.ts:452-525) | Decide the target boundary |
| GAP-AGG-SetBible | as-is boundary | [AGG-SetBible](events.yaml) | [BC-Bibles](context-map.as-is.md#bc-bibles--bibles) | – | sets.yaml of a music video or series canon, parsed whole with SetBibleSchema (packages/core/src/schema.ts:496-541); plates in sets/<set>/plates/, props in props/<id>/ beside it<br>written by the style-bible skill in style-character (music video) and by new-series (canon); validated by the hook on every edit (packages/cli/src/validate-file.ts:86-97) | Decide the target boundary |
| GAP-AGG-UserReferences | as-is boundary | [AGG-UserReferences](events.yaml) | [BC-Bibles](context-map.as-is.md#bc-bibles--bibles) | – | references.yaml of a project or series canon with ReferencesSchema (packages/core/src/schema.ts:1460-1489), files in assets/references/<br>every change is a read, a change and an atomic save in board-wizard.ts (packages/cli/src/board-wizard.ts:72-178), used by the reference command and the board wizard; validate-file checks unique ids and that every file exists (packages/cli/src/validate-file.ts:234-243) | Decide the target boundary |
| GAP-AGG-LibraryCharacter | as-is boundary | [AGG-LibraryCharacter](events.yaml) | [BC-CharacterLibrary](context-map.as-is.md#bc-characterlibrary--character-library) | – | library/characters/<id>/character.yaml with LibraryCharacterSchema (packages/core/src/schema.ts:1422-1458) and the character's files beside it; validate-file checks that the id is the folder and that every named file exists (packages/cli/src/validate-file.ts:246-258)<br>every write – import, new, add-file, update, remove – reads the entry, changes it and saves it atomically in character-library.ts (packages/cli/src/character-library.ts:63-66,206-428) | Decide the target boundary |
<!-- kataster:gap-register:end -->

## Gaps found by the adoption of the project and stage pipeline (2026-11-21)

Candidates only – no stories until the user asks (`/adopt <scope> --stories`). Priority is a suggestion.

| # | Class | Gap | Evidence | Source | Priority |
|---|---|---|---|---|---|
| G-1 | Exists but contradicts | `state.json` has no write lock; a long `generate` batch saves the state it loaded at its start and can overwrite a parallel `stage-*`, `spend`, wizard, or `render` write, losing recorded spend | `packages/cli/src/generate.ts:255,758-759`; `packages/core/src/project.ts:171-184` | HS-15 | high |
| G-2 | Exists but contradicts | No stage transition is guarded (start, complete, fail, skip from any status; interactive stages startable) | `packages/core/src/state.ts:250-324` | HS-11 | high |
| G-3 | Exists but contradicts | A stage reset accepts a running stage and leaves later done stages done, so a project can count as done with stale assets and renders | `packages/core/src/state.ts:310-324` | HS-12 | high |
| G-4 | Exists but contradicts | Seven stage skills call `stage-done` themselves, partly with other outputs (`preview-16x9.mp4` vs `preview-{master}.mp4`) | `workspace/.claude/skills/{audio-analysis,storyboard,assembly-render,video-qa,episode-track,style-bible,character-bible}/SKILL.md` | HS-7 | medium |
| G-5 | Exists but contradicts | All stages done without a release folder: next action says `/video-next` (qa-export), which stops as done | `packages/core/src/production.ts:105`; `workspace/.claude/commands/video-next.md` step 5 | HS-13 | medium |
| G-6 | Exists but contradicts | `/video-next` answers review rounds before it checks for an open interactive stage | `video-next.md` steps 4 and 6 | HS-14 | low |
| G-7 | Exists but contradicts | Hard stop lists diverge (`workspace/AGENTS.md` 3, `docs/pipeline.md` and `docs/architecture.md` 4, `video-next.md` adds two) | listed files | HS-4 | low |
| G-8 | Exists but contradicts | `workspace/AGENTS.md` and `docs/architecture.md` claim input hashes make the pipeline resumable; nothing passes or compares them | `packages/cli/src/index.ts:779`; `workspace/AGENTS.md` "Resumable and thrifty" | HS-10 | low |
| G-9 | Exists but contradicts | Next action and board ignore `review_mode: final`; only `/video-next` stops | `packages/core/src/production.ts:98`; `video-next.md` step 6 | HS-8 | low |
| G-10 | Exists but contradicts | The next-action reason is `retry`; the glossary word is resume | `packages/core/src/production.ts:28` | HS-2 | low |
| G-11 | Exists but contradicts | The phase value `setup` beside the stage ID `setup` | `packages/core/src/production.ts:11` | HS-1 | low |
| G-12 | Exists but contradicts | ADR 0016 still names `series/<slug>/` and says `/video-next` reads the stage list from `status`, while `video-next.md` hard-codes both lists | `docs/adr/0016-episode-projects.md:33`; `video-next.md` stage loop step 1 | – | low |
| G-13 | Missing | No command changes a project's budget; raising it means editing `project.yaml` and `state.json` by hand | `packages/cli/src/validate-file.ts:164-170` | HS-5 | medium |
| G-14 | Missing | The clock cannot be injected into core's transitions | `packages/core/src/state.ts` (`new Date()`) | conventions | low |
| G-15 | Dead | `budget.reservedUsd` – never set, still subtracted and shown as "reserved" | `packages/core/src/state.ts:199,327`; `packages/cli/src/board/production.js:241` | HS-9 | low |
| G-16 | Dead | `StageDefinition.mechanical` and `stageOutputs` have no reader in the packages | `packages/core/src/state.ts:9,158` | – | low |

## Gaps found by the adoption of human review (2026-11-21)

| # | Class | Gap | Evidence | Source | Priority |
|---|---|---|---|---|---|
| G-17 | Exists but contradicts | The desktop player takes no lock and rewrites the whole notes file from memory: a board note or a round mark written while it is open is lost, and the note can be sent twice | `scripts/review-player/review_notes.py:33-37,72-76` | HS-16 | high |
| G-18 | Exists but contradicts | The desktop player deletes sent notes (`remove_last`) | `scripts/review-player/review_notes.py:52-59` | HS-16 | high |
| G-19 | Exists but contradicts | Any replies file answers a round, also an incomplete one; completeness is checked only by the hook after the write | `packages/core/src/review.ts:42-45`; `validate-file.ts:219-232` | HS-18 | medium |
| G-20 | Exists but contradicts | An unreadable round file makes the board count nothing open, while `status` fails | `packages/cli/src/board-review.ts:84-88,273` | HS-18 | medium |
| G-21 | Exists but contradicts | Sending writes the round file and the note marks separately; a crash between them sends the same notes again | `packages/cli/src/board-review.ts:264-266` | Q8 | medium |
| G-22 | Exists but contradicts | The agent may write notes and round files; only an instruction forbids it, the hook checks replies only | `workspace/.claude/hooks/validate-artifacts.mjs:13-30,84-85` | HS-25 | medium |
| G-23 | Exists but contradicts | The desktop player computes frames with `round(t × fps)` and the container fps; the board with `floor` and the format fps | `scripts/review-player/review_player.py:44,66`; `packages/core/src/review.ts:16` | HS-16 | low |
| G-24 | Exists but contradicts | `assembly-render` takes desktop notes "asked for in chat"; the board sends them in the next round | `workspace/.claude/skills/assembly-render/SKILL.md` "Review rounds" | HS-17 | low |
| G-25 | Exists but contradicts | ADR 0032 resets `qa-export` after every round; the rule is: only when the fix pass changed a render | `docs/adr/0032-web-review-rounds.md` Decision | HS-20 | low |
| G-26 | Exists but contradicts | Docs say open rounds come "before any stage"; a running and an open interactive stage come first | `docs/pipeline.md` "Review notes and rounds", `docs/board.md` "Review", ADR 0032, test title in `tests/board-review.test.ts:50` | slice 1 HS-14 | low |
| G-27 | Exists but contradicts | The code says submit (`submitRound`, `/submit`, `submitted_at`); the domain verb is send | `packages/cli/src/board-review.ts:234`; `schema.ts:1383` | HS-21 | low |
| G-28 | Exists but contradicts | The art director's verdicts use "review" words (queue state `reviewing`, "Art-director reviews", `assets/review/`) | `packages/cli/src/board/production.js:12-13,46-47` | HS-22 | low – art-director slice |
| G-29 | Missing | A round does not record the version of its render; a re-render under the same name moves notes silently | `packages/cli/src/board-review.ts:40-50` | HS-26 | medium |
| G-30 | Missing | Review mode `final`: no documented release of the stop; every `/video-next` stops again before `qa-export` | `workspace/.claude/commands/video-next.md` step 6 | HS-27 | medium |
| G-31 | Missing | The review view does not reload while a fix pass runs; replies appear after a manual reload (inferred from the code, not reproduced) | `packages/cli/src/board/app.js:82-86` | analyst | low |

Decisions for human review:

- GAP-AGG-ProjectReview: the boundary stays as recovered (`as-is`).
- Exists and is intended: rounds numbered once per project; open rounds oldest first; a note on a cut belongs
  to both shots; a range note's section is the one at its start; Shorts are reviewed through their 9:16 render;
  board writes limited to the board's own origin; the board writes review files (ADR 0032 covers it).

## Gaps found by the adoption of the generation queue and verdicts (2026-11-21)

Candidates only. The decisions behind them were made by recommendation and not reviewed by the user
(delegated); priority is a suggestion.

| # | Class | Gap | Evidence | Source | Priority |
|---|---|---|---|---|---|
| G-32 | Exists but contradicts | `queue.json` changes are read-modify-write without a lock between processes: a `queue add`, `retry`, `accept` or `drop` during a run can be lost; the run lock is check-then-write | `packages/cli/src/queue.ts:111-119,671-674` | HS-41 | high |
| G-33 | Exists but contradicts | `accept` checks no status; a verdict that lands after an accept overwrites the accepted item | `queue.ts:484-500,694` | HS-38, HS-42 | high |
| G-34 | Exists but contradicts | The attempt cap holds only for the automatic requeue of images: `queue retry` has no limit, no cap on cloud attempts, and attempts kept from before a replace count | `queue.ts:434-473,705`; `workspace/.claude/skills/ai-clips/SKILL.md` step 6 | HS-39 | medium |
| G-35 | Exists but contradicts | A region patch is not recorded in `queue.json` and numbers its attempt from `verdicts.jsonl`; `queue accept --attempt` cannot pick it, and a later queue attempt can write the same `-a<n>` file | `packages/cli/src/patch.ts:73-77`; `queue.ts:461,766` | HS-40 | medium |
| G-36 | Exists but contradicts | `patch --series` reads `<series>/assets/review/verdicts.jsonl`; `review-image` writes `<series>/review/verdicts.jsonl`, so a canon patch is always attempt 2 | `patch.ts:73`; `review-image.ts:300`; `verdicts.ts:33-35` | HS-40 | medium |
| G-37 | Missing | An accept writes no verdict: `verdicts --failed`, which the orchestrator reads, and the board still show an accepted subject as failed | `queue.ts:484-501`; `verdicts.ts:42-50`; `board-production.ts:297` | HS-37 | medium |
| G-38 | Exists but contradicts | `art-director.md` fails "on any doubt", counts palette and light, and answers in text; the rule is: only a blocking defect fails, JSON verdict | `workspace/.claude/agents/art-director.md` "Review axes", "Response"; `review-image.ts:106-108` | HS-34 | medium |
| G-39 | Exists but contradicts | The queue's schema and transitions, the verdict type and schema, and the blocking-defect rule live in `cli`; no schema in `schema.ts` or `schema/` (ADR 0004) | `queue.ts:31-80`; `review-image.ts:13-49,159` | HS-45 | medium |
| G-40 | Exists but contradicts | `queue retry` requeues a passed item; replacing a passed item leaves the passed items after it filed | `queue.ts:434-437,179-193` | HS-38 | low |
| G-41 | Exists but contradicts | Status `passed` does not tell a pass verdict from an item filed unjudged | `queue.ts:775-782` | HS-33 | low |
| G-42 | Exists but contradicts | The verdict log and the queue are read twice, with different parsing: `verdicts.ts` / `queue.ts` and `board-production.ts` | `verdicts.ts:7-21`; `board-production.ts:163-205` | HS-36 | low |
| G-43 | Exists but contradicts | The art director's verdicts use review words: `review-image`, status `reviewing`, the item field `review`, `--reviews`, `failedReviews`, "reviewer" (continues G-28) | `queue.ts:27,31,34,607`; `index.ts:1068`; `board-production.ts:297` | HS-30 | low |
| G-44 | Exists but contradicts | The command and its options say retry (`queue retry`, `RetryOptions`); the domain verb is requeue | `index.ts:1329`; `queue.ts:419-434` | HS-32 | low |
| G-45 | Exists but contradicts | `--reviews` reads as a cap, but a verdict started right after a generation ignores it; up to `reviews + 2` run at once | `queue.ts:784,813,820` | analyst | low |
| G-46 | Exists but contradicts | `queue wait` reports an item in `error` as `needs-fix` | `queue.ts:851-872` | analyst | low |
| G-47 | Exists but contradicts | `ai-clips` says a patch is "filed as the next attempt"; the queue does not know it (follows G-35) | `ai-clips/SKILL.md` step 6 | HS-40 | low |
| G-48 | Dead | `QueueAttempt.provider` is written and read by no code or view | `queue.ts:773` | analyst | low |

Decisions (by recommendation, not reviewed by the user):

- GAP-AGG-GenerationQueue: the boundary stays as recovered (`as-is`).
- Exists and is intended: one run per project working the items in order; attempts kept as files and only an
  approved one filed; verdicts in the background so the GPU never waits; verdict notes never fail and never
  requeue; a failed image requeues itself with the fix prompt, a new seed and its blocking defects as focus; a
  failed clip waits for the stage runner; the one-attempt cloud fallback; the ComfyUI restart; `drop` keeps the
  files; the append-only verdict log that skips torn lines; the series canon judged by hand (HS-43). ADR 0038
  (proposed) records them.

## Gaps found by the adoption of timing (2026-11-21)

Candidates only – no stories until the user asks. Decided by recommendation; the user answered four questions
about how they work (parentheses are backing vocals, a vocal stem comes with most songs, the song never changes
after the analysis, the agent enters corrections). Priority is a suggestion.

| # | Class | Gap | Evidence | Source | Priority |
|---|---|---|---|---|---|
| G-49 | Exists but contradicts | A lyric line in parentheses becomes an untimed cue and a leading `(…)` is dropped as a direction, so backing vocals get no timing and a lip-sync segment cannot silence them | `scripts/audio-analysis/timing_core.py:265-301`; `packages/cli/src/lipsync-audio.ts:18-41` | HS-50 | high |
| G-50 | Exists but contradicts | Without `--vocals` the analysis runs Demucs and overwrites the imported `audio/stems/vocals.wav`; it ignores `song.json`'s `vocals` | `analyze.py:41-50,344-351` | HS-56 | high |
| G-51 | Exists but contradicts | A missing Demucs falls back to the mix with exit 0; zero recognized words fall back to energy sections while the report names WhisperX | `analyze.py:121-135,371,388-400` | HS-57 | medium |
| G-52 | Exists but contradicts | The schema check's default path is relative to the working directory; the documented call from `scripts/audio-analysis` skips it silently | `analyze.py:425-428`; `audio-analysis/SKILL.md` step 2 | HS-58 | medium |
| G-53 | Exists but contradicts | `validate` needs `storyboard.yaml`, so the skill's step 5 and the hook on every override edit fail during `audio-analysis` | `packages/cli/src/validate.ts:80-83`; `validate-file.ts:128-133` | HS-63 | medium |
| G-54 | Exists but contradicts | An override of an unknown section, line or word throws in `loadProject`, so every command fails, also `import-song` and `normalize-audio` | `packages/core/src/timing.ts:45-59,83-86`; `project.ts:237-241` | HS-54 | medium |
| G-55 | Missing | `assertTiming` checks neither lines inside their section nor words inside their line (or the audio); an override can break both | `timing.ts:96-165` | HS-53 | medium |
| G-56 | Exists but contradicts | Section ids drift from the tag text: `[Verse 1][Chorus][Verse 1][Verse 2]` gives `verse_3` for "Verse 2"; `[Chorus 2]` then `[Chorus]` gives `chorus_2, chorus_1` | `timing_core.py:13-55` | HS-55 | low |
| G-57 | Exists but contradicts | Lines before the first tag: Python makes a section `unlabeled`, core refuses them (`writeLyrics`) or proposes `[Intro]`; the lyrics rules live twice | `timing_core.py:51-53`; `board-wizard.ts:274-276`; `lyrics.ts:42-45` | HS-68 | low |
| G-58 | Missing | `song.json` has no schema; the wizard, `import-song` and the new-video skill write it, the analysis, the wizard and release read it, the hook does not watch it | `media.ts:285-304`; `board-wizard.ts:260-266`; `analyze.py:41-50` | HS-64 | medium |
| G-59 | Exists but contradicts | Remotion re-implements `sectionAt`, `beatAt`, `energyAt` without the tolerance (beat 0 before the first beat); core's `beatIndexAt` has no caller | `packages/remotion/src/lib/timing.ts:12-35`; `timing.ts:566-585` | HS-60 | low |
| G-60 | Exists but contradicts | The anchor string grammar (`section:<id>[:start\|end]`, `word:<line>:<i>`) lives in cli `short.ts` and is reused by release | `packages/cli/src/short.ts:26-99`; `release.ts:555-560` | HS-61 | low |
| G-61 | Missing | A replaced `audio/song.wav` (`import-song`, `normalize-audio`) does not mark the timing stale; `normalize-audio` leaves `song.json`'s duration alone | `media.ts:169-194` | HS-59 | low |
| G-62 | Exists but contradicts | Line kind, line confidence, directions and cues live untyped in `timing.meta`; cues have two shapes | `timing_core.py:396-400,624-644`; `schema.ts:215` | HS-65 | low |
| G-63 | Exists but contradicts | Release falls back to the measured timing when there is no effective timing | `packages/cli/src/release.ts:226,534` | HS-49 | low |
| G-64 | Exists but contradicts | Code, report and CLI help say "unwritten vocals", "backing words", `backingSpans`, `after_line` for echo spans | `analyze.py:291-299`; `index.ts:1029`; `lipsync-audio.ts:18` | HS-51 | low |
| G-65 | Exists but contradicts | The analysis writes `timing.json` and the report with a plain write, not atomically | `analyze.py:318,430-432` | analyst | low |
| G-66 | Exists but contradicts | Without speech recognition, downbeats are every fourth beat; with it, the phase is picked by energy | `analyze.py:219`; `timing_core.py:500` | analyst | low |
| G-67 | Dead | `StoryboardSchema.timing` (default `timing.effective.json`) is read by no code | `schema.ts:367` | analyst | low |
| G-68 | Missing | No test pins the resolver's errors, most `assertTiming` rules, the lookups, or the analysis' parentheses and stem handling (partly covered now by `tests/timing-characterization.test.ts`) | `tests/timing.test.ts`; `scripts/audio-analysis/tests/` | analyst | low |

Decisions (by recommendation, not reviewed by the user):

- GAP-AGG-ProjectTiming, GAP-AGG-Lyrics: the boundaries stay as recovered (`as-is`).
- Exists and is intended: the merge on every load; overrides that move times only and always win; the lyrics
  text winning over speech recognition; symbolic anchors with edges and offsets and a warned `time` anchor; the
  0.05 s tolerance; the Python analysis behind the generated schema (ADR 0004, 0008); the confidence thresholds
  in the report; the 0.8 lip-sync threshold as guidance in the skill; `transcribe.py` serving the bench, not the
  timing. ADR 0039 (proposed) records them.
- The song events (`EVT-SongImported`, `EVT-SongLoudnessNormalized`, `EVT-LeadStemSeparated`) belong to the
  context without an aggregate until `song.json` has a schema (G-58).

## Gaps found by the adoption of the storyboard (2026-11-21)

Candidates only – no stories until the user asks (`/adopt <scope> --stories`). Priority is a suggestion; the
user's four answers (they use lip-sync shots in music videos regularly, AI clips, motion and mixed shots but no
footage, change the storyboard only by telling the agent, and want the contact sheet on the board with images)
set G-69 high and G-70, G-73 medium.

| # | Class | Gap | Evidence | Source | Priority |
|---|---|---|---|---|---|
| G-69 | Exists but contradicts | A music-video lip-sync shot is not checked at all: no character, face, or length check, and no `source: ai-clip` rule; the skill says "≤ 30 s" instead of the provider's maximum | `packages/core/src/timing.ts:268-269`; `workspace/.claude/skills/storyboard/SKILL.md:31` | HS-72 | high |
| G-70 | Missing | The contact sheet is an SVG of text cards with no keyframes, written once in the storyboard stage and stale after a revision; the board's production view embeds it, and the user has never noticed it there | `packages/cli/src/contact-sheet.ts:72-99`; `board-production.ts:314` | HS-71 | medium |
| G-71 | Exists but contradicts | An AI clip must set both prompts: a lip-sync shot carries a video prompt nobody uses, a chained shot a keyframe prompt nobody uses | `timing.ts:407-410`; `queue.ts:364-367`; `workspace/.claude/skills/ai-clips/SKILL.md:91` | HS-73 | medium |
| G-72 | Exists but contradicts | `queue add --kind` (`buildShotItems`) and QA's continuity checks read the unvalidated storyboard; items can be built from an invalid one | `queue.ts:326-386`; `qa.ts:48-102,299` | HS-79 | medium |
| G-73 | Exists but contradicts | A mixed shot's AI-clip layer passes with only `prompts.video` and renders empty; a ChatWindow layer's lines are read from the shot's `motion.props` | `timing.ts:376-379,433`; `packages/remotion/src/components/ShotRenderer.tsx:114-124` | HS-82 | medium |
| G-74 | Exists but contradicts | The storyboard skill says "shot list", files the lyric-text rule under Episodes, asks a "storyboard critic" that does not exist, and gives the 30 s lip-sync limit | `SKILL.md:3,26,31,38,51` | HS-86 | low |
| G-75 | Exists but contradicts | The motion components are listed twice (core `MOTION_COMPONENTS`, the Remotion switch); Remotion falls back silently to `TitleCard` or `Grid` | `timing.ts:18-27`; `ShotRenderer.tsx:53-70,84,100`; `packages/remotion/README.md:30` | HS-80 | low |
| G-76 | Exists but contradicts | A shot's continuity references are resolved three times (validation, queue, QA) | `timing.ts:297-366`; `queue.ts:247-287`; `qa.ts:75-102,293-303` | HS-80 | low |
| G-77 | Exists but contradicts | Validation accepts any substring as a highlight; the renderer highlights single normalized words, so a multi-word highlight never shows | `timing.ts:442-452`; `packages/remotion/src/components/TextOverlay.tsx:29-35` | HS-81 | low |
| G-78 | Dead | `StoryboardSchema.timing`, `.style` and `.characters` are read by nothing, for either kind (extends G-67); `project.ts` and ADR 0016 say "for an episode" only | `schema.ts:365-371`; `project.ts:101-107,225-228` | HS-74 | low |
| G-79 | Dead | `layer.blend` is read by nothing | `schema.ts:288` | HS-75 | low |
| G-80 | Exists but contradicts | `fade`, `dissolve` and `wipe` render as the same opacity fade inside one shot | `packages/remotion/src/components/Transition.tsx:11-36` | HS-76 | low |
| G-81 | Exists but contradicts | `storyboard.md` is written by hand and checked by nothing; it can drift from the YAML | skill step 6; `board-production.ts:243-262` | HS-78 | low |
| G-82 | Exists but contradicts | The queue reads `clipSeconds` and `keyframeWorkflow`, and ChatWindow reads `lines`, from the untyped `motion.props` | `queue.ts:289-295,352`; `ChatWindow.tsx:35` | HS-83 | low |
| G-83 | Exists but contradicts | A section id containing `intro` or `outro` switches the renderer to a title look | `ShotRenderer.tsx:76-77` | HS-84 | low |
| G-84 | Exists but contradicts | `validate` is defined twice, in the workspace CLI and in the npx CLI, with different output | `packages/cli/src/index.ts:86-103`; `npx.ts:182-195` | analyst | low |
| G-85 | Missing | No test pinned coverage errors, order, ids, the source rules, highlights or chaining (covered now by `tests/storyboard-characterization.test.ts`); still none for the hook's storyboard path or ChatWindow layers | `tests/timing.test.ts`; `tests/contact-sheet.test.ts` | analyst | low |

Decisions (by recommendation, not reviewed by the user):

- GAP-AGG-Storyboard: the boundary stays as recovered (`as-is`).
- Exists and is intended: one storyboard model for both kinds with episode checks as branches (ADR 0016);
  coverage within one frame; symbolic anchors with a warned `time` anchor (ADR 0005); the source rules for motion,
  footage and mixed shots; continuity references checked against the bibles and the canon (ADR 0025); the hook
  blocking a failing storyboard edit; render taking the resolved shots as props; `camera` as written direction;
  the composition rules, the 3–6 s clip length and the three-revision cap as agent guidance in the skills;
  character sheets checked by the queue before generation, not by `validate`. ADR 0040 (proposed) records them.
- Footage shots are kept but get low priority: the user does not bring footage.

## Gaps found by the adoption of generation (2026-11-21)

Candidates only – no stories until the user asks (`/adopt <scope> --stories`). Priority is a suggestion. The
user's four answers set the priorities:
- They use all four providers (fal.ai, Higgsfield, Topview, ComfyUI), which sets G-86 to medium.
- Generation runs only through the stages and the queue, never by hand, which keeps G-88 and G-89 low.
- They read spend on the board and do not compare it with the bills, so planned spend is intended.
- Only the agent changes the model roles. The agent reads the provider docs, so G-93 and G-94 are medium.

| # | Class | Gap | Evidence | Source | Priority |
|---|---|---|---|---|---|
| G-86 | Exists but contradicts | fal submissions are retried up to four times on 408, 409, 429, 5xx and network errors without an idempotency key, so a retry after an accepted submission can charge twice; ADRs 0011 and 0021 derive the key from the request hash, and only Higgsfield and Topview send it | `packages/providers/src/fal.ts:77-83,205-221`; `http.ts:58-100`; `runner.ts:119` | HS-97 | medium |
| G-87 | Exists but contradicts | A paid call that returns no file, or a file that does not exist, throws without a manifest line and without recorded spend | `packages/providers/src/runner.ts:167-170`; `packages/cli/src/generate.ts:753-763` | HS-92 | low |
| G-88 | Exists but contradicts | `spend` raises the recorded spend without a manifest line, so the QA checker's rule "manifest cost sum = spend" fails afterwards | `packages/cli/src/index.ts:837-846`; `packages/cli/src/qa.ts:230-262` | HS-94 | low |
| G-89 | Exists but contradicts | `estimate` checks only the batch cap, prints a mark and exits 0; it never checks the remaining budget; a missing price is a `ValidationError` there and a `ConfigError` in `generate`; `providers.md` documents an estimate `--lipsync-provider` that does not exist | `packages/cli/src/index.ts:849-891`; `generate.ts:376`; `docs/providers.md:155` | HS-95 | low |
| G-90 | Dead | `budget.reservedUsd` is subtracted from the remaining budget and shown on the board, but nothing writes it above 0 | `packages/core/src/state.ts:199,327`; `packages/cli/src/board/production.js:241` | HS-93 | low |
| G-91 | Dead | The runner's `beforeGenerate` hook is set by no caller | `packages/providers/src/types.ts:106`; `runner.ts:101` | HS-91 | low |
| G-92 | Dead | The `retries` block of `config/defaults.yaml` (4 attempts, 1000 ms, 600000 ms) is parsed and read by no adapter; its schema default (180000 ms) differs again | `config/defaults.yaml:28-31`; `packages/core/src/project.ts:328-330`; `http.ts:70,86` | HS-96 | low |
| G-93 | Exists but contradicts | `docs/providers.md` says the cloud adapters implement every operation and ComfyUI only the video operations and lip-sync, and its interface listing lacks `generateAudio` and `upscaleVideo`; the cloud adapters have no reference-to-video, audio or restore, and ComfyUI also makes stills, edits and audio (glossary corrected in this adoption) | `docs/providers.md:78-92`; `packages/providers/src/types.ts:36-69`; `runner.ts:127-139`; `comfyui.ts:733-760` | HS-101 | medium |
| G-94 | Exists but contradicts | The docs name LTX FLF2V as the local lip-sync, but `models.yaml` and ADR 0027 run Pika first with LTX as the fallback; `providers.md` says lip-sync defaults to the video provider and in the same row that it falls back to fal; ADR 0017 does not point to ADR 0027 | `docs/providers.md:13,21`; `comfyui/README.md:82`; `config/models.yaml:609-673`; `docs/adr/0017-ltx-lipsync-flf2v-official-templates.md` | HS-101 | medium |
| G-95 | Exists but contradicts | The docs on spend and the cache are stale. The ai-clips skill warns about "forgetting to record the spend", which `generate` does itself. `providers.md` says spend is recorded per stage, but there is one total. `workspace/AGENTS.md` names five parts of the cache key, but there are more. | `workspace/.claude/skills/ai-clips/SKILL.md:180`; `docs/providers.md:163`; `workspace/AGENTS.md:12`; `runner.ts:68-84` | HS-92, HS-89 | low |
| G-96 | Exists but contradicts | The full-mix guard for lip-sync audio checks only `<project>/audio/song.*`: a series canon batch and a mix elsewhere pass, and the message names only `vocals.wav`, not the lead stem | `packages/cli/src/generate.ts:172-182` | analyst | low |
| G-97 | Exists but contradicts | Provider knowledge sits outside the adapters: about 280 lines of ComfyUI, Pika, LTX, Wan and SeedVR2 routing in `resolveItem`, the lip-sync fallback in `models.ts`, the provider list four times in core and once in providers, the operation list three times (cli lacks `upscaleVideo`), "local costs nothing" three times | `generate.ts:65,185,287-594,374,689`; `packages/core/src/models.ts:41,62,87-95`; `schema.ts:11-19`; `packages/providers/src/index.ts:19`; `packages/core/src/bench.ts:22` | HS-100 | low |
| G-98 | Exists but contradicts | Adapter mechanics are written four times: poll loops with different backoff, reference upload, two `normalizeSeed` with different moduli, three ways to strip adapter-only params | `fal.ts:35,73,240`; `higgsfield.ts:61,70-100,384,409`; `topview.ts:71,76-112,456,504-531`; `comfyui.ts:1186,1212` | HS-100 | low |
| G-99 | Exists but contradicts | The cache key hashes each reference's path next to its content, so the same file at another path misses the cache | `packages/providers/src/runner.ts:55-60,79` | HS-89 | low |
| G-100 | Exists but contradicts | The bench gives ComfyUI its own workflow folder, but `resolveItem` classifies Pika workflows from the default folder, so a bench target with its own folder can be routed wrongly | `packages/cli/src/bench.ts:338-341`; `generate.ts:345-348` | analyst | low |
| G-101 | Exists but contradicts | The queue passes an attempt's stored provider to `runBatch` with an unchecked cast; an invalid value fails late | `packages/cli/src/queue.ts:629` | analyst | low |
| G-102 | Exists but contradicts | `audio.*` roles default to ComfyUI even in a project whose image and video providers are mock, so a mock project needs `providers.audio: mock` set by hand | `packages/core/src/models.ts:95`; `schema.ts:37-48` | analyst | low |
| G-103 | Exists but contradicts | ADRs 0006 (three operations, "batch state is resumable") and 0014 (ComfyUI video only) carry no note that later ADRs changed them; ADR 0041 records the state, and the status notes follow once it is accepted | `docs/adr/0006-fal-adapter-cache-budget.md`; `docs/adr/0014-comfyui-local-video.md` | HS-102 | low |
| G-104 | Missing | No test pinned the worst-case budget check, the batch cap against the remaining budget, the planned spend of a new generation and the free reuse in `runBatch`, or the failed manifest line (covered now by `tests/generation-characterization.test.ts`); still none for the full-mix guard, the lip-sync `maxDuration` refusal, audio only on ComfyUI, `audioStartSeconds` on a cloud provider, the HTTP retry, or `estimate` | `tests/providers.test.ts`; `tests/generate-workflow.test.ts` | analyst | low |

Decisions (by recommendation, not reviewed by the user):

- GAP-AGG-CachedGeneration and GAP-AGG-ModelRoles: the boundaries stay as recovered (`as-is`).
- Exists and is intended:
  - one generation path through `runBatch` for every caller;
  - model roles and prices in configuration, changed only by the agent (user);
  - the worst-case budget check per batch, cache hits included, also for a dry run;
  - the project budget, not the batch cap, guards a queue run;
  - the workspace-wide cache;
  - planned spend instead of the provider's charge (user);
  - a reuse recorded at $0;
  - reference-to-video always on ComfyUI;
  - the lip-sync fallback to fal.ai when the video provider is ComfyUI or Topview;
  - ComfyUI and mock costing nothing;
  - the Pika model locks;
  - the import direction of `packages/providers`.

  ADR 0041 (proposed) records them.
- The release autopilot's use of fal's file upload for Instagram media is not a generation; the publish slice
  owns it.

## Decisions

- GAP-AGG-Project: the boundary stays as recovered (`as-is`); no target boundary was decided in this adoption.
- Exists and is intended (no action): kind-specific stage lists in code (ADR 0016); interactive stages run by
  the setup skill; budget check before a batch and on every recorded spend; the append-only error history
  (`state.errors`); the read-only production view and watchdog (ADR 0030, 0031); the import direction between
  packages (now checked).

## Gaps found by the adoption of the series slice (2026-11-22)

Candidates only – no stories until the user asks (`/adopt <scope> --stories`). Priority is a suggestion.

| # | Class | Gap | Evidence | Source | Priority |
|---|---|---|---|---|---|
| G-105 | Exists but contradicts | A canon generation is checked against the series total minus canon spend only; episode budgets are not subtracted, so the canon can spend money already committed to episodes | `packages/cli/src/generate.ts:260-277`; `packages/cli/src/series.ts:60-74` | HS-105 | medium |
| G-106 | Exists but contradicts | `budget_usd` of a series is optional in the schema, and a test pins that episodes are then unchecked and the canon cannot generate; `new-series`, the skill and the glossary require it | `packages/core/src/schema.ts:556-559`; `tests/series-budget.test.ts:99`; `packages/cli/src/new-series.ts:72` | HS-106 | low |
| G-107 | Missing | No command changes a series budget; the new-series skill tells the agent to edit `series.yaml` and `state.json` together by hand (as G-13 for a project) | `workspace/.claude/skills/new-series/SKILL.md` step 3; `packages/cli/src/validate-file.ts:50-62` | HS-107 | low |
| G-108 | Exists but contradicts | The series commitment is checked only when an episode is created; a later change of an episode's `budget_usd` is not checked against it | `packages/cli/src/new-project.ts:205-216` | HS-122 | low |
| G-109 | Exists but contradicts | `new --kind episode` and the wizard accept an episode number the series already has; `series-status` only reports the duplicate | `packages/cli/src/new-project.ts:101-109`; `packages/cli/src/series.ts:143-146` | HS-108 | low |
| G-110 | Exists but contradicts | `SeriesFacts.unplanned` names planned episodes without a project, while the series-status test calls episodes outside the plan "unplanned" | `packages/core/src/production.ts:113-114`; `tests/series-status.test.ts:31` | HS-109 | low |
| G-111 | Exists but contradicts | Canon readiness flags a reference voice only when a listed file is missing; a character with no voice at all passes, against the comment "speaking characters without a reference voice" | `packages/cli/src/board-production.ts:336-346` | HS-110 | low |
| G-112 | Exists but contradicts | A spoken take's text hash leaves out the speaker's reference voice and transcript, so a changed voice keeps every old take current | `packages/core/src/episode.ts:144-148` | HS-111 | medium |
| G-113 | Dead | `direction` ("Acting direction for the take") is written by the skill and the demo script but never read: it reaches neither the voice model nor the take hash | `packages/core/src/schema.ts:600-601`; `packages/cli/src/voice-track.ts:52-66` | HS-112 | low |
| G-114 | Exists but contradicts | The spoken language is fixed in field names and rules – `text_de`, the TTS rule's German abbreviations and examples, the `audio.voice` notes, `--subtitles en` only – while the new-series skill grills "the languages of speech and subtitles"; intended for now, a lock-in once a series in another language comes | `packages/core/src/schema.ts:597`; `packages/core/src/episode.ts:29-41`; `config/models.yaml` `audio.voice`; `packages/cli/src/render.ts:42-43` | HS-113 | low |
| G-115 | Exists but contradicts | `limits.episode_seconds` is checked only in QA, not when the episode track is built; `series-status.md` says the command checks the length against it | `packages/cli/src/qa.ts:314-322`; `packages/cli/src/series.ts:164-168`; `workspace/.claude/commands/series-status.md` | HS-114 | low |
| G-116 | Exists but contradicts | Take status, the blocking rule and the series budget sum are domain rules in the CLI, while the conventions put rules in core | `packages/cli/src/takes.ts:65-87`; `packages/cli/src/series.ts:60-74` | HS-115 | low |
| G-117 | Exists but contradicts | `SubtitleCue` is defined in core (with `id`) and again in remotion (without) | `packages/core/src/episode.ts:225`; `packages/remotion/src/types.ts:26` | HS-116 | low |
| G-118 | Exists but contradicts | An episode's generation `out` path may reach any file of the canon folder, existing ones included; ADR 0025 allows only appending, ADR 0016 no write at all | `packages/cli/src/generate.ts:658-665` | HS-117 | medium |
| G-119 | Exists but contradicts | ADR 0016 is out of date: "first version" with a hand-written canon and `new-series` later, `takes.json` without `file_hash`, "never writes the canon", `series/` paths; ADR 0042 records the state, the status note follows once it is accepted | `docs/adr/0016-episode-projects.md` | HS-120 | low |
| G-120 | Exists but contradicts | `seriesNextAction` proposes `/new-episode` without a slug; `series-status.md` says `/new-episode <slug>` | `packages/core/src/production.ts:120`; `workspace/.claude/commands/series-status.md` | analyst | low |
| G-121 | Missing | No test pinned the take source (subtitle and pause do not stale a take), the leading voice description under the TTS rule, the series' next action, or that an episode keeps its settings when the series changes (covered now by `tests/series-characterization.test.ts`); still none for the ambience clamp, an effect longer than the role's maximum, or a speaker without a reference voice | `tests/episode-track.test.ts`; `tests/series-budget.test.ts` | analyst | low |

Decisions (by recommendation, not reviewed by the user):

- GAP-AGG-Series, GAP-AGG-Script, GAP-AGG-TakeRegistry and GAP-AGG-EpisodeTrack: the boundaries stay as
  recovered (`as-is`).
- Exists and is intended:
  - the series in `projects/` beside its episodes, one slug namespace (ADR 0035);
  - the umbrella series budget, checked when an episode is created;
  - `budget_usd` as the source and `state.json` as its copy;
  - episode settings copied once;
  - episodes outside the plan allowed;
  - the script validated whole by the hook, written only by the agent (user);
  - the take registry with its five statuses, imported takes never generated over, stale generated takes
    generated again;
  - generated voices on ComfyUI with the speaker's reference voice (user);
  - the constructed, deterministic episode track with an optional music bed;
  - lip-sync audio of an episode from the speaker stem;
  - German speech with English subtitles for now (user).

  ADR 0042 (proposed) records them.
- `lipsync-audio.ts` and the lead-only muting are music-video logic (BC-Timing, ADR 0026), not this slice's.

## Gaps found by the adoption of the bibles and the character library (2026-11-22)

Candidates only – no stories until the user asks (`/adopt <scope> --stories`). Priority is a suggestion; the user
has not used the character library yet, so its gaps are low.

| # | Class | Gap | Evidence | Source | Priority |
|---|---|---|---|---|---|
| G-122 | Exists but contradicts | A character sheet is optional and nothing checks that a recurring on-screen character has one; the queue falls back to the first reference image, and the demo canon has no sheet at all | `packages/core/src/schema.ts:455`; `packages/cli/src/queue.ts:275`; `projects/demo-series/characters.yaml` | HS-125 | medium |
| G-123 | Exists but contradicts | Canon gaps count only a character's reference images, so a character with a sheet and no further image shows as a gap | `packages/cli/src/board-production.ts:337-346`; `packages/cli/src/series.ts:114` | HS-126 | low |
| G-124 | Exists but contradicts | Character ids are any non-empty text and may repeat; every lookup (queue, QA, use, speakers) takes the first match silently | `packages/core/src/schema.ts:452,480-489` | HS-127 | medium |
| G-125 | Exists but contradicts | `sets.yaml` is not among the outputs of `style-character`, and the two skills give `stage-done` different output lists | `packages/core/src/state.ts:52-58`; `workspace/.claude/skills/style-bible/SKILL.md` step 7; `character-bible/SKILL.md` step 7 | HS-129 | low |
| G-126 | Exists but contradicts | The canon's append-only rule for its bibles is prompt text: an episode's stage can change or remove any entry of the canon's `characters.yaml` or `sets.yaml`; the hook checks only the schema (files: G-118) | `workspace/.claude/agents/stage-runner.md`; `workspace/.claude/hooks/validate-artifacts.mjs`; `packages/cli/src/validate-file.ts:86-97` | HS-130 | medium |
| G-127 | Exists but contradicts | A series canon's characters reach the library only through a step of the `new-series` skill; plates and states an episode adds never reach it | `packages/cli/src/index.ts:786-794`; `workspace/.claude/skills/new-series/SKILL.md` step 4 | HS-131 | low |
| G-128 | Exists but contradicts | A re-import with a changed sheet or voice copies the file into the library character without naming it; a state whose renamed id is taken too is skipped after its image was copied | `packages/cli/src/character-library.ts:232,250-265` | HS-132 | low |
| G-129 | Exists but contradicts | `character use` drops a state's `from` when its parent is not chosen, and nothing checks that `from` names a state of the same character | `packages/cli/src/character-library.ts:482`; `packages/core/src/schema.ts:436-446` | HS-133 | low |
| G-130 | Exists but contradicts | No lock on a library character, the target's `characters.yaml` on use, or `references.yaml`; the board and an agent writing at once lose one change | `packages/cli/src/character-library.ts:206-525`; `packages/cli/src/board-wizard.ts:72-178`; `packages/cli/src/file-lock.ts` | HS-134 | low |
| G-131 | Exists but contradicts | A shot's continuity references are resolved three times and differently: QA checks only a prop's first image, the episode canon check only ids | `packages/core/src/timing.ts:226-366`; `packages/cli/src/qa.ts:76-103,292-313`; `packages/cli/src/queue.ts:242-286` | HS-135 | low |
| G-132 | Exists but contradicts | The display rules are listed three times (schema, cli, board), the file types and reference kinds twice, two file-name cleaners, the library-file check in the cli and the hook; the library's rules all live in the CLI | `packages/core/src/schema.ts:449,1460`; `packages/cli/src/character-library.ts:28-32,121,333`; `packages/cli/src/board/characters.js:71-74`; `packages/cli/src/board-wizard.ts:40,58`; `workspace/.claude/hooks/validate-artifacts.mjs:88-92` | HS-136 | low |
| G-133 | Missing | The style-bible skill requires a recorded licence for fonts and look references; no field holds one | `workspace/.claude/skills/style-bible/SKILL.md` completion criteria; `packages/core/src/schema.ts:383-419` | HS-138 | low |
| G-134 | Exists but contradicts | Drifted texts: `character list` prints `series/<slug>`; the hook list in `workspace/CLAUDE.md` leaves out `references.yaml`; `new-series` says episodes never change the canon | `packages/cli/src/index.ts:668`; `workspace/CLAUDE.md` Hooks; `workspace/.claude/skills/new-series/SKILL.md:9` | HS-141 | low |
| G-135 | Missing | The board's Characters view imports a whole production and cannot name one character or merge into a library character (`--id`, `--into`) | `packages/cli/src/board/characters.js:111`; `packages/cli/src/release-board.ts:274` | HS-142 | low |
| G-136 | Missing | No test pinned that an episode reads its bibles from the canon, a library character's file paths, a user reference being a file or a link, or the order of a shot's keyframe references (covered now by `tests/character-characterization.test.ts`); still none for the automatic import at `stage-done`, `updateLibraryCharacter`, path traversal on `/library-files`, duplicate character ids, or concurrent writes | `tests/character-library.test.ts`; `tests/continuity.test.ts` | analyst | low |

Decisions (by recommendation, not reviewed by the user):

- GAP-AGG-StyleBible, GAP-AGG-CharacterBible, GAP-AGG-SetBible, GAP-AGG-UserReferences and
  GAP-AGG-LibraryCharacter: the boundaries stay as recovered (`as-is`).
- Exists and is intended:
  - an episode reads its style, characters and sets from the canon and has none of its own;
  - music videos have their own set bible when shots return to a place or an object (user);
  - continuity references generated first and judged on their own, corrections regenerated by the agent (user);
  - user references as a file or a link, used by the grilling and the bibles (user: sometimes);
  - the library: one character, one library character, files stored once by content, copies not links,
    states only when chosen, owned by the user and never touched by `update`;
  - a failed library import only warns;
  - a bible's files checked where they are used (queue, QA), not when it is written;
  - the look and the prompts as agent guidance.

  ADR 0043 (proposed) records them.
- The canon's spend for an episode's appended references stays on the episode budget (ADR 0025); name replacement
  in Wan prompts for canon generations (`seriesTarget` passes no characters) is the generation slice's.
