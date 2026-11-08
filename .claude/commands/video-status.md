---
description: Show a project's stage state, budget, artifacts, and next action.
argument-hint: [slug]
allowed-tools: Bash, Read, Glob
---

# /video-status

1. If a slug is provided, run `npm run cli -- status projects/<slug>`.
2. If no slug is provided, list `projects/*/project.yaml` and print a one-line status for each project by running `npm run cli -- status projects/<slug>` for each one.
3. Summarize:
   - current stage and overall status,
   - completed and skipped stages,
   - spent / total budget and batch cap,
   - the next stage and the command to run it.
4. Do not modify `state.json`, `project.yaml`, or any project artifact.
5. If a project is missing `state.json`, say so and show the initial stage table; the next `/video-next` will create it.
