---
description: Show a series overview: canon, planned and created episodes, their stages, spend, and length.
argument-hint: <series>
allowed-tools: Bash, Read, Glob
---

# /series-status

1. Parse `$ARGUMENTS`: the series slug (a folder in `series/`). Without one, list `series/*/series.yaml` and run the steps below for each series.
2. Run `npm run cli -- series-status <series>`.
3. Summarize:
   - the master format and the creative limits of the series,
   - the canon: characters with display rule, reference voice, and reference count; sets with reference count. Flag a missing reference voice and a set or character without references.
   - every episode of the plan: created or not, its stage and overall status, spend against budget, and length against `limits.episode_seconds`,
   - the next action per episode: `/new-episode <slug>` for an interactive stage or an episode not yet created, `/video-next <slug>` otherwise.
4. Do not modify any project, state, or canon file.
