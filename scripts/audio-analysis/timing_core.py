"""Pure timing helpers for the audio-analysis stage.

Heavy dependencies (librosa, Demucs, WhisperX) live in analyze.py. Keeping the
parsing, matching, and boundary logic here makes it testable on CPU-only CI.
"""

from __future__ import annotations

import difflib
import re
from typing import Any

SECTION_RE = re.compile(r"^\s*\[([^\]]+)\]\s*$")
SINGLETON_LABELS = {"intro", "outro", "bridge", "instrumental", "break"}


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")
    return slug or "section"


def parse_lyrics(text: str) -> list[dict[str, Any]]:
    """Parse Suno-style section tags and lyric lines, preserving order."""
    sections: list[dict[str, Any]] = []
    used: set[str] = set()
    current: dict[str, Any] | None = None
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        match = SECTION_RE.match(line)
        if match:
            label = match.group(1).strip()
            base = slugify(label)
            if base in SINGLETON_LABELS or re.search(r"_\d+$", base):
                candidate = base
            else:
                candidate = f"{base}_1"
            if candidate in used:
                stem = re.sub(r"_\d+$", "", base)
                index = 2
                while f"{stem}_{index}" in used:
                    index += 1
                section_id = f"{stem}_{index}"
            else:
                section_id = candidate
            used.add(section_id)
            current = {"id": section_id, "label": label, "lines": []}
            sections.append(current)
        else:
            if current is None:
                current = {"id": "unlabeled", "label": "Unlabeled", "lines": []}
                sections.append(current)
            current["lines"].append(line)
    return sections


def normalize_text(value: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", "", value.lower()).strip()


def similarity(left: str, right: str) -> float:
    return difflib.SequenceMatcher(None, normalize_text(left), normalize_text(right)).ratio()


def distribute_words(text: str, start: float, end: float) -> list[dict[str, Any]]:
    """Distribute a line's words across its duration, weighted by word length."""
    words = [word for word in text.split() if word]
    if not words:
        return []
    duration = max(0.05, end - start)
    weights = [max(1, len(word)) for word in words]
    total = sum(weights)
    cursor = start
    result: list[dict[str, Any]] = []
    for word, weight in zip(words, weights):
        span = duration * weight / total
        result.append({"text": word, "start": round(cursor, 4), "end": round(cursor + span, 4)})
        cursor += span
    return result


def equal_boundaries(section_count: int, duration: float) -> list[float]:
    if section_count <= 1:
        return [0.0, duration]
    step = duration / section_count
    return [round(index * step, 4) for index in range(section_count + 1)]


def estimate_section_boundaries(
    energy: list[float],
    fps: float,
    section_count: int,
    duration: float,
) -> tuple[list[float], bool]:
    """Find section boundaries from energy changes.

    Returns (boundaries, from_energy). Boundaries always start at 0 and end at
    duration. Falls back to equal division when there are not enough strong
    changes.
    """
    if section_count <= 1:
        return [0.0, duration], False

    if len(energy) < 4 or fps <= 0:
        return equal_boundaries(section_count, duration), False

    window = max(1, int(fps * 0.5))
    smoothed: list[float] = []
    for index in range(len(energy)):
        start = max(0, index - window)
        end = min(len(energy), index + window + 1)
        smoothed.append(sum(energy[start:end]) / (end - start))

    changes = [0.0] + [abs(smoothed[index] - smoothed[index - 1]) for index in range(1, len(smoothed))]
    min_gap = max(1, int(fps * 2.0))
    candidates = sorted(range(1, len(changes) - 1), key=lambda index: changes[index], reverse=True)
    chosen: list[int] = []
    for index in candidates:
        if len(chosen) >= section_count - 1:
            break
        if all(abs(index - other) >= min_gap for other in chosen):
            chosen.append(index)
    from_energy = len(chosen) == section_count - 1
    if not from_energy:
        return equal_boundaries(section_count, duration), False

    times = sorted(index / fps for index in chosen)
    return [0.0, *[round(value, 4) for value in times], round(duration, 4)], True


def build_sections(
    parsed: list[dict[str, Any]],
    boundaries: list[float],
    energy: list[float],
    fps: float,
    from_energy: bool,
) -> list[dict[str, Any]]:
    sections: list[dict[str, Any]] = []
    for index, section in enumerate(parsed):
        start = boundaries[index]
        end = boundaries[index + 1]
        confidence = 0.9 if from_energy else 0.55
        if energy and fps > 0:
            window_start = max(0, int(start * fps))
            window_end = min(len(energy), max(window_start + 1, int(end * fps)))
            values = energy[window_start:window_end]
            if values:
                contrast = max(values) - min(values)
                confidence = min(0.99, confidence + contrast * 0.1)
        sections.append(
            {
                "id": section["id"],
                "label": section["label"],
                "start": round(start, 4),
                "end": round(end, 4),
                "confidence": round(confidence, 3),
                "sources": ["tag", "energy"] if from_energy else ["tag"],
            }
        )
    return sections


def align_lines(
    parsed: list[dict[str, Any]],
    segments: list[dict[str, Any]],
    sections: list[dict[str, Any]],
    duration: float,
) -> tuple[list[dict[str, Any]], list[str]]:
    """Align parsed lyric lines to Whisper segments; only timestamps are used."""
    lines: list[dict[str, Any]] = []
    unmatched: list[str] = []
    used: set[int] = set()
    section_index = 0
    for section in parsed:
        section_id = section["id"]
        section_def = next((item for item in sections if item["id"] == section_id), None)
        section_start = section_def["start"] if section_def else 0.0
        section_end = section_def["end"] if section_def else duration
        step = (section_end - section_start) / max(1, len(section["lines"]))
        for line_index, text in enumerate(section["lines"]):
            best_index = -1
            best_score = 0.0
            for candidate_index, segment in enumerate(segments):
                if candidate_index in used:
                    continue
                score = similarity(text, str(segment.get("text", "")))
                if score > best_score:
                    best_score = score
                    best_index = candidate_index
            if best_index >= 0 and best_score >= 0.45:
                segment = segments[best_index]
                used.add(best_index)
                start = float(segment["start"])
                end = float(segment["end"])
                words = segment.get("words") or []
                lyric_words = text.split()
                if len(words) == len(lyric_words):
                    timed_words = [
                        {"text": word, "start": float(item["start"]), "end": float(item["end"])}
                        for word, item in zip(lyric_words, words)
                    ]
                else:
                    timed_words = distribute_words(text, start, end)
            else:
                start = section_start + step * line_index
                end = start + step * 0.85
                timed_words = distribute_words(text, start, end)
                unmatched.append(text)
            lines.append(
                {
                    "id": f"l{len(lines) + 1}",
                    "section": section_id,
                    "start": round(start, 4),
                    "end": round(end, 4),
                    "text": text,
                    "words": timed_words,
                }
            )
        section_index += 1

    # Snap section boundaries to the nearest line start when it is close.
    for index in range(1, len(sections)):
        boundary = sections[index]["start"]
        nearest = min((line["start"] for line in lines), key=lambda value: abs(value - boundary), default=None)
        if nearest is not None and abs(nearest - boundary) <= 1.0:
            sections[index]["start"] = nearest
            sections[index - 1]["end"] = nearest
    return lines, unmatched


def build_timing(
    *,
    audio_path: str,
    duration: float,
    sample_rate: int,
    bpm: float,
    beats: list[float],
    downbeats: list[float],
    onsets: list[float],
    energy: list[float],
    energy_fps: float,
    hop: int,
    sections: list[dict[str, Any]],
    lines: list[dict[str, Any]],
    meta: dict[str, Any],
) -> dict[str, Any]:
    return {
        "version": 1,
        "audio": {"path": audio_path, "duration": round(duration, 4), "sampleRate": sample_rate},
        "bpm": round(bpm, 3),
        "beats": [round(value, 4) for value in beats],
        "downbeats": [round(value, 4) for value in downbeats],
        "onsets": [round(value, 4) for value in onsets],
        "energy": {"hop": hop, "fps": round(energy_fps, 4), "values": [round(value, 5) for value in energy]},
        "sections": sections,
        "lines": lines,
        "meta": meta,
    }
