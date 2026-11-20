# Model bench

Fixed scenes from past videos, rendered on several models or servers and compared side by side. Use it before switching a workflow (Qwen Image vs. Turbo, an int8 LTX checkpoint), a GPU server, or a paid provider. Rationale: [ADR 0020](../docs/adr/0020-model-bench.md). In Claude Code, the `model-bench` skill runs the whole comparison.

| Path | Tracked | Purpose |
|---|---|---|
| `bench.yaml` | yes | Bench budget, batch cap, default output size, set descriptions |
| `targets.yaml` | yes | Bench targets: provider, workflow or model per operation, params, server |
| `cases/<id>.yaml` | yes | Bench cases: prompt, seed, inputs, known good result, rubric |
| `fixtures/` | no | Case media copied by `bench import` |
| `runs/<id>/` | no | `run.json`, outputs, frame strips, `scores/`, `ratings.json`, `index.html` |
| `state.json`, `manifest.jsonl`, `timings.jsonl` | no | Bench spend, every generation call, generation times |

## Commands

```bash
npm run cli -- bench list                                    # cases, fixture status, targets
npm run cli -- bench import --from ../my-workspace           # copy fixtures from the projects there
npm run cli -- bench run --targets local,local-ltx-int8 --set smoke --dry-run
npm run cli -- bench run --targets local,local-ltx-int8 --set core --seeds 2
npm run cli -- bench report                                  # rebuild the latest run's index.html
```

`bench run` options: `--cases <ids>`, `--seeds <n>` (case seed, +101, +202, ...), `--repeat` (render the first seed twice uncached and compare bytes), `--fresh` (ignore the cache and measure time again), `--transcribe` (speech word error rate via faster-whisper), `--id <name>` (extend or resume a run).

## Adding a target

Export the new ComfyUI workflow with **Export (API)** into `comfyui/workflows/`, tag it as described in [`comfyui/README.md`](../comfyui/README.md), and add a target that names it per operation. See the commented examples at the end of `targets.yaml`. A remote server is a target with `comfyui_url`; its results never share the cache with local ones.

A target can run an operation's cases as reference-to-video with `as: referenceToVideo` (see the `pika` target): the case's references become identity anchors (`<Picture 1>` first) and its `flex` prompt replaces `prompt`, so the same scene can be compared with an image-to-video model. Cases without `flex` are skipped on such a target.

## The comparison page

`runs/<id>/index.html` shows, per case, the known good result and the inputs next to every target's result, with time, cost, size, VRAM peak, the frame strip, and the art director's rubric score. Grade each result 1-5 and add notes; the page keeps them in your browser. **Export ratings.json** and save it into the run folder so `bench report` and the agents can read your grades.
