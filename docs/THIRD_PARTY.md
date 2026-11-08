# Third-Party Notices

This file records third-party skills, libraries, assets, and terms used by this repository. It is updated whenever a dependency or vendored file changes.

## Matt Pocock skills

- **Source:** <https://github.com/mattpocock/skills>
- **License:** MIT
- **Pinned commit:** `4ae2317ddb22b046e26455e4f9c9b3aaaf62212d` (2026-10-31)
- **Installed:** 2026-11-08 via `npx skills add`; the adopted skills and their supporting files were copied into `.claude/skills/`.
- **Vendored location:** `.claude/skills/`

### Adopted skills

| Skill | Upstream path | Purpose | Adaptation |
|---|---|---|---|
| `grill-me` | `skills/productivity/grill-me/SKILL.md` | User-invoked wrapper that starts the grilling interview | Vendored as-is. Keeps upstream `disable-model-invocation: true`. |
| `grilling` | `skills/productivity/grilling/SKILL.md` | Relentless interview that sharpens a plan, brief, treatment, or storyboard | Vendored as-is. |
| `writing-for-agents` | `skills/productivity/writing-for-agents/SKILL.md` + `SKILL-MECHANICS.md` | How to write skills, `AGENTS.md`, and `CLAUDE.md` | Vendored as-is. Replaces the requested `write-a-skill`, which no longer exists upstream. |
| `domain-modeling` | `skills/engineering/domain-modeling/SKILL.md` + `GLOSSARY-FORMAT.md` + `ADR-FORMAT.md` | Build and sharpen the domain model, glossary, and ADRs | Adapted to read/write `docs/glossary.md` and `docs/adr/` instead of root `GLOSSARY.md`. Replaces the requested `ubiquitous-language`, which no longer exists upstream. |

### Summary for review

- **`grilling`** treats a plan as a design tree and asks the whole current frontier in rounds, one numbered question per decision, each with a recommended answer. It waits for answers before the next round and does not act until the user confirms shared understanding. `grill-me` is a thin user-invoked entry point that calls it.
- **`writing-for-agents`** explains how agent-consumed documents work: context pointers, context vs. cognitive load, information hierarchy, progressive disclosure, completion criteria, splitting, leading words, and pruning. `SKILL-MECHANICS.md` covers frontmatter, model-invoked vs. user-invoked skills, and router skills. We use it whenever we create or revise a skill.
- **`domain-modeling`** is the active discipline for terminology: challenge fuzzy words, test edge cases, update the glossary inline, and write a short ADR only when a decision is hard to reverse, surprising without context, and the result of a real trade-off. `GLOSSARY-FORMAT.md` defines the glossary shape; `ADR-FORMAT.md` defines the one-paragraph ADR shape.

### MIT license text

```text
MIT License

Copyright (c) 2026 Matt Pocock

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Onboarding and build dependencies

The published `coreslopper` package uses these MIT-licensed libraries in addition to the runtime dependencies:

| Package | License | Use |
|---|---|---|
| `@clack/prompts` | MIT | Interactive onboarding prompts |
| `tsup` | MIT | Bundling the npx entry point with esbuild |

`commander`, `yaml`, and `zod` are also MIT-licensed and are declared in the root `package.json`.

## Remotion

- **Package:** `remotion`, `@remotion/three`, and related `@remotion/*` packages
- **Version:** 4.0.541 (pinned in `package.json`)
- **License:** Remotion License — source-available, not OSI open source
- **Terms:** <https://www.remotion.dev/docs/license>
- **Summary:** Free for individuals, for-profit organizations with up to 3 employees, and non-profit organizations. Larger for-profit organizations need a company license. The license does not cover third-party codec patents.
- **Obligation:** This repository's MIT license does not relicense Remotion. Users are responsible for complying with the Remotion License for their entity and use case.

## ffmpeg

- **Use:** footage normalization, frame extraction, and loudness normalization.
- **Install:** on Linux x64, `scripts/install-ffmpeg.sh` downloads a static build from johnvansickle.com into `.tools/ffmpeg` (gitignored). Other platforms should use their package manager.
- **License:** ffmpeg is LGPL/GPL depending on the build and its enabled components. The static build is not committed or redistributed by this repository. Users are responsible for complying with the ffmpeg license and any codec patent requirements in their jurisdiction.

## Fonts (example brand)
The example brand uses only SIL Open Font License (OFL) fonts. License files are stored next to the font files in `brand/example/fonts/`.

| Font | License | Use |
|---|---|---|
| Orbitron | SIL OFL 1.1 | Display / logo lockups |
| Space Grotesk | SIL OFL 1.1 | Body and UI |
| JetBrains Mono | SIL OFL 1.1 | Monospace / technical overlays |

## Model providers

- **Suno** — official MCP endpoint `https://api.suno.com/mcp`. Authentication and plan limits are the user's responsibility. Generated songs and stems are not committed to this repository.
- **fal.ai** — image and video generation, including lip-sync. `FAL_KEY` is read from the environment. Generated assets are not committed. Users are responsible for fal.ai's terms and the terms of the individual models they select.
- **Higgsfield** — image and video generation through the Higgsfield API. Credentials (`HIGGSFIELD_API_KEY` or `HF_API_KEY_ID` + `HF_API_KEY_SECRET`) are read from the environment. The adapter uploads local references through Higgsfield's presigned-upload endpoint and downloads outputs before caching. Generated assets are not committed. Users are responsible for Higgsfield's terms and the terms of the individual models they select.

## Demo and test media

- Test fixtures are generated by scripts from synthetic signals and deterministic mock assets.
- Any CC0 or royalty-free demo track must be recorded here with its source, author, license, and download date before it is committed.
- No Suno output, fal.ai output, Higgsfield output, or copyrighted commercial music is committed.

## Node and Python dependencies

Third-party libraries are installed from npm and PyPI under their own licenses. Before the first public release, generate a dependency license report and review it for:

- copyleft licenses that would affect distribution,
- non-commercial or research-only model licenses,
- required attribution notices.

The generated report will be stored in `docs/third-party/dependency-licenses.md` and linked here.

## Repository license

Our code and documentation are MIT-licensed. See `LICENSE`.
