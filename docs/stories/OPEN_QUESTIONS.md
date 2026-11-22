# Open questions

Decisions that block a story or an artifact. One row per question; the answer is written here and the
`[OPEN]` marker is removed from the artifact.

| Story/artifact | Question | Since | Answer |
|---|---|---|---|
| ST-005 | "A missing file is refused" has the user name the file "missing.wav" in sound.yaml, but a library sound's entry names no file: its WAV is always `sound.wav` next to it (ST-001, `LIBRARY_SOUND_FILE`). Either (a) the scenario becomes "the library holds vine-boom without its sound.wav → fails because sound.wav does not exist" (recommended, already built), or (b) sound.yaml gets a `file` field (changes ST-001's data model). | 2026-11-22 | (a): the scenario checks a missing sound.wav; sound.yaml gets no file field (user, 2026-11-22) |
