#!/usr/bin/env python3
"""Audio analysis for a coreslopper project.

Produces timing.json and timing.report.md from a song, its vocal stem, and the
authoritative lyrics. Heavy dependencies are imported lazily so the pure
helpers and the fixture tests can run on CPU-only CI.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import jsonschema
import yaml

from timing_core import (
    align_lines,
    build_sections,
    build_timing,
    equal_boundaries,
    estimate_section_boundaries,
    parse_lyrics,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True, help="Project directory")
    parser.add_argument("--audio", help="Mixed song path (default: <project>/audio/song.wav)")
    parser.add_argument("--vocals", help="Existing vocal stem path")
    parser.add_argument(
        "--separate",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Separate vocals with Demucs when no stem is supplied",
    )
    parser.add_argument("--device", choices=["auto", "cuda", "cpu"], default="auto")
    parser.add_argument("--demucs-model", default="htdemucs_ft")
    parser.add_argument("--whisper-model", default="large-v3")
    parser.add_argument("--skip-asr", action="store_true", help="Distribute lyric timings without WhisperX")
    parser.add_argument("--output", help="timing.json output path")
    parser.add_argument("--report", help="timing.report.md output path")
    parser.add_argument("--schema", help="JSON Schema for timing.json")
    return parser.parse_args()


def resolve_device(requested: str) -> str:
    if requested != "auto":
        return requested
    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"


def require_librosa():
    try:
        import librosa
    except Exception as error:  # pragma: no cover - depends on local install
        print(
            "librosa is not installed. Run `cd scripts/audio-analysis && uv sync` first.",
            file=sys.stderr,
        )
        raise SystemExit(2) from error
    return librosa


def load_audio(path: Path, sample_rate: int = 48_000):
    librosa = require_librosa()
    audio, sr = librosa.load(str(path), sr=sample_rate, mono=False)
    if audio.ndim == 2:
        mono = librosa.to_mono(audio)
    else:
        mono = audio
    return audio, mono, sr


def separate_vocals(audio_path: Path, output_path: Path, device: str, model: str) -> Path | None:
    try:
        import demucs.api
        import soundfile as sf
    except Exception as error:  # pragma: no cover - optional dependency
        print(f"Demucs is not available ({error}); using the mixed audio.", file=sys.stderr)
        return None
    try:
        print(f"Separating vocals with {model} on {device}...")
        separator = demucs.api.Separator(model=model, device=device)
        _origin, separated = separator.separate_audio_file(str(audio_path))
        vocals = separated["vocals"].detach().cpu().numpy()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        sf.write(str(output_path), vocals.T, separator.samplerate)
        print(f"Vocal stem written to {output_path}")
        return output_path
    except Exception as error:  # pragma: no cover - optional dependency
        print(f"Demucs separation failed ({error}); using the mixed audio.", file=sys.stderr)
        return None


def transcribe_words(vocals_path: Path, model_name: str, device: str) -> tuple[str, list[dict[str, Any]]]:
    try:
        import whisperx
    except Exception as error:  # pragma: no cover - optional dependency
        raise RuntimeError(
            "WhisperX is not installed. Run `uv sync --extra asr` or pass --skip-asr "
            "to generate section/line timings without word alignment."
        ) from error

    print(f"Transcribing {vocals_path.name} with WhisperX ({model_name}, {device})...")
    compute_type = "float16" if device == "cuda" else "int8"
    model = whisperx.load_model(model_name, device, compute_type=compute_type)
    audio = whisperx.load_audio(str(vocals_path))
    result = model.transcribe(audio, batch_size=16)
    language = result.get("language", "en")
    align_model, metadata = whisperx.load_align_model(language_code=language, device=device)
    aligned = whisperx.align(
        result.get("segments", []),
        align_model,
        metadata,
        audio,
        device,
        return_char_alignments=False,
    )
    segments: list[dict[str, Any]] = []
    for segment in aligned.get("segments", []):
        words = []
        for word in segment.get("words", []):
            if "start" in word and "end" in word:
                words.append(
                    {
                        "word": str(word.get("word", "")).strip(),
                        "start": float(word["start"]),
                        "end": float(word["end"]),
                    }
                )
        if not words:
            continue
        segments.append(
            {
                "text": str(segment.get("text", "")).strip(),
                "start": float(segment["start"]),
                "end": float(segment["end"]),
                "words": words,
            }
        )
    print(f"Aligned {len(segments)} segments.")
    return language, segments


def analyze_audio(audio_path: Path, sample_rate: int = 48_000):
    librosa = require_librosa()
    audio, mono, sr = load_audio(audio_path, sample_rate)
    duration = float(len(mono) / sr)
    print(f"Analyzing {audio_path.name}: {duration:.2f}s at {sr} Hz")

    tempo, beat_times = librosa.beat.beat_track(y=mono, sr=sr, units="time")
    tempo_value = float(tempo[0]) if hasattr(tempo, "__len__") else float(tempo)
    beats = [float(value) for value in beat_times]
    downbeats = beats[::4]

    onset_times = librosa.onset.onset_detect(y=mono, sr=sr, units="time", backtrack=False)
    onsets = [float(value) for value in onset_times]

    hop = 512
    rms = librosa.feature.rms(y=mono, frame_length=2048, hop_length=hop)[0]
    peak = float(rms.max()) if len(rms) else 1.0
    energy = [float(value) / peak if peak > 0 else 0.0 for value in rms]
    energy_fps = sr / hop

    return {
        "duration": duration,
        "sample_rate": sr,
        "bpm": tempo_value,
        "beats": beats,
        "downbeats": downbeats,
        "onsets": onsets,
        "energy": energy,
        "energy_fps": energy_fps,
        "hop": hop,
        "channels": 2 if getattr(audio, "ndim", 1) == 2 else 1,
    }


def write_report(
    path: Path,
    sections: list[dict[str, Any]],
    unmatched: list[str],
    *,
    asr_status: str,
    vocals_status: str,
    overrides_present: bool,
    bpm: float,
    duration: float,
) -> None:
    lines = [
        "# Timing Report",
        "",
        f"- Audio duration: {duration:.2f}s",
        f"- BPM: {bpm:.2f}",
        f"- ASR: {asr_status}",
        f"- Vocals: {vocals_status}",
        f"- Overrides: {'present (applied at load time by the TypeScript resolver)' if overrides_present else 'none'}",
        "",
        "## Sections",
        "",
        "| Section | Start | End | Confidence | Sources |",
        "|---|---:|---:|---:|---|",
    ]
    for section in sections:
        lines.append(
            f"| {section['label']} | {section['start']:.2f} | {section['end']:.2f} | "
            f"{section['confidence']:.2f} | {', '.join(section['sources'])} |"
        )
    lines.extend(["", "## Flags", ""])
    low = [section for section in sections if section["confidence"] < 0.7]
    if low:
        for section in low:
            lines.append(f"- Low confidence: {section['label']} ({section['confidence']:.2f}). Check this boundary.")
    else:
        lines.append("- No low-confidence section boundaries.")
    if unmatched:
        lines.append(f"- {len(unmatched)} lyric line(s) did not match a Whisper segment:")
        for line in unmatched[:20]:
            lines.append(f"  - {line}")
    else:
        lines.append("- Every lyric line matched a Whisper segment.")
    lines.extend(
        [
            "",
            "## Overrides",
            "",
            "`timing.overrides.json` is user-owned. This script never writes it. "
            "The TypeScript loader merges it over `timing.json` before validation and rendering.",
            "",
        ]
    )
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    args = parse_args()
    project = Path(args.project).resolve()
    if not project.is_dir():
        print(f"Project not found: {project}", file=sys.stderr)
        return 2
    lyrics_path = project / "lyrics.txt"
    if not lyrics_path.exists():
        print(f"Missing {lyrics_path}", file=sys.stderr)
        return 2
    parsed = parse_lyrics(lyrics_path.read_text(encoding="utf-8"))
    if not parsed:
        print("lyrics.txt contains no section tags or lyric lines.", file=sys.stderr)
        return 2

    audio_path = Path(args.audio).resolve() if args.audio else project / "audio" / "song.wav"
    if not audio_path.exists():
        print(f"Missing audio: {audio_path}", file=sys.stderr)
        return 2

    device = resolve_device(args.device)
    vocals_path = Path(args.vocals).resolve() if args.vocals else None
    if vocals_path is None and args.separate:
        vocals_path = separate_vocals(
            audio_path,
            project / "audio" / "stems" / "vocals.wav",
            device,
            args.demucs_model,
        )
    vocals_status = str(vocals_path) if vocals_path else "mixed audio (no stem)"

    analysis = analyze_audio(audio_path)
    asr_status = "skipped"
    segments: list[dict[str, Any]] = []
    if not args.skip_asr:
        try:
            language, segments = transcribe_words(vocals_path or audio_path, args.whisper_model, device)
            asr_status = f"whisperx {args.whisper_model} ({language})"
        except RuntimeError as error:
            print(f"ASR failed: {error}", file=sys.stderr)
            return 2

    boundaries, from_energy = (
        estimate_section_boundaries(
            analysis["energy"],
            analysis["energy_fps"],
            len(parsed),
            analysis["duration"],
        )
        if segments
        else (equal_boundaries(len(parsed), analysis["duration"]), False)
    )
    sections = build_sections(parsed, boundaries, analysis["energy"], analysis["energy_fps"], from_energy)
    lines, unmatched = align_lines(parsed, segments, sections, analysis["duration"])

    timing = build_timing(
        audio_path=str(audio_path.relative_to(project)) if audio_path.is_relative_to(project) else str(audio_path),
        duration=analysis["duration"],
        sample_rate=analysis["sample_rate"],
        bpm=analysis["bpm"],
        beats=analysis["beats"],
        downbeats=analysis["downbeats"],
        onsets=analysis["onsets"],
        energy=analysis["energy"],
        energy_fps=analysis["energy_fps"],
        hop=analysis["hop"],
        sections=sections,
        lines=lines,
        meta={
            "device": device,
            "demucsModel": args.demucs_model if vocals_path else None,
            "whisperModel": args.whisper_model if not args.skip_asr else None,
            "asr": asr_status,
            "channels": analysis["channels"],
        },
    )

    schema_path = Path(args.schema).resolve() if args.schema else Path.cwd() / "schema" / "timing.schema.json"
    if schema_path.exists():
        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        jsonschema.validate(timing, schema)

    output = Path(args.output).resolve() if args.output else project / "timing.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(timing, indent=2) + "\n", encoding="utf-8")
    report = Path(args.report).resolve() if args.report else project / "timing.report.md"
    report.parent.mkdir(parents=True, exist_ok=True)
    write_report(
        report,
        sections,
        unmatched,
        asr_status=asr_status,
        vocals_status=vocals_status,
        overrides_present=(project / "timing.overrides.json").exists(),
        bpm=analysis["bpm"],
        duration=analysis["duration"],
    )
    print(f"Wrote {output}")
    print(f"Wrote {report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
