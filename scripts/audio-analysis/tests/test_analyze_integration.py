import json
import subprocess
import sys
from pathlib import Path

import jsonschema
import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]


def test_analyze_script_writes_schema_valid_timing(tmp_path):
    soundfile = pytest.importorskip("soundfile")
    lyrics = tmp_path / "lyrics.txt"
    lyrics.write_text("[Intro]\nNeon rain\n[Verse 1]\nCity lights are calling\n", encoding="utf-8")

    sample_rate = 48_000
    duration = 4.0
    t = np.arange(int(sample_rate * duration)) / sample_rate
    beat = 60 / 120
    signal = 0.2 * np.sin(2 * np.pi * 55 * t) + 0.1 * np.sin(2 * np.pi * 220 * t)
    signal += 0.4 * np.exp(-((t % beat) * 20)) * np.sin(2 * np.pi * 60 * (t % beat))
    audio = tmp_path / "song.wav"
    soundfile.write(str(audio), np.column_stack([signal, signal]), sample_rate)

    output = tmp_path / "timing.json"
    report = tmp_path / "timing.md"
    schema = REPO / "schema" / "timing.schema.json"
    subprocess.run(
        [
            sys.executable,
            str(ROOT / "analyze.py"),
            "--project",
            str(tmp_path),
            "--audio",
            str(audio),
            "--no-separate",
            "--skip-asr",
            "--output",
            str(output),
            "--report",
            str(report),
            "--schema",
            str(schema),
        ],
        check=True,
        capture_output=True,
        text=True,
    )

    timing = json.loads(output.read_text(encoding="utf-8"))
    jsonschema.validate(timing, json.loads(schema.read_text(encoding="utf-8")))
    assert timing["version"] == 1
    assert timing["audio"]["duration"] == pytest.approx(duration, abs=0.05)
    assert timing["sections"][0]["start"] == 0
    assert timing["sections"][-1]["end"] == pytest.approx(duration, abs=0.05)
    assert report.exists()
    assert "## Sections" in report.read_text(encoding="utf-8")
