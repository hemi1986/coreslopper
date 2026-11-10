# Video Workflow

The shared language of the workflow, its projects (music videos and series episodes), and its artifacts. Definitions describe what a term **is**, not how it is implemented. Code identifiers, schema keys, and skill descriptions use these terms.

## Language

**Workspace**:
A self-contained directory created by `npx coreslopper init` that holds the workflow runtime, configuration, credentials, and one or more projects. It is the unit a user opens in Claude Code.
_Avoid_: repo, checkout

**Runtime Snapshot**:
The versioned copy of the workflow files that `npx coreslopper init` writes into a workspace. It is not a git clone and is updated with `npx coreslopper@latest update`, which merges against the **Baseline**.
_Avoid_: install, template

**Baseline**:
The SHA-256 of every runtime file as last installed, stored in `coreslopper.workspace.json`. `coreslopper update` compares it with the workspace to tell local edits from untouched workflow files.
_Avoid_: lockfile, manifest

**Brief**:
The one-page statement of topic, source, audience, length, formats, and style that anchors every later creative decision.
_Avoid_: concept, pitch

**Treatment**:
The visual and dramatic interpretation of the brief: core idea, imagery, dramaturgy, and shot mix. Music videos only.
_Avoid_: outline, script (a **Script** belongs to an episode)

**Lyrics**:
The authoritative lyric text with section tags, supplied by the user. Word text and spelling come from here, never from speech recognition.
_Avoid_: transcript

**Song Import**:
Registering the user's finished mix (`audio/song.wav`) and vocal stem (`audio/stems/vocals.wav`) in `song.json`, converting other formats to WAV. Every project starts from an existing song; coreslopper never generates music.
_Avoid_: song generation, upload

**Interactive Stage**:
A stage a setup skill runs with the user in the main session: `setup`, `brief`, and `treatment` for a music video, `setup` and `script` for an episode. `/video-next` never dispatches one.
_Avoid_: approval gate

**Stem**:
An isolated audio part such as vocals, drums, bass, or other, used for analysis and mixing.
_Avoid_: track (except in **Episode Track**)

**Timing**:
The relationship between a project's audio and time: sections, lines, words, and energy, plus BPM, beats, downbeats, and onsets for a song. Measured for a music video, constructed for an episode.
_Avoid_: sync data

**Effective Timing**:
The result of merging `timing.json` with `timing.overrides.json`; the only timing the renderer reads.
_Avoid_: final timing

**Timing Override**:
A user-authored correction to timing that always wins and is never overwritten.
_Avoid_: fix, patch

**Section**:
A labeled span of the audio with a start, end, and confidence: a song part such as intro, verse, or chorus, or one **Scene** of an episode.
_Avoid_: part, segment

**Line**:
One lyric line or one **Script Line**, with a start, end, and optional words.
_Avoid_: phrase

**Word**:
One lyric word with a start and end; the unit for word pops and highlight words.
_Avoid_: token

**Beat**:
A musical pulse detected in the song; the unit for rhythmic motion.
_Avoid_: pulse

**Downbeat**:
The first beat of a bar; the unit for larger structural motion.
_Avoid_: bar start

**Onset**:
The detected start of a musical event, used for visual accents.
_Avoid_: hit

**Energy**:
A frame-level measure of musical intensity, used to drive visual intensity.
_Avoid_: loudness, volume

**Anchor**:
A symbolic reference from a shot boundary to timing: section, line, word, beat, downbeat, or an explicit time escape hatch. Section and line anchors also name the edge (`start` or `end`).
_Avoid_: timestamp

**Shot**:
The smallest unit of visual direction: one continuous visual idea with a source, timing, description, camera, text, and references.
_Avoid_: clip, scene (a **Scene** is a part of a script)

**Storyboard**:
The ordered, validated list of shots that covers the whole song or episode track.
_Avoid_: shot list

**Shot Source**:
The provenance of a shot's imagery: motion, AI clip, footage, or mixed.
_Avoid_: type, medium

**Coverage**:
The property that shots start at zero, end at the audio duration, and leave no gaps or overlaps.
_Avoid_: completeness

**Keyframe**:
A still image that establishes a shot's look and serves as the start frame for image-to-video.
_Avoid_: still, frame

**AI Clip**:
A generated video segment made from a keyframe and prompt, silent by default.
_Avoid_: generation, render

**Frame Chaining**:
Using the last frame of one AI clip as the first frame of the next to preserve continuity.
_Avoid_: stitching

**Style Bible**:
The project's authoritative palette, typography, look references, and motion rules.
_Avoid_: moodboard

**Character Bible**:
The authoritative descriptions, reference images, and sheets for recurring characters.
_Avoid_: cast list

**Character Sheet**:
A reference image showing a character's design from multiple angles or expressions; required for every character shot.
_Avoid_: portrait

**Brand Kit**:
A reusable package of logo, colors, fonts, tokens, and style guide, stored under `brand/<kit>/`.
_Avoid_: theme

**Contact Sheet**:
A grid of stills sampled from the storyboard for fast visual review.
_Avoid_: thumbnail sheet

**Animatic**:
A low-fidelity, timed preview of the storyboard before final assets.
_Avoid_: previz

**Manifest**:
The append-only record of every generation with model, prompt, seed, references, cost, and cache status.
_Avoid_: log

**Generation Batch**:
A JSON or YAML array of one or more generation requests executed with budget, cache, and manifest checks.
_Avoid_: job

**Provider Adapter**:
The small implementation behind `generateImage`, `editImage`, `textToVideo`, `imageToVideo`, `firstLastFrameToVideo`, and `lipSync`; fal.ai and Higgsfield are the cloud adapters, ComfyUI is the local video adapter, and mock is the deterministic test adapter.
_Avoid_: client, SDK

**Provider Alternative**:
The `alternatives.<provider>` entry on a model role in `config/models.yaml`. It supplies the provider-specific model slug, params, and price so the same creative role can run on fal.ai or Higgsfield.
_Avoid_: fallback, alias

**ComfyUI Workflow**:
A ComfyUI graph saved with Export (API) in `comfyui/workflows/<name>.json`. Its name is the `model` of a role's `alternatives.comfyui` entry. The adapter finds the nodes it fills by **title tags** such as `cs_prompt` and `cs_start_image`; the image tags decide which clip operation the workflow fits.
_Avoid_: UI workflow (the non-API save format, which the adapter rejects)

**Mock Provider**:
A deterministic provider that returns placeholder assets and costs nothing; used by tests, CI, and no-account runs.
_Avoid_: fake

**Cache Key**:
The SHA-256 hash of a canonical generation request, including reference-file hashes, used to reuse an asset.
_Avoid_: hash

**Stage**:
One isolated step of the pipeline with a contract, outputs, and a completion check.
_Avoid_: step, phase

**Review Mode**:
The project setting that controls whether the pipeline runs autonomously (`auto`) or stops for one final human review (`final`).
_Avoid_: approval mode

**Hard Stop**:
A condition that halts the autonomous pipeline: budget exceeded, missing credentials, or unrecoverable validation failure.
_Avoid_: gate

**Stage Runner**:
The isolated subagent or process that executes exactly one stage and returns a short summary.
_Avoid_: worker

**Stage Reset**:
The explicit action that returns a done, failed, or skipped stage to pending so it can run again after an input change.
_Avoid_: rerun

**Art Director**:
The automated critic that judges stills and keyframes against the style bible and character references.
_Avoid_: reviewer

**QA Checker**:
The automated critic that checks coverage, sync, readability, determinism, and manifest/cost consistency.
_Avoid_: tester

**Render**:
The encoded video output for one format.
_Avoid_: export

**Preview**:
A low-resolution or short render used for automated checks and human inspection.
_Avoid_: draft

**Project**:
One music video or one episode, stored in `projects/<slug>/`, with its own config, state, artifacts, and budget.
_Avoid_: video, job

**Project Kind**:
What a project produces: `music-video` or `episode`. It decides the project's stages.
_Avoid_: project type, mode

**Template**:
The skeleton copied by `npm run cli -- new` (called from the `new-video` skill) into a new project.
_Avoid_: boilerplate

**Export**:
The final step that produces all format renders and the review report; also the optional extraction of a project into its own repository.
_Avoid_: render

## Series and episodes

**Series**:
A set of episodes that share one canon, stored in `series/<slug>/`.
_Avoid_: show, season

**Canon**:
What every episode of a series shares and none may change: the series bible, style bible, character bible, sets, and their references.
_Avoid_: lore, shared assets

**Series Bible**:
The written premise, tone, world rules, and episode plan of a series.
_Avoid_: brief, treatment

**Episode Plan**:
The planned episodes of a series, each with a number, a title, and an optional logline.
_Avoid_: season plan, schedule

**Creative Limit**:
An optional bound a series sets on its episodes, such as episode length or lip-sync shot length. Technical limits of a model are not creative limits.
_Avoid_: constraint, max duration

**Episode**:
One installment of a series: a project of kind `episode` with a number, a script, and its own budget.
_Avoid_: part, chapter

**Script**:
The authoritative text of an episode: its scenes and their script lines, in playing order. It is to an episode what lyrics are to a music video.
_Avoid_: screenplay, treatment, transcript

**Scene**:
A continuous part of a script that plays in one set. It becomes one section of the timing.
_Avoid_: shot, sequence

**Script Line**:
One timed unit of a scene: spoken dialogue, a voice-over, an announcement, an on-screen chat message, a sound effect, or a pause.
_Avoid_: cue, lyric line

**Speaker**:
The character a script line belongs to.
_Avoid_: actor, voice

**Reference Voice**:
A recording of a character's voice with its exact transcript, used to speak that character's lines.
_Avoid_: voice sample, voice model

**Display Rule**:
How a character may appear on screen: full face, silhouette, on a screen only, or as a voice only.
_Avoid_: visibility

**Set**:
A recurring location of a series with a description and reference frames. A scene plays in exactly one set.
_Avoid_: location, background, stage (a **Stage** is a pipeline step)

**Take**:
The audio of one script line, generated or recorded by the user.
_Avoid_: clip, recording, segment

**Ambience**:
The background sound of a scene, such as room tone or machine hum, laid under its takes.
_Avoid_: background music, soundscape

**Episode Track**:
The finished audio of an episode, mixed from its takes, ambience, and optional music. It takes the place of the song.
_Avoid_: soundtrack, song, mix

**Speaker Stem**:
The episode track reduced to one speaker's takes, at full length; the driving audio for that character's lip-sync.
_Avoid_: voice track, dialogue stem

**Subtitles**:
The translated text of the spoken and chat lines, timed by the effective timing.
_Avoid_: captions, lyrics
