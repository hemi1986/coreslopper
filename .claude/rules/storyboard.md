---
paths:
  - "packages/core/src/timing.ts"
  - "packages/cli/src/validate.ts"
  - "packages/cli/src/contact-sheet.ts"
  - "packages/remotion/src/components/ShotRenderer.tsx"
  - "workspace/.claude/skills/storyboard/SKILL.md"
  - "tests/storyboard-characterization.test.ts"
  - "tests/continuity.test.ts"
  - "tests/contact-sheet.test.ts"
---

# Storyboard (BC-Storyboard)

> Concept slice across core, cli, Remotion and the workspace skill. Adopted 2026-11-21, decided by recommendation
> plus four answers from the user; model in `docs/domain/events.yaml` (`AGG-Storyboard`), decisions in ADR 0040
> (proposed), gaps G-69–G-85 in `docs/domain/gap-register.md`.

## Purpose

Turns the treatment or script, the effective timing and the bibles into an ordered list of shots that covers the
song or episode track. It checks every shot's source, continuity references and limits, and hands resolved shots
to the queue, render, QA and review.

## Key terms

Storyboard, Shot, Shot Source, Layer, Continuity Reference, Lip-Sync Shot, Highlight, Focus Point, Frame
Chaining, Coverage, Contact Sheet, all defined in `docs/glossary.md`. Do not write "shot list" or "refs", and do
not use "cut" for a shot.

## As-is boundary

- `storyboard.yaml` (`StoryboardSchema`, `ShotSchema` in `packages/core/src/schema.ts`) is parsed only by
  `loadProject`. `resolveStoryboard` (`timing.ts:455-577`) checks it as a whole: ids, order, coverage within one
  frame, sources, continuity references, highlights and chaining.
- Its only caller is `validateProject` (`packages/cli/src/validate.ts`). Render, contact sheet, QA, subtitles
  and the board review go through it. Remotion gets the resolved shots as props.
- An episode adds checks through `EpisodeContext`: scene sets and plates, ChatWindow chat lines, and lip-sync
  face and length limits. One model serves both kinds.
- The hook validates every edit of `storyboard.yaml` and blocks a failing one. That edit also rewrites
  `timing.effective.json`.

## Boundaries

- The agent writes `storyboard.yaml`, and changes it only at the user's request. No tool regenerates it.
- Check shots only in `resolveStoryboard`, and build from shots only through `validateProject`. Do not add a third
  continuity-reference resolution (G-76).
- When you add a motion component, add it to `MOTION_COMPONENTS` in core and to the switch in `ShotRenderer.tsx`.
  An unknown name falls back silently today (G-75).
- Change `ShotSchema` only together with `npm run schema`, the skill and the glossary.
- Sets, plates, props and character states are defined in the bibles and the canon (character slice). The
  storyboard only names them.

## Typical pitfalls

- A music-video lip-sync shot is not checked at all. The checks of character, face and length run for episodes
  only (G-69).
- An AI clip must carry a video prompt even when it is a lip-sync shot, and a keyframe prompt even when it is
  chained (G-71).
- An AI-clip layer with only `prompts.video` passes validation and renders empty (G-73).
- `queue add --kind` builds items from the unvalidated storyboard (G-72).
- A highlight of several words passes validation and is never shown (G-77).
- The fields `storyboard.timing`, `style` and `characters`, and `layer.blend`, are read by nothing (G-78, G-79).
- A section id containing `intro` or `outro` changes the rendered look (G-83).
- `fade`, `dissolve` and `wipe` render alike (G-80).

## Read next

- `docs/glossary.md`, `docs/adr/0005-symbolic-timing-anchors.md`, `docs/adr/0016-episode-projects.md`,
  `docs/adr/0025-plates-props-character-states.md`, `docs/adr/0040-storyboard.md`
- `docs/domain/events.yaml`, `docs/domain/context-map.as-is.md`, `docs/domain/gap-register.md`
- `docs/architecture/data-model.md`, `.claude/rules/timing.md` (anchors)
