import json

from analyze import imported_vocals


def test_takes_the_stem_song_json_records(tmp_path):
    (tmp_path / "audio" / "stems").mkdir(parents=True)
    (tmp_path / "audio" / "stems" / "vocals.wav").write_bytes(b"")
    (tmp_path / "song.json").write_text(json.dumps({"vocals": "audio/stems/vocals.wav"}), encoding="utf-8")
    assert imported_vocals(tmp_path) == tmp_path / "audio" / "stems" / "vocals.wav"


def test_takes_the_stem_at_the_default_path_without_song_json(tmp_path):
    (tmp_path / "audio" / "stems").mkdir(parents=True)
    (tmp_path / "audio" / "stems" / "vocals.wav").write_bytes(b"")
    assert imported_vocals(tmp_path) == tmp_path / "audio" / "stems" / "vocals.wav"


def test_finds_no_stem_when_none_was_imported(tmp_path):
    (tmp_path / "song.json").write_text(json.dumps({"vocals": "audio/stems/vocals.wav"}), encoding="utf-8")
    assert imported_vocals(tmp_path) is None
