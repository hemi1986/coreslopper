# Thumbnails

Three YouTube thumbnails per main video, made after the master passes; a vertical episode over 3 minutes gets one (#1), a short episode none ([release.md](release.md) names each shape's images). You choose the stills and the words; `npm run cli -- thumbnail` composes the pixels, so the same inputs always give the same JPEG. The vertical thumbnails of the Shorts follow the same rules with `--format 9x16`, their TikTok covers with `--format 3x4`, the streaming cover with `--format 1x1`; [release.md](release.md) covers when to make them.

## The three thumbnails

| # | Subject | Typical layout |
|---|---|---|
| 1 | The main character at the hero moment | `left` or `right` |
| 2 | The cameo, or the key scene if there is no cameo | the other side from #1 |
| 3 | The ensemble: several characters in one frame | `bottom` |

Three different subjects give three real candidates for a thumbnail test, not three crops of one image.

## 1. Pick the stills

Search the project's generated stills and keyframes (`assets/image/<role>/`; the manifest lists each prompt), not clip frames: a still has more resolution and no motion blur. Pick the largest, sharpest source with:

- the face large and turned towards the camera or the text, with room on one side for the hook;
- natural eyes (both looking the same way, no doubled irises) and clean hands (five fingers, no fused or extra fingers);
- no real logos, no real person's likeness, and no banknotes in the generated pixels.

If a still fails one of these, take the next candidate. A still whose sign or screen should carry text gets that text from an image edit before you compose, never from this command.

## 2. Write the words

- The hook: the song's hook or its title, in at most three lines of at most four words. Separate lines with `|`. Short, loud, and the same language as the song.
- Optional tag: one small word for the genre or frame, e.g. `SATIRE`, `LIVE`, `PARODY`.
- The first line sits on the `primary` role, the other lines and the tag on `--accent` (default `accent`). Use a palette key that `style.yaml` reserves for alarm or error (e.g. `error_red`) only when the thumbnail shows that moment.
- The scrim darkens the still towards the text in the background colour. On a dark still it can look like a grey veil: lower it with `--scrim` (0–1, default 1; 0 turns it off). `--text-offset <px>` moves the hook up (negative) or down (positive) when it covers a chin or a hand; keep it inside the zones above.

## 3. Compose

```bash
npm run cli -- thumbnail projects/<slug> \
  --still assets/image/edit/<hash>-0.png \
  --text "ZUKUNFT|AUF|KREDIT" --tag SATIRE \
  --layout left --focus 0.49,0.36 --zoom 1.2 \
  --out projects/<slug>/renders/thumbnails/thumb-1-<subject>.jpg
```

- `--layout` is the text side; the face goes on the opposite side (`bottom` puts the face above the text).
- `--focus x,y` is the face's position in the still as fractions (0–1); the command moves it to the face side as far as the frame allows. `--zoom` (1–4) crops tighter.
- `--font` picks another `style.yaml` typography key for the hook (default `display`). The hook needs a heavy, condensed, all-caps face; the tag always uses `mono`.
- Name the files `thumb-<n>-<subject>.jpg` in `renders/thumbnails/`. The command writes 1280x720 sRGB JPEG under 2 MB and fails otherwise, and records its **recipe** (still, focus, options) beside it as `<name>.recipe.json`.

## 4. Review

Run the `art-director` agent on the three JPEGs with these rules, and re-compose until each passes:

- The hook reads at 320x180 (a quarter of the size): huge, heavy, condensed capitals.
- The face is large, sharp, and on the side opposite the text; eyes and hands pass the checks above.
- Colors come from the style bible; the text never covers the face.
- No real logos, no real likeness, no banknotes.

## Cover

The 3000x3000 cover goes to Spotify, Apple Music, and every other store, and is shown as small as 64 px in lists.

- The strongest still of the main character or the central image, with room at the bottom for two lines.
- `--text "<ARTIST>|<TITLE>"`: artist and title only. URLs, handles, prices, platform names and logos, and the tag are refused by the command and by the stores.
- The layout is fixed: the image above, artist and title centred below, untilted. The command writes an RGB JPEG of exactly 3000x3000.
- The art director checks it like a thumbnail and also at 64x64: the image still reads, the text may blur, nothing looks like a logo.
- `release` composes the announcement images (with the release date) and the release-day story from the cover's recipe, so the cover's still carries the whole campaign: pick it for that too.

## Completion

Three JPEGs in `renders/thumbnails/` (one for a vertical episode over 3 minutes), three different subjects, each passed by the art director, and `npm run cli -- qa` reports `Thumbnails: PASS`. For the cover: `renders/cover-3000x3000.jpg` passed by the art director, and `Release cover: PASS` after `release`.
