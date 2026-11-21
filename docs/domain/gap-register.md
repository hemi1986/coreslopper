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

## Decisions

- GAP-AGG-Project: the boundary stays as recovered (`as-is`); no target boundary was decided in this adoption.
- Exists and is intended (no action): kind-specific stage lists in code (ADR 0016); interactive stages run by
  the setup skill; budget check before a batch and on every recorded spend; the append-only error history
  (`state.errors`); the read-only production view and watchdog (ADR 0030, 0031); the import direction between
  packages (now checked).
