---
status: proposed
date: 2026-11-22
---

# Model bench: the workspace as host, the user's cases as workspace content, one budget rule

## Status

Proposed — 2026-11-22. Amends [ADR 0020](0020-model-bench.md). The adoption of the bench slice recovered it from the
code and four questions about how the workflow is used; the code was not reviewed by a user.

## Context

ADR 0020 put the model bench into `bench/` and let the cases ship, because they are text. Since then the workspace
payload split from the engineering layer (ADR 0036), and `update` merges every shipped file against a baseline
(ADR 0012, 0047). The sources now disagree:
- `bench/` ships into every workspace, and there `bench import` takes the fixtures from the workspace's own projects.
  The help text still says the default source is "this repository", and the README imports from `../my-workspace`.
- Every tracked case is a scene of the maintainer's own projects: its source project, its fixture paths, its
  characters, and in one case a real person's face. In any other workspace every fixture is missing, so the cases
  cannot run there. And upstream stays generic.
- `update` treats `bench/bench.yaml`, `bench/targets.yaml` and the cases as runtime files. The `model-bench` skill
  adds targets and raises the budget there, so an upstream change gives a conflict copy. Once a case leaves
  upstream, `update` deletes the workspace's untouched copy.
- The skill says a rerun with the same run id resumes and fills gaps. The code runs every planned generation again
  and estimates the finished ones again.
- `bench.yaml` documents the whole remaining bench budget as the default batch cap, and the whole-run check uses it.
  Each single generation falls back to the 30 % of ADR 0041 instead.

The user has not used the bench yet. They would run it in their workspace, want their cases there, and want to rate
the results themselves.

See `docs/domain/adoption-report.md`, the bench slice.

## Decision

- **The workspace is the bench's host.** A bench runs where the projects are. `bench import` takes the fixtures from
  the workspace's own projects; `--from` names another workspace.
- **A user's cases are workspace content.** A case belongs to the workspace that holds its source project. Upstream
  ships the mechanism, the schemas, the targets for the default setup and one or two generic example cases whose
  inputs need no private project. The maintainer's cases move into the maintainer's workspace.
- **`bench/`'s configuration and cases are the workspace's own at update.** `bench/bench.yaml`, `bench/targets.yaml`
  and `bench/cases/` are add-only for `update`, like `projects/`. This ships before any case leaves upstream, so no
  update deletes a workspace's case.
- **A rerun fills the gaps.** Running again with a run's id keeps every ok and refused result, unless `--fresh`, and
  estimates only what is left. `--repeat`'s second render is uncached in every invocation.
- **One budget rule.** The bench budget stays separate from every project budget. One batch cap holds for the whole
  run and for each of its generations: `batch_cap_usd`, or the whole remaining bench budget. A dry run over budget
  lists its plan and says so.
- **Bench scores are not verdicts.** The art director scores a bench result against the case's rubric only. The
  rubric replaces the usual axes, the real-person rule included. The user's ratings break ties and reach the run
  folder without a manual save.

## Consequences

- Several of these rules are ahead of the code. The gaps are G-193 to G-206 in `docs/domain/gap-register.md`:
  - the cases ship and `update` merges `bench/`;
  - a rerun runs everything again, and `--repeat` can compare cached bytes;
  - the two batch caps, and the dry run that throws;
  - the broad refusal pattern;
  - the report's scoring and time legend;
  - the ratings' manual save;
  - a target's provider and workflow folder ignored for some generations;
  - unvalidated files, no lock on the bench budget, the drifted texts, and missing tests.
- The order matters: `bench/` becomes add-only in one release, and the cases leave upstream in a later one.
- ADR 0020's consequences name a core set of 25 generations and two sets; there are 28 cases and three sets. ADR 0020
  stays accepted; this ADR amends it.
- The generation funnel, its cache and its manifest stay the generation context's (ADR 0041).
