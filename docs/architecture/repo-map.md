# Repository map

> Generated from the repository's manifests by `repo-map.ts` – **do not edit manually**. Refresh with
> `node .claude/skills/adopt/scripts/repo-map.ts`.

- **Tooling:** npm workspaces
- **Workspaces:** `packages/*`
- **Packages:** 6 (0 apps/services, 4 libraries)
- **Adopted:** 1 of 6
- **Tool graph:** manifests only

## Packages

| Package | Path | Kind | Role | Language | Depends on | Used by | Adopted |
|---|---|---|---|---|---|---|---|
| @coreslopper/cli | `packages/cli` | library | shared | TypeScript | – | – | – |
| @coreslopper/core | `packages/core` | library | layer | TypeScript | – | – | – |
| @coreslopper/providers | `packages/providers` | library | layer | TypeScript | – | – | – |
| @coreslopper/remotion | `packages/remotion` | library | shared | TypeScript | – | – | yes |
| coreslopper-audio-analysis | `scripts/audio-analysis` | package | domain | Python | – | – | – |
| coreslopper-review-player | `scripts/review-player` | package | domain | Python | – | – | – |

## Layer packages

These packages are layers of the application, not domain slices. Their concepts cut across them.

| Package | Path | Why |
|---|---|---|
| @coreslopper/core | `packages/core` | generic package name (@coreslopper/core); 19 concept stems in this package; 11 shared with other packages |
| @coreslopper/providers | `packages/providers` | generic package name (@coreslopper/providers); 13 concept stems in this package; 1 shared with other packages |

## Slice suggestions (shared concepts)

Files that share a concept stem or a table across layers. These are suggestions – confirm the scope with the user.

| Concept | Layers | Files | Tables | Why | Adopted |
|---|---|---|---|---|---|
| review | cli, core, scripts, tests | 10 | – | 4 layers: cli, core, scripts, tests; 4 packages; 10 files | yes |
| timing | core, remotion, scripts, tests | 6 | – | 4 layers: core, remotion, scripts, tests; 4 packages; 6 files | yes |
| episode | cli, core, tests | 6 | – | 3 layers: cli, core, tests; 3 packages; 6 files | – |
| release | cli, core, tests | 21 | – | 3 layers: cli, core, tests; 3 packages; 21 files | yes |
| thumbnail | cli, remotion, tests | 7 | – | 3 layers: cli, remotion, tests; 3 packages; 7 files | yes |
| generate | cli, scripts, tests | 7 | – | 3 layers: cli, scripts, tests; 2 packages; 7 files | – |
| bench | cli, core, tests | 4 | – | 3 layers: cli, core, tests; 3 packages; 4 files | – |
| media | cli, remotion, tests | 4 | – | 3 layers: cli, remotion, tests; 3 packages; 4 files | yes |
| board | cli, tests | 7 | – | 2 layers: cli, tests; 2 packages; 7 files | – |
| publish | cli, tests | 8 | – | 2 layers: cli, tests; 2 packages; 8 files | yes |
| sery | cli, tests | 5 | – | 2 layers: cli, tests; 2 packages; 5 files | – |
| character | cli, tests | 4 | – | 2 layers: cli, tests; 2 packages; 4 files | yes |
| init | cli, tests | 3 | – | 2 layers: cli, tests; 2 packages; 3 files | – |
| lipsync | cli, tests | 3 | – | 2 layers: cli, tests; 2 packages; 3 files | – |
| production | cli, core | 3 | – | 2 layers: cli, core; 2 packages; 3 files | – |
| queue | cli, tests | 3 | – | 2 layers: cli, tests; 2 packages; 3 files | – |
| render | cli, tests | 3 | – | 2 layers: cli, tests; 2 packages; 3 files | yes |
| state | core, tests | 3 | – | 2 layers: core, tests; 2 packages; 3 files | – |
| autopilot | cli, core | 2 | – | 2 layers: cli, core; 2 packages; 2 files | – |
| clip | cli, tests | 2 | – | 2 layers: cli, tests; 2 packages; 2 files | – |
| pipeline | – | 0 | – | marked adopted manually | yes |
| verdict | – | 0 | – | marked adopted manually | yes |
| storyboard | – | 0 | – | marked adopted manually | yes |
| generation | – | 0 | – | marked adopted manually | yes |
| series | – | 0 | – | marked adopted manually | yes |

Adopt a concept slice with:

```bash
node .claude/skills/adopt/scripts/slice.ts --cluster <name>
node .claude/skills/adopt/scripts/repo-map.ts --adopt-slice <name>
```

## Commands

| Scope | Command |
|---|---|
| Install | `npm install` |
| One package | `npm run test --workspace <package>` |

## Adoption ranking

| # | Package | Score | Why |
|---|---|---|---|
| 1 | `packages/cli` (@coreslopper/cli) | 0.61 | 320 changed files in recent history; shared library; shared infrastructure – not a domain slice |
| 2 | `scripts/audio-analysis` (coreslopper-audio-analysis) | 0.19 | 24 changed files in recent history |
| 3 | `packages/remotion` (@coreslopper/remotion) | 0.16 | 61 changed files in recent history; shared library; shared infrastructure – not a domain slice |
| 4 | `scripts/review-player` (coreslopper-review-player) | 0.16 | 8 changed files in recent history |
| 5 | `packages/core` (@coreslopper/core) | 0.04 | 111 changed files in recent history; shared library; layer package – hosts many concepts, not a domain slice |
| 6 | `packages/providers` (@coreslopper/providers) | 0.03 | 77 changed files in recent history; shared library; layer package – hosts many concepts, not a domain slice |

## Suggested first slice

- **Concept:** `episode` – cli, core, tests (6 file(s))
  Start with `node .claude/skills/adopt/scripts/slice.ts --cluster episode`.
- **Package:** `scripts/audio-analysis` (coreslopper-audio-analysis)
- **Shared library:** `packages/cli` (@coreslopper/cli)

Adopt one concept or domain plus at most one shared library per session. Then mark it adopted:

```bash
node .claude/skills/adopt/scripts/repo-map.ts --adopt-slice episode
node .claude/skills/adopt/scripts/repo-map.ts --adopt scripts/audio-analysis
```
