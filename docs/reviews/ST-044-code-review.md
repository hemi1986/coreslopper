# Code review – ST-044: A story carries no text, only an optional caption of at most 120 characters on its video
Base: marathon/2026-11-27-2 · Commits: 8 · Date: 2026-11-27

Scope of the pass: `packages/core/src/release-plan.ts`, `packages/core/src/schema.ts`, `packages/cli/src/release-texts.ts`,
`packages/cli/src/release-board-data.ts`, `schema/channel.schema.json`, `tests/release-story-caption.test.ts`, the skill
and platform notes. I also did a second pass looking for bugs in the shared plan code. Checks run: `check-language`
(OK), `vitest tests/release` (13 files, 163 tests green), `tests/release-story-caption.test.ts` (9 green).

What holds: the limit is a `DraftLimit` on the plan text. That puts it in `problems.errors` (EVT-ReleaseRulesBroken) for
the folder, QA and the board alike (ADR 0045 one set of checks, ADR 0055 one plan). The limit can be overridden through
`ChannelConfigSchema` and `platformLimits` (tested). The TODO `shorts.<name>.instagram.story` is gone, which keeps the
invariant "a TODO never fails". The caption depends on the video file (`firstShortVideo`, `announceStory && teaser`), so
an image story gets none even when the upload data has one. Each of the four scenarios has a test with the exact
title at the CLI seams `buildRelease`, `runRelease` and `boardProject`, and each test checks its scenario's Then.

| # | Severity | Area | File:line | Finding | Source (ADR, rule, glossary, smell) | Suggested direction |
|---|---|---|---|---|---|---|
| 1 | question | Domain rule | packages/core/src/release-plan.ts:542,553; workspace/.claude/skills/video-qa/release.md:158 | The announcement has no story text of its own. Its caption is the shared `announcement` string, which is `text` plus the joined hashtags. The YouTube community post (no limit) and the X post (280, `countX`) use the same string. So whenever the announcement story shows the teaser, all three posts are held to 120 characters, hashtags included. A text with five hashtags easily goes over that. An older `upload.yaml` that released cleanly yesterday now fails with `announcement story: caption has N characters, limit 120`. The story's "an older upload.yaml with a story text stays valid" only covers schema validity. The error also depends on files, not on the text: the same `upload.yaml` fails on a full run (teaser and announcement story present) and passes on the board's quick refresh once the announcement story has fallen back to the cover (`stills: false`, see the test at tests/release-story-caption.test.ts:121-129). The story's Context ("the announcement's story text become the caption") assumed a field that does not exist, and none of the four scenarios covers the announcement. | HS-267; story Context bullet 1 and "An older upload.yaml … stays valid"; AGG-ReleasePackage "a broken limit is an error" | The user decides, then the story records it: (a) keep it as built and state in HS-267/the story that the shared announcement text is held to 120 while the teaser shows; (b) caption = `announcement.text` without the hashtags; (c) an optional `announcement.story` caption field like the Shorts' (a schema change, the conservative choice for the X/YouTube texts); (d) no caption for the announcement story. |
| 2 | minor | Domain rule / compatibility | packages/core/src/release-plan.ts:256,529; packages/cli/src/release-facts.ts:104 | Before, the release-day story took the story text of the first Short in the upload data that had one. Now it takes only the story text of `files.shorts[0]`, which is the first Short by name (`localeCompare`), not by order in the upload. An older `upload.yaml` whose story text sits on another Short loses it without a warning. It no longer appears anywhere: the per-Reel `### Story` block was removed. The skill says "only the first Short's is used" but does not say first by name. | HS-267 ("a story that shows a video"); Shotgun Surgery risk between upload order and folder order | Either say "first by name" in the skill line, or warn when a Short that is not shown carries `instagram.story`. Judgement call. |
| 3 | minor | Design / Duplicated Code | packages/cli/src/release-texts.ts:586,590 | The `### <storyCaption> (<counter>)` + `block(display(...))` line is written twice, once for the announcement story and once for the release-day story. Both also pass `input.limits.instagram.story_caption` as the counter fallback, although the plan text always carries `limit.max` here. | Duplicated Code; ADR 0055 (the limit comes from the plan) | One local helper for a story caption section, with no limit fallback. |
| 4 | minor | Folder text | packages/cli/src/release-texts.ts:588-591 | `texts/instagram.md` gets a `## Story` section for the release-day story only when it has a caption. The announcement story always gets its section. A release-day story without a caption (the normal optional case) is no longer mentioned in `instagram.md` at all. Its old trace was the per-Reel `### Story` TODO. If the sticker and the files of the story are listed elsewhere (`release-plan.md`), this is fine. | ADR 0055 (one layout from the plan); consistency with the announcement section | Decide whether the release-day story should always have its section, like the announcement, with the caption shown only when there is one. |

Second pass, looking for bugs in shared code, with no further findings:
- `text()` trims and drops blank values, so a whitespace-only `story` gives no caption and no error.
- `filesFromManifest` always sets a Short's `video`, and the manifest lists `short-thumbnail` only next to a `short`, so `firstShortVideo` cannot be true without a video.
- The autopilot posts a story with `text: ''` and `media` = the story image (release-autopilot.ts:481). That matches "an image story has no caption".
- No other consumer reads `texts.story`.
- `PLATFORM_LIMITS` and the regenerated `channel.schema.json` agree.

Verdict: ready to merge
Most important: #1. The announcement's shared text (also the YouTube post and X post) now fails the release above 120 characters whenever the teaser shows, which the story did not specify. The user has to confirm it or choose another option before the rule settles.
