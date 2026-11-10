---
name: new-episode
description: Create a new episode of a series, or resume one whose setup or script is unfinished. Asks for the series, episode number, and budget, creates the project, then grills the user into script.yaml from the series bible and episode plan.
license: MIT
---

# New Episode

This skill runs the two **interactive stages** of an episode in the main session, with the user: `setup` and `script`. The series and its canon (`series/<series>/`: `series.yaml`, `bible.md`, `style.yaml`, `characters.yaml`, `sets.yaml`) exist already; an episode reads the canon and never writes it.

Talk to the user in their language. Write every project file in English, except `text_de`, which is the German spoken or on-screen text.

## Start or resume

1. If the user named a slug and `projects/<slug>/project.yaml` exists, run `npm run cli -- status projects/<slug>` and jump to the first stage that is not `done`: `setup` → step 1 (skip project creation), `script` → step 2. If both are done, go to step 4.
2. Otherwise start at step 1.

## Steps

### 1. Project

Ask in one round, with a recommended answer for each:

- **Series**: one of the folders in `series/`. Read its `series.yaml`.
- **Episode number**: recommend the first episode of the plan in `series.yaml` that has no project yet (`grep -l "series: <series>" projects/*/project.yaml`).
- **Slug**: recommend `<series>-<nn>` with a two-digit number.
- **Budget in USD**. Mandatory. Never invent it.

Then create the project from the repository root:

```bash
npm run cli -- new <slug> --kind episode --series <series> --episode <n> --budget <usd>
```

It copies formats, providers, and brand from `series.yaml` and takes the title from the episode plan. On failure, show the error and stop; never create project files by hand. Then mark the stage: `npm run cli -- stage-done projects/<slug> setup --outputs project.yaml`.

Done when `new` succeeded and `setup` is `done`.

### 2. Grill into the script

Read `bible.md`, the episode's entry in the episode plan, the canon's characters (with their `face` display rules) and sets, and the `script.yaml` of the previous episode of the series, if one exists, for continuity. Then use the `grilling` skill until the episode is fully decided: what happens and how it ends, the scenes and the set each plays in, who speaks which line in which kind (`dialogue`, `voiceover`, `announcement`, `chat`, `sfx`, `pause`), the pauses that carry tension, the ambience of each scene, and the target length inside `limits.episode_seconds`.

Ground every question in the canon. When the story needs a character or set the canon lacks, stop the grilling on that branch and tell the user to add it to the series canon first; an episode cannot add one.

Done when the grilling frontier is empty and the user confirmed shared understanding.

### 3. Write `script.yaml`

Write `projects/<slug>/script.yaml`:

```yaml
version: 1
title: <episode title>
chat: { cps: 12, hold: 1.2 }   # only when the script has chat lines
scenes:
  - id: s01_<set>              # lowercase, digits, _ and -
    set: <set id from sets.yaml>
    description: <what happens in the scene>
    atmo: <ambience prompt>     # optional
    lines:
      - { id: l01, kind: dialogue, speaker: <character id>, text_de: ..., text_en: ..., direction: ..., pause_after: 0.5 }
      - { id: l02, kind: chat, speaker: <character id>, text_de: ..., text_en: ... }
      - { id: l03, kind: sfx, prompt: <effect>, duration: 1.2 }
      - { id: l04, kind: pause, duration: 1 }
```

- Line IDs are unique across the script and stay stable: they name the take files and the storyboard anchors.
- Spoken `text_de` (`dialogue`, `voiceover`, `announcement`) spells out every number, year, time, abbreviation, and symbol in words ("2077" → "zweitausendsiebenundsiebzig", "z. B." → "zum Beispiel"). Chat text is shown, not spoken, and may keep digits.
- Every `dialogue`, `voiceover`, `announcement`, and `chat` line has `text_en`: it is the English subtitle.
- Lines play strictly one after another; leave `with` out.

Run `npm run cli -- validate-file projects/<slug>/script.yaml` and fix every reported issue. Then show the user the scene list (set, line count, speakers) and an estimate of the length (speech at about 14 characters per second, plus chat, effect, and pause durations and every `pause_after`), and ask them to confirm or correct it.

Done when `validate-file` passes, the user confirmed the script, and `npm run cli -- stage-done projects/<slug> script --outputs script.yaml` succeeded.

### 4. Hand-over

Report the project path, budget, providers, and the estimated length. The autonomous stages follow: `voice-track` (takes and ambience; the user can first put own recordings at `audio/lines/<line-id>.wav` and run `import-takes`), `episode-track`, `storyboard`, `assets`, `assembly`, and `qa-export`.

## Rules

- Never edit the series canon or `project.yaml` from this skill, and never overwrite `timing.overrides.json`.
- Recordings and generated audio stay under `projects/<slug>/audio/` and are never committed.
- Never echo API keys.
