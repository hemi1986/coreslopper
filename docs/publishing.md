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

Everything else of the release, including the files and texts for Instagram, Spotify, the distributor, X, LinkedIn, and the microsite, lies in `renders/release/` (`npm run cli -- release`, [ADR 0024](adr/0024-release-folder-manual-distribution.md)). `npm run cli -- release-board` lays them out per platform with the release calendar, and records what you posted ([ADR 0028](adr/0028-release-board-and-calendar.md)). Once you approve a release there, the [release autopilot](#release-autopilot) posts everything a platform API can post at its calendar time ([ADR 0029](adr/0029-release-autopilot.md)); `publish` stays the command for a private upload by hand.

## What it reads and writes

- **`review/upload.yaml`** — the upload data `qa-export` writes ([schema](../schema/upload.schema.json)): per item the file, title, description, tags, hashtags, thumbnail, language, `made_for_kids` (default `false`), `synthetic_media` (default `true`), and `platforms` (main: `[youtube]`, Shorts: `[youtube, tiktok]`). Shorts carry `related: main`. A short episode is one video: `publish` uploads only `main`, as a YouTube Short and to TikTok whatever `main.platforms` says, and leaves the `shorts` entries out; it gets no Premiere step and no pinned comment. `npm run cli -- upload-text projects/<slug>` renders `review/upload.md` from it.
- **`review/publish.json`** — the publish log: one entry per attempt with platform, item, file hash, remote ID, URL, status (`uploaded`, `scheduled`, `draft`, `processing`, `failed`), and time. A file that is already uploaded to a platform is skipped; a new render (new hash) or `--force` uploads again. A failed attempt is retried on the next run, unless it may have gone out anyway: when the answer was lost after the last byte of the video was sent, the entry carries `uncertain: true`, and `publish` skips it until you have checked the platform and run it again with `--force`.

## What happens per platform

**YouTube** (Data API v3, scopes `youtube.upload` and `youtube.force-ssl`; the second lets the autopilot read a video's status, edit its description, and post a comment): a resumable `videos.insert` with title, description plus hashtags, tags, category (10, Music), language, `privacyStatus: private` (or `publishAt` with `--schedule`), `selfDeclaredMadeForKids`, and `containsSyntheticMedia`; then `thumbnails.set`. Shorts are the vertical videos (at most 3 minutes) with the same metadata. Left for you, printed after the run:

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
3. **APIs & Services → OAuth consent screen** (Google Auth Platform): user type **External**, app name, your e-mail as support and developer contact. Under **Data access**, add the scopes `https://www.googleapis.com/auth/youtube.upload` and `https://www.googleapis.com/auth/youtube.force-ssl` (the autopilot reads a video's status, appends the Spotify link to the description, and posts the pinned comment). Under **Audience**, add the Google account that owns the channel as a **test user**.
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
- **A token from before the autopilot has only `youtube.upload`.** Uploads keep working; the autopilot's status, description, and comment calls fail with a hint: run `publish-auth youtube` again.
- **Quota** of the autopilot's calls: reading a status 1 unit, appending to a description 51, a comment 50.
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

**Direct posting (after TikTok's audit).** An audited app can post instead of sending drafts: turn on **Direct Post** in the Content Posting API settings, add the scope `video.publish`, and submit the app for the audit. Before the audit TikTok keeps every direct post private (and refuses public accounts with `unaudited_client_can_only_post_to_private_accounts`). Once it passed, set `autopilot.tiktok_direct: true` in `config/release-schedule.yaml` (`TIKTOK_DIRECT_POST=1` in `.env` does the same for the autopilot) and run `publish-auth tiktok` again. `publish` itself always sends drafts. A direct post asks TikTok's `creator_info` first, posts only as public to everyone, carries the caption and the AI-generated label (`is_aigc`), and links to the video. The cover and a pinned comment stay in the app: the API has neither.

## Security

- Tokens live only in `.env` (mode `0600`, gitignored) and in memory; `publish`, `publish-auth`, and `release-run` never print them, and error messages, `review/publish.json`, and `review/autopilot.json` are masked before they are written.
- Network errors and HTTP 408/429/5xx are retried with exponential backoff; a YouTube upload resumes where the interrupted chunk ended.
- Revoke access any time: Google at [myaccount.google.com/permissions](https://myaccount.google.com/permissions), TikTok under Settings → Security → Manage app permissions.

## Release autopilot

The release autopilot posts an approved release by API at its calendar times, so you do not log in to each platform ([ADR 0029](adr/0029-release-autopilot.md)). A project with `distribution: internal` is left alone: it posts nothing of it, also with an approval from before it became internal, and `release-run --plan` lists no event of it. Approving an internal project is refused for the same reason, also with a calendar from before it became internal, before `project.yaml` or the release status changes. Releasing stays one click: **Approve release** on the release board (or `npm run cli -- release-approve <project>`). A proposed release day becomes `release.release_date` in `project.yaml` with that click. The approval holds for that day: when the release moves, nothing goes out until you approve the new day. **Withdraw approval** stops everything that has not gone out. The board takes writes only from its own page on 127.0.0.1, so another website open in your browser cannot approve a release.

```bash
docker compose up -d                    # the board container: runs the watchdog every 5 minutes
npm run cli -- release-timer show       # or a timer on this computer: what it runs
npm run cli -- release-timer install    # run the watchdog round (watch) every 5 minutes
npm run cli -- release-run --plan       # every approved event with its state
npm run cli -- release-run --dry-run    # what is due now; posts nothing
```

`release-timer install` sets up the Windows Task Scheduler under WSL (WSL itself stops when no terminal is open), a systemd user timer on Linux, or a launchd agent on macOS. Each round runs the script `~/.coreslopper/release-run.sh`, which puts the Node.js that installed the timer on PATH (a timer's shell loads no nvm or profile), runs the watchdog round `watch` (`release-run`, then the production scan) in the workspace, and appends to `.cache/watch.log`. The board container runs the same round itself ([board.md](board.md)); use one of the two. Install the timer again after a Node.js upgrade or when you move the workspace. The computer has to be on at the posting times; a post missed by more than `late_hours` waits for you on the board.

### What goes out by itself

| Calendar event | By the autopilot | Still yours |
|---|---|---|
| Main video, Shorts on YouTube | Uploaded `youtube_ahead_hours` (24) before their time: private, or scheduled once `youtube_audited: true`. When the main video is public, its pinned comment is posted (not for a short episode or a meme: their one video is a Short). | Without the audit: switch it public in Studio at its time. A Premiere is always set in Studio, for a main video only. Pin the comment; set the related video of each Short. |
| A short episode's or a meme's video on TikTok | A draft in the inbox at its time, like a Short. | Post the draft from the app. |
| Shorts on TikTok | A draft in the inbox at its time; a public post with `tiktok_direct` after the audit. | Post the draft from the app (cover, sound). |
| Instagram Reels (of the Shorts, of a short episode or meme, and of a main video of at most 3 minutes), announcement story | Posted at their time with caption, cover frame, and the AI info label. | The release-day story (it needs the link sticker). |
| X: announcement, release post, Shorts | Posted with the teaser, the main video, a Short, or an image; the release post's reply, when it has one, carries the YouTube link. | — |
| LinkedIn | Posted with the video and the YouTube link. | — |
| The day after: links | The Spotify link appended to the YouTube description. | Enter the Spotify link on the board (Spotify tab, "Song"); add it to the pinned comment if you want it there. |
| Microsite | `microsite/<slug>.json` and its images copied into `autopilot.microsite.dir`, then `autopilot.microsite.command` runs there (e.g. commit and push). | — |
| Distributor, pitch, canvas, artist pick, community posts | — | All of it: no API. |

Posts that link to the main video (the X release post, LinkedIn) wait until it is public. A platform without credentials stays manual; the board shows it as blocked. **Do it myself** on a post takes it away from the autopilot.

### When something goes wrong

- A failed post is tried again after 10, then 20 minutes, up to `retries` times; then it waits for **Try again**.
- **Never twice:** when a post may have gone out anyway (a lost answer, a server error after sending; for a YouTube upload or a TikTok post, any error once the last byte of the video was sent), it is marked *not sure it is live* and never retried by itself. Check the platform, then mark it **It is live** or **Try again**.
- Missing credentials, an expired token, X without credits, or a broken text wait for you at once.
- The log is `review/autopilot.json`; the board shows the last error and what is still yours per post.

### Settings

`autopilot:` in `config/release-schedule.yaml` (see `templates/channel/release-schedule.yaml`):

```yaml
autopilot:
  platforms: [youtube, tiktok, instagram, x, linkedin, microsite]
  youtube_ahead_hours: 24
  youtube_audited: false
  tiktok_direct: false
  late_hours: 12
  retries: 3
  # microsite: { dir: ../artist-site/content/songs, command: git add -A && git commit -m "new song" && git push }
```

Set up each platform once: [YouTube](#set-up-youtube-once) and [TikTok](#set-up-tiktok-once) as above, then the three below. Each is optional; `npm run cli -- doctor` shows which are ready.

### X

The autopilot posts to X through API v2 with your own app and an OAuth 2.0 user token. X bills the API per call (pay-per-use), so the app needs credits.

1. Sign in at [console.x.com](https://console.x.com/) (the X developer console) with the account the posts go out from, and create a project and an app.
2. **Credits:** under **Billing**, buy a small amount of credits. Pay-per-use is the only plan for new developers since February 2026; without credits X refuses posts (the autopilot reports "add credits").
3. **User authentication settings** of the app: turn on **OAuth 2.0**, app permissions **Read and write**, type of app **Web App, Automated App or Bot** (a confidential client: it gets a client secret). Callback URI: `http://127.0.0.1:8767/callback` (if you register another, set it as `X_REDIRECT_URI` in `.env`; it must match exactly). Website URL: any page of yours.
4. **Keys and tokens → OAuth 2.0 Client ID and Client Secret**: copy both into `.env`:

   ```bash
   X_CLIENT_ID=...
   X_CLIENT_SECRET=...
   ```

5. Authorize once:

   ```bash
   npm run cli -- publish-auth x
   ```

   The command opens X's consent page (scopes `tweet.read tweet.write users.read media.write offline.access`), catches the redirect on `127.0.0.1:8767`, exchanges the code with PKCE, and writes `X_REFRESH_TOKEN` to `.env`.

**Things to know:**

- **Refresh tokens are single-use.** Every refresh returns a new one and the old one stops working; the autopilot stores each new token in `.env` right away. If a run is interrupted between the refresh and the save, or the token is unused for about six months, run `publish-auth x` again.
- **Prices** (docs.x.com pricing, April 2026; check the console for current rates): a post $0.015, a post whose text holds a URL $0.20. A release post with its link reply costs about $0.22, a Short without a link $0.015, the announcement $0.015. Media upload has no listed price. The autopilot records the estimated cost of each post in its log.
- **Limits:** 280 characters without Premium (a link counts 23), one video or up to four images per post, video up to 140 s without Premium. Video is uploaded in 4 MiB chunks and processed by X before the post; a media ID expires after 24 hours.
- **No retries on the post itself:** a lost answer or an HTTP 5xx can still have created the post, so the autopilot does not send it twice; it asks you to check the profile. A failed reply leaves the post live and lists the reply text for you to post by hand.
- **Rate limits:** a 429 with a reset under 90 seconds is waited out once; otherwise the next autopilot run tries again.
- **Revoke** access any time: X → Settings and privacy → Security and account access → Apps and sessions → Connected apps, or delete the app in the developer console.

### LinkedIn

The autopilot posts the release's LinkedIn post on your personal profile: the text, with the video (or an image) uploaded natively. It uses two self-serve products, no app review.

1. Sign in at [linkedin.com/developers/apps](https://www.linkedin.com/developers/apps) and **Create app**: name (e.g. `coreslopper-publish`), a logo, and a **LinkedIn Page**. Every app must be associated with a company page; if you have none, create one (it can be a minimal page for your artist name). The page is only the app's owner; posts go to your personal profile, not the page.
2. On the app's **Products** tab, add **Sign In with LinkedIn using OpenID Connect** (scopes `openid`, `profile`: tells coreslopper who you are) and **Share on LinkedIn** (scope `w_member_social`: post on your behalf). Both are granted at once.
3. On the **Auth** tab, add the redirect URL `http://localhost:8766/callback` under **Authorized redirect URLs for your app**. If you register another one, set it as `LINKEDIN_REDIRECT_URI` in `.env`; it must match exactly.
4. Copy **Client ID** and **Primary Client Secret** from the Auth tab into `.env`:

   ```bash
   LINKEDIN_CLIENT_ID=78ab...
   LINKEDIN_CLIENT_SECRET=WPL_AP1....
   ```

5. Authorize once:

   ```bash
   npm run cli -- publish-auth linkedin
   ```

   The command opens LinkedIn's consent page, catches the redirect on `localhost:8766`, exchanges the code, looks up your member ID, and writes `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_TOKEN_EXPIRES_AT`, and `LINKEDIN_MEMBER_URN` to `.env`.

**Things to know:**

- **The token lasts 60 days and cannot be renewed in the background.** LinkedIn gives refresh tokens only to approved Marketing Developer Platform partners, not to self-serve apps. Run `publish-auth linkedin` again before `LINKEDIN_TOKEN_EXPIRES_AT`; `doctor` and the release board warn when fewer than 10 days are left, and a post due after the expiry fails with that hint instead of posting. (If LinkedIn does return a `refresh_token`, it is stored as `LINKEDIN_REFRESH_TOKEN` and used automatically.)
- **API version:** requests carry `LinkedIn-Version: 202610`. LinkedIn sunsets a version after about a year; set `LINKEDIN_API_VERSION=YYYYMM` in `.env` to move to a newer one before coreslopper is updated.
- **Text:** at most 3,000 characters; about 210 show before "see more". The Posts API reads the text in LinkedIn's "little text" format: coreslopper escapes `( ) [ ] { } < > @ * _ ~ | \` and turns `#tag` into a real hashtag. An unescaped character would silently cut the post off.
- **Video:** MP4, 3 s to 30 min, up to 5 GB; uploaded in the parts LinkedIn returns, then processed (coreslopper waits up to 10 minutes for it). **Image:** JPEG or PNG.
- **Limits:** LinkedIn rate-limits member posting per day; one release posts once, far below it.
- **Revoke** access any time: LinkedIn → Settings & Privacy → Data privacy → **Permitted services**, remove the app. Then delete the `LINKEDIN_*` tokens from `.env`.

### Instagram

The autopilot posts Reels and the announcement story to your own Instagram account through the **Instagram API with Instagram Login** (host `graph.instagram.com`). For your own account the app stays in development mode with Standard Access: no App Review, no business verification. Review (Advanced Access) is only needed to post for accounts you do not own or manage.

1. **Professional account.** In the Instagram app: Settings → Account type and tools → switch to a **Creator** or **Business** account. The account must be **public**. No Facebook Page is needed for Instagram Login.
2. **Meta app.** At [developers.facebook.com/apps](https://developers.facebook.com/apps) create an app and add the use case **Manage messaging & content on Instagram** ("Instagram API with Instagram Login"). Leave it in **development mode**.
3. **Permissions.** Under the use case's permissions, add `instagram_business_basic` and `instagram_business_content_publish`.
4. **Tester.** In **Instagram → API setup with Instagram login → Generate access tokens**, click **Add account**, log in with the Instagram account, and accept. (The account can also be managed under **App roles → Roles → Instagram testers**; the invitation is accepted in the Instagram app under Settings → Apps and websites → Tester invites.)
5. **Token.** In the same section click **Generate token** next to the account and copy the token. It is a long-lived token (60 days).
6. Store it once:

   ```bash
   npm run cli -- publish-auth instagram
   ```

   The command asks for the token, checks it with `GET /me` (account ID and username), and writes `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_USER_ID`, and `INSTAGRAM_TOKEN_EXPIRES_AT` to `.env`.

7. **Media host.** Instagram does not take uploads: it fetches each image and video from a public URL. The autopilot puts the file into your fal.ai storage (`FAL_KEY`) for that and passes Instagram the URL. Without `FAL_KEY`, Instagram events stay manual.

**Token lifetime:** A long-lived token is valid for 60 days from its last refresh. It can be refreshed once it is at least 24 hours old and not yet expired (`GET /refresh_access_token?grant_type=ig_refresh_token`). The autopilot refreshes it whenever it expires within 10 days and writes the new token and expiry to `.env`. A token that was not refreshed within 60 days expires for good: generate a new one in the dashboard (step 5) and run `publish-auth instagram` again.

**What it posts:**

| Calendar event | Instagram |
|---|---|
| Reel of a Short (`short:<name>:instagram`) | `media_type=REELS`, caption, `share_to_feed=true`, cover frame from `cover_frame` (`thumb_offset`, ms) |
| The main video's Reel (`instagram-post`), only for a main video of at most 3 minutes | the best vertical render (9:16, 4:5, 1:1) as a Reel shared to the grid; Instagram has no plain feed video |
| A short episode's or a meme's Reel (`instagram`) | its one video as a Reel shared to the grid |
| Announcement story (`announce:instagram`) | `media_type=STORIES` with the announcement image |

Every post carries the **AI info** label (`is_ai_generated=true`, available since June 2026); it can only be set when the post is created.

**Limits:** At most 50 API-published posts per account in a rolling 24 hours (the docs also name 100; the autopilot reads the live quota from `content_publishing_limit` and stops before the first call when it is used up). 400 containers per 24 hours; a container expires after 24 hours. Captions up to 2,200 characters, at most 5 hashtags per post (Instagram's rule since December 2025; `release` checks it).

**What the API cannot do** (these stay in the app):

- **Story stickers:** a story posted through the API has no link sticker, mention, or other sticker, and stickers cannot be added afterwards. The release-day story with the link sticker to the main video therefore stays a manual post; the announcement story needs none.
- **Captions on stories:** a story has no caption; the text is on the image.
- **The Reel cover after posting:** the cover is set at creation (`thumb_offset`, or `cover_url`) and cannot be changed later, in the app or through the API.
- **Music from Instagram's library, collaborators' approval, filters, and editing text overlays** in the Instagram editor.
- **Scheduling:** the API publishes immediately; the autopilot posts at the calendar time.

**Revoke:** Instagram app → Settings → Apps and websites → remove the app; or remove the tester in the Meta app dashboard. Then delete the `INSTAGRAM_*` lines from `.env`.
