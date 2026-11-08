# One fresh context per pipeline stage

**Status:** Accepted

## Context

A full music-video pipeline produces long transcripts, large image batches, and many intermediate decisions. Keeping all of that in one session exhausts the context window and makes later stages unreliable.

## Decision

Each stage runs in its own fresh subagent or process. The only interface is the project directory (files) plus a short structured summary. `/video-next` orchestrates all pending stages; asset production is split into batches (default 5 shots). A `--stage` flag runs exactly one stage for debugging.

## Consequences

- Context stays bounded and stages are resumable and parallelizable.
- Every stage needs explicit input/output contracts and validation, because shared context cannot be assumed.
- The orchestrator must never read raw assets or full transcripts.
