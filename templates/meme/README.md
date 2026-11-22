# {{TITLE}}

A coreslopper meme: a short 9:16 video of at most 30 seconds with one punchline. It has no song and no series.

## Start here

1. Run `/new-meme {{SLUG}}` in Claude Code. It grills the pitch in `pitch.md` into `script.yaml`.
2. Validate at any time with `npm run validate -- projects/{{SLUG}}`.
3. Run `npm run status -- projects/{{SLUG}}` to see the next stage.

## Files

| File | Purpose |
|---|---|
| `project.yaml` | Kind, budget, the one 9:16 format, providers. |
| `pitch.md` | The idea and the setting in the user's words; the starting point of the script, never a decision. |
| `script.yaml` | Authoritative script: scenes and script lines. |
| `style.yaml`, `characters.yaml`, `sets.yaml` | The meme's own bibles, written after the script by `style-character`. |
| `takes.json` | Registry of takes: source, duration, and text hash per script line. |
| `timing.json` | Timing constructed from the takes. |
| `timing.overrides.json` | User-owned corrections; never overwritten. Moves sound and picture together. |
| `storyboard.yaml` | Machine-readable shot list. |
| `state.json` | Resumable pipeline state and spend. |
| `audio/lines/<line-id>.wav` | One take per audible script line; gitignored. |
| `audio/episode.wav` | The meme's track, built like an episode track; gitignored. |
| `review/` | Contact sheet, QA report, small stills. |
