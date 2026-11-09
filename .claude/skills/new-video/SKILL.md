---
name: new-video
description: Create a new music-video project for an existing song, or resume one whose setup, brief, or treatment is unfinished. Asks for the project data and lyrics, imports the song and vocal stem, then grills the user into the brief and treatment.
license: MIT
---

# New Video

This skill runs the three **interactive stages** in the main session, with the user: `setup`, `brief`, `treatment`. Every later stage runs autonomously through `/video-next`. The song always exists already; this workflow never generates music.

Talk to the user in their language. Write every project file in English, except the lyrics, which stay in the sung language.

## Start or resume

1. If the user named a slug and `projects/<slug>/project.yaml` exists, run `npm run cli -- status projects/<slug>` and jump to the first stage that is not `done`: `setup` → step 1 below (skip project creation), `brief` → step 5, `treatment` → step 6. If all three are done, go to step 7.
2. Otherwise start at step 1.

## Steps

### 1. Project data

Ask in one round, with a recommended answer for each:

- **Song title** and **artist**.
- **Slug** (lowercase, digits, dashes; recommend one derived from the title).
- **Budget in USD**. Mandatory. Never invent it; motion-only videos can run on a small budget, AI clips cost real money (`config/models.yaml` has prices).
- **Visual provider**: `mock` (motion graphics only, no key), `fal`, or `higgsfield`. Check `npm run cli -- doctor` for which keys exist and recommend accordingly.
- **Sung language** as an ISO code (`de`, `en`, …).
- **Rights**: who owns the song, and its license (for example "own song, all rights").

Then create the project from the repository root:

```bash
npm run cli -- new <slug> --budget <usd> --title "<title>" --visual <provider>
```

Done when the command succeeds. On failure, show the error and stop; never create project files by hand.

### 2. Lyrics

Ask the user to paste the complete lyrics. Then write `projects/<slug>/lyrics.txt`:

- Keep the user's words, spelling, and line breaks exactly. Do not rewrite, correct, or translate.
- Every line must sit under a section tag: `[Intro]`, `[Verse 1]`, `[Pre-Chorus]`, `[Chorus]`, `[Bridge]`, `[Outro]`, and so on. Repeated sections repeat their tag. Keep tags the user already wrote; add missing ones by structure and repetition.
- Instrumental parts get a tag with no lines (`[Intro]`, `[Instrumental]`), so the analyzer can place them.
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

### 4. Hand-over to grilling

Tell the user the song is in and that you now interview them about the video. Mention the song duration from `song.json`.

### 5. Brief

Use the `grilling` skill to interview the user about the video, then follow `.claude/skills/video-brief/SKILL.md` to write `brief.md`. You already know title, artist, budget, language, rights, and the lyrics, so do not ask for them again; read `lyrics.txt` and ground your questions in it. Typical open branches: what the video is about versus what the song is about, audience and platform, look and references, performers or characters on screen, real footage the user has, formats, and what must be avoided.

Done when the grilling frontier is empty, the user has confirmed shared understanding, `brief.md` is written, and `npm run cli -- stage-done projects/<slug> brief --outputs brief.md` succeeded.

### 6. Treatment

Follow `.claude/skills/video-treatment/SKILL.md`, using `grilling` only for decisions the brief left open (core idea, visual world, shot mix per section). Summarize the treatment in a few lines and ask whether it fits; revise once if the user wants changes.

Done when `treatment.md` is written, the user has accepted it, and `npm run cli -- stage-done projects/<slug> treatment --outputs treatment.md` succeeded.

### 7. Hand-over to the pipeline

Report the project path, budget, providers, and song duration. Tell the user that `/video-next <slug>` now runs the rest without further questions: audio analysis, style and character bible, storyboard, assets, assembly, and QA. Ask whether to start it now; if yes, run `/video-next <slug>`.

## Rules

- Do not edit `project.yaml` by hand after creation, and never overwrite `timing.overrides.json`.
- Do not copy audio into the repository outside `projects/<slug>/audio/`, and never commit it.
- Never echo API keys.
