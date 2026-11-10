---
name: video-qa
description: Use before delivering a music video to run still checks, sync checks, readability, determinism, budget reconciliation, and final format renders.
license: MIT
---

# Video QA

## When to use

- A master render exists and the project is heading to delivery.
- The user asks for a final check, a review report, or all-format exports.
- A previous QA pass failed and the fixes need verification.

## Inputs

- `storyboard.yaml`, `timing.effective.json`, `style.yaml`, `characters.yaml`
- `assets/manifest.jsonl`, `state.json`
- `renders/` and `review/`
- `docs/glossary.md`

## Process

1. Run `npm run cli -- validate projects/<slug>` and stop on any schema or coverage error.
2. Check every referenced asset exists. For AI and footage shots, the asset path in the storyboard must resolve.
3. Reconcile spend: sum the manifest costs and compare with `state.json` and the project budget. Flag any generation without a manifest entry.
4. Render stills at every section boundary and at each highlighted word. Check:
   - Sync: the word appears when it is sung.
   - Legibility: contrast, font size, safe areas, no clipping.
   - Composition: the subject is visible, the style matches the bible.
   - Character consistency: the same character looks like the same character.
5. Run the determinism check: render the same still frame twice and compare SHA-256 hashes. They must match.
6. Render all formats: 16:9 master, 9:16, 1:1, and 4:5 if configured.
7. Write `review/report.md` with a pass/fail line per check, the warnings that remain, and the exact render paths.
8. Update the state with `npm run cli -- stage-done <project> qa-export --outputs review/report.md,renders/16x9.mp4`.

## Episodes

- Before QA, write the subtitles: `npm run cli -- subtitles projects/<slug>` (`renders/<slug>.en.srt`).
- `npm run cli -- qa projects/<slug>` adds the episode checks: every subtitled line has `text_en`, every speaker, set, and shot reference exists in the canon, the episode length is inside `limits.episode_seconds` of the series, and the SRT exists.
- In the stills, read the burned-in subtitles of `renders/<format>.en.mp4` against the speech, and check chat windows for legibility.
- The master is `renders/<format>.mp4` for the master format; record `review/report.md`, the master, and the SRT with `stage-done ... qa-export`.

## Completion criteria

- Every check has a pass/fail result and evidence.
- Sync, readability, determinism, coverage, and budget reconciliation pass, or the exceptions are documented.
- All configured formats are rendered.
- `review/report.md` is current.
- No secrets, copyrighted media, or generated assets are staged for commit.

## Common failures

- Checking only the 16:9 master and ignoring 9:16 cropping.
- Trusting a previous render after changing timing or a component.
- A manifest with a cost that does not match the budget.
- Calling a render "final" without a determinism check.
