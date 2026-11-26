---
status: accepted
date: 2026-11-16
---

# One release folder, manual distributor upload, API distributors later

## Status

Accepted — 2026-11-16. Extends [ADR 0019](0019-release-package.md) and [ADR 0023](0023-publish-command.md).

## Context

The release package of ADR 0019 covered YouTube only, and its files lay spread over `renders/`, `renders/shorts/`, and `renders/thumbnails/`, between previews and old versions. Publishing a song needs more: the song as WAV for a distributor, a square cover, a Spotify Canvas, lyrics files, the distributor's form facts (genres, songwriters, AI credits, release date), and texts for Instagram, TikTok, and Spotify for Artists. Users assembled all of it by hand.

Consumer distributors (DistroKid, TuneCore, Ditto, CD Baby) have no public upload API. Driving their web forms with a browser would break on every redesign, act on the user's account without a reviewable request, and may break their terms. Some distributors for labels (for example LabelGrid) offer a REST API, but need a label account and contract.

## Decision

- **`release` builds `renders/release/`**, one folder with everything to upload: every format, subtitles, thumbnails, Shorts, the song as WAV, cover, canvas, plain and synchronised lyrics, one text file per platform, a release plan, a README with the open TODOs, and `manifest.json` with size, hash, specification, and source per file. Because the folder lives under `renders/`, it lands on `CORESLOPPER_MEDIA_DIR` when that is set.
- **Assembly is mechanical and idempotent.** Files are hardlinked (or copied) from their sources and replaced only when their content changed; generated texts are rewritten only when they differ; files a previous run wrote and this one does not are removed, anything else in the folder is left alone. A format is rendered only when it is missing or its recorded inputs hash in `state.json` no longer matches; `render` records that hash.
- **Texts stay creative, layout and limits stay mechanical.** The skill writes every platform's texts into `review/upload.yaml`; `release` lays them out with chapters, footer, credits, and links, and checks the limits in code (`PLATFORM_LIMITS`, overridable in `config/channel.yaml`).
- **Facts are never invented.** Distributor facts live in an optional `release:` block of `project.yaml` that only the user fills in (during `new-video`, or later). A missing field becomes a TODO in the README, the texts, and `qa`; TODO never fails the stage.
- **`config/channel.yaml` is optional and workspace-wide**: name, handles and links (with `<ID>` placeholders reported as TODO), footer lines, hashtag sets, limit overrides, and AI disclosure defaults. `init` and `update` never create it.
- **The distributor upload stays manual.** `texts/spotify.md` lists the form fields in the distributor's order with the values to paste. No form or browser automation.
- **An API distributor is a later adapter**, beside the publish adapters of ADR 0023, once a user has such an account; the release folder and `manifest.json` are its input.

## Alternatives considered

- **Automate DistroKid in a headless browser.** Rejected: fragile, unreviewable, and against the platform's intent.
- **Keep the files where they are and list them in a document.** The user would still hunt through `renders/`, and a stale preview could be uploaded by mistake.
- **Generate all texts from templates.** Every platform would get the same sentence; the texts need the song's voice, which is the agent's work.

## Consequences

- `qa-export` writes more (WAV, cover, canvas, lyrics, texts) and `qa` has ten more checks; the canvas needs a window without burned-in lyrics, which `release` searches for and otherwise reports as a TODO.
- Hardlinks share the source's bytes: a tool that rewrites a render in place changes the release copy too, which `qa` reports as a changed file until `release` runs again.
- Platform rules change (Instagram cut hashtags to five in 2025); the limits live in one table and in `config/channel.yaml`, not in the skill.
