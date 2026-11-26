---
status: accepted
date: 2026-11-22
---

# Render: one composition for every format, render records, Shorts from the current 9:16 render, and composed images

## Status

Accepted — 2026-11-22; accepted by the user on 2026-11-26. Records decisions already in the code and closes rules the code leaves open. Amends
[ADR 0007](0007-remotion-deterministic-renderer.md) and [ADR 0018](0018-thumbnails.md). The adoption of the render
slice recovered it. The user answered four questions about how they work and has not reviewed the code.

## Context

ADR 0007 made Remotion the renderer and promised determinism. ADR 0018 added three thumbnails per video. Since
then the code has moved on, and the sources disagree:
- ADR 0007 names a separate composition per format (16x9, 9x16, 1x1). The code has one `MusicVideo` composition
  that every format renders at its own size, plus 4x5.
- ADR 0018 knows one thumbnail size. The `thumbnail` command makes five, among them the 3000x3000 cover, which
  the glossary says is not a thumbnail.
- A whole render records what it was made from in `state.json`, and `release` renders a stale format again. But
  the record leaves out the asset files and the renderer's code. A passage render (`--frames`) also writes over
  the recorded file without recording anything.
- A Short is cut from `renders/9x16.mp4` and is never cut again, even when that render changes.
- ADR 0007 promises frame-hash tests. QA runs the determinism check only when asked, and CI hashes only
  thumbnails.
- A new music video or episode links its media into the media directory. A new series does not.

The user uploads the 16:9 video and the Shorts today and wants to serve every social channel from now on. The
agent picks the Shorts, and the user takes one of the three thumbnails as it is. The media live in their own
folder outside the workspace.

See `docs/domain/adoption-report.md`, the render slice.

## Decision

- **One composition for every format.** `MusicVideo` renders every format at the size in `project.yaml` and at
  the master's frame rate. A derivative is rendered again, never cropped from the master. A shot whose subject
  would leave a vertical or square frame gets a focus point. The format ids are one closed list in core: 16x9,
  9x16, 1x1, and 4x5.
- **A render record says when a render is current.** A whole render of a format records the hash of its inputs and
  the hash of its file. Its inputs are the props, the song, the asset files, and the renderer's code. A render is
  current while none of them changes. `release`, QA, and `short` all use the same check.
- **Previews are never recorded.** A half-scale render, a passage, and a single frame are previews. A preview
  gets its own file, never replaces a whole render, and never goes into the release.
- **A Short belongs to the 9:16 render it was cut from.** It records that render. When the render changes,
  `release` cuts the Short again or reports it. A window should start and end on a section boundary; `short` warns
  when it does not.
- **One command for every composed image.** Thumbnails, Short thumbnails, TikTok covers, the cover, and the feed
  and announcement images are composed images. Each has a fixed size and size limit and its recipe beside it.
  Thumbnail and Cover stay separate terms for what the image represents. The art director judges readability.
- **Determinism per machine and version.** The same inputs give the same pixels on one machine with the pinned
  Remotion version. Nothing is promised across machines. QA runs the determinism check on every pass.
- **Media live in the media directory.** With `CORESLOPPER_MEDIA_DIR` set, every new project and every new series
  canon links its `assets/` and `renders/` there. `media-link` moves an existing project.
- **One render of a project at a time.** A lock holds it, like the queue's.

## Alternatives considered

- **A composition per format** (ADR 0007's wording). Every component would exist up to four times. Sizing one
  composition by props keeps the layouts in one place, and the focus point handles the crop.
- **Hash the rendered file instead of the inputs.** That would show only that a file changed, not that it is out of
  date. The inputs say why a render must be made again.
- **Refuse a Short off a section boundary.** The agent sometimes needs a hook that starts mid-section. A warning
  keeps the rule visible without blocking it.
- **A separate cover command.** The cover follows the same rules and needs the same recipe. A second command
  would repeat the layout and the checks.

## Consequences

- Several of these rules are ahead of the code (gaps G-137 and later in `docs/domain/gap-register.md`):
  - a passage overwrites the recorded render;
  - the render record misses asset bytes and code;
  - Shorts know nothing of their source render;
  - a series canon is not linked into the media directory;
  - `short` does not warn off a section boundary;
  - QA's determinism check needs a flag;
  - nothing locks a render.
- The skill texts that assume a 16:9 master or leave out 4:5 need a fix (G-141). Every social format is used from
  now on, so this matters more than before.
- `style.motion.easing` has no effect and goes until a component reads it.
