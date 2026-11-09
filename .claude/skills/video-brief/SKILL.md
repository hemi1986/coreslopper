---
name: video-brief
description: Use when starting a music-video project, turning an idea into a brief, or revising the brief after a concept change. Covers topic, source, audience, length, formats, style, constraints, and success criteria.
license: MIT
---

# Video Brief

## When to use

- A new project needs its `brief.md`.
- The user changes the song, audience, length, formats, or creative direction.
- A later stage feels ambiguous and the brief is the missing anchor.

## Inputs

- `projects/<slug>/project.yaml` (budget, formats, providers, brand).
- `lyrics.txt` and `song.json` (title, artist, language, rights, duration). The song already exists.
- The user's idea, references, and constraints, usually gathered by `new-video` through `grilling`.
- `docs/glossary.md` for terminology.
- `brand/<kit>/` when a brand kit exists.

## Process

1. Read `project.yaml` and confirm the budget and formats. If `budget_usd` is missing, stop: it is mandatory.
2. Interview the user about the seven brief axes: topic, source/ownership, audience, length, formats, style, constraints. Use the `grilling` skill when the idea is fuzzy or the answers conflict.
3. Keep the brief short enough to be read in one sitting. Do not write a treatment here; that is the next stage.
4. Write `projects/<slug>/brief.md` with these sections: Topic, Source and commission, Audience, Length, Formats, Style, Constraints, Success criteria.
5. Check that the brief does not promise assets or rights the project does not have. Flag copyrighted references, missing footage, or music that cannot be licensed.
6. Update `state.json` with `npm run cli -- stage-done <project> brief --outputs brief.md`.

## Completion criteria

- Every brief axis has a concrete answer.
- The budget and formats match `project.yaml`.
- The success criteria are checkable.
- No unresolved question remains hidden in the text.
- No secrets, personal data, or unlicensed references are committed.

## Common failures

- Writing a treatment or shot list instead of a brief.
- Accepting a vague audience ("everyone") without a primary viewer.
- Promising 4K/60 or a platform cut that is not in `project.yaml`.
- Forgetting the music's license and provenance.
