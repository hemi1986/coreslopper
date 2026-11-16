# Release package

Everything the user needs to publish the video: the main video's upload texts and three thumbnails, three Shorts with their own vertical thumbnails and texts, the upload data `review/upload.yaml`, and the upload text `review/upload.md` rendered from it. You choose the moments, stills, and words; `npm run cli -- short`, `thumbnail`, `upload-text`, and `qa` do the cutting, composing, rendering, and checking. Uploading is the user's own `publish` command, outside the pipeline.

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

## 6. Write `review/upload.yaml`, then render `review/upload.md`

Gather the facts first:

- **Spend:** `budget.spentUsd` in `state.json`.
- **Models:** group `assets/manifest.jsonl` by `provider`, `model`, and `role`; a `comfyui` provider ran locally, every other provider in the cloud. Name each model as `config/models.yaml` or the ComfyUI workflow names it, by what it made (keyframes, clips, lip-sync).
- **Credits:** artist, song source, and notes in `song.json`; idea, cameo, and disclosure wishes in the brief.

Then write the upload data. `schema/upload.schema.json` is the contract; the PostToolUse hook validates the file on every write. Paths are relative to the project.

```yaml
version: 1
language: de                       # the project's language (BCP-47)
main:
  file: renders/16x9.mp4
  title: "<title, at most 100 characters>"
  thumbnail: renders/thumbnails/thumb-1-hero.jpg     # the one publish sets
  alternate_thumbnails: [renders/thumbnails/thumb-2-cameo.jpg, renders/thumbnails/thumb-3-ensemble.jpg]
  description: |
    <3–6 narrative sentences in the voice of the song, built from the lyrics and the treatment>

    <⚠️ satire or AI disclosure, if the brief calls for it>

    🎬 <how it was made: the agent and coreslopper, https://www.npmjs.com/package/coreslopper>
    🖥️ <what ran locally and what in the cloud, with the cloud spend from state.json>
    🛠️ <model list from the manifest, one line per job>

    💡 <idea> · 🎵 <song credits> · <cameo, if any>
  hashtags: ['#tag1', '#tag2']     # 8–12; appended below the description on upload
  tags: [studio tag, another tag]  # at most 500 characters together
  made_for_kids: false
  synthetic_media: true            # "altered or synthetic content"
  platforms: [youtube]
shorts:
  - name: Z1-intro                 # as in renders/shorts/Z1-intro-9x16.mp4
    moment: Intro
    file: renders/shorts/Z1-intro-9x16.mp4
    thumbnail: renders/shorts/Z1-intro-thumb.jpg
    title: "<the Short's line> <one emoji> #<topic> #shorts"
    description: |
      <one or two lines on the moment, with the emoji>
      <"Full video: link above ☝️" in the project's language>
      <the disclosure line, short, if the brief calls for it>
      <credits on one line: song & idea, cameo if they appear in this Short, the tool>
    hashtags: ['#topic', '#shorts']  # 4–6, ending with #shorts
    tags: [topic]
    platforms: [youtube, tiktok]
```

- Quote every value that contains `#`: unquoted, YAML reads `#…` as a comment and drops it.
- Every Short in `renders/shorts/` gets an entry; `related: main` is the default and becomes a checklist item, since YouTube sets the related video only by hand.
- `made_for_kids` and `synthetic_media` follow the brief; the defaults are `false` and `true`.

Render the upload text from it, with the labels and checklists in the project's language:

```bash
npm run cli -- upload-text projects/<slug>
```

Edit `upload.yaml` and run `upload-text` again for any change; `upload.md` is generated. It shows the media-drive path under the file label when `renders/` is a symlink to `CORESLOPPER_MEDIA_DIR`, the path the user uploads from.

## 7. Check the package against the platforms

```bash
npm run cli -- publish projects/<slug> --dry-run
```

The dry run makes no network calls: it validates `upload.yaml`, the files, YouTube and TikTok limits (length, aspect ratio, title, description, tags), and the quota, and prints the plan. Fix every `✖` line in `upload.yaml` and render again. `publish` itself is the user's command; the stage ends at the dry run.

## Completion

`npm run cli -- qa projects/<slug>` reports `Thumbnails`, `Shorts`, `Short thumbnails`, `Upload text`, and `Upload data` as PASS: three 16:9 thumbnails, three Shorts at most 60 s in 9:16 with a 1080x1920 thumbnail each, an `upload.yaml` whose files all exist and that names every Short, and an `upload.md` rendered from it. `publish --dry-run` reports no error.
