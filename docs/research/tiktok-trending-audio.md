---
topic: tiktok-trending-audio
question: "Can a meme use TikTok's trending audio – is there an API, what do TikTok's and the music labels' terms allow, and can such a sound leave TikTok at all?"
created: 2026-11-25
retrieved: 2026-11-25
expires: 2027-11-25
stack: ["typescript@5.9.3", "node@24.13.1"]
---

# Research: TikTok trending audio

## Question

Can coreslopper find TikTok's trending sounds and use one in a meme — (1) which official TikTok APIs list trending sounds/audio and under what conditions, (2) may a trending sound be downloaded and mixed into a rendered MP4 outside TikTok, (3) can the publish adapter attach a sound to a draft or post?

## Findings

### F1 – The documented TikTok developer products contain no endpoint that lists the general "Sounds" library or trending sounds
- **Statement:** The developer doc index enumerates Share Kit, Login Kit, Content Posting API, Research API, Display API, Embed, Data Portability API, Green Screen Kit and Commercial Content API. None is a music/sound catalogue; no "sounds", "music chart" or "trending audio" reference exists in any of their API references. For the general in-app library (the one a creator picks from in the TikTok app) there is no public endpoint. This is evidence of absence across the public docs, not a proof about partner-only endpoints (see caveats).
- **Source:** TikTok for Developers – doc index and product list, e.g. https://developers.tiktok.com/doc/research-api-specs-query-videos (footer product list) ; https://developers.tiktok.com/doc/content-posting-api-reference-direct-post (nav)
- **Retrieved:** 2026-11-25
- **Tier:** 2
- **Confidence:** high (for the public docs); no official document states "there is no such API"
- **Domain-model impact:** none – supports ADR 0051's "Trending platform audio stays out until HS-259 is answered" as far as discovery goes

### F2 – The Research API exposes a `music_id` per video and can filter by it, but no track name, artist or ranking
- **Statement:** `POST /v2/research/video/query/` (scope `research.data.basic`) returns `music_id` (int64 "the music_id used in the video") and accepts `music_id` as a query condition field. No endpoint resolves a `music_id` to a title/artist, and no popularity ranking of sounds is returned. Access is by application only: "independent and academic researchers who conduct research on a non-for-profit basis", region-limited ("When will TikTok's Research Tools be available in my country?"), quota 1000 requests/100,000 records per day, tokens expire after two hours, and creators/advertisers/commercial users are explicitly ineligible.
- **Source:** TikTok for Developers – Query Videos https://developers.tiktok.com/doc/research-api-specs-query-videos ; About Research Tools https://developers.tiktok.com/doc/about-research-api ; Research API FAQ Q5–Q8 https://developers.tiktok.com/doc/research-api-faq
- **Retrieved:** 2026-11-25
- **Tier:** 2
- **Confidence:** high
- **Domain-model impact:** none – a commercial CLI/agent pipeline (ADR 0009/0023) cannot use this product to pick a sound

### F3 – The Display API returns no music fields at all
- **Statement:** The Display API video object's requestable fields are `id, create_time, cover_image_url, share_url, video_description, duration, height, width, title, embed_html, embed_link, like_count, comment_count, share_count, view_count, is_aigc`; scope `video.list`. No `music_id` or sound metadata. The oEmbed player URL carries `music_info=1` as a display flag only.
- **Source:** TikTok for Developers – Query Videos (Display) https://developers.tiktok.com/doc/tiktok-api-v2-video-query
- **Retrieved:** 2026-11-25
- **Tier:** 2
- **Confidence:** high
- **Domain-model impact:** none

### F4 – The Content Posting API Direct Post schema has no music, sound or `music_id` parameter
- **Statement:** `POST /v2/post/publish/video/init/` (scope `video.publish`) accepts `post_info` = `privacy_level`, `title` (caption), `disable_duet`, `disable_stitch`, `disable_comment`, `video_cover_timestamp_ms`, `brand_content_toggle`, `brand_organic_toggle`, `is_aigc`, plus `source_info` (`FILE_UPLOAD` or `PULL_FROM_URL`). No field selects a sound; the audio is whatever the uploaded file contains. Page last updated 2026-11-25.
- **Source:** TikTok for Developers – Direct Post https://developers.tiktok.com/doc/content-posting-api-reference-direct-post (Request → Body)
- **Retrieved:** 2026-11-25
- **Tier:** 2
- **Confidence:** high
- **Domain-model impact:** confirms ADR 0023's consequence "the TikTok caption, sound, and cover, and the final publish stay manual" for the direct path; the ADR's wording should be read as covering both paths

### F5 – The inbox upload (`video.upload`) accepts no `post_info` at all
- **Statement:** `POST /v2/post/publish/inbox/video/init/` (scope `video.upload`) takes only `source_info` (`source`, `video_size`, `chunk_size`, `total_chunk_count`, or `video_url`); there is no caption, cover or sound field. The file is uploaded as-is and the user "must click on inbox notifications to continue the editing flow in TikTok and complete the post". The docs do not state whether the draft preserves the file's audio track; since no audio parameter exists, the draft's audio is whatever the MP4 contains.
- **Source:** TikTok for Developers – Upload https://developers.tiktok.com/doc/content-posting-api-reference-upload-video (Overview, Request → Body) ; last updated 2026-08-04
- **Retrieved:** 2026-11-25
- **Tier:** 2
- **Confidence:** high for the schema; medium for the audio-track inference (not stated)
- **Domain-model impact:** matches `TikTokPublisher.inboxUpload` and its manual step; the manual step's wording ("add sound") is consistent with the API

### F6 – The only music field in the Content Posting API is `auto_add_music` for photo posts, and it does not choose a track
- **Statement:** `POST /v2/post/publish/content/init/` (photos) accepts `post_info.auto_add_music` (bool, "Only works for post_mode = DIRECT POST"): "recommended music will be automatically added to photos, and users can later choose to change the post's music in TikTok". No ID, no track choice, not available for `MEDIA_UPLOAD` (drafts) or for videos.
- **Source:** TikTok for Developers – Photo https://developers.tiktok.com/doc/content-posting-api-reference-photo-post (Post Info Object)
- **Retrieved:** 2026-11-25
- **Tier:** 2
- **Confidence:** high
- **Domain-model impact:** none – not a "choose a sound" capability

### F7 – The TikTok Business API does list "popular tracks from the Commercial Music Library" and can attach one at publish
- **Statement:** `GET /open_api/v1.3/discovery/cml/trending_list/` (params `business_id`, `genre`, `country_code`, `date_range` = 1/7/30/90 DAY) returns per track `commercial_music_id`, `commercial_music_name`, `artist`, `duration`, `genres`, `rank_position` (regional), `trending_history` (up to 30 days), `preview_url` (valid 6 h), `full_duration_song_clip` / `trending_song_clip` with `song_clip_id` ("can be passed to `music_sound_id` in /business/video/publish/") and `top_video_list`. `POST /open_api/v1.3/business/video/publish/` accepts `post_info.music_sound_info` = `music_sound_id`, `music_sound_volume` (0–100), `music_sound_start`, `music_sound_end`, `video_original_sound_volume`. Conditions visible in the reference: `business_id` is the `open_id` from `/tt_user/oauth2/token/`; transfer is `video_url` only (`PULL_FROM_URL`), 3–600 s, ≤1 GB, verified domain. This is the **TikTok for Business / API for Business** product, not the consumer Content Posting API.
- **Source:** TikTok for Business API docs – "Get popular tracks from the Commercial Music Library" (listed in https://business-api.tiktok.com/portal/docs/creative-reports/v1.3) and "Post videos"; text read via the reference-mirroring Go port: https://github.com/bububa/tiktok-business/blob/main/model/discovery/cml_trending_list.go ; https://github.com/bububa/tiktok-business/blob/main/model/business/video/publish.go
- **Retrieved:** 2026-11-25
- **Tier:** 2 (docs) / 3 (the mirror I could actually read)
- **Confidence:** medium – the official portal is JS-only and timed out on every fetch; the endpoint names and field semantics come from the mirror and a search-index snippet of the official doc page
- **Domain-model impact:** conflicts with a blanket reading of ADR 0023 ("sound stays manual") – there *is* an official API that attaches a sound; but it is a different product (Business account OAuth, `business_id`), a different catalogue (CML, not trending Sounds) and a different transport (public URL)

### F8 – On the Business API, a draft discards the chosen sound
- **Statement:** `post_info.upload_to_draft: true` ("If true, other fields in post_info are ignored") needs a `video.upload`-scoped token; the same is stated for the photo endpoint's `is_draft`. So the only sound-carrying path is a direct public post, not a draft.
- **Source:** as F7 – https://github.com/bububa/tiktok-business/blob/main/model/business/video/publish.go (PostInfo.UploadToDraft) ; https://github.com/bububa/tiktok-business/blob/main/model/business/photo/publish.go (PostInfo.IsDraft)
- **Retrieved:** 2026-11-25
- **Tier:** 3 (mirror of Tier 2 text)
- **Confidence:** medium
- **Domain-model impact:** none for the current adapter; relevant if a Business-API path were ever considered

### F9 – Commercial Music Library tracks are a different, commercially pre-cleared catalogue and may only be used inside TikTok
- **Statement:** CML Terms: "You may only post or share videos that include Commercial Sounds within TikTok and by using the sharing features made available to TikTok users. Commercial Uses outside of TikTok are not permitted and no rights are granted by TikTok for such uses." Also: no distribution of the sound separately from the video; per-track "Usable Placements" in the Creative Center web portal restrict platforms, and a platform not listed is "not permitted"; TikTok may mute or remove videos if it loses the rights. The Music Terms confirm: "Unlike Sounds, Commercial Sounds are made available to brands, businesses… for commercial purposes"; "Any uses outside of the Platform require you to obtain separate permission and license the necessary rights directly from all necessary rights holders."
- **Source:** TikTok – Commercial Music Library User Terms https://www.tiktok.com/legal/page/global/commercial-music-library-user-terms/en ; Music Terms of Service https://www.tiktok.com/legal/page/global/music-terms-eea/en (§3, §5)
- **Retrieved:** 2026-11-25
- **Tier:** 1
- **Confidence:** high
- **Domain-model impact:** a CML track in the `sound.yaml` library could not be mixed offline and re-uploaded as a file; only API-side attachment *within* TikTok is contemplated

### F10 – The general "Sounds" library is licensed for personal, non-commercial use inside TikTok only, with no rights granted otherwise
- **Statement:** "Sounds are made available to individual users to include in their videos, so long as the videos are only for personal entertainment and non-commercial purposes"; commercial use is prohibited without separate rights. Also: no alterations of "the fundamental character" of the music unless you have the rights; no stand-alone audio; duration limits ("uses of music up to one minute in length are generally permitted"); "no rights in the music—either in the sound recordings or the underlying compositions—are licensed to you under the TikTok Terms of Service or these Music Terms" except as expressly set out. Effective July 2025 (EEA/UK/CH version; the global pages are separate).
- **Source:** TikTok Music Terms of Service https://www.tiktok.com/legal/page/global/music-terms-eea/en (§2, §3, §4)
- **Retrieved:** 2026-11-25
- **Tier:** 1
- **Confidence:** high
- **Domain-model impact:** conflicts with treating trending audio as an ordinary library sound whose "licence is the user's call" (ADR 0051): there is no licence to record, only an in-app use permission

### F11 – TikTok's Terms forbid downloading/copying its content and automated extraction
- **Statement:** Legacy global ToS (US 2019 / EEA 2020 versions still served): TikTok Content, including "audio, videos, music", "may not be downloaded, copied, reproduced, distributed… or otherwise exploited for any purpose whatsoever without our… prior written consent", and "NO RIGHTS ARE LICENSED WITH RESPECT TO SOUND RECORDINGS AND THE MUSICAL WORKS EMBODIED THEREIN THAT ARE MADE AVAILABLE FROM OR THROUGH THE SERVICE." The current EEA ToS (last updated July 2026) forbids users to "extract any data or content from the Platform using any automated system or software that is not provided by TikTok or approved in writing by TikTok".
- **Source:** TikTok Terms of Service (global, legacy) https://www.tiktok.com/legal/page/global/terms-of-service/en (§5, §7) ; TikTok Terms of Service EEA/UK/CH https://www.tiktok.com/legal/page/eea/terms-of-service/en (§4.5)
- **Retrieved:** 2026-11-25
- **Tier:** 1
- **Confidence:** high
- **Domain-model impact:** rules out scraping the app/web for trending sounds as an implementation route, independent of licensing

### F12 – API posting requires the user to confirm they hold all music licences (or that there is no music)
- **Statement:** Content Sharing Guidelines require, before the publish button, a declaration: "By posting, you agree to TikTok's Music Usage Confirmation". That confirmation reads: "You confirm that either (a) there is no copyright protected music in the video or (b) you have obtained and paid for all necessary licenses (including in respect of rights in the musical compositions and the master recordings…) to use the music as part of this post on the TikTok platform. If you cannot confirm (a) or (b)… please do not accept." Note: "If you post anyway, the post might be taken down."
- **Source:** Content Sharing Guidelines https://developers.tiktok.com/doc/content-sharing-guidelines (Required UX Implementation, note before the publish button) ; Music Usage Confirmation https://www.tiktok.com/legal/page/global/music-usage-confirmation/en
- **Retrieved:** 2026-11-25
- **Tier:** 1
- **Confidence:** high
- **Domain-model impact:** a render that embeds an unlicensed trending song cannot be posted through an app that follows these guidelines; the confirmation is (a) or (b), with no third option

### F13 – Enforcement is audio recognition plus muting/removal
- **Statement:** "You acknowledge that our audio recognition system may detect unauthorized uses of music and your content may be muted"; TikTok "may remove or mute your video if we have reason to believe your use of music is unauthorized". CML Terms add take-down/muting if TikTok loses the rights to a Commercial Sound.
- **Source:** Music Terms §8 https://www.tiktok.com/legal/page/global/music-terms-eea/en ; CML User Terms https://www.tiktok.com/legal/page/global/commercial-music-library-user-terms/en
- **Retrieved:** 2026-11-25
- **Tier:** 1
- **Confidence:** high
- **Domain-model impact:** none

### F14 – "Upload your own music" (an MP4 whose audio already contains the song) is contemplated but conflicts with the "you must hold the rights" clause
- **Statement:** §3 offers a third route: "Upload your own music… you can also upload audio from your own personal device, such as audio that contains music we've licensed for use on the Platform… ('Original Sounds')". But §2 says: "If you include in your video a song that was not chosen from the licensed library, then you confirm that you are the creator of that music and/or that you have all the rights and permissions needed to use that music." Whether an MP4 rendered elsewhere with a trending song embedded is "an Original Sound" (permitted form) or "a song not chosen from the licensed library" (needs rights) is not resolved by the text.
- **Source:** Music Terms §2 and §3 https://www.tiktok.com/legal/page/global/music-terms-eea/en
- **Retrieved:** 2026-11-25
- **Tier:** 1
- **Confidence:** medium (both readings are supported by the same document)
- **Domain-model impact:** conflicts with `AGG-LibrarySound`'s licence model – the domain has no term for "use permitted in-app only, no rights to the recording"

## Conflicts, caveats and gaps

- **Business API evidence is second-hand.** `business-api.tiktok.com` and `ads.tiktok.com` refused to render (JS-only portal, repeated timeouts). F7/F8 rest on the official doc page titles visible in a search index and on a Go SDK that reproduces the reference text; the access conditions (app review, which scopes, whether an agency/advertiser account is required for the Discovery permission) could not be retrieved and are unverified.
- **Two catalogues, easily confused.** "Trending sounds" in the app = the general Sounds library (F10). "Trending tracks" in the Business API = CML tracks (F7/F9). No official document says the Business API can see or attach a general Sounds track, and no document maps a Research API `music_id` to a CML `commercial_music_id`.
- **Undocumented endpoints are not evidence of permission.** Several vendors advertise "TikTok trending sounds" APIs and `musicSoundInfo` on posting (e.g. bundle.social, TikHub, Ensembla). These are scrapers or Business-API resellers; their existence does not make the general Sounds library licensable. Tier 3, not used for any statement above.
- **Regional variance is not enumerable by API.** The CML Terms put per-track restrictions in the web portal's "Usable Placements"; the Business API response (F7) carries rank, history and a 6-hour preview URL but no placement or territory restrictions. EU/UK/CH has its own Music Terms (July 2025) and its own ToS (July 2026); the global pages still served are older versions (US 2019, EEA 2020).
- **The 6-hour `preview_url` is not a download licence.** It is a preview for auditioning; CML Terms forbid distributing the sound separately from the video and forbid uses outside TikTok.
- **"No alterations or modifications"** (F10) clearly covers remixing/pitching; whether lowering a track under speech counts as altering "the fundamental character" is not defined.
- **Gap:** no primary source states whether the inbox draft (F5) preserves or strips the uploaded file's audio track; only the absence of any audio field is documented.
- **Gap:** no source addresses meme-length (<30 s) usage specifically; only the general "up to one minute" guidance.
- **File note (2026-11-25, after retrieval):** F1's domain-model impact quotes ADR 0051 as it read on 2026-11-22
  ("Trending platform audio stays out until HS-259 is answered"). ST-019 resolved HS-259 in the same change and the
  ADR now records the answer; the quote is the pre-resolution wording, not the current text. F7's tier is split
  because the official portal could not be fetched; the readable evidence is the mirror, so treat F7/F8 as Tier 3.

## Open questions for the grilling

- Is a coreslopper meme a personal, non-commercial post, or does the account/brand make it a commercial use (which would move everything to the CML)?
- If the only licensed path is "sound added in the TikTok app", is a manual step in the release (like the caption today) acceptable for memes, or must the rendered MP4 be self-contained?
- Does the user ever hold their own label/publisher licence for a trending track, and if so, does that satisfy the Music Usage Confirmation's option (b) for a file rendered offline?
- Is a second TikTok product (Business API, `business_id`, CML tracks, PULL_FROM_URL) inside the product's scope at all, given ADR 0023's one-adapter, one-OAuth-per-platform decision?
- Should `sound.yaml` carry a distinct licence value for "platform audio, use in-app only" instead of the current `unknown` default?
- Which regional terms govern the user's account — EEA/UK/CH or the global pages — and does the release need to record that choice?
