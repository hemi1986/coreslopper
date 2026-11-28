# The board

The board is the workspace's local page: the production of every project and series, and the release view of every finished one ([ADR 0030](adr/0030-board-as-hub.md)). Claude Code runs the pipeline in its own sessions; the board shows where each project stands and the command to type next.

The navigation is a bar across the top ([ADR 0058](adr/0058-navigation-without-projects.md)): **Work** (Production, Projects, Release calendar) and **Library** (Characters, Sets, Sounds), then **+ New**, and **Guide** and **Refresh** set apart. The entry of the current view is marked; a project's tabs and a series mark **Projects**. The navigation lists no project and no series: **Projects** (`#/projects`) lists every one, released ones included, an unreadable one with its error. The board is laid out for a desktop browser: the main area uses the full window width, running text stays at about 80 characters a line, and nothing scrolls sideways down to a 1280 px window.

## The project list

**Projects** (`#/projects`) is a table with one row per music video, meme, episode and series, newest activity first. A row shows the title and slug, the kind (an episode with its number and series), the state, the production phase or current stage, the next step, the release day with its done marks, and the last activity. A click opens the project (`#/p/<slug>`) or the series (`#/s/<slug>`); Back returns to the list as you left it. The list only reads `/api/production` and `/api/projects`.

- **Sort**: click **Title**, **Release day** or **Last activity**; a second click reverses the order.
- **Search** finds a project by title or slug, case-insensitively, while you type.
- **Filters**: **Kind** (Music video, Episode, Meme, Series), **Status** (Your turn, Running, Done, Released) and **Series**. Choices within a filter combine with "or", the filters with "and". **Released** is a finished project whose release events are all ticked off or whose release day has passed, or a finished internal one. **Series** shows only that series' episodes.
- **Group by series** (off by default) puts every episode under its series row, followed by the planned episodes that have no project yet, while no search and no state filter is active.
- The search, the filters, the sort and the grouping live in the address, e.g. `#/projects?q=nacht&kind=episode&status=yours&series=drift&group=series&sort=title&dir=asc`: a refresh, Back and a pasted link restore them, and unknown values are ignored.
- With no project yet, the list says so and links **+ New**; with no match, **Reset filters** clears the search, the filters and the grouping. An unreadable project or series is a row with its error.

New to the board? Start with the [board guide](board-guide.md), a tour with screenshots ([Deutsch](board-guide.de.md)). The board shows it too: **Guide** in the navigation opens it in your browser's language, read from the workspace's `docs/`.

## Start it

Either on the computer:

```bash
npm run cli -- board                  # http://127.0.0.1:4848
```

or in a container, which also runs the watchdog every five minutes and starts again with the computer:

```bash
docker compose up -d                  # http://127.0.0.1:4848
docker compose logs -f board          # the watchdog's rounds
docker compose down                   # stop it
```

The container works the same on Linux, macOS, and Windows (Docker Desktop; on Windows keep the workspace inside WSL and run `docker compose` there). The first start installs the dependencies into a volume, which takes a minute; it installs again by itself after `coreslopper update` changed `package-lock.json`. Rebuild the image with `docker compose build` after an update changed `docker/`; `update` says so.

Settings for the container go into the workspace's `.env`, which compose reads too:

| Variable | Purpose |
|---|---|
| `TZ` | Time zone for release planning, e.g. `Europe/Paris`; without it the container plans in UTC unless `config/release-schedule.yaml` sets `timezone`. The release view and `doctor` warn when they would. |
| `CORESLOPPER_BOARD_PORT` | Port on the computer (default 4848). |
| `CORESLOPPER_MEDIA_DIR` | The media drive of `media-link`; mounted at the same path so linked `renders/` and `assets/` resolve. |
| `CORESLOPPER_MEDIA_MOUNT` | The folder to mount instead, when `CORESLOPPER_MEDIA_DIR` contains `{slug}`. |
| `CORESLOPPER_UID`, `CORESLOPPER_GID` | Linux: owner of the files the board writes; defaults to the workspace's owner. |

The port is published on 127.0.0.1 only, since the board writes release approvals. Run **either** the container **or** `release-timer install`, not both: each runs the watchdog.

## New projects

**+ New** (`#/new`) opens the chooser in two groups: **Production** (a music video, a series, an episode, or a meme) and **Library** (a character; see [Characters](#characters)). Every new item starts there, and a library list's own **+ New** opens its wizard directly. It holds what a form can hold; the grilling (brief and treatment, series bible, episode script, meme script) stays in Claude Code ([ADR 0033](adr/0033-board-wizard.md); for the meme's pitch [ADR 0051](adr/0051-memes-and-the-sound-library.md)).

- **Music video**: title, artist, slug, budget, providers (those with credentials in `.env` are marked), sung language, rights, license. Then the lyrics: paste them, let **Propose tags** add section tags (a block that repeats becomes `[Chorus]`, every other block a numbered `[Verse n]`), correct them, and save; the section list shows what the analyzer will see. Then the song and the vocal stem: the upload runs `import-song`, converting MP3, FLAC, AIFF, M4A, or OGG to WAV. Then your **references** and the **characters from the library** to take along. **Finish setup** marks `setup` done; type `/new-video <slug>` in Claude Code, which starts with the brief.
- **Series**: title, slug, budget, master format, providers; then references (characters with photos and voice recordings, sets, look, concepts) and characters from the library. Then `/new-series <slug>` grills the bible and builds the canon.
- **Episode**: the series, the episode number (the next planned one is proposed), slug, and budget; then references (a storyboard, a script draft). Then `/new-episode <slug>` grills the script.
- **Meme**: title, slug, budget (10 USD by default), providers, the **idea** (required) and the **setting** (optional), in your words, and the characters from the library you want (none is fine: then Claude invents them from the idea). The idea and the setting go into `pitch.md`, where the grilling starts; nothing in it is decided yet. **Create** makes the meme in its one 9:16 format with its setup done, so `/new-meme <slug>` starts with the script; then add references. In a terminal: `npm run cli -- new <slug> --kind meme --idea "…" [--setting "…"]`, and `character use` for the characters.

References are files or links with a kind (look, character, location, storyboard, concept, footage, voice, other), what they show, and what you want from them. They are listed in `references.yaml` of the project or canon, with the files in `assets/references/`; the agent opens them before the grilling. In a terminal: `npm run cli -- reference add projects/<slug> --file <path> --kind storyboard --note "<what for>"`, `reference link`, `reference list`, `reference remove`, and `--series` for a canon. Uploads take up to 1 GB of audio and 4 GB per reference.

A project the wizard started shows on the production page with a link back to it until its setup is done.

## Characters

**Characters** is the workspace's character library ([ADR 0034](adr/0034-character-library.md)): every character of your videos and series, with its sheet, references, voice, the states earlier productions gave it, and where it is used. The list is a table, one row per character, sorted by name: a small cover, the name, the display rule, tags, the number of images and states, whether it has a voice, how many productions use it, and its origin (manual, or the production it came from). Click a column header (name, images, used in, origin) to sort by it, again to reverse. The search looks in name, description, and tags while you type; the filters are tag chips (several mean any of them), **unused** (used in no production), and **Origin**, and they combine. Search, filters, and sort live in the address (`#/characters?q=…&tag=…&unused=1&origin=…&sort=used&dir=desc`), so a refresh, Back, and a link keep them; a character that does not load is a row with its error. A click on a row opens the character's page. A project's characters come in by themselves once its `style-character` stage is done. Everything else starts in the character wizard (`#/new/character`), reached from **+ New** → **Character** or from **+ New** in the list's head; an empty list links it too. The wizard first asks for **Create new** or **Import from a project or series**:

- **Create new**: step 1 is the name and the description (both required, as for `character new`), the display rule, the prompt sentence, and tags; **Create** makes the entry (`character new`) and moves to `#/new/character/<id>`. Step 2 uploads the character sheet and more images, each shown as it lands; step 3 the reference voice (a WAV with its exact transcript), optional. The last step links **To the character** (`#/characters/<id>`). Reloading `#/new/character/<id>` resumes with what the entry already has.
- **Import**: choose a project or series and click **Import** (`character import`); the wizard lists the characters taken in, each linked to its page, or says that none with images was found.

A refused write (an empty or taken name, a file the library does not take) shows its reason beside the step and keeps what was typed; a failed upload is retried with the step's button.

On a character's page, **Use in** copies it into a music video or series canon: its files land in `characters/<id>/`, its entry in `characters.yaml` with `library: <id>`, and only the states you tick come along. The wizard has the same choice as a step for a new music video or series, so the agent finds the character in place when it grills and builds the character bible on it. An episode gets its characters from its series. In a terminal: `npm run cli -- character list`, `character import <project>` (`--series`, `--id`, `--into`), `character new`, `character add-file`, `character use <project> <id> [--states <ids>|all]`, `character remove`.

## Sets

**Sets** is the workspace's set library ([ADR 0052](adr/0052-set-library.md)): every reusable place of your videos and series, each with its references, its plates with their camera angles, and where it is used. A set comes in by itself once a video's `style-character` stage is done; **Take from a project or series** imports an existing one, and **New set** adds your own (name, description, prompt, tags). The list is a table like the Characters list, one row per set, sorted by name: a small cover (the first plate, else the first reference), the name, tags, the number of references and of plates, how many productions use it, and its origin. Click a column header (name, references, plates, used in, origin) to sort by it, again to reverse. The search looks in name, description, and tags while you type; the filters are tag chips (several mean any of them), **unused** (used in no production), and **Origin**, and they combine. Search, filters, and sort live in the address (`#/sets?q=…&tag=…&unused=1&origin=…&sort=plates&dir=asc`), so a refresh, Back, and a link keep them; a set that does not load is a row with its error. A click on a row opens the set's page.

On a set's page, **Use in** copies it into a music video or series canon: its references and every plate land in `sets/<id>/`, and its entry in `sets.yaml` with `library: <id>`. The wizard has the same choice as a step for a new music video or series, so the agent finds the set in place when it grills and builds the set bible on it. An episode gets its sets from its series. Uploading an image adds a reference, or a plate with its angle; **Remove** takes a file out again. **Delete from the library** asks first and names every production that uses the set; those keep their copies. In a terminal: `npm run cli -- set list`, `set import <project> [--series]`, `set new`, `set add-file <id> <file> --role ref|plate --angle "…"`, `set use <project> <id> [--series]`, `set remove <id> [--file <name>]`.

## Sounds

**Sounds** is the workspace's sound library ([ADR 0051](adr/0051-memes-and-the-sound-library.md)): every recurring sound of your memes, each with what it is for, its tags, its measured length and loudness, its licence, and the memes that took it. The descriptions are what the meme skill picks by, so **use when** matters more than the title. **Upload a sound** stores one audio file (anything ffmpeg reads) as a WAV with title, use when, tags, an optional cue and trim, source, licence, and credit; the same file is stored once, and a cue or trim outside the sound is refused with its reason. The list is a table like the Sets list, one row per sound, sorted by title: a play button, the title, use when on one line, the length (trimmed), the licence, tags, and how many memes took it. The play button plays the trimmed sound in the row without leaving the list; a second click stops it, and starting another row stops the first. Click a column header (title, length, licence, used in) to sort by it, again to reverse. The search looks in title, use when, and tags while you type; the filters are tag chips (several mean any of them), **unused** (no meme took it), and **Licence** (each licence in the library, `unknown` among them), and they combine. Search, filters, and sort live in the address (`#/sounds?q=…&tag=…&unused=1&licence=unknown&sort=length&dir=desc`), so a refresh, Back, and a link keep them; a sound that does not load is a row with its error. A click elsewhere on a row opens the sound's page.

On a sound's page, the player plays it; **Cue from playback** sets the cue to the current position (counted from the trim's start, as the agent uses it to land a shot). **Edit** changes the description, tags, cue, trim, licence, source, and credit, never the file; an empty optional field clears it and a new trim keeps the moment the cue lands on. **Delete from the library** asks first and names the memes that keep their copies. The library does not poll: the board's **Refresh** reloads it and never restarts a playing sound. In a terminal: `npm run cli -- sound list`, `sound add <file> --title "…" --use-when "…"`, `sound edit <id> [--use-when "…"]`, `sound remove <id>`, `sound check`. Maintaining the library by hand – every field, the commands, and the licences – is in [the sound library page](sound-library.md) ([Deutsch](sound-library.de.md)).

## Production

The start page groups the projects: **your turn** (a command to run in Claude Code, or a release to approve), **running**, the **series**, and the projects whose release is approved. A card shows the stages as a strip, the current stage, the budget, the generation queue, failed art-director reviews, renders in progress, and the next step with a copy button. The page does not refresh itself: **Refresh** at the right of the navigation reloads the navigation and the current view. It keeps the view while a video plays or a field holds unsaved input, so it never restarts a video or discards what you typed. While a view waits longer than a moment for its data, a spinner takes its place; a button that sends something is disabled and shows a small spinner until the answer arrives, so a second click sends nothing. An upload shows its percentage instead.

A project page lists every stage with its attempts, times, and errors, the budget, the written documents (brief, treatment, lyrics or script, timing report, storyboard, QA report), which open formatted on the board with the file one click away, the renders with a player, the queue items, and the reviewed images, failed ones first. Its **Contact sheet** tab shows one card per shot of the validated storyboard in playing order (id, source, section, start–end, description, on-screen text) with the shot's keyframe from `assets/keyframes/<shot>.png` once it exists, which opens full size on a click; a shot without one shows its source. The board builds the grid on every load, so a keyframe filed later shows after **Refresh**; an invalid storyboard shows its validation error instead. `review/contact-sheet.svg` stays the storyboard stage's output. A series page shows its canon with the gaps that keep episodes from starting, the series budget, and its planned and created episodes.

The next step follows the stages: an open interactive stage is `/new-video <slug>` or `/new-episode <slug>`; an open or failed stage after that is `/video-next <slug>`; a finished project goes to its release view. A series asks for `/new-series <slug>` until every on-screen character and set has a reference and every speaking character a reference voice, then for `/new-episode`.

## Review

The **Review** tab of a project plays its renders (newest first) frame by frame:

| Key | Action |
|---|---|
| Space | play / pause |
| ← / → | one frame back / forward |
| Shift + ← / → | one second |
| `[` / `]` | previous / next shot |
| `,` / `.` | previous / next note |
| `I` / `O` | start / end of a range |
| `N` | write a note |

Below the player, the timeline shows the song's sections, the storyboard's shots, and the notes; click it to jump. Write a note and press Enter: it sits on the current frame, or on the range you marked with `I` and `O`. Drafts can be changed or deleted.

**Send to the agent** freezes the render's drafts as a review round in `review/rounds/<NNN>.json`, with the shots and section of each note. Then run `/video-next <slug>` in Claude Code: it works through the round before anything else, re-renders the preview, and answers each note (fixed, partly, not fixed, or a question), which appears under the note.

## The watchdog

One round (`npm run cli -- watch`) runs the release autopilot (`release-run`, see [publishing.md](publishing.md#release-autopilot)) and then the production scan. The scan reads every project as the board does and writes `.cache/watch/snapshot.json` and `.cache/watch/events.jsonl`; it never changes `state.json` and never starts a stage. The board shows the events under **Activity**:

- a stage started, finished, or failed;
- a render is ready, failed, or stopped moving (no progress for 15 minutes);
- a stage is **stalled**: it is running, but no file of the project changed for an hour, which usually means the Claude Code session ended;
- queue items wait for a fix; the budget passed 80 %;
- ComfyUI was restarted because it was stuck.

When `COMFYUI_RESTART_COMMAND` is set in `.env`, each round also checks the ComfyUI server, as `comfy restart --if-stuck` does (see [comfyui/README.md](../comfyui/README.md#stuck-queue)). It restarts the server only when every check of a 3-minute window found it stuck, and logs the restart under **Activity**. A healthy server ends the check at once; a stuck one makes the round up to 3 minutes longer. Without the variable the round skips the check.

The container runs a round every five minutes (`board --watch 5`); on the computer, `release-timer install` runs `watch` on a timer, or run it by hand. `watch --every <minutes>` keeps it running in a terminal.

`render` writes its progress to `review/progress/<output>.json` while it runs, so the board shows a bar for a render in another terminal or session.
