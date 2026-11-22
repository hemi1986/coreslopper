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
| GAP-AGG-Render | as-is boundary | [AGG-Render](events.yaml) | [BC-Render](context-map.as-is.md#bc-render--render) | – | one file per format and variant, renders/[preview-]<format>[.en].mp4, written whole – rendered in segments under .cache/render/, joined, the song muxed once, and only then copied over the old file (packages/cli/src/render.ts:182-184,293-445)<br>a whole render of a format – not a preview, not --frames, not --out – is recorded in state.json artifacts as render:<file>:inputs (the hash of the props, the song's bytes and crf 18) and render:<file>:sha256 (render.ts:267-291,431-433); release renders a format again when it is missing or its recorded inputs hash differs from the current one (packages/cli/src/release.ts:237-262) | Decide the target boundary |
| GAP-AGG-Short | as-is boundary | [AGG-Short](events.yaml) | [BC-Render](context-map.as-is.md#bc-render--render) | – | renders/shorts/<name>-9x16.mp4, cut whole by short from renders/9x16.mp4 with one ffmpeg re-encode – crf 18, a 0.15 s fade-in and a 0.4 s fade-out (packages/cli/src/short.ts:22-24,132-175,200-233); its thumbnail and TikTok cover lie beside it as <name>-thumb.jpg and <name>-tiktok.jpg (packages/cli/src/release-files.ts:26-34) | Decide the target boundary |
| GAP-AGG-ComposedImage | as-is boundary | [AGG-ComposedImage](events.yaml) | [BC-Render](context-map.as-is.md#bc-render--render) | – | one JPEG and its recipe <name>.recipe.json beside it, written by thumbnail in one run – a Remotion still of the Thumbnail composition, encoded at falling JPEG quality until it fits the limit, then the recipe (packages/cli/src/thumbnail.ts:183-217; packages/cli/src/thumbnail-recipe.ts:35-58)<br>five formats with fixed sizes and limits – 16x9 1280x720, 9x16 1080x1920, 3x4 1080x1440, 4x5 1080x1350, 1x1 3000x3000; under 2 MB, under 10 MB for 1x1 (packages/remotion/src/lib/thumbnail.ts:12-18,60-66) | Decide the target boundary |
| GAP-AGG-ReleasePackage | as-is boundary | [AGG-ReleasePackage](events.yaml) | [BC-Release](context-map.as-is.md#bc-release--release) | – | renders/release/ with manifest.json, written last by buildRelease – every file placed (hardlink or copy), generated or composed by a ReleaseWriter that records size, SHA-256, specification and source (packages/cli/src/release.ts:132-175,207-447; packages/core/src/schema.ts:1268-1311)<br>review/upload.yaml, the upload data the agent writes and every layout, check and publish reads (schema.ts:796-926; workspace/.claude/skills/video-qa/release.md §7) | Decide the target boundary |
| GAP-AGG-ReleaseCalendar | as-is boundary | [AGG-ReleaseCalendar](events.yaml) | [BC-Release](context-map.as-is.md#bc-release--release) | – | review/calendar.yaml, one per project, written whole by planCalendar from buildCalendar, which reads the workspace's release schedule and every other project's calendar (packages/cli/src/release-calendar.ts:49-57,94-110; packages/core/src/calendar.ts:133-225; schema.ts:1033-1055) | Decide the target boundary |
| GAP-AGG-ReleaseStatus | as-is boundary | [AGG-ReleaseStatus](events.yaml) | [BC-Release](context-map.as-is.md#bc-release--release) | – | review/release-status.json, written by updateStatus and writeStatus under the project's release lock review/.release.lock (packages/cli/src/release-calendar.ts:28-31,118-142; packages/cli/src/release-autopilot.ts:52-58,66-89; schema.ts:1058-1085) | Decide the target boundary |
| GAP-AGG-PublishLog | as-is boundary | [AGG-PublishLog](events.yaml) | [BC-Publish](context-map.as-is.md#bc-publish--publishing) | – | review/publish.json, read validated and written after every item by publishProject – the publish command's and the autopilot's YouTube and TikTok uploads alike (packages/cli/src/publish.ts:113-116,217-227,413-476; packages/core/src/schema.ts:1136-1164) | Decide the target boundary |
| GAP-AGG-AutopilotLog | as-is boundary | [AGG-AutopilotLog](events.yaml) | [BC-Publish](context-map.as-is.md#bc-publish--publishing) | – | review/autopilot.json, appended only under the project's release lock review/.release.lock; the claim plans again from the fresh release status and log and appends the running entry in the same lock (packages/cli/src/autopilot-state.ts:46-65; packages/cli/src/release-autopilot.ts:258-273; packages/core/src/schema.ts:1087-1132)<br>the autopilot state of every calendar event, a pure function of the release status, the log, the settings, the readiness and the clock (packages/core/src/autopilot.ts:147-211) | Decide the target boundary |
| GAP-AGG-AutopilotRound | as-is boundary | [AGG-AutopilotRound](events.yaml) | [BC-Publish](context-map.as-is.md#bc-publish--publishing) | – | .cache/release-run.lock, a holder lock with pid, host and time, stale after two hours, and .cache/release-run.last with the time and interval of the last round (packages/cli/src/release-autopilot.ts:173-212; packages/cli/src/file-lock.ts:45-81; packages/cli/src/autopilot-state.ts:28-42) | Decide the target boundary |
| GAP-AGG-PlatformCredentials | as-is boundary | [AGG-PlatformCredentials](events.yaml) | [BC-Publish](context-map.as-is.md#bc-publish--publishing) | – | the workspace's .env (mode 0600), written by saveEnvValue from publish-auth and from the adapters when a token rotates (packages/cli/src/publish-auth.ts:24-34; packages/cli/src/social-auth.ts:51-127; packages/providers/src/publish/x.ts:227-232; tiktok.ts:253-257); readiness from autopilotReadiness (packages/cli/src/autopilot-state.ts:68-91) | Decide the target boundary |
| GAP-AGG-WorkspaceMarker | as-is boundary | [AGG-WorkspaceMarker](events.yaml) | [BC-Workspace](context-map.as-is.md#bc-workspace--workspace) | – | coreslopper.workspace.json at the workspace root – version, runtime version, created, the first project, the last update and the baseline (SHA-256 per runtime file) – written whole by init and by every update that is not a dry run (packages/cli/src/workspace.ts:6-17; packages/cli/src/init.ts:167-176,324; packages/cli/src/update.ts:96-99,308-315)<br>updateWorkspace classifies every runtime file against the baseline and the workspace in one pass, then writes the new baseline (update.ts:192-353) | Decide the target boundary |
| GAP-AGG-RuntimeSnapshot | as-is boundary | [AGG-RuntimeSnapshot](events.yaml) | [BC-Workspace](context-map.as-is.md#bc-workspace--workspace) | – | runtime/, built whole from the tracked files by build-runtime.mjs through planRuntime, which classifies every tracked path as shipped, shipped from workspace/ or not shipped (scripts/runtime-files.mjs:20-149; scripts/build-runtime.mjs:19-80)<br>the npm package carries dist/cli.js and runtime/ (package.json bin and files; tsup.config.ts) | Decide the target boundary |
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

## Gaps found by the adoption of the render slice (2026-11-22)

Candidates only – no stories until the user asks (`/adopt <scope> --stories`). Priority is a suggestion.

| # | Class | Gap | Evidence | Source | Priority |
|---|---|---|---|---|---|
| G-137 | Exists but contradicts | `render --frames` without `--out` writes `renders/<format>.mp4`, the recorded render's file, and records nothing; `release` then takes the passage as current and only warns that the file hash differs. The fix pass renders a passage after every review round | `packages/cli/src/render.ts:182-184,299-303,431-433`; `packages/cli/src/release.ts:239-262`; `workspace/.claude/skills/assembly-render/SKILL.md` Review rounds step 4 | HS-146 | high |
| G-138 | Exists but contradicts | The render record's inputs hash covers the props, the song and crf, but not the bytes of the assets or the renderer's code, and the segment cache is keyed the same way; QA's `Master render` check and `short` check only that the file exists | `render.ts:275-279,355-358`; `packages/cli/src/qa.ts:350-372`; `packages/cli/src/short.ts:200-221` | HS-147 | medium |
| G-139 | Missing | A Short does not record the 9:16 render it was cut from, and `release` never cuts again, so a Short can show an older video | `short.ts:200-233`; `release.ts:237-262` | HS-148 | medium |
| G-140 | Missing | `new-series` does not link a series canon's `assets/` and `renders/` into `CORESLOPPER_MEDIA_DIR`; the canon's sheets, plates and props stay in the workspace | `packages/cli/src/new-series.ts:67-104`; `packages/cli/src/new-project.ts:182-186` | HS-154 | medium |
| G-141 | Exists but contradicts | Drifted texts: ADR 0007 (a composition per format, frame-hash tests); ADR 0018, `packages/remotion/README.md`, `types.ts:122` and the `thumbnail` help (two or three thumbnail formats, the repository as `publicDir`); `assembly-render` (a 1920x1080 master, `--format 16x9` steps, "forgetting to mute AI clips", 9:16 and 1:1 without 4:5); `remotion-motion` (no `MOTION_COMPONENTS`, no 4:5); `video-qa` ("16:9 master") | the files named | HS-160 | medium |
| G-142 | Exists but contradicts | `short` accepts any anchor or second; the section-boundary rule lives only in the glossary and `video-qa` | `short.ts:39-99`; `docs/glossary.md` Short; `workspace/.claude/skills/video-qa/SKILL.md` | HS-149 | low |
| G-143 | Exists but contradicts | A derivative's own `fps` is ignored silently; `FormatSchema.aspect` accepts any text while four format ids exist; the ids are listed in `render.ts`, Remotion's types and the thumbnail formats | `render.ts:46-71`; `packages/core/src/schema.ts:3-8`; `packages/remotion/src/types.ts:3`; `packages/remotion/src/lib/thumbnail.ts:12-18` | HS-150 | low |
| G-144 | Exists but contradicts | QA checks determinism only with `--determinism`, in one process; CI hashes only thumbnails, no video frame | `qa.ts:383-417`; `docs/adr/0007-remotion-deterministic-renderer.md`; `tests/thumbnail-render.test.ts` | HS-151 | low |
| G-145 | Dead | `style.motion.easing` is never read (the backdrops hard-code their easing); `MIN_READABLE_SIZE` is never used | `schema.ts:404`; `packages/remotion/src/components/Backdrops.tsx:97`; `lib/thumbnail.ts:114` | HS-153, HS-152 | low |
| G-146 | Missing | No lock around a render: two renders of the same output share and delete one work folder; `recordRender` saves `state.json` without a lock (see G-1) | `render.ts:282-291,306-313,430` | HS-155 | low |
| G-147 | Exists but contradicts | Logic twice: colour resolution (core palette for the video, a strict copy in `thumbnail.ts`), the record keys as a literal in `release.ts`, crf 18 in the render and in the hash, 3D detection by component name | `packages/cli/src/thumbnail.ts:57-82`; `packages/core/src/palette.ts:79-97`; `release.ts:242`; `render.ts:277,335-339,383` | HS-156 | low |
| G-148 | Exists but contradicts | `render --still` writes `renders/still-<frame>.png` for every format and ignores `--out`; `thumbnail` copies its source into `.cache/thumbnail/` and never removes it | `render.ts:316-331`; `thumbnail.ts:151-154` | HS-157 | low |
| G-149 | Missing | No test of `renderProject` (segments, resume, mux, the record), `cutShort` end to end, `checkThumbnails`, QA's determinism check, or the `--frames` overwrite; covered now by `tests/render-characterization.test.ts`: the master frame rate for derivatives, the props, the record keys and inputs hash, the recipe round trip, and the composed-image file checks | `tests/render-characterization.test.ts`; `tests/release.test.ts`; `tests/thumbnail.test.ts` | analyst | low |

Decisions (by recommendation, not reviewed by the user):

- GAP-AGG-Render, GAP-AGG-Short and GAP-AGG-ComposedImage: the boundaries stay as recovered (`as-is`).
- Exists and is intended:
  - one `MusicVideo` composition for every format at the master's frame rate, derivatives rendered again with focus
    points (user: 16:9 today, every social format from now on);
  - the song as the only sound, clips and footage muted;
  - previews at half scale, never recorded;
  - renders in resumable segments with work files outside `renders/`;
  - Shorts cut by the agent from the 9:16 render, at most 60 s, with short fades (user: the agent picks them);
  - three thumbnails of different subjects, one taken as it is (user), and one command for every composed image
    with its recipe;
  - the media directory through links, so every project path keeps working (user: media in a separate folder);
  - the CLI reaching Remotion by relative path, Remotion taking runtime values only from `core/browser`.

  ADR 0044 (proposed) records them.
- 1:1 serves the Instagram feed by default (`config/defaults.yaml`); 4:5 stays optional per project. The feed
  post's choice of format is the release slice's.

## Gaps found by the adoption of the release slice (2026-11-22)

Candidates only – no stories until the user asks (`/adopt <scope> --stories`). Priority is a suggestion.

| # | Class | Gap | Evidence | Source | Priority |
|---|---|---|---|---|---|
| G-150 | Missing | A proposed release day is fixed only by the approval. The user posts by hand without approving, so the day stays a proposal and a TODO, also at the distributor step (T−21), and `calendar --replan` proposes a new day | `packages/core/src/calendar.ts:136-142,224`; `packages/cli/src/release-autopilot.ts:66-98`; `packages/cli/src/release-board.ts:452-464` | HS-165 | high |
| G-151 | Exists but contradicts | The board's background release (after a live URL or an approval) runs without renders and stills; a stale format or a changed dated image is skipped, and the clean-up deletes the earlier copy from the release folder | `packages/cli/src/release.ts:255-258,433-437,497-502`; `release-board.ts:37-40,448-462` | HS-167 | high |
| G-152 | Exists but contradicts | QA and `release` check different things: QA misses invalid chapters, the YouTube description's bytes, `linkedin.md` (its comment says otherwise) and the 15-hashtag YouTube limit, which nothing checks; the upload checks call a missing item WARN, the release checks TODO | `release.ts:378-382,428-429`; `packages/cli/src/release-qa.ts:35-38,206-209`; `packages/cli/src/qa.ts:177-221`; `packages/core/src/schema.ts:1170-1184` | HS-172 | medium |
| G-153 | Exists but contradicts | The board reads `upload.yaml` with `.catch(() => undefined)`; a broken file shows as no texts, without the error | `packages/cli/src/release-board-data.ts:401` | HS-173 | medium |
| G-154 | Exists but contradicts | The live YouTube URL never reaches `texts/x.md` and `texts/linkedin.md` in the folder (ADR 0028 says it does); only the board fields and the microsite data get it | `packages/cli/src/release-texts.ts:751,792`; `release-board-data.ts:442,529,639`; `docs/adr/0028-release-board-and-calendar.md` | HS-166 | medium |
| G-155 | Missing | The microsite data has no schema (a TypeScript interface only), the autopilot writes a second copy, and its `release_date` falls back to the proposed day | `packages/cli/src/release-microsite.ts:8-77`; `release-autopilot.ts:432-438` | HS-178 | medium |
| G-156 | Exists but contradicts | Locale defaults upstream: German jurisdiction notes (Impressum, § 5 DDG) in both languages, a `de`/`en` switch in five places and a third mechanism in `upload-text`, a German channel example, a German ISRC example, `Europe/Berlin` in the schedule template, tests pinned to Berlin and German; dated platform facts in code text | `release-board-data.ts:162-207,434`; `release-texts.ts:473,706`; `packages/cli/src/release-images.ts:39`; `release-microsite.ts:26,40`; `packages/cli/src/upload-text.ts:81-83`; `schema.ts:80,937`; `templates/channel/`; `vitest.config.ts:18`; `tests/helpers/release-fixture.ts:60,83` | HS-176 | medium |
| G-157 | Exists but contradicts | Drifted texts: ADR 0019 (a missing package is a WARN), ADR 0028 (kept times, never colliding, the live URL in the files), `docs/architecture.md:190` (the board's only write), `/video-next` after the pipeline (`publish --dry-run`, not the board), `video-qa/release.md` (the calendar planned first, a `✖` line per limit), the glossary's Upload Text and Announcement (fixed in this pass) | the files named | HS-180, HS-171 | medium |
| G-158 | Exists but contradicts | Only the board's button checks the approval's blockers (no release folder, upload data or calendar); the API and `release-approve` approve without them | `release-board-data.ts:719-722`; `release-autopilot.ts:66-81`; `packages/cli/src/index.ts:421-437` | HS-168 | low |
| G-159 | Exists but contradicts | The production view counts any approval (`Boolean(status.approval)`), also one for a day that moved | `packages/cli/src/board-production.ts:273-274`; `packages/core/src/production.ts:78`; `packages/core/src/autopilot.ts:142-144` | HS-169 | low |
| G-160 | Missing | A release day the user sets is not checked against other releases, skip days or the lead time | `calendar.ts:137-142` | HS-170 | low |
| G-161 | Missing | No lock around the release folder, `manifest.json` or `calendar.yaml`; the board serializes refreshes only in its process; `approveRelease` writes in three steps; a file-lock holder over 60 s loses the lock; two projects planned at once can take one slot | `release.ts:433-445`; `packages/cli/src/release-calendar.ts:49-57,94-110`; `release-autopilot.ts:65-82`; `packages/cli/src/file-lock.ts:12-38`; `release-board.ts:158-167` | HS-174 | low |
| G-162 | Exists but contradicts | Logic twice or three times: the release context (`buildRelease`, `projectReleaseContext`), the folder layout (writer, board regexes, QA), chapters checked in `release` only, the X link counting, the hashtag count, the AI-share rule, the section-tag pattern, the text-file list, the `song.json` reader; `buildRelease` and QA find the workspace from the working directory, not the board's root | `release.ts:188,216-231,263,296-306`; `release-board-data.ts:353-402,422,444`; `release-qa.ts:36-42,90,128-131,178`; `packages/cli/src/board/release.js:43` | HS-175 | low |
| G-163 | Exists but contradicts | Checklist lines are keyed by position (`<event>#<index>`), so ticks move when a line appears or goes; `calendar --done-until` records no `by` | `board/release.js:154-166`; `release-board-data.ts:521`; `release-calendar.ts:175-183` | HS-179 | low |
| G-164 | Missing | An episode gets no release-day TODO, so it can be approved on a proposed day without one | `release.ts:233`; `packages/core/src/release.ts:230-259` | HS-181 | low |
| G-165 | Dead | The skip branch of the LinkedIn text never runs, because `linkedin.md` is written only for `post` | `release-texts.ts:787-791,826-837` | analyst | low |
| G-166 | Missing | No test of a user release day that collides, a date move dropping moved times (now pinned), done marks across a new day, the approval despite blockers, QA's missing chapter and byte checks, the X and LinkedIn limits (now pinned), the microsite disclosure, the board hiding a broken `upload.yaml`, the English branches of the texts and images, any concurrent writer; covered now by `tests/release-characterization.test.ts`: a proposed day kept, a new day planning every event again, the approval holding for one day, the X and LinkedIn limits, the chapter rules | `tests/release-characterization.test.ts`; `tests/release-folder.test.ts`; `tests/release-calendar.test.ts` | analyst | low |

Decisions (by recommendation, not reviewed by the user):

- GAP-AGG-ReleasePackage, GAP-AGG-ReleaseCalendar and GAP-AGG-ReleaseStatus: the boundaries stay as recovered
  (`as-is`).
- Exists and is intended:
  - one release folder with a manifest, assembled mechanically and idempotently, the texts written by the agent and
    laid out and checked by code (user: takes the texts as they are);
  - facts never invented, a TODO never failing, the channel's release defaults filling gaps;
  - the release calendar planned across the workspace from the release schedule, the user's day winning, a new
    release day planning every event again (user: takes the proposed day);
  - the release board as the place to post from, tick off and record live URLs, writing only from its own page
    (user: posts by hand from the board);
  - the approval holding for one release day, not for the content, and withdrawing it keeping the done marks;
  - the distributor upload manual from the folder and `texts/spotify.md` (user: uses the distributor);
  - hashtag sets applied by the agent; English episode subtitles.

  ADR 0045 (proposed) records them.
- The user uses the distributor and the microsite; canvas, lyrics files, the pitch and the announcement stay product
  features, so their gaps rank low (user, 2026-11-22).
- The release autopilot's use of the approval, publish, the post adapters, the timer and the watchdog are the
  publish slice's.

## Gaps found by the adoption of the publish slice (2026-11-22)

Candidates only – no stories until the user asks (`/adopt <scope> --stories`). Priority is a suggestion. The user
posts by hand today and means to set the autopilot up later, so every gap here bites at the first approved release.

| # | Class | Gap | Evidence | Source | Priority |
|---|---|---|---|---|---|
| G-167 | Missing | The board container runs with `TZ=UTC` unless the user sets `TZ`; a release schedule without `timezone` (the template leaves it commented out) then plans a new release day in UTC, and `--done-until today` is UTC's day. Nothing warns | `compose.yaml:14`; `packages/core/src/calendar.ts:22-23`; `templates/channel/release-schedule.yaml:7`; `docs/adr/0031-watchdog-and-board-container.md` | HS-194 | low |
| G-168 | Exists but contradicts | Never twice holds only for the post adapters: the YouTube upload and TikTok never mark a send that may have gone out, `publishProject` rethrows a plain `Error` and drops the flag, and TikTok's init and status calls are retried five times – a direct TikTok post could go out twice | `packages/cli/src/publish.ts:457-467`; `packages/providers/src/publish/tiktok.ts:385-396,447-455`; `packages/providers/src/publish/http.ts:47-83`; `packages/cli/src/release-autopilot.ts:362-368` | HS-187 | medium |
| G-169 | Missing | `review/publish.json` is written from a copy read at the start, without a lock, while the autopilot writes it too; `.env` is read, changed and written without a lock or an atomic rename, by `publish-auth` and by token rotation in the container | `publish.ts:419,452-464`; `packages/cli/src/publish-auth.ts:24-34`; `packages/cli/src/init.ts:78-86`; `packages/providers/src/publish/x.ts:227-232` | HS-189 | medium |
| G-170 | Exists but contradicts | Withdrawing the approval "stops what has not gone out", but a YouTube upload scheduled with `publishAt` still goes public, and the plan checks the approval before running and stuck, so a post that may be live shows as "automatic after approval" | `packages/core/src/autopilot.ts:170-178`; `release-autopilot.ts:84-88,385`; `docs/glossary.md` (Release Approval, fixed in this pass) | HS-190 | medium |
| G-171 | Exists but contradicts | Drifted texts: ADR 0023 and the `PublishAdapter` doc (nothing goes public; Instagram later through the same interface), the schema comment (Instagram not yet), `docs/publishing.md` (`TIKTOK_DIRECT_POST` for `publish`, only the `youtube.upload` scope, the pinned comment for Shorts), `docs/release-platforms.md` (no LinkedIn refresh), the board's "they stay manual", `release-run --plan`'s help (only approved events); the glossary's Release Autopilot and Publish Adapter (fixed in this pass) | `packages/providers/src/publish/types.ts:46-50`; `packages/core/src/schema.ts:764`; `docs/publishing.md:28,102,128`; `docs/release-platforms.md`; `packages/cli/src/board/release.js:27`; `packages/cli/src/index.ts:407` | HS-201, HS-186 | medium |
| G-172 | Exists but contradicts | TikTok's direct mode has two switches: `autopilot.tiktok_direct`, and `TIKTOK_DIRECT_POST`, read as `1/true/yes` for the scopes but only as `'1'` by the runner; the error texts tell the user to unset the env value | `tiktok.ts:45-51,301,425`; `release-autopilot.ts:391,399` | HS-188 | low |
| G-173 | Missing | A pending TikTok draft or private YouTube upload that needs the user has no button on the board; TikTok's status is never read, so a draft ends only with the done checkbox | `board/release.js:121-125`; `release-autopilot.ts:243-250`; `autopilot.ts:179-183` | HS-191 | low |
| G-174 | Missing | The X price is written into each posted entry and read by nothing; the YouTube quota counts only inserts and thumbnails, not the autopilot's status reads, description updates and comments; the runner drops the publish plan's warnings (`log: () => undefined`) | `x.ts:39,240-272`; `release-autopilot.ts:393,500`; `publish.ts:230-235`; `packages/providers/src/publish/youtube.ts:23` | HS-192 | low |
| G-175 | Exists but contradicts | The board's autopilot route takes retry and force for any id up to 200 characters, in any state, also for ids not on the calendar; a retry on a pending event makes it due again | `packages/cli/src/release-board.ts:465-476`; `release-autopilot.ts:111-115`; `autopilot.ts:135-139` | HS-193 | low |
| G-176 | Missing | "The container or the timer, not both" is only printed; `.cache/watch.log` grows without bound and takes the microsite command's output | `index.ts:367-371`; `packages/cli/src/release-timer.ts:57`; `release-autopilot.ts:141-151` | HS-195 | low |
| G-177 | Exists but contradicts | Two readiness rules: `doctor` calls LinkedIn ready only with ten days left, the plan with any; an expired LinkedIn token with a refresh token is blocked although the adapter would refresh it | `packages/cli/src/doctor.ts:108-178`; `packages/cli/src/autopilot-state.ts:68-91`; `packages/providers/src/publish/linkedin.ts:248-270` | HS-196 | low |
| G-178 | Exists but contradicts | Code names that say otherwise: the timer `coreslopper-release-run`, its script `release-run.sh` and the files `release-run.lock`/`.last` run or serve the whole watchdog round; the post adapters are `XPublisher`, `LinkedInPublisher`, `InstagramPublisher` behind `SocialAdapter` | `release-timer.ts:30,40`; `autopilot-state.ts:28`; `packages/providers/src/publish/social.ts` | HS-185 | low |
| G-179 | Dead | Unused imports `open`, `rm`, `stat`; the unused export `redactLinkedIn`; branches that cannot run (a failed entry from `publishProject`, the mock filter in `mainVideoId`, the WSL distro fallback); the direct-mode expression twice; YouTube URL building three times | `release-autopilot.ts:3,391,397,399`; `linkedin.ts:393`; `autopilot.ts:127`; `release-timer.ts:75` | HS-202 | low |
| G-180 | Missing | No test of `socialAuth`, `watchRound`, a withdrawal during a round, the pinned comment's failure path, the microsite step, the audited schedule and its 20-minute margin, a quota that turns fatal, the autopilot reusing a manual publish entry, a fatal runner failure, or the cost in the log; covered now by `tests/publish-characterization.test.ts`: the autopilot defaults, a YouTube upload due a day ahead but late from its calendar time, retries counting failed attempts with the back-off, a done mark and a take-over winning before the approval | `tests/publish-characterization.test.ts`; `tests/release-autopilot.test.ts`; `tests/release-autopilot-plan.test.ts` | HS-203 | low |

Decisions (by recommendation, not reviewed by the user):

- GAP-AGG-PublishLog, GAP-AGG-AutopilotLog, GAP-AGG-AutopilotRound and GAP-AGG-PlatformCredentials: the boundaries
  stay as recovered (`as-is`).
- Exists and is intended:
  - `publish` as the user's own command for a private upload or a draft, never a stage, never public;
  - the autopilot posting only an approved release, every platform with an API, at its calendar time, through one
    upload path for YouTube and TikTok (user: every platform wanted);
  - the state derived every round; the take-over a mark in the release status;
  - the failure classes: fatal waits at once, uncertain is stuck, the rest is retried with a back-off; missed posts
    wait for Post now;
  - one round per workspace under a host-aware lock, from the board container or the timer (user: the board
    container);
  - the board as the one place that shows what needs the user, without notifications (user: the board is enough);
  - Instagram's files on the user's fal.ai storage; the microsite command from the user's configuration;
  - posting cost kept apart from the generation budget.

  ADR 0046 (proposed) records them.
- The approval, done marks and live URLs are the release slice's; the production scan is the pipeline's.

## Gaps found by the adoption of the workspace slice (2026-11-22)

Candidates only – no stories until the user asks (`/adopt <scope> --stories`). Priority is a suggestion. The user
created their workspace with `npx coreslopper init`, takes new versions with `update`, sometimes edits workflow files
there with Claude and carries them upstream, and means to run the board in the container. Their next `update` is the
first one after 0.8.0: it brings the payload split, series in `projects/` and the board container at once.

| # | Class | Gap | Evidence | Source | Priority |
|---|---|---|---|---|---|
| G-181 | Exists but contradicts | A conflict is reported once: the baseline takes upstream's hash of the conflicted file, so the next update takes the unmerged file for a local change and keeps it silently; the conflict copy is never named again, and neither `doctor` nor `update` looks for leftover copies | `packages/cli/src/update.ts:232,251-263`; `tests/workspace-characterization.test.ts` | HS-209 | medium |
| G-182 | Missing | `update` counts the workspace's own changes to workflow files (`keptLocal`) but names none, also in a dry run; nothing lists what to carry upstream | `update.ts:251-255,363` | HS-210 | low |
| G-183 | Exists but contradicts | The upstream CI and the issue and pull request templates ship into every workspace; `ci.yml` runs on a push to main and calls `npm run build` and `npm pack`, which the runtime's `package.json` removed, so a workspace on GitHub runs a red CI (inference, not run) | `scripts/runtime-files.mjs:60`; `.github/workflows/ci.yml:104-118`; `scripts/build-runtime.mjs:66-68`; `tests/runtime-files.test.ts` | HS-211 | medium |
| G-184 | Missing | `update` never says that it changed `docker/` and the board image needs `docker compose build` (only `docs/board.md` says so); every workspace's container uses the one image name `coreslopper-board` | `compose.yaml:7-8`; `update.ts:355-381`; `docs/board.md` | HS-212 | low |
| G-185 | Exists but contradicts | A package named `coreslopper` with `templates/project` is a workspace without a marker: a half-finished init passes and `update` then runs without a baseline; the upstream repository passes too, and `doctor` there fails its required `.claude/skills/video-brief` check | `packages/cli/src/workspace.ts:27-32`; `doctor.ts:216`; `tests/workspace-characterization.test.ts` | HS-213 | low |
| G-186 | Exists but contradicts | Drifted texts: `docs/architecture.md` (update by `init --force`, the npx commands, the keys); ADR 0010 (Suno in `.mcp.json`, `init --force`); ADR 0012 (only `projects/**`; nothing on the refusals, the legacy skip, the install); `docs/onboarding.md` (`update --force` once without a baseline overwrites local edits, a plain update records it; `series/` missing among the user's folders; a deleted `package-lock.json` comes back); `workspace/CLAUDE.md`'s hook matcher; three doctor descriptions; three next-step texts; onboarding texts for music videos only; shipped characterization tests citing `docs/domain/`, which does not ship | `docs/architecture.md:225`; `docs/adr/0010-npx-onboarding.md`; `docs/adr/0012-workspace-update.md`; `docs/onboarding.md:176-199`; `workspace/CLAUDE.md`; `npx.ts:59,130`; `index.ts:1376`; `init-command.ts:43`; `init.ts:207`; `onboarding.ts:331,354` | HS-214 | medium |
| G-187 | Exists but contradicts | `init` records the CLI's own version in the marker, `update` the runtime's | `init.ts:170`; `update.ts:161-168,310`; `tests/workspace-characterization.test.ts` | HS-215 | low |
| G-188 | Exists but contradicts | Two CLIs: the workspace CLI's `init` cannot find a runtime in a workspace, its `doctor` takes no directory, the init options are written twice; npx's `--runtime` is dropped in the interactive init (see also G-84) | `npx.ts:63-100,128`; `index.ts:494-529,1375`; `workspace.ts:73-76`; `init-command.ts:62-87` | HS-216 | low |
| G-189 | Exists but contradicts | Onboarding installs uv, Python and Claude Code before "Create the workspace now?" and then says "No files were written"; the first project's budget minimum is hard-coded to 5 beside `defaults.budget.minimum_usd` | `onboarding.ts:119-164,446-449,499-507`; `new-project.ts:85` | HS-217 | low |
| G-190 | Exists but contradicts | Three lists of skipped directories and three `.env` filters: the runtime build (8, top level), `update` (11, any depth), `init` (update's list, but only `.env` and `.env/…`); latent, no tracked path hits the difference | `scripts/runtime-files.mjs:94-109`; `update.ts:18-56`; `init.ts:111-118` | HS-218 | low |
| G-191 | Missing | `migrate-layout` writes the rewritten paths before it moves the folders; a failure in between leaves paths pointing at folders that are not there yet | `migrate-layout.ts:141-142` | HS-219 | low |
| G-192 | Missing | No test of `runDoctor`, onboarding, the init guards, `init --force` into a non-empty directory, the `.env` mode, the Topview key check, `update`'s refusal of the source repository and its install trigger, the runtime's `package.json`, the sandbox, the container's entrypoint; nothing but the CI pack smoke test keeps Remotion out of the npx bundle | `tests/init.test.ts`; `tests/update.test.ts`; `.github/workflows/ci.yml:104-118` | HS-220 | low |

Decisions (by recommendation, not reviewed by the user):

- GAP-AGG-WorkspaceMarker and GAP-AGG-RuntimeSnapshot: the boundaries stay as recovered (`as-is`).
- Exists and is intended:
  - a workspace as a private copy of the runtime, created by `npx coreslopper init` and kept current by `update`
    (user: both are their path);
  - the three-way update against the baseline: untouched files follow upstream, the user's edits stay, a file both
    changed gets a conflict copy, a file carried upstream byte for byte is taken silently (user: edits workflow files
    with Claude and carries them upstream);
  - `projects/`, `series/` and `library/` add-only; `.env`, `.mcp.json`, `GETTING_STARTED.md` and the marker never
    written by `update`; `package-lock.json` always upstream's;
  - no downgrade and no overwrite without `--force`; the legacy layout skipped until `migrate-layout` ran;
  - every tracked file classified, the engineering layer never shipped (ADR 0036);
  - the board container: the workspace mounted, the dependencies in a volume, the loopback port, the workspace
    owner's user (user: wants the board in the container).

  ADR 0047 (proposed) records them.
- The container's time zone stays G-167 (publish slice); `doctor`'s publish and autopilot rows are the publish slice's.
