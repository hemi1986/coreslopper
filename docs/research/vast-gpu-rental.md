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

## Conflicts, caveats and gaps
- Two base URLs (`console.vast.ai` in the docs, `cloud.vast.ai` on the developers page) and GET vs POST for offer search.
- Not found: the MiniMax H3 template's hash as an API `template_hash_id`, its image tag, ComfyUI port and `PORTAL_CONFIG`, whether ComfyUI is behind Caddy or on a direct port, the workflow file names, whether models are in the image or downloaded at boot, the boot time, the disk size, and the hourly price.
- How the external port mapping or the tunnel URL is read through the REST API is not documented.
- The template card in the console shows the image `vastai/comfy` with tags CUDA 13, ARM, SSH, Jupyter (screenshot from the user, 2026-11-28).
- An LTX-2.3 ComfyUI guide says that template downloads its weights at boot "in just a few minutes"; that is an analogy, not this template.

## Open questions for the grilling
- How does the client find the authenticated ComfyUI URL of a new instance?
- Does plain MiniMax H3 lip-sync with `MiniMaxH3AddGuide` and no Pika LoRA?
