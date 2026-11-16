"""Review notes: frame-accurate notes on a render, stored as JSON.

Pure helpers without media dependencies, so the tests run on CI without a
display or an audio device.
"""

from __future__ import annotations

import json
import os
from pathlib import Path


def format_time(seconds: float) -> str:
    """`mm:ss.mmm` for a position in the video."""
    total_ms = round(seconds * 1000)
    minutes, ms = divmod(total_ms, 60000)
    return f"{minutes:02d}:{ms // 1000:02d}.{ms % 1000:03d}"


def default_notes_path(video: Path) -> Path:
    """`review/notes/<stem>.json` for a render in a project, else a sidecar next to the video."""
    # absolute(), not resolve(): a linked renders/ (media-link) must not move the notes to the media drive
    video = video.absolute()
    if video.parent.name == "renders":
        return video.parent.parent / "review" / "notes" / f"{video.stem}.json"
    return video.with_suffix(".json")


class ReviewNotes:
    """The notes of one video; every change is written atomically."""

    def __init__(self, path: Path, video: Path, fps: float):
        self.path = path
        self.data = {"video": video.name, "fps": fps, "notes": []}
        if path.exists():
            self.data["notes"] = json.loads(path.read_text(encoding="utf-8")).get("notes", [])

    @property
    def notes(self) -> list[dict]:
        return self.data["notes"]

    def add(self, seconds: float, frame: int, text: str) -> None:
        self.notes.append({
            "frame": frame,
            "seconds": round(seconds, 3),
            "time": format_time(seconds),
            "text": text,
        })
        self.notes.sort(key=lambda note: note["frame"])
        self._save()

    def remove_last(self, frame: int) -> str | None:
        """Remove the most recent note on `frame`; returns its text."""
        for index in range(len(self.notes) - 1, -1, -1):
            if self.notes[index]["frame"] == frame:
                text = self.notes.pop(index)["text"]
                self._save()
                return text
        return None

    def for_frame(self, frame: int) -> list[str]:
        return [note["text"] for note in self.notes if note["frame"] == frame]

    def neighbor(self, frame: int, direction: int) -> int | None:
        """The frame of the next (1) or previous (-1) note, if any."""
        frames = sorted({note["frame"] for note in self.notes})
        if direction > 0:
            return next((f for f in frames if f > frame), None)
        return next((f for f in reversed(frames) if f < frame), None)

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(self.path.suffix + ".tmp")
        tmp.write_text(json.dumps(self.data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.replace(tmp, self.path)
