from separate_lead import pick_outputs
from timing_core import unwritten_vocal_spans

FPS = 10.0


def frames(seconds: float, voiced: list[tuple[float, float]]) -> list[float]:
    """RMS frames at FPS: 1.0 inside the voiced ranges, near silence elsewhere."""
    count = int(seconds * FPS)
    return [1.0 if any(start <= index / FPS < end for start, end in voiced) else 0.001 for index in range(count)]


def test_flags_a_sung_passage_that_no_lyric_word_covers():
    lines = [
        {"id": "l1", "text": "Ihr seid der Prompt", "words": [{"text": "Prompt", "start": 1.0, "end": 1.5}]},
        {"id": "l2", "text": "ich bin das Echo", "words": [{"text": "Echo", "start": 5.0, "end": 5.5}]},
    ]
    rms = frames(8.0, [(1.0, 1.5), (2.5, 3.2), (5.0, 5.5), (7.0, 7.1)])
    spans = unwritten_vocal_spans(rms, FPS, lines)
    assert len(spans) == 1
    assert spans[0]["start"] == 2.5
    assert spans[0]["end"] == 3.2
    assert spans[0]["after_line"] == "l1"
    assert spans[0]["level_db"] == 0.0


def test_margin_covers_held_notes_and_quiet_stems_flag_nothing():
    lines = [{"id": "l1", "text": "leer", "words": [{"text": "leer", "start": 1.0, "end": 1.5}]}]
    assert unwritten_vocal_spans(frames(3.0, [(1.0, 1.7)]), FPS, lines) == []
    assert unwritten_vocal_spans([0.0] * 30, FPS, lines) == []
    assert unwritten_vocal_spans([], FPS, lines) == []


def test_pick_outputs_maps_karaoke_stems():
    lead, backing = pick_outputs(["/w/vocals_(Vocals)_model.wav", "/w/vocals_(Instrumental)_model.wav"])
    assert lead.name == "vocals_(Vocals)_model.wav"
    assert backing.name == "vocals_(Instrumental)_model.wav"
