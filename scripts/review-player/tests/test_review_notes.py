import json

from review_notes import ReviewNotes, default_notes_path, format_time


def test_format_time():
    assert format_time(0) == "00:00.000"
    assert format_time(8.2667) == "00:08.267"
    assert format_time(194.267) == "03:14.267"


def test_default_notes_path_in_project(tmp_path):
    video = tmp_path / "projects" / "demo" / "renders" / "preview-16x9.mp4"
    assert default_notes_path(video) == (tmp_path / "projects" / "demo" / "review" / "notes" / "preview-16x9.json")


def test_default_notes_path_keeps_linked_renders(tmp_path):
    media = tmp_path / "media" / "demo"
    media.mkdir(parents=True)
    project = tmp_path / "projects" / "demo"
    project.mkdir(parents=True)
    (project / "renders").symlink_to(media)
    assert default_notes_path(project / "renders" / "16x9.mp4") == project / "review" / "notes" / "16x9.json"


def test_default_notes_path_elsewhere(tmp_path):
    video = tmp_path / "clip.mp4"
    assert default_notes_path(video) == tmp_path / "clip.json"


def test_add_sorts_saves_and_reloads(tmp_path):
    path = tmp_path / "review" / "notes" / "preview-16x9.json"
    notes = ReviewNotes(path, tmp_path / "preview-16x9.mp4", 30.0)
    notes.add(22.067, 662, "eyes look unnatural; re-render the still")
    notes.add(8.267, 248, "cut lands late")
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["video"] == "preview-16x9.mp4"
    assert data["fps"] == 30.0
    assert [note["frame"] for note in data["notes"]] == [248, 662]
    assert data["notes"][0] == {"frame": 248, "seconds": 8.267, "time": "00:08.267", "text": "cut lands late"}

    reloaded = ReviewNotes(path, tmp_path / "preview-16x9.mp4", 30.0)
    assert reloaded.for_frame(662) == ["eyes look unnatural; re-render the still"]


def test_remove_last_and_neighbor(tmp_path):
    notes = ReviewNotes(tmp_path / "n.json", tmp_path / "v.mp4", 30.0)
    notes.add(1.0, 30, "a")
    notes.add(1.0, 30, "b")
    notes.add(3.0, 90, "c")
    assert notes.neighbor(30, 1) == 90
    assert notes.neighbor(30, -1) is None
    assert notes.neighbor(60, -1) == 30
    assert notes.remove_last(30) == "b"
    assert notes.for_frame(30) == ["a"]
    assert notes.remove_last(45) is None
