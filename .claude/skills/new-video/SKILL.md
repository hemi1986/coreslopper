---
name: new-video
description: Create a new music-video project for an existing song, or resume one whose setup, brief, or treatment is unfinished. Asks for the project data, lyrics, and optional release data, imports the song and vocal stem, then grills the user into the brief and treatment.
license: MIT
---

# New Video

This skill runs the three **interactive stages** in the main session, with the user: `setup`, `brief`, `treatment`. Every later stage runs autonomously through `/video-next`. The song always exists already; this workflow never generates music.

Talk to the user in their language. Write every project file in English, except the lyrics, which stay in the sung language.

## Start or resume

1. If the user named a slug and `projects/<slug>/project.yaml` exists (the board's wizard may have created it, with lyrics, song, and user references), run `npm run cli -- status projects/<slug>` and jump to the first stage that is not `done`: `setup` → step 1 below (skip project creation), `brief` → step 6, `treatment` → step 7. If all three are done, go to step 8. When `setup` is done and `project.yaml` has no `release:` block, offer step 4 first; the user may skip it.
2. Otherwise start at step 1.

## Steps

### 1. Project data

Ask in one round, with a recommended answer for each:

- **Song title** and **artist**.
- **Slug** (lowercase, digits, dashes; recommend one derived from the title).
- **Budget in USD**. Mandatory. Never invent it; motion-only videos can run on a small budget, AI clips cost real money (`config/models.yaml` has prices).
- **Visual provider**: `mock` (motion graphics only, no key), `fal`, or `higgsfield`. Check `npm run cli -- doctor` for which keys exist and recommend accordingly.
- **Video clips**: the visual provider, or `comfyui` to render clips locally. Offer `comfyui` only when `doctor` shows ComfyUI reachable and at least one workflow. Stills and lip-sync can also run locally: after `new`, set `providers.image: comfyui` and `providers.lipsync: comfyui` in `project.yaml` if the user wants a fully local run; otherwise lip-sync stays on fal.ai.
- **Sung language** as an ISO code (`de`, `en`, …).
- **Rights**: who owns the song, and its license (for example "own song, all rights").

Then create the project from the repository root:

```bash
npm run cli -- new <slug> --budget <usd> --title "<title>" --visual <provider> [--video-provider comfyui]
```

Done when the command succeeds. On failure, show the error and stop; never create project files by hand.

### 2. Lyrics

Ask the user to paste the complete lyrics. Then write `projects/<slug>/lyrics.txt`:

- Keep the user's words, spelling, and line breaks exactly. Do not rewrite, correct, or translate.
- Every line must sit under a section tag: `[Intro]`, `[Verse 1]`, `[Pre-Chorus]`, `[Chorus]`, `[Bridge]`, `[Outro]`, and so on. Repeated sections repeat their tag. Keep tags the user already wrote; add missing ones by structure and repetition.
- Instrumental parts get a tag with no lines (`[Intro]`, `[Instrumental]`), so the analyzer can place them.
- Keep Suno parentheses as written, as in `My Machine (my machine)`. They mark backing vocals for Suno; the words are sung and timed, and the render shows them without the parentheses.
- Show the tagged section list (tags plus first line of each) and ask the user to confirm or correct it.

Done when the user has confirmed the section list and `lyrics.txt` contains every pasted line.

### 3. Song and vocal stem

Tell the user exactly where to put the files, with absolute paths:

- The finished mix: `projects/<slug>/audio/song.wav`
- The isolated vocal stem: `projects/<slug>/audio/stems/vocals.wav`

WAV is preferred and used as is. Another format with the same name (`song.mp3`, `stems/vocals.flac`, …; also aiff, m4a, ogg) is converted to WAV. Both files must be exported from the same session so they start at the same moment and have the same length. The vocal stem is strongly recommended; without it the analyzer separates vocals with Demucs, which is slower and less accurate. These files stay local and are never committed.

Wait until the user confirms the files are in place. Then:

1. Write `projects/<slug>/song.json` with the metadata from step 1:
   ```json
   { "title": "...", "artist": "...", "language": "de", "license": "...", "rights": "..." }
   ```
2. Run `npm run cli -- import-song projects/<slug>`. It checks both files, converts non-WAV files, and adds path, duration, and stem status to `song.json`.
3. If it reports a missing file, tell the user which path is expected and wait again. If it warns that the stem and the mix differ in length, ask the user to re-export them together; continue only if they accept the risk.
4. Mark the stage: `npm run cli -- stage-done projects/<slug> setup --outputs lyrics.txt,song.json,audio/song.wav`

Done when `import-song` succeeded and `setup` is `done`.

### 4. Release data (optional)

The release package at the end of the pipeline fills a distributor form (DistroKid or any other) from the `release:` block of `project.yaml`, over the channel's `release_defaults` in `config/channel.yaml`. Read those defaults first and ask only for the fields they leave open, in one round; the user may answer "later" to any field or to the whole block:

- **Distributor**: `distrokid` or `manual`.
- **Artist** and **title** as they appear in stores (default: song.json), **featured artists**.
- **Primary and secondary genre**, **lyrics language**, **explicit** (yes/no).
- **Release date** (`YYYY-MM-DD`). A fixed date and an editorial pitch need at least three weeks' lead time; on DistroKid a chosen date needs Musician Plus or higher.
- **Songwriters**: legal names, exactly as the user gives them. **Producer**, **label**, and an **ISRC** only when the recording was released before.
- **AI credits**: for lyrics, music, vocals, and instrumental each `none`, `partial`, or `full`; the **AI tool** (e.g. Suno) and the **licence note** (e.g. the paid plan the song was made with).

Write only what the user said into `project.yaml` under `release:` (schema: `schema/project.schema.json`; the hook validates the file). Names, credits, ISRCs, and rights come from the user alone; a field they leave open stays out, and `release` lists it as a TODO in `renders/release/README.md`.

If `config/channel.yaml` does not exist, mention once that the user can copy `templates/channel/channel.yaml` there for channel links, footer lines, hashtag sets, and the release facts every song shares (`release_defaults`); it is optional. When the user gives a fact that holds for every song (songwriters, AI credits, distributor), offer to put it into `release_defaults` instead of this project.

Done when the user has answered or deferred each field and `npm run cli -- validate-file projects/<slug>/project.yaml` passes.

### 5. Hand-over to grilling

Tell the user the song is in and that you now interview them about the video. Mention the song duration from `song.json`.

### 6. Brief

Use the `grilling` skill to interview the user about the video, then follow `.claude/skills/video-brief/SKILL.md` to write `brief.md`. You already know title, artist, budget, language, rights, and the lyrics, so do not ask for them again; read `lyrics.txt` and ground your questions in it. Read the user references (`npm run cli -- reference list projects/<slug>`) and open every file before the first question (images and PDFs directly, a video through `npm run cli -- frame projects/<slug> --input <file> --position middle`); ask what each one stands for unless its note says so. A storyboard or concept of the user's is their starting point: grill on it rather than around it. Record material the user hands over in chat with `npm run cli -- reference add projects/<slug> --file <path> --kind <kind> --note "<what for>"`. Typical open branches: what the video is about versus what the song is about, audience and platform, look and references, performers or characters on screen, real footage the user has, formats, and what must be avoided.

Done when the grilling frontier is empty, the user has confirmed shared understanding, `brief.md` is written, and `npm run cli -- stage-done projects/<slug> brief --outputs brief.md` succeeded.

### 7. Treatment

Follow `.claude/skills/video-treatment/SKILL.md`, using `grilling` only for decisions the brief left open (core idea, visual world, shot mix per section). Summarize the treatment in a few lines and ask whether it fits; revise once if the user wants changes.

Done when `treatment.md` is written, the user has accepted it, and `npm run cli -- stage-done projects/<slug> treatment --outputs treatment.md` succeeded.

### 8. Hand-over to the pipeline

Report the project path, budget, providers, and song duration. Tell the user that `/video-next <slug>` now runs the rest without further questions: audio analysis, style and character bible, storyboard, assets, assembly, and QA. Ask whether to start it now; if yes, run `/video-next <slug>`.

## Rules

- Edit `project.yaml` after creation only to add the `release:` block of step 4, and never overwrite `timing.overrides.json`.
- Do not copy audio into the repository outside `projects/<slug>/audio/`, and never commit it.
- Never echo API keys.
