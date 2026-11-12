# Release package

Everything the user needs to publish the video: the main video's upload texts and three thumbnails, three Shorts with their own vertical thumbnails and texts, and one upload file, `review/upload.md`. You choose the moments, stills, and words; `npm run cli -- short`, `thumbnail`, and `qa` do the cutting, composing, and checking.

Write every text in the project's language (`song.json` `language`, the language of the brief) and in the tone of the brief: a satire sounds like the song, not like a press release. Facts come from the project files only: spend from `state.json`, models from `assets/manifest.jsonl`, credits from `song.json` and the brief. A tool, model, cost, or person that is not in those files does not go into the texts.

## 1. Main video thumbnails

Make the three 16:9 thumbnails with [thumbnails.md](thumbnails.md).

## 2. Pick three Shorts

Read the sections and lines of `timing.effective.json` and the storyboard. Pick three moments that each work alone in the first second, with no intro needed:

| # | Typical moment | Example name |
|---|---|---|
| 1 | The hook or the intro | `Z1-intro` |
| 2 | The chorus | `Z2-chorus` |
| 3 | The climax, drop, twist, or ending | `Z3-klick` |

- 30–50 s each; the command refuses more than 60 s.
- Cut on section boundaries: start at a section start (or the first line of a section), end at a section end or a line end, never mid-word. Shift by a beat with an offset when a boundary lands on silence.
- Three different moments, with as little overlap as the song allows.
- Name them `<Letter><n>-<moment>`: the first letter of the title in capitals, 1–3, and one lowercase word for the moment.

## 3. Cut the Shorts

The Shorts come from `renders/9x16.mp4`; render it first if it is missing (`npm run cli -- render projects/<slug> --format 9x16`).

```bash
npm run cli -- short projects/<slug> --from section:intro --to section:intro:end --name Z1-intro
npm run cli -- short projects/<slug> --from section:chorus_1 --to line:l24:end+0.3 --name Z2-chorus
npm run cli -- short projects/<slug> --from section:breakdown --to section:breakdown:end --name Z3-klick
```

`--from` and `--to` take seconds or anchors: `section:<id>[:start|end]`, `line:<id>[:start|end]`, `word:<line>:<n>[:start|end]`, `beat:<n>`, `downbeat:<n>`, each with an optional offset such as `:end-0.5`. The command snaps to frames, re-encodes, and fades the audio in and out. Run the three cuts one after another. A warning outside 30–50 s means: move a boundary to the next section or line edge and cut again.

## 4. Short thumbnails

One 1080x1920 thumbnail per Short, from a generated still of a shot inside that Short's window (pick it with the rules in [thumbnails.md](thumbnails.md)). The hook is the Short's own line, at most three lines of four words.

```bash
npm run cli -- thumbnail projects/<slug> --format 9x16 \
  --still assets/image/keyframe/<hash>-0.png --text "EIN KLICK|UND AUS" --focus 0.5,0.35 \
  --out projects/<slug>/renders/shorts/Z3-klick-thumb.jpg
```

The vertical layout is fixed: the face in the upper middle, the hook in the lower part above the Shorts buttons, its first line inside the central square that grid views show. Name each file `<short-name>-thumb.jpg` beside its video.

## 5. Review the thumbnails

Run the `art-director` agent on all six JPEGs with the rules in [thumbnails.md](thumbnails.md); for the vertical ones also: the hook reads at a quarter size, the face sits above the text and inside the central square, nothing important lies in the bottom 15 %. Re-compose until each passes.

## 6. Write `review/upload.md`

Gather the facts first:

- **Spend:** `budget.spentUsd` in `state.json`.
- **Models:** group `assets/manifest.jsonl` by `provider`, `model`, and `role`; a `comfyui` provider ran locally, every other provider in the cloud. Name each model as `config/models.yaml` or the ComfyUI workflow names it, by what it made (keyframes, clips, lip-sync).
- **Credits:** artist, song source, and notes in `song.json`; idea, cameo, and disclosure wishes in the brief.

Then write the file in this structure. The headings are free text; the bold labels are in the project's language (`qa` reads Title/Titel, Description/Beschreibung, Tags and their equivalents).

```markdown
# Upload-Paket — <Titel>

## Hauptvideo

**Datei:** `<path the user uploads from>`
**Titel:** <title, at most 100 characters>
**Thumbnails:** `<thumb-1>`, `<thumb-2>`, `<thumb-3>`

**Beschreibung:**

<3–6 narrative sentences in the voice of the song, built from the lyrics and the treatment>

<⚠️ satire or AI disclosure, if the brief calls for it>

🎬 <how it was made: the agent and coreslopper, https://www.npmjs.com/package/coreslopper>
🖥️ <what ran locally and what in the cloud, with the cloud spend from state.json>
🛠️ <model list from the manifest, one line per job>

💡 <idea> · 🎵 <song credits> · <cameo, if any>

<8–12 hashtags on one line>

**Tags:** <studio tags, comma-separated, at most 500 characters>

## Shorts

### Z1 — <moment> (<length> s)

**Datei:** `<renders/shorts/Z1-intro-9x16.mp4>`
**Thumbnail:** `<renders/shorts/Z1-intro-thumb.jpg>`
**Titel:** <the Short's line> <one emoji> #<topic> #shorts

**Beschreibung:**
<one or two lines on the moment, with the emoji>
Ganzes Video: Link oben ☝️
<the disclosure line, short, if the brief calls for it>
<credits on one line: song & idea, cameo if they appear in this Short, the tool>

<4–6 hashtags on one line, ending with #shorts>

- [ ] Verwandtes Video = Hauptvideo
- [ ] „Veränderte oder synthetische Inhalte“: Ja
- [ ] Nicht speziell für Kinder
- [ ] Beschreibung, Hashtags und Tags eingefügt
```

Translate the pointer ("Full video: link above ☝️") and the checklist into the project's language. Use the media-drive path for `**Datei:**` when `renders/` is a symlink to `CORESLOPPER_MEDIA_DIR` (the user uploads from there), else the project path. Every Short's file name appears in its section.

## Completion

`npm run cli -- qa projects/<slug>` reports `Thumbnails`, `Shorts`, `Short thumbnails`, and `Upload text` as PASS: three 16:9 thumbnails, three Shorts at most 60 s in 9:16 with a 1080x1920 thumbnail each, and an upload file with a title, description, and hashtags for the main video and every Short.
