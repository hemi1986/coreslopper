---
id: ST-035
title: The episode track levels speech takes to one loudness
type: task
ui: false
priority: must
size: null
risk: null
depends_on: []
labels: [feature:episode-audio]
status: in-progress
---

## Task
`episode-track` puts every take into the mix at gain 1 and levels only the finished mix (`levelToTarget` in
`packages/cli/src/episode-track.ts`). So voices from different sources stay apart in the episode track. In a
workspace episode a designed voice came out at -15.8 LUFS and a cloned voice at -19.7 to -24.2 LUFS. The user
levelled the takes by hand and registered them again with `import-takes`, which turned generated takes into
imported ones.

`episode-track` now measures every speech take (`dialogue`, `voiceover`, `announcement`) and mixes it with the gain
that brings it to one speech loudness. The take files and `takes.json` stay untouched. `sfx` takes, ambience, and
`audio/music.wav` keep their current level. The finished mix is still levelled to `render.loudness_lufs` afterwards.

## Acceptance Criteria
- [x] `config/defaults.yaml` has `render.speech_lufs` (default -20); `DefaultsSchema` accepts it
- [x] `episode-track` mixes every speech take at the gain that brings its measured integrated loudness to `render.speech_lufs`; a silent take (loudness not measurable) is mixed at gain 1
- [x] `sfx` takes, ambience, and music keep their gains; the speaker stems use the same speech gains as the mix
- [x] The take files and `takes.json` are unchanged after `episode-track`; a take's status stays `current`
- [x] `episode-track` prints each speech take's measured loudness and applied gain in one line per take
- [x] A test with two speech takes about 8 LU apart shows both within 1 LU of `render.speech_lufs` in the speaker stems; the committed demo timing still rebuilds unchanged
- [x] `docs/pipeline.md` (Episodes) and the `episode-track` skill describe the levelling; `npm test` and `npm run typecheck` are green

## Out of Scope
- A per-line gain in `script.yaml` (a line deliberately louder or quieter): a change of the script, so a domain story via `/feature` if it is needed after the levelling
- Levelling `sfx` takes or ambience
- Music videos: their audio is the user's finished song

## Open Questions
- none
