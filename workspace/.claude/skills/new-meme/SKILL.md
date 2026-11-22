---
name: new-meme
description: Create a new meme, or resume one whose setup or script is unfinished. Without a wizard run it asks for the pitch and creates the project; then it grills the pitch to the punchline, picks library sounds with the user, and writes script.yaml.
license: MIT
---

# New Meme

This skill runs the two **interactive stages** of a meme in the main session, with the user: `setup` and `script`. A meme is a standalone 9:16 video of about 15 seconds, never over 30, with one punchline and German speech (ADR 0051). It has no series and no canon: its style, set, and character bibles are written after the script by `style-character`, so the script names speakers and sets by id.

Talk to the user in their language. Write every project file in English, except `text_de`, which is the German spoken or on-screen text.

## Start or resume

1. If the user named a slug and `projects/<slug>/project.yaml` exists, run `npm run cli -- status projects/<slug>` and jump to the first stage that is not `done`: `setup` → step 1 (skip project creation), `script` → step 2. If both are done, go to step 5.
2. Otherwise start at step 1. The board's wizard usually created the meme already, with `setup` done.

## Steps

### 1. Project

Ask in one round, with a recommended answer for each:

- **Idea**: the joke in the user's words. Mandatory.
- **Setting**: where it happens. Optional.
- **Slug**: lowercase, digits, dashes; recommend one derived from the idea.
- **Characters**: library characters to take (`npm run cli -- character list`), or none; `style-character` invents the rest.
- **Budget in USD**: recommend leaving it out, which gives the workspace's meme default.
- **Providers**: image and video provider (`mock`, `fal`, `higgsfield`, `topview`; video also `comfyui`). Check `npm run cli -- doctor` for keys and a reachable ComfyUI and recommend accordingly.

Then create the meme from the repository root, and take each chosen character:

```bash
npm run cli -- new <slug> --kind meme --idea "<idea>" [--setting "<setting>"] [--budget <usd>] --image-provider <p> --video-provider <p>
npm run cli -- character use projects/<slug> <character-id>
```

`new --kind meme` writes `pitch.md` and completes `setup`. On failure, show the error and stop; never create project files by hand.

Done when `new` succeeded, every chosen character is in `projects/<slug>/characters.yaml`, and `setup` is `done`.

### 2. Read before the first question

Read all of these before you ask anything:

- `projects/<slug>/pitch.md`: the idea and the setting. A starting point, never a decision.
- The user references: `npm run cli -- reference list projects/<slug>`; open the files and links that bear on the joke.
- The chosen characters: `projects/<slug>/characters.yaml` and the sheets it names.
- The sound library: `npm run cli -- sound list --json`. Each sound has `use_when`, `tags`, `length`, `trim`, `cue` (where the hit lands, seconds from the trimmed start), and `licence`. An empty library: say so once, now, and plan with generated sounds.

Done when you can name the pitch's joke, every reference's bearing, the characters, and the library's sounds in your own words.

### 3. Grill to the punchline

Use the `grilling` skill until the meme is fully decided: **setup → twist → payoff**. Who speaks which line in which kind (`dialogue`, `voiceover`, `announcement`, `chat`, `sfx`, `pause`), what is seen in each moment, the set each scene plays in, and where each sound lands. Push past the pitch: the payoff must be sharp enough to land in one viewing.

For every moment that wants a sound, propose one to three library sounds and name why each fits, from its `use_when`, `tags`, length, and `cue`; the user picks. When none fits, propose a generated sound (`prompt` with a `duration`) and say that it is a candidate for the library.

Speakers are the chosen library characters or new characters by id (lowercase, digits, `_` and `-`); `style-character` writes the new ones later. Sets are ids the same way.

Done when the grilling frontier is empty, every sound is picked, and the user confirmed shared understanding.

### 4. Write `script.yaml`

Write `projects/<slug>/script.yaml`:

```yaml
version: 1
title: <meme title>
chat: { cps: 12, hold: 1.2 }   # only when the script has chat lines
scenes:
  - id: s01_<set>              # lowercase, digits, _ and -
    set: <set id>
    description: <what is seen>
    atmo: <ambience prompt>     # optional
    lines:
      - { id: l01, kind: dialogue, speaker: <character id>, text_de: ..., text_en: ..., direction: ..., pause_after: 0.3 }
      - { id: l02, kind: sfx, sound: <library sound id> }
      - { id: l03, kind: sfx, prompt: <effect>, duration: 0.8 }
      - { id: l04, kind: pause, duration: 0.5 }
```

- A sound line names exactly one of `sound: <id>` (a library sound; no `duration`, its trim is its length) or a `prompt` with a `duration`.
- Lines play strictly one after another; leave `with` out. A sound starts after the line before it, so place a hit right after the line it punctuates; the storyboard lands the shot on its `cue`.
- Line IDs are unique across the script and stay stable: they name the take files and the storyboard anchors.
- Spoken `text_de` (`dialogue`, `voiceover`, `announcement`) spells out every number, year, time, abbreviation, and symbol in words ("2077" → "zweitausendsiebenundsiebzig", "z. B." → "zum Beispiel"). Chat text is shown, not spoken, and may keep digits.
- Every `dialogue`, `voiceover`, `announcement`, and `chat` line has `text_en`; `validate-file` requires it.
- Aim at about 15 seconds; the whole track stays under 30. Estimate speech at about 14 characters per second, plus chat, sound, and pause durations and every `pause_after`.

Run `npm run cli -- validate-file projects/<slug>/script.yaml` and fix every reported issue. Then show the user the moments in order (speaker or sound, set), the picked sounds, and the estimated length, and ask them to confirm or correct it.

Done when `validate-file` passes, the user confirmed the script, and `npm run cli -- stage-done projects/<slug> script --outputs script.yaml` succeeded.

### 5. Hand-over

Report the project path, budget, providers, the estimated length, and each generated sound line as a library candidate (`npm run cli -- sound add <file> --title <title> --use-when <text>` adds a sound once the user has one). Then name the next command: `/video-next <slug>`.

## Rules

- Never edit `project.yaml` or the library from this skill, and never overwrite `timing.overrides.json`.
- Recordings and generated audio stay under `projects/<slug>/audio/` and are never committed.
- Never echo API keys.
