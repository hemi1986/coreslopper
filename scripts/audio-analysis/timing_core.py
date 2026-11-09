"""Pure timing helpers for the audio-analysis stage.

Heavy dependencies (librosa, Demucs, WhisperX) live in analyze.py. Keeping the
parsing, matching, and boundary logic here makes it testable on CPU-only CI.
"""

from __future__ import annotations

import difflib
import re
from typing import Any, Callable

SECTION_RE = re.compile(r"^\s*\[([^\]]+)\]\s*$")
SINGLETON_LABELS = {"intro", "outro", "bridge", "instrumental", "break"}


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")
    return slug or "section"


def parse_lyrics(text: str) -> list[dict[str, Any]]:
    """Parse bracketed section tags and lyric lines, preserving order."""
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


APOSTROPHES_RE = re.compile(r"[\u2019\u2018'`\u00b4]")
NON_WORD_RE = re.compile(r"[^\w ]+", re.UNICODE)

# Small number-word tables so "47" in lyrics can match "siebenundvierzig" in ASR
# output and vice versa. Only languages listed here get number normalisation.
_DE_UNITS = ["null", "eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun"]
_DE_TEENS = {10: "zehn", 11: "elf", 12: "zwölf", 13: "dreizehn", 14: "vierzehn", 15: "fünfzehn",
             16: "sechzehn", 17: "siebzehn", 18: "achtzehn", 19: "neunzehn"}
_DE_TENS = {20: "zwanzig", 30: "dreißig", 40: "vierzig", 50: "fünfzig", 60: "sechzig",
            70: "siebzig", 80: "achtzig", 90: "neunzig"}
_EN_UNITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]
_EN_TEENS = {10: "ten", 11: "eleven", 12: "twelve", 13: "thirteen", 14: "fourteen", 15: "fifteen",
             16: "sixteen", 17: "seventeen", 18: "eighteen", 19: "nineteen"}
_EN_TENS = {20: "twenty", 30: "thirty", 40: "forty", 50: "fifty", 60: "sixty",
            70: "seventy", 80: "eighty", 90: "ninety"}


def number_to_words(value: int, language: str | None) -> str | None:
    """Spell 0–99, hundreds and whole thousands as one token (no spaces)."""
    if language not in {"de", "en"} or value < 0:
        return None
    de = language == "de"
    units, teens, tens = (_DE_UNITS, _DE_TEENS, _DE_TENS) if de else (_EN_UNITS, _EN_TEENS, _EN_TENS)
    if value < 10:
        return units[value]
    if value < 20:
        return teens[value]
    if value < 100:
        ten, unit = divmod(value, 10)
        if unit == 0:
            return tens[ten * 10]
        if de:
            return ("ein" if unit == 1 else units[unit]) + "und" + tens[ten * 10]
        return tens[ten * 10] + units[unit]
    if value < 1000 and value % 100 == 0:
        head = value // 100
        if de:
            return ("ein" if head == 1 else units[head]) + "hundert"
        return units[head] + "hundred"
    if value < 1_000_000 and value % 1000 == 0:
        head = number_to_words(value // 1000, language)
        if head is None:
            return None
        if de:
            return ("ein" if value // 1000 == 1 else head) + "tausend"
        return head + "thousand"
    return None


def normalize_text(value: str) -> str:
    """Lowercase, drop apostrophes and punctuation, keep letters of any script (ä, ö, ü, ß, é…)."""
    value = APOSTROPHES_RE.sub("", value.lower())
    value = NON_WORD_RE.sub(" ", value).replace("_", " ")
    return re.sub(r"\s+", " ", value).strip()


def normalize_token(token: str, language: str | None = None) -> str:
    """Normalise one word for matching; spells digits out for known languages."""
    value = normalize_text(token).replace(" ", "")
    if value.isdigit():
        spelled = number_to_words(int(value), language)
        if spelled:
            return spelled
    return value


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


# ---------------------------------------------------------------------------
# Lyrics-first alignment
#
# The lyrics are authoritative; ASR only supplies timestamps. Lyric words are
# anchored to ASR words with an order-preserving alignment, so repeated
# choruses cannot swap places. Section boundaries are derived from the aligned
# lines (snapped to downbeats), not guessed from energy alone.
# ---------------------------------------------------------------------------

DIRECTION_RE = re.compile(r"^\(([^)]*)\)\s*(.*)$")
SECONDS_PER_WORD = 0.45


def split_lyric_entries(
    parsed: list[dict[str, Any]], language: str | None = None
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Split parsed lyrics into timed lines and untimed stage directions.

    - "(Vibration.)" alone on a line is a cue, not a lyric line.
    - "(Spoken) Hallo." is a spoken line with direction "Spoken".
    """
    entries: list[dict[str, Any]] = []
    cues: list[dict[str, Any]] = []
    for section in parsed:
        for raw in section["lines"]:
            match = DIRECTION_RE.match(raw)
            if match and not match.group(2).strip():
                cues.append({"section": section["id"], "text": match.group(1).strip(), "after": len(entries)})
                continue
            text = match.group(2).strip() if match else raw
            tokens = [token for token in text.split() if normalize_token(token, language)]
            if not tokens:
                cues.append({"section": section["id"], "text": raw, "after": len(entries)})
                continue
            direction = match.group(1).strip() if match else None
            entries.append(
                {
                    "section": section["id"],
                    "text": text,
                    "kind": "spoken" if direction and "spoken" in direction.lower() else "sung",
                    "direction": direction,
                    "tokens": tokens,
                    "norm": [normalize_token(token, language) for token in tokens],
                }
            )
    return entries, cues


def token_similarity(left: str, right: str) -> float:
    if left == right:
        return 1.0
    return difflib.SequenceMatcher(None, left, right).ratio()


def align_tokens(
    lyric: list[str],
    asr: list[str],
    *,
    min_similarity: float = 0.6,
    gap: float = -0.35,
) -> dict[int, int]:
    """Order-preserving (Needleman–Wunsch) alignment of normalised tokens.

    Returns {lyric_index: asr_index} for matched pairs only. Lyric words that
    were not sung, and ASR words that are not in the lyrics, are skipped.
    """
    rows, cols = len(lyric), len(asr)
    if rows == 0 or cols == 0:
        return {}
    score = [[0.0] * (cols + 1) for _ in range(rows + 1)]
    back = [[0] * (cols + 1) for _ in range(rows + 1)]
    for i in range(1, rows + 1):
        score[i][0] = gap * i
        back[i][0] = 1
    for j in range(1, cols + 1):
        score[0][j] = gap * j
        back[0][j] = 2
    sims = [[token_similarity(lyric[i], asr[j]) for j in range(cols)] for i in range(rows)]
    for i in range(1, rows + 1):
        row, prev = score[i], score[i - 1]
        for j in range(1, cols + 1):
            sim = sims[i - 1][j - 1]
            diagonal = prev[j - 1] + (sim * 2 - 0.8 if sim >= min_similarity else -1.0)
            up = prev[j] + gap
            left = row[j - 1] + gap
            best = max(diagonal, up, left)
            row[j] = best
            back[i][j] = 0 if best == diagonal else (1 if best == up else 2)
    matches: dict[int, int] = {}
    i, j = rows, cols
    while i > 0 and j > 0:
        move = back[i][j]
        if move == 0:
            if sims[i - 1][j - 1] >= min_similarity:
                matches[i - 1] = j - 1
            i, j = i - 1, j - 1
        elif move == 1:
            i -= 1
        else:
            j -= 1
    return matches


def anchor_entries(
    entries: list[dict[str, Any]],
    asr_words: list[dict[str, Any]],
    duration: float,
    language: str | None = None,
) -> None:
    """Attach ASR anchors and a search window (ws/we) to every lyric line in place."""
    asr = sorted(
        (word for word in asr_words if normalize_token(str(word.get("word", "")), language)),
        key=lambda word: float(word["start"]),
    )
    flat = [(line_index, token_index) for line_index, entry in enumerate(entries) for token_index in range(len(entry["norm"]))]
    matches = align_tokens(
        [entries[line_index]["norm"][token_index] for line_index, token_index in flat],
        [normalize_token(str(word["word"]), language) for word in asr],
    )
    for entry in entries:
        entry["anchors"] = {}
    for flat_index, asr_index in matches.items():
        line_index, token_index = flat[flat_index]
        word = asr[asr_index]
        entries[line_index]["anchors"][token_index] = {"start": float(word["start"]), "end": float(word["end"])}

    for entry in entries:
        anchors = entry["anchors"]
        count = len(entry["tokens"])
        entry["matched"] = len(anchors) / max(1, count)
        entry["placed"] = not anchors
        if anchors:
            first, last = min(anchors), max(anchors)
            entry["ws"] = anchors[first]["start"] - SECONDS_PER_WORD * first - 0.25
            entry["we"] = anchors[last]["end"] + SECONDS_PER_WORD * (count - 1 - last) + 0.25

    # Lines with no anchor go into the gap after the previous anchored line.
    for index, entry in enumerate(entries):
        if "ws" in entry:
            continue
        previous_end = next((entries[k]["we"] for k in range(index - 1, -1, -1) if "ws" in entries[k]), 0.0)
        next_start = next((entries[k]["ws"] for k in range(index + 1, len(entries)) if "ws" in entries[k]), duration)
        entry["ws"] = previous_end
        entry["we"] = max(previous_end + 0.1, min(next_start, previous_end + SECONDS_PER_WORD * len(entry["tokens"]) + 0.5))

    # Clamp windows to the song and split overlaps between neighbours without crossing anchors.
    for index, entry in enumerate(entries):
        entry["ws"] = max(0.0, entry["ws"])
        entry["we"] = min(duration, max(entry["we"], entry["ws"] + 0.1))
        if index == 0:
            continue
        previous = entries[index - 1]
        if entry["ws"] < previous["we"]:
            middle = (entry["ws"] + previous["we"]) / 2
            previous_anchor = max((a["end"] for a in previous["anchors"].values()), default=previous["ws"])
            current_anchor = min((a["start"] for a in entry["anchors"].values()), default=entry["we"])
            middle = min(max(middle, previous_anchor), current_anchor)
            previous["we"], entry["ws"] = middle, middle


def finalize_entry_words(entry: dict[str, Any], forced: list[dict[str, Any]] | None = None) -> None:
    """Combine forced-alignment words, ASR anchors, and interpolation into word times.

    `forced` is an optional list with one dict per token (start/end/score) from a
    forced aligner run inside the line's window. Anchors win when the forced
    result disagrees by more than 0.8 s. Sets entry["words"], ["start"],
    ["end"], ["confidence"].
    """
    count = len(entry["tokens"])
    times: list[list[float] | None] = [None] * count
    scores: list[float] = []
    if forced and len(forced) == count:
        for index, word in enumerate(forced):
            if "start" in word and "end" in word:
                times[index] = [float(word["start"]), float(word["end"])]
                scores.append(float(word.get("score", 0.5)))
    for index, anchor in entry["anchors"].items():
        if times[index] is None or abs(times[index][0] - anchor["start"]) > 0.8:
            times[index] = [anchor["start"], anchor["end"]]

    known = [index for index in range(count) if times[index] is not None]
    for index in range(count):
        if times[index] is not None:
            continue
        low = max((k for k in known if k < index), default=None)
        high = min((k for k in known if k > index), default=None)
        span_low = low if low is not None else -1
        span_high = high if high is not None else count
        slots = span_high - span_low - 1
        left = times[low][1] if low is not None else entry["ws"]
        right = times[high][0] if high is not None else entry["we"]
        # Leading/trailing words without a timestamp get a typical word length
        # instead of being stretched across the window padding.
        if high is None and low is not None:
            right = min(right, left + SECONDS_PER_WORD * slots)
        if low is None and high is not None:
            left = max(left, right - SECONDS_PER_WORD * slots)
        if right < left:
            right = left + 0.05
        step = (right - left) / slots
        position = index - span_low - 1
        times[index] = [left + step * position, left + step * (position + 1)]

    resolved = [value for value in times if value is not None]
    for index in range(1, count):
        if resolved[index][0] < resolved[index - 1][0]:
            resolved[index][0] = resolved[index - 1][1]
    for value in resolved:
        value[1] = max(value[1], value[0] + 0.04)

    forced_ratio = len(scores) / max(1, count)
    mean_score = sum(scores) / len(scores) if scores else 0.0
    confidence = min(0.99, 0.15 + 0.55 * entry["matched"] + 0.3 * mean_score * forced_ratio)
    if entry["placed"]:
        confidence = min(confidence, 0.2)
    entry["confidence"] = round(confidence, 3)
    entry["words"] = [
        {"text": token, "start": round(start, 3), "end": round(end, 3)}
        for token, (start, end) in zip(entry["tokens"], resolved)
    ]
    entry["start"] = entry["words"][0]["start"]
    entry["end"] = entry["words"][-1]["end"]


def remove_line_overlaps(entries: list[dict[str, Any]]) -> None:
    for previous, current in zip(entries, entries[1:]):
        if previous["end"] > current["start"]:
            cut = current["start"]
            previous["end"] = cut
            for word in previous["words"]:
                word["end"] = min(word["end"], cut)
                word["start"] = min(word["start"], max(cut - 0.04, 0.0))


def _energy_rise(energy: list[float], fps: float, time: float, window: float = 1.0) -> float:
    index = int(time * fps)
    width = int(window * fps)
    if width <= 0 or index - width < 0 or index + width >= len(energy):
        return 0.0
    after = energy[index : index + width]
    before = energy[index - width : index]
    return sum(after) / len(after) - sum(before) / len(before)


def pick_downbeats(beats: list[float], energy: list[float], fps: float, meter: int = 4) -> tuple[list[float], int]:
    """Choose the bar phase whose beats carry the most energy; returns (downbeats, phase)."""
    if not beats:
        return [], 0
    if not energy or fps <= 0:
        return beats[::meter], 0

    def energy_at(time: float) -> float:
        return energy[min(len(energy) - 1, max(0, int(time * fps)))]

    scores = []
    for phase in range(min(meter, len(beats))):
        values = [energy_at(time) for time in beats[phase::meter]]
        scores.append(sum(values) / len(values))
    phase = max(range(len(scores)), key=lambda index: scores[index])
    return beats[phase::meter], phase


def sections_from_lines(
    parsed: list[dict[str, Any]],
    entries: list[dict[str, Any]],
    downbeats: list[float],
    energy: list[float],
    fps: float,
    duration: float,
) -> list[dict[str, Any]]:
    """Place each section boundary on a downbeat between two sections' lyrics.

    Sections without lyrics (e.g. an instrumental [Break]) share the gap with
    their neighbours. Confidence: 0.85 on a downbeat with an energy rise, 0.7 on
    a plain downbeat, 0.55 when no downbeat falls into the gap.
    """
    order = [section["id"] for section in parsed]
    spans: dict[str, tuple[float, float]] = {}
    for entry in entries:
        low, high = spans.get(entry["section"], (float("inf"), float("-inf")))
        spans[entry["section"]] = (min(low, entry["start"]), max(high, entry["end"]))

    # Give lyric-less sections a span inside the neighbouring gap.
    for index, section_id in enumerate(order):
        if section_id in spans:
            continue
        previous_end = next((spans[order[k]][1] for k in range(index - 1, -1, -1) if order[k] in spans), 0.0)
        next_start = next((spans[order[k]][0] for k in range(index + 1, len(order)) if order[k] in spans), duration)
        middle = (previous_end + next_start) / 2
        spans[section_id] = (middle, middle)

    boundaries = [0.0]
    confidences = [0.9]
    for index in range(1, len(order)):
        low = max(spans[order[index - 1]][1], boundaries[-1])
        high = max(spans[order[index]][0], low)
        candidates = [beat for beat in downbeats if low - 0.3 <= beat <= high + 0.15]
        if candidates:
            best = max(candidates, key=lambda beat: _energy_rise(energy, fps, beat))
            confidence = 0.85 if _energy_rise(energy, fps, best) > 0.05 else 0.7
        else:
            best = max(low, high - 0.1) if high - low > 0.2 else (low + high) / 2
            confidence = 0.55
        best = min(max(best, low), high)
        boundaries.append(round(best, 4))
        confidences.append(confidence)
    boundaries.append(round(duration, 4))
    confidences.append(0.9)

    labels = {section["id"]: section["label"] for section in parsed}
    return [
        {
            "id": section_id,
            "label": labels[section_id],
            "start": boundaries[index],
            "end": boundaries[index + 1],
            "confidence": round(min(confidences[index], confidences[index + 1]), 3),
            "sources": ["tag", "lyrics-alignment", "downbeat", "energy"],
        }
        for index, section_id in enumerate(order)
    ]


def align_lyrics(
    parsed: list[dict[str, Any]],
    asr_words: list[dict[str, Any]],
    *,
    duration: float,
    beats: list[float],
    energy: list[float],
    energy_fps: float,
    language: str | None = None,
    forced_aligner: Callable[[list[str], float, float], list[dict[str, Any]] | None] | None = None,
) -> dict[str, Any]:
    """Lyrics-first alignment. Returns lines, sections, downbeats, cues, unmatched, meta.

    `asr_words` is a flat list of {"word", "start", "end"} from ASR of the vocal
    stem. `forced_aligner(norm_tokens, window_start, window_end)` optionally
    refines word times inside each line's window and returns one dict per token.
    """
    entries, cues = split_lyric_entries(parsed, language)
    anchor_entries(entries, asr_words, duration, language)
    for entry in entries:
        forced = forced_aligner(entry["norm"], entry["ws"], entry["we"]) if forced_aligner else None
        finalize_entry_words(entry, forced)
    remove_line_overlaps(entries)

    downbeats, phase = pick_downbeats(beats, energy, energy_fps)
    sections = sections_from_lines(parsed, entries, downbeats, energy, energy_fps, duration)
    by_id = {section["id"]: section for section in sections}

    lines: list[dict[str, Any]] = []
    for index, entry in enumerate(entries):
        section = by_id[entry["section"]]
        for word in entry["words"]:
            word["start"] = round(min(max(word["start"], section["start"]), section["end"]), 3)
            word["end"] = round(min(max(word["end"], word["start"]), section["end"]), 3)
        lines.append(
            {
                "id": f"l{index + 1}",
                "section": entry["section"],
                "start": entry["words"][0]["start"],
                "end": entry["words"][-1]["end"],
                "text": entry["text"],
                "words": entry["words"],
            }
        )

    timed_cues = []
    for cue in cues:
        section = by_id[cue["section"]]
        previous = entries[cue["after"] - 1] if cue["after"] > 0 else None
        at = previous["end"] if previous and previous["section"] == cue["section"] else section["start"]
        timed_cues.append({"section": cue["section"], "text": cue["text"], "at": round(at, 3), "approx": True})

    return {
        "lines": lines,
        "sections": sections,
        "downbeats": [round(value, 4) for value in downbeats],
        "cues": timed_cues,
        "unmatched": [entry["text"] for entry in entries if entry["placed"]],
        "meta": {
            "alignment": "lyrics-first: order-preserving token alignment to ASR, optional forced alignment per line",
            "downbeatPhase": phase,
            "lineKinds": {f"l{i + 1}": entry["kind"] for i, entry in enumerate(entries)},
            "lineDirections": {f"l{i + 1}": entry["direction"] for i, entry in enumerate(entries) if entry["direction"]},
            "lineConfidence": {f"l{i + 1}": entry["confidence"] for i, entry in enumerate(entries)},
            "cues": timed_cues,
        },
    }


def distribute_lines(
    parsed: list[dict[str, Any]], sections: list[dict[str, Any]], language: str | None = None
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Fallback without ASR: spread each section's lyric lines evenly across it."""
    entries, cues = split_lyric_entries(parsed, language)
    by_id = {section["id"]: section for section in sections}
    per_section: dict[str, list[dict[str, Any]]] = {}
    for entry in entries:
        per_section.setdefault(entry["section"], []).append(entry)
    lines: list[dict[str, Any]] = []
    for entry in entries:
        section = by_id[entry["section"]]
        siblings = per_section[entry["section"]]
        step = (section["end"] - section["start"]) / len(siblings)
        start = section["start"] + step * siblings.index(entry)
        end = start + step * 0.85
        lines.append(
            {
                "id": f"l{len(lines) + 1}",
                "section": entry["section"],
                "start": round(start, 4),
                "end": round(end, 4),
                "text": entry["text"],
                "words": distribute_words(entry["text"], start, end),
            }
        )
    return lines, cues
