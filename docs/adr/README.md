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
| [0013](0013-existing-song-interactive-setup.md) | Every project starts from an existing song; `new-video` runs setup, brief, and treatment interactively. |
| [0014](0014-comfyui-local-video.md) | ComfyUI as a local video backend driven by tagged API workflow exports. |
| [0015](0015-comfyui-images-lipsync-audio.md) | Superseded by 0017. ComfyUI also for stills, edits, lip-sync, and audio; output kind from the `cs_output` node. |
| [0016](0016-episode-projects.md) | Episode projects: a project kind with its own stage list, a series canon, and an episode track built from a script. |
| [0017](0017-ltx-lipsync-flf2v-official-templates.md) | Local lip-sync on an LTX FLF2V lip-sync workflow; all other clips on the official LTX templates; no negative prompts. |
| [0018](0018-thumbnails.md) | `qa-export` makes three thumbnails: the agent picks stills and words, a Remotion still composes the pixels. |
| [0019](0019-release-package.md) | `qa-export` ends with a release package: three Shorts with vertical thumbnails and one upload text, checked by `qa`. |
| [0020](0020-model-bench.md) | A model bench in `bench/`: fixed cases from past projects, rendered on named targets, scored by rubric and by the user. |
| [0021](0021-topview-provider.md) | Topview as a third cloud adapter for stills and clips; one endpoint pattern, two request formats, no lip-sync. |
| [0022](0022-review-player.md) | A review player writes frame-accurate notes on renders to `review/notes/`; outside the pipeline, read on a fix pass. |
| [0023](0023-publish-command.md) | `publish` is a user command, not a stage: YouTube private or scheduled, TikTok inbox drafts, from `upload.yaml`, idempotent by file hash; no Instagram, no MCP. |
| [0024](0024-release-folder-manual-distribution.md) | `release` builds one folder `renders/release/` with every file and text to publish; distributor facts only from the user; manual distributor upload, API distributors later. |
| [0025](0025-plates-props-character-states.md) | Plates (empty set frames per camera angle), prop references, and character states are reviewed references that shots name in `refs`; keyframes in a plate are edits of it; music videos may have `sets.yaml`; episodes only append to the canon. |

Status values: `Accepted`, `Deprecated`, `Superseded by ADR-NNNN`.
