# Autonomous pipeline with automated QA, no creative approval gates

**Status:** Accepted

## Context

The user wants as few interruptions as possible. Quality is established before the run through a grilling interview, so per-stage human approval would break flow and fill context windows without adding much. The original plan's approval column is therefore replaced.

## Decision

The default is `review_mode: auto`. The pipeline runs all stages without human approval. It stops only for a budget overrun, missing credentials, or an unrecoverable validation/QA failure after bounded retries. Automated critics (`art-director`, `qa-checker`) review artifacts and may request bounded retries. A final review report is written but does not block. `review_mode: final` is available for users who want one human gate before export.

## Consequences

- Fast, unattended runs and a single command from brief to render.
- Creative drift is possible; mitigations are upfront grilling, strong critics, budget caps, deterministic resumes, and a readable final report.
- Users can opt into gates through configuration without changing the pipeline.
