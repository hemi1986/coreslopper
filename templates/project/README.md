# {{TITLE}}

A coreslopper music-video project.

## Start here

1. Read `project.yaml` for the budget, formats, and providers.
2. Run `/video-status` in Claude Code to see the next stage.
3. Run `/video-next` to execute the pipeline. The default review mode is `auto`, so the pipeline runs without creative approval gates.
4. Validate at any time with `npm run validate -- projects/{{SLUG}}`.
5. Render the master with `npm run render -- projects/{{SLUG}} --format 16x9`.

## Files

| File | Purpose |
|---|---|
| `brief.md` | Topic, audience, length, formats, style, constraints. |
| `treatment.md` | Visual concept, dramaturgy, shot mix. |
| `lyrics.txt` | Authoritative lyric text with section tags. |
| `suno-style.txt` | Style prompt for Suno. |
| `song.json` | Song provenance and metadata. |
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

Do not commit generated Suno, fal.ai, or Higgsfield assets, commercial music, or renders. The repository is open source; keep it license-safe.
