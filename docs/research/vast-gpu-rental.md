---
topic: vast-gpu-rental
question: "How does a client rent, reach, protect and destroy a vast.ai GPU instance running the MiniMax H3 ComfyUI template through the vast.ai REST API?"
created: 2026-11-28
retrieved: 2026-11-28
expires: 2027-11-28
stack: []
---

# Research: vast-gpu-rental

## Question
How does a client rent, reach, protect and destroy a vast.ai GPU instance running the MiniMax H3 ComfyUI template
through the vast.ai REST API? Two researcher runs (web-fetch) on 2026-11-28. The template console page
(`cloud.vast.ai/?template_id=…`) is JavaScript-only and was not readable, so the template's own ports, env and
provisioning are not in these findings.

## Findings

### F1 – MiniMax H3 on vast.ai is a ComfyUI template for one RTX PRO 6000
- **Statement:** Tags "Video", "ComfyUI"; 33B parameters; "MiniMax H3 Community License Agreement". "Audio-video foundation model generating up to 2K 24fps clips with natively synchronized stereo audio from text, image, or reference inputs". Input modes: text-only, first-frame, last-frame, first-and-last-frame, omni-reference; output 24 FPS, 4 to 15 seconds, stereo 32 kHz audio; aspect ratios 21:9, 16:9, 4:3, 1:1, 3:4, 9:16. Checkpoints H3-Base-FL2VA and H3-Base-Ref2VA (up to 9 images, 3 video clips, 3 audio clips, 12 files max, 15 s total), BF16, CFG-distilled; the open-weights release generates 768p. Recommended hardware "1xRTX PRO 6000 S". Deploy link `https://cloud.vast.ai/?template_id=6c54167e40e8ceed220393d585126a1c`. "MiniMax H3 runs in ComfyUI through native nodes added in ComfyUI 0.30.0, with text-to-video, image-to-video, and reference-to-video workflow templates." Repackaged weights at `huggingface.co/Comfy-Org/MiniMax-H3`. The hosted H3-Context-IR prompt preprocessor is not part of the open release. Lip-sync is not mentioned.
- **Source:** vast.ai model page – https://vast.ai/model/minimax-h3
- **Retrieved:** 2026-11-28
- **Tier:** 1
- **Confidence:** high
- **Domain-model impact:** a second ComfyUI server (rented) beside the local one; no Pika LoRA on it.

### F2 – Authentication and base URL of the REST API
- **Statement:** "Authorization: Bearer $VAST_API_KEY"; a query parameter `?api_key=` also works. Keys are created at `cloud.vast.ai/manage-keys/` and do not expire by default; scoped keys exist (`user_read`, `instance_read`, `instance_write`, …). Docs give the base URL `https://console.vast.ai/api/v0`; the developers page examples use `https://cloud.vast.ai/api/v0`.
- **Source:** https://docs.vast.ai/api-reference/introduction; https://docs.vast.ai/api-reference/authentication; https://vast.ai/developers/api
- **Retrieved:** 2026-11-28
- **Tier:** 1
- **Confidence:** medium (two base URLs)
- **Domain-model impact:** none

### F3 – Searching offers
- **Statement:** `POST /api/v0/bundles/` with a JSON body; operators eq, neq, gt, lt, gte, lte, in, notin; fields include `gpu_name` (`{"in": ["RTX_4090"]}`), `num_gpus`, `gpu_ram` (MB in REST), `dph_total`, `reliability`, `geolocation`, `verified`, `rentable`, `rented`, `type` (`ondemand` | `bid` | `reserved`), `disk_space`, `storage_cost`, `inet_down`/`inet_up`, `cuda_max_good`, `limit`, `order` (list of `[field, "asc"|"desc"]`). Response `{"offers": [...]}`; the offer `id` is used to create. The developers page example uses GET with `q=`, which conflicts with the POST in the docs.
- **Source:** https://docs.vast.ai/api-reference/search/search-offers.md
- **Retrieved:** 2026-11-28
- **Tier:** 1
- **Confidence:** medium
- **Domain-model impact:** none

### F4 – Creating an instance from an offer and a template
- **Statement:** `PUT /api/v0/asks/{offer_id}/`; body fields `image` (required unless `template_hash_id`), `template_hash_id`, `label`, `disk` (GB, default 8), `runtype`, `target_state`, `price` (bid only), `env` (JSON object; port mappings as keys like `"-p 8188:8188": "1"`), `onstart` (max 4048 characters), `args_str`, `use_jupyter_lab`, `jupyter_dir`, `image_login`, `cancel_unavail`, `vm`, `volume_info`. The response's `new_contract` is the instance ID. Launching with `template_hash_id`: request fields override template scalar fields; `env` is merged.
- **Source:** https://docs.vast.ai/api-reference/creating-instances-with-api; https://docs.vast.ai/api-reference/creating-and-using-templates-with-api
- **Retrieved:** 2026-11-28
- **Tier:** 1
- **Confidence:** high
- **Domain-model impact:** none

### F5 – Instance status, list, stop and destroy
- **Statement:** `GET /api/v0/instances/{id}/` returns `{"instances": {...}}` with `actual_status`, `intended_status`, `cur_state`, `next_state`, `label`, `template_hash_id`, `jupyter_token`, `ssh_host`, `ssh_port`, `public_ipaddr`, `ports` (list of internal ports), `direct_port_start`/`_end`, `dph_total`, `storage_cost`, `extra_env`. The external port for each internal port is not in this schema. `GET /api/v0/instances/` lists (25 per page, keyset pagination). `PUT /api/v0/instances/{id}/` with `{"state": "stopped" | "running"}` or `{"label": …}`. `DELETE /api/v0/instances/{id}/` destroys; destroy is "irreversible and will delete all data". If `actual_status` becomes `exited`, `unknown` or `offline` it will never reach running: destroy and retry.
- **Source:** https://docs.vast.ai/api-reference/instances/show-instance.md; https://docs.vast.ai/api-reference/instances/manage-instance.md; https://docs.vast.ai/guides/instances/manage-instances.md
- **Retrieved:** 2026-11-28
- **Tier:** 1
- **Confidence:** high
- **Domain-model impact:** none

### F6 – Billing: a stopped instance keeps costing storage
- **Statement:** Compute is billed per second while running; storage is billed continuously regardless of running state; bandwidth per byte. Stopped instances keep incurring storage charges; destroy the instance to stop billing.
- **Source:** https://docs.vast.ai/guides/instances/pricing.md
- **Retrieved:** 2026-11-28
- **Tier:** 1
- **Confidence:** high
- **Domain-model impact:** shutting down means destroy, not stop.

### F7 – Rate limits
- **Statement:** Limits are per endpoint and per identity, applied as a minimum interval; exceeding returns HTTP 429 "API requests too frequent", without a Retry-After header. No numeric limits are published.
- **Source:** https://docs.vast.ai/api-reference/rate-limits-and-errors
- **Retrieved:** 2026-11-28
- **Tier:** 1
- **Confidence:** high
- **Domain-model impact:** none

### F8 – The Instance Portal's Caddy proxy authenticates proxied ports
- **Statement:** "When external_port ≠ internal_port: Caddy reverse proxy makes the app available on the external port with TLS and authentication." When they are equal, "the application bypasses proxying (direct access), but tunnel links are still created." Auth is enforced "by default for all proxied ports" (`ENABLE_AUTH`, default true; `AUTH_EXCLUDE` lists excluded external ports). Access: the Open button sets an auth cookie; basic auth with `WEB_USERNAME` (default `vastai`) and `WEB_PASSWORD` (default `OPEN_BUTTON_TOKEN`); "Include `Authorization: Bearer ${OPEN_BUTTON_TOKEN}` header for API access." `OPEN_BUTTON_TOKEN` is auto-generated, cannot be set, and "can't be read from outside without SSH"; for remote automation the docs recommend setting `WEB_PASSWORD` at launch and using it as the bearer token. The show-instance schema does not list `OPEN_BUTTON_TOKEN` or `WEB_PASSWORD`.
- **Source:** https://github.com/vast-ai/base-image (README); https://docs.vast.ai/guides/instances/connect/instance-portal.md
- **Retrieved:** 2026-11-28
- **Tier:** 1
- **Confidence:** medium (not confirmed for the MiniMax H3 template itself)
- **Domain-model impact:** none

### F9 – Reaching a port: Cloudflare quick tunnels or the mapped port
- **Statement:** The Portal creates a Cloudflare quick tunnel per open port (`https://<random-words>.trycloudflare.com`), falling back to `http://<ip>:<port>`; named tunnels use `CF_TUNNEL_TOKEN`. `ENABLE_HTTPS` defaults to false (self-signed certificate when true). Each internal port maps to a random external port on a shared public IP, shown as `PUBLIC_IP:EXTPORT -> INTPORT/tcp`; inside the container `VAST_TCP_PORT_<internal>`. The Portal's capability API is on port 1111 (`curl -H "Authorization: Bearer $TOKEN" https://<public-ip>:<mapped-1111-port>/capabilities`). SSH keys are propagated to root and user accounts.
- **Source:** https://docs.vast.ai/guides/instances/connect/networking.md; https://docs.vast.ai/guides/instances/connect/instance-portal.md; https://github.com/vast-ai/base-image
- **Retrieved:** 2026-11-28
- **Tier:** 1
- **Confidence:** medium
- **Domain-model impact:** none

### F10 – The MiniMax H3 template through the API (ST-070)
- **Statement:** `GET /api/v0/template/?select_filters={"hash_id":{"eq":"6c54167e40e8ceed220393d585126a1c"}}` returns the template "MiniMax H3, ComfyUI" (id 801666): the model page's template id is the `hash_id` to rent with (`template_hash_id`). Image `vastai/comfy`, tag `v0.44.0-cuda-13.2-py312` (ComfyUI 0.44.0, workflow templates 0.11.101), `recommended_disk_space` 65 GB, `runtype` jupyter, `extra_filters` 1 GPU, `gpu_ram` ≥ 33000, `cuda_max_good` ≥ 13, `compute_cap` ≥ 1000. Env: ports 1111, 8080, 8188, 8288, 8384 (and an invalid 72299 that is dropped), `COMFYUI_ARGS=… --port 18188`, `OPEN_BUTTON_PORT=1111`, `PORTAL_CONFIG=…|localhost:8188:18188:/:ComfyUI|…`. `onstart` sets `PROVISIONING_COMFYUI_WORKFLOWS` to the three Comfy-Org templates `video_minimax_h3_{i2v,r2v,t2v}.json` of tag v0.11.101 and runs `entrypoint.sh`. Rented 2026-11-28: offer 59258804 (RTX PRO 6000 **WS**, Sweden; no S offer below $1.47/h), `PUT /asks/{id}/` with `template_hash_id`, `label`, `disk: 80` and `env: {"WEB_PASSWORD": …}`; `dph_total` 1.42 $/h (1.40 offered). The create answer also carries an `instance_api_key`.
- **Source:** vast.ai REST API, own test (ST-070)
- **Retrieved:** 2026-11-28
- **Tier:** 1
- **Confidence:** high
- **Domain-model impact:** none; `VAST_MAX_PRICE_PER_HOUR` 1.50 admits the WS and most S offers.

### F11 – ComfyUI sits behind the portal's token check (HS-270)
- **Statement:** ComfyUI listens on 18188 inside; Caddy serves it on internal port 8188, mapped to a random external port (here 16014) on the public IP, plain HTTP. With `Authorization: Bearer <WEB_PASSWORD>` `GET /system_stats` answers 200; without a header or with a wrong token 401; basic auth `vastai:<WEB_PASSWORD>` also 200. The Cloudflare quick tunnel of port 8188 (`https://<words>.trycloudflare.com`) behaves the same (200 / 401 / 401). No direct port for ComfyUI exists. `WEB_PASSWORD` set at launch works as the token; `show-instance` returns it in `extra_env`, so anyone with an API key that reads instances can read it.
- **Source:** own test (ST-070)
- **Retrieved:** 2026-11-28
- **Tier:** 1
- **Confidence:** high
- **Domain-model impact:** confirms the ADR 0059 access rule; the API key is as sensitive as the rental token.

### F12 – Finding the ComfyUI URL through the API (HS-270)
- **Statement:** `GET /instances/{id}/` gives `public_ipaddr` and `ports` as `{"8188/tcp": [{"HostIp": "0.0.0.0", "HostPort": "16014"}, …], "1111/tcp": […], …}` once the container runs (before, `ports` is null): ComfyUI is `http://<public_ipaddr>:<ports["8188/tcp"][0].HostPort>`. The Instance Portal on `ports["1111/tcp"]` (same token) answers `GET /get-all-quick-tunnels` with `[{"targetUrl": "http://localhost:8188", "tunnelUrl": "https://….trycloudflare.com"}, …]`, `GET /get-direct-url/8188` with `{"result": "http://<ip>:<port>"}`, and `GET /capabilities` with every service, its `direct_url`, supervisor state and the provisioning status (`"status": "complete"`); `/openapi.json` documents the portal API.
- **Source:** own test (ST-070)
- **Retrieved:** 2026-11-28
- **Tier:** 1
- **Confidence:** high
- **Domain-model impact:** the provider can reach ComfyUI from the REST API alone (HTTP, token in clear text on the wire) or ask the portal for the HTTPS tunnel URL; the tunnel URL is the one ADR 0059 names.

### F13 – Boot time and models (HS-271)
- **Statement:** Rented 20:17:39 UTC; `actual_status` `loading` while the image is pulled (about 2 minutes); ComfyUI answered with the token after 692 s (11.5 min); until then the proxy answered 502 behind a valid token and 401 without. The image holds no model: provisioning downloads them at boot from `huggingface.co/Comfy-Org/MiniMax-H3` – `minimax_h3_fl2va_pruned_int8_convrot`, `minimax_h3_ref2va_pruned_int8_convrot` (diffusion), `qwen3vl_32b_minimax_h3_nvfp4_awq` (text encoder), `minimax_h3_video_vae_int8_convrot`, `minimax_h3_audio_vae_fp32` – and the Lightning LoRAs `minimax_h3_fl2v_turbo_8step_v1.0` and `minimax_h3_ref2v_turbo_4step_v0.1`.
- **Source:** own test (ST-070), `object_info` of the rental
- **Retrieved:** 2026-11-28
- **Tier:** 1
- **Confidence:** medium (one rental, one host; the download speed decides the boot time)
- **Domain-model impact:** the 20-minute ready limit of ADR 0059 holds with margin; ready means an authenticated `GET /system_stats` with 200.

### F14 – Workflows and clips (HS-271)
- **Statement:** The template ships three workflows (exports and model file names in `docs/research/vast-minimax-h3/`): t2v and i2v are the same FL2VA graph (`MiniMaxH3ImageToVideo` with optional `first_frame` and `last_frame`), r2v uses `MiniMaxH3ReferenceToVideo`. Defaults: `res_multistep`, `simple`, 20 steps, no LoRA; t2v and r2v at 0.4 MP, i2v at 0.9 MP of the first frame. Clips at 0.9 MP, 20 steps, on the RTX PRO 6000 WS: text-to-video 5 s in 219 s (first job, models loaded), image-to-video 5 s in 240 s, first/last frame 5.17 s in 267 s, reference-to-video 5 s in 250 s; the user judged them good, except first/last frame: she sits inside the desk at the start and the clip cross-fades into the last frame (keyframes `daily-um-9` shot-012 and its end frame; whether the pair or plain H3 causes it is open). Prompt form that worked: plain text, a look line, the references named as `<Picture n>` ("The scene opens exactly on image 1", "begins exactly on image 1 and ends exactly on image 2"), `SHOT 1:` with one continuous action, an `Audio:` line, and what must not appear – the form of the template's own example prompts, no Flex sections.
- **Source:** own test (ST-070)
- **Retrieved:** 2026-11-28
- **Tier:** 1
- **Confidence:** medium (one clip per mode)
- **Domain-model impact:** none

### F15 – Plain MiniMax H3 lip-syncs with an anchored vocal (HS-269)
- **Statement:** The template's reference-to-video graph plus `LoadAudio`, `TrimAudioDuration` and `MiniMaxH3AddGuide` at `frame_idx` 0 (as in ADR 0027, without the Pika LoRA; `docs/research/vast-minimax-h3/spike-h3-r2v-lipsync.json`), one keyframe as `<Picture 1>`, a lead-only vocal segment, plain-text prompt naming the words and their timing. Three shots of `daily-um-9` (Vex): shot-065 spoken "Sorry … ich war noch gemutet" 4.65 s in 247 s, shot-050 shouted "Steh auf! Sag was!" 1.47 s in 55 s, shot-039 sung "Und Montag sind wir wieder dabei" 3.18 s in 154 s. The user's verdict: spoken "okay", shouted "fantastic", sung "good – usable"; identity held.
- **Source:** own test (ST-070), the user's verdict 2026-11-28
- **Retrieved:** 2026-11-28
- **Tier:** 1
- **Confidence:** medium (three shots of one character, one seed each)
- **Domain-model impact:** lipSync can run on the `vast` provider.

### F16 – Cost of the spike
- **Statement:** One rental, 20:17:39–20:57:06 UTC (39.5 min) at 1.42 $/h; credit fell from 25.00 to 23.97 $ (about 1.03 $ incl. storage and bandwidth). Seven clips in 25 minutes of GPU time after 11.5 minutes of boot. Destroyed with `DELETE /instances/{id}/` (`{"success": true}`); the instance list was empty afterwards.
- **Source:** own test (ST-070)
- **Retrieved:** 2026-11-28
- **Tier:** 1
- **Confidence:** high
- **Domain-model impact:** none

## Conflicts, caveats and gaps
- Two base URLs (`console.vast.ai` in the docs, `cloud.vast.ai` on the developers page) and GET vs POST for offer search.
- Not found: the MiniMax H3 template's hash as an API `template_hash_id`, its image tag, ComfyUI port and `PORTAL_CONFIG`, whether ComfyUI is behind Caddy or on a direct port, the workflow file names, whether models are in the image or downloaded at boot, the boot time, the disk size, and the hourly price.
- How the external port mapping or the tunnel URL is read through the REST API is not documented.
- The template card in the console shows the image `vastai/comfy` with tags CUDA 13, ARM, SSH, Jupyter (screenshot from the user, 2026-11-28).
- An LTX-2.3 ComfyUI guide says that template downloads its weights at boot "in just a few minutes"; that is an analogy, not this template.

- ST-070 answered the template gaps above (F10–F16). Still unverified: other hosts' download speed (boot time), and first/last frame on plain H3 – one clip sat the subject inside the desk and cross-faded into the last frame.

## Recommendations (ST-070)
- **HS-271:** rent with `template_hash_id` `6c54167e40e8ceed220393d585126a1c` and `disk` ≥ 65 (80 used); accept `RTX PRO 6000 S` and `RTX PRO 6000 WS` (same 96 GB GPU, WS is cheaper). Ship the three exports of `docs/research/vast-minimax-h3/` tagged (ST-076): t2v, i2v (also first/last frame through `last_frame`) and r2v; lock the five model files of F13. Keep the 20-minute ready limit; ready = authenticated `GET /system_stats` 200 (a 502 behind a valid token means still booting).
- **HS-270:** the provider reads `ports["1111/tcp"]` and `public_ipaddr` from `GET /instances/{id}/`, asks the portal `GET /get-all-quick-tunnels` (bearer `WEB_PASSWORD`) for the `tunnelUrl` of `http://localhost:8188`, and talks to ComfyUI over that HTTPS URL with the same bearer token; `http://<ip>:<ports["8188/tcp"]>` is the fallback while no tunnel is listed. ComfyUI is behind the token check (F11); no direct port is needed or wanted.
- **HS-269:** plain H3 lip-sync is usable (F15): give `vast` a `lipSync` workflow built like ADR 0027's graph without the LoRA, and let a `vast` project put `providers.lipsync` on `vast`. It belongs in ST-076's shipped workflows and needs a story change there (today ST-076 ships four operations).
- **Prompting:** plain text in the template's form (F14); no Flex sections on `vast`.
- **First/last frame:** check a second pair before relying on it; the Pika FL2VA LoRA may be what keeps it clean locally.
