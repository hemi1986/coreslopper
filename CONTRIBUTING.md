# Contributing

Thanks for helping make coreslopper better. This repository is an open-source workflow, so keep every contribution license-safe and reproducible.

## Setup

```bash
npm install
npm test
npm run typecheck
cd scripts/audio-analysis && uv sync --group dev && uv run pytest -q
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
- Never commit Suno/fal.ai output, commercial music, or copyrighted footage.
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

## Commits and pull requests

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
