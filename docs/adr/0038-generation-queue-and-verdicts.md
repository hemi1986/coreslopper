# The generation queue and the art director's verdicts

## Status

Proposed — 2026-11-21. Records decisions already in the code since commit `73063bc`; amends
[ADR 0002](0002-autonomous-pipeline.md) ("critics may request bounded retries"). Recovered by the adoption of the
generation queue; the user has not reviewed it on the code level.

## Context

ADR 0002 lets the automated critics request bounded retries but says nothing about how. The loop first lived as
skill text (`ai-clips` step 6): generate a round of images, review the round, regenerate. It stalled an unattended
run on permission prompts for shell one-liners, left the GPU idle while the critic worked, and never converged
when the critic failed images on taste. `queue`, `review-image`, and `patch` replaced it with commands
(`packages/cli/src/queue.ts`, `review-image.ts`, `patch.ts`).

## Decision

- **One queue per project, one run at a time.** `assets/queue.json` holds the items; `queue run` works them in
  order on one GPU, behind a per-project run lock (`assets/queue.lock`). An item waits until the items in its
  `after` list have passed.
- **Every attempt is a file.** An attempt is kept as `<out dir>/attempts/<name>-a<n>.<ext>`; only an approved
  attempt is copied to the item's `out` path, and only then do the items after it start.
- **The art director runs headless.** `review-image` runs `claude -p --agent art-director` with a JSON schema
  for the verdict, in its own context, so a stage runner without an Agent tool gets verdicts and the main
  session's context stays small. Verdicts run in the background while the run generates on.
- **Only a blocking defect fails.** The verdict fails for a defect from a fixed list (identity, anatomy,
  continuity state or attachment, a missing named element, misspelled text, a break with an approved neighbour,
  a real person or trademark); everything else is a verdict note and passes. From the second attempt on, the art
  director checks the previous blocking defects and new ones only. This is what makes the loop end.
- **Images repair themselves, clips do not.** A failed image is requeued with the verdict's fix prompt, a new
  seed, and its blocking defects as the focus. A failed clip waits for the stage runner, because a clip prompt
  cannot be fixed mechanically. An item has at most three local attempts and one cloud attempt (the cloud
  fallback, a provider for one attempt only).
- **Every verdict is logged.** `verdicts.jsonl` is the append-only record of every verdict, inside and outside
  the queue; a queue attempt keeps a copy for the run's decisions.
- **A region patch is an attempt.** `patch` edits one box through `generate` and files the result as the next
  attempt of the image's item.
- **The user's eye wins.** The user may accept any attempt; no automatic step undoes it.
- **A hung local server is restarted.** When a generation fails or hangs, the run restarts ComfyUI through
  `COMFYUI_RESTART_COMMAND` and tries again; a budget or credential problem stops the run.

## Consequences

- Several of these rules are ahead of the code: the attempt cap holds only for the automatic requeue of images,
  `queue.json` has no lock around its read-modify-write, `accept` has no status check, and a region patch is
  numbered outside the queue (gaps G-32 and later in `docs/domain/gap-register.md`).
- The queue's schema and transitions live in `cli`, not in core's `schema.ts` (against ADR 0004); a gap, not a
  decision.
- `art-director.md` still tells the subagent to fail on any doubt and to answer in text; it is to follow this
  ADR.
