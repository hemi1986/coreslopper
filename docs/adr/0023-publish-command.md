# Publishing is a user command that uploads privately

## Status

Accepted — 2026-11-16. Amends [ADR 0019](0019-release-package.md): the upload text is now rendered from structured upload data. Amended by [ADR 0029](0029-release-autopilot.md): `publish` still uploads privately, but an approved release goes out through the release autopilot.

## Context

`qa-export` ends with a release package (ADR 0019), and the user then copied every title, description, tag, and thumbnail by hand into YouTube Studio and the TikTok app: four uploads per video, error-prone and slow. YouTube's Data API v3 and TikTok's Content Posting API can take the files and most of the metadata. Both act on the user's own channel, outside the workspace, and both have rules that shape what an automated upload can be: YouTube keeps videos from API projects that Google has not audited private, charges about 1,600 of 10,000 daily quota units per upload, and offers no API for a Short's related video; TikTok's direct-post API needs an app review, while its inbox path (`video.upload`) only drops a draft into the user's inbox, without a caption.

ADR 0019 had rejected a YAML upload file because the user copied from Markdown. A machine now reads the texts, so parsing free Markdown would make the uploader depend on label translations and heading conventions.

## Decision

- **`publish` is a command the user runs, not a pipeline stage.** `/video-next` and stage runners never run it or `publish-auth`. The pipeline's autonomy (ADR 0002) covers work inside the workspace; an upload changes the user's public presence and cannot be undone by a re-run.
- **Everything lands private or as a draft.** YouTube uploads use `privacyStatus: private`, or `publishAt` with `--schedule`; TikTok uploads go to the inbox. No code path makes a video public: the user reviews it on the platform and presses publish there. This also matches the unaudited-project restriction, so an unaudited Google Cloud project loses nothing.
- **`review/upload.yaml` is the source; `review/upload.md` is rendered from it** by `upload-text`. The skill writes the YAML; `publish` and `qa` read it through a Zod schema; the hook validates it.
- **`review/publish.json` makes runs idempotent.** Each attempt is logged with platform, item, file hash, remote ID, URL, status, and time. An item whose file hash already uploaded to that platform is skipped unless `--force`. Mock runs are marked and never satisfy a real run.
- **Limits are checked before the first upload.** `--dry-run` validates the data, files, platform limits, and quota without a network call; a real run stops before uploading anything when the YouTube batch would exceed the daily quota.
- **OAuth with a loopback redirect and PKCE**, one-time per platform (`publish-auth`). Refresh tokens live in `.env`, access tokens only in memory; errors are masked before they are printed or logged.
- **Publish adapters are a second, narrow interface** (`PublishAdapter.publish(item)`) beside the generation providers, with a mock adapter for tests and CI.
- **Instagram is out for now.** Its API publishes Reels only for Business or Creator accounts linked to a Facebook Page, needs a Meta app review for other users, and pulls the video from a public URL instead of taking an upload, which would need hosting the file. The platform enum and the adapter interface take it later without a schema break.
- **No MCP server.** Uploading is mechanical, needs no model in the loop, and must behave the same in CI, in a terminal, and in Claude Code; an MCP server would add a second credential store and let an agent call uploads outside the command's checks.

## Alternatives considered

- **A `publish` stage after `qa-export`.** Rejected: the pipeline would act outside the workspace without a human, and a resumed run could repeat uploads.
- **TikTok's direct-post API.** Sets the caption, but needs TikTok's app audit; until then posts are forced private, which gains nothing over a draft.
- **Parsing `upload.md`.** Works for the checker's coarse fields, not for tags, per-item settings, and platforms.

## Consequences

- The user sets up a Google Cloud project and a TikTok developer app once (`docs/publishing.md`). An OAuth app left in Google's Testing mode issues refresh tokens that expire after seven days.
- The related video of a Short, the TikTok caption, sound, and cover, and the final publish stay manual; `publish` prints them as steps.
- `review/publish.json` is a project artifact; it holds video IDs, never tokens.
