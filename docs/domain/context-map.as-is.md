# As-is context map – coreslopper

> Recovered from code by `/adopt` on 2026-11-21 at b195086. This is **not a target**.
> Target: [context-map.md](context-map.md) · Gap register: [gap-register.md](gap-register.md).

Adopted slices: project and stage pipeline; human review; art-director verdicts and the generation queue (decided by recommendation); song timing and lyrics (decided by recommendation, four answers from the user); the storyboard (decided by recommendation, four answers from the user); generation and the provider adapters (decided by recommendation, four answers from the user); series budget, script, takes and the episode track (decided by recommendation, four answers from the user); the bibles, user references and the character library (decided by recommendation, four answers from the user); render, Shorts, composed images and the media directory (decided by recommendation, four answers from the user); the release package, calendar, release board and approval (decided by recommendation, four answers from the user); publishing – the publish command, the release autopilot, the platform credentials and the watchdog round (decided by recommendation, four answers from the user); the workspace – init, onboarding, update, doctor, the layout migration, the runtime build and the board container (decided by recommendation, four answers from the user); the model bench – cases, targets, fixtures, runs, bench scores, ratings and the bench budget (decided by recommendation, four answers from the user); the board's shell – the server, the routes, the write guard, the served files, the navigation, the language and the refresh (decided by recommendation, four answers from the user). Every slice is adopted.

```mermaid
flowchart LR
  BC-Series -->|an episode is a project of kind episode with its own budget and stages| BC-Pipeline
  BC-Series -->|reads the canon's characters, sets and reference voices; an episode may add plates, props and states| BC-Bibles
  BC-Review -->|open rounds come before the next autonomous stage; fixes reset qa-export| BC-Pipeline
  BC-Review -->|notes map to storyboard shots and timing sections| BC-Storyboard
  BC-Pipeline -->|qa-export builds and checks the release package| BC-Release
  BC-Pipeline -->|style-character stage writes the bibles of a music video| BC-Bibles
  BC-Pipeline -->|style-character done imports characters| BC-Library
  BC-Library -->|character use copies an identity and chosen states into a bible| BC-Bibles
  BC-Bibles -->|character import copies characters with files into the library| BC-Library
  BC-Bibles -->|sheets, states, plates and props generated and judged as queue items| BC-GenerationQueue
  BC-Bibles -->|palette roles, typography, grain| BC-Render
  BC-GenerationQueue -->|every attempt is a one-item batch: budget, cache, manifest, spend| BC-Generation
  BC-Generation -->|planned cost of every new generation recorded as spend| BC-Pipeline
  BC-Generation -->|cloud adapters: fal.ai, Higgsfield, Topview| Providers[Cloud providers - external]
  BC-Generation -->|tagged workflows on the user's GPU| ComfyUI[ComfyUI server - external]
  BC-Bench -->|one-item batches through runBatch with the bench budget, manifest and cache key extras; the workspace's generation cache| BC-Generation
  BC-Series -->|takes and ambience through runBatch on the episode budget; canon generations on the series budget| BC-Generation
  BC-Series -->|mix, stems, conversion, lip-sync segments| FFmpeg[FFmpeg - external]
  BC-Series -->|episode track writes timing.json; overrides move sound and picture| BC-Timing
  BC-Series -->|subtitle cues, chat lines, episode.wav| BC-Render
  BC-GenerationQueue -->|items built from storyboard shots and their references| BC-Storyboard
  BC-GenerationQueue -->|needs-fix count, failed verdicts| BC-Pipeline
  BC-Pipeline -->|audio-analysis stage runs the song analysis| BC-Timing
  BC-Timing -->|effective timing, anchors resolved to seconds| BC-Storyboard
  BC-Pipeline -->|storyboard stage, shared by both kinds| BC-Storyboard
  BC-Storyboard -->|continuity references to style tokens, characters, sets, plates, props, character states| BC-Bibles
  BC-Storyboard -->|resolved shots as render props| BC-Render
  BC-Storyboard -->|episode: scenes as sections, chat lines, lip-sync limit| BC-Series
  BC-Timing -->|effective timing as render props; anchors for Short windows| BC-Render
  BC-Review -->|sections and beats on the review timeline| BC-Timing
  BC-Timing -->|echo spans, lead stem for lip-sync segments| Lipsync[Lip-sync audio - not adopted]
  BC-Timing -->|lyrics, effective timing for canvas, chapters, LRC, SRT| BC-Release
  BC-Pipeline -->|assembly and qa-export stages render, cut Shorts and compose images| BC-Render
  BC-Pipeline -->|a new project is linked into the media directory| BC-Render
  BC-Render -->|whole renders with render records, Shorts, composed images and recipes; stale formats rendered again| BC-Release
  BC-Render -->|renders and render progress on the board| BC-Review
  BC-Render -->|segments joined, song muxed, Shorts cut| FFmpeg
  BC-Render -->|compositions rendered frame by frame| Remotion[Remotion and headless Chrome - external]
  BC-GenerationQueue -->|thumbnails and covers judged by the art director| BC-Render
  BC-Release -->|release folder, upload data, calendar and approval| BC-Publish
  BC-Publish -->|done marks by the autopilot, live URLs, take-overs, under the release lock| BC-Release
  BC-Publish -->|the watchdog round runs the production scan after the autopilot| BC-Pipeline
  BC-Publish -->|private and scheduled uploads, status, description, comment| YouTube[YouTube Data API - external]
  BC-Publish -->|drafts, direct posts after the audit| TikTok[TikTok Content Posting - external]
  BC-Publish -->|posts through the post adapters| Social[X, LinkedIn, Instagram - external]
  BC-Publish -->|Instagram's files as public URLs| FalStorage[fal.ai storage - external]
  BC-Publish -->|the microsite page copied and its command run| Microsite
  BC-Publish -->|the watchdog round every few minutes, without the board container| Scheduler[OS scheduler - external]
  BC-Release -->|the approval, done marks and the release folder's presence for the next action| BC-Pipeline
  BC-Release -->|the song page as data| Microsite[Artist microsite - external]
  BC-Release -->|WAV, cover and the form fields, uploaded by hand| Distributor[Distributor - external]
  BC-Release -->|WAV, canvas and teaser cut, songs converted| FFmpeg
  BC-Release -->|announcement, story and feed images composed from the cover's recipe| BC-Render
  BC-Workspace -->|init copies the demo projects; update only adds missing files to projects/| BC-Pipeline
  BC-Workspace -->|migrate-layout moves series canons into projects/; update skips their copies until then| BC-Series
  BC-Workspace -->|update only adds missing files to library/| BC-Library
  BC-Workspace -->|the board container runs board --watch, the watchdog round| BC-Publish
  BC-Workspace -->|provider keys checked and stored in .env| Providers
  BC-Workspace -->|the npx CLI and runtime; the dependencies| NpmRegistry[npm registry - external]
  BC-Workspace -->|the board image and container| Docker[Docker - external]
  BC-Workspace -->|uv, Python, ffmpeg, Claude Code| ToolInstallers[Tool installers - external]
  BC-Bench -->|a bench result is scored by the art director against the case rubric, never a verdict| BC-GenerationQueue
  BC-Bench -->|fixtures copied from the projects' keyframes, references, vocal segments and accepted results| BC-Pipeline
  BC-Bench -->|VRAM sampled from /system_stats; another server per target| ComfyUI
  BC-Bench -->|frame strips, review clips, vocal windows cut, media probed| FFmpeg
  BC-Workspace -->|bench/ ships with the runtime and is merged by update like any runtime file| BC-Bench
  BC-Board -->|the production view and the next command, read only| BC-Pipeline
  BC-Board -->|the review view; notes and rounds written through board-review| BC-Review
  BC-Board -->|the release view and the calendar; done marks and live URLs through updateStatus, a release refresh after a live URL or an approval| BC-Release
  BC-Board -->|the approval, its withdrawal and the autopilot's marks through release-autopilot; the activity of the watchdog round| BC-Publish
  BC-Board -->|the library view; entries, files and uses through character-library| BC-Library
  BC-Board -->|the wizard; new music videos and episodes, the lyrics and the finished setup stage through board-wizard| BC-Pipeline
  BC-Board -->|the wizard; new series canons through board-wizard| BC-Series
  BC-Board -->|the wizard; the user's references through board-wizard| BC-Bibles
  BC-Board -->|renders, the contact sheet and the reviewed images served from the whitelist| BC-Render
```

## Contexts

### BC-Pipeline – Pipeline
Purpose (as recovered): drives one project through the fixed stage list of its project kind (`music-video`,
`episode`), records each stage's status, outputs and attempts, and keeps the project budget.
Core terms: Project, Project Kind, Stage, Interactive Stage, Stage Reset, Review Mode, Hard Stop, Stage Runner,
budget, batch cap, next action, production phase (term unresolved, HS-1).
Evidence:
- control plane `projects/<slug>/state.json`, schema `StateSchema` (`packages/core/src/schema.ts:134-168`)
- configuration `projects/<slug>/project.yaml`, schema `ProjectConfigSchema` (`schema.ts:97-132`)
- stage lists and transitions (`packages/core/src/state.ts:18-341`), budget checks (`packages/core/src/cost.ts:13-38`)
- derived views (`packages/core/src/production.ts`), CLI writers `new`, `stage-*`, `spend`, `generate`
  (`packages/cli/src/index.ts:763-846`, `new-project.ts`, `generate.ts:757-759`)
Boundaries:
- Writers of `state.json`: the CLI (`new`, `stage-*`, `spend`, `generate`, `render` for `artifacts`) and the
  board wizard (`finishSetup`, `packages/cli/src/board-wizard.ts:344`). Agents never edit it directly; the
  workspace hook validates any edit (`workspace/.claude/hooks/validate-artifacts.mjs`).
- Readers only: `status`, the board production view, the watchdog (`packages/cli/src/production-watch.ts`).
- The orchestrating rules (interactive gate, review-mode stop, hard stops, batch size) live in agent
  instructions (`workspace/.claude/commands/video-next.md`, `workspace/.claude/agents/stage-runner.md`), not in code.

### BC-Review – Review
Purpose (as recovered): the user's frame-accurate notes on a render, sent to the agent in numbered rounds and
answered note by note; the human side of quality control, next to the automated critics.
Core terms: Review Note (draft, sent), Review Round (open, answered), reply and reply status, render.
Evidence:
- notes `review/notes/<video-stem>.json`, rounds `review/rounds/<NNN>.json`, replies `<NNN>.replies.json`
  (`packages/core/src/schema.ts:1349-1421`); pure helpers `packages/core/src/review.ts`
- writes and the lock `review/.notes.lock` (`packages/cli/src/board-review.ts:200-269`); board routes
  `/api/review/<slug>[/notes|/submit]` (`packages/cli/src/release-board.ts:373-392`)
- replies validated by `validate-file` and the workspace hook; answered by a `review-fix` runner per
  `workspace/.claude/commands/video-next.md` and `workspace/.claude/skills/assembly-render/SKILL.md`
Boundaries:
- BC-Pipeline reads only the count of open rounds (`projectNextAction`, `status` `Review:` lines); the link
  back is the orchestrator's `stage-reset … qa-export`, an instruction, not code.
- The art director's verdicts (`assets/review/verdicts.jsonl`) share the word "review" but not this context.

### BC-GenerationQueue – Generation queue
Purpose (as recovered, draft – name HS-29): gets every generated image and clip of a project approved before
anything derives from it. One queue run generates the ready items in order, the art director gives every attempt
a verdict in the background, and the run files a passed attempt, requeues a failed image with the fix prompt, or
leaves the item waiting for a fix.
Core terms: Generation Queue, queue item, Attempt, verdict (term HS-30), blocking defect and note (HS-31), fix
prompt, focus, Art Director, Region Patch, cloud fallback, frame chaining.
Evidence:
- the queue `assets/queue.json`, Zod schema in the CLI only (`packages/cli/src/queue.ts:31-80`), written whole
  through a temp file and a rename (`queue.ts:111-119`); run lock `assets/queue.lock` (`queue.ts:562-578`)
- attempts as files `<out dir>/attempts/<name>-a<n>.<ext>` (`queue.ts:137`); filed at `out` on a pass or an accept
- the verdict log `assets/review/verdicts.jsonl` (series canon: `<series>/review/verdicts.jsonl`), append-only
  (`packages/cli/src/review-image.ts:300-302`); the art director runs as `claude -p --agent art-director` with a
  JSON schema (`review-image.ts:177-217`)
- region patches: an attempt file plus `assets/review/patches.jsonl`, not in the queue (`packages/cli/src/patch.ts`)
- instructions: `workspace/.claude/skills/ai-clips/SKILL.md` steps 3–6, `workspace/.claude/agents/art-director.md`,
  `workspace/.claude/agents/stage-runner.md` rule 10
Boundaries:
- Writers of `queue.json`: `queue add|run|retry|accept|drop`, run by the stage runner. Readers: `queue status|wait`,
  the board production view and the watchdog (loosely, `packages/cli/src/board-production.ts:140-176`,
  `production-watch.ts:36`).
- Every attempt is generated through `runBatch` (`packages/cli/src/generate.ts`), so budget, cache, manifest and
  spend stay with the generation slice and `AGG-Project`.
- BC-Pipeline sees this context only through the stage skills' completion checks and the board's counts; no
  stage state is written here.
- The model bench has its own scores (`pass/weak/fail`, `packages/core/src/bench.ts:183`), not verdicts.

### BC-Timing – Timing
Purpose (as recovered, decided by recommendation HS-47): turns the user's finished song and section-tagged
lyrics into a measured timing, merges the user's timing overrides into the effective timing, and resolves
symbolic anchors to seconds for every later stage. Measured for a music video; an episode's timing is
constructed by the episode track (series slice, not adopted) and passes the same merge and check.
Core terms: Lyrics, section tag, Song Import, Stem, Lead Stem, Echo Span, Timing, Section, Line, Word, Beat,
Downbeat, Onset, Energy, Timing Override, Effective Timing, Timing Report, Anchor.
Evidence:
- the measured timing `projects/<slug>/timing.json`, schema `TimingSchema` (`packages/core/src/schema.ts:170-215`),
  written whole by the Python analysis (`scripts/audio-analysis/analyze.py:430-432`) in the `audio-analysis`
  stage (`packages/core/src/state.ts:43-50`), run by the stage runner through
  `workspace/.claude/skills/audio-analysis/SKILL.md`; no CLI command runs it
- the overrides `timing.overrides.json`, schema `TimingOverridesSchema` (`schema.ts:218-239`), seeded empty by
  `new` (`packages/cli/src/new-project.ts:157-162`) and otherwise edited by hand
- the merge and check on every project load (`packages/core/src/project.ts:237-241`;
  `packages/core/src/timing.ts:61-165`); the snapshot `timing.effective.json` written by `validate`
  (`packages/cli/src/validate.ts:104-119`); the anchor resolver `resolveAnchor` (`timing.ts:167-217`)
- the lyrics `lyrics.txt`, checked and written by `writeLyrics` (`packages/cli/src/board-wizard.ts:271-278`),
  tag rules in `packages/core/src/lyrics.ts`; section ids derived only by the Python parser
  (`scripts/audio-analysis/timing_core.py:13-55`)
- the song files `audio/song.wav`, `audio/stems/vocals.wav` and `song.json` (no schema), written by
  `import-song` and `normalize-audio` (`packages/cli/src/media.ts:169-312`); the lead stem by
  `separate_lead.py`; the timing report `timing.report.md` and the echo scan (`echo_scan.py`)
Boundaries:
- Writers of `timing.json`: the analysis for a music video, the episode track for an episode
  (`packages/cli/src/episode-track.ts:247`). Writer of the overrides: the agent at the user's request (HS-66).
- Readers of the effective timing, all through `loadProject`: render (as Remotion props,
  `packages/cli/src/render.ts:173`), the storyboard resolver, the board review (`board-review.ts:251`), the
  queue (`queue.ts:293`), Shorts and release (`short.ts:99`, `release.ts:557`), lip-sync segments
  (`media.ts:136`). Remotion re-implements the lookups (`packages/remotion/src/lib/timing.ts`, HS-60).
- The Python analysis and TypeScript share only the generated JSON Schema `schema/timing.schema.json`
  (ADR 0004); `timing.meta` is untyped (HS-65).
- Song metadata in `song.json` (title, artist, rights) belongs to setup and release, not here (HS-47).

### BC-Storyboard – Storyboard
Purpose (as recovered, decided by recommendation HS-69): turns the treatment or script, the effective timing and
the bibles into an ordered list of shots that covers the song or episode track, checks every shot's source,
continuity references and limits, and hands resolved shots to the queue, render, QA and review. One model for
both project kinds; an episode adds checks through `EpisodeContext` (ADR 0016).
Core terms: Storyboard, Shot, Shot Source, Layer, Continuity Reference, Lip-Sync Shot, Highlight, Focus Point,
Frame Chaining, Coverage, Contact Sheet, Anchor (from BC-Timing).
Evidence:
- `projects/<slug>/storyboard.yaml`, schema `StoryboardSchema` and `ShotSchema`
  (`packages/core/src/schema.ts:277-371`), parsed only by `loadProject` (`packages/core/src/project.ts:242-243`);
  written by the agent in the `storyboard` stage (`packages/core/src/state.ts:59-66`,
  `workspace/.claude/skills/storyboard/SKILL.md`); no command or template writes it
- `resolveStoryboard` (`packages/core/src/timing.ts:455-577`) with the per-shot checks (`:226-452`); its only
  caller is `validateProject` (`packages/cli/src/validate.ts:66-121`)
- `validate`, `contact-sheet` (`packages/cli/src/index.ts:86-103,165-182`), the hook path
  (`workspace/.claude/hooks/validate-artifacts.mjs:13-15`, `packages/cli/src/validate-file.ts:124-127`)
- `review/contact-sheet.svg` (`packages/cli/src/contact-sheet.ts`), embedded by the board
  (`packages/cli/src/board-production.ts:314`); `storyboard.md` written by hand (skill step 6)
Boundaries:
- Writer of `storyboard.yaml`: the agent only, in the stage and at the user's request (HS-77).
- Readers of the resolved storyboard, through `validateProject`: render (Remotion props, `render.ts:98-140`),
  contact sheet, QA (`qa.ts:334`), subtitles (`subtitles.ts:12`), the board review's shot spans
  (`board-review.ts:122-128`). Readers of the raw storyboard: the queue's `buildShotItems` (`queue.ts:326-386`)
  and QA's continuity checks (`qa.ts:48-102`) – HS-79.
- Continuity references point into the style, character and set bibles (project or series canon); their
  definitions are not this context's (HS-69). Resolved three times today (HS-80).
- Episode checks read the script's scenes and chat lines and the series' lip-sync limit; the lip-sync maximum
  comes from `config/models.yaml` (`validate.ts:53-63`).
- Remotion keeps its own motion component switch and highlight matching (HS-80, HS-81).

### BC-Generation – Generation
Purpose (as recovered, decided by recommendation HS-87): turns the items of a generation batch into provider calls
for a model role. A batch that does not fit the budget is refused up front, a request that ran before is served
from the generation cache, every generation is recorded in the manifest, and every new one is billed at its
planned cost.
Core terms: Generation Batch, Generation, Generation Operation, Model Role, Provider, Provider Alternative,
Provider Adapter, ComfyUI Workflow, Mock Provider, Generation Cache, Cache Key, Manifest, Project Budget, Batch
Cap, Restore Pass, Video Model.
Evidence:
- `runBatch` (`packages/cli/src/generate.ts:667-772`): it resolves every item (`resolveItem`, `:287-594`) and
  checks the worst-case estimate once (`assertAffordable`, `packages/core/src/cost.ts:21-38`). Then it builds
  one `GenerationRunner` per provider, records the spend and saves the state after each new result. Its callers
  are `generate` (`index.ts:897`), the queue (`queue.ts:628`), `patch` (`patch.ts:96`), the voice track
  (`voice-track.ts:137,191`) and the bench (`bench.ts:577,634,675`).
- `GenerationRunner` (`packages/providers/src/runner.ts`): the cache key (`:53-84`), the cache under
  `<workspace>/.cache/generations/<key>/` (`:86-99,167-207`) and the manifest append (`:209-226`).
- Model roles: `config/models.yaml` (`ModelsConfigSchema`, `schema.ts:714-762`), resolved by
  `resolveModelRole` and `providerForRole` (`packages/core/src/models.ts:26-98`). The project's choice is in
  `project.yaml` `providers` (`schema.ts:37-48`).
- Adapters: `createProvider` (`packages/providers/src/index.ts:20-27`) and the `Provider` interface (`types.ts:36-69`).
  The adapters are `fal.ts`, `higgsfield.ts`, `topview.ts`, `comfyui.ts` (with the workflows in
  `comfyui/workflows/` and their tags) and `mock.ts`, sharing `http.ts` and `duration.ts`.
- The Pika prompt schemas are `flex.ts` and `fl2va.ts` in core; the local clip options are in `clip-options.ts`.
  The ComfyUI server commands `comfy status` and `comfy restart` are in `comfy.ts`.
Boundaries:
- Every media generation goes through `runBatch`; no adapter is called around it. The only exception is not a
  generation: the release autopilot uses fal's file upload to host Instagram media (`release-autopilot.ts:138`).
- The budget ledger belongs to `AGG-Project` (BC-Pipeline): `recordSpend` and `saveState` are called by
  `runBatch`, and `state.json` has no lock (G-1). A series canon batch books against the series budget.
- The queue (BC-GenerationQueue) sends one item per batch, so the batch cap guards one item and the project budget
  guards the run (HS-91).
- `packages/providers` imports only core and knows no project, state or budget. It owns the cache and the
  manifest file and reads `config/models.yaml` and the workflow folder (`comfyui.ts:165-168,729`).
- Provider-specific routing lives outside the adapters: ComfyUI, Pika, LTX, Wan and SeedVR2 rules in
  `generate.ts` and the lip-sync fallback in `models.ts`. The provider list is kept five times (HS-100).
- Readers of the manifest: the QA checker (cost sum equals recorded spend, `qa.ts:230-262`). The bench keeps its
  own manifest and budget (bench slice).

### BC-Series – Series
Purpose (as recovered, decided by recommendation HS-103): keeps a series' umbrella budget and episode plan and
creates its episodes, and turns an episode's script into takes, an episode track with speaker stems, subtitles and
lip-sync audio – the episode's replacement for the song (ADR 0016, ADR 0042 proposed).
Core terms: Series, Series Budget, Uncommitted Series Budget, Episode Plan, Planned Episode, Creative Limit, Canon
Gap, Episode, Script, Scene, Script Line, Speaker, Reference Voice, Take, Take Registry, Take Status, Ambience,
Voice Track, Episode Track, Speaker Stem, Subtitles.
Evidence:
- the series `projects/<slug>/series.yaml` and `state.json` (`SeriesSchema`, `SeriesStateSchema`,
  `packages/core/src/schema.ts:543-664`), loaded by `loadSeries` (`packages/core/src/project.ts:380-416`), created
  by `new-series` (`packages/cli/src/new-series.ts:67-104`) and the board wizard (`POST /api/new/series`)
- the series budget sum `seriesBudget` (`packages/cli/src/series.ts:43-74`), checked by `createProject` for an
  episode (`packages/cli/src/new-project.ts:205-216`); canon generations through `seriesTarget`
  (`packages/cli/src/generate.ts:260-277`); `series-status` and the board's series view (`series.ts:101-209`,
  `board-production.ts:336-370`, `packages/core/src/production.ts:109-122`)
- the script `script.yaml` (`ScriptSchema`, `schema.ts:587-657`) and its rules (`packages/core/src/episode.ts`),
  checked by the hook (`packages/cli/src/validate-file.ts:134-145`)
- the take registry `takes.json` (`TakesSchema`, `schema.ts:666-684`) with `audio/lines/` and `audio/ambience/`,
  written by `voice-track` (`packages/cli/src/voice-track.ts`) and `import-takes` (`media.ts:395-460`); take status
  in `takes.ts`
- the episode track `episode-track` (`packages/cli/src/episode-track.ts`): `timing.json`, `audio/episode.wav`,
  `audio/stems/<character>.wav`; subtitles `subtitles` (`subtitles.ts`, `renders/<slug>.en.srt`); lip-sync audio
  `audio-segment --character` (`media.ts:75-136`)
- the stages `setup`, `script`, `voice-track`, `episode-track` (`EPISODE_STAGES`, `packages/core/src/state.ts:102-151`)
  and the skills `new-series`, `new-episode`, `voice-track`, `episode-track`
Boundaries:
- An episode is a project (BC-Pipeline): its stages, state and budget ledger are `AGG-Project`'s; this context adds
  the series commitment at creation and the episode's audio.
- The canon files – `characters.yaml`, `sets.yaml`, `style.yaml`, `bible.md` and references – are read here (sets,
  speakers, reference voices, display rules) but belong to BC-Bibles (`.claude/rules/character.md`). An episode may add
  files to the canon; overwriting one is a gap (HS-117).
- Takes, ambience and canon references are generated through `runBatch` (BC-Generation): takes on the episode
  budget, canon generations on the series budget, which ignores episode budgets today (HS-105).
- `episode-track` is the writer of an episode's `timing.json`; the overrides stay the user's and the merge and
  check are BC-Timing's. Storyboard checks read the script's scenes, chat lines and the series' lip-sync limit.
- Render reads `audio/episode.wav` and the subtitle cues; `SubtitleCue` is defined twice (HS-116). The lead-only
  lip-sync audio of a music video (`lipsync-audio.ts`, ADR 0026) is not this context's.
- Writers of `script.yaml`: the agent only (HS-121). Writers of `takes.json`: `voice-track` and `import-takes`. No
  locks; one stage at a time.

### BC-Bibles – Bibles
Purpose (as recovered, decided by recommendation HS-123): holds what a production must look and sound like before
any shot is generated – the style bible, the character bible with its character states, the set bible with plates
and prop references, and the user references – per music video, or once per series canon that every episode
reads and may only add to (ADR 0025, ADR 0043 proposed).
Core terms: Style Bible, Character Bible, Set Bible, Character Sheet, Character Identity, Character State, Display
Rule, Reference Voice, Set, Plate, Prop Reference, Continuity Reference, Canon, Canon Gap, User Reference.
Evidence:
- the schemas `StyleBibleSchema`, `CharacterBibleSchema`, `SetBibleSchema` and `ReferencesSchema`
  (`packages/core/src/schema.ts:373-541,1460-1489`), loaded by `loadProject` – an episode's from its series folder
  (`packages/core/src/project.ts:85-108,226-250`)
- the files `style.yaml`, `characters.yaml` with `characters/<id>/`, `sets.yaml` with `sets/<set>/plates/` and
  `props/<id>/`, `references.yaml` with `assets/references/`, validated by the hook on every edit
  (`packages/cli/src/validate-file.ts:86-97,234-243`)
- the writers: the `style-bible` and `character-bible` skills in `style-character` (`packages/core/src/state.ts:52-58`),
  the `new-series` skill and `new-series` command (`packages/cli/src/new-series.ts:48-104`), `character use`
  (`packages/cli/src/character-library.ts:452-525`), the `reference` command and the board wizard
  (`packages/cli/src/board-wizard.ts:72-178`)
Boundaries:
- The bibles' consumers resolve continuity references three times – the storyboard check
  (`packages/core/src/timing.ts:226-366`), QA (`packages/cli/src/qa.ts:76-103,292-313`) and the queue
  (`packages/cli/src/queue.ts:242-286`) – one resolution is decided (HS-135).
- Reference images are generated and judged as queue items (BC-GenerationQueue, BC-Generation); a canon by hand
  with `review-image`. The bibles name the filed paths.
- In a canon an episode adds plates, prop references and character states and changes nothing; only prompt text
  says so today (HS-130, HS-117).
- Render, thumbnails, the voice track and the lip-sync check read the style, the reference voices and the display
  rules. No locks; one stage at a time, the board writes only user references and character use (HS-134).

### BC-Library – Library
Purpose (as recovered, decided by recommendation HS-123): keeps the workspace's reusable characters across
productions – takes the characters of finished character bibles in and copies a character's identity, and the
states the user chooses, into a new music video or series canon (ADR 0034, ADR 0043 proposed).
Core terms: Character Library, Library Character, Character Identity, Character Import, Character Use, Character
State.
Evidence:
- `library/characters/<id>/character.yaml` with `LibraryCharacterSchema` (`packages/core/src/schema.ts:1422-1458`)
  and its files, checked by `validate-file` (`packages/cli/src/validate-file.ts:246-258`)
- every rule in `packages/cli/src/character-library.ts`: import and entry matching (`:206-293`), content dedupe
  (`:141-167`), manual entries (`:328-428`), use (`:452-525`), listing and targets (`:69-112,538-547`)
- the `character` command (`packages/cli/src/index.ts:655-760`), the automatic import at `stage-done … style-character`
  (`index.ts:786-794`), the board's Characters view (`packages/cli/src/board/characters.js`) and its routes
  `/api/library*` and `/library-files/<id>/<file>` (`packages/cli/src/release-board.ts:252-318`)
Boundaries:
- Only copies cross to BC-Bibles: a bible's character names its library character in `library`; changing the
  library never changes a production (ADR 0034).
- The library belongs to the user: `update` and `init` never touch `library/` (`packages/cli/src/update.ts:43-45`).
- The board serves library files but never `character.yaml` or dot files; writes follow the board's same-origin
  rules.
- A series canon comes in through a skill step, not code (HS-131); the user has not used the library yet.

### BC-Render – Render
Purpose (as recovered, decided by recommendation HS-143): turns a validated project into its videos and images – a
render per format from one composition, previews for checks, Shorts cut from the 9:16 render, and composed images
(thumbnails, covers, feed images) from a generated image and the style bible – and keeps a project's media in the
media directory (ADR 0007, ADR 0018, ADR 0044 proposed).
Core terms: Render, Master Format, Derivative Format, Render Record, Preview, Short, Composed Image, Thumbnail,
Cover, Thumbnail Recipe, Media Directory.
Evidence:
- one `MusicVideo` composition sized by props for every format, and a `Thumbnail` composition
  (`packages/remotion/src/Root.tsx:7-44`); the CLI builds the props from the loaded project – resolved shots,
  effective timing, style, characters, chat lines and subtitles, brand fonts (`packages/cli/src/render.ts:137-180`)
- `render` writes `renders/[preview-]<format>[.en].mp4` in segments that resume, joins them and muxes the song
  (`render.ts:293-445`); a whole render leaves its render record in `state.json` (`render.ts:267-291,431-433`),
  which `release` compares to decide what to render again (`packages/cli/src/release.ts:237-262`)
- `short` cuts `renders/shorts/<name>-9x16.mp4` from `renders/9x16.mp4` (`packages/cli/src/short.ts:200-233`);
  `thumbnail` composes a JPEG in one of five formats with its recipe (`packages/cli/src/thumbnail.ts:183-217`,
  `thumbnail-recipe.ts`)
- `media-link` and project creation link `assets/` and `renders/` into `CORESLOPPER_MEDIA_DIR`
  (`packages/cli/src/media-dir.ts:19-97`, `new-project.ts:182-186`)
- the progress file `review/progress/<file>.json`, read by the board and the watch
  (`packages/cli/src/render-progress.ts`, `board-production.ts:204-221`, `packages/core/src/watch.ts:104-118`);
  QA's render checks (`packages/cli/src/qa.ts:107-174,350-417`)
Boundaries:
- Reads only: the resolved storyboard (BC-Storyboard), the effective timing (BC-Timing), the style and character
  bibles (BC-Bibles), an episode's script, chat lines and subtitle cues (BC-Series). It writes nothing of theirs.
- The CLI owns all input, output and encoding; `packages/remotion` is a pure function of props and frame and takes
  runtime values only from `@coreslopper/core/browser` (HS-158).
- BC-Release places the renders, Shorts and composed images in the release folder and renders a missing
  or stale format again; it composes the announcement images from the cover's recipe.
- The art director judges thumbnails and covers (BC-GenerationQueue's agent, run by hand in `video-qa`).
- The render record lives in `AGG-Project`'s `state.json` and is saved without a lock (G-1, HS-155).
- A passage render without `--out` replaces the recorded render's file (HS-146); a Short is not tied to the render it
  was cut from (HS-148); a series canon is not linked into the media directory (HS-154).

### BC-Release – Release
Purpose (as recovered, decided by recommendation HS-162): turns a finished project into everything its release
needs – the release folder with its manifest, the platform texts laid out and checked against the limits, the
release calendar planned across the workspace, and the release board where the user ticks off what went live and
gives the one release approval (ADR 0019, ADR 0024, ADR 0028, ADR 0029, ADR 0045 proposed).
Core terms: Release Package, Release Folder, Release Manifest, Upload Data, Upload Text, Release Metadata, AI
Credits, Channel Config, Release Schedule, Release Calendar, Calendar Event, Proposed Release Day, Release Board,
Release Status, Done Mark, Live URL, Release Approval, Announcement, Microsite, TODO.
Evidence:
- `release` builds `renders/release/` and writes `manifest.json` last (`packages/cli/src/release.ts:132-175,207-447`);
  the texts are laid out from `review/upload.yaml`, which the agent writes (`packages/cli/src/release-texts.ts`,
  `workspace/.claude/skills/video-qa/release.md`); the rules for facts, limits, chapters and canvas are pure functions
  in core (`packages/core/src/release.ts`)
- `buildCalendar` plans `review/calendar.yaml` from `config/release-schedule.yaml` and every other project's calendar
  (`packages/core/src/calendar.ts:119-225`, `packages/cli/src/release-calendar.ts:49-110`)
- the board's release view (`packages/cli/src/release-board.ts:412-503`, `release-board-data.ts:432-703`,
  `board/release.js`) writes `review/release-status.json` under the release lock (`release-calendar.ts:118-142`);
  the approval is written by `approveRelease` (`packages/cli/src/release-autopilot.ts:66-89`) and read by
  `approvalHolds` (`packages/core/src/autopilot.ts:142-144`)
- QA's release checks (`packages/cli/src/release-qa.ts:56-231`, `qa.ts:177-221,379-381`)
Boundaries:
- Reads only: the renders, render records, Shorts and composed images with their recipes (BC-Render), the effective
  timing and lyrics (BC-Timing), the project's `project.yaml` release block and `state.json` (BC-Pipeline). It writes
  nothing of theirs, except `release.release_date` in `project.yaml` when a proposed day is approved (HS-177) and the
  formats it renders again through BC-Render's command.
- Publishing (BC-Publish) reads the release folder, the upload data, the calendar and the
  approval, and write done marks and live URLs into the release status under the same lock.
- The microsite and the distributor are outside; the microsite reads `renders/release/microsite/<slug>.json`
  (HS-178), the distributor gets its files by hand.
- The release folder and the calendar take no lock (HS-174); the board's refresh can remove a file it could not
  refresh (HS-167); a proposed day is fixed only by the approval (HS-165).

### BC-Publish – Publishing
Purpose (as recovered, decided by recommendation HS-183): gets an approved release onto the platforms – the publish
command uploads by hand, privately or as drafts; the release autopilot posts every calendar event a platform API can
post at its time once the user approved the release, without ever posting twice; the platform credentials and the
watchdog round that runs it every few minutes (ADR 0023, ADR 0029, ADR 0031, ADR 0046 proposed).
Core terms: Publish, Post, Platform, Publish Adapter, Post Adapter, Publish Log, Publish Plan, Draft, Platform
Credentials, Release Autopilot, Autopilot State, Autopilot Log, Take-over, Stuck Post, Missed Post, Pinned Comment,
Watchdog.
Evidence:
- `publish` uploads through `publishProject` and records `review/publish.json` (`packages/cli/src/publish.ts:217-476`);
  the autopilot's YouTube and TikTok uploads go through the same function (`packages/cli/src/release-autopilot.ts:383-417`)
- the plan is pure (`packages/core/src/autopilot.ts:147-211`); the runner claims each due event under
  `review/.release.lock` and appends to `review/autopilot.json` (`release-autopilot.ts:190-292`,
  `packages/cli/src/autopilot-state.ts:46-65`); one round per workspace under `.cache/release-run.lock`
- two adapter families in providers: `PublishAdapter` (YouTube, TikTok) and `SocialAdapter` (X, LinkedIn,
  Instagram) (`packages/providers/src/publish/types.ts`, `social.ts`)
- tokens in `.env` from `publish-auth` and token rotation (`packages/cli/src/publish-auth.ts`, `social-auth.ts`)
- the round: `watch` = `release-run`, then the production scan (`packages/cli/src/production-watch.ts:96-161`), from
  `board --watch` in the container or `release-timer` (`packages/cli/src/release-timer.ts`)
Boundaries:
- Reads only: the release folder, the upload data, the calendar and the approval (BC-Release); the renders through
  the release folder. It writes into the release status only through the release slice's writers: done marks by the
  autopilot with their live URLs, and take-overs.
- The production scan in the same round is BC-Pipeline's; the round only calls it.
- Outside: the platform APIs, fal.ai storage for Instagram's files, the microsite's directory and command, the
  operating system's scheduler.
- The publish log takes the release lock and `.env` its own lock for every write (HS-189);
  the board container plans in UTC without a named time zone (HS-194).

### BC-Workspace – Workspace
Purpose (as recovered, decided by recommendation HS-205): gives the user a private, self-contained workspace and
keeps it current – init and its onboarding copy the runtime snapshot, store the provider keys and record the
baseline; update merges a newer runtime against the baseline without losing the user's own edits; doctor checks the
workspace; migrate-layout moves an old layout; the board container runs the board and its watchdog. Upstream, the
runtime build decides what ships (ADR 0010, ADR 0012, ADR 0031, ADR 0036, ADR 0047 proposed).
Core terms: Workspace, Runtime Snapshot, Baseline, Workspace Marker, Conflict Copy, Onboarding, Doctor, Legacy
Layout, Board Container; engineering: Workspace Payload, Engineering Layer, Sandbox Workspace.
Evidence:
- the marker `coreslopper.workspace.json`, written whole by `initWorkspace` and `updateWorkspace`
  (`packages/cli/src/workspace.ts:6-17`; `init.ts:167-176,276-351`; `update.ts:192-353`)
- the three-way decision per runtime file and the user-owned paths (`update.ts:17-56,229-292`)
- the runtime from `git ls-files` through `planRuntime` (`scripts/runtime-files.mjs`; `scripts/build-runtime.mjs`);
  the npx CLI bundled from `packages/cli/src/npx.ts` (`tsup.config.ts`)
- the board container (`docker/Dockerfile`, `docker/entrypoint.sh`, `compose.yaml`)
Boundaries:
- Writes the runtime's files, `.env` (provider keys), `GETTING_STARTED.md` and the marker; into `projects/`,
  `series/` and `library/` only missing files. `migrate-layout` is the one writer that moves projects.
- The board server and its routes are BC-Board, the watchdog round is BC-Publish; the container only runs them.
- Outside: the npm registry, the tool installers, the providers' key checks, Docker.
- A conflict is reported once (HS-209); the upstream CI ships and cannot pass in a workspace (HS-211); `update` says
  nothing about a changed `docker/` (HS-212).

### BC-Bench – Model bench
Purpose (as recovered, decided by recommendation HS-222): replays fixed scenes from past projects – the bench cases –
on several bench targets before a model, workflow, server or provider switch, measures every result, has the art
director score it against the case's rubric and the user rate it, and ends with a recommendation per operation. It
has its own budget and never produces project assets (ADR 0020, ADR 0048 proposed).
Core terms: Model Bench, Bench Case, Bench Set, Bench Target, Bench Fixture, Known Good Result, Bench Run, Bench
Result, Frame Strip, Rubric, Bench Score, Rating, Bench Budget.
Evidence:
- the case, target and configuration schemas and their loaders in core (`packages/core/src/bench.ts:17-290`;
  `schema/bench-*.schema.json`)
- the commands `bench list|import|run|report` and the measurement in the CLI (`packages/cli/src/bench.ts`;
  `index.ts:1386-1457`); the comparison page, a pure renderer (`packages/cli/src/bench-report.ts`)
- `bench/runs/<id>/run.json`, written whole after every result; `bench/state.json`, the bench budget
- the `model-bench` skill and `scoring.md`, and step 9 of the art director (`workspace/.claude/`)
Boundaries:
- Writes only under `bench/`: fixtures, runs, the bench state, manifest and timings. Never a project file, never a
  project budget.
- Downstream of Generation: every generation is a one-item batch through `runBatch` with the bench's own budget,
  manifest and cache key extras (ADR 0041). It shares the workspace's generation cache (HS-234).
- Reads the workspace's projects only through `bench import` (HS-225).
- The art director scores bench results by the rubric; a bench score is not a verdict and files nothing (HS-224).
- Upstream ships two generic example cases without fixtures (HS-226); `update` only adds missing files to
  `bench.yaml`, `targets.yaml` and `cases/` (HS-227).

### BC-Board – Board
Purpose (as recovered, decided by recommendation HS-242): the workspace's local page that hosts the views of the
other contexts behind one navigation. It starts the server, routes, serves the page and the whitelisted files, guards
every write and chooses the language. It owns no state: every write goes to the module of the context that owns it
(ADR 0030, ADR 0031, ADR 0049 proposed).
Core terms: Board, Board View, Board Navigation, Write Guard, Activity; the views' terms belong to their contexts.
Evidence:
- the server: `startBoard` and `boardHandler`, one request handler that tests call directly, with the write guard
  `trustedWrite`, the file server `serveMedia`, the whitelists and the per-project release refresh
  (`packages/cli/src/release-board.ts`)
- the `board` command with the alias `release-board`, `--host`, `--port`, `--watch` (`packages/cli/src/index.ts:352-378`);
  the board container runs `board --host 0.0.0.0 --port 4848 --watch 5` (`docker/Dockerfile`)
- the page: static ES modules without a build step – `index.html`, `app.js` (routes, navigation, the 10 s poll),
  `lib.js` (DOM, the JSON API, uploads, languages, dates, a project's tabs), `board.css`
  (`packages/cli/src/board/`); the views beside them are their contexts'
Boundaries:
- Reads every project and series; writes nothing itself. Writes go through `updateStatus`, `release-autopilot`,
  `board-review`, `board-wizard` and `character-library`.
- Two sets of projects: the production, review and file routes see every project; the release routes and `/media`
  only those with a release folder or a calendar (`boardProjectDirs`, also read by the autopilot).
- Only the board's own page writes (the write guard); reads answer any Host today (HS-247).
- The user refreshes by hand (HS-244); the page does not poll.
- Routes are inline for production, review, release and autopilot, delegated for the wizard and the library
  (HS-251).

