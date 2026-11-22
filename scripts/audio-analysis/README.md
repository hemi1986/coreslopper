# Audio Analysis

Local, reproducible timing extraction for a coreslopper project.

## What it produces

- `timing.json` — BPM, beats, downbeats, onsets, frame-level energy, sections, lyric lines, and word timestamps.
- `timing.report.md` — section table, confidence flags, unmatched lyric lines, the ASR/Demucs status, and the **unwritten vocals**: sung passages in the vocal stem that no lyric word covers (likely echoes or ad-libs that a lip-sync face must not mouth).

It never writes `timing.overrides.json`; that file is user-owned and is merged by the TypeScript resolver.

## Install

```bash
cd scripts/audio-analysis
uv sync                 # core: librosa, numpy, soundfile, jsonschema
uv sync --extra asr --extra stems   # WhisperX + Demucs
```

`ffmpeg` is required by librosa for some compressed formats. Use WAV for the pipeline. On the RTX 5070 Ti, install a PyTorch build with CUDA 12.8+ support; the extras are not pinned to a specific CUDA wheel.

## Run

```bash
uv run python analyze.py --project ../../projects/my-video --device cuda
```

Useful flags:

- `--vocals <path>` — use this vocal stem. Default: the stem `song.json` records, else `audio/stems/vocals.wav` if present.
- `--no-separate` — do not run Demucs; analyze the mix.
- `--skip-asr` — distribute lyric timings without WhisperX. Use only for fixtures or motion-only demos.
- `--language <code>` — sung language for ASR and alignment. Default: `language` from `song.json`, else WhisperX auto-detection.
- `--no-forced-alignment` — skip the per-line wav2vec2 refinement (faster; word times come from ASR anchors and interpolation).
- `--output <path>` / `--report <path>` — override the output paths.
- `--schema <path>` — validate against a JSON Schema (default: `schema/timing.schema.json` from the repo root).

## Method

Lyrics-first: `lyrics.txt` is authoritative for text, order, and section tags; ASR only supplies timestamps.

1. Separate vocals with Demucs when the project has no vocal stem.
2. Compute BPM, beats, onsets, and RMS energy with librosa.
3. Transcribe the vocals with WhisperX in the project language and collect word timestamps.
4. Split the lyrics into timed lines and stage directions. A line that is only `(Vibration.)` becomes a cue in `meta.cues`; `(Spoken) Hallo.` becomes a spoken line (`meta.lineKinds`).
5. Normalise tokens (Unicode-aware: umlauts and accents are kept, apostrophes dropped, digits spelled out for `de`/`en`) and align lyric words to ASR words with an **order-preserving** alignment. Repeated choruses therefore keep their own occurrence, and words that were not sung or were ad-libbed are skipped.
6. Give each line a search window from its anchors and refine its words with forced alignment inside that window. Anchors win when forced alignment disagrees by more than 0.8 s; unanchored words are interpolated. Lines with no anchor are placed by position with confidence ≤ 0.2.
7. Pick the downbeat phase whose beats carry the most energy.
8. Place each section boundary on a downbeat between the previous section's last word and the next section's first word (preferring an energy rise). Without a downbeat in the gap the boundary sits between the words and is flagged with confidence 0.55.
9. Write per-line confidence (`meta.lineConfidence`) and the report. Lines below 0.6 are listed for a listen.

With `--skip-asr`, sections come from energy changes and lines are spread evenly inside them; use this only for fixtures and motion-only demos.

## Lead-only vocals for lip-sync

A lip-sync face sings only the lead line. Two helpers find and remove backing vocals:

- `echo_scan.py` lists the unwritten vocals of an analyzed project, optionally for one time range, as in `timing.report.md`:

  ```bash
  uv run python echo_scan.py --project ../../projects/my-video --start 44 --end 56
  ```

  It compares the vocal stem's loudness with the word timestamps, so it finds an echo in a pause, not one that overlaps a lead word (that echo stretches the lead word in the timing instead). It also lists notes held past the aligned word end; check each span by ear. Mute the real echoes with `npm run cli -- audio-segment <project> ... --mute <start>-<end>`.

- `separate_lead.py` (optional, heavy) splits `audio/stems/vocals.wav` into `lead.wav` and `backing.wav` with the MelBand-Roformer karaoke model through python-audio-separator. `audio-segment` then cuts lip-sync segments from `lead.wav`. It is not in `uv sync`; run it in an ad-hoc environment (PyTorch, and about 900 MB of model weights on first use, cached in `.cache/audio-separator/`):

  ```bash
  uv run --with "audio-separator[gpu]" python separate_lead.py --project ../../projects/my-video
  ```

  audio-separator depends on `diffq`, which has no Linux wheel and needs a C compiler; without one, install it with `diffq` overridden (`printf 'diffq ; sys_platform == "never"\n' > /tmp/no-diffq.txt` and `uv pip install --override /tmp/no-diffq.txt "audio-separator[gpu]" audioread` in a separate venv). A 12 s excerpt takes about a minute on CPU. Karaoke models separate a lead from a different backing voice; an echo sung in the lead's own voice (common in generated songs) mostly stays in `lead.wav`, so keep muting those spans. Listen to `lead.wav` before relying on it.

## Tests

```bash
uv run pytest -q
```

The tests cover the pure helpers: lyric parsing, Unicode normalisation, cues and spoken lines, order-preserving alignment with repeated choruses, unsung lines, forced-alignment merging, downbeat phase, lyric-derived sections, and the no-ASR fallback. They do not download Demucs/WhisperX models.

## Known limits

- Always inspect `timing.report.md`. Heavily repeated hooks (e.g. a drop that repeats one phrase four times) can be under-transcribed by ASR; those lines are placed by position and flagged.
- Downbeats assume 4/4 and are a phase guess from energy; treat bar positions as approximate.
- Set `language` in `song.json` (or pass `--language`); auto-detection can be wrong for short or heavily processed vocals.
- Demucs separation quality depends on the mix. A vocal stem from the original session is preferred.
- The generated `timing.json` is small enough to commit; the audio and stems are not.
