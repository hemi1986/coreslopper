---
name: ai-clips
description: Use when generating AI keyframes or image-to-video clips for storyboard shots, enforcing character references, estimating cost, caching generations, and logging a manifest.
license: MIT
---

# AI Clips

## When to use

- A storyboard shot has `source: ai-clip` or a mixed shot has an AI layer.
- The user wants a keyframe, an image edit, or an image-to-video clip.
- A character or style reference must be carried into a generated shot.

## Inputs

- `storyboard.yaml`, `style.yaml`, `characters.yaml`
- `config/models.yaml` and `project.yaml`
- `packages/providers` and the `npm run cli -- generate` command
- `docs/glossary.md`

## Process

1. Read the shot's prompts, style refs, and character refs. If the shot names a character but the character has no reference image, stop and run `character-bible` first.
2. Choose roles from `config/models.yaml`, not hard-coded model IDs. Use the cheapest role that meets the shot's quality needs.
3. Write a batch JSON file outside the repo or under `projects/<slug>/assets/batches/`. Shape:
   ```json
   [
     {
       "operation": "editImage",
       "role": "image.keyframe",
       "prompt": "...",
       "references": ["characters/nova/sheet.png"],
       "seed": 1234
     },
     {
       "operation": "imageToVideo",
       "role": "video.image_to_video.quality",
       "prompt": "...",
       "references": ["assets/keyframes/shot-004.png"],
       "durationSeconds": 5,
       "seed": 1234
     }
   ]
   ```
4. Run `npm run cli -- estimate --role <role> --units <n> --project projects/<slug>` and check the batch cap. If the batch exceeds it, split the batch or ask before spending.
5. Run `npm run cli -- generate projects/<slug> --batch <file>` with the project provider. The runner checks the budget, computes a cache key, reuses cached assets, writes `assets/manifest.jsonl`, and records spend.
6. Inspect the keyframe at full size and the clip at first/middle/last frame with the art-director critic. If a character drifts, regenerate with the same references and a corrected prompt; do not ignore it.
7. Use frame chaining only when the storyboard enables it. Extract the last frame of the previous clip and pass it as the first reference of the next.
8. Update the storyboard's `asset` path or layer asset. Re-run `npm run cli -- validate projects/<slug>`.
9. Update the state when the asset batch is complete.

## Completion criteria

- Every AI shot has a keyframe and a clip (or a documented reason for a still-only shot).
- Every character shot passed at least one reference image to the provider.
- The manifest records model, prompt, seed, references, cost, and cache status.
- The batch stayed under the project budget and batch cap.
- No generated asset is committed to the repository.
- The art-director critic passed, or the remaining risk is written into the review report.

## Common failures

- Text-only character prompts.
- Re-generating a cached shot because the prompt was reworded without changing the hash inputs.
- Ignoring native audio in the generated clip; the song is the only audio source.
- Forgetting to record the spend and exceeding the budget silently.
