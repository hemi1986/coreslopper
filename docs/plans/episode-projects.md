# Plan: episode projects for series

Implementation plan for [ADR 0016](../adr/0016-episode-projects.md). Approved 2026-11-10. Delete this file when step 3 is merged.

## Goal

coreslopper produces episodes of a series next to music videos. `episode` is a new project kind in the same repository. It shares providers, cache, budget, state, storyboard, and Remotion with music videos. The episode track replaces the song and is built from `script.yaml`: scenes become `sections`, script lines become `lines`.

Constraints:

- Existing music-video projects run unchanged. A missing `kind` means `music-video`. Existing tests stay green and unedited.
- Nothing may require ComfyUI. Technical limits come from `maxDuration` of the role for the selected provider in `config/models.yaml`, never from fixed values. Paid batches go through estimate and budget.
- Repository artifacts are English. Zod in `packages/core/src/schema.ts` is the source of truth; run `npm run schema` after changing it. New terms go into `docs/glossary.md` (skill `domain-modeling`). Skills are written with `writing-for-agents`; frontmatter is `name`, `description`, `license` only. CI runs without API keys on the mock provider.
- Branch `feat/episode-projects`, one commit per step. After every commit `npm test`, `npm run typecheck`, and `npm run python:test` are green.

The first real series is "Restlaufzeit" (10 episodes of 60–120 s, 9:16, German with English subtitles, produced locally with ComfyUI). That is project configuration, not a default of the kind.

## Progress

- [x] Step 1 — ADR 0016 and glossary
- [x] Step 2a — schemas, state, canon loader, fixture; the demo episode validates
- [x] Step 2b — `voice-track`, `import-takes`, `episode-track`
- [ ] Step 2c — master format and 9:16 render, `ChatWindow`, subtitles, QA, `new-episode`, docs
- [ ] Step 3 — lip-sync, display rules, series state, orchestration

## Decisions

| Topic | Decision |
|---|---|
| Location | Episodes live in `projects/<slug>/` with `kind: episode`, `series`, `episode`. `series/<slug>/` holds only the canon. |
| Canon | `loadProject` resolves an episode's `style.yaml`, `characters.yaml`, and `sets.yaml` from `series/<series>/`. The storyboard path fields `style` and `characters` stay as they are and stay unused. |
| State | `state.json` gets `kind`. `migrateState` copies it from `project.yaml`. `validate` fails when the two differ. Every state function picks its stage list with `stagesFor(state.kind)`. |
| Stages | `setup` ✋, `script` ✋, `voice-track`, `episode-track`, `storyboard`, `assets`, `assembly`, `qa-export`. |
| Timing and mix | `voice-track` only produces or imports takes (plus ambience). `episode-track` computes the placement, writes `timing.json`, merges overrides, and mixes `audio/episode.wav` and the speaker stems **from the effective timing**, so an override moves sound and picture together. |
| Naming | The stage, the CLI command, and the skill for placement and mix are all called `episode-track`. |
| bpm and energy | `bpm` becomes optional. `energy` stays required and is the RMS envelope of the finished episode track. `beats`, `downbeats`, and `onsets` stay empty. |
| Line order | Lines play strictly one after another. A chat line lasts characters / `chat.cps` + `chat.hold` (set in `script.yaml`). |
| Overlap | Script lines have an optional `with: <line-id>` for later overlap (voice-over above a chat). The MVP validation rejects it with a clear message. |
| Defaults | `new --kind episode` copies providers, formats, and brand from `series.yaml` into `project.yaml`. Nothing is inherited at run time. |
| Limits | Optional in `series.yaml`: `limits.episode_seconds {min, max}` and `limits.lipsync_seconds_max`. Without an entry nothing is checked. |
| Takes | `audio/lines/<line-id>.wav`. `import-takes` registers user recordings. `takes.json` in the project root (not under the gitignored `audio/`) records source, duration, and text hash. `voice-track` generates only lines without a current take. |
| Sets | `refs.sets` on a shot is optional. A named set must exist and be the set of the shot's scene, otherwise validation fails. |
| Subtitles | `dialogue`, `voiceover`, `announcement`, and `chat` need `text_en` and go into the SRT. The TTS text rule applies only to spoken `text_de`. Burned-in English subtitles are part of step 2c and respect a safe area for 9:16. |
| Ambience and music | A scene has an optional `atmo` prompt, generated through `audio.sfx` and looped or trimmed in the mix. Music in the MVP is only an optional file `audio/music.wav`. |
| `sfx` and `pause` lines | `sfx`: `prompt` and `duration`, generated through `audio.sfx`. `pause`: `duration`. |
| Canon creation | MVP: a hand-written demo canon. Step 3: series budget, state, manifest, and a `new-series` skill. |
| Orchestration | `/video-next` detects the kind from `status`. `/series-status` gives the series overview. Both in step 3. |
| Cloud speech | Described in the ADR, not built: `fal` as an audio provider, `FalProvider.generateAudio`, `audio.voice.alternatives.fal`, pricing unit `character`. |
| Names | The Remotion composition stays `MusicVideo`. Nothing is renamed. |

## What the code does today

Facts found while planning; check them before relying on them.

- `packages/core/src/project.ts`: `loadProject` always reads `<project>/style.yaml` and `characters.yaml`; it ignores `storyboard.style` and `storyboard.characters`.
- `packages/core/src/state.ts`: `STAGES` is one global constant used by `createInitialState`, `migrateState`, `nextStage`, `overallStatus`, and `stageTable`. `migrateState(state)` takes no config.
- `packages/cli/src/render.ts`: `formatConfig` treats `16x9` as "the master" and looks every other ID up in `formats.derivatives`. The audio path `audio/song.wav` is hard-coded there and in `qa.ts`, as is `renders/16x9.mp4` in `qa.ts` and in the stage outputs. The CLI default for `--format` is `16x9`.
- `packages/core/src/timing.ts`: `assertTiming` requires non-empty `energy.values`. `bpm` is read only by `beatAt` in `packages/remotion/src/lib/timing.ts` (fallback beat length) and by the contact sheet. Empty `beats` are handled.
- `packages/cli/src/generate.ts`: `generateBatch` logs results and returns nothing. `checkSpokenText` lives here. An item's `audio` must exist and is probed with ffprobe. `providerForRole` defaults `audio.*` roles to `comfyui`, so a mock episode must set `providers.audio: mock`.
- `packages/providers/src/mock.ts`: `generateAudio` writes `silentWav(durationSeconds ?? 5)`.
- `.claude/hooks/validate-artifacts.mjs` only looks at files below a `projects` folder with a `project.yaml` above them.
- `packages/cli/src/update.ts`: `USER_OWNED_PREFIXES = ['projects/']`.
- `.gitignore` ignores `projects/*/audio/*`, `assets/*`, `characters/*`, and `renders/*`.

## Step 2a — schemas, state, canon, fixture

**`packages/core/src/schema.ts`**

- `ProjectConfigSchema`: `kind` (default `music-video`), `series`, `episode`; a refinement requires both for an episode.
- `StateSchema.kind`. `TimingSchema.bpm` optional. `ShotSchema.refs.sets` (default `[]`).
- `CharacterSchema`: optional `voice { ref, transcript }` and `face: full | silhouette | screen-only | voice-only` (default `full`).
- New: `SeriesSchema`, `SetBibleSchema`, `ScriptSchema` (scenes with `id`, `set`, `description`, optional `atmo`; lines as a union on `kind`, each with optional `with`), `TakesSchema`.
- `scripts/generate-schema.ts`: add `series`, `sets`, `script`, `takes`; run `npm run schema`.

**`packages/core/src/state.ts`** — `MUSIC_VIDEO_STAGES` (today's list; keep the `STAGES` export), `EPISODE_STAGES`, `stagesFor(kind)`. `migrateState(state, config)` sets `kind`. All state functions use `stagesFor(state.kind)`.

**`packages/core/src/project.ts`** — `projectPaths` gains `script`, `takes`, and the series directory. `loadProject` loads the canon from `series/<slug>/` for an episode, plus `sets`, `script`, and `series`. Helpers `projectAudioPath(config)` and `formatId(aspect)`.

**New `packages/core/src/episode.ts`** (pure, no I/O) — `validateScript` (speakers and sets exist, `text_en` present, TTS rule, `with` rejected, unique IDs). Move `checkSpokenText` here and re-export it from `generate.ts`.

**`packages/core/src/timing.ts`** — `resolveStoryboard` takes an optional episode context (sets, script) for the set rule. `assertTiming` is unchanged.

**CLI** — `validate.ts` gets the episode branch and the kind check. `validate-file.ts` and the hook handle `script.yaml`, `series.yaml`, and `sets.yaml`, finding a series root by its `series.yaml`. `contact-sheet.ts` accepts a missing `bpm`. `new <slug> --kind episode --series <s> --episode <n>` with `templates/episode/`. `update.ts` treats `series/` as user-owned. `.gitignore` gets `series/*/characters/*` and `series/*/sets/*`.

**Fixture** — `series/demo-series/` (`series.yaml`, `bible.md`, `style.yaml`, `characters.yaml`, `sets.yaml`) and `projects/demo-episode/` (about 20 s, 9:16, mock providers, one chat shot, committed `timing.json`). `npm run demo:episode` generates the gitignored reference WAVs.

**Tests** — schemas, `stagesFor` and migration, kind mismatch, script validation, set rule.

Done when `npm run cli -- validate projects/demo-episode` passes and the three test commands are green.

## Step 2b — voice track and episode track

- `packages/providers/src/mock.ts`: without `durationSeconds`, `generateAudio` derives a deterministic length from the text, so mock takes have realistic lengths. Check the existing audio tests first.
- `packages/cli/src/generate.ts`: split out a `runBatch` that returns the results, so other commands can use the estimate, budget, cache, and manifest path.
- New `packages/cli/src/voice-track.ts` and command `voice-track <project>`: build `audio.voice` and `audio.sfx` items from the script and the canon, run them, write `audio/lines/<id>.wav` and `takes.json`. Skip lines with a current take.
- `import-takes` in `packages/cli/src/media.ts`, modelled on `importSong`.
- `packages/core/src/episode.ts`: `placeLines(script, takeDurations)` returns sections and lines.
- New `packages/cli/src/episode-track.ts` and command `episode-track <project>`: probe durations, `placeLines`, write `timing.json`, merge overrides with `mergeTiming`, mix with ffmpeg (`adelay`/`amix`, looped ambience, the loudness target of `normalizeAudio`) into `audio/episode.wav` and `audio/stems/<character>.wav`, then write the RMS energy into `timing.json`.
- Skills `voice-track` and `episode-track`.
- Tests: `placeLines`, take staleness, mock run of both commands; guard ffmpeg-dependent tests the way `tests/import-song.test.ts` does.

Done when the demo episode's committed `timing.json` equals a fresh `voice-track` + `episode-track` run.

## Step 2c — render, chat, subtitles, QA

- `render.ts`, `qa.ts`, `index.ts`: derive the master format ID from `formats.master.aspect`; `--format` defaults to the master. Music videos keep `renders/16x9.mp4`. Audio through `projectAudioPath`. Chat lines of the script go into `VideoProps`.
- `packages/remotion/src/components/ChatWindow.tsx`: an original 2000s-messenger look, typing indicator, text appearing character by character, driven only by `useCurrentFrame`. Add it to `MOTION_COMPONENTS`; `resolveStoryboard` checks that its `lines` prop names chat lines. `ShotRenderer` wires it up. `beatAt` works without `bpm`.
- `buildSrt(script, timing)` in core; command `subtitles <project>` writes `renders/<slug>.en.srt`.
- `render --subtitles en` burns the subtitles in (`renders/<format>.en.mp4`) through a Remotion `Subtitles` component with a safe area for 9:16.
- QA for episodes: complete `text_en`, existing characters and sets, `limits.episode_seconds`, SRT present.
- Skill `new-episode` (interactive: create the project, then grill the user into `script.yaml` from `bible.md` and the episode plan). Episode notes in the `storyboard`, `assembly-render`, and `video-qa` skills.
- CI: validate, `voice-track`, `episode-track`, and a still render of the demo episode.
- Docs: `docs/pipeline.md`, `docs/architecture.md`, `docs/providers.md`, `AGENTS.md`, `CLAUDE.md`.
- Tests: master-format resolution, SRT, `ChatWindow` validation.

## Step 3 — after the MVP

- Lip-sync from speaker stems: for an episode `lipSync.source` defaults to `audio/stems/<character>.wav`; shot length is validated against `maxDuration` of the role for the selected provider.
- `limits.lipsync_seconds_max` and display rules (`silhouette` and `voice-only` characters cannot have a lip-sync shot).
- `art-director` compares keyframes with the series' character and set references.
- `/video-next` by kind, `/series-status`.
- Series budget, state, and manifest; skill `new-series`.
- Optional forced alignment for word times.

## Acceptance for the MVP

```bash
npm test && npm run typecheck && npm run python:test

# The music-video demo renders as before.
npm run demo:audio
npm run cli -- validate projects/demo
npm run cli -- render projects/demo --still 130 --still-scale 0.25

# The demo episode runs end to end on the mock provider.
npm run demo:episode
npm run cli -- voice-track projects/demo-episode
npm run cli -- episode-track projects/demo-episode
npm run cli -- validate projects/demo-episode
npm run cli -- render projects/demo-episode
npm run cli -- subtitles projects/demo-episode
npm run cli -- qa projects/demo-episode
```

- `renders/9x16.mp4` is 1080×1920; `renders/demo-episode.en.srt` exists.
- `validate-file` accepts valid and rejects broken `script.yaml`, `series.yaml`, and `sets.yaml`.
- `npm run schema` leaves no diff; `npm run pack:check` passes.
