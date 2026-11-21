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
   | Lip-sync | `lipSync` | the keyframe as `<Picture 1>`, then up to 3 identity references (LTX fallback: start frame, optional end frame) | `video.lipsync` | `pika-h3-ref2va-lipsync` (LTX fallback `ltx25-lipsync-flf2v`) |
   | Movement with a fixed target (turn, sit down, draw a weapon, push into a close-up) | `firstLastFrameToVideo` | start frame, end frame; both show the face cleanly | `video.first_last_frame` | `ltx-flf2v` |
   | One keyframe (default for every clip without lip-sync) | `referenceToVideo` | the keyframe as `<Picture 1>`, then up to 3 character state or prop references when a detail must hold | `video.reference_to_video` | `pika-h3-ref2va` (always local) |
   | One keyframe, quick draft or preview, or a calm 16:9 shot when time matters | `imageToVideo` | start frame | `video.image_to_video.*` | `ltx-i2v` |
   | No keyframe: atmosphere and establishing shots only, never a recurring character | `textToVideo` | none | `video.text_to_video` | `ltx-t2v` |
   | No keyframe, but characters, props, or a set must stay exact; one continuous camera move with sound | `referenceToVideo` | 1–4 reference images (up to 9), identity anchors | `video.reference_to_video` | `pika-h3-ref2va` (always local) |

   Pika is the default for clips without lip-sync, in music videos and episodes alike: in the model bench it kept the start framing, a static camera, hands, contact with props, and faces where LTX pushed in, moved fingers, or let go of objects. It runs locally on any project, even when `providers.video` is a cloud provider, so it also replaces cloud image-to-video clips in episodes. Cloud clips stay for hero shots the user picks within the project budget. LTX `imageToVideo` stays for drafts and previews; Wan only when the user asks for it.

   Clip rules for every non-lip-sync shot: 3–6 s with one clear action. Keep important faces large in frame. A wide shot with several people gets 2–3 s of minimal motion, or stays a still with a slow zoom in the edit.

   Prompts are short and concrete; long scene descriptions make the result worse. The local LTX models run distilled at CFG 1, so a negative prompt has no effect: write what should happen instead ("her mouth stays closed", "static camera", "calm, natural expression"). A batch item's `negativePrompt` reaches the cloud models (`negative_prompt`; Higgsfield and Topview need `send_negative_prompt: true`) and local stills (`cs_negative`); `generate` rejects it for local clips.
   - Non-lip-sync prompts start with "Preserve the exact characters, faces, clothing and lighting from the input image." and describe motion precisely and calmly ("smooth, natural movement, steady camera"). These workflows generate their own sound, which the edit discards; where nobody speaks, add "Nobody speaks, mouths stay closed."
   - Cloud and LTX lip-sync prompts are 2–3 sentences (Pika lip-sync takes a Flex prompt, see below): shot size and camera, "speaks/sings the audio with accurate lip sync", the exact words in quotes, one note on expression. Template: `Close-up, static camera. She softly speaks the audio with accurate lip sync: "<text>". Calm, natural expression, eyes on camera.` Frame close-up or medium close-up, face large, static camera.

   With a `comfyui` provider the generation runs locally from the workflow the role names (`comfyui/workflows/<model>.json`). It costs $0; stills take seconds, LTX clips about a minute per 3 s, Pika clips 1.5–4 min each, so keep clip batches small. Run `npm run cli -- doctor` first; if ComfyUI is unreachable or the workflow is missing, stop with a credential-class hard stop. Local specifics:
   - `editImage` on `qwen-edit` takes up to 16 references; `references[0]` is the image that is edited and sets the output size. On a 16 GB GPU keep `qwen-edit-quality` items at 4 references or fewer: with 5 its reference cache grows past the VRAM and ComfyUI fails sporadically with `Fault failed: 2`. Split a heavier edit into two passes. A single `Fault failed` passes on retry; when the queue stops moving, restart ComfyUI (`comfyui/README.md`).
   - **Keyframe from a plate** (the shot names `refs.plate`): `editImage` with `references` in this order: the plate, then per character its state reference (or its sheet when the shot names no state), then the prop references. The prompt says what goes where, by image number: "Insert the robot from image 2 standing on the floor in front of the shelf in image 1; put the Walkman from image 3 on the shelf beside him; the red cable runs from his open chest hatch to the Walkman. Keep the room, camera, and light of image 1 unchanged." Paths are relative to the project; canon files of an episode are `../../series/<series>/...`. Shots in the same plate then share geometry and light; screen text and other shot-specific edits follow as a second edit of this keyframe.
   - `image.background_removal` (`editImage`, one reference, prompt "Remove the background, and output a PNG image") cuts a subject out as a transparent PNG for Remotion layers. It needs a clear subject; check that the result is not empty.
   - Speech (`generateAudio`, role `audio.voice`, workflow `voxcpm-clone`): `audio` is the reference WAV, `params.transcript` its exact words, `prompt` the text to speak. Before writing the prompt, spell out every number, year, time, abbreviation, and symbol in German words ("2077" → "zweitausendsiebenundsiebzig", "z. B." → "zum Beispiel"); `generate` rejects digits and symbols. Generate one sentence or paragraph per item and join the takes with ffmpeg. On a slip or wrong stress, retry with up to 3 seeds. Use `audio.voice_design` (`"(description)Text"`) only to find a new voice.
   - Local `lipSync` (`providers.lipsync: comfyui`) runs on Pika first: workflow `pika-h3-ref2va-lipsync`, the Ref2VA graph with the vocal anchored as the soundtrack from frame 0, so the face is generated to the voice. Give the lead-only segment from `audio-segment` as `audio` (or `audio/stems/vocals.wav` with `audioStartSeconds` and `durationSeconds`), never the full mix; without `durationSeconds` the clip takes the segment's length, rounded up to 17n+5 frames. The prompt is a `flex` object like `referenceToVideo`: the keyframe as `<Picture 1>` `fully_preserved`, the sung words in quotes in the shot ("From the first frame she sings … in German, her lips forming each syllable in time with the vocal"), head and eyebrow motion, a static camera, `soundscape` "Only her lead vocal, as anchored." Keep it at 10 s or less; about 4.5 min per 5 s clip. On a weak take, try 2–3 other seeds first, then adjust the prompt.
   - LTX lip-sync stays as the fallback: `params.workflow: "ltx25-lipsync-flf2v"` with a plain 2–3 sentence prompt, a start frame and an optional end frame. Set `"audio": "audio/stems/vocals.wav"`, `audioStartSeconds` to the line's start, and `durationSeconds` to the exact length of the line plus about 0.3 s of the pause after it. Cut every segment in a speech pause: the frame count rounds down to 8n+1, so only that silent tail is dropped, never the end of a word.
   - Local clip options per item (ComfyUI only): `"video_model": "wan"` for an LTX image-to-video shot only when the user asks for Wan (in the bench it drifted faces and did not beat Pika on dance); Wan has no sound and is rejected for lip-sync. `"quality": "final"` for the final clip pass; it runs the SeedVR2 restore and writes `<clip>_upscaled.mp4` next to the clip; point the storyboard at that file. `"seedvr2": "upscale"` renders LTX at half size and lets SeedVR2 scale it up (faster); `"seedvr2": "off"` when the restored clip looks oversharpened. `"color_correction": "wavelet"` when `lab` shifts the colors. Write Wan prompts with the character names; `generate` swaps them for the descriptions.
   - `referenceToVideo` (Pika H3 Flex) writes its prompt in the Flex schema; give a `flex` object instead of `prompt` and `generate` renders it. `references[k]` is `<Picture k+1>`; name every picture in a subject. Use the retention labels `fully_preserved`, `attribute_transfer`, `weak_reference` (backgrounds of reference images are usually `weak_reference`), put time marks in the shots ("At about 1.5 seconds …"), and describe SFX, dialogue, and music that plays inside the scene in `soundscape`. There is no music field: `non_diegetic_music` is always "none", because the score comes in post-production (the song, or one bed per episode). No `audio` reference, no negative prompt. The aspect comes from the project kind. Example (references from a character sheet and a set; for a clip from a keyframe see the next bullet):
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
   - **A clip from a keyframe with Pika** (the default): `references[0]` is the keyframe, so the clip keeps its framing. Subject 1 is the character with `"picture": 1`, role "identity and outfit anchor", and the features from `characters.yaml`. The set is subject 2 as `"is": "the <set> in <Picture 1>"` without a `picture` key, role "set anchor". Both get `fully_preserved`. Add a state or prop reference as `<Picture 2>`… only when the keyframe shows the detail too small. Put the camera in `style` ("static locked-off camera, no zoom, one continuous take") and the action with time marks in `shots`. Where nobody speaks, write "Nobody speaks, mouths stay closed" in the shot and the soundscape, because Pika otherwise moves mouths in wide shots. `durationSeconds` is at most 10. Pika renders about 1 MP (1344×768 or 768×1344); for the final pass set `"params": {"quality": "final", "seedvr2": "upscale"}` so SeedVR2 scales the clip to the master size.
   - **Pika FL2VA** (`"params": {"workflow": "pika-h3-flf2va"}` on a `firstLastFrameToVideo` or `imageToVideo` item): the clip starts exactly on `references[0]` and ends on `references[1]` when given. Give `durationSeconds` and an `fl2va` object instead of `prompt`; `generate` writes the alignment line with the right second marks (Picture 2 only with an end frame) and the fixed music line:
     ```json
     { "operation": "firstLastFrameToVideo", "role": "video.first_last_frame", "references": ["assets/keyframes/shot-030.png", "assets/keyframes/shot-031.png"], "durationSeconds": 4, "params": { "workflow": "pika-h3-flf2va" },
       "fl2va": { "style": "Static locked-off camera, one continuous take.", "shots": ["The shot begins exactly on Picture 1: … At about 1.5 seconds … The shot settles into the final composition of Picture 2 and holds."], "soundscape": "…" } }
     ```
     Name the keyframes `Picture 1`/`Picture 2` (no angle brackets, no `<Subject N>`); both keyframes need the same aspect ratio. Do not use the Ref2VA Flex sections here; `generate` rejects a mix.
   - Every local workflow has a slower `-quality` variant (`qwen-t2i-quality`, `qwen-edit-quality`, `ltx-i2v-quality`, `ltx-t2v-quality`, `ltx-flf2v-quality`, `ltx25-lipsync-flf2v-quality`). Select it per item with `"params": {"workflow": "<name>"}`. Use it for character references, keyframes with a recurring character, face close-ups, clip and lip-sync start frames, hero clips, and the final clip pass; keep the default workflows for drafts, bass-hit stills, and face-free backgrounds. The parameter is ignored when the item runs on a cloud provider.
   - Resolution follows the project format (16:9 or 9:16) in multiples of 64. The roles render drafts at 0.8 MP; for the final render set `models.<role>.params.megapixels: 1.9` in `project.yaml`. Keyframes must already have the video's aspect ratio.
3. **Queue the items.** Mechanical steps run through `npm run cli -- …` only; never build an `ffmpeg`, Python, or `cp` command for them. The queue (`assets/queue.json`) builds items straight from `storyboard.yaml`:
   ```bash
   npm run cli -- queue add projects/<slug> --kind keyframe [--shots 001-005,008] [--workflow qwen-edit-quality]
   npm run cli -- queue add projects/<slug> --kind clip [--shots …] [--workflow pika-h3-flf2va] [--overrides <file>]
   ```
   - A keyframe item is `prompts.keyframe` with the shot's references in the order the prompt numbers them: plate (image 1), then per character its state reference (its sheet when the shot names no state), then the props. It is filed as `assets/keyframes/<shot>.png`. A chained shot gets no keyframe.
   - A clip item is `prompts.video` on the keyframe, `motion.props.clipSeconds` long, filed as `assets/clips/<shot>.mp4`; it waits for its keyframe. A chained shot waits for the clip it chains from and starts on that clip's last frame, which the queue extracts itself (`assets/keyframes/chain/<shot>-start.png`). Lip-sync shots are left out (step 8).
   - What the storyboard cannot say goes into `--overrides`, a JSON object keyed by shot id whose fields replace the built item's: `{"shot-008": {"fl2va": {…}}, "shot-001": {"operation": "firstLastFrameToVideo", "references": ["assets/keyframes/shot-001.png", "assets/keyframes/shot-002.png"]}}`. Write the file with the Write tool under `assets/batches/`. `--dry-run` prints the items.
   - Anything else (a reference, a lip-sync clip, a derived base image) is a hand-written item: a JSON array under `assets/batches/` with the fields of the tables above plus `"id"`, `"out"` (where the approved file goes, relative to the project; an episode may file new canon references under `../../series/<series>/…`), `"review": {"shot": "<id>"}` or `{"ref": "state:<char>/<state>"}`, and `"after": ["<id>", …]` for what it derives from. Add it with `queue add projects/<slug> --batch <file>`.
     ```json
     [{ "id": "state:hf7/chest-open", "out": "../../series/<series>/characters/hf7/states/chest-open.png", "review": {"ref": "state:hf7/chest-open"},
        "operation": "editImage", "role": "image.edit", "prompt": "…", "references": ["../../series/<series>/characters/hf7/sheet.png"], "seed": 1234 }]
     ```
4. Run `npm run cli -- estimate --role <role> --units <n> --project projects/<slug>` for every paid role and check the batch cap. If the batch exceeds it, split it or ask before spending. Local items cost $0.
5. **Run the queue** in the background (the Bash tool's `run_in_background`, never `&`), then follow it:
   ```bash
   npm run cli -- queue run projects/<slug>            # in the background
   npm run cli -- queue wait projects/<slug>           # blocks until an item needs you, or the run ended (at most 9 min)
   npm run cli -- queue status projects/<slug>
   ```
   One run generates the ready items in order through `generate` (budget, cache, `assets/manifest.jsonl`, spend) and reviews every result in the background the moment it exists, so the GPU never waits on a review. Each attempt is kept as `<out dir>/attempts/<name>-a<n>.<ext>`; only an approved attempt is filed at `out`, and only then do the items that derive from it start. When a generation fails or hangs, the run restarts ComfyUI with `COMFYUI_RESTART_COMMAND` and tries again. It stops by itself on a budget or credential problem. Call `queue wait` again while it reports "Still running"; do not sleep or poll files.
6. **Review loop.** The queue reviews with `review-image`: the art-director runs headless in its own context (about a minute), appends the verdict to `assets/review/verdicts.jsonl`, and fails an item only for a blocking defect (identity, anatomy, state or attachment, a missing named element, misspelled text, a break with an approved neighbour). Everything else is a note and never triggers a regeneration.
   - **pass** → filed at `out`; its dependents start.
   - **Failed image** → the queue regenerates it by itself with the verdict's `fix_prompt`, a new seed, and the old issues as the review focus, up to 3 attempts. Then it waits as `needs-fix`.
   - **Failed clip** → waits as `needs-fix`: a clip prompt cannot be fixed mechanically. Read its issues in `queue status`, rewrite the prompt (a different action or composition when a hand, limb, or body overlap failed, see `.claude/skills/storyboard/SKILL.md`), and put it back: `npm run cli -- queue retry projects/<slug> clip:<shot> --prompt "<new prompt>"`, or `--item <file>` with the changed fields (a rewritten `fl2va`, an end frame). Three attempts per clip.
   - **A local defect in an otherwise good image** (a hand, a tread, a patch of background) → repair only that region instead of rerolling the image:
     ```bash
     npm run cli -- patch projects/<slug> --image assets/keyframes/<shot>.png --box <x,y,w,h> --prompt "<what changes inside the box>" [--refs <state or prop png>] --shot <shot> [--workflow qwen-edit-quality] [--replace]
     ```
     The box is in fractions of the image (`0.3,0.5,0.4,0.3`) or pixels. The command crops it, runs the crop as an `image.edit` generation (the crop is image 1, `--refs` follow), pastes the result back with a soft edge, and files it as the next attempt; pixels outside the box do not change. `--replace` also puts it in place of the image. Review it with `review-image --image <attempt> --shot <shot> --attempt <n>`.
   - **Cloud fallback.** After 3 failed local attempts, one attempt on a strong cloud model, inside the budget and batch cap (check with `estimate --role <role> --units <n> --provider <p>` first): `queue retry projects/<slug> <id> --provider <p> [--item <file>]`. Cloud roles take the aspect from their params, so the item file sets `{"params": {"aspect_ratio": "<project aspect>"}}`.
     | Item | Role and provider | About |
     |---|---|---|
     | Image, several references | `image.edit` with `--provider topview` (Nano Banana 2.1 edit) | $0.035 |
     | Image, exact geometry or text | `image.edit` on fal (Flux 2 Pro edit) | $0.05 |
     | Image, at most 3 references, cheapest | `image.edit` with `--provider higgsfield` (Qwen edit) | $0.03 |
     | Clip | `video.image_to_video.premium` with `--provider topview` (Seedance 2.5) | $0.21/s |
     | Clip, lower cost | `video.image_to_video.quality` with `--provider higgsfield` (Kling 3.0) or `topview` (Wan 3.0) | $0.06–0.12/s |
     Pick the strongest one the remaining budget allows. If it fails too, keep the best attempt with `queue accept projects/<slug> <id>`, write its last issues into the batch notes, and move on.
   - **The user's eye wins.** When the user approved an attempt, file it with `queue accept projects/<slug> <id> --attempt <n> --note "user approved"` and do not regenerate it.
   - An item with status `error` names its cause in `queue status`. `queue retry projects/<slug> <id>` runs it again; an attempt that was generated but never reviewed is only reviewed again.

   To look at results yourself: `npm run cli -- sheet projects/<slug> --images <a.png>,<b.png> [--box <x,y,w,h>]` puts images side by side (with `--box`, zoomed into one region) as `assets/review/sheets/sheet.png`; `npm run cli -- probe <file…>` prints size, length, and frame rate; `npm run cli -- verdicts projects/<slug> [--failed]` lists the last verdict per shot and reference; `npm run cli -- comfy status` shows the server and its queue. A single review outside the queue: `review-image projects/<slug> --image <png> --shot <id>`, `--ref <kind:id>`, or `--clip <mp4> --shot <id>`, which extracts the first, middle, and last frame itself and measures the first frame against the keyframe.

   The loop always ends: at most 3 local attempts and one cloud attempt per item. After the queue is done, the orchestrator reads only `verdicts --failed` and `queue status`.
7. Frame chaining is used only when the storyboard enables it; the queue handles it (step 3). To land on a planned frame, make the item a `firstLastFrameToVideo` with that keyframe as the second reference. For a single frame outside the queue: `npm run cli -- frame <project> --input <clip> --position last --out <path>`.
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
9. Check that every storyboard `asset` path points at the filed clip (`assets/clips/<shot>.mp4`, or its `_upscaled.mp4`). Re-run `npm run cli -- validate projects/<slug>`.
10. Update the state when the asset batch is complete.

## Completion criteria

- Every AI shot has a keyframe and a clip (or a documented reason for a still-only shot).
- Every character shot passed at least one reference image to the provider.
- The manifest records model, prompt, seed, references, cost, and cache status.
- The batch stayed under the project budget and batch cap.
- No generated asset is committed to the repository.
- Every item in `queue status` is `passed`: by the reviewer, or accepted with its remaining risk written into the batch notes and the review report.

## Common failures

- Building shell one-liners (`ffmpeg`, `python3 -c`, `cp`, wait loops) for a step that has a CLI command: they stop the run on a permission prompt and are not reproducible.

- Text-only character prompts.
- Animating a keyframe with an extra limb or merged hands because it was only checked as a thumbnail.
- Rerolling a hand-contact or group shot again and again instead of changing its composition.
- Expecting 1080p from Kling 3.0 Standard: it returns 1280×720, so check `notes` in `config/models.yaml` for the output resolution before choosing a hero-shot role.
- Re-generating a cached shot because the prompt was reworded without changing the hash inputs.
- Lip-syncing from the full mix instead of the vocal stem, or with a segment that is offset from the shot start.
- A lip-sync face mouthing an echo or backing line the lead does not sing, because the segment was cut without muting the echo spans.
- Ignoring native audio in the generated clip; the song is the only audio source.
- Forgetting to record the spend and exceeding the budget silently.
