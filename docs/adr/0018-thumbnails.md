# Three thumbnails per video in `qa-export`

## Status

Accepted — 2026-11-12. Extends [ADR 0002](0002-autonomous-pipeline.md) and [ADR 0007](0007-remotion-deterministic-renderer.md).

## Context

A finished video is published with a custom thumbnail, and on YouTube the thumbnail decides much of the click-through. Users made them by hand after the pipeline ended, with one-off scripts that drifted from the project's fonts and palette. Platforms let a channel test several thumbnails against each other, so one is not enough.

A thumbnail is half creative (which still, which words) and half mechanical (type, slabs, size, file format). The pipeline already splits work that way: skills decide, scripts execute.

## Decision

- **`qa-export` makes three thumbnails** once the master passes: the main character at the hero moment, the cameo or key scene, and the ensemble. They live in `renders/thumbnails/`, with the other renders and, like them, on the media drive when `renders/` is linked there.
- **The creative part is in the `video-qa` skill** (`thumbnails.md`): pick the largest, sharpest generated still (not a clip frame), check eyes and hands, write the hook (at most three lines of four words) and an optional tag, then run the `art-director` agent with the thumbnail rules: readable at 320x180, face large on the side opposite the text, palette from the style bible, no real logos, no real likeness, no banknotes in generated pixels.
- **The mechanical part is the `thumbnail` command**, a Remotion still of a `Thumbnail` composition. It reads the brand fonts and the style bible (first slab on `primary`, further slabs and the tag on `--accent`, text color by WCAG contrast) and writes a 1280x720 JPEG under 2 MB. Glyphs are measured once in the browser and fed to pure layout functions; same inputs, same pixels.
- **QA checks the files**, not the taste: `qa` reports `Thumbnails` as PASS for three valid JPEGs, WARN for fewer, FAIL for a wrong size or a file over 2 MB. `status` lists them.

## Alternatives considered

- **sharp or node-canvas.** Neither is a dependency today; both bring native binaries, and the text would need a second font pipeline. Remotion and Chrome are already installed for every render, load the brand fonts the same way the video does, and render deterministically.
- **A generated thumbnail (text in the image model's pixels).** Model text is unreliable and unbranded, and every attempt costs money. Composing over an existing still is free and exact.
- **One thumbnail.** Cheaper to review, but gives a channel nothing to test.

## Consequences

- `qa-export` takes a few minutes longer: three bundles and three stills, plus the art-director review.
- The hook font comes from the style bible's `display` typography (or `--font`). A brand whose display face is wide or light makes weaker thumbnails; the style bible should name a heavy condensed face for shouted type.
- Text inside the image (signs, screens) is not this command's job; it comes from an image edit before composing.
