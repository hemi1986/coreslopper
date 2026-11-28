# Release platforms: fields, limits, and links

What each platform takes for a release, as researched on 2026-11-21 from official help pages where they exist, and checked again on 2026-11-27 for formats, lengths, and texts ([platform video formats](research/platform-video-formats.md); `F<n>` cites its findings). **(unverified)** marks a figure only third parties state. Platforms change these often: `PLATFORM_LIMITS` in `packages/core/src/schema.ts` holds the enforced numbers, and `config/channel.yaml` can override them.

## Which file goes where

The release board assigns each file of the release folder to its posts:

| File | Goes to |
|---|---|
| `video/<slug>-16x9.mp4` (master) | YouTube main video; X release post (default); Spotify music video (beta, 16:9 only) |
| `video/<slug>-9x16.mp4`, `-4x5.mp4` or `-1x1.mp4` | The main video's Instagram Reel, only for a main video of at most 3 minutes; LinkedIn post |
| `shorts/<name>-9x16.mp4` | YouTube Shorts, TikTok, Instagram Reels, X posts of a Short, Instagram story |
| `shorts/<slug>-9x16.mp4` (vertical version) | The one Short of a horizontal episode of at most 3 minutes, on the same platforms |
| `video/<slug>-<master>.mp4` of a short episode or a meme | The one video: YouTube Shorts, TikTok, Instagram Reels, X, the microsite |
| `thumbnails/thumb-1.jpg` (2, 3) | YouTube thumbnail (Test & compare); YouTube post; a vertical episode over 3 minutes has only `thumb-1.jpg` |
| `shorts/<name>-thumb.jpg` / `-tiktok.jpg` | Shorts and Reel cover / TikTok cover (3:4) |
| `cover/<slug>-1080x1920.jpg` / `-1080x1440.jpg` | The cover / TikTok cover of a short episode or a meme |
| `streaming/cover-3000x3000.jpg` | Distributor; announcement; the main video's Reel cover |
| `streaming/canvas-9x16.mp4` | Spotify Canvas |

## YouTube (long-form)

| Field | Rule | Source |
|---|---|---|
| Title | 100 characters | [57404](https://support.google.com/youtube/answer/57404) |
| Description | 5,000 characters; the first ~100–150 show before "more" (unverified) | 57404 |
| Tags | "Minimal role" in discovery; 500 characters in total (unverified) | [146402](https://support.google.com/youtube/answer/146402) |
| Hashtags | Up to 3 shown above the title; more than 60 and all are ignored | [6390658](https://support.google.com/youtube/answer/6390658) |
| Chapters | First `00:00`, at least 3, ascending, each ≥ 10 s | [9884579](https://support.google.com/youtube/answer/9884579) |
| Thumbnail | Verified account; 16:9, 3840×2160 recommended, min. width 640; JPG/PNG; 50 MB desktop, 2 MB mobile | [72431](https://support.google.com/youtube/answer/72431) |
| End screen | Video ≥ 25 s; last 5–20 s; up to 4 elements; external link only in the Partner Program | [6388789](https://support.google.com/youtube/answer/6388789) |
| Cards | Up to 5; link cards only in the Partner Program | [6140493](https://support.google.com/youtube/answer/6140493) |
| Subtitles | `.srt`, `.vtt`, `.lrc` and others, UTF-8 | [2734698](https://support.google.com/youtube/answer/2734698) |
| AI disclosure | "Altered or synthetic content" required for realistic AI content and AI music in focus | [14328491](https://support.google.com/youtube/answer/14328491) |
| Premiere | Scheduled or instant; not for Shorts or above 1080p | [9080341](https://support.google.com/youtube/answer/9080341) |
| Pinned comment | Needs advanced features (phone verification and history) | [9891124](https://support.google.com/youtube/answer/9891124) |
| Links | Clickable in descriptions and comments; external links need advanced features; up to 14 channel links | [13748639](https://support.google.com/youtube/answer/13748639) |
| Posts (community) | Open to all channels except made-for-kids (unverified) | [7124474](https://support.google.com/youtube/answer/7124474) |
| Official Artist Channel | 3 official releases via a distributor; request through the distributor | [7336634](https://support.google.com/youtube/answer/7336634) |

## YouTube Shorts

| Field | Rule | Source |
|---|---|---|
| Duration | Square or vertical, up to 3 minutes; a 16:9 video stays long-form, also under 3 minutes | [15424877](https://support.google.com/youtube/answer/15424877), [F12](research/platform-video-formats.md) |
| Texts | Same fields and limits as long-form | 57404 |
| Thumbnail | Custom thumbnail from Studio on desktop; 9:16, 2160×3840 recommended; a vertical video with a 16:9 thumbnail shows an auto-generated 4:5 one | 72431, [F14](research/platform-video-formats.md) |
| Links | Not clickable in description or comments since 2023-08-31 | 13748639 |
| Related video | One clickable link to an own video; Studio → Content → Short → Related video | [14075157](https://support.google.com/youtube/answer/14075157) |
| Scheduling | Yes; no Premiere | 9080341 |
| Playlists and shows | A Short fits any playlist; a playlist of only Shorts (vertical or square, ≤ 180 s) can become a show ("Shorts series") in Studio, with a 16:9 banner and backdrop; a video belongs to one series playlist | [57792](https://support.google.com/youtube/answer/57792), [F13](research/platform-video-formats.md) |

The related video is the only clickable pointer from a Short to the main video. A short episode's YouTube checklist asks to add the Short to the series' playlist: `youtube_playlist: { title, url }` in `series.yaml`, named after the series without a title and linked once it has its URL. A missing URL is a TODO in `README.md` and the release checks ("YouTube playlist of the series"). Adding the Short stays a step in Studio; the series stays a plain playlist, not a show.

## TikTok

| Field | Rule | Source |
|---|---|---|
| Length | Up to 10 min through the Content Posting API (per creator); the support pages say up to 30 min in the app (unverified) | [Media transfer guide](https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide), [F18](research/platform-video-formats.md) |
| Caption | 2,200 characters; no primary source for a larger limit in the app | [Direct Post](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post), [F18](research/platform-video-formats.md) |
| Cover | The API picks a frame (`video_cover_timestamp_ms`); a cover image is uploaded in the app | [F19](research/platform-video-formats.md) |
| Hashtags | No official cap; 3–5 relevant ones (unverified) | — |
| AI label | Required for realistic AI image, audio, or video: "AI-generated" toggle | [TikTok support](https://support.tiktok.com/en/using-tiktok/creating-videos/ai-generated-content) |
| Own song as sound | Delivered by the distributor; claim the artist profile in TikTok for Artists | [MBW](https://musicbusinessworldwide.com/tiktok-just-launched-its-own-music-distribution-platform-soundon) |
| Bio link | 1,000 followers or a business account (unverified) | [Buffer](https://buffer.com/library/how-to-put-a-link-in-tiktok-bio/) |
| Caption links | Not clickable | — |
| Scheduling | TikTok Studio on the web, 15 min to 10 days ahead; carousels not | [TikTok](https://ads.tiktok.com/business/en/blog/introducing-video-scheduler-now-you-can-plan-tiktoks-in-advance) |
| Photo carousel | Up to 35 images (unverified) | — |

Pointers to YouTube: bio link, pinned comment, a text line in the caption or on the cover.

## Instagram

| Field | Rule | Source |
|---|---|---|
| Reels | Up to 20 min to record and edit, 15 min through the API; only Reels up to 3 min are recommended to non-followers; 9:16, 1080×1920 | [Instagram help](https://help.instagram.com/1038071743007909), [F2, F8](research/platform-video-formats.md) |
| Feed video | None: new video posts are shared as Reels, and the API knows only Reels, stories and carousels | [F1, F8](research/platform-video-formats.md) |
| Reel cover | 420×654 (1:1.55) recommended; not editable after upload; keep text in the centre 3:4 | [Instagram help](https://help.instagram.com/1038071743007909) |
| Profile grid | 3:4 tiles since January 2025 | [Business Today](https://www.businesstoday.in/technology/news/story/instagram-head-announces-big-changes-3-minute-reels-and-new-look-for-profile-grid-461527-2025-01-21) |
| Carousel | Up to 20 slides; all take the first slide's ratio; 1080×1350 (4:5) standard | [Storrito](https://storrito.com/resources/how-instagrams-20-slide-carousels-work-and-what-the-new-limits-are/) |
| Caption | 2,200 characters; ~125 show before "more" (unverified) | [Meta API](https://developers.secure.facebook.com/docs/instagram-api/reference/ig-user/media) |
| Hashtags | 5 per post or Reel since December 2025 | [Business Today](https://www.businesstoday.in/technology/news/story/no-more-hashtag-stuffing-instagram-limits-hashtag-usage-to-just-5-per-reel-and-post-507444-2025-12-19) |
| Collab posts | Up to 5 collaborators; cannot be scheduled | [Buffer](https://buffer.com/resources/instagram-collab-post/) |
| AI info | May be required for realistic video or AI vocals | [Meta](https://www.meta.com/help/artificial-intelligence/1783222608822690/) |
| Bio links | Up to 5 | [Meta](https://www.meta.com/help/subscriptions/29142271265407659/) |
| Stories | 9:16, up to 60 s per segment (3–60 s through the API); link sticker for all accounts, not through the API | [Instagram](https://about.instagram.com/blog/announcements/expanding-sharing-links-in-stories-to-everyone), [F6](research/platform-video-formats.md) |
| Scheduling | Native for professional accounts, up to 75 days ahead | [Instagram help](https://help.instagram.com/iphone-app/439971288310029) |

A story has no text field ([F7](research/platform-video-formats.md)); a story that shows a video takes a caption of at most 120 characters in the app (`limits.instagram.story_caption`), an image story none. The 120 characters are the user's observation in the app, not a primary source (HS-267). The release's Instagram posts are Reels only: the main video gets its Reel only when it lasts at most 3 minutes.

Pointers to YouTube: a story link sticker on release day, a bio link, a pinned comment; caption links are not clickable.

## Spotify for Artists

The release itself (audio, cover, ISRC, AI credits) goes through the distributor.

| Feature | Rule | Source |
|---|---|---|
| Canvas | 3–8 s loop, 9:16, 720–1080 px tall, MP4/JPG; no URLs, logos, calls to action, or repeated title; avoid lip-sync and fast cuts | [Canvas guidelines](https://support.spotify.com/artists/article/canvas-guidelines/) |
| Clips | New uploads ended 2026-06-17 | [Clips](https://support.spotify.com/us/artists/article/clips/) |
| Music video (beta) | 16:9, ≥ 1920×1080, 30 s–20 min, music-first, linked to one song; waitlist; Premium listeners only | [Uploading videos](https://support.spotify.com/us/artists/article/uploading-videos/) |
| Editorial pitch | At least 7 days before release; also places the song on followers' Release Radar; genre, mood, culture tags; ~500 characters (unverified) | [Pitching](https://support.spotify.com/us/artists/article/pitching-music-and-videos-to-playlist-editors/) |
| Countdown Page | Albums and EPs only, ≥ 3,000 monthly listeners | [Countdown Pages](https://support.spotify.com/us/artists/article/countdown-pages/) |
| Artist Pick | Song, album, music video, playlist, …; image ≥ 690×500; 180 days; Spotify content only | [Artist Pick](https://support.spotify.com/us/artists/article/artist-pick/) |
| Cover | 1:1, 640–10,000 px, JPG/PNG/TIFF, sRGB | [Cover art](https://support.spotify.com/us/artists/article/cover-art-requirements/) |
| Profile | Bio 1,500 characters; social links Instagram, Facebook, X, TikTok, Wikipedia; no YouTube or website field | [Artist bio](https://support.spotify.com/uk/artists/article/artist-bio) |
| Lyrics | Musixmatch Pro | [Lyrics](https://support.spotify.com/artists/article/lyrics/) |

Spotify has no link out to YouTube; the equivalent is the music video on Spotify itself.

## X

| Field | Rule | Source |
|---|---|---|
| Post | 280 characters free; 25,000 with Premium | [X help](https://help.x.com/en/using-x/x-premium) |
| Video | In the app 140 s free, up to 4 h with Premium; through the API up to 20 min, 125 min for Premium or verified accounts; ratio 1:3 to 3:1 | [X help](https://help.x.com/en/using-x/premium-longer-videos), [media upload](https://docs.x.com/x-api/media/quickstart/media-upload-chunked), [F9, F10](research/platform-video-formats.md) |
| Images | Up to 4 per post, 5 MB each | [X help](https://help.x.com/en/using-x/x-videos) |
| Alt text | 1,000 characters | [X help](https://help.x.com/en/using-x/picture-descriptions) |
| Links | X says it dropped the link penalty in July 2026; data still shows weak reach for link posts | [ppc.land](https://ppc.land/x-drops-year-old-link-penalty-musk-tells-zuckerberg-on-platform/) |
| Hashtags | 1–2 (unverified) | — |

The release post carries the whole main video natively (`x.media: main`, the default) or a Short it names; the board notes X Premium when the main video is over 140 s. The YouTube link goes in the optional reply.

## LinkedIn

| Field | Rule | Source |
|---|---|---|
| Post | 3,000 characters; ~210 (desktop) / ~140 (mobile) before "see more" (unverified) | [AuthoredUp](https://authoredup.com/blog/linkedin-character-limit) |
| Video | 3 s–15 min desktop, 10 min mobile, 5 GB, MP4/MOV (unverified) | [LinkedIn help](https://www.linkedin.com/help/linkedin/answer/a548372) |
| Document post | PDF/PPTX/DOCX, 100 MB, 300 pages | [LinkedIn help](https://www.linkedin.com/help/linkedin/answer/97459) |
| Links | Reach penalty contested (−19 % to −27 % in studies); link in the first comment shows no advantage | [Ordinal](https://www.tryordinal.com/blog/linkedin-link-penalty-study) |
| Hashtags | 0–3 (unverified) | — |

LinkedIn fits songs with a political, work, tech, or AI angle, told as a personal story with a native video; it is weak for plain fan promotion.

## API access (release autopilot)

What each platform lets the release autopilot do ([ADR 0029](adr/0029-release-autopilot.md); checked 2026-11). Setup steps are in [publishing.md](publishing.md#release-autopilot).

| Platform | By API | Not by API | Source |
|---|---|---|---|
| YouTube | Upload, thumbnail, `publishAt`, status, description, comments | Public or scheduled from an unaudited API project (stays private); Premiere; community posts; related video; pinning | [Videos](https://developers.google.com/youtube/v3/docs/videos), [audit](https://support.google.com/youtube/contact/yt_api_form), [quota](https://developers.google.com/youtube/v3/determine_quota_cost) |
| TikTok | Inbox draft; direct post with caption and `is_aigc` after the audit | Public direct post before the audit (private only); cover; pinned comment; scheduling | [Direct Post](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post), [guidelines](https://developers.tiktok.com/docs/en/content-sharing-guidelines) |
| Instagram | Reels, carousels, stories (own professional account, no App Review), `is_ai_generated`; no plain feed video ([F8](research/platform-video-formats.md)) | Uploads (media from a public URL only); story stickers; changing the cover later; scheduling | [Content publishing](https://developers.facebook.com/documentation/instagram-platform/content-publishing.md), [changelog](https://developers.facebook.com/documentation/instagram-platform/changelog.md) |
| X | Posts with video or images, replies; pay-per-use (~$0.015 a post, $0.20 with a URL) | Scheduling | [Pricing](https://docs.x.com/x-api/getting-started/pricing), [media upload](https://docs.x.com/x-api/media/quickstart/media-upload-chunked) |
| LinkedIn | Member posts with video or image (self-serve "Share on LinkedIn"); token 60 days; a refresh token only for approved partners, which the autopilot uses when LinkedIn grants one | Scheduling; refresh tokens for self-serve apps | [Posts API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api), [Videos API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/videos-api) |
| Spotify for Artists, distributors | — | Pitch, canvas, artist pick, delivery | — |

## Posting times

Vendor studies, mostly global, in CET; the channel's own analytics win. `config/release-schedule.yaml` holds the times a workspace uses.

- Instagram: Mon and Thu 20:00, then 15:00; weekdays around 12:00 ([Metricool](https://metricool.com/de/beste-zeiten-zum-posten-auf-social-media/), [Sprout](https://sproutsocial.com/de/insights/best-times-to-post-on-social-media/)).
- TikTok: 20:00 daily, Saturday 18:00 ([Metricool](https://metricool.com/de/beste-zeiten-zum-posten-auf-social-media/)).
- LinkedIn: weekdays 9–12, not on weekends ([Metricool](https://metricool.com/de/beste-zeiten-zum-posten-auf-linkedin)).
- X, YouTube: no study with CET times found.

## Release conventions

- Global Release Day: Friday, 00:00 local time ([IFPI via MBW](https://musicbusinessworldwide.com/global-release-day-begins-on-friday-july-10)).
- Distributor delivery 2–4 weeks ahead; the Spotify pitch at least 7 days ahead.
- Rollout practice: announcement with cover around T−14, teasers T−10 to T−1, release on Friday, then 2–4 Shorts a week for up to four weeks with the official sound.

## Legal notes for Germany

- **Impressum** (§ 5 DDG): commercial profiles need one within two clicks, usually through the bio link, with the legal name ([e-recht24](https://www.e-recht24.de/impressum/13396-impressum-social-media.html)).
- **Werbung/Anzeige** (§ 5a UWG): for posts with something in return; promoting one's own music on one's own profile is generally not covered ([Verbraucherzentrale](https://www.verbraucherzentrale.de/wissen/digitale-welt/soziale-netzwerke/influencerin-oder-nicht-wann-ein-beitrag-in-social-media-werbung-ist-39954)).
- **EU AI Act Art. 50**: transparency duties apply since 2026-08-02; deepfakes must be disclosed, with a lighter duty for evidently artistic works ([Goodwin](https://www.goodwinlaw.com/en/insights/publications/2026/08/alerts-technology-dpc-eu-ai-act-transparency-obligations-now-in-force)). Set the platform AI labels and add a line like "Video mit KI erstellt".
