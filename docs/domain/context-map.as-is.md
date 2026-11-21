# As-is context map – coreslopper

> Recovered from code by `/adopt` on 2026-11-21 at b195086. This is **not a target**.
> Target: [context-map.md](context-map.md) · Gap register: [gap-register.md](gap-register.md).

Adopted slices: project and stage pipeline; human review; art-director verdicts and the generation queue (decided by recommendation); song timing and lyrics (decided by recommendation, four answers from the user); the storyboard (decided by recommendation, four answers from the user); generation and the provider adapters (decided by recommendation, four answers from the user); series budget, script, takes and the episode track (decided by recommendation, four answers from the user). Other areas – release, the canon files and
character library, render, model bench – appear only as neighbours until their own slice is adopted.

```mermaid
flowchart LR
  BC-Series -->|an episode is a project of kind episode with its own budget and stages| BC-Pipeline
  BC-Series -->|reads characters, sets and reference voices; may add canon files| Canon
  BC-Review -->|open rounds come before the next autonomous stage; fixes reset qa-export| BC-Pipeline
  BC-Review -->|notes map to storyboard shots and timing sections| BC-Storyboard
  BC-Pipeline -->|done project feeds release| Release[Release - not adopted]
  BC-Pipeline -->|style-character done imports characters| Library[Character library - not adopted]
  BC-GenerationQueue -->|every attempt is a one-item batch: budget, cache, manifest, spend| BC-Generation
  BC-Generation -->|planned cost of every new generation recorded as spend| BC-Pipeline
  BC-Generation -->|cloud adapters: fal.ai, Higgsfield, Topview| Providers[Cloud providers - external]
  BC-Generation -->|tagged workflows on the user's GPU| ComfyUI[ComfyUI server - external]
  Bench[Model bench - not adopted] -->|own budget and manifest, same runBatch| BC-Generation
  BC-Series -->|takes and ambience through runBatch on the episode budget; canon generations on the series budget| BC-Generation
  BC-Series -->|mix, stems, conversion, lip-sync segments| FFmpeg[FFmpeg - external]
  BC-Series -->|episode track writes timing.json; overrides move sound and picture| BC-Timing
  BC-Series -->|subtitle cues, episode.wav| Render
  BC-GenerationQueue -->|items built from storyboard shots and their references| BC-Storyboard
  BC-GenerationQueue -->|needs-fix count, failed verdicts| BC-Pipeline
  BC-Pipeline -->|audio-analysis stage runs the song analysis| BC-Timing
  BC-Timing -->|effective timing, anchors resolved to seconds| BC-Storyboard
  BC-Pipeline -->|storyboard stage, shared by both kinds| BC-Storyboard
  BC-Storyboard -->|refers to sets, plates, props, character states| Canon[Bibles and canon - not adopted]
  BC-Storyboard -->|resolved shots as render props| Render
  BC-Storyboard -->|episode: scenes as sections, chat lines, lip-sync limit| BC-Series
  BC-Timing -->|effective timing as render props| Render[Render - not adopted]
  BC-Review -->|sections and beats on the review timeline| BC-Timing
  BC-Timing -->|echo spans, lead stem for lip-sync segments| Lipsync[Lip-sync audio - not adopted]
  BC-Timing -->|lyrics, effective timing for canvas, Shorts, texts| Release
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
- a second writer of notes: the desktop player (`scripts/review-player/review_notes.py`), without the lock
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
  speakers, reference voices, display rules) but belong to the character slice, not adopted. An episode may add
  files to the canon; overwriting one is a gap (HS-117).
- Takes, ambience and canon references are generated through `runBatch` (BC-Generation): takes on the episode
  budget, canon generations on the series budget, which ignores episode budgets today (HS-105).
- `episode-track` is the writer of an episode's `timing.json`; the overrides stay the user's and the merge and
  check are BC-Timing's. Storyboard checks read the script's scenes, chat lines and the series' lip-sync limit.
- Render reads `audio/episode.wav` and the subtitle cues; `SubtitleCue` is defined twice (HS-116). The lead-only
  lip-sync audio of a music video (`lipsync-audio.ts`, ADR 0026) is not this context's.
- Writers of `script.yaml`: the agent only (HS-121). Writers of `takes.json`: `voice-track` and `import-takes`. No
  locks; one stage at a time.

