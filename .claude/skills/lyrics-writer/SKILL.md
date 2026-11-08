---
name: lyrics-writer
description: Use when writing or revising lyrics, adding section tags, preparing a Suno style prompt, or checking lyric structure against the treatment.
license: MIT
---

# Lyrics Writer

## When to use

- The project needs `lyrics.txt` or `suno-style.txt`.
- The user wants a rewrite, a different perspective, a language change, or a shorter edit.
- The song structure and the treatment disagree.

## Inputs

- `brief.md`, `treatment.md`
- The target song length and section plan
- `docs/glossary.md`

## Process

1. Read the brief and treatment. Decide the section plan (`[Intro]`, `[Verse 1]`, `[Chorus]`, `[Bridge]`, `[Outro]`, and so on) before writing lines.
2. Write original lyrics. Keep lines singable: concrete images, open vowels, consistent meter, and no accidental plagiarism.
3. Use section tags exactly as the audio-analysis stage expects. Repeated sections get repeated tags; the parser will number them.
4. Write `suno-style.txt` as a compact style prompt: genre, mood, tempo, vocal type, instrumentation, production notes. Do not put the full treatment in it.
5. Align the lyric language with the brief. If the brief does not specify a language, ask once; do not silently default.
6. Update the state with `npm run cli -- stage-done <project> lyrics --outputs lyrics.txt,suno-style.txt`.

## Completion criteria

- Every lyric line sits under a valid section tag.
- The section order matches the treatment.
- The lyrics are original and have no unlicensed quotations.
- `suno-style.txt` is concise and does not contradict the lyrics.
- The line lengths fit the intended tempo and vocal register.

## Common failures

- Tags that do not match the song structure.
- A chorus that changes words every time and cannot be learned.
- A style prompt that is a paragraph of production notes.
- Writing in a language the brief did not ask for.
