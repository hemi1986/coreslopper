# Release package

Everything the user needs to publish, in one folder: `renders/release/` (on the media drive when `renders/` is linked there). The user only uploads files and pastes texts. You choose the moments, stills, and words and write them into `review/upload.yaml`; `npm run cli -- short`, `thumbnail`, `release`, `upload-text`, and `qa` cut, compose, assemble, lay out, and check.

Write every text in the project's language (`song.json` `language`, the language of the brief) and in the tone of the brief: a satire sounds like the song, not like a press release. Facts come from the project files only: spend from `state.json`, models from `assets/manifest.jsonl`, credits from `song.json`, the brief, and the `release:` block of `project.yaml`, and links, footer lines, and hashtag sets from `config/channel.yaml` when it exists. A tool, model, cost, person, name, ISRC, or right that is not in those files does not go into the texts; `release` marks the gap as a TODO for the user.

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

### TikTok covers

TikTok shows a cover only as a 3:4 tile in the profile grid and crops a 9:16 upload to its middle, so each Short also gets a 1080x1440 TikTok cover: the same still and hook as its Short thumbnail, composed again with `--format 3x4` (the hook sits in the lower part, above the view count). Name it `<short-name>-tiktok.jpg` beside its video:

```bash
npm run cli -- thumbnail projects/<slug> --format 3x4 \
  --still assets/image/keyframe/<hash>-0.png --text "EIN KLICK|UND AUS" --focus 0.5,0.35 \
  --out projects/<slug>/renders/shorts/Z3-klick-tiktok.jpg
```

## 5. Streaming cover

One 3000x3000 cover for the distributor, from the strongest still (the rules in [thumbnails.md](thumbnails.md), section "Cover"). The text is the artist and the title, nothing else:

```bash
npm run cli -- thumbnail projects/<slug> --format 1x1 \
  --still assets/image/keyframe/<hash>-0.png --text "<ARTIST>|<TITLE>" --focus 0.5,0.4 \
  --out projects/<slug>/renders/cover-3000x3000.jpg
```

## 6. Review the images

Run the `art-director` agent on all six thumbnails, the three TikTok covers, and the cover with the rules in [thumbnails.md](thumbnails.md). For the 9:16 Short thumbnails also: the hook reads at a quarter size, the face sits above the text and inside the central square, nothing important lies in the bottom 15 % (the Shorts UI). For the 3:4 TikTok covers: the hook reads in a 120x160 grid tile, the face sits above the text, nothing important lies in the bottom 12 % (the view count). Re-compose until each passes.

## 7. Write `review/upload.yaml`

Run `npm run cli -- release projects/<slug> --no-render` once first: its `renders/release/README.md` lists the TODOs, and `texts/` shows the chapters, footer, and limits your texts land in.

Gather the facts:

- **Spend:** `budget.spentUsd` in `state.json`.
- **Models:** group `assets/manifest.jsonl` by `provider`, `model`, and `role`; a `comfyui` provider ran locally, every other provider in the cloud. Name each model as `config/models.yaml` or the ComfyUI workflow names it, by what it made (keyframes, clips, lip-sync).
- **Credits:** artist, song source, and notes in `song.json` and `release:`; idea, cameo, and disclosure wishes in the brief.
- **Channel:** handles, footer lines, and hashtag sets in `config/channel.yaml`. Its footer is appended to the YouTube description for you; leave links out of your own text.

Then write the upload data. `schema/upload.schema.json` is the contract; the PostToolUse hook validates the file on every write. Paths are relative to the project.

```yaml
version: 1
language: de                       # the project's language (BCP-47)
main:
  file: renders/16x9.mp4
  title: "<title, at most 100 characters>"
  thumbnail: renders/thumbnails/thumb-1-hero.jpg     # becomes thumbnails/thumb-1.jpg
  alternate_thumbnails: [renders/thumbnails/thumb-2-cameo.jpg, renders/thumbnails/thumb-3-ensemble.jpg]
  description: |
    <3–6 narrative sentences in the voice of the song, built from the lyrics and the treatment>

    <⚠️ satire or AI disclosure, if the brief calls for it>

    🎬 <how it was made: the agent and coreslopper>
    🖥️ <what ran locally and what in the cloud, with the cloud spend from state.json>
    🛠️ <model list from the manifest, one line per job>
  hashtags: ['#tag1', '#tag2']     # 8–12; release appends them after chapters and footer
  tags: [studio tag, another tag]  # at most 500 characters together
  pinned_comment: "<a question or a line from the song that invites replies>"
  community_post: "<two or three lines announcing the video>"
  # summary_en: { title: "...", description: "..." }   # only when the brief names an international audience
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
    hashtags: ['#topic', '#shorts']  # 4–6, ending with #shorts
    instagram:
      caption: "<the Reel's own hook and one line of context; no #shorts>"
      hashtags: ['#topic']           # at most 5, counting those in the caption
      cover_frame: 1.5               # second of the Reel with the hook visible
      story: "<one line for the story with the link sticker>"
    tiktok:
      caption: "<short, spoken-sounding, a question or a dare>"
      hashtags: ['#topic']
      overlay: "<'Full video on YouTube: @handle' in the project's language>"  # pointer line in the description; TikTok Studio has no text overlay
      pinned_comment: "<optional>"
    platforms: [youtube, tiktok]
    # x: { post: "<the Short's line for X>", hashtags: ['#topic'] }   # optional: the Short also goes to X
# instagram_post: { caption: "...", hashtags: [...] }   # optional feed post for the release
spotify:
  artist_pick: "<one line pinned on the artist profile>"
  pitch: "<at most 500 characters: mood, genre, instruments, story>"
announcement:                      # a week before: Instagram story with the cover, YouTube post, X
  text: "<the release day and one line that makes people curious; no link>"
  hashtags: ['#topic']             # at most 5
x:
  post: "<at most 280 characters with the hashtags; no link: it goes in the reply>"
  hashtags: ['#topic']             # one or two
  reply: "<'Full video:' in the project's language; release appends the YouTube link>"
  media: Z1-intro                  # the Short uploaded with the post
linkedin:
  decision: post                   # post | skip
  reason: "<one sentence: why the song does or does not suit LinkedIn>"
  post: |                          # only with decision post
    <first paragraph at most 210 characters: the hook before "see more">

    <a personal story: what the song is about at work, in society, or in tech, and how it was made>
  hashtags: ['#KI']                # at most three
  media: main                      # main or a Short name
microsite:
  teaser: "<one or two sentences for the release list and link previews>"
  text: |
    <a few paragraphs about the song for its page on the artist microsite, Markdown>
  quote: "<one line of the lyrics as sung>"
```

- Write each platform's text for that platform: YouTube explains, Instagram hooks in the first line, TikTok talks. Identical Instagram and TikTok captions fail the check.
- Quote every value that contains `#`: unquoted, YAML reads `#…` as a comment and drops it.
- Every Short in `renders/shorts/` gets an entry; `related: main` becomes a checklist item, since YouTube sets the related video only by hand.
- `made_for_kids` and `synthetic_media` follow the brief; `config/channel.yaml` sets the disclosure defaults of the other platforms.
- Episodes have no `spotify` block.
- **LinkedIn is a decision.** Post when the song has a political, work, business, tech, or AI angle that a professional audience discusses (war profits, data sovereignty, AI and jobs, how an AI pipeline makes a video); skip a love song, a party song, or plain satire without that angle. Write the reason in either case. A post reads as a person's story, not as an ad.
- **X and LinkedIn carry no link in the text you write:** `release` adds the YouTube link (the live one once the user enters it on the release board) to the X reply and the end of the LinkedIn post.
- **The microsite** text is the song's own page: what the song is about and how it was made, in the voice of the brief; facts follow the same rules as the YouTube description.
- What each platform takes (limits, clickable links, AI labels) is in `docs/release-platforms.md`.

## 8. Build the release folder

```bash
npm run cli -- release projects/<slug>
npm run cli -- upload-text projects/<slug>
```

`release` plans the release calendar first (`review/calendar.yaml`, the next free slots under `config/release-schedule.yaml`; it keeps times already planned and never touches `project.yaml`), then renders only formats that are missing or stale, copies (hardlinks) everything else, converts the song to a deliverable WAV only when needed, cuts the Spotify canvas, writes the lyrics files, lays out `texts/` and `README.md`, and records `manifest.json`. A `✖` line is a broken limit: fix `upload.yaml` and run it again. When it reports that the canvas window shows lyrics, run it again with `--canvas-from <seconds or anchor>` on a part without lyrics (an instrumental or the drop) and check a frame of `streaming/canvas-9x16.mp4` with the art director: no text, no logos. `upload-text` keeps `review/upload.md` as a pointer to the folder. The release folder also gets `texts/x.md`, `texts/linkedin.md` (with a LinkedIn post), `texts/release-plan.md` with the calendar's dates and times, `calendar.ics`, and `microsite/<slug>.json`. The user works from `npm run cli -- release-board`; you do not start it.

`npm run cli -- publish projects/<slug> --dry-run` also checks the YouTube and TikTok limits; uploading stays the user's command.

## Completion

`npm run cli -- qa projects/<slug>` reports no FAIL in `Thumbnails`, `Shorts`, `Short thumbnails`, `Upload text`, `Upload data`, and every `Release …` check, and `Release texts` is PASS: every text written, every limit kept. TODO remains only where the user still has to supply a fact (`Release metadata`, a `<ID>` link) or choose a canvas window; `renders/release/README.md` lists them. The art director passed the six thumbnails and the cover.
