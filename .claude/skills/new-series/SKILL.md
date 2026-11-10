---
name: new-series
description: Create a new series and its canon, or resume one whose canon is unfinished. Asks for the series data and budget, grills the user into the bible, characters, sets, and episode plan, then generates the character and set references and the reference voices.
license: MIT
---

# New Series

This skill builds a series **canon** in `series/<slug>/` with the user, in the main session: `series.yaml`, `bible.md`, `style.yaml`, `characters.yaml`, `sets.yaml`, and the references under `characters/<id>/` and `sets/<id>/`. Episodes read the canon and never change it, so everything an episode needs to look and sound like the series is decided here.

Talk to the user in their language. Write every canon file in English, except reference-voice transcripts, which stay in the spoken language.

## Start or resume

1. If the user named a slug and `series/<slug>/series.yaml` exists, run `npm run cli -- series-status <slug>` and resume at the first unfinished step: an empty bible → step 2, no characters or sets → step 3, characters or sets without references or speaking characters without a reference voice → step 4.
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

Use the `grilling` skill until the series is decided: premise, tone, world rules, the recurring characters and how each may appear (display rule), the recurring sets, the languages of speech and subtitles, the episode length, and the episode plan. Then write `bible.md` along its template headings.

Done when the grilling frontier is empty, the user confirmed shared understanding, and every heading of `bible.md` is filled.

### 3. Canon files

Write the machine-readable canon from the bible; the hook validates each file on write.

- `characters.yaml`: per character `id`, `name`, `description` (what never changes), `prompt`, and `face`: `full`, `silhouette`, `screen-only` (appears only on a screen), or `voice-only` (never on screen).
- `sets.yaml`: per set `id`, `name`, `description`, and `prompt`, the anchor every keyframe in that set starts from.
- `style.yaml`: refine the starter style from the brand kit with the `style-bible` skill.
- `series.yaml`: the episode plan under `episodes` (`episode`, `title`, `logline`) and the creative limits under `limits` (`episode_seconds: { min, max }`, optionally `lipsync_seconds_max`) that the bible names. Leave `budget_usd` as created; when the user changes it, change `budget.totalUsd` in `state.json` together with it.

Done when `npm run cli -- series-status <slug>` lists every character, set, and planned episode of the bible.

### 4. References

Generate through the series budget: `npm run cli -- generate --series <slug> --batch <file>` estimates, checks the series budget and batch cap, caches, and writes `series/<slug>/assets/manifest.jsonl`. Use `--dry-run` first.

- **Characters** shown on screen (`full`, `screen-only`, `silhouette`): a character sheet with `image.character_sheet`, then 2–4 references with `image.edit` from the sheet. Follow `.claude/skills/character-bible/SKILL.md` for descriptions and review. A `silhouette` character gets a silhouette sheet with no readable face.
- **Sets**: one or more start frames per set with `image.keyframe` from the set's `prompt` plus the style's look keywords, at the master format's size.
- **Reference voices** for every character with speech: a recording by the user, or, with `providers.audio: comfyui`, an `audio.voice_design` take ("(voice description)text"). Save it as `characters/<id>/voice.wav` and record `voice.ref` and the exact `voice.transcript` in `characters.yaml`.

Copy the chosen files from `assets/` into `characters/<id>/` and `sets/<id>/`, and record them in `sheet` and `refs`. Have the `art-director` review every sheet and set frame against the bible and the style; regenerate what fails.

Done when every on-screen character has a sheet and at least one reference, every set has at least one reference frame, every speaking character has a reference voice with its transcript, and the art director passed them.

### 5. Hand-over

Report the series path, the series budget with canon spend (`series-status`), and the episode plan. Episodes start with `/new-episode`.

## Rules

- References, voices, and generations stay under `series/<slug>/characters/`, `sets/`, and `assets/`, which are gitignored; the YAML canon and `state.json` are tracked.
- Change a character or set only before its first episode is generated: canon files are shared by every episode, and a changed reference changes the cache keys of every later generation.
- Never echo API keys.
