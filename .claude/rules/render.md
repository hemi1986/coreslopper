---
paths:
  - "packages/remotion/**"
  - "packages/core/src/palette.ts"
  - "packages/core/src/browser.ts"
  - "packages/cli/src/render.ts"
  - "packages/cli/src/render-progress.ts"
  - "packages/cli/src/short.ts"
  - "packages/cli/src/thumbnail.ts"
  - "packages/cli/src/thumbnail-files.ts"
  - "packages/cli/src/thumbnail-recipe.ts"
  - "packages/cli/src/media-dir.ts"
  - "workspace/.claude/skills/assembly-render/**"
  - "workspace/.claude/skills/video-qa/SKILL.md"
  - "workspace/.claude/skills/video-qa/thumbnails.md"
  - "workspace/.claude/skills/remotion-motion/**"
  - "tests/render-characterization.test.ts"
  - "tests/episode-render.test.ts"
  - "tests/thumbnail*.test.ts"
  - "tests/media-dir.test.ts"
---

# Render (BC-Render)

> Concept slice across the shared library `packages/remotion`, core's palette and format fields, the CLI and three
> workspace skills. Adopted 2026-11-22. Decided by recommendation plus four answers from the user. The model is in
> `docs/domain/events.yaml` (`AGG-Render`, `AGG-Short`, `AGG-ComposedImage`), the decisions in ADR 0044 (proposed),
> and gaps G-137–G-149 in `docs/domain/gap-register.md`.

## Purpose

Render turns a validated project into its videos and images:
- a render per format, all from one composition;
- previews for checks;
- Shorts cut from the 9:16 render;
- composed images (thumbnails, covers, feed images) made from a generated image and the style bible.

It also keeps a project's media in the media directory.

## Key terms

Render, Master Format, Derivative Format, Render Record, Preview, Short, Composed Image, Thumbnail, Cover, Thumbnail
Recipe, Media Directory. All are in `docs/glossary.md`. A passage (`--frames`) and a single frame (`--still`) are
previews. "Test render", "media drive" and "Animatic" are not terms.

## As-is boundary

- `packages/remotion` is a pure function of props and frame. It does no file access. It takes runtime values only
  from `@coreslopper/core/browser`; type imports from `@coreslopper/core` are erased. It has two compositions,
  `MusicVideo` (every format, sized by props) and `Thumbnail` (five formats).
- The CLI owns input, output and encoding. Its pieces:
  - `buildVideoProps` builds the props;
  - `stagePublicDir` links only the folders the props reference;
  - segments render under `.cache/render/`, and ffmpeg joins them and muxes the song;
  - the finished file is copied into `renders/`.
- A whole render (not a preview, not `--frames`, not `--out`) leaves its render record in `state.json` through
  `renderArtifactKeys`. `release` compares the record to decide what to render again.
- `short` cuts `renders/shorts/<name>-9x16.mp4` from `renders/9x16.mp4`. `thumbnail` writes a JPEG and its
  `<name>.recipe.json`.
- `media-link` and `createProject` turn `assets/` and `renders/` into links into `CORESLOPPER_MEDIA_DIR`.
- `review/progress/<file>.json` is the render progress. The board and the watch read it.

## Boundaries

- Read the storyboard, timing, bibles and episode script through `loadProject` and `validateProject`. Never write
  them from here.
- Every format renders the one composition at the master's frame rate. A derivative is never a crop of the master.
- The song is the only sound. Clips and footage stay muted.
- A preview never replaces a whole render and never goes into the release (G-137).
- Animate only from `useCurrentFrame()` and `useVideoConfig()`; use `random(seed)`. Determinism is promised per
  machine and pinned Remotion version.
- A new motion component goes into the `MotionLayer` switch in `ShotRenderer.tsx` **and** `MOTION_COMPONENTS` in
  `packages/core/src/timing.ts`.
- Remotion stays pinned to one exact version in `package.json`.

## Typical pitfalls

- `render --frames` without `--out` overwrites `renders/<format>.mp4` without recording it (G-137, high).
- The render record leaves out asset bytes and the renderer's code. QA and `short` check only that a file exists
  (G-138).
- A Short is not tied to its 9:16 render, and `release` never cuts it again (G-139).
- `new-series` does not link a canon into the media directory (G-140).
- The skills assume a 16:9 master and leave out 4:5 (G-141).
- A derivative's own `fps` is ignored silently. The format ids are listed three times (G-143).
- QA checks determinism only with `--determinism` (G-144). `style.motion.easing` is never read (G-145).
- Two renders of one project share a work folder. `recordRender` saves `state.json` without a lock (G-146, G-1).
- Colour resolution exists twice, and `release.ts` writes the record keys as a literal (G-147).

## Read next

- `docs/glossary.md` (the render terms), `docs/adr/0007-remotion-deterministic-renderer.md`,
  `docs/adr/0018-thumbnails.md`, `docs/adr/0044-render-records-and-composed-images.md`
- `packages/remotion/README.md`, `docs/architecture.md` (Rendering)
- `.claude/rules/storyboard.md` (shots as props), `.claude/rules/timing.md` (Remotion's timing helpers),
  `.claude/rules/character.md` (the style bible's palette, typography and grain)
