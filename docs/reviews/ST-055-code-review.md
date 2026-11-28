# Code review – ST-055: The release skill and the platform docs follow the release shapes
Base: marathon/2026-11-28 · Commits: 4 · Date: 2026-11-28

Scope of the bug pass: `packages/core/src/schema.ts` and `schema/upload.schema.json` (input handling), `selectItems` in
`packages/cli/src/publish.ts`, the Premiere step and the pinned comment in `packages/cli/src/release-autopilot.ts`,
`unusedTexts` (`packages/core/src/release-plan.ts`) with its QA row in `packages/cli/src/release-qa.ts`, and
`provisionalShapeTodo` (`packages/core/src/release.ts`).

Input handling of the schema change, probed with `UploadDataSchema.safeParse`: `null`, a number, `{}`, `shorts: "x"`,
`shorts: [null, {name: 'main'}]`, `announcement.story` as `null`, `''` and `7`, two Shorts named `main`, a Short named
`main` next to a broken sibling, and `' main '` all return a validation error with a field path; none throws. The
`main` refinement only reads `short.name` after zod parsed the object, so it cannot crash on a malformed entry. Before
this change a Short named `main` was already refused (as `duplicate item name "main"`); the change gives it its own
message. `schema/upload.schema.json` gains `announcement.story` with `minLength: 1`, which matches the zod source (the
`main` ban is a refinement and has no JSON Schema form, the same as the duplicate-name rule before).

The Premiere step now reads `facts.input.premiere`, which `release-facts.ts:160` already sets to false for a meme and a
short episode, so the condition is equivalent for memes and correct for short episodes. The provisional-shape TODO uses
the same duration source (`effectiveTiming ?? timing`) as `releaseForm`, so the TODO and the shape agree. The targeted
tests (`release-shape-fixes`, `release-story-caption`, `schema`, `runtime-files`) pass, and `check-language` is OK.

| # | Severity | Area | File:line | Finding | Source (ADR, rule, glossary, smell) | Suggested direction |
|---|---|---|---|---|---|---|
| 1 | major | Docs / skills | workspace/.claude/skills/video-qa/SKILL.md:55 | The completion criterion of the `video-qa` skill still asks for "the six thumbnails and the cover passed the art director" for every public project. `release.md` now says that a short episode has no 16:9 thumbnails and one cover plus one TikTok cover, and that a vertical episode over 3 minutes has one thumbnail. An agent that checks the skill's completion list keeps asking for images the release does not use. | ADR 0057; story task "No skill or doc asks for … by default" | Make the criterion follow the shape, for example "the images `release.md` names for the release shape passed the art director". |
| 2 | minor | Design | packages/core/src/release-plan.ts:64 | `unusedTexts` gets the name of the Short shown in the release-day story back out of the story's video path with `/^shorts\/(.+)-9x16\.mp4$/`. This repeats the path convention of `release-facts.ts:82` and `release.ts:241,469`. If the path ever changes, `shownName` becomes `undefined` and the QA row warns about the story caption of the Short that is actually shown. The plan builder already knows the name (`files.shorts[0]?.name`, `release-plan.ts:603`). | Duplicated Code; locality | Let the plan's `story` post carry the Short's name, or compare against the plan's caption value, so the path convention lives in one place. |
| 3 | minor | Design | packages/cli/src/publish.ts:207 | Three places now define a local `oneVideo` predicate: `release-facts.ts:141` and `release-autopilot.ts:326` mean "meme or short episode", while `publish.ts:207` means "short episode" only. The same name means two different things, and the release shape decides it in several places. | Mysterious Name; Duplicated Code / Shotgun Surgery | Move one predicate over the release shape (e.g. `oneVideo(shape)`) into core's release module and call it from all three places, or rename the one in publish to `shortEpisode`. |
| 4 | minor | Behaviour vs doc | packages/cli/src/publish.ts:207 | A short episode is detected only through `main.plan?.shape`. If no release plan exists yet (no `manifest.json`), `publish` falls back to `main.platforms` and still uploads the leftover `shorts` entries. `docs/publishing.md:23` says without that condition that a short episode "uploads only `main`". The existing "no release plan yet" warning covers the case, but the doc overstates it. | docs/publishing.md vs code | Either add "with a release plan" to the doc sentence, or derive the shape from `project.yaml` and the timing (as `release-facts` does) when there is no plan. |
| 5 | minor | Scope / consistency | packages/core/src/release-plan.ts:627 | `announcement.story` is used and checked only while the announcement story shows the teaser. Without a teaser, a written `announcement.story` is not used and not length-checked, but `unusedTexts` warns only about Short story captions and `instagram_post`, not about this field. The same "written for nothing" case gets a warning for one field and silence for the other. | Story task (unused-text warnings) | Leave as is (the story names only the two cases), or add `announcement.story` to `unusedTexts` when the plan's `announce:instagram` post has no caption. |
| 6 | minor | Language | packages/cli/src/release-texts.ts:242,426 | The checklist label for the Instagram `post` step is still "Instagram feed post" / "Instagram-Feed-Post". The step only exists in calendars written before ADR 0057 and is now posted as a Reel (`autopilot.ts:114`), so the board names a post type that no longer exists. The `thumbnail --format 4x5` help text (`index.ts:252`) also still says "Instagram feed post". | ADR 0057 | Relabel the step as the main video's Reel. Outside the files the story names, so the main session decides. |
| 7 | minor | Domain model | docs/domain/events.yaml:2763 | The list of QA release rows does not include the new `Release unused texts` row. | Traceability (events.yaml as the model) | Add the row to the `fields` list. |

Verdict: ready to merge
Most important finding: #1, the `video-qa` completion criterion still asks for six thumbnails for every public project, which contradicts the short-episode and vertical-episode paths this story adds.
