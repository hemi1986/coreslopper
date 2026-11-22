"""transcribe.py decodes the audio itself, so faster-whisper never touches PyAV."""

from __future__ import annotations

import json
import sys
import types
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import transcribe  # noqa: E402


def test_load_speech_is_mono_16k_float32(tmp_path: Path) -> None:
    path = tmp_path / "take.wav"
    stereo = np.zeros((48_000, 2), dtype="float32")  # 1 s at 48 kHz
    sf.write(path, stereo, 48_000)
    audio = transcribe.load_speech(str(path))
    assert audio.dtype == np.float32
    assert audio.ndim == 1
    assert abs(len(audio) - 16_000) <= 1


def test_main_passes_samples_not_a_path(tmp_path: Path, monkeypatch, capsys) -> None:
    path = tmp_path / "take.wav"
    sf.write(path, np.zeros(16_000, dtype="float32"), 16_000)
    seen = {}

    class FakeModel:
        def __init__(self, *_args, **_kwargs) -> None:
            pass

        def transcribe(self, audio, **_kwargs):
            seen["audio"] = audio
            return [types.SimpleNamespace(text=" Hallo ")], None

    monkeypatch.setitem(sys.modules, "faster_whisper", types.SimpleNamespace(WhisperModel=FakeModel))
    monkeypatch.setattr(sys, "argv", ["transcribe.py", str(path), "--device", "cpu"])
    assert transcribe.main() == 0
    assert isinstance(seen["audio"], np.ndarray)
    assert json.loads(capsys.readouterr().out) == {"text": "Hallo"}
