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
- `comfyui/README.md` when any provider is `comfyui`
- `packages/providers` and the `npm run cli -- generate` command
- `docs/glossary.md`

## Process

1. Read the shot's prompts, style refs, character refs, and continuity refs (`refs.plate`, `refs.props`, `refs.states`). If the shot names a character, plate, prop, or state without a reference image, stop and create it first (`character-bible` for states, `style-bible` for plates and props), and let it pass the review loop of step 6 before any keyframe derives from it. Pick any user-provided moodboard or composition references from `assets/references/` and pass their project-relative paths in the batch `references` array.
2. Choose roles from `config/models.yaml`, not hard-coded model IDs. Use the cheapest role that meets the shot's quality needs. Route each clip by its keyframes and lip-sync:
   | Shot | Operation | References | Role | Local workflow |
   |---|---|---|---|---|
   | Lip-sync | `lipSync` | start frame, end frame (the start frame again when there is one keyframe) | `video.lipsync` | `ltx25-lipsync-flf2v` |
   | Movement with a fixed target (turn, sit down, draw a weapon, push into a close-up) | `firstLastFrameToVideo` | start frame, end frame; both show the face cleanly | `video.first_last_frame` | `ltx-flf2v` |
   | One keyframe | `imageToVideo` | start frame | `video.image_to_video.*` | `ltx-i2v` |
   | No keyframe: atmosphere and establishing shots only, never a recurring character | `textToVideo` | none | `video.text_to_video` | `ltx-t2v` |
   | No keyframe, but characters, props, or a set must stay exact; one continuous camera move with sound | `referenceToVideo` | 1–4 reference images (up to 9), identity anchors | `video.reference_to_video` | `pika-h3-ref2va` (always local) |

   Clip rules for every non-lip-sync shot: 3–6 s with one clear action. Keep important faces large in frame. A wide shot with several people gets 2–3 s of minimal motion, or stays a still with a slow zoom in the edit.

   Prompts are short and concrete; long scene descriptions make the result worse. The local LTX models run distilled at CFG 1, so a negative prompt has no effect: write what should happen instead ("her mouth stays closed", "static camera", "calm, natural expression"). A batch item's `negativePrompt` reaches the cloud models (`negative_prompt`; Higgsfield and Topview need `send_negative_prompt: true`) and local stills (`cs_negative`); `generate` rejects it for local clips.
   - Non-lip-sync prompts start with "Preserve the exact characters, faces, clothing and lighting from the input image." and describe motion precisely and calmly ("smooth, natural movement, steady camera"). These workflows generate their own sound, which the edit discards; where nobody speaks, add "Nobody speaks, mouths stay closed."
   - Lip-sync prompts are 2–3 sentences: shot size and camera, "speaks/sings the audio with accurate lip sync", the exact words in quotes, one note on expression. Template: `Close-up, static camera. She softly speaks the audio with accurate lip sync: "<text>". Calm, natural expression, eyes on camera.` Frame close-up or medium close-up, face large, static camera.

   With a `comfyui` provider the generation runs locally from the workflow the role names (`comfyui/workflows/<model>.json`). It costs $0; stills take seconds, clips about a minute per 3 s, so keep clip batches small. Run `npm run cli -- doctor` first; if ComfyUI is unreachable or the workflow is missing, stop with a credential-class hard stop. Local specifics:
   - `editImage` on `qwen-edit` takes up to 16 references; `references[0]` is the image that is edited and sets the output size. On a 16 GB GPU keep `qwen-edit-quality` items at 4 references or fewer: with 5 its reference cache grows past the VRAM and ComfyUI fails sporadically with `Fault failed: 2`. Split a heavier edit into two passes. A single `Fault failed` passes on retry; when the queue stops moving, restart ComfyUI (`comfyui/README.md`).
   - **Keyframe from a plate** (the shot names `refs.plate`): `editImage` with `references` in this order: the plate, then per character its state reference (or its sheet when the shot names no state), then the prop references. The prompt says what goes where, by image number: "Insert the robot from image 2 standing on the floor in front of the shelf in image 1; put the Walkman from image 3 on the shelf beside him; the red cable runs from his open chest hatch to the Walkman. Keep the room, camera, and light of image 1 unchanged." Paths are relative to the project; canon files of an episode are `../../series/<series>/...`. Shots in the same plate then share geometry and light; screen text and other shot-specific edits follow as a second edit of this keyframe.
   - `image.background_removal` (`editImage`, one reference, prompt "Remove the background, and output a PNG image") cuts a subject out as a transparent PNG for Remotion layers. It needs a clear subject; check that the result is not empty.
   - Speech (`generateAudio`, role `audio.voice`, workflow `voxcpm-clone`): `audio` is the reference WAV, `params.transcript` its exact words, `prompt` the text to speak. Before writing the prompt, spell out every number, year, time, abbreviation, and symbol in German words ("2077" → "zweitausendsiebenundsiebzig", "z. B." → "zum Beispiel"); `generate` rejects digits and symbols. Generate one sentence or paragraph per item and join the takes with ffmpeg. On a slip or wrong stress, retry with up to 3 seeds. Use `audio.voice_design` (`"(description)Text"`) only to find a new voice.
   - Local `lipSync` (`providers.lipsync: comfyui`, workflow `ltx25-lipsync-flf2v`) is driven by the isolated vocal stem `audio/stems/vocals.wav`, never the full mix. Set `"audio": "audio/stems/vocals.wav"`, `audioStartSeconds` to the line's start, and `durationSeconds` to the exact length of the line plus about 0.3 s of the pause after it; keep it at 10 s or less. Cut every segment in a speech pause: the frame count rounds down to 8n+1, so only that silent tail is dropped, never the end of a word. On a weak take, try 2–3 other seeds first, then adjust the prompt.
   - Local clip options per item (ComfyUI only): `"video_model": "wan"` for an image-to-video shot without lip-sync that needs more natural motion than LTX (dance, hair, cloth); Wan has no sound and is rejected for lip-sync. `"quality": "final"` for the final clip pass; it runs the SeedVR2 restore and writes `<clip>_upscaled.mp4` next to the clip; point the storyboard at that file. `"seedvr2": "upscale"` renders LTX at half size and lets SeedVR2 scale it up (faster); `"seedvr2": "off"` when the restored clip looks oversharpened. `"color_correction": "wavelet"` when `lab` shifts the colors. Write Wan prompts with the character names; `generate` swaps them for the descriptions.
   - `referenceToVideo` (Pika H3 Flex) writes its prompt in the Flex schema; give a `flex` object instead of `prompt` and `generate` renders it. `references[k]` is `<Picture k+1>`; name every picture in a subject. Use the retention labels `fully_preserved`, `attribute_transfer`, `weak_reference` (backgrounds of reference images are usually `weak_reference`), put time marks in the shots ("At about 1.5 seconds …"), and describe SFX, dialogue, and music that plays inside the scene in `soundscape`. There is no music field: `non_diegetic_music` is always "none", because the score comes in post-production (the song, or one bed per episode). No `audio` reference, no negative prompt. The aspect comes from the project kind. Example:
     ```json
     {
       "operation": "referenceToVideo",
       "role": "video.reference_to_video",
       "references": ["characters/robot/sheet.png", "assets/references/workshop.png"],
       "durationSeconds": 4,
       "flex": {
         "subjects": [
           {"is": "the robot", "picture": 1, "role": "identity anchor", "features": "mint-green body, round chest window, number lettering", "avoid": "the white background of <Picture 1>"},
           {"is": "the workshop", "picture": 2, "role": "set anchor", "features": "pegboard of tools, red tool chest, warm lamps"}
         ],
         "summary": "A four-second static medium shot: the robot stands at the workbench and looks up.",
         "retention": [
           {"subject": 1, "appears": "[Shot 1]", "label": "fully_preserved", "note": "body, chest window, lettering"},
           {"subject": 2, "appears": "[Shot 1]", "label": "fully_preserved", "note": "tool wall and lamps"}
         ],
         "backgrounds": [{"picture": 1, "label": "weak_reference", "note": "its white background is discarded"}],
         "style": "Warm practical light, static camera, shallow depth of field.",
         "shots": ["<Subject 1> stands at the bench of <Subject 2>. At about two seconds it lifts its head toward the lens."],
         "soundscape": "Workshop hum, a soft servo whir as the head lifts, a radio on the shelf plays faint swing."
       }
     }
     ```
   - Every local workflow has a slower `-quality` variant (`qwen-t2i-quality`, `qwen-edit-quality`, `ltx-i2v-quality`, `ltx-t2v-quality`, `ltx-flf2v-quality`, `ltx25-lipsync-flf2v-quality`). Select it per item with `"params": {"workflow": "<name>"}`. Use it for character references, keyframes with a recurring character, face close-ups, clip and lip-sync start frames, hero clips, and the final clip pass; keep the default workflows for drafts, bass-hit stills, and face-free backgrounds. The parameter is ignored when the item runs on a cloud provider.
   - Resolution follows the project format (16:9 or 9:16) in multiples of 64. The roles render drafts at 0.8 MP; for the final render set `models.<role>.params.megapixels: 1.9` in `project.yaml`. Keyframes must already have the video's aspect ratio.
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
6. **Review loop, one image at a time.** Review every reference, keyframe, and clip as soon as it exists, before anything derives from it:
   ```bash
   npm run cli -- review-image projects/<slug> --image <png> --shot <shot-id> --attempt <n> [--focus "<issues of the last attempt>"]
   npm run cli -- review-image projects/<slug> --image <png> --ref state:<char>/<state>   # or plate:<set>/<plate>, prop:<id>
   npm run cli -- review-image projects/<slug> --image <first>,<middle>,<last> --shot <shot-id>   # a clip, frames from `frame`
   ```
   It runs the art-director headless in its own context (about a minute), appends the verdict to `assets/review/verdicts.jsonl`, and prints one JSON line `{verdict, score, issues, fix_prompt}`; exit code 2 means fail. Work from that line only:
   - **pass** → the image is approved; the next item may use it as a reference. Issues prefixed `note:` never trigger a regeneration.
   - **fail** → regenerate the item with the verdict's `fix_prompt` (a new seed), review again with `--attempt <n+1> --focus "<issues>"`. When the defect is a hand, limb, or body overlap, make the next attempt a different composition (see the composition rules in `.claude/skills/storyboard/SKILL.md`), not the same framing again.
   - **Cloud fallback.** After 3 failed local attempts, generate the item once on a strong cloud model, with the last `fix_prompt`, inside the budget and batch cap (check with `estimate --role <role> --units <n> --provider <p>` first). Cloud roles take the aspect from their params, so set `"params": {"aspect_ratio": "<project aspect>"}` on the item.
     | Item | Role and provider | About |
     |---|---|---|
     | Image, several references | `image.edit` with `--provider topview` (Nano Banana 2.1 edit) | $0.035 |
     | Image, exact geometry or text | `image.edit` on fal (Flux 2 Pro edit) | $0.05 |
     | Image, at most 3 references, cheapest | `image.edit` with `--provider higgsfield` (Qwen edit) | $0.03 |
     | Clip | `video.image_to_video.premium` with `--provider topview` (Seedance 2.5) | $0.21/s |
     | Clip, lower cost | `video.image_to_video.quality` with `--provider higgsfield` (Kling 3.0) or `topview` (Wan 3.0) | $0.06–0.12/s |
     Pick the strongest one the remaining budget allows. Review it with `--attempt 4`. If it fails too, keep the best attempt, mark it in the batch notes with its last issues, and move on.
   - Order the work so a reference passes before any keyframe uses it, and a keyframe passes before its clip is generated. On resume, `verdicts.jsonl` tells which items already passed.
   The review fails an image only for a blocking defect (identity, anatomy, state or attachment, a missing named element, misspelled text, a break with an approved neighbour); everything else is a note, and a retry is checked only against the previous blocking defects. So the loop always ends: at most 3 local attempts and one cloud attempt per item. The art-director reads full resolution, so thumbnails never replace it. After the last batch, the orchestrator reads only the summary of `verdicts.jsonl`: items that never passed, with their last issues.
7. Use frame chaining only when the storyboard enables it. Extract the last frame of the previous clip with
   `npm run cli -- frame <project> --input <previous-clip> --position last --out <path>`
   and pass it as the first reference of the next clip. To land on a planned frame, use `firstLastFrameToVideo` with that keyframe as the second reference.
8. **Lip-sync shots** (`lipSync` set on the shot):
   1. Generate a dedicated keyframe with `editImage` from the character sheet: face frontal or slight 3/4, evenly lit, mouth slightly open, face filling at least a third of the frame, modest clothing (high neckline, covered shoulders). Never feed the multi-view sheet itself. Keep the prompt neutral; words such as "sexy", "intimate", or "seductive" trigger the provider's content moderation.
   2. Resolve the shot's start and end anchors to seconds from `timing.effective.json`. Place the start just before the first word and the end in the pause after the last word, about 0.3 s past it. The vocals always come from the vocal stem (`audio/stems/lead.wav` when it exists, else `audio/stems/vocals.wav`); `generate` rejects the full mix (`audio/song.*`).
   3. **Lead only.** The face mouths only what the lead singer sings, never backing vocals or echoes (a choir "Prompt" after "Ihr seid der Prompt" that is not in the lyrics). Before generating, list the echo spans of every lip-sync shot in the batch notes: the parenthesized words of its lines (`audio-segment` mutes these by default), the passages in the "Unwritten vocals" table of `timing.report.md` inside the shot (or run `cd scripts/audio-analysis && uv run python echo_scan.py --project ../../projects/<slug> --start <s> --end <s>`), and any span the user's review notes name. Pass the extra spans as `audio-segment --mute <start>-<end>,...` (song seconds). An echo that overlaps a lead word (it stretches the word in the timing) cannot be muted cleanly: run `separate_lead.py` (see `scripts/audio-analysis/README.md`) so `audio-segment` cuts from `lead.wav`, or move the shot's end before the echo. Check the muted spans that `audio-segment` prints against this list before generating.
   4. Add a batch item. Local (`providers.lipsync: comfyui`) cuts the stem in the workflow; add the end keyframe as a second reference when the shot has one. When the window holds an echo span, cut a muted segment with `audio-segment` instead and use it as `"audio"` with `"audioStartSeconds": 0`:
      ```json
      {
        "operation": "lipSync",
        "role": "video.lipsync",
        "prompt": "Close-up, static camera. She softly sings the audio with accurate lip sync: \"<text>\". Calm, natural expression, eyes on camera.",
        "references": ["assets/image/keyframe/<keyframe>.png"],
        "audio": "audio/stems/vocals.wav",
        "audioStartSeconds": 61.2,
        "durationSeconds": 3.4
      }
      ```
      In an episode, use the speaker stem that `episode-track` wrote (`audio/stems/<id>.wav`) instead of `vocals.wav`; with fal.ai, cut it with `audio-segment --character <id>`.
      Cloud lip-sync takes a cut segment instead: `npm run cli -- audio-segment projects/<slug> --start <s> --end <s> --name <shot-id> [--mute <spans>]`, then `"audio": "assets/audio-segments/<shot-id>.mp3"` without `audioStartSeconds`. Providers (`providers.lipsync`, or `generate --lipsync-provider <p>` for one batch):
      - `fal` (OmniHuman 1.5): billed per second of audio, up to 30 s.
      - `higgsfield` (Speak v2, `higgsfield-ai/speak`): WAV only, so cut with `--format wav` and use the `.wav` segment. It renders 5, 10, or 15 s and bills the selected length (a 3 s segment costs one 5 s generation, about $1.13), so it is the expensive option for short lines. Output is 1280×704 at 16 fps. Kling Avatar and audio-driven Wan are project overrides (see the role's `notes`).
      - `topview` (Avatar 4): needs `TOPVIEW_UID` and `TOPVIEW_OPENAPI_KEY`, not the platform key; billed in Topview plan credits per generated second. The prompt becomes the motion prompt.
      Keep each segment as tight as the sung line and under the role's `maxDuration` for the provider.
      A `422 content_policy_violation` (`partner_validation_failed` or a `sexual` category) means moderation rejected the image or prompt; the call is not billed. Retry once with a more covered close-up and a neutral prompt. If it fails again, stop retrying that shot, because repeated rejections can flag the account. Use a non-lip-synced clip as a stand-in and report it.
   5. The clip must start exactly at the shot start; do not trim its head in Remotion. Its audio is muted; the song stays the only audio source. Check sync at first/middle/last frame against the lyric word timestamps.
9. Update the storyboard's `asset` path or layer asset. Re-run `npm run cli -- validate projects/<slug>`.
10. Update the state when the asset batch is complete.

## Completion criteria

- Every AI shot has a keyframe and a clip (or a documented reason for a still-only shot).
- Every character shot passed at least one reference image to the provider.
- The manifest records model, prompt, seed, references, cost, and cache status.
- The batch stayed under the project budget and batch cap.
- No generated asset is committed to the repository.
- Every reference, keyframe, and clip has a `pass` line in `assets/review/verdicts.jsonl`, or its remaining risk is written into the batch notes and the review report.

## Common failures

- Text-only character prompts.
- Animating a keyframe with an extra limb or merged hands because it was only checked as a thumbnail.
- Rerolling a hand-contact or group shot again and again instead of changing its composition.
- Expecting 1080p from Kling 3.0 Standard: it returns 1280×720, so check `notes` in `config/models.yaml` for the output resolution before choosing a hero-shot role.
- Re-generating a cached shot because the prompt was reworded without changing the hash inputs.
- Lip-syncing from the full mix instead of the vocal stem, or with a segment that is offset from the shot start.
- A lip-sync face mouthing an echo or backing line the lead does not sing, because the segment was cut without muting the echo spans.
- Ignoring native audio in the generated clip; the song is the only audio source.
- Forgetting to record the spend and exceeding the budget silently.
