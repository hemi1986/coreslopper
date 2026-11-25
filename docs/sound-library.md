# The sound library

*[Deutsche Fassung](sound-library.de.md)*

The sound library holds the recurring sounds of your memes – the same boom, record scratch, or sting – so a meme
never generates them again. It belongs to the workspace, lives in `library/sounds/`, and the meme skill picks from it
when it writes a script ([ADR 0051](adr/0051-memes-and-the-sound-library.md)). `coreslopper init` and
`coreslopper update` never touch it.

This page is the reference for maintaining the library by hand. The board's [Sounds view](board.md#sounds) does the
same through the same commands.

## Where the library lives

One folder per sound:

```
library/sounds/
  vine-boom/
    sound.yaml   the entry: title, use when, cue, licence …
    sound.wav    the audio
```

- `sound.yaml` is tracked by git; it is the entry. `sound.wav` is gitignored, as the media of the character and set
  libraries are. A fresh clone has the descriptions but not the audio: copy the WAVs in and run `sound check`.
- The folder name is the sound's id: lowercase letters, digits, `-` and `_`, starting with a letter or digit, at most
  80 characters (`vine-boom`, `record-scratch-02`). `sound add` takes it from the title unless you pass `--id`.
- The library is yours. The meme stages only copy a sound into a meme as a take and never write here; hand edits
  are welcome (see Hand edits below).
- Hidden folders `.incoming-*` and `.removing-*` belong to a running `sound add` or `sound remove`. They are never
  entries; a leftover after an interrupted run can be deleted by hand.

## The entry, field by field

| Field | Meaning | Written by |
|---|---|---|
| `version` | Schema version, always `1`. | `sound add` |
| `id` | The folder's name. | `sound add`; a hand edit must keep it equal to the folder's name |
| `title` | What the sound is called, up to 200 characters (`Vine Boom`). | `sound add`, `sound edit`, hand edit |
| `use_when` | What the sound is for in a meme, up to 1000 characters. See Use when below. | `sound add`, `sound edit`, hand edit |
| `tags` | Words for finding the sound, each up to 60 characters; comma-separated on the command line. | `sound add`, `sound edit`, hand edit |
| `length` | The WAV's length in seconds, measured. | `sound add`, `sound check` |
| `loudness` | Integrated loudness in LUFS, measured; the file is never normalised. | `sound add`, `sound check` |
| `cue` | The moment the sound lands, in seconds from the trimmed start and inside it. See Finding the cue below. | `sound add`, `sound edit`, hand edit |
| `trim` | `{ start, end }` in seconds: the part of the file a meme uses; `start` before `end`, both inside `length`. | `sound add`, `sound edit`, hand edit |
| `source` | Where the sound came from: a URL or free words, up to 2000 characters. | `sound add`, `sound edit`, hand edit |
| `licence` | Free text up to 200 characters; `unknown` until you state one. | `sound add`, `sound edit`, hand edit |
| `credit` | The attribution text a licence that asks for one needs, up to 1000 characters. | `sound add`, `sound edit`, hand edit |
| `hash` | sha256 of `sound.wav`; a meme's take records what it was copied from. | `sound add`, `sound check` |
| `original_hash` | sha256 of the file as you added it, so the same file is recognised again whatever ffmpeg's build makes of it. A WAV you swap loses it when `sound check` measures the new file. | `sound add`, `sound check` |
| `added` | When the sound entered the library, ISO date and time. | `sound add` |

Do not type `length`, `loudness`, `hash`, `original_hash`, or `added`: the commands measure and write them. An edit
made through Claude Code is checked on write; anything else, `sound check` catches.

### Use when: what the sound means

The meme skill picks by `use_when`, not by the title, so write the situation in a meme rather than the sound.

- **Good**: `An unexpected reveal or a failed plan – cuts to a reaction and underlines the punchline.`
- **Weak**: `A deep boom with reverb and a tail.` (what it sounds like; the skill cannot tell when to use it)

One or two sentences about the moment it punctuates are enough; the tags help narrow the pick.

### Finding the cue

The cue is the moment the sound lands – the hit – in seconds from the **trimmed start**, not from the file's start.
Play the sound, stop on the hit, and read the position; **Cue from playback** in the board's Sounds view does exactly
that.

With `trim: { start: 0.20, end: 1.40 }` and the hit 0.55 s into the file, the cue is `0.35`. The cue must lie inside
the trimmed sound (here at most `1.20`). Only a meme's shot anchored on the line's `cue` uses it: the shot lands on
the hit.

### Example

```yaml
version: 1
id: vine-boom
title: Vine Boom
use_when: An unexpected reveal or a failed plan – cuts to a reaction and underlines the punchline.
tags: [reveal, reaction, punchline]
length: 1.404
loudness: -18.2
cue: 0.12
trim: { start: 0, end: 1.4 }
source: https://example.com/boom.mp3
licence: CC BY 4.0
credit: Boom by Jane Doe, CC BY 4.0
hash: 4f2c0a9e8b7d6c5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a
original_hash: 9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b
added: '2026-11-25T09:00:00.000Z'
```

## Commands

Run them in the workspace: `npm run cli -- sound …`.

| Command | What it does |
|---|---|
| `sound list [--tag <tag>] [--json]` | Every sound sorted by id, with its use when, measurements, cue, trim, licence, tags, and the memes that took it. `--json` prints every field for the meme skill. |
| `sound add <file> --title <title> --use-when <text> …` | Stores one local audio file as a WAV and writes the entry. |
| `sound edit <id> [--field …]` | Changes the entry's metadata, never its file. |
| `sound remove <id>` | Deletes the entry and its WAV. |
| `sound check` | Checks the whole library after hand edits and measures a swapped WAV again. |

### `sound add`

```bash
npm run cli -- sound add boom.mp3 --title "Vine Boom" \
  --use-when "An unexpected reveal – cuts to a reaction." \
  --tags reveal,reaction --cue 0.12 --trim 0-1.4 \
  --source https://example.com/boom.mp3 --licence "CC BY 4.0" --credit "Boom by Jane Doe, CC BY 4.0"
```

- Takes a local file, not a URL (download it first). Any format ffmpeg reads works (MP3, WAV, M4A, FLAC, OGG, and a
  video's audio track); it is stored as a 16-bit PCM WAV at 48 kHz without metadata, bit-exact, without gain or
  normalisation.
- `--title` and `--use-when` are required; `--id`, `--tags`, `--cue`, `--trim`, `--source`, `--licence`, and
  `--credit` are optional. `--trim` is `start-end` in seconds, like `0.1-1.2`.
- The licence is `unknown` unless you name one. Without `--id` the id comes from the title.
- Refused, and the library stays as it was: a taken id, a file whose content is already stored under another id
  (the stored WAVs and the files as added are compared), a file that is not audio or is silent, a cue or trim outside
  the sound, and a URL.
- The folder appears only when every check passed; length and loudness are measured from the WAV.

### `sound edit`

```bash
npm run cli -- sound edit vine-boom --use-when "An unexpected reveal or a failed plan."
npm run cli -- sound edit vine-boom --tags reveal,reaction,plan
npm run cli -- sound edit vine-boom --licence own --credit ""
```

- Changes the entry, never the audio file. An empty value clears an optional field; an empty `--licence` returns it
  to `unknown`. `--tags` replaces the list.
- `title` and `use_when` stay filled. A cue and a trim must stay inside the sound.
- A new `--trim` without `--cue` keeps the cue on the same moment of the **file**: because the cue counts from the
  trimmed start, it shifts with the trim.
- `length` and `loudness` are measured and cannot be typed.
- An edit that changes nothing writes nothing.

### `sound remove`

```bash
npm run cli -- sound remove vine-boom
```

Deletes the entry and its WAV. Memes that took the sound keep their copies; the command names them and reminds you
that its licence and credit leave the library. Nothing outside `library/sounds/` is touched. See the last section
for what happens to memes that already took it.

### `sound check`

```bash
npm run cli -- sound check
```

Looks at the whole library after hand edits and reports, sorted by id:

- an entry without its `sound.wav`;
- a file or folder without an entry (`sound add` creates an entry; a folder alone never becomes one);
- the same file under two ids;
- a cue or trim that no longer lies inside the sound;
- an entry that does not load or cannot be measured.

A WAV you replaced is measured again: its `length`, `loudness`, and `hash` are rewritten. Nothing is added or removed
otherwise, and one broken entry never ends the check. It exits with code 1 when it reported something.

## Hand edits

You may edit `sound.yaml` in your editor. An edit made through Claude Code is checked on write by the workspace's
hook (`validate-file`), which refuses a broken entry; your editor's own save is not watched, so run `sound check`
after it. The rule is the same:
- the schema must load (`LibrarySoundSchema`);
- `id` must equal the folder's name, and `sound.wav` must exist next to the entry;
- `title` and `use_when` must not be empty;
- `trim.start` before `trim.end`, both inside `length`; `cue` inside the trimmed sound.

After a batch of edits, run `sound check`. It reports what the files and entries say now; it never repairs a cue or
trim that no longer fits – change those with `sound edit`. To change the audio, replace `sound.wav` and run
`sound check`, which measures the new file.

## Licences and credits

Every sound has a licence, and it is `unknown` until you state one. The release check (`qa`, and the TODO list of
the release folder's `README.md` and `manifest.json`, which the board's release view shows) reads the licence of
every sound a meme took:

- `unknown` → a TODO;
- a licence that asks for attribution (CC BY and its spellings, `credit required`, `attribution …`) without a
  `credit` → a TODO;
- anything else → nothing.

These are TODOs, never a failed release: the decision is yours. State the licence and, where it asks for one, the
credit text:

```bash
npm run cli -- sound edit vine-boom --licence "CC BY 4.0" --credit "Boom by Jane Doe, CC BY 4.0"
npm run cli -- sound edit vine-boom --licence own
```

`own` says the recording is yours (or needs no credit). The credit of every sound a meme took goes into the meme's
platform texts – the TikTok, Reels, and Shorts caption. Then run `release` again.

## When a sound changes or a meme already used it

A meme never links a library sound: `voice-track` copies the trimmed WAV into the meme as a take and records what it
was made from – the sound's file hash and its trim.

- **Metadata changes** (title, use when, tags, source, licence, credit) leave the meme's copy alone; a finished video
  does not change.
- **A new trim, or a new WAV** (replaced by hand and measured by `sound check`): the take no longer matches what it
  was made from. The next `voice-track` (`/video-next`) copies the sound again; render the meme again.
- **A new cue** leaves the meme's audio alone, but a shot anchored on `line:<id>:cue` lands somewhere else. Render
  the meme again.
- **Removal**: the meme keeps its take and stays reproducible. The next `/video-next` warns that the library sound is
  gone; its licence and credit are no longer in the library, so the release check reports it as missing. No shot can
  anchor on its cue afterwards.

A sound the library no longer holds is never proposed to a new meme.

## See also

- [The board: Sounds](board.md#sounds) – the library in the browser, with upload, playback, and editing
- [ADR 0051](adr/0051-memes-and-the-sound-library.md) – the decision behind the library
- `sound --help` – every command and option
