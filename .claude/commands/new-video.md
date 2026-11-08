---
description: Create a new music-video project from the template.
argument-hint: <slug> --budget <usd> [--title <title>] [--brand <kit>]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# /new-video

Create one new project. Do not start the creative pipeline in this command.

1. Parse `$ARGUMENTS`. The first token is the slug. Supported flags: `--budget <usd>`, `--title <title>`, `--brand <kit>`, `--visual <mock|fal|higgsfield>`, `--image-provider <mock|fal|higgsfield>`, `--video-provider <mock|fal|higgsfield>`, `--song-provider <suno|import|mock>`.
2. **Budget is mandatory.** If `--budget` is missing, ask the user for it and stop. Do not invent a number.
3. Run from the repository root:
   `npm run cli -- new <slug> --budget <usd> [flags]`
4. If the command fails, show the error and stop. Do not create files by hand.
5. Report the project path, budget, providers, and next command.
6. Ask whether to start the `video-brief` skill now. If yes, invoke it with the project path. If the idea is still fuzzy, invoke `grilling` first.

Never commit generated media, API keys, or `.env` files.
