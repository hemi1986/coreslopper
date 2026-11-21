# Publishing

`publish` uploads a finished project's release package: the main video and the Shorts to YouTube as **private** (or scheduled) videos, and the Shorts to TikTok as **drafts** in your inbox. It never makes a video public; you review each upload on the platform and publish it there. It is a command you run yourself, never a pipeline stage ([ADR 0023](adr/0023-publish-command.md)).

```bash
npm run cli -- publish projects/<slug> --dry-run      # check everything, no network calls
npm run cli -- publish projects/<slug>                # upload what is not uploaded yet
```

| Flag | Purpose |
|---|---|
| `--platform youtube\|tiktok\|all` | Limit the run to one platform (default `all`). |
| `--only main\|shorts\|<name>` | Limit the run to the main video, the Shorts, or one Short (`Z1-intro`). |
| `--schedule <ISO date>` | YouTube: set `publishAt`, e.g. `2026-12-01T18:00:00+01:00`. At least 15 minutes ahead. |
| `--dry-run` | Validate `upload.yaml`, files, platform limits, and quota; print the plan. |
| `--force` | Upload again although `review/publish.json` has the same file. |
| `--mock` | Use the mock adapters: no network, entries marked `mock`. |

Everything else of the release, including the files and texts for Instagram, Spotify, the distributor, X, LinkedIn, and the microsite, lies in `renders/release/` (`npm run cli -- release`, [ADR 0024](adr/0024-release-folder-manual-distribution.md)); those uploads stay manual. `npm run cli -- release-board` lays them out per platform with the release calendar, and records what you posted ([ADR 0028](adr/0028-release-board-and-calendar.md)). To schedule a YouTube upload at its calendar time, pass that time to `--schedule`; `review/calendar.yaml` holds it with its offset.

## What it reads and writes

- **`review/upload.yaml`** — the upload data `qa-export` writes ([schema](../schema/upload.schema.json)): per item the file, title, description, tags, hashtags, thumbnail, language, `made_for_kids` (default `false`), `synthetic_media` (default `true`), and `platforms` (main: `[youtube]`, Shorts: `[youtube, tiktok]`). Shorts carry `related: main`. `npm run cli -- upload-text projects/<slug>` renders `review/upload.md` from it.
- **`review/publish.json`** — the publish log: one entry per attempt with platform, item, file hash, remote ID, URL, status (`uploaded`, `scheduled`, `draft`, `processing`, `failed`), and time. A file that is already uploaded to a platform is skipped; a new render (new hash) or `--force` uploads again. A failed attempt is retried on the next run.

## What happens per platform

**YouTube** (Data API v3, scope `youtube.upload`): a resumable `videos.insert` with title, description plus hashtags, tags, category (10, Music), language, `privacyStatus: private` (or `publishAt` with `--schedule`), `selfDeclaredMadeForKids`, and `containsSyntheticMedia`; then `thumbnails.set`. Shorts are the vertical videos (at most 3 minutes) with the same metadata. Left for you, printed after the run:

- Set **Related video** of each Short to the main video in YouTube Studio; the API cannot.
- Set the visibility to public when you are ready.
- If YouTube answers the thumbnail with 403, the channel is not verified for custom thumbnails: verify it at [youtube.com/verify](https://www.youtube.com/verify) and set the thumbnail in Studio. The upload itself is kept.

**TikTok** (Content Posting API, inbox path, scope `video.upload`): the video is uploaded in chunks and appears as a draft in the TikTok app's inbox. The inbox path cannot set a caption, so `publish` prints the caption (title and hashtags from `upload.yaml`, without `#shorts`) for you to paste. In the app you add sound, text, and cover, and post it.

## Limits and quota

The dry run and every real run check before the first upload:

| | YouTube | TikTok |
|---|---|---|
| Title | ≤ 100 characters, no `<` `>` | — |
| Description | ≤ 5,000 bytes with hashtags, no `<` `>` | caption ≤ 2,200 characters (printed only) |
| Tags | ≤ 500 characters together | — |
| Video | Short: vertical or square, ≤ 180 s; main over 15 min needs a verified channel | 3–600 s, ≤ 4 GB; non-9:16 is a warning |
| Thumbnail | JPEG or PNG, ≤ 2 MB | — |
| Quota | 10,000 units per day (resets at midnight Pacific Time); an upload costs about 1,600, a thumbnail 50. A batch that would exceed it stops before the first upload. | At most 5 pending drafts per 24 hours. |

Length and aspect ratio need `ffprobe`; without it the dry run warns that they are unchecked. If Google grants you more quota, set `YOUTUBE_DAILY_QUOTA` in `.env`.

## Set up YouTube (once)

1. Open [console.cloud.google.com](https://console.cloud.google.com/) and create a project, e.g. `coreslopper-publish`.
2. **APIs & Services → Library**: enable **YouTube Data API v3**.
3. **APIs & Services → OAuth consent screen** (Google Auth Platform): user type **External**, app name, your e-mail as support and developer contact. Under **Data access**, add the scope `https://www.googleapis.com/auth/youtube.upload`. Under **Audience**, add the Google account that owns the channel as a **test user**.
4. **Clients → Create client**: application type **Desktop app**. Copy the client ID and secret into `.env`:

   ```bash
   YOUTUBE_CLIENT_ID=1234-abc.apps.googleusercontent.com
   YOUTUBE_CLIENT_SECRET=GOCSPX-...
   ```

5. Authorize once:

   ```bash
   npm run cli -- publish-auth youtube
   ```

   The command opens the consent page (and prints its URL), listens on `127.0.0.1` for Google's redirect, exchanges the code with PKCE, and writes `YOUTUBE_REFRESH_TOKEN` to `.env`. Choose the channel's account; Google warns that the app is unverified, which is expected for your own client ("Advanced → Go to …").

6. Check with `npm run cli -- doctor` (YouTube publishing: client and refresh token set) and `publish --dry-run`.

**Things to know:**

- While the consent screen's publishing status is **Testing**, Google expires refresh tokens after **seven days**; run `publish-auth youtube` again then, or set the status to **In production** (for the `youtube.upload` scope Google may ask for verification; personal use works without it, with the unverified-app warning).
- **Videos uploaded through an API project that Google has not audited stay private**, whatever the request says, and that includes `--schedule`. That is fine for `publish`, which uploads privately anyway: you switch the visibility in YouTube Studio yourself. To schedule through the API, the project needs Google's [API audit](https://support.google.com/youtube/contact/yt_api_form).

## Set up TikTok (once)

1. Sign in at [developers.tiktok.com](https://developers.tiktok.com/) and **Manage apps → Connect an app**. Fill in name, icon, category, description, and the terms and privacy URLs (your own pages; TikTok requires them).
2. **Add products**: **Login Kit** and **Content Posting API**. In the Content Posting API settings, leave **Direct Post** off; `publish` uses the upload (inbox) path, which needs no app review for your own account.
3. **Scopes**: `video.upload` (and the default `user.info.basic`).
4. **Login Kit → Redirect URI**: add `http://localhost:8765/callback/` for the Desktop platform. If you register another one, set it as `TIKTOK_REDIRECT_URI` in `.env`; it must match exactly.
5. While the app is in **Sandbox**, add your TikTok account as a **target user** (Sandbox → Target users). A sandbox app can upload drafts to the target users' inboxes; there is no need to submit the app for review.
6. Copy the client key and secret into `.env`:

   ```bash
   TIKTOK_CLIENT_KEY=aw...
   TIKTOK_CLIENT_SECRET=...
   ```

7. Authorize once:

   ```bash
   npm run cli -- publish-auth tiktok
   ```

   The command opens TikTok's consent page, catches the redirect on `localhost:8765`, exchanges the code with PKCE, and writes `TIKTOK_REFRESH_TOKEN` to `.env`. Access tokens last 24 hours; `publish` refreshes them on every run and stores a rotated refresh token itself. The refresh token lasts a year; run `publish-auth tiktok` again after that or when TikTok rejects it.

## Security

- Tokens live only in `.env` (mode `0600`, gitignored) and in memory; `publish` and `publish-auth` never print them, and error messages and `review/publish.json` are masked before they are written.
- Network errors and HTTP 408/429/5xx are retried with exponential backoff; a YouTube upload resumes where the interrupted chunk ended.
- Revoke access any time: Google at [myaccount.google.com/permissions](https://myaccount.google.com/permissions), TikTok under Settings → Security → Manage app permissions.

## Instagram

Not supported yet. Instagram's API publishes Reels only for Business or Creator accounts linked to a Facebook Page, needs a Meta app review for anyone but the app's own testers, and fetches the video from a public URL rather than taking an upload. The upload data and the publish adapter interface are ready for a third platform ([ADR 0023](adr/0023-publish-command.md)).
