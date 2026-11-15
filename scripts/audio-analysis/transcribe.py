"""Transcribe one speech file with faster-whisper and print {"text": ...} as JSON.

Used by `bench run --transcribe` to compare a generated take with the words it
should contain. Run through uv with the `asr` extra:

    uv run --project scripts/audio-analysis --extra asr python scripts/audio-analysis/transcribe.py take.wav
"""

from __future__ import annotations

import argparse
import json
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audio", help="Speech file to transcribe")
    parser.add_argument("--model", default="small", help="faster-whisper model size (default: small)")
    parser.add_argument("--language", default=None, help="Language code, e.g. de; default: detect")
    parser.add_argument("--device", choices=["auto", "cuda", "cpu"], default="auto")
    args = parser.parse_args()

    from faster_whisper import WhisperModel  # imported late: optional dependency

    model = WhisperModel(args.model, device=args.device, compute_type="default")
    segments, _info = model.transcribe(args.audio, language=args.language, vad_filter=True)
    text = " ".join(segment.text.strip() for segment in segments).strip()
    json.dump({"text": text}, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
