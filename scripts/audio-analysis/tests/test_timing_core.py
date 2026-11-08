from timing_core import (
    align_lines,
    build_sections,
    build_timing,
    distribute_words,
    estimate_section_boundaries,
    parse_lyrics,
)


def test_parse_lyrics_preserves_order_and_dedupes_sections():
    parsed = parse_lyrics(
        """
[Intro]
Neon rain

[Verse 1]
City lights are calling

[Chorus]
We are electric

[Chorus]
Run through the rain

[Outro]
Neon hearts
"""
    )
    assert [section["id"] for section in parsed] == [
        "intro",
        "verse_1",
        "chorus_1",
        "chorus_2",
        "outro",
    ]
    assert parsed[1]["lines"] == ["City lights are calling"]


def test_distribute_words_covers_the_line_without_gaps():
    words = distribute_words("City lights are calling", 2.0, 4.0)
    assert [word["text"] for word in words] == ["City", "lights", "are", "calling"]
    assert words[0]["start"] == 2.0
    assert words[-1]["end"] == 4.0
    for left, right in zip(words, words[1:]):
        assert left["end"] <= right["start"] + 1e-9


def test_energy_boundaries_find_step_changes():
    fps = 10
    energy = [0.2] * 20 + [0.8] * 20 + [0.3] * 20
    boundaries, from_energy = estimate_section_boundaries(energy, fps, 3, 6.0)
    assert from_energy is True
    assert len(boundaries) == 4
    assert 1.5 <= boundaries[1] <= 2.5
    assert 3.5 <= boundaries[2] <= 4.5


def test_build_sections_and_lines_cover_the_song():
    parsed = parse_lyrics("[Intro]\nNeon rain\n[Verse 1]\nCity lights are calling\n")
    energy = [0.2] * 20 + [0.8] * 20
    boundaries, from_energy = estimate_section_boundaries(energy, 10, 2, 4.0)
    sections = build_sections(parsed, boundaries, energy, 10, from_energy)
    assert sections[0]["start"] == 0.0
    assert sections[-1]["end"] == 4.0
    lines, unmatched = align_lines(
        parsed,
        [
            {"text": "Neon rain", "start": 0.5, "end": 1.5, "words": [
                {"word": "Neon", "start": 0.5, "end": 0.9},
                {"word": "rain", "start": 1.0, "end": 1.5},
            ]},
            {"text": "City lights are calling", "start": 2.0, "end": 3.8, "words": []},
        ],
        sections,
        4.0,
    )
    assert len(lines) == 2
    assert unmatched == []
    assert lines[0]["words"][0]["text"] == "Neon"


def test_build_timing_has_the_expected_shape():
    timing = build_timing(
        audio_path="audio/song.wav",
        duration=4.0,
        sample_rate=48_000,
        bpm=120,
        beats=[0, 0.5, 1.0],
        downbeats=[0, 2.0],
        onsets=[0, 0.5],
        energy=[0.1, 0.2],
        energy_fps=10,
        hop=512,
        sections=[{"id": "intro", "label": "Intro", "start": 0, "end": 4, "confidence": 0.9, "sources": ["tag"]}],
        lines=[],
        meta={"test": True},
    )
    assert timing["version"] == 1
    assert timing["audio"]["duration"] == 4.0
    assert timing["sections"][0]["id"] == "intro"
