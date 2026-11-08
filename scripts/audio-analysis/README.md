# Audio Analysis

Local, reproducible timing extraction for a coreslopper project.

## What it produces

- `timing.json` — BPM, beats, downbeats, onsets, frame-level energy, sections, lyric lines, and word timestamps.
- `timing.report.md` — section table, confidence flags, unmatched lyric lines, and the ASR/Demucs status.

It never writes `timing.overrides.json`; that file is user-owned and is merged by the TypeScript resolver.

## Install

```bash
cd scripts/audio-analysis
uv sync                 # core: librosa, numpy, soundfile, jsonschema
uv sync --extra asr     # WhisperX word alignment
uv sync --extra stems   # Demucs vocal separation
```

`ffmpeg` is required by librosa for some compressed formats. Use WAV for the pipeline. On the RTX 5070 Ti, install a PyTorch build with CUDA 12.8+ support; the extras are not pinned to a specific CUDA wheel.

## Run

```bash
uv run python analyze.py --project ../../projects/my-video --device cuda
```

Useful flags:

- `--vocals <path>` — use an existing Suno vocal stem.
- `--no-separate` — do not run Demucs; analyze the mix.
- `--skip-asr` — distribute lyric timings without WhisperX. Use only for fixtures or motion-only demos.
- `--output <path>` / `--report <path>` — override the output paths.
- `--schema <path>` — validate against a JSON Schema (default: `schema/timing.schema.json` from the repo root).

## Method

1. Separate vocals with Demucs when no stem is supplied.
2. Align the authoritative lyric text to WhisperX word timestamps. The text and section tags come from `lyrics.txt`; only timestamps come from ASR.
3. Compute BPM, beats, downbeats, onsets, and RMS energy with librosa.
4. Estimate section boundaries from energy changes when ASR segments exist; fall back to equal division when ASR is skipped.
5. Snap section boundaries to nearby line starts and write the confidence report.

## Tests

```bash
uv run pytest -q
```

The tests cover the pure helpers: lyric parsing, word distribution, energy boundaries, section coverage, and line alignment. They do not download Demucs/WhisperX models.

## Known limits

- The energy-based boundary finder is a heuristic. Always inspect `timing.report.md`.
- ASR language detection can be wrong for short or instrumental tracks. Set the language in WhisperX if needed.
- Demucs separation quality depends on the mix. A Suno vocal stem is preferred.
- The generated `timing.json` is small enough to commit; the audio and stems are not.
