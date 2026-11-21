---
paths:
  - "packages/cli/src/queue.ts"
  - "packages/cli/src/review-image.ts"
  - "packages/cli/src/verdicts.ts"
  - "packages/cli/src/patch.ts"
  - "workspace/.claude/agents/art-director.md"
  - "workspace/.claude/skills/ai-clips/SKILL.md"
---

# Generation queue and verdicts (BC-GenerationQueue)

> Concept slice in `cli` plus the art director and the `ai-clips` loop. Adopted 2026-11-21, decided by
> recommendation and not reviewed by the user; model in `docs/domain/events.yaml` (`AGG-GenerationQueue`),
> decisions in ADR 0038 (proposed), gaps G-32–G-48 in `docs/domain/gap-register.md`.

## Purpose

Gets every generated image and clip of a project approved before anything derives from it: one queue run
generates, the art director gives each attempt a verdict, and the run files, requeues, or waits for a fix.

## Key terms

Generation Queue, Attempt, Verdict, Blocking Defect, Verdict Note, Art Director, Region Patch – defined in
`docs/glossary.md`. The art director *judges*; "review" is the user's. An item is *requeued*; an approved
attempt (pass verdict or accept) is *filed* at `out`.

## As-is boundary

- `assets/queue.json` per project is the aggregate: written whole via temp file and rename
  (`queue.ts` `updateQueue`); one run per project behind `assets/queue.lock`.
- Attempts are files `<out dir>/attempts/<name>-a<n>.<ext>`; the verdict record is
  `assets/review/verdicts.jsonl` (series canon: `<series>/review/verdicts.jsonl`), with a copy in the attempt.
- The art director runs headless: `review-image.ts` `claudeRunner`, JSON schema `VERDICT_JSON_SCHEMA`.
- Every attempt is generated through `runBatch` (`generate.ts`): budget, cache, manifest and spend are not here.

## Boundaries

- Fail a verdict only for a blocking defect (`BLOCKING_DEFECTS`, `notesOnlyPass`); keep `art-director.md` and
  the prompt saying the same (G-38).
- Never let an automatic step undo a user's accept; refuse accept, requeue, replace and drop while an item is
  generating or reviewing (G-33).
- Cap an item at three local attempts and one cloud attempt since its last replace (G-34).
- Record a region patch as an attempt of its queue item, numbered by the queue (G-35).
- Change `queue.json` only under a lock once one exists (G-32); keep the board and the watchdog read-only.
- Read the verdict log through one function; two copies exist today (G-42).

## Typical pitfalls

- `passed` also means "accepted" and "filed unjudged"; an accept writes no verdict, so `verdicts --failed`
  still lists it (G-37, G-41).
- A failed clip never requeues itself; it waits as `needs-fix` for a rewritten prompt.
- `--reviews` is not a hard cap (G-45); `queue wait` reports `error` as `needs-fix` (G-46).
- `patch --series` reads the wrong verdict log (G-36).
- The schema lives in `cli`, outside `schema.ts` and `schema/` (G-39).

## Read next

- `docs/glossary.md`, `docs/adr/0038-generation-queue-and-verdicts.md`
- `docs/domain/events.yaml`, `docs/domain/context-map.as-is.md`, `docs/domain/gap-register.md`
- `docs/architecture/data-model.md`, `workspace/.claude/skills/ai-clips/SKILL.md` step 6
