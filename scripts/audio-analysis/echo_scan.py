#!/usr/bin/env python3
"""List sung passages in a project's vocal stem that no lyric word covers.

Likely unwritten echoes, ad-libs, or backing vocals. A lip-sync segment must
not contain them: mute them with `audio-segment --mute <start>-<end>`.

    uv run python echo_scan.py --project ../../projects/<slug> [--start 40 --end 60]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from timing_core import unwritten_vocal_spans

HOP = 512
SAMPLE_RATE = 22_050


def vocal_rms(path: Path) -> tuple[list[float], float]:
    import librosa

    audio, sr = librosa.load(str(path), sr=SAMPLE_RATE, mono=True)
    rms = librosa.feature.rms(y=audio, frame_length=2048, hop_length=HOP)[0]
    return [float(value) for value in rms], sr / HOP


def scan(vocals: Path, timing: dict, **options) -> list[dict]:
    rms, fps = vocal_rms(vocals)
    return unwritten_vocal_spans(rms, fps, timing.get("lines", []), **options)


def markdown(spans: list[dict]) -> list[str]:
    if not spans:
        return ["- No sung passage without a lyric word."]
    rows = [
        f"- {len(spans)} sung passage(s) without a lyric word (likely unwritten echoes or ad-libs). "
        "Mute them in lip-sync segments with `audio-segment --mute <start>-<end>`:",
        "",
        "| Start | End | Level | Near line |",
        "|---:|---:|---:|---|",
    ]
    for span in spans:
        rows.append(
            f"| {span['start']:.2f} | {span['end']:.2f} | {span['level_db']:.1f} dB | "
            f"{span['after_line'] or ''} {span['after_text'] or ''} |"
        )
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--project", required=True)
    parser.add_argument("--vocals", help="Vocal stem (default: audio/stems/vocals.wav)")
    parser.add_argument("--start", type=float, help="Only list passages after this song second")
    parser.add_argument("--end", type=float, help="Only list passages before this song second")
    parser.add_argument("--threshold-db", type=float, default=-26.0)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    project = Path(args.project).resolve()
    vocals = Path(args.vocals).resolve() if args.vocals else project / "audio" / "stems" / "vocals.wav"
    timing_path = project / "timing.effective.json"
    if not timing_path.exists():
        timing_path = project / "timing.json"
    if not vocals.exists() or not timing_path.exists():
        print(f"Needs {vocals} and timing.json.", file=sys.stderr)
        return 2
    spans = scan(vocals, json.loads(timing_path.read_text(encoding="utf-8")), threshold_db=args.threshold_db)
    spans = [
        span
        for span in spans
        if (args.start is None or span["end"] > args.start) and (args.end is None or span["start"] < args.end)
    ]
    print(json.dumps(spans, indent=2, ensure_ascii=False) if args.json else "\n".join(markdown(spans)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
