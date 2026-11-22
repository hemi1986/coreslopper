"""Transcribe one speech file with faster-whisper and print {"text": ...} as JSON.

Used by `bench run --transcribe` to compare a generated take with the words it
should contain. Run through uv with the `asr` extra:

    uv run --project scripts/audio-analysis --extra asr python scripts/audio-analysis/transcribe.py take.wav
"""

from __future__ import annotations

import argparse
import json
import sys

# faster-whisper's own decoder calls PyAV with `metadata_errors`, which PyAV 19
# removed (TypeError). Decoding with librosa, a base dependency, avoids PyAV.
SAMPLE_RATE = 16_000


def load_speech(path: str):
    """Mono float32 samples at the 16 kHz faster-whisper expects."""
    import librosa

    audio, _sr = librosa.load(path, sr=SAMPLE_RATE, mono=True)
    return audio.astype("float32")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audio", help="Speech file to transcribe")
    parser.add_argument("--model", default="small", help="faster-whisper model size (default: small)")
    parser.add_argument("--language", default=None, help="Language code, e.g. de; default: detect")
    parser.add_argument("--device", choices=["auto", "cuda", "cpu"], default="auto")
    args = parser.parse_args()

    from faster_whisper import WhisperModel  # imported late: optional dependency

    model = WhisperModel(args.model, device=args.device, compute_type="default")
    segments, _info = model.transcribe(load_speech(args.audio), language=args.language, vad_filter=True)
    text = " ".join(segment.text.strip() for segment in segments).strip()
    json.dump({"text": text}, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
