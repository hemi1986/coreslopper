# Architecture Decision Records

Short records of decisions that are hard to reverse, surprising without context, and the result of a real trade-off.

| ADR | Decision |
|---|---|
| [0001](0001-folder-based-projects.md) | Projects are folders in one workflow repository; export is optional. |
| [0002](0002-autonomous-pipeline.md) | The pipeline runs autonomously with automated QA; no creative approval gates. |
| [0003](0003-stage-isolated-execution.md) | One fresh context per stage; files are the only interface. |
| [0004](0004-zod-schema-source.md) | Zod is the schema source; JSON Schema is the cross-language contract. |
| [0005](0005-symbolic-timing-anchors.md) | Storyboard timings use symbolic anchors resolved from effective timing. |
| [0006](0006-fal-adapter-cache-budget.md) | Narrow provider interface, fal.ai first, hash cache, budget guard. |
| [0007](0007-remotion-deterministic-renderer.md) | Remotion is the renderer; determinism is enforced. |
| [0008](0008-local-audio-analysis.md) | Local Demucs + WhisperX + librosa; lyrics text wins. |
| [0009](0009-mit-open-source.md) | MIT open source with explicit third-party notices. |
| [0010](0010-npx-onboarding.md) | npx onboarding with a versioned runtime snapshot. |
| [0011](0011-higgsfield-provider.md) | Higgsfield as a second provider; per-project provider selection and role alternatives. |
| [0012](0012-workspace-update.md) | `coreslopper update` merges a new runtime against a recorded baseline. |

Status values: `Accepted`, `Deprecated`, `Superseded by ADR-NNNN`.
