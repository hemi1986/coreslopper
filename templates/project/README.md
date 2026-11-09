# {{TITLE}}

A coreslopper music-video project.

## Start here

1. Run `/new-video {{SLUG}}` in Claude Code. It asks for the lyrics, tells you where to put the song and the vocal stem (`audio/song.wav`, `audio/stems/vocals.wav`), and grills you into the brief and treatment.
2. Run `/video-next {{SLUG}}` to execute the rest of the pipeline. The default review mode is `auto`, so it runs without creative approval gates.
3. Run `/video-status {{SLUG}}` at any time to see the next stage.
4. Validate at any time with `npm run validate -- projects/{{SLUG}}`.
5. Render the master with `npm run render -- projects/{{SLUG}} --format 16x9`.

## Files

| File | Purpose |
|---|---|
| `brief.md` | Topic, audience, length, formats, style, constraints. |
| `treatment.md` | Visual concept, dramaturgy, shot mix. |
| `lyrics.txt` | Authoritative lyric text with section tags. |
| `song.json` | Song title, artist, language, rights, duration, stem status. |
| `timing.json` | Generated timing. |
| `timing.overrides.json` | User-owned corrections; never overwritten. |
| `style.yaml` | Style bible. |
| `characters.yaml` | Character bible. |
| `storyboard.yaml` | Machine-readable shot list. |
| `storyboard.md` | Human-readable shot list. |
| `state.json` | Resumable pipeline state and spend. |
| `brand/` | Optional project-specific brand overrides. |
| `review/` | Contact sheet, QA report, small stills. |
| `characters/<id>/` | Character sheets and reference images; gitignored. |
| `audio/`, `assets/`, `renders/` | Local media; gitignored. |

User-provided references belong in `assets/references/` (moodboards, composition, color) or `characters/<id>/` (recurring characters). Actual footage or stills used in the timeline belong in `assets/footage/`. All of these stay local.

## Media policy

Do not commit the song, stems, generated fal.ai or Higgsfield assets, commercial music, or renders. The repository is open source; keep it license-safe.
