# Code review – ST-047: The release package records whether an episode is a short episode
Base: marathon/2026-11-27-2 · Commits: 3 · Date: 2026-11-27

Scope of the diff: `releaseShape`, `manifestShape` and `SHORT_EPISODE_MAX_SECONDS` in `packages/core/src/release.ts`;
`ReleaseShapeSchema` and the optional manifest `shape` in `packages/core/src/schema.ts` and
`schema/release-manifest.schema.json`; one line in `buildRelease` (`packages/cli/src/release.ts:532`);
`tests/release-shape.test.ts`. The tests pass (8/8). The language check is green.

Checked and fine:

- **Backward compatibility.** `shape` is `ReleaseShapeSchema.optional()`, so a manifest written before ST-047 still
  parses through `ReleaseManifestSchema` (`release.ts:86`, `release-qa.ts:80`). A test in the diff shows this for a
  minimal old manifest. `manifestShape` falls back to the project kind, as the story's Context says. An older
  runtime that reads a new manifest drops the unknown key, because `z.object` strips unknown keys. The JSON schema
  was regenerated and matches.
- **Rule placement.** The rule is a pure core function. `buildRelease` gets the length from the same
  `effectiveTiming ?? timing` it uses everywhere else, so this story adds no new copy of the length (ST-045
  finding #2). `master` is a `FormatSchema` with required integer `width`/`height`, so `height >= width` always has
  values to compare. 1:1 counts as upright, as ADR 0057 and the glossary *Short Episode* say.
- **Scenarios.** All four scenario tests go through `buildRelease`. They check the `shape` in `manifest.json` on
  disk, which is the scenario's "Then". 180 s exactly is covered.
- **Scope.** `series.yaml` and `project.yaml` gain no setting. Nothing in the folder layout changes (that is
  ST-048).

| # | Severity | Area | File:line | Finding | Source (ADR, rule, glossary, smell) | Suggested direction |
|---|---|---|---|---|---|---|
| 1 | question | Domain rule | packages/core/src/release.ts:44; packages/core/src/release-plan.ts:37; packages/cli/src/publish.ts:243 | `releaseShape` compares the exact `timing.audio.duration` with `<= 180`. An episode track is mixed to millisecond precision (`episode-track.ts:155`), so a track that reads "3:00" can be 180.02 s. That episode becomes `episode`, gets its Shorts cut from its master, and does not count as a short episode. This matches `mainVideoReel` from ST-045: both rules use an exact `<=` with no tolerance, so the two agree with each other. ST-045's question #3 (the same case) is still open, though. And `publish`'s YouTube Short check allows `180 + 0.05` s (`publish.ts:243`). So a 180.03 s vertical episode is not a short episode, yet `publish` would accept the same video as a Short. | CMD-BuildReleasePackage rule "an episode is a short episode when … its episode track lasts at most 180 s"; story Context "180 s still counts"; ADR 0057; glossary *Short Episode*; ST-045 review #3 | The developer chooses one rule for both limits: (a) keep the exact comparison and tighten `publish` to match; (b) compare with a small tolerance, the same 0.05 s `publish` uses; (c) compare whole seconds. Apply the answer to `SHORT_EPISODE_MAX_SECONDS` and `MAIN_REEL_MAX_SECONDS` together, and add a test at 180.02 s. |
| 2 | minor | Design | packages/core/src/release.ts:30; packages/core/src/release-plan.ts:30; packages/cli/src/publish.ts:60 | The 3-minute short-form limit now exists as three separate constants: `SHORT_EPISODE_MAX_SECONDS`, `MAIN_REEL_MAX_SECONDS` and `YOUTUBE_LIMITS.shortSeconds`. Each has its own comparison, and one of them has a tolerance. Whatever answer #1 gets has to be made in three places. | Duplicated Code / Shotgun Surgery; ADR 0057 (one 180-s threshold for the shape and the Reel) | Keep the separate names if they help readability. Put the comparison behind one core helper (for example "lasts at most 3 minutes") that `releaseShape`, `mainVideoReel` and the publish check all call. |
| 3 | minor | Design / Scope | packages/core/src/release.ts:50-52 | `manifestShape` has no production caller; only the test calls it. The rule "a manifest without it reads as its project kind" has an implementation, but nothing in this story reads a recorded shape yet. The shape freeze (HS-268) and ST-048 will. Until then the function is exported surface with one caller. | Speculative Generality (mild: the story's Context names the rule) | Keep it for ST-048/HS-268, or move it into the story that first reads the recorded shape. The main session decides. |
| 4 | minor | Domain rule / UX | packages/core/src/release.ts:44; packages/cli/src/release.ts:532 | A vertical episode with no built episode track (`timing` undefined) is recorded as `episode` without any message. The release then lays it out as a long-form episode. The next run with a track changes it to `short-episode`. Before the freeze that is allowed, but the user gets no hint that the shape is provisional. | CMD-BuildReleasePackage rule "the length is the built episode track's"; release slice rule "a missing fact is a TODO" | Optional: add a TODO such as "no episode track: the release shape assumes a long episode". |

Verdict: ready to merge
Most important finding: #1. The 180-s comparison is exact, the same as ST-045's Reel rule, but it disagrees with `publish`'s 0.05-s Short tolerance, and ST-045's open question about non-integer lengths now decides the release shape too.
