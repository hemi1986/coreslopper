---
description: Run the next open pipeline stage, or all remaining stages, in fresh contexts.
argument-hint: <slug> [--stage <stage>] [--dry-run]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Task
---

# /video-next

Run the autonomous pipeline for one project. The default is to run **all** open stages until the project is done. Do not ask for creative approval; the project uses `review_mode: auto` unless configured otherwise.

## Setup

1. Parse `$ARGUMENTS`: the first token is the project slug. Flags: `--stage <stage>` to run exactly one stage; `--dry-run` to show the next stage and cost without running it.
2. Run `npm run cli -- status projects/<slug>`. Read the project title, stage table, budget, and next stage.
3. If `--dry-run`, stop after printing the next stage, its skills, and the remaining budget.
4. If the next stage is missing because everything is done, report success and stop.

## Stage loop

Repeat until the project is done or a hard stop occurs:

1. Determine the next stage from `status`. The stage IDs are:
   `brief`, `treatment`, `lyrics`, `song`, `audio-analysis`, `style-character`, `storyboard`, `assets`, `assembly`, `qa-export`.
2. Mark it running: `npm run cli -- stage-start projects/<slug> <stage>`.
3. Dispatch **one** `stage-runner` subagent with a fresh context. The prompt must include:
   - the project path,
   - the stage ID,
   - the skill(s) for that stage,
   - the instruction to read `.claude/skills/<skill>/SKILL.md`,
   - the instruction to write only the stage outputs,
   - the instruction to return a compact summary with `STATUS: ok` or `STATUS: blocked`, the output paths, warnings, and spend.
   Do not paste raw images, audio, or full transcripts into the subagent prompt.
4. If the runner returns `STATUS: blocked` or a fatal validation error:
   - `npm run cli -- stage-fail projects/<slug> <stage> --error "<short reason>"`,
   - print the reason and stop. Budget, missing credentials, and unrecoverable validation are hard stops.
5. If the runner succeeds, mark done:
   `npm run cli -- stage-done projects/<slug> <stage> --outputs <comma-separated paths>`.
   Use the output paths the runner reports.
6. If `review_mode: final` and the next stage is `qa-export`, stop and ask for the final review. Otherwise continue.

## Context discipline

- The main context may read `state.json`, `project.yaml`, `review/report.md`, and the runner's short summary.
- The main context must not read raw assets, full storyboard YAML, or full timing JSON.
- If a stage needs a large artifact, the stage-runner reads it; the main context only gets the summary.
- Asset production is batched by the `ai-clips` skill (default 5 shots), not by this command.

## Hard stops

- Budget exceeded or batch cap exceeded.
- Missing credentials when a real provider is configured.
- Validation failure that the stage cannot fix after its bounded retries.
- A required user-owned file would be overwritten (`timing.overrides.json`, `project.yaml`).

Report the hard stop with the exact command the user can run to continue.
