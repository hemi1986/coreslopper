---
topic: platform-video-formats
question: "Which formats, lengths, texts and still assets do YouTube (long-form and Shorts), TikTok, Instagram (Reels, feed, Stories) and X accept for a video today, and which of them treat a vertical or horizontal video under 3 minutes as short-form?"
created: 2026-11-27
retrieved: 2026-11-27
expires: 2027-11-27
stack: []
---

# Research: platform-video-formats

## Question
Which formats, lengths, texts and still assets do YouTube (long-form and Shorts), TikTok, Instagram (Reels, feed,
Stories) and X accept for a video today, and which of them treat a vertical or horizontal video under 3 minutes as
short-form? Checked against `docs/release-platforms.md` (2026-11-21).

## Findings

Part A (Instagram, X) is F1–F11, part B (YouTube, TikTok, assets per orientation) is F12–F20. Two researcher runs;
help.instagram.com rendered only headings and help.x.com returned 403, so several part-A figures rest on search
snippets of official pages, and the TikTok support pages in part B were read only through search summaries.

### F1 – Since July 2022, new Instagram feed video posts under 15 min were shared as Reels; I found no current-status page
- **Statement:** Instagram announced in July 2022 that new video posts under 15 minutes would be shared as Reels. Older videos stayed videos. Private accounts' videos stay visible to followers only. The video and Reels profile tabs were to merge. Press paraphrases ("all videos under 15 minutes") are looser than the official wording. I found no current Help Center page that restates this rule or says what happens to a 16:9 or 4:5 video uploaded as a post. The "exceptions" question (carousels with video) is only partly answered. Carousels can hold video (F8), and Reels cannot be placed in carousels (F8).
- **Source:** Instagram for Business, "New Video Posts on Instagram Will Be Shared as Reels" – https://business.instagram.com/blog/instagram-video-now-instagram-reels (seen via search snippet only); Meta newsroom – https://about.fb.com/news/2022/07/new-ways-to-create-instagram-reels/ (snippet only)
- **Retrieved:** 2026-11-27
- **Tier:** 1
- **Confidence:** medium
- **Domain-model impact:** none. The "Instagram feed post of the release" (4x5/1x1 video) of `docs/release-platforms.md` is not confirmed as a separate non-Reel video post.

### F2 – Reel length: 20 min to record or edit, 3 min limit for recommendation to non-followers
- **Statement:** The Instagram Help Center (Reels article 1038071743007909) lists "20 minutes" as the maximum and "3 minutes recommended". Search snippets of the Help Center quote "You can record and edit videos up to 20 minutes" and "Reels over 3 minutes won't be recommended to new audiences". Instagram creators' guidance says "to be recommended, content has to be 3 minutes or less". The 3-minute Reel length was announced January 2025. The 20-minute camera was reported in Nov 2025 (PetaPixel, Tier 3). Boosting a Reel still requires 90 s or less per a Help Center snippet.
- **Source:** Instagram Help, Reels – https://help.instagram.com/1038071743007909 (topic list confirmed via fetch, full text not rendered); https://creators.instagram.com/blog/the-latest-with-instagram; PetaPixel 2025-11-25 https://petapixel.com/2025/11/25/instagram-updates-camera-so-you-can-film-20-minute-reels (Tier 3)
- **Retrieved:** 2026-11-27
- **Tier:** 1
- **Confidence:** medium
- **Domain-model impact:** contradicts the `docs/release-platforms.md` Instagram "Reels | Up to 3 min" row as a maximum. The 3 min figure is the recommendation threshold.

### F3 – Reel aspect ratios and cover (API-level facts are firm; UI-level wording is not)
- **Statement:** The Meta API accepts Reels with aspect ratio 0.01:1 to 10:1, 9:16 recommended, max width 1920 px, 23-60 fps, H.264/HEVC, AAC, VBR up to 25 Mbps. The Help Center page 1038071743007909 has cover topics (size, aspect ratio, grid crop, custom cover) but the fetcher did not render the numbers. The "420x654 (1:1.55)" and "3:4 grid since January 2025" of `docs/release-platforms.md` are not re-verified. No primary text found on how 16:9, 4:5 or 1:1 are displayed inside the Reels player.
- **Source:** Meta, IG User Media reference – https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media (Reels and Stories specs table)
- **Retrieved:** 2026-11-27
- **Tier:** 2
- **Confidence:** high
- **Confidence note:** for API specs, low for UI display and grid
- **Domain-model impact:** none

### F4 – API cover for Reels
- **Statement:** `cover_url` (Reels only): a public JPEG, max 8 MB, sRGB, 9:16 recommended. If not 9:16, the middle 9:16 region is used. When shared to the feed, the middle 1:1 square is used. `thumb_offset` (ms) selects a frame, default 0. If both are set, `cover_url` wins. A custom cover image is therefore possible via API.
- **Source:** Meta IG User Media reference (as F3)
- **Retrieved:** 2026-11-27
- **Tier:** 2
- **Confidence:** high
- **Domain-model impact:** none

### F5 – Caption 2,200; hashtags 5 (UI) vs "30" in the API doc
- **Statement:** The API reference states captions up to 2,200 characters, 30 hashtags and 20 @mentions, and that captions are not supported on carousel children. Instagram announced a 5-hashtag cap per post or Reel on 2025-12-19, with a gradual rollout (coverage Tier 3). The 5-hashtag cap is not confirmed in a Meta primary page. The API doc still says 30.
- **Source:** Meta IG User Media reference (as F3); https://www.socialmediatoday.com/news/instagram-implements-new-limits-on-hashtag-use/808309/ (Tier 3)
- **Retrieved:** 2026-11-27
- **Tier:** 2
- **Confidence:** high
- **Confidence note:** for 2,200; medium-low for the 5 cap
- **Domain-model impact:** none

### F6 – Stories (API): 3-60 s, 100 MB, 9:16 recommended, no stickers via API
- **Statement:** The API lists Story video as 3 to 60 seconds, 100 MB max, aspect 0.1:1 to 10:1 (9:16 recommended). Stories via API do not support stickers (link, poll, location) and expire after 24 h.
- **Source:** Meta IG User Media reference (as F3)
- **Retrieved:** 2026-11-27
- **Tier:** 2
- **Confidence:** high
- **Confidence note:** for API; the in-app Story length is not confirmed from a Help page.
- **Domain-model impact:** none

### F7 – Story text field, on-screen text limits in the Reels editor
- **Statement:** No primary source found on a story "caption" field, a max length for story text overlays, or a max for on-screen text in the Reels editor. The API has no caption for Stories.
- **Source:** none
- **Retrieved:** 2026-11-27
- **Tier:** 3
- **Confidence:** low
- **Domain-model impact:** the story text (`instagram.story`) of the upload data has no platform field behind it.

### F8 – Instagram API publishing: media types
- **Statement:** The `media_type` parameter lists CAROUSEL, REELS and STORIES. VIDEO is not listed. Carousels hold up to 20 images, videos or a mix, cropped to the first item's ratio (default 1:1). Reel duration via API is 3 s to 15 minutes, 300 MB. Reels cannot go in carousels. Limits: 400 containers per 24 h.
- **Source:** https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing and the IG User Media reference
- **Retrieved:** 2026-11-27
- **Tier:** 2
- **Confidence:** high
- **Domain-model impact:** "feed videos" as a standalone API type (the API row of `docs/release-platforms.md`) is not backed by the `media_type` table.

### F9 – X video via UI: 140 s / 512 MB free; Premium up to 4 h / 16 GB at 1080p (Android 10 min)
- **Statement:** The official help pages state (via snippets): non-subscribers can upload videos up to 140 seconds and 512 MB. Premium subscribers can upload videos shorter than 4 hours at 1080p, max 16 GB. A snippet says Premium on Android is limited to 10 minutes. Third parties disagree.
- **Source:** https://help.x.com/en/using-x/premium-longer-videos and https://help.x.com/en/using-x/x-videos (403 on fetch; seen via search snippets); https://routenote.com/blog/x-increases-video-length/ (Tier 3)
- **Retrieved:** 2026-11-27
- **Tier:** 1
- **Confidence:** medium
- **Domain-model impact:** none

### F10 – X API v2 media: 20 min / 8 GB default, 125 min / 16 GB Premium or verified; ratio 1:3 to 3:1
- **Statement:** For `tweet_video` the limits are 0.5 s to 20 min and 8 GB for default accounts, and up to 125 min and 16 GB for Premium or verified posting users. Posting a video over the user's cap returns 403 at post time. Limits follow the posting user's Premium status. Video aspect ratio must be between 1:3 and 3:1 (16:9 and 9:16 both inside). The legacy v1 best-practices page still says 0.5 to 140 s.
- **Source:** https://docs.x.com/x-api/media/quickstart/media-upload-chunked; https://docs.x.com/x-api/media/quickstart/best-practices (snippet); legacy https://developer.x.com/en/docs/x-api/v1/media/upload-media/uploading-media/media-best-practices
- **Retrieved:** 2026-11-27
- **Tier:** 2
- **Confidence:** medium
- **Domain-model impact:** `docs/release-platforms.md` says "Video 140 s free" without the API figure.

### F11 – X post text length
- **Statement:** "280 free, 25,000 Premium" (help.x.com/en/using-x/x-premium) is not re-verified; the page returned 403.
- **Source:** https://help.x.com/en/using-x/x-premium (403)
- **Retrieved:** 2026-11-27
- **Tier:** 1
- **Confidence:** low
- **Domain-model impact:** none

### F12 – Shorts today: square or vertical, up to 3 min, uploaded on/after 2024-10-15; 16:9 stays long-form
- **Statement:** A video counts as a Short if it has a "square or vertical aspect ratio up to three minutes" and was uploaded on or after 2024-10-15. Official Artist Channels use the cutoff 2025-12-08. A wider format such as 16:9 keeps a video long-form, even at ≤3 min. Shorts have a max resolution of 1080p. Whether a 9:16 video over 3 min is long-form is inferred from the rule, not stated (medium).
- **Source:** Understand three-minute YouTube Shorts – https://support.google.com/youtube/answer/15424877; Shorts help – https://support.google.com/youtube/answer/10059070
- **Retrieved:** 2026-11-27
- **Tier:** 2
- **Confidence:** high
- **Domain-model impact:** none

### F13 – Shorts in playlists: normal playlists work; Shorts-only playlists can become a "show" (series)
- **Statement:** A Short can be saved to any playlist. Reordering is not available for playlists containing only Shorts. A playlist can become a show via Studio → Content → Playlists → Options → "Add show features". A Shorts series requires a playlist of only Shorts, each portrait or square and ≤180 s. Shows have seasons and episodes, serial or non-serial, and need a 16:9 banner and a 16:9 backdrop (3840x2160, JPG/PNG, ≤10 MB). `playlistItems.insert` costs 50 quota units; its error `videoAlreadyInAnotherSeriesPlaylist` suggests a video can belong to only one series playlist. Whether the API can create shows was not found.
- **Source:** https://support.google.com/youtube/answer/57792; https://support.google.com/youtube/answer/16590581; https://developers.google.com/youtube/v3/docs/playlistItems/insert
- **Retrieved:** 2026-11-27
- **Tier:** 2
- **Confidence:** high
- **Confidence note:** medium for the API
- **Domain-model impact:** none

### F14 – Custom Shorts thumbnail exists; 9:16 recommended
- **Statement:** In Studio, open the Short, then Edit → Thumbnail → Upload file. Recommended: Shorts 9:16, 2160x3840, min height 640; videos 16:9, 3840x2160, min width 640; JPG/PNG. A vertical video with a 16:9 custom thumbnail gets an auto-generated 4:5 thumbnail on the home, explore and subscription pages.
- **Source:** Custom video thumbnails – https://support.google.com/youtube/answer/72431
- **Retrieved:** 2026-11-27
- **Tier:** 2
- **Confidence:** high
- **Domain-model impact:** the 16:9 thumbnails ADR 0018 makes per video do not fit a vertical episode.

### F15 – Vertical long-form (>3 min)
- **Statement:** A vertical video with a 16:9 thumbnail shows an auto-generated 4:5 thumbnail on home, explore and subscription pages. 72431 lists 16:9 for "Videos" and gives no separate ratio for vertical long-form.
- **Source:** https://support.google.com/youtube/answer/72431
- **Retrieved:** 2026-11-27
- **Tier:** 2
- **Confidence:** medium
- **Domain-model impact:** none

### F16 – Shorts metadata
- **Statement:** Title at most 100 characters, description at most 5,000. Hashtags: "#" plus no spaces, in titles and descriptions; the 3 most engaging show above the title; more than 60 and all are ignored. No `#shorts` requirement found. Tags "play a minimal role" and are entered under SHOW MORE; their separator and limit are not stated. Related video: a link in the Shorts player to a video, Short or live of the same channel; needs advanced features.
- **Source:** https://support.google.com/youtube/answer/57404; https://support.google.com/youtube/answer/6390658; https://support.google.com/youtube/answer/146402; https://support.google.com/youtube/answer/14075157
- **Retrieved:** 2026-11-27
- **Tier:** 2
- **Confidence:** high
- **Confidence note:** for limits; low for the tags format and `#shorts`
- **Domain-model impact:** none

### F17 – Teasers
- **Statement:** No documented "Shorts trailer / teaser" format exists. Documented tools: the related video link, end screens and cards, and "Drive to Long-Form" in Shorts ads. Premiere is not available for Shorts.
- **Source:** https://blog.youtube/creator-and-artist-stories/transitioning-your-long-form-content-to-youtube-shorts/; https://blog.youtube/creator-and-artist-stories/youtube-related-videos-traffic-guide/; https://support.google.com/google-ads/answer/16041302
- **Retrieved:** 2026-11-27
- **Tier:** 2
- **Confidence:** medium
- **Domain-model impact:** none

### F18 – TikTok length, caption, series, playlists
- **Statement:** Length: support summary says up to 30 min; the Content Posting API media guide says creators post 3 min, some 5 or 10 min, the upload endpoint up to 10 min. Caption: the Direct Post reference says `title` is max 2,200 UTF-16 runes; a newsroom summary also says 2,200; no primary source for 4,000. Series (paid content): 18+, 10,000+ followers, up to 80 videos. Playlists: for creators over 10k followers, each video in only one playlist. No official statement found on 16:9 display, hashtag guidance or cover upload in the app.
- **Source:** https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide; https://developers.tiktok.com/doc/content-posting-api-reference-direct-post; https://newsroom.tiktok.com/en-us/longer-videos; https://www.tiktok.com/creator-academy/article/tool-playlists-intro (search summary); https://support.tiktok.com/en/business-and-creator/tiktok-series/about-tiktok-series (search summary)
- **Retrieved:** 2026-11-27
- **Tier:** 2
- **Confidence:** high
- **Confidence note:** for API figures; low for in-app caption, length and eligibility
- **Domain-model impact:** `docs/release-platforms.md` "4,000 characters in the app" is not backed by a primary source.

### F19 – TikTok Content Posting API
- **Statement:** `video_cover_timestamp_ms` selects the cover frame; there is no custom cover image upload for videos. Video: MP4/WebM/MOV, H.264 recommended, 23–60 fps, 360–4096 px per side, up to 4 GB, up to 10 min (per creator `max_video_post_duration_sec`). Unaudited clients post private only.
- **Source:** https://developers.tiktok.com/doc/content-posting-api-reference-direct-post; https://developers.tiktok.com/doc/content-posting-api-get-started; https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide
- **Retrieved:** 2026-11-27
- **Tier:** 2
- **Confidence:** high
- **Domain-model impact:** none

### F20 – Asset formats per orientation
- **Statement:** YouTube: Shorts 9:16 2160x3840 thumbnail, long-form 16:9 3840x2160 (F14). Show artwork: 16:9 banner and backdrop (F13). No primary source for TikTok cover ratio, Instagram Reel cover in the app, or X video thumbnail. Whether TikTok and Reels treat horizontal video as short-form: no statement found; YouTube treats it as long-form (F12).
- **Source:** see F12–F14, F19
- **Retrieved:** 2026-11-27
- **Tier:** 2
- **Confidence:** medium
- **Domain-model impact:** the rule "≤3 min episode = Short on YouTube" holds only for a vertical or square master.

## Conflicts, caveats and gaps
- Reels maximum: Help Center 20 min (record/edit), 3 min (recommended), API 15 min.
- Instagram hashtags: 5 (announced Dec 2025, Tier 3) vs 30 (current API reference text).
- X length: UI free 140 s vs API default 20 min vs legacy v1 140 s; UI Premium 4 h vs API 125 min.
- TikTok length: 30 min (support summary) vs 10 min (API) vs 10/60 min in `docs/release-platforms.md`.
- Unconfirmed from primary sources: whether a 16:9 or 4:5 feed upload becomes a Reel and how it is cropped; any story text or on-screen text limit; the 3:4 grid; the 420x654 cover; X 25,000 characters; X 9:16 vs 16:9 display; Shorts in the Shorts player of a playlist; YouTube API support for shows.
- help.instagram.com rendered only headings and help.x.com returned 403; TikTok support pages only as search summaries.

## Open questions for the grilling
- Should the release board treat an Instagram feed video and a Reel as one post type?
- Which Reel length figure counts: 3 min (recommendation), 15 min (API) or 20 min (in-app)?
- Does the X post depend on a Premium account (140 s vs 4 h)?
- Should the story text field exist at all, given no source documents one?
- Is a square or 9:16 master required for every Short episode planned for YouTube?
- Are horizontal (16:9) episodes posted on Shorts, TikTok and Reels at all?
- Should the series playlist be a plain playlist or a YouTube show (Shorts series)?
- Is a separate TikTok cover needed when the API accepts only a timestamp?
