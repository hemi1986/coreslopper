# After Midnight

Episode 1 of the series `demo-series`, a coreslopper episode project.

The canon (style, characters, sets, and their references) belongs to the series in `series/demo-series/`. This project never copies or changes it.

## Start here

1. Write `script.yaml`: the scenes of the episode, each in one set of the canon, with their script lines in playing order.
2. Validate at any time with `npm run validate -- projects/demo-episode`.
3. Run `npm run status -- projects/demo-episode` to see the next stage.

## Files

| File | Purpose |
|---|---|
| `project.yaml` | Kind, series, episode number, budget, formats, providers (copied from `series.yaml`). |
| `script.yaml` | Authoritative script: scenes and script lines. |
| `takes.json` | Registry of takes: source, duration, and text hash per script line. |
| `timing.json` | Timing constructed from the takes. |
| `timing.overrides.json` | User-owned corrections; never overwritten. Moves sound and picture together. |
| `storyboard.yaml` | Machine-readable shot list. |
| `storyboard.md` | Human-readable shot list. |
| `state.json` | Resumable pipeline state and spend. |
| `audio/lines/<line-id>.wav` | One take per audible script line; gitignored. |
| `audio/episode.wav` | The episode track; gitignored. |
| `review/` | Contact sheet, QA report, small stills. |
