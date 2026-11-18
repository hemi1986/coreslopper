#!/usr/bin/env python3
"""Split a project's vocal stem into lead and backing vocals.

Writes audio/stems/lead.wav (the lead singer only) and audio/stems/backing.wav
(echoes, choirs, harmonies) with a karaoke MelBand-Roformer model through
python-audio-separator. `audio-segment` prefers lead.wav for lip-sync
segments, so a face does not mouth backing vocals.

Optional and heavy (PyTorch plus a ~900 MB model download on first use), so it
is not part of `uv sync`. Run it with an ad-hoc environment, see README.md:

    uv run --with "audio-separator[gpu]" python separate_lead.py --project ../../projects/<slug>

Listen to lead.wav before relying on it: karaoke models can move a doubled
lead line to the backing track.
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys
import tempfile
from pathlib import Path

DEFAULT_MODEL = "mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956.ckpt"
REPO_ROOT = Path(__file__).resolve().parents[2]


def ensure_ffmpeg_on_path() -> None:
    """audio-separator shells out to ffmpeg; use the workspace copy if present."""
    local = REPO_ROOT / ".tools" / "ffmpeg"
    if (local / "ffmpeg").exists() and str(local) not in os.environ.get("PATH", "").split(os.pathsep):
        os.environ["PATH"] = f"{local}{os.pathsep}{os.environ.get('PATH', '')}"


def pick_outputs(files: list[str]) -> tuple[Path, Path]:
    """Map audio-separator's output names to (lead, backing).

    A karaoke model names the lead stem "(Vocals)" and everything else
    "(Instrumental)" (or "(Karaoke)" / "(Other)", depending on the model).
    """
    lead = backing = None
    for name in files:
        lower = Path(name).name.lower()
        if "(vocals)" in lower:
            lead = Path(name)
        elif any(tag in lower for tag in ("(instrumental)", "(karaoke)", "(other)", "(no vocals)")):
            backing = Path(name)
    if lead is None or backing is None:
        raise ValueError(f"Could not tell lead and backing apart in {files}")
    return lead, backing


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--project", required=True)
    parser.add_argument("--vocals", help="Vocal stem (default: audio/stems/vocals.wav)")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="audio-separator model file name")
    parser.add_argument("--model-dir", help="Model cache directory (default: <repo>/.cache/audio-separator)")
    parser.add_argument("--out-dir", help="Output directory (default: <project>/audio/stems)")
    args = parser.parse_args()

    try:
        from audio_separator.separator import Separator
    except Exception as error:  # pragma: no cover - optional dependency
        print(
            f"python-audio-separator is not available ({error}). Run this script with\n"
            '  uv run --with "audio-separator[gpu]" python separate_lead.py --project <dir>',
            file=sys.stderr,
        )
        return 2

    ensure_ffmpeg_on_path()
    project = Path(args.project).resolve()
    vocals = Path(args.vocals).resolve() if args.vocals else project / "audio" / "stems" / "vocals.wav"
    if not vocals.exists():
        print(f"Missing vocal stem: {vocals}", file=sys.stderr)
        return 2
    out_dir = Path(args.out_dir).resolve() if args.out_dir else vocals.parent
    model_dir = Path(args.model_dir) if args.model_dir else REPO_ROOT / ".cache" / "audio-separator"
    model_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as work:
        separator = Separator(output_dir=work, model_file_dir=str(model_dir), output_format="WAV")
        separator.load_model(model_filename=args.model)
        files = [str(Path(work) / Path(name).name) for name in separator.separate(str(vocals))]
        lead, backing = pick_outputs(files)
        out_dir.mkdir(parents=True, exist_ok=True)
        shutil.move(str(lead), out_dir / "lead.wav")
        shutil.move(str(backing), out_dir / "backing.wav")
    print(f"Wrote {out_dir / 'lead.wav'} and {out_dir / 'backing.wav'} ({args.model})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
