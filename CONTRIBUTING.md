# Contributing

Thanks for helping make coreslopper better. This repository is an open-source workflow, so keep every contribution license-safe and reproducible.

## Setup

Work in a clone of this repository, not in an npx workspace:

```bash
git clone https://github.com/hemi1986/coreslopper.git
cd coreslopper
./scripts/setup.sh        # or: npm install && (cd scripts/audio-analysis && uv sync --group dev)
npm test
npm run typecheck
npm run python:test
```

The repository contains a 12-second, motion-only demo project that needs no API keys:

```bash
npm run demo:audio                                  # generate the license-safe demo audio
npm run cli -- validate projects/demo
npm run cli -- contact-sheet projects/demo
npm run cli -- render projects/demo --format 16x9   # → projects/demo/renders/16x9.mp4
npm run demo                                        # all of the above, three formats, and QA
npm run cli -- doctor                               # check tools, fonts, Remotion, and keys
```

Optional system dependency: `ffmpeg` and `ffprobe` for footage import and loudness normalization. On Linux x64, `./scripts/install-ffmpeg.sh` installs a static build into `.tools/ffmpeg`; the media commands use it automatically.

## What to work on

- Pipeline stages and validators.
- Remotion components, effects, and deterministic rendering.
- Audio analysis (librosa, WhisperX, Demucs).
- Provider adapters behind the narrow `generateImage` / `editImage` / `imageToVideo` interface.
- Documentation, examples, and tests.
- Accessibility, readability, and safe-area checks.

## Skills

Use the vendored `writing-for-agents` skill when creating or editing a skill. Own skills use only:

```yaml
---
name: skill-name
description: Use when ...
license: MIT
---
```

The description is a trigger, not a summary. State the branches that should make the agent reach for the skill.

Use the terms in `docs/glossary.md` consistently. If a term is missing or fuzzy, use `domain-modeling` and update the glossary.

## Schemas and contracts

Zod in `packages/core/src/schema.ts` is the source of truth. After changing a schema:

```bash
npm run schema
npm test
```

Do not hand-edit `schema/*.json`; regenerate it.

## Media and secrets

- Never commit `.env`, API keys, tokens, or private URLs.
- Never commit songs, stems, fal.ai/Higgsfield output, commercial music, or copyrighted footage.
- Put fixture media under `scripts/fixtures/` and generate it from code when possible.
- If a demo needs a real track, use a CC0/royalty-free track and record the source, author, license, and download date in `docs/THIRD_PARTY.md`.
- The example brand uses OFL fonts only. Add the font license file next to the font.

## Tests

- TypeScript: `npm test` (Vitest).
- Typecheck: `npm run typecheck`.
- Python: `cd scripts/audio-analysis && uv run pytest -q`.
- Storyboard/timing changes: `npm run cli -- validate projects/demo`.
- Render changes: render a still at a section boundary and a short preview.
- Determinism changes: render the same frame twice and compare hashes.

CI runs without API keys and uses the mock provider. GPU tests are opt-in.

## Releases and publishing

Releases are automated with [release-please](https://github.com/googleapis/release-please) in `.github/workflows/release.yml`:

1. Every push to `main` updates an open **release PR** that bumps the version in `package.json` and adds the new entries to `CHANGELOG.md`. The entries come from Conventional Commit messages.
2. Merging the release PR creates the `vX.Y.Z` tag and a GitHub release with the same notes.
3. The same workflow then runs typecheck, tests, and a package smoke test, and publishes `coreslopper` to npm with provenance. After that, `npx coreslopper@latest` picks up the new version.

Do not edit the version in `package.json` or `CHANGELOG.md` by hand. To force a specific version, add a `Release-As: 1.0.0` line to a commit body.

The `publish` job uses npm trusted publishing (OIDC): no npm token in the repository and no one-time password. A manual run (`workflow_dispatch`) publishes whatever version is in `package.json` on `main`, which helps when a publish failed after the release was created. Never put a token in `.env`, a workflow file, or a commit.

### First time only: placeholder and trusted publisher

A trusted publisher can only be configured for a package that already exists on npm. Publish once by hand (this is the only step that needs 2FA; pass `--otp=<code>` when the shell cannot open a browser):

```bash
npm login
npm version 0.0.0 --no-git-tag-version
npm publish --access public
npm version 0.1.0 --no-git-tag-version   # back to the version release-please expects
```

With staged publishing, npm answers the first publish with a stub `0.0.0-stage` placeholder and holds `0.0.0` for approval on npmjs.com. The stub is enough to configure the trusted publisher; the staged `0.0.0` can be discarded.

Then on npmjs.com → `coreslopper` → Settings → **Trusted publishing** → GitHub Actions:

| Field | Value |
|---|---|
| Organization or user | `hemi1986` |
| Repository | `coreslopper` |
| Workflow filename | `release.yml` |
| Environment name | – (leave empty) |
| Allowed actions | **Allow npm publish** (the default `npm stage publish` alone is not enough) |

The first CI publish has to succeed within two days, otherwise the configuration expires and has to be created again. Once it works, lock the old path down: Settings → **Publishing access** → "Require two-factor authentication and disallow tokens". Trusted publishers keep working; tokens stop working.

Inspect the tarball locally without publishing:

```bash
npm run pack:check
```

## Commits and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:` (minor bump before 1.0), `fix:` (patch), `docs:`, `chore:`, `test:`, `ci:`, `refactor:`. Mark breaking changes with `feat!:` or a `BREAKING CHANGE:` footer. With squash merges, the PR title becomes the commit message, so it must follow the same format.
- Keep commits focused.
- Describe the user-visible change and the test you ran.
- Link an issue when one exists.
- Do not mix generated media, dependency updates, and behavior changes in one PR.
- By contributing, you agree that your contribution is licensed under the repository's MIT license.

## Code style

- TypeScript: strict mode, no `any` unless unavoidable and explained.
- Python: type hints on public functions, pure helpers separated from heavy imports.
- Remotion: frame-driven animation only; no wall clock, no `Math.random`, no `useFrame` clock.
- Markdown: English, short sentences, relative links.

## Security

Do not open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md).
