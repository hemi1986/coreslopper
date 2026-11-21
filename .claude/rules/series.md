---
paths:
  - "packages/core/src/episode.ts"
  - "packages/cli/src/series.ts"
  - "packages/cli/src/new-series.ts"
  - "packages/cli/src/new-project.ts"
  - "packages/cli/src/voice-track.ts"
  - "packages/cli/src/takes.ts"
  - "packages/cli/src/episode-track.ts"
  - "packages/cli/src/subtitles.ts"
  - "workspace/.claude/skills/new-series/**"
  - "workspace/.claude/skills/new-episode/**"
  - "workspace/.claude/skills/voice-track/**"
  - "workspace/.claude/skills/episode-track/**"
  - "workspace/.claude/commands/series-status.md"
  - "projects/demo-series/**"
  - "projects/demo-episode/**"
  - "tests/episode*.test.ts"
  - "tests/series-*.test.ts"
---

# Series (BC-Series)

> Concept slice across core, cli, the workspace skills and the demo canon. Adopted 2026-11-22. Decided by
> recommendation plus four answers from the user. The model is in `docs/domain/events.yaml` (`AGG-Series`,
> `AGG-Script`, `AGG-TakeRegistry`, `AGG-EpisodeTrack`), the decisions in ADR 0042 (proposed), and gaps
> G-105–G-121 in `docs/domain/gap-register.md`. The canon files (characters, sets, plates, props, style) belong
> to the character slice, not this one.

## Purpose

Keeps a series' umbrella budget and episode plan and creates its episodes. Turns an episode's script into takes,
an episode track with speaker stems, subtitles and lip-sync audio: the episode's replacement for the song.

## Key terms

Series, Series Budget, Uncommitted Series Budget, Episode Plan, Planned Episode, Creative Limit, Canon Gap,
Episode, Script, Scene, Script Line, Speaker, Reference Voice, Take, Take Registry, Take Status, Ambience, Voice
Track, Episode Track, Speaker Stem, Subtitles – all in `docs/glossary.md`. A series is not a project. Write
"ambience" for the scene's `atmo`, and "voice track" only for the stage.

## As-is boundary

- The series is `series.yaml` plus `state.json` in `projects/<slug>/`; `budget_usd` is the source and
  `state.json` a copy that must match. `seriesBudget` (`series.ts`) sums canon spend and every episode's
  `budget_usd`; `createProject` (`new-project.ts`) checks a new episode against it.
- An episode copies formats, providers and brand once, at creation. `loadProject` reads its canon from the
  sibling series folder.
- The script's rules are pure functions in `packages/core/src/episode.ts` (`validateScript`, the TTS rule,
  `takeSource`, `placeLines`, subtitle cues). The hook validates every edit of `script.yaml`.
- `takes.json` is written by `voice-track` and `import-takes` (`media.ts`); `takes.ts` decides take status and
  what blocks. `episode-track` writes the timing, the mix and the speaker stems together from the effective
  timing.

## Boundaries

- Generate takes, ambience and canon references only through `runBatch`: takes on the episode budget, canon
  generations on the series budget.
- An imported take is the user's: never generate over it, never delete it.
- Only the agent writes `script.yaml`, at the user's request; after a change, run `voice-track` and
  `episode-track` again.
- An episode adds canon files and never overwrites one (ADR 0025; G-118).
- Keep the episode track deterministic: no speech recognition, no invented tempo.
- New domain rules go to core; file access and ffmpeg stay in the CLI (G-116).

## Typical pitfalls

- A canon generation ignores episode budgets (G-105); an episode budget changed later is not checked (G-108).
- A duplicate episode number passes `new` (G-109).
- A changed reference voice or `direction` leaves takes current (G-112, G-113): delete the takes to regenerate.
- A replaced or unregistered file in `audio/lines/` stops the voice track until `import-takes` or deletion.
- Ambience length is frozen at the first run, and its hash covers only the prompt; the mix loops or trims it.
- The episode length is checked only in QA (G-115).
- Spoken text is `text_de` under a German TTS rule, and subtitles are English only (G-114, intended for now).
- `lipsync-audio.ts` (lead-only muting) is music-video logic; an episode cuts lip-sync audio from its speaker
  stem.

## Read next

- `docs/glossary.md` (Series and episodes), `docs/pipeline.md`
- `docs/adr/0016-episode-projects.md`, `0025`, `0035`, `docs/adr/0042-series-and-episode-audio.md`
- `docs/domain/events.yaml`, `docs/domain/context-map.as-is.md`, `docs/domain/gap-register.md`
- `.claude/rules/generation.md` (the generation path takes use), `.claude/rules/timing.md` (the merge and
  overrides)
