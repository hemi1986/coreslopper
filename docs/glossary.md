# Video Workflow

The shared language of the workflow, its projects (music videos and series episodes), and its artifacts. Definitions describe what a term **is**, not how it is implemented. Code identifiers, schema keys, and skill descriptions use these terms.

## Language

**Workspace**:
A self-contained directory created by `npx coreslopper init` that holds the workflow runtime, configuration, credentials, and one or more projects. It is the unit a user opens in Claude Code.
_Avoid_: repo, checkout

**Runtime Snapshot**:
The versioned copy of the workflow files that `npx coreslopper init` writes into a workspace. It is not a git clone and is updated with `npx coreslopper@latest update`, which merges against the **Baseline**.
_Avoid_: install, template, runtime assets

**Baseline**:
Upstream's SHA-256 of every file of the runtime snapshot last installed or offered, stored in the **Workspace Marker**. It also holds the files `update` kept as a conflict, a local change, or a local deletion. `coreslopper update` compares it with the workspace to tell local edits from untouched workflow files.
_Avoid_: lockfile, manifest

**Workspace Marker**:
`coreslopper.workspace.json` at the workspace root: the runtime version, when the workspace was created and last updated, the first project, and the **Baseline**. Only `init` and `update` write it; a directory with it is a workspace.
_Avoid_: config, manifest

**Conflict Copy**:
`<file>.coreslopper-new`, upstream's version of a workflow file that changed both in the workspace and upstream, written by `update` beside the user's file. The user merges it into the file and deletes it; `--force` overwrites the file instead.
_Avoid_: conflict file, backup

**Onboarding**:
The interactive `npx coreslopper init` on a terminal: it asks for the directory, the tools to install, the providers and their keys, the first project, and the publishing clients, then creates the workspace.
_Avoid_: wizard (the board's **+ New**), setup (a **Stage**)

**Doctor**:
`doctor`: the check of a workspace, its layout, the files it needs, the keys, the tools, and ComfyUI. Only a required check fails it; the rest warn.
_Avoid_: health check, validate (the **validate** command checks projects)

**Legacy Layout**:
A workspace whose series canons are still in `series/` beside `projects/`. `migrate-layout` moves them into `projects/` once; until then `update` adds no copy of a canon to `projects/`, and `update` and `doctor` remind the user.
_Avoid_: old structure

**Board Container**:
The board and its **Watchdog** in Docker (`compose.yaml`, `docker/`): the workspace mounted, the dependencies in a volume installed again when `package-lock.json` changes, the port on the computer's loopback only. It runs the watchdog instead of `release-timer`, never beside it. After an update changed `docker/`, the image is built again.
_Avoid_: server, Docker board

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
The ComfyUI workflow family of a local image-to-video or first-last-frame clip, set per item: `ltx` (default) or `wan` (Wan 2.2, image-to-video only, silent, no lip-sync). Pika clips and local lip-sync take their workflow from the model role instead.
_Avoid_: engine, backend

**AI Clip**:
A generated video segment made from a keyframe and prompt, silent by default.
_Avoid_: generation, render

**Frame Chaining**:
Using the last frame of one AI clip as the first frame of the next to preserve continuity.
_Avoid_: stitching

**Style Bible**:
The authoritative palette, typography, look references, and motion rules of a music video or series canon. An episode uses its series' style bible.
_Avoid_: moodboard

**Character Bible**:
The authoritative recurring characters of a music video or series canon, each with its description, display rule, character sheet, reference images, reference voice, and character states. Character ids are unique and name the character's folder.
_Avoid_: cast list

**Set Bible**:
The sets of a music video or series canon with their plates, and the prop references, in `sets.yaml`. A music video has one when its AI shots return to a place or an object.
_Avoid_: sets file, location list

**Character Sheet**:
A reference image showing a character's design from multiple angles or expressions. Every recurring character the screen shows has one that passed the art director before anything derives from it; a one-off figure needs none. The `sheet` command's side-by-side comparison image is not a character sheet.
_Avoid_: portrait

**Character Identity**:
What stays the same about a character across productions: name, description, prompt, display rule, character sheet, reference images (face, turnaround, outfits), and reference voice. Character states are not part of it.
_Avoid_: outfit (an outfit image is one of its reference images), look

**Character Library**:
The workspace's collection of characters to reuse across music videos and series, in `library/characters/<id>/`. Characters of finished character bibles and canons come in by themselves; a project or canon takes a copy with `character use`, and its entry then names the library character in `library`.
_Avoid_: character database, cast

**Library Character**:
One entry of the character library: a character's identity, the character states of earlier productions, tags, where it came from first, and the history of later imports. A character of a bible that names it in `library` is a copy of it.
_Avoid_: library entry, figure

**Character Import**:
Taking the characters of a character bible into the character library, each into the library character it came from or a new one. Files are stored once by content; an existing library character keeps its identity and gains new reference images and states. Every file of a library character is named by it.
_Avoid_: sync, export

**Character Use**:
Copying a library character into a music video or series canon: its identity always, each character state only when chosen, together with the states it derives from. An episode takes its characters from its series canon.
_Avoid_: import (the other direction), take

**Brand Kit**:
A reusable package of logo, colors, fonts, tokens, and style guide, stored under `brand/<kit>/`.
_Avoid_: theme

**Contact Sheet**:
A grid of the storyboard's shots for a fast visual review on the board: per shot its id, source, section, times, description, text, and its keyframe once one exists.
_Avoid_: thumbnail sheet, shot overview

**Thumbnail**:
The composed image that represents a finished video on a platform such as YouTube: a generated image with the hook on solid slabs. The main video gets three 1280x720 thumbnails of different subjects, and the user picks one; each Short gets one at 1080x1920.
_Avoid_: poster, cover, preview image

**Composed Image**:
An image the `thumbnail` command makes from a generated image, the hook, and the style bible's colours and fonts: a thumbnail, a Short's thumbnail, a TikTok cover, the cover, or a feed or announcement image. It has its format's exact size, stays under the size limit, and keeps its **Thumbnail Recipe** beside it; the same inputs give the same pixels. The art director judges whether it reads at a quarter of its size.
_Avoid_: graphic, artwork

**Short**:
A vertical excerpt of the finished video for YouTube Shorts and similar feeds: 9:16, 30–50 s (never over 60 s), cut from the current 9:16 render on section boundaries with a short fade in and out, stored as `renders/shorts/<name>-9x16.mp4`. The agent picks the excerpts. Each video gets three.
_Avoid_: clip (an AI clip is a generated shot), teaser, reel

**Upload Data**:
`review/upload.yaml`: the structured upload texts of the main video and of every Short, per platform (YouTube, Instagram, TikTok, Spotify for Artists, X, LinkedIn, the microsite) and the announcement, with file, thumbnail, language, and the made-for-kids and synthetic-content declarations. The source of the upload text, the release texts, and every publish.
_Avoid_: metadata, upload manifest

**Upload Text**:
`review/upload.md`: the main video and the Shorts of the upload data rendered for people, with a pointer to the release folder. It is generated, never edited by hand.
_Avoid_: metadata, copy, upload package (the **Release Package** is everything to upload)

**Release Package**:
Everything a finished song and video need to be published, collected in the **Release Folder**: every format, thumbnails, Shorts, the song as WAV, cover, canvas, lyrics, the platform texts, and the release plan.
_Avoid_: deliverables, export bundle

**Release Folder**:
`renders/release/`, the one place the user uploads from. `release` assembles it again whenever its sources change; a run never removes a file it could not refresh.
_Avoid_: export folder, output

**Release Manifest**:
`renders/release/manifest.json`: every file of the release folder with size, hash, specification, and source, and the open TODOs. `release` writes it last; QA compares the folder against it.
_Avoid_: file list, index

**Release Metadata**:
The `release:` block of a project: the facts a distributor asks for, such as artist, genres, songwriters, release date, and AI credits. Only the user supplies them, per project or once as the channel's release defaults; a missing one is a TODO.
_Avoid_: tags, song info

**AI Credits**:
How much of the lyrics, music, vocals, and instrumental an AI tool made (none, partial, or full), with the tool and the licence basis, as distributors and platforms ask for it.
_Avoid_: AI tag, disclaimer

**Cover**:
The square 3000x3000 image a song carries in streaming stores, showing artist and title only. A composed image, made like a thumbnail from the strongest generated image; its recipe carries the release's announcement images.
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
`review/calendar.yaml`: when what goes online where for one project, planned in the next free slots of the release schedule without colliding with other projects. Each entry is a **Calendar Event**. A new release day plans every event again; times moved by hand are kept only while the day stays.
_Avoid_: release plan (the plan is the calendar's table in the release folder), timeline

**Calendar Event**:
One entry of a release calendar: a stable id, a time with its offset, a platform, a step (such as `distributor`, `announce`, `post`, `short`), and the item it concerns (the main video, a Short, or the announcement). The board shows each event as a card; a done mark or a live URL belongs to it.
_Avoid_: post, task (both are only labels on the board), slot

**Proposed Release Day**:
The release day the calendar picked from the release schedule because the project has no `release.release_date` yet. It stays the project's day until the user moves it, and the user fixes it without approving the autopilot; until then it is a TODO.
_Avoid_: tentative date, draft date

**Board**:
The workspace's local page (`board`; `release-board` is only an old alias of the command). It hosts the **Board Views** behind the **Board Navigation**: its **production view** shows every project and series as the pipeline leaves them, with the next command for Claude Code; its release view is the release board. The board guards every write with its **Write Guard** and owns no state of its own: every write goes to the context that owns it. The user opens it only on the computer it runs on and refreshes it by hand.
_Avoid_: dashboard, studio, release board (one view of it)

**Board View**:
One view of the board, chosen by the address after `#`: the production view (the overview, a project, a series), a project's review and release views, the release calendar, the character library, and the wizard. A project's views are its tabs. The release view speaks the project's language, every other view the browser's.
_Avoid_: page, screen, tab (only the switch between a project's views)

**Board Navigation**:
The board's left column: production, the release calendar, characters, **+ New**, then every project with its production phase and current stage (once done, its release day and done marks) and every series with its episodes. A project whose files do not load shows its error instead of disappearing.
_Avoid_: sidebar, menu

**Write Guard**:
The board's check on every request that is not a read: the board's loopback address, the board's own page as origin, and a JSON body (an upload: a raw file body that names its origin). It keeps any other web page in the browser from approving a release or changing a project.
_Avoid_: CSRF token, login, auth (the board has no users)

**Activity**:
What the **Watchdog**'s production scan recorded for the board: the last round and its interval, the **stalled** projects, and the latest events (stages, renders, queue, budget). The production view shows it; the board never changes it.
_Avoid_: log, feed, notifications

**Release Board**:
The board's release view over all release folders: per platform the posts with files, texts, limits, and settings, the calendar of all projects, and the user's done state and live URLs in `review/release-status.json`.
_Avoid_: dashboard, CMS

**Release Status**:
`review/release-status.json`: per calendar event the user's or the autopilot's **Done Mark** and **Live URL**, and the **Release Approval**. Written only under the project's release lock.
_Avoid_: progress, tracker

**Done Mark**:
The record that a calendar event went online, with when and by whom – the user ticking it off on the release board, or the autopilot after posting. A fact: it stays when the release day moves or the approval is withdrawn.
_Avoid_: posted (an autopilot state), checked

**Live URL**:
The public address of a calendar event's post, entered on the release board or recorded by the autopilot. The live YouTube URL goes into every text that points to the main video, and into the microsite data.
_Avoid_: link (a channel link is a profile), permalink

**Release Approval**:
The user's one click on the release board that hands a release to the release autopilot, for one release day. It covers the day, not the content; when the day moves the user approves again. Before it nothing goes out by itself; withdrawing it stops what the autopilot has not sent yet and keeps the done marks. A YouTube upload already scheduled still goes public at its time unless the user changes it in Studio.
_Avoid_: go-live, publish (the **Publish** command uploads privately)

**Release Autopilot**:
`release-run`, run by every **Watchdog** round: for an approved release it posts each calendar event that a platform API can post, at the event's time, and leaves the rest to the user. A post it cannot be sure about waits for the user instead of going out twice.
_Avoid_: scheduler, bot, cron job

**Watchdog**:
The round `watch` runs every few minutes (the board container or `release-timer`, one of the two, never both): the release autopilot, then the production scan, which records stage, render, queue, and budget events and **stalled** stages (running, but no file changed for an hour) for the board. It reads and records; it never changes a stage or starts Claude Code.
_Avoid_: monitor, daemon, supervisor

**Autopilot Log**:
`review/autopilot.json`: one entry per autopilot step on a calendar event (running, posted, uploaded, scheduled, draft, failed) and the user's retry and force marks.
_Avoid_: publish log (the **Publish Log** records uploads of `publish`)

**Announcement**:
The release's posts a week before: a story and a post image with the release date on them, the teaser, and the announcement text. A full `release` composes the images from the cover's still again whenever the date moves.
_Avoid_: teaser post, pre-save

**Thumbnail Recipe**:
`<image>.recipe.json` beside every composed image: the source image, focus, text, and options it was made from, so `release` can compose further images from the same source.
_Avoid_: preset, template (a **Template** seeds a project)

**Microsite**:
The artist's own website, built elsewhere. A song's page is built from `renders/release/microsite/<slug>.json`, the microsite data: texts, lyrics, images, credits, the AI disclosure line, and the live URLs.
_Avoid_: landing page, link-in-bio

**TODO**:
A gap in the release package that only the user can close, such as a missing songwriter, a proposed release day, or an `<ID>` link. It never fails QA; QA reports it as TODO, never as a warning.
_Avoid_: warning, error

## Publishing

**Publish**:
The user's explicit act of uploading a release package to platforms, as private videos or drafts. It is never a stage, and it never makes a video public. The release autopilot uploads YouTube and TikTok the same way.
_Avoid_: release, post, deploy

**Post**:
What goes public on a platform at a calendar event's time: by the user's hand, or by the release autopilot through a **Post Adapter** or TikTok's direct mode. A post that may have gone out is never sent again by itself.
_Avoid_: publish (a **Publish** upload stays private), tweet, share

**Platform**:
A service a release is published on: YouTube, TikTok, Instagram, X, LinkedIn, Spotify, or the microsite.
_Avoid_: channel, network, provider (a **Provider Adapter** generates media)

**Publish Adapter**:
The small implementation that uploads one item of upload data to YouTube or TikTok: a private or scheduled video, or a draft. Only TikTok's direct mode, which the autopilot uses after TikTok's audit, posts with it. Mock is the test adapter.
_Avoid_: uploader, integration, publisher

**Post Adapter**:
The small implementation that posts one post to X, LinkedIn, or Instagram. The post is sent once; an answer that is lost marks it a **Stuck Post**. Mock is the test adapter.
_Avoid_: social adapter, publish adapter

**Platform Credentials**:
The tokens a platform's API needs, stored only in the workspace's `.env` after the one-time consent of `publish-auth`, renewed by the adapters as they rotate. A platform without them is blocked for the autopilot; `doctor` and the release board say which are ready.
_Avoid_: login, auth, keys, access

**Autopilot State**:
What the release autopilot will do with a calendar event now: manual, unapproved, waiting, due, blocked, running, pending, done, failed, stuck, or missed. It is worked out every round from the release status, the autopilot log, and the clock, and never stored.
_Avoid_: status (the **Release Status** holds the user's marks)

**Take-over**:
The user's "Do it myself" on a calendar event: the autopilot leaves it alone until the user gives it back. It is a mark in the release status, beside the done mark.
_Avoid_: manual mode, opt-out
_UI (en)_: Do it myself

**Stuck Post**:
A post the autopilot sent and may have gone out, because the answer was lost or the platform failed after receiving it, or an attempt that has run for over an hour. It is never tried again by itself: the user checks the platform and marks it live or tries again.
_Avoid_: lost post, uncertain post, duplicate
_UI (en)_: not sure it is live

**Missed Post**:
A post whose calendar time passed by more than `late_hours` before the autopilot's first attempt, usually because the computer was off. It waits for the user's "Post now" or a take-over.
_Avoid_: late post, overdue

**Pinned Comment**:
The comment under the main video from the upload data, posted by the autopilot once the video is public. Pinning it stays a click in YouTube Studio.
_Avoid_: first comment

**Publish Log**:
`review/publish.json`: one entry per upload attempt with platform, item, file hash, remote ID, URL, status, and time. A file already in it for a platform is not uploaded again.
_Avoid_: upload history, manifest (the **Manifest** records generations)

**Draft**:
A TikTok upload waiting in the user's inbox for sound, caption, and posting.
_Avoid_: private video (a YouTube upload that is not public)

**Publish Plan**:
What a publish run will upload and skip, with the problems and the quota it found, before any network call. A dry run prints only the plan.
_Avoid_: preview (a **Preview** is a render)

**Manifest**:
The append-only record of every **Generation** of a project or series canon in `assets/manifest.jsonl`: operation, role, provider, model, prompt, seed, references, planned cost, whether it was reused from the cache, and whether it failed. A reuse is recorded at $0. Its costs add up to the project's recorded spend.
_Avoid_: log

**Generation Batch**:
A JSON or YAML array of one or more generation requests executed with budget, cache, and manifest checks. Its worst-case estimate, reuses included, must fit the remaining budget and the **Batch Cap** before the first call. The generation queue sends one item per batch.
_Avoid_: job

**Generation**:
One request of a batch item run for its model role: a new result from the provider, a reuse from the **Generation Cache**, or a failure. Each one is one line in the **Manifest**.
_Avoid_: job, call, request (the batch item it comes from)

**Generation Operation**:
The kind of a generation: `generateImage`, `editImage`, `textToVideo`, `imageToVideo`, `firstLastFrameToVideo`, `referenceToVideo`, `lipSync`, `generateAudio`, or `upscaleVideo` (the **Restore Pass**). It decides which references, audio, and duration an item needs.
_Avoid_: endpoint, task, mode

**Model Role**:
A named creative job in `config/models.yaml`, such as `image.keyframe` or `video.lipsync`: its base provider, model, params, price, and limits, with a **Provider Alternative** per other provider. The project's provider for the role's kind decides which entry runs; a project may override a role's model in `project.yaml`. Only the agent changes roles, at the user's request; a model switch is a configuration change.
_Avoid_: model (the slug or workflow a role names), preset

**Provider**:
What runs the generations of one kind for a project, set in `project.yaml` `providers` (`image`, `video`, `lipsync`, `audio`): a cloud provider (`fal`, `higgsfield`, `topview`), the local provider `comfyui`, or `mock`. Lip-sync falls back to fal.ai when the video provider is ComfyUI or Topview; reference-to-video always runs on ComfyUI.
_Avoid_: backend, vendor, engine

**Generation Cache**:
The results of earlier generations under `.cache/generations/<cache key>/`, shared by every project and series of a workspace. A generation with the same **Cache Key** reuses the result at no cost as long as its files exist.
_Avoid_: asset store

**Project Budget**:
The `budget_usd` of a project, or the series budget for the canon. Every new paid generation is billed at its planned cost from the model role; the board shows the planned spend, not the provider's invoice. A batch or spend that would exceed it is a hard stop.
_Avoid_: credits, balance

**Batch Cap**:
The most one generation batch may cost: `batch_cap_usd`, or 30 % of the remaining budget when it is not set, never more than the remaining budget.
_Avoid_: limit, quota

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
The small implementation of a **Provider** behind the generation operations. The cloud adapters for fal.ai, Higgsfield, and Topview make stills, edits, text-, image-, and first-last-frame-to-video clips, and lip-sync. The ComfyUI adapter runs tagged workflows on the user's GPU for stills, edits, every clip operation including reference-to-video, lip-sync, audio, and the restore pass. Mock is the deterministic test adapter.
_Avoid_: client, SDK, backend

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
The SHA-256 hash of a canonical generation request: what the provider is sent, the content hashes of its reference and audio files, and the ComfyUI workflow's own hash. It identifies a result in the **Generation Cache**.
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
The encoded video of one whole format of a project: `renders/<format>.mp4`, or `renders/<format>.en.mp4` with burned-in subtitles. Every format is rendered from the same composition at its own size and the master's frame rate; a derivative is rendered again, never cropped from the master. The song is the only sound.
_Avoid_: export, video file

**Master Format**:
The format a project is made for, `formats.master` in `project.yaml`: usually 16:9 for a music video and 9:16 for a series. `render` without `--format` renders it, and every check, preview, and fix pass starts with it.
_Avoid_: main format, primary format

**Derivative Format**:
Another format of the same project, from `formats.derivatives`: 9:16, 1:1, or 4:5. It is rendered after the master passes, and a shot whose subject would leave the frame gets a focus point.
_Avoid_: crop, variant

**Render Record**:
The two entries a whole render leaves in `state.json`: the hash of everything it was made from and the hash of the file. A render is current while its props, the song, the asset files, and the renderer's code are unchanged; `release` renders a stale or missing format again.
_Avoid_: render cache, render log

**Preview**:
A render for checks and inspection: a whole format at half scale (`renders/preview-<format>.mp4`), a passage (`--frames`), or one frame (`--still`). A preview is never recorded, never replaces a render, and never goes into the release.
_Avoid_: draft, test render

**Project**:
One music video or one episode, stored in `projects/<slug>/`, with its own config, state, artifacts, and budget.
_Avoid_: video, job

**Project Kind**:
What a project produces: `music-video` or `episode`. It decides the project's stages.
_Avoid_: project type, mode

**Template**:
The skeleton copied by `npm run cli -- new` (called from the `new-video` skill) into a new project.
_Avoid_: boilerplate

**Media Directory**:
The folder outside the workspace that holds a project's large media, set with `CORESLOPPER_MEDIA_DIR` (`{slug}` stands for the project's folder). A project's `assets/` and `renders/` are links into it, so every project path keeps working; a new project is linked when it is created, an existing one with `media-link`.
_Avoid_: media drive, media link (the command)

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
A set of episodes that share one canon and one series budget, stored in `projects/<slug>/` (marked by its `series.yaml`) beside its episodes. A series is not a project: it has no stages.
_Avoid_: show, season

**Canon**:
What every episode of a series shares: the series bible, style bible, character bible, set bible, and their references. An episode's storyboard and assets stages may add plates, prop references, and character states to it, on the episode's budget; no episode changes or removes an entry.
_Avoid_: lore, shared assets

**Series Budget**:
The umbrella budget of a series: the canon's generations plus every episode's own budget must fit in it. Every series has one, set in `series.yaml`.
_Avoid_: season budget, pooled budget

**Uncommitted Series Budget**:
What is left of a series budget after the canon's spend and every episode's budget; a new episode's budget must fit in it.
_Avoid_: remaining budget, free budget

**Series Bible**:
The written premise, tone, world rules, and episode plan of a series.
_Avoid_: brief, treatment

**Episode Plan**:
The planned episodes of a series, each with a number, a title, and an optional logline.
_Avoid_: season plan, schedule

**Planned Episode**:
An entry of the episode plan. It may have no project yet; an episode whose number the plan does not list is an episode outside the plan.
_Avoid_: unplanned episode

**Canon Gap**:
What a series canon still lacks before episodes can use it: no characters or sets, an on-screen character with neither a character sheet nor a reference image, a set without a reference, or a character without a reference voice.
_Avoid_: missing asset, incomplete canon

**Creative Limit**:
An optional bound a series sets on its episodes, such as episode length or lip-sync shot length. Technical limits of a model are not creative limits.
_Avoid_: constraint, max duration

**Episode**:
One installment of a series: a project of kind `episode` with a number, a script, and its own budget. It copies the series' formats, providers, and brand once, when it is created.
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
The audio of one audible script line (spoken or sound effect), generated or recorded by the user and registered in the take registry.
_Avoid_: clip, recording, segment

**Take Registry**:
The record of an episode's takes and ambience (`takes.json`): per take its source (generated or imported), length, the hash of what it was made from, and the hash of its file.
_Avoid_: take list, audio index

**Take Status**:
Whether a take still fits its script line: current, missing, stale (its line changed), replaced (someone swapped the file), or unregistered (a file without an entry). A replaced, unregistered, or stale imported take stops the voice track.
_Avoid_: take state

**Voice Track**:
The episode stage that makes the takes and ambience: it generates what is missing or stale and keeps every imported take.
_Avoid_: speaker stem, episode track

**Ambience**:
The background sound of a scene, such as room tone or machine hum, laid under its takes; its prompt is the scene's `atmo` field.
_Avoid_: background music, soundscape, atmo

**Episode Track**:
The finished audio of an episode, mixed from its takes, ambience, and optional music by the effective timing, together with its speaker stems. It takes the place of the song.
_Avoid_: soundtrack, song, mix, voice track

**Speaker Stem**:
The episode track reduced to one speaker's takes, at full length; the driving audio for that character's lip-sync.
_Avoid_: dialogue stem

**Subtitles**:
The translated text of the spoken and chat lines, plus on-screen text an sfx line names (a label, a sign), timed by the effective timing. Spoken text is German and subtitles are English today.
_Avoid_: captions, lyrics

## Model bench

**Model Bench**:
The fixed comparison of generation models and servers on scenes from past projects, run in the workspace and stored in `bench/`. It informs model choices; it never produces project assets.
_Avoid_: test suite, eval, benchmark project

**Bench Case**:
One scene that once broke or was hard, with its prompt, seed, inputs, known good result, the failure it stresses (`focus`), and rubric, in `bench/cases/<id>.yaml`. A case is a fixed input, not a recommended prompt.
_Avoid_: test, scenario, shot (a **Shot** belongs to a storyboard)

**Bench Set**:
A named selection of bench cases, such as `core` (every case), `smoke` (a quick check that a target works at all), or `portrait`. A case belongs to one or more sets.
_Avoid_: set (a **Set** is a location), suite

**Bench Target**:
A named way to run operations: a provider, a ComfyUI workflow or model slug per operation, its params, and optionally another ComfyUI server. A target runs only the operations it lists; a case it cannot run is skipped, not failed.
_Avoid_: model, backend, config

**Bench Fixture**:
A media file a bench case needs (keyframe, reference, vocal segment, known good result), copied from the projects of the workspace, or of another workspace, by `bench import`. Fixtures are never committed.
_Avoid_: asset, sample

**Known Good Result**:
The result the source project accepted for a bench case, shown beside every target's result as the bar to meet, not a target to copy. A case without one loses only that column.
_Avoid_: golden, reference (a reference is an input)

**Bench Run**:
One execution of selected bench cases on selected bench targets, stored in `bench/runs/<id>/` with its results, scores, ratings, and comparison page. A run is extended by running again with its id.
_Avoid_: job, batch

**Bench Result**:
The outcome of one bench case on one bench target for one seed: ok, refused, error, or skipped, with its files, time, cost, size, VRAM peak, and, when asked for, whether a second render gave the same bytes and the word error rate of its speech. A refusal is a result; an error is not scored.
_Avoid_: generation, attempt (an **Attempt** belongs to the generation queue), cell

**Frame Strip**:
A row of frames of a bench result's clip at the case's positions, the first thing the art director and the user look at.
_Avoid_: contact sheet (a **Contact Sheet** belongs to a storyboard), thumbnails

**Rubric**:
The weighted criteria of a bench case, each naming one observable way the scene fails, scored 0 (fail), 1 (weak), or 2 (pass) by the art director.
_Avoid_: checklist, test

**Bench Score**:
The art director's points for one bench result against the case's rubric, with a pass, weak, or fail outcome and a note that names the frame and the failure. A bench score is not a **Verdict**: it never files or requeues anything.
_Avoid_: verdict, rating

**Rating**:
The user's own 1-5 grade of a bench result, with an optional note, given on the comparison page and exported as `ratings.json`. The user's ratings break ties between bench scores.
_Avoid_: score (the art director's rubric result), grade, stars

**Bench Budget**:
The `budget_usd` of the bench in `bench/bench.yaml`, with its spend in `bench/state.json`, separate from every **Project Budget**. A bench run whose estimate exceeds it is refused before the first call.
_Avoid_: project budget, credits
