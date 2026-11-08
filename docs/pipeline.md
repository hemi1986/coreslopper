# Pipeline Runbook

This page is the stage-by-stage operating manual. The project is autonomous by default; these are the commands a human or an agent runs when a stage needs attention.

## Stage IDs

`brief`, `treatment`, `lyrics`, `song`, `audio-analysis`, `style-character`, `storyboard`, `assets`, `assembly`, `qa-export`.

## 1. Brief

- Skill: `video-brief`
- Input: `project.yaml`, user idea, brand kit
- Output: `brief.md`

```bash
npm run cli -- stage-start projects/my-video brief
# invoke the video-brief skill (and grilling when the idea is fuzzy)
npm run cli -- stage-done projects/my-video brief --outputs brief.md
```

Completion: topic, source, audience, length, formats, style, constraints, success criteria; budget and formats match `project.yaml`.

## 2. Treatment

- Skill: `video-treatment`
- Input: `brief.md`, `lyrics.txt`, brand kit
- Output: `treatment.md`

Completion: one-sentence core idea, visual world, section-by-section dramaturgy, explicit shot mix.

## 3. Lyrics

- Skill: `lyrics-writer`
- Input: brief, treatment
- Output: `lyrics.txt`, `suno-style.txt`

Completion: every line under a section tag, original lyrics, concise style prompt, language matches the brief.

## 4. Song

- Skill: `suno-song`
- Input: lyrics, style prompt, Suno MCP or an imported file
- Output: `audio/song.wav`, `song.json`, optional stems

Completion: audio plays, `song.json` records source/license/duration/BPM/variant choice, no media committed.

## 5. Audio analysis

- Skill: `audio-analysis`
- Input: `audio/song.wav`, `audio/stems/vocals.wav` (optional), `lyrics.txt`
- Output: `timing.json`, `timing.report.md`

```bash
cd scripts/audio-analysis
uv sync
uv sync --extra asr --extra stems   # WhisperX + Demucs
uv run python analyze.py --project ../../projects/my-video --device cuda
cd ../..
npm run cli -- validate projects/my-video
```

Completion: timing validates; sections cover the song; low-confidence boundaries reviewed; overrides untouched.

## 6. Style & character bible

- Skills: `style-bible`, `character-bible`
- Input: brief, treatment, brand kit, model config
- Output: `style.yaml`, `characters.yaml`, character sheets/refs

Completion: style validates; every storyboard style key exists; every recurring character has a sheet and reference image; art-director passes.

## 7. Storyboard

- Skill: `storyboard`
- Input: treatment, effective timing, style, characters
- Output: `storyboard.yaml`, `storyboard.md`, `review/contact-sheet.svg`

```bash
npm run cli -- validate projects/my-video
npm run cli -- contact-sheet projects/my-video
```

Completion: schema, anchors, coverage, references, source rules, highlights, and chaining all pass; contact sheet exists.

## 8. Asset production

- Skills: `remotion-motion`, `ai-clips`, `footage`
- Input: storyboard, style, characters, model config
- Output: components, keyframes, clips, footage proxies, `assets/manifest.jsonl`

```bash
npm run cli -- estimate --role image.keyframe --units 8 --project projects/my-video
npm run cli -- generate projects/my-video --batch assets/batches/scene-01.json
```

Completion: every shot has its source asset or a documented reason; every character shot used references; manifest and budget reconciled; art-director passes.

## 9. Assembly

- Skill: `assembly-render`
- Input: validated storyboard, assets, audio
- Output: `renders/preview-16x9.mp4`, then master/derivatives

```bash
npm run cli -- render projects/my-video --format 16x9 --preview
npm run cli -- render projects/my-video --format 16x9
npm run cli -- render projects/my-video --format 9x16
npm run cli -- render projects/my-video --format 1x1
```

Completion: preview plays with the song; master is 1080p30 H.264; derivatives use designed layouts; no clipping.

## 10. QA & export

- Skill: `video-qa`
- Input: all renders, manifest, state
- Output: `review/report.md`, all formats

Completion: schema, assets, sync, readability, determinism, budget reconciliation, and all formats pass or are documented.

## Running the demo

```bash
npm install
npm run demo:audio
npm run cli -- validate projects/demo
npm run cli -- contact-sheet projects/demo
npm run cli -- render projects/demo --format 16x9
```

To exercise the Python analyzer without changing the committed timing fixture:

```bash
npm run demo:analyze
```

The demo is motion-only and uses no paid provider. It is the fastest way to check the pipeline and the renderer.

## Hard stops and resume

A stage stops when:

- the next batch exceeds the budget or `batch_cap_usd`;
- the configured provider is missing credentials;
- validation fails after the stage's retries;
- a script would overwrite `timing.overrides.json` or `project.yaml`.

After fixing the cause, re-run `/video-next <slug>` or the specific stage with `--stage <stage>`. The state machine skips completed stages and resumes the failed one. To deliberately re-run a completed stage after changing an input, reset it first:

```bash
npm run cli -- stage-reset projects/my-video storyboard
```

## State inspection

```bash
npm run cli -- status projects/my-video
```

The status table shows every stage, attempts, outputs, spend, remaining budget, batch cap, and the next stage.

## Troubleshooting

- **`ffmpeg` missing:** install it for footage and loudness normalization. The motion-only demo still renders without it.
- **WhisperX/Demucs missing:** install the `asr`/`stems` extras. Do not silently skip word alignment for a real lyric video.
- **FAL_KEY missing:** switch `providers.image`/`providers.video` to `mock` or add the key to `.env`.
- **Storyboard gap/overlap:** inspect the anchors. Prefer a symbolic anchor over a `time` escape hatch.
- **Render too slow:** use `--preview`, lower the concurrency, or render a still first.
- **Audio/video out of sync:** check `timing.effective.json` and the normalized song; re-run validation before re-rendering.
