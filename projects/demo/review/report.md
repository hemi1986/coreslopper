# QA Report — Neon Rain

Project: `demo`
Duration: 12.00s · 6 shots
Budget: $0.00 spent / $50.00

| Check | Result | Evidence |
|---|---|---|
| Storyboard validation | PASS | 6 shots, 360 frames, no gaps |
| Assets | N/A | assets stage is not done; no generated assets to check |
| Audio | PASS | audio/song.wav exists |
| Manifest | PASS | no generations yet |
| Master render | PASS | renders/16x9.mp4 |
| Format 9x16 | PASS | renders/9x16.mp4 |
| Format 1x1 | PASS | renders/1x1.mp4 |
| Determinism | N/A | run with --determinism <frame> |

READY: yes

Visual checks (sync, readability, character consistency) are performed by the `qa-checker` agent using stills and clip frames.
