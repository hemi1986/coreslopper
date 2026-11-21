---
name: new-series
description: Create a new series and its canon, or resume one whose canon is unfinished. Asks for the series data and budget, grills the user into the bible, characters, sets, and episode plan, then generates the character and set references and the reference voices.
license: MIT
---

# New Series

This skill builds a series **canon** in `projects/<slug>/` with the user, in the main session: `series.yaml`, `bible.md`, `style.yaml`, `characters.yaml`, `sets.yaml`, and the references under `characters/<id>/` and `sets/<id>/`. Episodes read the canon and never change it, so everything an episode needs to look and sound like the series is decided here.

Talk to the user in their language. Write every canon file in English, except reference-voice transcripts, which stay in the spoken language.

## Start or resume

1. If the user named a slug and `projects/<slug>/series.yaml` exists, run `npm run cli -- series-status <slug>` and resume at the first unfinished step: an empty bible → step 2, no characters or sets → step 3, characters or sets without references or speaking characters without a reference voice → step 4.
2. Otherwise start at step 1.

## Steps

### 1. Series data

Ask in one round, with a recommended answer for each:

- **Title** and **slug** (lowercase, digits, dashes).
- **Series budget in USD**. Mandatory; never invent it. It covers the canon generations of this skill plus every episode's budget; `new --kind episode` refuses an episode that does not fit.
- **Master format**: `9x16`, `16x9`, `1x1`, or `4x5`.
- **Providers**: images and clips (`mock`, `fal`, `higgsfield`, `comfyui`; check `npm run cli -- doctor`), and audio (`comfyui` for generated speech, or `mock` when the user records every line).
- **Brand kit** (default `example`).

Then create the series from the repository root:

```bash
npm run cli -- new-series <slug> --budget <usd> --title "<title>" --format <id> \
  --image-provider <p> --video-provider <p> --audio-provider <p>
```

Done when the command succeeds. On failure, show the error and stop; never create canon files by hand.

### 2. Bible

Read the user references (`npm run cli -- reference list --series <slug>`) and open every file first; ground the grilling in them and record material the user hands over in chat with `reference add --series`. Use the `grilling` skill until the series is decided: premise, tone, world rules, the recurring characters and how each may appear (display rule), the recurring sets, the languages of speech and subtitles, the episode length, and the episode plan. Then write `bible.md` along its template headings. For the recurring characters, show the user the matching ones from `npm run cli -- character list`; take each one they choose with `npm run cli -- character use <slug> <id> --series [--states <ids>]`, which writes its entry and copies its references, so step 4 only adds what the series needs on top.

Done when the grilling frontier is empty, the user confirmed shared understanding, and every heading of `bible.md` is filled.

### 3. Canon files

Write the machine-readable canon from the bible; the hook validates each file on write.

- `characters.yaml`: per character `id`, `name`, `description` (what never changes), `prompt`, and `face`: `full`, `silhouette`, `screen-only` (appears only on a screen), or `voice-only` (never on screen).
- `sets.yaml`: per set `id`, `name`, `description`, and `prompt`, the anchor every keyframe in that set starts from; per set its `plates` (`id`, `angle`), the fixed camera angles episodes return to; and at the top level `props` (`id`, `name`, `description`), the recurring objects. See "Sets, plates, and props" in `.claude/skills/style-bible/SKILL.md`.
- Character states (`states` in `characters.yaml`) that are part of the canon from episode 1 on; episodes append later ones.
- `style.yaml`: refine the starter style from the brand kit with the `style-bible` skill.
- `series.yaml`: the episode plan under `episodes` (`episode`, `title`, `logline`) and the creative limits under `limits` (`episode_seconds: { min, max }`, optionally `lipsync_seconds_max`) that the bible names. Leave `budget_usd` as created; when the user changes it, change `budget.totalUsd` in `state.json` together with it.

Done when `npm run cli -- series-status <slug>` lists every character, set, and planned episode of the bible.

### 4. References

Generate through the series budget: `npm run cli -- generate --series <slug> --batch <file>` estimates, checks the series budget and batch cap, caches, and writes `projects/<slug>/assets/manifest.jsonl`. Use `--dry-run` first. Give every item its `"out"` path inside the canon (`characters/<id>/sheet.png`, `sets/<id>/plates/<plate>.png`, …): `generate` files the result there, so nothing is copied by hand.

- **Characters** shown on screen (`full`, `screen-only`, `silhouette`): a character sheet with `image.character_sheet`, then 2–4 references with `image.edit` from the sheet. Follow `.claude/skills/character-bible/SKILL.md` for descriptions and review. A `silhouette` character gets a silhouette sheet with no readable face.
- **Sets**: one or more start frames per set with `image.keyframe` from the set's `prompt` plus the style's look keywords, at the master format's size.
- **Plates**: one empty frame per plate, as an `image.edit` of the set's start frame that moves the camera to the plate's `angle` (same room, same light, nobody in it), saved as `sets/<id>/plates/<plate>.png` and recorded in `ref`.
- **Props**: one reference per prop alone on a neutral ground, saved under `props/<id>/` and recorded in `refs`.
- **Character states** of the canon: an `image.edit` of the sheet per state, saved as `characters/<id>/states/<state>.png` and recorded in `ref` (see `.claude/skills/character-bible/SKILL.md`).
- **Reference voices** for every character with speech: a recording by the user (a user reference of kind `voice` whose `subject` names the character), or, with `providers.audio: comfyui`, an `audio.voice_design` take ("(voice description)text"). Save it as `characters/<id>/voice.wav` and record `voice.ref` and the exact `voice.transcript` in `characters.yaml`.

Record the filed paths in `sheet`, `refs`, and `ref`. Review every sheet, set frame, plate, prop, and state as soon as it exists with `npm run cli -- review-image projects/<slug> --image <png> --ref <kind:id>`; it fails an image only for a blocking defect. Regenerate what fails with its `fix_prompt` (a new seed, the same `out`), or repair one region with `npm run cli -- patch --series <slug> --image <png> --box <x,y,w,h> --prompt "…" --ref <kind:id> --replace`. The generation queue (`queue`) works on projects only; a canon is small enough for this loop by hand.

Done when every on-screen character has a sheet and at least one reference, every set has at least one reference frame and every plate its image, every prop and state its reference, every speaking character has a reference voice with its transcript, the art director passed them, and `npm run cli -- character import <slug> --series` took the characters into the workspace library.

### 5. Hand-over

Report the series path, the series budget with canon spend (`series-status`), and the episode plan. Episodes start with `/new-episode`.

## Rules

- References, voices, and generations stay under `projects/<slug>/characters/`, `sets/`, `props/`, and `assets/`, which are gitignored; the YAML canon and `state.json` are tracked.
- Change a character or set only before its first episode is generated: canon files are shared by every episode, and a changed reference changes the cache keys of every later generation. Episodes may append plates, props, and character states; they never change existing ones.
- Never echo API keys.
