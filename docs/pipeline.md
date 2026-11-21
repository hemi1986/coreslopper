# Pipeline Runbook

This page is the stage-by-stage operating manual. The project is autonomous by default; these are the commands a human or an agent runs when a stage needs attention.

## Before the pipeline

Create a workspace and a first project with the onboarding CLI:

```bash
npx coreslopper init my-video
cd my-video
npm run cli -- doctor
```

The wizard installs dependencies and stores optional `FAL_KEY` and Higgsfield credentials in `.env`. Open Claude Code in the workspace and run `/new-video` (or `/new-video my-video` for the project the wizard created). See [onboarding.md](onboarding.md) for flags and troubleshooting.

## Stage IDs

`setup`, `brief`, `treatment`, `audio-analysis`, `style-character`, `storyboard`, `assets`, `assembly`, `qa-export`. An episode has its own list; see [Episodes](#episodes).

The first three are **interactive**: the `new-video` skill runs them in the main session with the user. `/video-next` refuses to start while one of them is open and points back to `/new-video <slug>`. Every later stage runs autonomously in a fresh `stage-runner`.

The song always exists already. There is no lyric-writing or song-generation stage.

## 1. Setup

- Skill: `new-video`
- Input: project data, pasted lyrics, the song at `audio/song.wav` and the vocal stem at `audio/stems/vocals.wav`
- Output: `project.yaml`, `lyrics.txt`, `song.json`, `audio/song.wav`, `audio/stems/vocals.wav` (optional)

```bash
npm run cli -- new my-video --budget 50 --title "My Video" --visual fal
# user pastes lyrics → lyrics.txt with section tags
# user drops audio/song.wav and audio/stems/vocals.wav
npm run cli -- import-song projects/my-video
npm run cli -- stage-done projects/my-video setup --outputs lyrics.txt,song.json,audio/song.wav
```

`import-song` uses WAV files as they are and converts another format with the same name (`song.mp3`, `stems/vocals.flac`, …) to 48 kHz WAV. It merges path, duration, and stem status into `song.json`, keeping the title, artist, language, and rights the skill wrote, and warns when stem and mix differ in length. Pass `--song <file>` or `--vocals <file>` to import from elsewhere. Loudness normalization stays a separate, optional step: `npm run cli -- normalize-audio`.

Completion: every lyric line under a confirmed section tag, `audio/song.wav` exists, `song.json` records language and rights.

## 2. Brief

- Skills: `grilling`, `video-brief`
- Input: `project.yaml`, `lyrics.txt`, `song.json`, the user's answers, brand kit
- Output: `brief.md`

Completion: topic, source, audience, length, formats, style, constraints, success criteria; budget and formats match `project.yaml`; the grilling frontier is empty.

## 3. Treatment

- Skills: `grilling`, `video-treatment`
- Input: `brief.md`, `lyrics.txt`, brand kit
- Output: `treatment.md`

Completion: one-sentence core idea, visual world, section-by-section dramaturgy, explicit shot mix; the user accepted it.

## 4. Audio analysis

- Skill: `audio-analysis`
- Input: `audio/song.wav`, `audio/stems/vocals.wav` (optional), `lyrics.txt`
- Output: `timing.json`, `timing.report.md`

```bash
cd scripts/audio-analysis
uv sync
uv sync --extra asr --extra stems   # WhisperX + Demucs
uv run python analyze.py --project ../../projects/my-video --device cuda
cd ../..
npm run cli -- validate projects/my-video
```

Completion: timing validates; sections cover the song; low-confidence boundaries reviewed; overrides untouched.

## 5. Style & character bible

- Skills: `style-bible`, `character-bible`
- Input: brief, treatment, brand kit, model config
- Output: `style.yaml`, `characters.yaml`, character sheets/refs, character states; `sets.yaml` with sets, plates, and props when AI shots return to the same place or object

Completion: style validates; every storyboard style key exists; every recurring character has a sheet and reference image; every plate, prop, and character state has a reference image; art-director passes each on its own.

Plates, prop references, and character states are the continuity references ([ADR 0025](adr/0025-plates-props-character-states.md)): a plate is an empty frame of a set from one fixed camera angle, a prop reference the one look of a recurring object, a character state a named look the story puts a character in (hatch open, cable plugged in). Shots name them in `refs.plate`, `refs.props`, and `refs.states`, and keyframes in a plate are edits of it.

## 6. Storyboard

- Skill: `storyboard`
- Input: treatment, effective timing, style, characters, sets
- Output: `storyboard.yaml`, `storyboard.md`, `review/contact-sheet.svg`; new plates, props, or character states the story needs, appended to `sets.yaml` and `characters.yaml`

```bash
npm run cli -- validate projects/my-video
npm run cli -- contact-sheet projects/my-video
```

Completion: schema, anchors, coverage, references (including plates, props, and states), source rules, highlights, and chaining all pass; contact sheet exists.

## 7. Asset production

- Skills: `remotion-motion`, `ai-clips`, `footage`
- Input: storyboard, style, characters, model config
- Output: components, keyframes, clips, footage proxies, `assets/manifest.jsonl`

```bash
npm run cli -- estimate --role image.keyframe --units 8 --project projects/my-video
npm run cli -- generate projects/my-video --batch assets/batches/scene-01.json
```

Roles resolve to the project's provider. A Higgsfield project uses the `alternatives.higgsfield` entries in `config/models.yaml`; lip-sync runs on Higgsfield Speak v2 unless `providers.lipsync` names another provider (fal.ai OmniHuman is cheaper for short lines, see [providers.md](providers.md#lip-sync)). With `providers.video: comfyui`, clips render locally from `comfyui/workflows/` at $0 and lip-sync falls back to fal.ai ([comfyui/README.md](../comfyui/README.md)).

Completion: every shot has its source asset or a documented reason; every character shot used references; a shot with `refs.plate` has a keyframe edited from its plate, with its states and props as references; manifest and budget reconciled; art-director passes.

## 8. Assembly

- Skill: `assembly-render`
- Input: validated storyboard, assets, audio
- Output: `renders/preview-<master>.mp4` (`16x9` for a 16:9 master), then master/derivatives

```bash
npm run cli -- render projects/my-video --format 16x9 --preview
npm run cli -- render projects/my-video --format 16x9
npm run cli -- render projects/my-video --format 9x16
npm run cli -- render projects/my-video --format 1x1
```

Completion: preview plays with the song; master is 1080p30 H.264; derivatives use designed layouts; no clipping.

### Review notes

The user can watch any render in the review player and leave notes on exact frames ([ADR 0022](adr/0022-review-player.md), [scripts/review-player](../scripts/review-player/README.md)):

```bash
npm run cli -- review projects/my-video                 # newer of preview and master
npm run cli -- review projects/my-video --format 9x16
```

Notes land in `review/notes/<video-stem>.json`. No stage waits for them; on a fix pass, `assembly-render` maps each note to its shot and works through them.

## 9. QA & export

- Skill: `video-qa`
- Input: all renders, manifest, state, generated stills, brief, lyrics, `song.json`, the `release:` block of `project.yaml`, and `config/channel.yaml` if present
- Output: `review/report.md`, `review/upload.yaml`, and the release folder `renders/release/`

Once the master passes, the skill makes three YouTube thumbnails: the main character, the cameo or key scene, and the ensemble. The agent picks the stills and writes the hook; the `thumbnail` command composes each image deterministically with the brand fonts and the style bible's palette, as a 1280x720 sRGB JPEG under 2 MB. The art director reviews all three ([ADR 0018](adr/0018-thumbnails.md)).

Then it builds the rest of the release package ([ADR 0019](adr/0019-release-package.md), [ADR 0024](adr/0024-release-folder-manual-distribution.md)). The agent picks three Short moments on section boundaries (typically hook or intro, chorus, climax or drop; 30–50 s each); the `short` command cuts them from `renders/9x16.mp4`, frame-accurately with audio fades, and refuses more than 60 s. Each Short gets a 1080x1920 thumbnail (`thumbnail --format 9x16`), the song a 3000x3000 cover (`thumbnail --format 1x1`, artist and title only). The agent writes every platform's texts into `review/upload.yaml` in the project's language: YouTube title, description, tags, pinned comment, and community post; per Short the YouTube, Instagram, and TikTok texts; the Spotify Artist Pick and pitch; the announcement a week before; the X post; the LinkedIn decision (post or skip, from the song's theme) and post; and the microsite page texts ([ADR 0028](adr/0028-release-board-and-calendar.md), platform rules in [release-platforms.md](release-platforms.md)). Then `release` plans the release calendar and assembles the folder:

```text
renders/release/
  README.md            what goes where, the order, the open TODOs
  manifest.json        every file with size, SHA-256, specification, source
  video/               <slug>-<format>.mp4 for every format, <slug>.<lang>.srt
  thumbnails/          thumb-1.jpg … thumb-3.jpg (1280x720)
  shorts/              <name>-9x16.mp4 + <name>-thumb.jpg
  audio/               <artist> - <title>.wav (PCM 16/24 bit, ≥ 44.1 kHz, stereo, no normalisation)
  streaming/           cover-3000x3000.jpg, canvas-9x16.mp4 (3–8 s, silent loop), lyrics.txt, lyrics.lrc
  texts/               youtube.md, shorts.md, instagram.md, tiktok.md, spotify.md, x.md, linkedin.md, release-plan.md
  calendar.ics         the release calendar for a calendar app
  microsite/           <slug>.json: the song page data for the artist microsite
```

The release calendar `review/calendar.yaml` takes the next free release day and Short slots under the workspace's `config/release-schedule.yaml` (default: Friday, the song at 00:00 and the video at 18:00 as a Premiere, distributor T−21, pitch T−14, announcement T−7, Shorts Mo/We/Fr with songs interleaved, no releases on Christmas and New Year; time zone of the computer unless set), so no two projects collide. `release.release_date` in `project.yaml` wins; without it the date is a proposal. Times already planned stay; `calendar --replan` plans again.

`npm run cli -- release-board` serves a local page over every release folder: per platform the posts with their files, the texts to copy with counters, the settings to check, and the links; the calendar of all projects with an `.ics` export. The user ticks off what is posted and enters live URLs (`review/release-status.json`); the live YouTube URL fills the link in the X and LinkedIn texts and the microsite data.

`release` renders a format only when it is missing or stale (its inputs hash in `state.json` changed), hardlinks or copies every other file, converts the song only when it is not already a deliverable WAV, cuts the canvas from a lyric-free window near the first chorus with a crossfaded seam, and rewrites only its own files. Missing release facts (songwriters, genres, AI credits, release date) and `<ID>` links from `config/channel.yaml` become TODOs in `README.md` and in the texts; they never fail the stage. `review/upload.md` stays as a pointer to the folder.

```bash
npm run cli -- thumbnail projects/my-video --still assets/image/keyframe/<hash>-0.png \
  --text "THE HOOK|OF THE SONG" --tag LIVE --layout left --focus 0.6,0.35 \
  --out projects/my-video/renders/thumbnails/thumb-1-hero.jpg
npm run cli -- short projects/my-video --from section:chorus_1 --to section:chorus_1:end --name M2-chorus
npm run cli -- thumbnail projects/my-video --format 9x16 --still assets/image/keyframe/<hash>-0.png \
  --text "THE HOOK" --out projects/my-video/renders/shorts/M2-chorus-thumb.jpg
npm run cli -- thumbnail projects/my-video --format 1x1 --still assets/image/keyframe/<hash>-0.png \
  --text "ARTIST|TITLE" --out projects/my-video/renders/cover-3000x3000.jpg
npm run cli -- release projects/my-video              # renders/release/; --canvas-from <anchor>, --no-render
npm run cli -- upload-text projects/my-video          # review/upload.md, a pointer to the folder
npm run cli -- qa projects/my-video                   # PASS / FAIL / TODO per release check
```

The distributor upload stays manual: `texts/spotify.md` lists the form in the distributor's order. A fixed release date and an editorial pitch need at least three weeks' lead time (on DistroKid, a chosen date needs Musician Plus).

Completion: schema, assets, sync, readability, determinism, budget reconciliation, all formats, and the release package pass; the remaining TODOs are facts only the user can give.

## After the pipeline: publish

Uploading is not a stage: `/video-next` ends with `qa-export`, and the user runs `publish` when they want to ([ADR 0023](adr/0023-publish-command.md)). It uploads the main video and the Shorts to YouTube as private videos (or scheduled with `--schedule`) and the Shorts to TikTok as inbox drafts, from `review/upload.yaml`. Nothing becomes public; the user reviews each upload and publishes it on the platform.

```bash
npm run cli -- publish-auth youtube                 # once per workspace; opens the browser
npm run cli -- publish-auth tiktok
npm run cli -- publish projects/my-video --dry-run  # plan, limits, quota; no network calls
npm run cli -- publish projects/my-video            # upload what is not uploaded yet
npm run cli -- publish projects/my-video --only Z2-chorus --platform tiktok
```

Every attempt goes into `review/publish.json` with the file hash; a second run skips what is already uploaded with the same file (`--force` uploads again). A YouTube batch that would exceed the daily quota stops before the first upload. After the run, `publish` prints the manual steps: the related video of each Short in YouTube Studio, and the TikTok caption to paste. Setup of the Google Cloud project and the TikTok app: [publishing.md](publishing.md).

## Running the demo

```bash
npm install
npm run demo:audio
npm run cli -- validate projects/demo
npm run cli -- contact-sheet projects/demo
npm run cli -- render projects/demo --format 16x9
```

To exercise the Python analyzer without changing the committed timing fixture:

```bash
npm run demo:analyze
```

The demo is motion-only and uses no paid provider. It is the fastest way to check the pipeline and the renderer.

## Episodes

An episode of a series is a project with `kind: episode` (see [ADR 0016](adr/0016-episode-projects.md)). Its canon (style, characters, sets) lives in `series/<series>/`; its audio is built from `script.yaml` instead of a song. The stages:

`setup` ✋, `script` ✋, `voice-track`, `episode-track`, `storyboard`, `assets`, `assembly`, `qa-export`.

The `new-episode` skill runs the two interactive stages: it creates the project and grills the user into `script.yaml`. `/video-next <slug>` then runs the autonomous stages, and `/series-status <series>` (`npm run cli -- series-status <series>`) shows every episode of the series.

```bash
# setup: formats, providers, and brand are copied from series.yaml
npm run cli -- new night-desk-02 --kind episode --series demo-series --episode 2 --budget 20
# script: the skill writes script.yaml; check it at any time
npm run cli -- validate-file projects/night-desk-02/script.yaml

# voice-track: takes for audible lines, ambience per scene
npm run cli -- import-takes projects/night-desk-02     # optional: own recordings in audio/lines/<line-id>.*
npm run cli -- voice-track projects/night-desk-02 --dry-run
npm run cli -- voice-track projects/night-desk-02

# episode-track: placement, timing.json, audio/episode.wav, speaker stems
npm run cli -- episode-track projects/night-desk-02
npm run cli -- validate projects/night-desk-02

# storyboard and assets as for a music video, then:
npm run cli -- render projects/night-desk-02 --preview          # master format, e.g. renders/preview-9x16.mp4
npm run cli -- render projects/night-desk-02                    # renders/9x16.mp4
npm run cli -- render projects/night-desk-02 --subtitles en     # renders/9x16.en.mp4
npm run cli -- subtitles projects/night-desk-02                 # renders/night-desk-02.en.srt
npm run cli -- qa projects/night-desk-02
```

- **Takes.** `takes.json` (tracked) records each take's source, duration, text hash, and file hash. `voice-track` generates only missing or stale generated takes; a recording the user swapped in, or an imported take whose text changed, stops the stage until the user runs `import-takes` or deletes the file.
- **Re-timing.** Change `pause_after` in the script or add a line or section to `timing.overrides.json`, then run `episode-track` again. The mix follows the effective timing, so sound and picture move together.
- **Lip-sync.** A lip-sync shot is driven by the character's speaker stem; cut its segment with `npm run cli -- audio-segment <project> --start <s> --end <s> --name <shot-id> --character <id>`. Characters with the display rule `silhouette` or `voice-only` cannot have one, and `validate` rejects a shot longer than `maxDuration` of `video.lipsync` for the selected provider or `limits.lipsync_seconds_max` of the series.
- **Continuity references.** Plates, props, and character states live in the canon. An episode's storyboard may append new ones when its story needs them (a hatch opens, headphones go on); it never changes an existing entry.
- **QA** adds the episode checks: complete `text_en`, canon references, `limits.episode_seconds` of the series, and the SRT.

A series starts with the `new-series` skill. It creates the canon and generates its references through the series budget:

```bash
npm run cli -- new-series night-desk --budget 200 --format 9x16 --audio-provider comfyui
npm run cli -- generate --series night-desk --batch canon-batch.json --dry-run
npm run cli -- generate --series night-desk --batch canon-batch.json
npm run cli -- series-status night-desk
```

`series.yaml` `budget_usd` is an umbrella: canon generations are booked in `series/<slug>/state.json` and `series/<slug>/assets/manifest.jsonl`, each episode keeps its own budget, and `new --kind episode` refuses an episode whose budget does not fit in what is left.

The demo episode runs on the mock provider:

```bash
npm run demo:episode            # placeholder reference voices for series/demo-series
npm run cli -- voice-track projects/demo-episode
npm run cli -- episode-track projects/demo-episode
npm run cli -- render projects/demo-episode
```

## Hard stops and resume

A stage stops when:

- the next batch exceeds the budget or `batch_cap_usd`;
- the configured provider is missing credentials;
- validation fails after the stage's retries;
- a script would overwrite `timing.overrides.json` or `project.yaml`.

After fixing the cause, re-run `/video-next <slug>` or the specific stage with `--stage <stage>`. The state machine skips completed stages and resumes the failed one. To deliberately re-run a completed stage after changing an input, reset it first:

```bash
npm run cli -- stage-reset projects/my-video storyboard
```

## State inspection

```bash
npm run cli -- status projects/my-video
```

The status table shows every stage, attempts, outputs, spend, remaining budget, batch cap, and the next stage.

## Troubleshooting

- **`ffmpeg` missing:** run `./scripts/install-ffmpeg.sh` on Linux x64, or install it with your package manager. The motion-only demo still renders without it; footage and loudness normalization need it.
- **WhisperX/Demucs missing:** install the `asr`/`stems` extras. Do not silently skip word alignment for a real lyric video.
- **FAL_KEY missing:** switch `providers.image`/`providers.video` to `mock` or add the key to `.env`. If only lip-sync uses fal.ai, set `providers.lipsync: fal` and add `FAL_KEY`; the rest of the project can stay on Higgsfield or mock. Topview lip-sync needs `TOPVIEW_UID` and `TOPVIEW_OPENAPI_KEY` in addition to the platform key.
- **ComfyUI unreachable or workflow missing:** start ComfyUI or set `COMFYUI_URL` in `.env`, export the workflow with Export (API) into `comfyui/workflows/`, and check with `npm run cli -- doctor`. Or switch `providers.video` to a cloud provider.
- **Higgsfield credential missing or rejected:** add `HIGGSFIELD_API_KEY` (or `HF_API_KEY_ID` + `HF_API_KEY_SECRET`) to `.env`, or switch the provider to `mock` or `fal`.
- **Storyboard gap/overlap:** inspect the anchors. Prefer a symbolic anchor over a `time` escape hatch.
- **Render too slow:** use `--preview`, lower the concurrency, or render a still first.
- **Audio/video out of sync:** check `timing.effective.json` and the normalized song; re-run validation before re-rendering.
