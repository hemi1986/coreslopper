---
name: ai-clips
description: Use when generating AI keyframes, image-to-video clips, or lip-sync clips for storyboard shots, enforcing character references, estimating cost, caching generations, and logging a manifest.
license: MIT
---

# AI Clips

## When to use

- A storyboard shot has `source: ai-clip` or a mixed shot has an AI layer.
- The user wants a keyframe, an image edit, or an image-to-video clip.
- A character or style reference must be carried into a generated shot.

## Inputs

- `storyboard.yaml`, `style.yaml`, `characters.yaml`
- `assets/references/` for user-provided moodboards and composition references
- `config/models.yaml` and `project.yaml`
- `packages/providers` and the `npm run cli -- generate` command
- `docs/glossary.md`

## Process

1. Read the shot's prompts, style refs, and character refs. If the shot names a character but the character has no reference image, stop and run `character-bible` first. Pick any user-provided moodboard or composition references from `assets/references/` and pass their project-relative paths in the batch `references` array.
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
7. Use frame chaining only when the storyboard enables it. Extract the last frame of the previous clip with
   `npm run cli -- frame <project> --input <previous-clip> --position last --out <path>`
   and pass it as the first reference of the next clip.
8. **Lip-sync shots** (`lipSync` set on the shot):
   1. Generate a dedicated keyframe with `editImage` from the character sheet: face frontal or slight 3/4, evenly lit, mouth slightly open, face filling at least a third of the frame. Never feed the multi-view sheet itself.
   2. Resolve the shot's start and end anchors to seconds from `timing.effective.json` and cut the vocal segment:
      `npm run cli -- audio-segment projects/<slug> --start <s> --end <s> --name <shot-id>`
      (source defaults to `audio/stems/vocals.wav`; use `--source audio/song.wav` only if there is no vocal stem).
   3. Add a batch item:
      ```json
      {
        "operation": "lipSync",
        "role": "video.lipsync",
        "prompt": "she sings with intensity, subtle head movement",
        "references": ["assets/image/keyframe/<keyframe>.png"],
        "audio": "assets/audio-segments/<shot-id>.mp3"
      }
      ```
      Cost is billed by the audio length; keep each segment ≤ 30 s and as tight as the sung line.
   4. The clip must start exactly at the shot start; do not trim its head in Remotion. Its audio is muted; the song stays the only audio source. Check sync at first/middle/last frame against the lyric word timestamps.
9. Update the storyboard's `asset` path or layer asset. Re-run `npm run cli -- validate projects/<slug>`.
10. Update the state when the asset batch is complete.

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
- Lip-syncing from the full mix instead of the vocal stem, or with a segment that is offset from the shot start.
- Ignoring native audio in the generated clip; the song is the only audio source.
- Forgetting to record the spend and exceeding the budget silently.
