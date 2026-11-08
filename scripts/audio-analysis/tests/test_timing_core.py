from timing_core import (
    align_lyrics,
    align_tokens,
    build_sections,
    build_timing,
    distribute_words,
    distribute_lines,
    estimate_section_boundaries,
    normalize_text,
    normalize_token,
    parse_lyrics,
    pick_downbeats,
    split_lyric_entries,
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
    lines, cues = distribute_lines(parsed, sections)
    assert len(lines) == 2
    assert cues == []
    assert lines[0]["words"][0]["text"] == "Neon"
    assert sections[1]["start"] <= lines[1]["start"] < lines[1]["end"] <= sections[1]["end"]


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


def asr(words, start=0.0, step=0.4):
    """Fake ASR word list: one word every `step` seconds starting at `start`."""
    out = []
    for index, word in enumerate(words.split()):
        t = start + index * step
        out.append({"word": word, "start": round(t, 3), "end": round(t + step * 0.8, 3)})
    return out


def test_normalize_keeps_umlauts_and_drops_apostrophes():
    assert normalize_text("Gefällt mir – nicht!") == "gefällt mir nicht"
    assert normalize_token("lad’") == "lad"
    assert normalize_token("Größe,") == "größe"
    assert normalize_token("47", "de") == "siebenundvierzig"
    assert normalize_token("3000", "de") == "dreitausend"
    assert normalize_token("21", "en") == "twentyone"
    assert normalize_token("47") == "47"


def test_split_lyric_entries_separates_cues_and_spoken_lines():
    parsed = parse_lyrics("[Intro]\n(Vibration.)\n(Spoken) Hallo du\n[Verse 1]\nZeile eins\n")
    entries, cues = split_lyric_entries(parsed, "de")
    assert [entry["text"] for entry in entries] == ["Hallo du", "Zeile eins"]
    assert entries[0]["kind"] == "spoken"
    assert entries[1]["kind"] == "sung"
    assert cues == [{"section": "intro", "text": "Vibration.", "after": 0}]


def test_align_tokens_preserves_order_and_skips_extras():
    lyric = ["a", "b", "c", "d"]
    sung = ["x", "a", "b", "y", "d"]
    assert align_tokens(lyric, sung) == {0: 1, 1: 2, 3: 4}


def test_repeated_chorus_lines_keep_their_own_occurrence():
    # The old matcher picked the best segment anywhere in the song, so chorus 2
    # could land on chorus 1. Order-preserving alignment must keep them apart.
    lyrics = (
        "[Chorus]\nGefällt mir nicht\n"
        "[Verse 1]\nDer Kaffee wird kalt\n"
        "[Chorus]\nGefällt mir nicht\n"
    )
    parsed = parse_lyrics(lyrics)
    words = asr("gefällt mir nicht", start=1.0) + asr("der kaffee wird kalt", start=5.0) + asr(
        "gefallt mir nicht", start=10.0
    )
    beats = [index * 0.5 for index in range(32)]
    result = align_lyrics(parsed, words, duration=16.0, beats=beats, energy=[0.5] * 160, energy_fps=10, language="de")
    lines = result["lines"]
    assert [line["section"] for line in lines] == ["chorus_1", "verse_1", "chorus_2"]
    assert abs(lines[0]["start"] - 1.0) < 0.05
    assert abs(lines[2]["start"] - 10.0) < 0.05
    assert lines[2]["text"] == "Gefällt mir nicht"  # lyrics text wins over ASR spelling
    assert result["unmatched"] == []


def test_sections_follow_lyrics_and_cover_the_song():
    parsed = parse_lyrics("[Intro]\n(Vibration.)\n[Verse 1]\nEins zwei drei\n[Chorus]\nVier fünf sechs\n[Outro]\n")
    words = asr("eins zwei drei", start=8.2) + asr("vier fünf sechs", start=20.1)
    beats = [index * 0.5 for index in range(60)]
    result = align_lyrics(parsed, words, duration=30.0, beats=beats, energy=[0.5] * 300, energy_fps=10, language="de")
    sections = result["sections"]
    assert [section["id"] for section in sections] == ["intro", "verse_1", "chorus_1", "outro"]
    assert sections[0]["start"] == 0.0
    assert sections[-1]["end"] == 30.0
    for left, right in zip(sections, sections[1:]):
        assert left["end"] == right["start"]
    verse = sections[1]
    chorus = sections[2]
    assert verse["start"] <= 8.2 and verse["end"] <= 20.1 <= chorus["end"]
    # Boundaries snap to downbeats when one falls into the gap.
    assert chorus["start"] in result["downbeats"]
    assert result["cues"][0]["text"] == "Vibration."
    for line in result["lines"]:
        section = next(item for item in sections if item["id"] == line["section"])
        assert section["start"] <= line["start"] <= line["end"] <= section["end"]


def test_unsung_line_is_placed_with_low_confidence():
    parsed = parse_lyrics("[Verse 1]\nEins zwei drei\nNie gesungen hier\nVier fünf sechs\n")
    words = asr("eins zwei drei", start=1.0) + asr("vier fünf sechs", start=6.0)
    result = align_lyrics(parsed, words, duration=10.0, beats=[], energy=[], energy_fps=0, language="de")
    lines = result["lines"]
    assert result["unmatched"] == ["Nie gesungen hier"]
    assert result["meta"]["lineConfidence"]["l2"] <= 0.2
    assert lines[0]["end"] <= lines[1]["start"] <= lines[1]["end"] <= lines[2]["start"]


def test_forced_aligner_refines_words_but_anchors_guard_outliers():
    parsed = parse_lyrics("[Verse 1]\nEins zwei drei\n")
    words = asr("eins zwei drei", start=1.0)

    def forced(tokens, start, end):
        return [
            {"start": 1.02, "end": 1.3, "score": 0.9},
            {"start": 9.0, "end": 9.3, "score": 0.9},  # far off: anchor must win
            {"start": 1.82, "end": 2.1, "score": 0.9},
        ]

    result = align_lyrics(
        parsed, words, duration=10.0, beats=[], energy=[], energy_fps=0, language="de", forced_aligner=forced
    )
    timed = result["lines"][0]["words"]
    assert timed[0]["start"] == 1.02
    assert abs(timed[1]["start"] - 1.4) < 0.01
    assert timed[2]["start"] == 1.82


def test_pick_downbeats_prefers_the_loudest_phase():
    beats = [index * 0.5 for index in range(16)]
    fps = 10
    energy = [0.1] * 80
    for beat in beats[1::4]:
        energy[int(beat * fps)] = 1.0
    downbeats, phase = pick_downbeats(beats, energy, fps)
    assert phase == 1
    assert downbeats == beats[1::4]
