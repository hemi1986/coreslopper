# Episode projects for vertical-drama series

## Status

Accepted — 2026-11-10. Extends [ADR 0001](0001-folder-based-projects.md), [ADR 0005](0005-symbolic-timing-anchors.md), and [ADR 0013](0013-existing-song-interactive-setup.md). ADR 0013 stays in force for music videos.

## Context

coreslopper produces music videos: one project, one existing song, one render. Users also want to produce episodes of a series: short, dialogue-driven, usually vertical, with recurring characters and locations. Almost everything a music video needs is also what an episode needs: providers, cache, budget, state, storyboard, anchors, lip-sync, and Remotion.

Two things differ. An episode has no song; its audio is built from a script. And an episode is not self-contained: its characters, locations, and look belong to the series and must stay identical across episodes.

A fork would duplicate the workflow. Forcing episodes into the music-video stage list would leave stages that mean nothing (`audio-analysis` of a track whose timing we constructed ourselves).

## Decision

### A project has a kind

- `project.yaml` gets `kind: music-video | episode`. A missing `kind` means `music-video`, so existing projects are unchanged. An episode also sets `series: <slug>` and `episode: <n>`.
- Episodes live in `projects/<slug>/` like every other project. Hooks, ignore rules, the CLI, `update`, and `media-link` keep one project location.
- `state.json` records the same `kind`. `migrateState` copies it from `project.yaml`; `validate` fails when the two differ. The stage list is chosen by kind:

  | Music video | Episode |
  |---|---|
  | `setup` ✋ | `setup` ✋ |
  | `brief` ✋, `treatment` ✋ | `script` ✋ |
  | `audio-analysis` | `voice-track`, `episode-track` |
  | `style-character` | (canon, see below) |
  | `storyboard`, `assets`, `assembly`, `qa-export` | the same four |

### The series owns the canon

- `series/<slug>/` holds the **canon**: `series.yaml` (title, formats, provider defaults, episode plan, optional limits), `bible.md`, `style.yaml`, `characters.yaml`, `sets.yaml`, and references under `characters/<id>/` and `sets/<id>/`.
- The project loader resolves an episode's style, characters, and sets from its series folder. An episode has no copies and never writes the canon. The storyboard's `style` and `characters` path fields are not used for this: the loader has always ignored them, and honoring them would let one episode redirect its canon.
- A character gains an optional reference voice (a WAV and its exact transcript) and a display rule, `face: full | silhouette | screen-only | voice-only`. A **set** has an ID, a description, a prompt anchor, and one or more reference start frames.
- `new-episode` copies providers, formats, and brand from `series.yaml` into the episode's `project.yaml`. Nothing is inherited at run time: changing the series later must not silently change an existing episode's cache keys or costs.
- Creative limits are optional entries in `series.yaml` (`limits.episode_seconds`, `limits.lipsync_seconds_max`). Without an entry nothing is checked. Technical limits come only from `maxDuration` of the role for the selected provider in `config/models.yaml`.
- The first version ships a hand-written demo canon. A series-level budget, state, manifest, and a `new-series` skill that generates canon references follow later.

### The episode track replaces the song

- `script.yaml` replaces `lyrics.txt`: scenes (`id`, `set`, description, optional ambience prompt) with lines. A line has an `id`, a `kind` (`dialogue`, `voiceover`, `chat`, `announcement`, `sfx`, `pause`), and by kind a `speaker`, `text_de`, `text_en`, a direction, `pause_after`, a prompt, or a duration. Scenes become timing sections; lines become timing lines. Anchors, coverage, and the storyboard work unchanged.
- Lines play strictly one after another. A `chat` line makes no sound; its length is its character count divided by a typing speed, plus a hold. An optional `with: <line-id>` field is reserved for overlapping lines; validation rejects it until overlap is implemented.
- Spoken `text_de` must not contain digits, symbols, or abbreviations (the TTS rule of [ADR 0015](0015-comfyui-images-lipsync-audio.md)). `dialogue`, `voiceover`, `announcement`, and `chat` lines need `text_en`; they form the English subtitles.
- **`voice-track`** produces one **take** per audible line: speech through `audio.voice` with the speaker's reference voice, effects and scene ambience through `audio.sfx`, all through the usual estimate, budget, cache, and manifest. A user can instead put a recording at `audio/lines/<line-id>.wav` and register it with `import-takes`. `takes.json` records each take's source, duration, and text hash; only lines without a current take are generated.
- **`episode-track`** is deterministic and uses no speech recognition. It places the lines from the take durations, writes `timing.json`, merges `timing.overrides.json`, and mixes `audio/episode.wav` plus one **speaker stem** per character from the **effective timing**. An override therefore moves sound and picture together. In a music video an override corrects a measurement of fixed audio; here the audio is constructed, so the mix must follow it.
- `bpm` becomes optional in the timing schema; an episode has no tempo and gets no invented one. `beats`, `downbeats`, and `onsets` stay empty, so beat anchors fail with the existing error. `energy` stays required and is the RMS envelope of the finished episode track, so motion components react to speech. Word times are optional; forced alignment can add them later.

### Rendering and QA

- The master format is whatever `formats.master` says. Render, QA, and stage outputs derive the format ID from the master's aspect instead of assuming `16x9`. Music videos keep `renders/16x9.mp4`.
- The composition reads the project's audio by kind (`audio/song.wav` or `audio/episode.wav`). The composition keeps its name.
- A `ChatWindow` motion component shows `chat` lines, frame-driven and deterministic. Subtitles export to `renders/<slug>.en.srt`; a render can burn them in inside the format's safe area.
- A shot may name sets in `refs.sets`. A named set must exist and be the set of the shot's scene; a cutaway to another place is its own scene. A character whose display rule hides the face cannot have a lip-sync shot.
- `/video-next` runs both kinds; it reads the stage list from `status`.

### Not decided here: cloud speech

`providers.audio` knows only `comfyui` and `mock`. The intended path, not built yet: add `fal` to the audio providers, implement `generateAudio` in the fal.ai adapter, add `alternatives.fal` to `audio.voice` with a per-character pricing unit. Until then a user without a local GPU imports takes.

## Consequences

- One repository and one pipeline serve both kinds. A new kind is a stage list plus the stages that differ.
- Every function that walks stages depends on the state's `kind`. A state file whose kind disagrees with `project.yaml` is an error, not a guess.
- The timing schema loosens (`bpm` optional). Code that reads `bpm` needs a fallback; generated JSON Schema and Python validation stay compatible with existing files.
- An episode cannot be re-timed by editing audio. Re-timing means changing `pause_after` or an override and re-running `episode-track`, which is cheap because takes are cached.
- Canon files are shared mutable state between projects. Editing a character changes the reference hashes, and with them the cache keys, of every episode generated afterwards.
- Episodes are provider-agnostic except for speech, which needs ComfyUI or imported takes until the cloud path exists.
