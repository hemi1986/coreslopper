# QA Report — After Midnight

Project: `demo-episode`
Duration: 22.36s · 4 shots
Budget: $0.00 spent / $10.00

| Check | Result | Evidence |
|---|---|---|
| Storyboard validation | PASS | 4 shots, 671 frames, no gaps |
| Assets | N/A | no generated assets to check |
| Audio | PASS | audio/episode.wav exists |
| Manifest | PASS | 16 entries, $0.00 reconciled |
| Subtitles text | PASS | 5 line(s) with text_en |
| Canon | PASS | 3 character(s), 2 set(s) in series demo-series |
| Episode length | PASS | 22.36s; series limit 15–30s |
| Subtitles file | PASS | renders/demo-episode.en.srt |
| Master render | PASS | renders/9x16.mp4 |
| Determinism | N/A | run with --determinism <frame> |

READY: yes

Visual checks (sync, readability, character consistency) are performed by the `qa-checker` agent using stills and clip frames.
