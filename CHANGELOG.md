# Changelog

## [0.10.0](https://github.com/hemi1986/coreslopper/compare/v0.9.0...v0.10.0) (2026-11-25)

Forty-two stories since v0.9.0: memes and the sound library, the set library, pose tracks, internal projects, and the
production fixes around them.


### Features

**Memes and the sound library**

* a meme project kind with its own stages ([#86](https://github.com/hemi1986/coreslopper/pull/86)); the board's wizard creates a meme ([#94](https://github.com/hemi1986/coreslopper/pull/94)), and the new `new-meme` skill grills the pitch into a script ([#98](https://github.com/hemi1986/coreslopper/pull/98))
* a meme's script is validated against the library ([#95](https://github.com/hemi1986/coreslopper/pull/95)); its voice track takes library sounds ([#99](https://github.com/hemi1986/coreslopper/pull/99)); a shot lands on a sound's cue ([#105](https://github.com/hemi1986/coreslopper/pull/105)); the render carries German subtitles ([#106](https://github.com/hemi1986/coreslopper/pull/106)); it has a release folder ([#101](https://github.com/hemi1986/coreslopper/pull/101))
* the sound library: add ([#82](https://github.com/hemi1986/coreslopper/pull/82)), edit the description ([#83](https://github.com/hemi1986/coreslopper/pull/83)), remove ([#104](https://github.com/hemi1986/coreslopper/pull/104)), list ([#85](https://github.com/hemi1986/coreslopper/pull/85)), check after hand edits ([#103](https://github.com/hemi1986/coreslopper/pull/103)), validate a hand-edited entry ([#84](https://github.com/hemi1986/coreslopper/pull/84))
* a sound of unknown licence is a TODO in the release check ([#102](https://github.com/hemi1986/coreslopper/pull/102)); the board's Sounds view ([#124](https://github.com/hemi1986/coreslopper/pull/124)); docs for maintaining the library ([#126](https://github.com/hemi1986/coreslopper/pull/126))

**The set library (ADR 0052)**

* set entries and their validation ([#108](https://github.com/hemi1986/coreslopper/pull/108)); add a set by hand ([#109](https://github.com/hemi1986/coreslopper/pull/109)); add a reference or a plate ([#110](https://github.com/hemi1986/coreslopper/pull/110))
* take a production's sets into the library ([#112](https://github.com/hemi1986/coreslopper/pull/112)); the sets of a finished set bible import themselves ([#113](https://github.com/hemi1986/coreslopper/pull/113))
* use a library set in a music video or series canon ([#114](https://github.com/hemi1986/coreslopper/pull/114)); update it ([#115](https://github.com/hemi1986/coreslopper/pull/115)), remove a file ([#116](https://github.com/hemi1986/coreslopper/pull/116)), delete it ([#117](https://github.com/hemi1986/coreslopper/pull/117))
* the board's Sets view ([#118](https://github.com/hemi1986/coreslopper/pull/118)); the wizard's "Sets from the library" step ([#119](https://github.com/hemi1986/coreslopper/pull/119)); the setup skills offer library sets ([#120](https://github.com/hemi1986/coreslopper/pull/120))

**Pose tracks (ADR 0054)**

* `pose-extract` writes pose tracks from reference clips ([#96](https://github.com/hemi1986/coreslopper/pull/96))

**Internal projects**

* an internal project gets no release package ([#90](https://github.com/hemi1986/coreslopper/pull/90)) and ends after QA ([#92](https://github.com/hemi1986/coreslopper/pull/92))
* its calendar books no slots ([#121](https://github.com/hemi1986/coreslopper/pull/121)), the autopilot leaves it alone ([#122](https://github.com/hemi1986/coreslopper/pull/122)), and it cannot be approved ([#123](https://github.com/hemi1986/coreslopper/pull/123))

**Production, board, and wizard**

* ComfyUI projects lip-sync locally by default (ADR 0053) ([#89](https://github.com/hemi1986/coreslopper/pull/89)); ComfyUI restarts only when it is stuck ([#93](https://github.com/hemi1986/coreslopper/pull/93))
* the episode track levels speech takes to one loudness ([#88](https://github.com/hemi1986/coreslopper/pull/88)); `clip-audio` takes an effect's sound from its clips, `frame --at`, and patch keeps the aspect ([#75](https://github.com/hemi1986/coreslopper/pull/75))
* the board shows when it loads and when a button is working ([#80](https://github.com/hemi1986/coreslopper/pull/80)); the wizard's last step links to the new project or series ([#77](https://github.com/hemi1986/coreslopper/pull/77))
* an episode's announcement images say "new episode", not "new song" ([#107](https://github.com/hemi1986/coreslopper/pull/107))


### Bug Fixes

* **bench:** check only the shipped example cases in the tracked-cases test ([33adfd7](https://github.com/hemi1986/coreslopper/commit/33adfd7cc6096cba5470e84c5517e6671c4e0b4c))
* **generate:** take the Pika aspect from the master format, not the project kind ([#81](https://github.com/hemi1986/coreslopper/pull/81))
* **transcribe:** decode audio with librosa instead of PyAV ([#87](https://github.com/hemi1986/coreslopper/pull/87))


### Documentation

* accept ADR 0052 (the set library) ([#79](https://github.com/hemi1986/coreslopper/pull/79)) and ADR 0054 (pose tracks from reference clips) ([#97](https://github.com/hemi1986/coreslopper/pull/97))
* discover memes and the sound library ([#78](https://github.com/hemi1986/coreslopper/pull/78)); discover the set library and the board's loading feedback ([#79](https://github.com/hemi1986/coreslopper/pull/79)); the internal-project stories from the workspace's upstream features ([#91](https://github.com/hemi1986/coreslopper/pull/91))
* describe the Kataster workflow and fix drifted texts (G-157, G-171, G-186) ([#74](https://github.com/hemi1986/coreslopper/pull/74))
* research: can a meme use TikTok's trending audio? No publish path attaches one – the sound stays a manual step in the app, for a personal non-commercial account ([#125](https://github.com/hemi1986/coreslopper/pull/125))

## [0.9.0](https://github.com/hemi1986/coreslopper/compare/v0.8.0...v0.9.0) (2026-11-22)


### ⚠ BREAKING CHANGES

* **bench:** a new workspace gets only the two example cases. An existing workspace keeps the cases it has.
* retire the desktop review player

### Features

* **ai-clips:** Pika H3 reference-to-video as the default for clips without lip-sync ([f5600f3](https://github.com/hemi1986/coreslopper/commit/f5600f3125453b78701443d4921e2d3bb23dcf32))
* **bench:** run image-to-video cases as reference-to-video (as: referenceToVideo) ([83e262d](https://github.com/hemi1986/coreslopper/commit/83e262d91b8d12daeeb467328da588c23369c2a4))
* **bench:** ship generic example cases and keep the workspace's bench at update ([65a3cf7](https://github.com/hemi1986/coreslopper/commit/65a3cf7b7c35cb119e41a78454536e14796f5cd8))
* **board:** add a favicon ([2ffd00b](https://github.com/hemi1986/coreslopper/commit/2ffd00bb36e403dac71a348aac1d1302be7e3828))
* **board:** board guide with screenshots, and formatted docs on the board ([e4962db](https://github.com/hemi1986/coreslopper/commit/e4962dba0de71e807495229e02f9f29ea99353b0))
* **board:** open the board guide from the navigation ([ddfeb04](https://github.com/hemi1986/coreslopper/commit/ddfeb047a0f1faadf74e4e2c3e7d453f2b63a968))
* **board:** production view of every project and series, the board as the workspace's hub ([07aef79](https://github.com/hemi1986/coreslopper/commit/07aef796525d2e21e78003ceea7c287e52285cdd))
* **board:** refresh by hand instead of polling ([2f6c731](https://github.com/hemi1986/coreslopper/commit/2f6c7313056ed6a57d0f1a681c074042c860cdb5))
* **board:** show project documents formatted on the board ([2597751](https://github.com/hemi1986/coreslopper/commit/2597751c4d5876dff171fd39164d9552850711a1))
* **board:** watchdog round, render progress, and the board container ([e7c2599](https://github.com/hemi1986/coreslopper/commit/e7c2599cab0686096692470c2d604e7d3de61240))
* **board:** web review player and review rounds the agent answers ([42b6e99](https://github.com/hemi1986/coreslopper/commit/42b6e99d62367432cfc2e5a99ec76d20ce6a6ad2))
* **board:** wizard for new music videos, series, and episodes, with user references ([a2fc0a7](https://github.com/hemi1986/coreslopper/commit/a2fc0a7e6dce274aed5d0d097449edc2e34f4ead))
* **comfyui:** Pika H3 Flex FL2VA, Pika frame count, required tags, model locks in config ([7347be5](https://github.com/hemi1986/coreslopper/commit/7347be54fda57999b29623542f7f3ccfa9ad85e3))
* **comfyui:** Pika H3 Flex FL2VA, Pika frame count, required tags, model locks in config ([ff93c33](https://github.com/hemi1986/coreslopper/commit/ff93c33437a1d2145671abd91562f94228f26aff))
* generation queue, patch, and runner commands for mechanical steps ([8017b96](https://github.com/hemi1986/coreslopper/commit/8017b9685bfdf135becd1e5cad01c4f48768419e))
* generation queue, patch, and runner commands for mechanical steps ([73063bc](https://github.com/hemi1986/coreslopper/commit/73063bc237362d81a739761cadd67d25a6e3294c))
* **lipsync:** Pika H3 lip-sync with an anchored vocal as the first local choice ([cb849c7](https://github.com/hemi1986/coreslopper/commit/cb849c7fd60f76ed4625de9db1d53a2ee279e77f))
* **lipsync:** Pika H3 lip-sync with an anchored vocal as the first local choice ([6bfc386](https://github.com/hemi1986/coreslopper/commit/6bfc3862b5e661e00c41c19f0d1e7696d8fe2d13))
* **publish:** social post adapter contract for the release autopilot ([3532a64](https://github.com/hemi1986/coreslopper/commit/3532a641e8a93d64350846ab47819112e64a0d42))
* **publish:** X, LinkedIn, and Instagram post adapters; YouTube status, description, and comment calls; TikTok direct post ([ba29b3c](https://github.com/hemi1986/coreslopper/commit/ba29b3c56b1b053abd9deedff5799c3e138fc27f))
* **release-board:** optional channel motto top right; tasks say done, posts say posted ([c022d9d](https://github.com/hemi1986/coreslopper/commit/c022d9dbf5a0d6cc2fa99d743e42868787de43dd))
* **release:** announcement, story, and feed images with the release date, the teaser, and the 4:5 thumbnail format ([4af5277](https://github.com/hemi1986/coreslopper/commit/4af5277547ac6d8ef12b64065c9a5b1dfc32d6dc))
* **release:** channel release defaults, autopilot doctor checks, schedule and channel templates ([2fa41ca](https://github.com/hemi1986/coreslopper/commit/2fa41ca8895b20cf115db3f3ba1af0cdb5959d40))
* **release:** release autopilot — one approval, then the calendar posts by API ([e5cabdd](https://github.com/hemi1986/coreslopper/commit/e5cabdd754f83576d24f9ff472523c73ef779c22))
* **release:** release board, cross-project release calendar, X/LinkedIn/microsite texts ([eac7dba](https://github.com/hemi1986/coreslopper/commit/eac7dbabc538fab310250affe6a7068372751589))
* **release:** release board, cross-project release calendar, X/LinkedIn/microsite texts ([bea73af](https://github.com/hemi1986/coreslopper/commit/bea73af9b9610e45932ecc4bcd3d63bfc4ef1792))
* **release:** release-backfill skill, feed format for Instagram and LinkedIn, board language ([769f4cc](https://github.com/hemi1986/coreslopper/commit/769f4ccfe8dc07bf48b5a50c1e51d38ede6cf7dd))
* **release:** the release autopilot — approval on the board, release-run, release-timer, publish-auth for X, LinkedIn, Instagram ([ac7ca26](https://github.com/hemi1986/coreslopper/commit/ac7ca267256256c94ec21fa6888a7600c62f48f9))
* retire the desktop review player ([33bea50](https://github.com/hemi1986/coreslopper/commit/33bea503ba9b51f781cf99fd7cbe615220596c02))
* review-image command and per-image art-director review loop ([ad4d298](https://github.com/hemi1986/coreslopper/commit/ad4d298682dfe13bf38cf192eabbd0ce27f6c802))
* review-image command and per-image art-director review loop ([e4eaf95](https://github.com/hemi1986/coreslopper/commit/e4eaf959b4c1a7ed4f437e1998df8f03ab9cfa54))


### Bug Fixes

* **audio-analysis:** default to the project's vocal stem ([bc4dddf](https://github.com/hemi1986/coreslopper/commit/bc4dddfad2f9bd14a4abc2d3d73877cbc40b255a))
* **autopilot:** missing credentials need the user only once a post is due ([c776275](https://github.com/hemi1986/coreslopper/commit/c7762756cdf8223c8bb7573718508f8619e4a570))
* **autopilot:** review findings — board writes only from its own page, approval per release day, locks, TikTok tokens and direct posts, timer PATH ([e44dde1](https://github.com/hemi1986/coreslopper/commit/e44dde1f11113fad9dfa52c2baaa0765469e7b86))
* close the low gaps the user hits ([7c2aa90](https://github.com/hemi1986/coreslopper/commit/7c2aa905c426111b1934cea6d45c52fa09e3e801))
* close the low gaps the user hits ([5c70cd5](https://github.com/hemi1986/coreslopper/commit/5c70cd525e5719caaee835aa10d6e069728fb632))
* land --scrim and --text-offset ([#41](https://github.com/hemi1986/coreslopper/issues/41)) on main ([c81e8b1](https://github.com/hemi1986/coreslopper/commit/c81e8b13c42b8a525b2360ab65434d21cf45a360))
* land the board ([#58](https://github.com/hemi1986/coreslopper/issues/58)–[#61](https://github.com/hemi1986/coreslopper/issues/61)) on main ([dcaa7fb](https://github.com/hemi1986/coreslopper/commit/dcaa7fbdc5044580918d1e5179aff10bbd64b4a4))
* land the runner commands ([#53](https://github.com/hemi1986/coreslopper/issues/53)) on main ([1280f8f](https://github.com/hemi1986/coreslopper/commit/1280f8f4c3a43f724a1eded5eea7fb3232d20ddb))
* **pipeline:** rebuild a missing release folder instead of a dead end ([745787e](https://github.com/hemi1986/coreslopper/commit/745787e01f49f61414d7945ee16c1ee0201550b4))
* **publish:** lock the publish log and .env for every write ([af8706e](https://github.com/hemi1986/coreslopper/commit/af8706e2b6b56df9f8737f79ea36a77361b64399))
* **publish:** never post twice on YouTube and TikTok, and show what a withdrawal cannot stop ([371c737](https://github.com/hemi1986/coreslopper/commit/371c7374f1c955d6ab9264179e8ef5763045b6f4))
* **release:** keep a stale format's earlier copy on the board's refresh ([4efd346](https://github.com/hemi1986/coreslopper/commit/4efd346da6506b7c7e586d8aa2128566e558cbfd))
* the medium gaps the user hits ([f3e39e1](https://github.com/hemi1986/coreslopper/commit/f3e39e197e38b3edfc150fbadd7cd3e85ab37a3b))


### Documentation

* adopt every slice of coreslopper ([e09bb39](https://github.com/hemi1986/coreslopper/commit/e09bb396242716cf365d01143fb8c5dbe5d40972))
* adopt the bibles and character library slice ([e5a39c3](https://github.com/hemi1986/coreslopper/commit/e5a39c328e92b45cfd8b16324bbcd6babb362559))
* adopt the board shell slice ([e1b633e](https://github.com/hemi1986/coreslopper/commit/e1b633e74f926d66d5d059fb4f7fad1c20c2ab0c))
* adopt the generation queue and verdicts slice ([5e06927](https://github.com/hemi1986/coreslopper/commit/5e0692729ff85f03386e08677f02ff89c59743ee))
* adopt the generation slice ([2ec8a70](https://github.com/hemi1986/coreslopper/commit/2ec8a7006d7bbe39a2272c49e8ee2ecab367c92d))
* adopt the human review slice ([7c7b81e](https://github.com/hemi1986/coreslopper/commit/7c7b81edc25cf62e1dcf4c7608bd6d2636e6c3d6))
* adopt the model bench slice ([3f855fa](https://github.com/hemi1986/coreslopper/commit/3f855faf5eb591c3b27ddbe71f9381d6ea45b44a))
* adopt the project and stage pipeline slice ([5128f52](https://github.com/hemi1986/coreslopper/commit/5128f52d5a164968c7b497c24dee061859ca9d3c))
* adopt the publish slice ([e6fddce](https://github.com/hemi1986/coreslopper/commit/e6fddcec160485517fb60d278a88ed5c4fa6776b))
* adopt the release slice ([7ba5b88](https://github.com/hemi1986/coreslopper/commit/7ba5b8864ebf7f2b4601dfe55cb1f72fe9212aa7))
* adopt the render slice ([5fdf981](https://github.com/hemi1986/coreslopper/commit/5fdf98192494be02968b498e090b0e9111877cd1))
* adopt the series slice ([f6aea03](https://github.com/hemi1986/coreslopper/commit/f6aea03bee10511670043fd0021f49a8649e5c68))
* adopt the storyboard slice ([512350f](https://github.com/hemi1986/coreslopper/commit/512350fc8c000aae08b8482a15e9ea4817b60283))
* adopt the timing slice ([2ba1480](https://github.com/hemi1986/coreslopper/commit/2ba1480f2e06c6c2e150d82750dd775927be6ef4))
* adopt the workspace slice ([6023e3c](https://github.com/hemi1986/coreslopper/commit/6023e3cb7cdfb80e770178e613103995a95606cc))
* **adr:** accept ADR 0050 ([4d7dde6](https://github.com/hemi1986/coreslopper/commit/4d7dde6259f33b12a0fb73fea83712f581e8b589))
* **board:** add a board guide with screenshots, in English and German ([b968248](https://github.com/hemi1986/coreslopper/commit/b968248c1a821609f41020a47b7c80cae18927b6))
* **domain:** defer the upstream locale defaults (G-156) ([45ef841](https://github.com/hemi1986/coreslopper/commit/45ef841346833db791c2a58acb4bac655d9b939b))
* **release:** release board, calendar, and backfill in README, publishing, architecture, onboarding ([225f0ee](https://github.com/hemi1986/coreslopper/commit/225f0ee978663139f7514d567eaf37643e56faa8))
* **skills:** video-qa and release-backfill reviewed with writing-for-agents ([1def34e](https://github.com/hemi1986/coreslopper/commit/1def34e50a2e30bb2b3975d21a1f2777ceaceacc))
* the release autopilot — ADR 0029, publishing setup for X, LinkedIn, Instagram, glossary, skills, README ([967ff38](https://github.com/hemi1986/coreslopper/commit/967ff3876cb77bc0947fc9a451132b7470770220))

## [0.8.0](https://github.com/hemi1986/coreslopper/compare/v0.7.0...v0.8.0) (2026-11-19)


### Features

* **comfyui:** Pika H3 Flex reference-to-video (referenceToVideo) ([919d705](https://github.com/hemi1986/coreslopper/commit/919d7051ac7e0539f41e9825bd6a17b59dd2add4))
* **comfyui:** Pika H3 Flex reference-to-video (referenceToVideo) ([40a30d8](https://github.com/hemi1986/coreslopper/commit/40a30d858d666f56fb9c70af8d3d9677c65e973f))
* **comfyui:** quality workflows, Wan 2.2 backend, and SeedVR2 restore pass ([83e6d77](https://github.com/hemi1986/coreslopper/commit/83e6d778ca106d0fc440054912326f2066c46c2a))
* **comfyui:** quality workflows, Wan 2.2 backend, and SeedVR2 restore pass ([447f6c6](https://github.com/hemi1986/coreslopper/commit/447f6c69c35fdbaa0a0f356de168cc469650812d))
* **core:** plates, prop references, and character states ([b1c9eae](https://github.com/hemi1986/coreslopper/commit/b1c9eae2f20a4a7137c617f815ba15de971bdb76))
* **episode:** sfx lines may carry text_en for on-screen text subtitles ([566adea](https://github.com/hemi1986/coreslopper/commit/566adeaf6a95a4a5d194de8f0076617f562b27ed))
* **lipsync:** Higgsfield and Topview lip-sync, lead-only lip-sync audio ([ce5de81](https://github.com/hemi1986/coreslopper/commit/ce5de81e8b00c322eb58cdb2889c208ea7275ae4))
* plates, prop references, and character states; episode audio and subtitle fixes ([5be8435](https://github.com/hemi1986/coreslopper/commit/5be84355725be834572ed348a29bef9db5cc3f14))
* **release:** 3:4 TikTok covers and comma-separated YouTube hashtags ([dc5ac77](https://github.com/hemi1986/coreslopper/commit/dc5ac779705765f224822ad3dd131edb97e14368))


### Bug Fixes

* **episode-track:** reach the loudness target with a measured gain and limiter ([d15e27c](https://github.com/hemi1986/coreslopper/commit/d15e27c0963572af6b26e3defa047fccc8210f3c))
* **qa:** failed calls in the manifest warn instead of failing; isolate release tests ([7d8c434](https://github.com/hemi1986/coreslopper/commit/7d8c434d04428667bde8bc5c6b7798ef88efd7aa))
* **qa:** failed manifest calls warn instead of failing; isolate release tests ([47f4390](https://github.com/hemi1986/coreslopper/commit/47f43901525cd52c0ca6b0b1160829d60b256382))
* **release:** drop the song-credit footer line from episode texts ([f358463](https://github.com/hemi1986/coreslopper/commit/f358463e870a2b84820f1834eadc2d454e01b2f9))
* **release:** lay out TikTok texts like TikTok Studio; no DEMO tag on thumbnails ([ae5c024](https://github.com/hemi1986/coreslopper/commit/ae5c024cc359eabe7d05084648241ee9d2436dc1))
* **release:** TikTok Studio texts and 3:4 covers, comma-separated YouTube hashtags, no DEMO tag ([e90400d](https://github.com/hemi1986/coreslopper/commit/e90400de59fe52cec47b1b4322a2665e67afceef))
* **remotion:** remove the bottom accent bar from MusicVideo ([9155c17](https://github.com/hemi1986/coreslopper/commit/9155c1703e00f712d7bd71bb375c94201353594c))
* **remotion:** remove the bottom accent bar from MusicVideo ([c655718](https://github.com/hemi1986/coreslopper/commit/c6557186dab82cb07aa5ef387ecb1dcbc5cc2250))
* **review-player:** retry the audio stream and fall back to silent playback ([87c822f](https://github.com/hemi1986/coreslopper/commit/87c822fe897c49ad1e1b0dd0d66bed89d662501e))


### Documentation

* explain series and episodes in the README ([fec19dc](https://github.com/hemi1986/coreslopper/commit/fec19dc142608fc928bc0a6860d615eed2e8b840))
* explain series and episodes in the README ([0e7a357](https://github.com/hemi1986/coreslopper/commit/0e7a3573fe1e17dbf250323b4419d94306e0e75f))
* plates, props, and character states in skills, glossary, and ADR 0025 ([c07f4bd](https://github.com/hemi1986/coreslopper/commit/c07f4bd1b29c8e38e1d72cd02876f9501be8c1d2))
* **release:** separate review rules for 9:16 Short thumbnails and 3:4 TikTok covers ([796ba81](https://github.com/hemi1986/coreslopper/commit/796ba81d7759a034730a9a14d2bf7e1129861075))

## [0.7.0](https://github.com/hemi1986/coreslopper/compare/v0.6.0...v0.7.0) (2026-11-16)


### Features

* publish command and one release folder for the whole release package ([4aaa705](https://github.com/hemi1986/coreslopper/commit/4aaa70536423015be288193ae64eacbdc3036f58))
* **publish:** upload the release package to YouTube and TikTok ([887769d](https://github.com/hemi1986/coreslopper/commit/887769da49c0b6b86597f24541655b6a0a3e54ba))
* **release:** collect the whole release package in renders/release/ ([f9e48c8](https://github.com/hemi1986/coreslopper/commit/f9e48c85d57d122f0ae487c32fcc4d5fdd647650))
* **remotion:** render Suno lyrics without parentheses ([b3d9d38](https://github.com/hemi1986/coreslopper/commit/b3d9d3899165dbf9cf6ac0fb46b29a8aad4c4d62))
* **remotion:** render Suno lyrics without parentheses ([e04ce0f](https://github.com/hemi1986/coreslopper/commit/e04ce0f3964c67b5a42113ce21a699a2e132cea6))
* review player for frame-accurate notes on renders ([901a654](https://github.com/hemi1986/coreslopper/commit/901a65495d853cd77ada654ac1a3cea16f59f5d7))
* review player for frame-accurate notes on renders ([4194d21](https://github.com/hemi1986/coreslopper/commit/4194d21ab4e14def8833a953b010bee91e0bf51e))


### Documentation

* review player usage in the README ([82d0ec4](https://github.com/hemi1986/coreslopper/commit/82d0ec4e491552a150d71c032052a9b2f08da2d2))

## [0.6.0](https://github.com/hemi1986/coreslopper/compare/v0.5.0...v0.6.0) (2026-11-15)


### ⚠ BREAKING CHANGES

* **providers:** ltx-av is no longer a default workflow. The ComfyUI params size_scale and audio_offset and the cs_use_audio tag are removed; a workflow with cs_audio now fits lipSync only.

### Features

* /video-next by project kind and /series-status ([05e48b1](https://github.com/hemi1986/coreslopper/commit/05e48b15ab35f7b862708ae7e99b91d02ba7dc7c))
* **cli:** voice-track, import-takes, and episode-track for episodes ([c07f44c](https://github.com/hemi1986/coreslopper/commit/c07f44cf84b1f5502965bf144416e56df3e5c688))
* **core:** episode schemas, kind-aware state, canon loader, demo episode ([2ad85b5](https://github.com/hemi1986/coreslopper/commit/2ad85b5b6e4e333efeafc5f29172b981a2cdadb5))
* episode lip-sync from speaker stems, display rules, and limits ([7010ef8](https://github.com/hemi1986/coreslopper/commit/7010ef89bf1b21e9fcf251a0cf7520521e870167))
* episode projects for series (ADR 0016) ([67d18d5](https://github.com/hemi1986/coreslopper/commit/67d18d506b8255abdceb0047f640f75bd397fed6))
* master-format render, ChatWindow, subtitles, and episode QA ([d111de2](https://github.com/hemi1986/coreslopper/commit/d111de2a0433f9588030dc6dd8ab82e0be26cdcd))
* model bench for comparing models, workflows, and servers ([bb7c3dc](https://github.com/hemi1986/coreslopper/commit/bb7c3dc8eddc7ed2ac7728ca22ee62fdab337699))
* model bench for comparing models, workflows, and servers ([99b981a](https://github.com/hemi1986/coreslopper/commit/99b981a78d1d864d40ab65bfab8ba42da6fbf3c8))
* **providers:** add Topview as a cloud provider for stills and clips ([59ecb7b](https://github.com/hemi1986/coreslopper/commit/59ecb7b7652f3b131707c7421d007d38aab1ab01))
* **providers:** add Topview as a cloud provider for stills and clips ([07a4d80](https://github.com/hemi1986/coreslopper/commit/07a4d8026618b0e9b262e6082dd3a7291def2e2f))
* **providers:** lip-sync on an LTX FLF2V graph, other clips on the official LTX templates ([7e810b4](https://github.com/hemi1986/coreslopper/commit/7e810b407992f4f602d87cfd56e5ffe522a60472))
* **providers:** use Wan 3.0 at 1080P for Topview quality and first/last-frame clips ([a669cd0](https://github.com/hemi1986/coreslopper/commit/a669cd026864abebbcfc36d5e0bf253db5d10ea2))
* **qa-export:** release package with shorts and upload texts ([2bfb15e](https://github.com/hemi1986/coreslopper/commit/2bfb15e6a1cd1d7a49b1243c77a7844c798c5c20))
* **qa-export:** release package with thumbnails, shorts, and upload texts ([172f4ed](https://github.com/hemi1986/coreslopper/commit/172f4ede55e7a5a2338e8c58b953d711e5936005))
* **qa-export:** three thumbnails per video ([7027d42](https://github.com/hemi1986/coreslopper/commit/7027d426c0760c5556890a4d2cebe994dbf4abec))
* series budget, canon state and manifest, and new-series ([628dc4a](https://github.com/hemi1986/coreslopper/commit/628dc4a94abfc02661437ec0e96da3962e54b340))


### Bug Fixes

* **cli:** pass the probed lip-sync length to local generations ([eb2b49a](https://github.com/hemi1986/coreslopper/commit/eb2b49a83face05dcfd5d029acd561226a27e21f))
* **cli:** pass the probed lip-sync length to local generations ([30acae6](https://github.com/hemi1986/coreslopper/commit/30acae6f27b960acf589f318e2ffb0375f823144))


### Documentation

* accept ADR 0016 and add the episode-projects plan ([f9b8581](https://github.com/hemi1986/coreslopper/commit/f9b85810d2323974df5d854036b448d81eb374f5))
* ADR 0016 and glossary for episode projects ([945957e](https://github.com/hemi1986/coreslopper/commit/945957ebae81125f4896ccf72f53be7dfc842596))
* remove the finished episode-projects plan ([bdc1ae4](https://github.com/hemi1986/coreslopper/commit/bdc1ae44e869482715f283e55dd193b24d072988))

## [0.5.0](https://github.com/hemi1986/coreslopper/compare/v0.4.1...v0.5.0) (2026-11-10)


### ⚠ BREAKING CHANGES

* **providers:** the comfyui alternative of the video.image_to_video.* and video.premium.veo roles now uses the ltx-av workflow instead of ltx-i2v. Set models.<role>.model to ltx-i2v in project.yaml to keep the old workflow.

### Features

* **providers:** clone voices and run ACE-Step music on ComfyUI ([bc13eb9](https://github.com/hemi1986/coreslopper/commit/bc13eb9ba2ac9bef82015ace9c22dda81bf64ed4))
* **providers:** clone voices and run ACE-Step music on ComfyUI ([6b98a00](https://github.com/hemi1986/coreslopper/commit/6b98a00877f74eab0cf05c028552e658ea7f357a))
* **providers:** run stills, edits, lip-sync, and audio on ComfyUI ([0c34c20](https://github.com/hemi1986/coreslopper/commit/0c34c20195b2cc6464445017467ae255687f2ebe))
* **storyboard:** per-shot focus point for cropped formats ([4e18241](https://github.com/hemi1986/coreslopper/commit/4e18241c23702bca8da187a09cd285ae87338d03))
* **storyboard:** per-shot focus point for cropped formats ([26c7751](https://github.com/hemi1986/coreslopper/commit/26c7751fd2f75bd4a32479ffc203ef543fefdd18))


### Bug Fixes

* **providers:** honour requested clip length; add generate --provider ([c3e29f9](https://github.com/hemi1986/coreslopper/commit/c3e29f9c549ae93a6398bf7259793d8d2f28b41c))
* **providers:** honour requested clip length; add generate --provider ([2587264](https://github.com/hemi1986/coreslopper/commit/25872643e71ea4e307166d2a10f6ae29a581c18a))
* **remotion:** apply shot focus only to formats narrower than 16:9 ([f0110aa](https://github.com/hemi1986/coreslopper/commit/f0110aae352ab02b32ab3a5685203b6a1a3761ef))
* **remotion:** gate shot focus on the composition aspect ([9674243](https://github.com/hemi1986/coreslopper/commit/96742431b8c00faa92543b1372ebaba2d161716f))


### Documentation

* remove outdated PLAN.md ([5dcaf7c](https://github.com/hemi1986/coreslopper/commit/5dcaf7cc2b6e7100c8c0a4a549b14b86e79f7d59))
* remove outdated PLAN.md ([6d4c505](https://github.com/hemi1986/coreslopper/commit/6d4c5051500d74c5d2134b9066c2e1c4609c0755))

## [0.4.1](https://github.com/hemi1986/coreslopper/compare/v0.4.0...v0.4.1) (2026-11-09)


### Documentation

* **skills:** add composition rules and generation pitfalls ([0cc2e27](https://github.com/hemi1986/coreslopper/commit/0cc2e27ac0cc61c1d7255f11a3b5de98e115893c))
* **skills:** add composition rules and generation pitfalls ([157f931](https://github.com/hemi1986/coreslopper/commit/157f931558000b645060808260eff59c8eea88da))

## [0.4.0](https://github.com/hemi1986/coreslopper/compare/v0.3.0...v0.4.0) (2026-11-09)


### Features

* project brand kits with font weights and palette roles ([c4f7bd1](https://github.com/hemi1986/coreslopper/commit/c4f7bd1b23d4b2767d3f1711db7053a043d3a302))
* project brand kits with font weights and palette roles ([02afa75](https://github.com/hemi1986/coreslopper/commit/02afa7518621c91ba2623085ca5804f1020567c0))


### Bug Fixes

* keep render memory bounded and allow an external media directory ([b133e35](https://github.com/hemi1986/coreslopper/commit/b133e355df3b6cd79212b2750bdb30c93eae6de0))
* upload fal video and lip-sync inputs instead of sending data URIs ([2b69642](https://github.com/hemi1986/coreslopper/commit/2b6964281910a9741de40b82084363cea7636234))
* upload fal video and lip-sync inputs instead of sending data URIs ([d1edc16](https://github.com/hemi1986/coreslopper/commit/d1edc1618f9fcbe6fe62485111e05056b9e34a65))
* use the staged public dir for the QA determinism check ([d580b72](https://github.com/hemi1986/coreslopper/commit/d580b72ad04eab77e60c828aab018b27e5022382))

## [0.3.0](https://github.com/hemi1986/coreslopper/compare/v0.2.2...v0.3.0) (2026-11-09)


### ⚠ BREAKING CHANGES

* the lyrics and song stages, the --song, --song-provider, and --no-suno flags, and the Suno MCP server are removed. Projects always import a finished song; run /new-video <slug> to finish setup.

### Features

* render video clips locally with ComfyUI workflows ([08cb8bf](https://github.com/hemi1986/coreslopper/commit/08cb8bf8a9389bebcc34cbb04d525d2f419f180c))
* render video clips locally with ComfyUI workflows ([67cc632](https://github.com/hemi1986/coreslopper/commit/67cc632b26657fbad7fdf3eaada7082c192a676a))
* start every project from an existing song with a guided new-video skill ([1ebeb7e](https://github.com/hemi1986/coreslopper/commit/1ebeb7e28aae90fe7a8bd56b097647c3378942fd))


### Bug Fixes

* send Kling v4 start frame as start_image_url ([0b463b9](https://github.com/hemi1986/coreslopper/commit/0b463b9beb75b7e269fc5fe75aef186366fa1cdf))

## [0.2.2](https://github.com/hemi1986/coreslopper/compare/v0.2.1...v0.2.2) (2026-11-08)


### Bug Fixes

* keep upstream release automation out of workspaces ([e7f3fa2](https://github.com/hemi1986/coreslopper/commit/e7f3fa2e087c3be4545a57d63aaab50702d3cf5e))
* keep upstream release automation out of workspaces ([f692c72](https://github.com/hemi1986/coreslopper/commit/f692c7264106dcd29319c1e949018cda22fa98b1))

## [0.2.1](https://github.com/hemi1986/coreslopper/compare/v0.2.0...v0.2.1) (2026-11-08)


### Bug Fixes

* **cli:** accept a bare project slug in workspace commands ([58084e6](https://github.com/hemi1986/coreslopper/commit/58084e68a053abc42f95c9c3d0866611bccf2d68))


### Documentation

* restructure README around the user's path ([1a877ab](https://github.com/hemi1986/coreslopper/commit/1a877ab6a371f6dc3ab23a999cee1b0714617b09))
* restructure README around the user's path ([c11e0ec](https://github.com/hemi1986/coreslopper/commit/c11e0ec174b4c950a8cfe8c77556689f39938f80))

## [0.2.0](https://github.com/hemi1986/coreslopper/compare/v0.1.0...v0.2.0) (2026-11-08)


### Features

* add `coreslopper update` to merge a newer workflow into a workspace ([3eddb5c](https://github.com/hemi1986/coreslopper/commit/3eddb5caa64a534a9bf21ca13d45d24c747976e3))
* add `coreslopper update` to merge a newer workflow into a workspace ([1d10ffd](https://github.com/hemi1986/coreslopper/commit/1d10ffda2a6639d1a5b2a489564a54c9b2422cda))

## 0.1.0 (2026-11-08)


### Features

* add example brand kit and brand schema ([08ea9d5](https://github.com/hemi1986/coreslopper/commit/08ea9d579fd48e6ff4a4f13e85d4437b3d3b33f5))
* add Higgsfield provider and setup quickstarts ([6ced780](https://github.com/hemi1986/coreslopper/commit/6ced780ce9effddfb0272e11eff51939610da2f9))
* add lip-sync clips for storyboard shots ([3403cf6](https://github.com/hemi1986/coreslopper/commit/3403cf6efde67025dafc7ecdee583c31668027ad))
* add lip-sync shots and lyrics-first alignment ([d6534a9](https://github.com/hemi1986/coreslopper/commit/d6534a954bf6088f01732a525f629da4426a95d9))
* add npx onboarding and workspace bootstrap ([2393370](https://github.com/hemi1986/coreslopper/commit/2393370392eacb25d9045fb5b700281a4e88b062))
* add timing hooks, media helpers, stage reset, and MCP docs ([0b9ef19](https://github.com/hemi1986/coreslopper/commit/0b9ef1917aced6a0647f3dc8baa07222997e2f1a))
* initial coreslopper workflow and motion-only demo ([a088d10](https://github.com/hemi1986/coreslopper/commit/a088d10e63f3312ef94f8acaa29eb8acc4dfeed4))
* local ffmpeg bootstrap and media command polish ([ab347af](https://github.com/hemi1986/coreslopper/commit/ab347af580ecd4357bc0e4df8390b3d34735bb1c))


### Bug Fixes

* **audio-analysis:** align lyrics first and keep Unicode text ([ac35d0d](https://github.com/hemi1986/coreslopper/commit/ac35d0d33336e61a9bcc68c515f3a85088a8198f))
* keep character reference media out of git ([bb253f0](https://github.com/hemi1986/coreslopper/commit/bb253f091e7bcc7e761dce64ea90e6aaf6bed367))


### Documentation

* mark workflow as work in progress ([cd5c1e8](https://github.com/hemi1986/coreslopper/commit/cd5c1e8275ebec06f772eb59a313bf3fc7b97b32))
