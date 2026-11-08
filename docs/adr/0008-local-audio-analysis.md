# Local-first audio analysis: Demucs + WhisperX + librosa, lyrics text wins

**Status:** Accepted

## Context

Word-level timing is essential for typography and sync. Per-minute ASR APIs add cost and send audio to a third party; the user has a capable local GPU.

## Decision

Separate vocals with Demucs (using Suno stems when available). Align with WhisperX (faster-whisper plus wav2vec2 alignment) on the vocal stem. The authoritative text and section tags come from `lyrics.txt`; only timestamps come from alignment. librosa computes BPM, beats, downbeats, onsets, and frame-level energy. Sections combine tags, line timings, and energy changes. The script writes `timing.json` and a confidence report. `timing.overrides.json` is user-owned, has precedence, and is never overwritten. CPU fallback is supported.

## Consequences

- No per-minute ASR cost and no audio upload.
- The GPU install is heavy; CPU is slower.
- Whisper errors are corrected by lyrics and overrides, never trusted blindly.
