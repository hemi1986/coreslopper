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
The authoritative lyric text with section tags, supplied by the user. Word text and spelling come from here, never from speech recognition. Every sung line sits under a section tag; words in parentheses are backing vocals, sung and timed like any other word.
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

**Lead Stem**:
The vocal stem without backing vocals (`audio/stems/lead.wav`), split off by the optional `separate_lead.py`. Lip-sync segments of a music video are cut from it when it exists.
_Avoid_: lead track, dry vocal

**Echo Span**:
A time range of backing vocals that the lead singer does not sing: parenthesized lyric words (Suno backing markup) or an unwritten echo found in the vocal stem. `audio-segment` silences echo spans so a lip-sync face does not mouth them.
_Avoid_: ad-lib (when the lead sings it), backing track, unwritten vocals, backing span

**Timing**:
The relationship between a project's audio and time: sections, lines, words, and energy, plus BPM, beats, downbeats, and onsets for a song. Measured for a music video, constructed for an episode.
_Avoid_: sync data

**Effective Timing**:
The result of merging `timing.json` with `timing.overrides.json`, made whenever a project is loaded; the only timing the renderer and every later stage read. `timing.effective.json` is a snapshot of it for agents and scripts.
_Avoid_: final timing, merged timing

**Timing Override**:
A user-authored correction to timing that always wins and is never overwritten. It moves times only (BPM, beats, downbeats, and the start and end of a section, line, or word); the user says what sits wrong and the agent enters it in `timing.overrides.json`. Changing the sections themselves means changing the lyrics and analyzing again.
_Avoid_: fix, patch

**Timing Report**:
The report the song analysis writes beside `timing.json` (`timing.report.md`): the sections with the confidence of their boundaries, lyric lines with a low alignment confidence or placed without a recognized word, and the echo spans. The agent reads it to propose timing overrides.
_Avoid_: analysis log, confidence report

**Section**:
A labeled span of the audio with a start, end, and the confidence of its boundaries: a song part such as intro, verse, or chorus, named by its section tag in the lyrics, or one **Scene** of an episode.
_Avoid_: part, segment

**Line**:
One lyric line or one **Script Line**, with a start, end, and optional words. It lies inside its section.
_Avoid_: phrase, entry

**Word**:
One lyric word with a start and end, inside its line; the unit for word pops and highlight words.
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
A symbolic reference from a shot boundary to timing: section, line, word, beat, downbeat, or an explicit time escape hatch. Section, line, and word anchors also name the edge (`start` or `end`); every anchor but `time` takes an offset in seconds.
_Avoid_: timestamp

**Shot**:
The smallest unit of visual direction: one continuous visual idea in a section, from a start anchor to an end anchor, with a shot source, a description, a camera direction, optional on-screen text with highlights, a transition, continuity references, and what its source needs (a motion component, keyframe and video prompts, an asset, or layers). Ids run `shot-001`, `shot-002`, … in playing order.
_Avoid_: clip, scene (a **Scene** is a part of a script), cut (a **cut** is a transition)

**Storyboard**:
The ordered, validated list of shots that covers the whole song or episode track: `storyboard.yaml`, one model for both project kinds. The agent writes it in the storyboard stage and changes it when the user asks, in the chat or in a review round; the user does not edit it by hand.
_Avoid_: shot list

**Shot Source**:
The provenance of a shot's imagery: motion, AI clip, footage, or mixed (two or more layers).
_Avoid_: type, medium, source (alone: a lip-sync shot's audio source is a stem, not a shot source)

**Layer**:
One part of a mixed shot: a motion component, an AI clip, or footage, stacked by its order. A layer has a layer type, never a shot source of its own.
_Avoid_: track, overlay

**Continuity Reference**:
What a shot pins down from the bibles so its keyframe cannot re-imagine it: style tokens, characters, sets, a plate, prop references, and character states. Every one must exist, and a character state belongs to a character on screen in the shot.
_Avoid_: refs, reference (a **User Reference** is the user's material)

**Lip-Sync Shot**:
An AI-clip shot whose frontal face keyframe is animated by the vocal segment between the shot's start and end: the vocal stem of a music video, the speaker stem of an episode. Its character shows a face, and the shot fits the lip-sync model's maximum length and, in an episode, the series' creative limit.
_Avoid_: talking shot, singing shot

**Highlight**:
A word of a shot's on-screen text that the renderer emphasises.
_Avoid_: accent, emphasis

**Focus Point**:
The point of a shot's media, as fractions of its width and height, that a narrower format's crop keeps in view. The default is the centre.
_Avoid_: crop point, anchor (an **Anchor** points into the timing)

**Coverage**:
The property that shots start at zero, end at the duration of the song or episode track, and leave no gaps or overlaps, each within one frame.
_Avoid_: completeness

**Keyframe**:
A still image that establishes a shot's look and serves as the start frame for image-to-video.
_Avoid_: still, frame

**Restore Pass**:
A SeedVR2 run on a finished local clip at `quality: final`: `restore` sharpens at the same size, `upscale` scales a half-size render up to the master. The result sits next to the clip as `<clip>_upscaled.mp4` with the clip's audio; the clip itself stays unchanged.
_Avoid_: upscale step, enhancer

**Video Model**:
The local clip backend of a shot: `ltx` (default; every operation, including lip-sync) or `wan` (Wan 2.2 image-to-video, silent, no lip-sync).
_Avoid_: engine, backend

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

**Character Library**:
The workspace's collection of characters to reuse across music videos and series, in `library/characters/<id>/`. Characters of finished character bibles and canons come in by themselves; a project or canon takes a copy with `character use`, and its entry then names the library character in `library`.
_Avoid_: character database, cast

**Brand Kit**:
A reusable package of logo, colors, fonts, tokens, and style guide, stored under `brand/<kit>/`.
_Avoid_: theme

**Contact Sheet**:
A grid of the storyboard's shots for a fast visual review on the board: per shot its id, source, section, times, description, text, and its keyframe once one exists.
_Avoid_: thumbnail sheet, shot overview

**Thumbnail**:
The still that represents a finished video on a platform such as YouTube: a generated still with the hook on solid slabs. The main video gets three 1280x720 thumbnails of different subjects; each Short gets one at 1080x1920.
_Avoid_: poster, cover, preview image

**Short**:
A vertical excerpt of the finished video for YouTube Shorts and similar feeds: 9:16, 30–50 s (never over 60 s), cut from the 9:16 render on section boundaries, stored as `renders/shorts/<name>-9x16.mp4`. Each video gets three.
_Avoid_: clip (an AI clip is a generated shot), teaser, reel

**Upload Data**:
`review/upload.yaml`: the structured upload texts of the main video and of every Short, per platform (YouTube, Instagram, TikTok, Spotify for Artists, X, LinkedIn, the microsite) and the announcement, with file, thumbnail, language, and the made-for-kids and synthetic-content declarations. The source of the upload text, the release texts, and every publish.
_Avoid_: metadata, upload manifest

**Upload Text**:
`review/upload.md`: the YouTube part of the upload data rendered for people, with a pointer to the release folder. It is generated, never edited by hand.
_Avoid_: metadata, copy

**Release Package**:
Everything a finished song and video need to be published, collected in the **Release Folder**: every format, thumbnails, Shorts, the song as WAV, cover, canvas, lyrics, the platform texts, and the release plan.
_Avoid_: deliverables, export bundle

**Release Folder**:
`renders/release/`, the one place the user uploads from. Its manifest records every file with size, hash, specification, and source.
_Avoid_: export folder, output

**Release Metadata**:
The `release:` block of a project: the facts a distributor asks for, such as artist, genres, songwriters, release date, and AI credits. Only the user supplies them, per project or once as the channel's release defaults; a missing one is a TODO.
_Avoid_: tags, song info

**AI Credits**:
How much of the lyrics, music, vocals, and instrumental an AI tool made (none, partial, or full), with the tool and the licence basis, as distributors and platforms ask for it.
_Avoid_: AI tag, disclaimer

**Cover**:
The square 3000x3000 image a song carries in streaming stores, showing artist and title only.
_Avoid_: artwork, thumbnail (a **Thumbnail** represents a video)

**Canvas**:
The silent 3–8 s vertical loop Spotify plays behind a song, cut from the 9:16 render.
_Avoid_: loop, visualizer

**Channel Config**:
`config/channel.yaml`: the workspace's channel with its handles, links, footer lines, hashtag sets, limit overrides, AI disclosure defaults, and the release defaults (release metadata shared by every song). Optional.
_Avoid_: brand kit (a **Brand Kit** is visual), profile

**Distributor**:
The service that delivers a song to streaming stores, such as DistroKid. Its upload stays manual.
_Avoid_: label, aggregator

**Release Schedule**:
`config/release-schedule.yaml`: the workspace's release rules: release weekday and times, lead steps, Short slots and posting times, holidays, booked slots. Optional; the defaults are a Friday release in the computer's time zone.
_Avoid_: posting plan, cadence

**Release Calendar**:
`review/calendar.yaml`: when what goes online where for one project, planned in the next free slots of the release schedule without colliding with other projects. Each entry is an event with an id, a time, a platform, and a step.
_Avoid_: release plan (the plan is the calendar's table in the release folder), timeline

**Board**:
The workspace's local page (`board`). Its **production view** shows every project and series as the pipeline leaves them, with the next command for Claude Code; its release view is the release board.
_Avoid_: dashboard, studio

**Release Board**:
The board's release view over all release folders: per platform the posts with files, texts, limits, and settings, the calendar of all projects, and the user's done state and live URLs in `review/release-status.json`.
_Avoid_: dashboard, CMS

**Release Approval**:
The user's one click on the release board that hands a release to the release autopilot. Before it nothing goes out by itself; withdrawing it stops what has not gone out.
_Avoid_: go-live, publish (the **Publish** command uploads privately)

**Release Autopilot**:
`release-run`, started by a timer every few minutes: for an approved release it posts each calendar event that a platform API can post, at the event's time, and leaves the rest to the user. A post it cannot be sure about waits for the user instead of going out twice.
_Avoid_: scheduler, bot, cron job

**Watchdog**:
The round `watch` runs every few minutes (the board container or `release-timer`): the release autopilot, then the production scan, which records stage, render, queue, and budget events and **stalled** stages (running, but no file changed for an hour) for the board. It reads and records; it never changes a stage or starts Claude Code.
_Avoid_: monitor, daemon, supervisor

**Autopilot Log**:
`review/autopilot.json`: one entry per autopilot step on a calendar event (running, posted, uploaded, scheduled, draft, failed) and the user's retry and force marks.
_Avoid_: publish log (the **Publish Log** records uploads of `publish`)

**Announcement**:
The release's posts a week before: a story and a post image with the release date on them, the teaser, and the announcement text. `release` composes the images from the cover's still again whenever the date moves.
_Avoid_: teaser post, pre-save

**Thumbnail Recipe**:
`<image>.recipe.json` beside a composed thumbnail: the still, focus, and options it was made from, so `release` can compose further images from the same still.
_Avoid_: preset, template (a **Template** seeds a project)

**Microsite**:
The artist's own website. A song's page is built from `renders/release/microsite/<slug>.json`.
_Avoid_: landing page, link-in-bio

**TODO**:
A gap in the release package that only the user can close, such as a missing songwriter or an `<ID>` link. It never fails QA.
_Avoid_: warning, error

## Publishing

**Publish**:
The user's explicit act of uploading a release package to platforms, as private videos or drafts. It is never a stage, and it never makes a video public.
_Avoid_: release, post, deploy

**Platform**:
A service a release is published on: YouTube, TikTok, Instagram, X, LinkedIn, Spotify, or the microsite.
_Avoid_: channel, network, provider (a **Provider Adapter** generates media)

**Publish Adapter**:
The small implementation that uploads one item of upload data to one platform (YouTube, TikTok) or posts one post (Instagram, X, LinkedIn); mock is the test adapter.
_Avoid_: uploader, integration

**Publish Log**:
`review/publish.json`: one entry per upload attempt with platform, item, file hash, remote ID, URL, status, and time. A file already in it for a platform is not uploaded again.
_Avoid_: upload history, manifest (the **Manifest** records generations)

**Draft**:
A TikTok upload waiting in the user's inbox for sound, caption, and posting.
_Avoid_: private video (a YouTube upload that is not public)

**Publish Plan**:
What a publish run will upload and skip, with the problems and the quota it found, before any network call. A dry run prints only the plan.
_Avoid_: preview (a **Preview** is a render)

**Animatic**:
A low-fidelity, timed preview of the storyboard before final assets.
_Avoid_: previz

**Manifest**:
The append-only record of every generation with model, prompt, seed, references, cost, and cache status.
_Avoid_: log

**Generation Batch**:
A JSON or YAML array of one or more generation requests executed with budget, cache, and manifest checks.
_Avoid_: job

**Generation Queue**:
The list of a project's open generations in `assets/queue.json`, worked by one `queue run` at a time: each item is generated, judged by the art director, and filed at its `out` path once an attempt is approved; a failed image is requeued with the verdict's fix prompt; an item waits for the items it derives from.
_Avoid_: worker, job list

**Attempt**:
One generated or patched version of a queue item, kept as `attempts/<name>-a<n>` next to its `out` path with its verdict. An item has at most three local attempts and one cloud attempt since it was last replaced. An attempt is approved by a pass verdict or an accept; only an approved attempt is filed. Putting an item back for its next attempt is a requeue.
_Avoid_: retry, version

**Region Patch**:
An edit of one box of an image that is pasted back with a soft edge (`patch`), so everything outside the box stays unchanged. The result is the next attempt of the image's queue item.
_Avoid_: inpaint, crop fix

**Provider Adapter**:
The small implementation behind `generateImage`, `editImage`, `textToVideo`, `imageToVideo`, `firstLastFrameToVideo`, and `lipSync`; fal.ai, Higgsfield, and Topview are the cloud adapters (all three lip-sync), ComfyUI is the local video adapter, and mock is the deterministic test adapter.
_Avoid_: client, SDK

**Provider Alternative**:
The `alternatives.<provider>` entry on a model role in `config/models.yaml`. It supplies the provider-specific model slug, params, and price so the same creative role can run on fal.ai, Higgsfield, or Topview.
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
The project setting that controls whether the pipeline runs autonomously (`auto`) or stops for one final human review before `qa-export` (`final`). The orchestrator makes that stop.
_Avoid_: approval mode

**Hard Stop**:
A condition that fails the running stage and halts the autonomous pipeline: the budget or batch cap would be exceeded, a real provider's credentials are missing, validation or QA fails after the stage's bounded retries, or a user-owned file would be overwritten (`timing.overrides.json`, `project.yaml`, an imported take, the series canon).
_Avoid_: gate

**Stage Runner**:
The isolated subagent or process that executes exactly one stage and returns a short summary.
_Avoid_: worker

**Stage Reset**:
The explicit action that returns a done, failed, or skipped stage, and every later stage, to pending so they run again after an input change. A running stage cannot be reset.
_Avoid_: rerun

**Stage Attempt**:
One start of a stage. A failed stage resumes with a new stage attempt; a stage reset starts the count again.
_Avoid_: retry, run

**Stage Skip**:
The user's manual decision to mark a stage as not needed for a project, so the pipeline continues after it. No skill or command skips a stage.
_Avoid_: bypass

**Production Phase**:
The coarse state of a whole project, derived from its stage states and shown on the board: `setup` (an interactive stage is open), `ready`, `running`, `failed`, or `done`.
_Avoid_: project stage, project status

**Art Director**:
The automated critic that gives a verdict on every generated image and clip (a clip by its frames), on continuity references, thumbnails, and covers, against the style bible, the character references, and the canon. It also scores bench results against a case rubric; those scores are not verdicts.
_Avoid_: reviewer

**Verdict**:
The art director's judgement of one attempt or image: pass or fail, a score from 0 to 10, its issues, and a fix prompt for the next attempt. Every verdict is recorded in `verdicts.jsonl`; the latest verdict per shot or reference counts. Only a blocking defect fails.
_Avoid_: review, rating

**Blocking Defect**:
An issue that fails a verdict, from a fixed list: a wrong or drifted character identity, wrong anatomy, a wrong continuity state or attachment or something physically impossible, a missing or wrong named prop, character, or plate, misspelled screen text, a break with an approved neighbouring frame, a recognizable real person or trademark.
_Avoid_: error, fail reason

**Verdict Note**:
Any issue in a verdict that is not a blocking defect, such as light, texture, or taste. It never fails a verdict and never causes a new attempt.
_Avoid_: note (alone), minor issue

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
The final step that produces all format renders, the review report, and the release package; also the optional extraction of a project into its own repository.
_Avoid_: render

**User Reference**:
Material the user hands over for the grilling and the bibles: mood boards, photos of people, places, their own storyboards, video concepts, footage, voice recordings, and links. Listed in `references.yaml` of a project or series canon (kind, subject, note), with the files in `assets/references/`; added in the board's wizard or with `reference add|link`. Not to be confused with the generated references of characters, sets, and props.
_Avoid_: moodboard (one kind of it), input files

**Review Note**:
A user's free-text remark on one frame or a range of frames of a render, saved by the board's review view or the desktop review player in `review/notes/<video-stem>.json` with its frame and time. A note without a round is a draft note (not a publishing **Draft**); a sent note never changes.
_Avoid_: annotation, comment, feedback

**Review Round**:
The draft notes of one render that the user sent to the agent in one click, frozen in `review/rounds/<NNN>.json` with each note's shots and section. The agent answers every note in `<NNN>.replies.json` (`fixed`, `partly`, `not-fixed`, `question`); until a valid replies file answers every note, the round is open and `/video-next` works on it first. An answered round stays answered: the user follows up on a `question` or `not-fixed` reply with a new note in the next round.
_Avoid_: ticket, feedback batch, review pass, submission

**Fix Pass**:
The agent's work on one review round: map the notes to shots, fix, re-render, and answer every note; it ends with the replies. Each round gets exactly one. `review-fix` is the stage runner's label for it, not a stage.
_Avoid_: review-fix (as a term), review stage

## Series and episodes

**Series**:
A set of episodes that share one canon, stored in `projects/<slug>/` (marked by its `series.yaml`) beside its episodes.
_Avoid_: show, season

**Canon**:
What every episode of a series shares and none may change: the series bible, style bible, character bible, sets, and their references.
_Avoid_: lore, shared assets

**Series Budget**:
The umbrella budget of a series: the canon's generations plus every episode's own budget must fit in it.
_Avoid_: season budget, pooled budget

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
A recurring location of a series or a music video with a description, reference frames, and plates. A scene plays in exactly one set.
_Avoid_: location, background, stage (a **Stage** is a pipeline step)

**Plate**:
An empty frame of a set from one fixed camera angle, in the set's light. A keyframe in that framing is an edit of the plate with characters and props inserted.
_Avoid_: background plate, backdrop, location shot

**Prop Reference**:
The one look of a recurring object (shape, colour, what is attached), with reference images every shot showing it uses.
_Avoid_: prop asset, item

**Character State**:
A named look the story puts a character in from some shot on, such as an open hatch, a plugged-in cable, or headphones, with the reference image every such keyframe derives from.
_Avoid_: outfit, variant, pose

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
The translated text of the spoken and chat lines, plus on-screen text an sfx line names (a label, a sign), timed by the effective timing.
_Avoid_: captions, lyrics

## Model bench

**Model Bench**:
The fixed comparison of generation models and servers on scenes from past projects, stored in `bench/`. It informs model choices; it never produces project assets.
_Avoid_: test suite, eval, benchmark project

**Bench Case**:
One scene that once broke or was hard, with its prompt, seed, inputs, known good result, and rubric, in `bench/cases/<id>.yaml`.
_Avoid_: test, scenario, shot (a **Shot** belongs to a storyboard)

**Bench Target**:
A named way to run operations: a provider, a ComfyUI workflow or model slug per operation, its params, and optionally another ComfyUI server.
_Avoid_: model, backend, config

**Bench Fixture**:
A media file a bench case needs (keyframe, reference, vocal segment, known good result), copied from a workspace project by `bench import`. Fixtures are never committed.
_Avoid_: asset, sample

**Bench Run**:
One execution of selected bench cases on selected bench targets, stored in `bench/runs/<id>/` with its results, scores, ratings, and comparison page.
_Avoid_: job, batch

**Rubric**:
The weighted criteria of a bench case, each scored 0 (fail), 1 (weak), or 2 (pass) by the art director.
_Avoid_: checklist, test

**Rating**:
The user's own 1-5 grade of a bench result, given on the comparison page and exported as `ratings.json`.
_Avoid_: score (the art director's rubric result)
