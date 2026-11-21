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
| [0026](0026-cloud-lipsync-and-lead-only-audio.md) | Higgsfield (Speak v2, legacy job-set routes) and Topview (Avatar 4 on the OpenAPI) lip-sync; `generate --lipsync-provider`; lip-sync segments are lead-only: backing words and `--mute` spans are silenced, `lead.wav` is preferred, unwritten vocals are reported. |
| [0027](0027-pika-lipsync-audio-guide.md) | Local lip-sync on Pika H3 Ref2VA with the vocal anchored from frame 0 (`MiniMaxH3AddGuide`), `pika-h3-ref2va-lipsync`; LTX lip-sync stays as a `params.workflow` fallback. |

| [0028](0028-release-board-and-calendar.md) | `release-board`: a local page per project and platform (files, texts, limits, settings, live URLs, done state); `review/calendar.yaml` planned under the workspace's `config/release-schedule.yaml` without collisions across projects; X, LinkedIn (agent decides), announcement, and microsite in the upload data. |
| [0029](0029-release-autopilot.md) | One approval on the release board hands a release to the autopilot: `release-run` (on a timer) posts each calendar event a platform API can post, at its time — YouTube ahead and private until the audit, Instagram, X, LinkedIn, TikTok drafts, the links step, the microsite; never twice, a stuck post waits for the user. Nothing goes public without the user's approval. |
| [0030](0030-board-as-hub.md) | `board` (alias `release-board`) is the workspace's hub: a read-only production view of every project and series (stages, budget, queue, verdicts, documents, renders) with the next Claude Code command from one pure function, beside the release view; project files from a whitelist; static ES modules, no build. |
| [0031](0031-watchdog-and-board-container.md) | `watch`: one round of `release-run` and a production scan that records events (stages, renders, queue, budget) and stalled stages in `.cache/watch/`; `render` writes `review/progress/`; the board container (`compose.yaml`) runs the board and the round every five minutes on any OS, with `node_modules` in a volume, host-aware locks, and `.env` read again each round. |
| [0032](0032-web-review-rounds.md) | The board's review view: frame-accurate player with a timeline of sections, shots, and notes (frame or range) in the desktop player's notes format; one click sends drafts as a frozen review round (`review/rounds/<NNN>.json`, with shots and section); the agent answers each note in `<NNN>.replies.json`; `/video-next` answers open rounds first. Amends 0022. |
| [0033](0033-board-wizard.md) | The board's wizard (**+ New**) for a music video, series, or episode: project data, lyrics with deterministically proposed section tags, song and stem through `import-song`, and user references (`references.yaml`, files in `assets/references/`); it ends with `/new-video`, `/new-series`, or `/new-episode`, which grill from there; shared with the CLI (`lyrics`, `reference`); streamed, size-limited, same-origin uploads. |
| [0034](0034-character-library.md) | The workspace character library (`library/characters/<id>/`): characters of finished style-character stages and canons come in by themselves, or by `character import` / `new` and the board; one entry per character, files stored once by content; `character use` copies identity and chosen states into a music video or canon with `library: <id>`, and the character bible builds on it. |
| [0035](0035-series-in-projects.md) | Series canons live in `projects/<slug>/` beside their episodes (`series.yaml` marks them); one slug namespace; episodes reach the canon at `../<series>/`; `migrate-layout` moves old workspaces, `doctor` and `update` remind until it ran, and `update` adds no copy of a canon still in `series/`. |
| [0036](0036-workspace-payload.md) | The workspace payload is separated from the engineering layer: `workspace/` becomes the workspace root, the root `AGENTS.md`, `CLAUDE.md`, and `.claude/` are for working on the repository and never ship; `scripts/runtime-files.mjs` classifies every tracked file; the media workflow is tried in a sandbox workspace. |
| [0037](0037-board-wizard-completes-setup.md) | Proposed: the board wizard may complete the `setup` stage through core's transition, and does nothing else to a project's state; the production view stays read-only. Amends 0030 and 0033. |

Status values: `Proposed`, `Accepted`, `Deprecated`, `Superseded by ADR-NNNN`.
