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
| coreslopper-pose | `scripts/pose` | package | domain | Python | – | – | – |

## Layer packages

These packages are layers of the application, not domain slices. Their concepts cut across them.

| Package | Path | Why |
|---|---|---|
| @coreslopper/core | `packages/core` | generic package name (@coreslopper/core); 21 concept stems in this package; 12 shared with other packages |
| @coreslopper/providers | `packages/providers` | generic package name (@coreslopper/providers); 14 concept stems in this package; 2 shared with other packages |

## Slice suggestions (shared concepts)

Files that share a concept stem or a table across layers. These are suggestions – confirm the scope with the user.

| Concept | Layers | Files | Tables | Why | Adopted |
|---|---|---|---|---|---|
| timing | core, remotion, scripts, tests | 6 | – | 4 layers: core, remotion, scripts, tests; 4 packages; 6 files | yes |
| pose | cli, core, scripts, tests | 5 | – | 4 layers: cli, core, scripts, tests; 4 packages; 5 files | – |
| episode | cli, core, tests | 6 | – | 3 layers: cli, core, tests; 3 packages; 6 files | – |
| release | cli, core, tests | 37 | – | 3 layers: cli, core, tests; 3 packages; 37 files | yes |
| thumbnail | cli, remotion, tests | 7 | – | 3 layers: cli, remotion, tests; 3 packages; 7 files | yes |
| bench | cli, core, tests | 5 | – | 3 layers: cli, core, tests; 3 packages; 5 files | yes |
| generate | cli, scripts, tests | 7 | – | 3 layers: cli, scripts, tests; 2 packages; 7 files | – |
| review | cli, core, tests | 5 | – | 3 layers: cli, core, tests; 3 packages; 5 files | yes |
| media | cli, remotion, tests | 4 | – | 3 layers: cli, remotion, tests; 3 packages; 4 files | yes |
| board | cli, tests | 12 | – | 2 layers: cli, tests; 2 packages; 12 files | yes |
| publish | cli, tests | 11 | – | 2 layers: cli, tests; 2 packages; 11 files | yes |
| sery | cli, tests | 5 | – | 2 layers: cli, tests; 2 packages; 5 files | – |
| character | cli, tests | 4 | – | 2 layers: cli, tests; 2 packages; 4 files | yes |
| clip | cli, tests | 4 | – | 2 layers: cli, tests; 2 packages; 4 files | – |
| lipsync | cli, tests | 4 | – | 2 layers: cli, tests; 2 packages; 4 files | – |
| sound | cli, tests | 4 | – | 2 layers: cli, tests; 2 packages; 4 files | – |
| init | cli, tests | 3 | – | 2 layers: cli, tests; 2 packages; 3 files | – |
| production | cli, core | 3 | – | 2 layers: cli, core; 2 packages; 3 files | – |
| queue | cli, tests | 3 | – | 2 layers: cli, tests; 2 packages; 3 files | – |
| render | cli, tests | 3 | – | 2 layers: cli, tests; 2 packages; 3 files | yes |
| pipeline | – | 0 | – | marked adopted manually | yes |
| verdict | – | 0 | – | marked adopted manually | yes |
| storyboard | – | 0 | – | marked adopted manually | yes |
| generation | – | 0 | – | marked adopted manually | yes |
| series | – | 0 | – | marked adopted manually | yes |
| workspace | – | 0 | – | marked adopted manually | yes |

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
| 1 | `packages/cli` (@coreslopper/cli) | 0.61 | 472 changed files in recent history; shared library; shared infrastructure – not a domain slice |
| 2 | `scripts/audio-analysis` (coreslopper-audio-analysis) | 0.16 | 5 changed files in recent history |
| 3 | `scripts/pose` (coreslopper-pose) | 0.16 | 6 changed files in recent history |
| 4 | `packages/remotion` (@coreslopper/remotion) | 0.07 | 8 changed files in recent history; shared library; shared infrastructure – not a domain slice |
| 5 | `packages/core` (@coreslopper/core) | 0.03 | 124 changed files in recent history; shared library; layer package – hosts many concepts, not a domain slice |
| 6 | `packages/providers` (@coreslopper/providers) | 0.01 | 29 changed files in recent history; shared library; layer package – hosts many concepts, not a domain slice |

## Suggested first slice

- **Concept:** `pose` – cli, core, scripts, tests (5 file(s))
  Start with `node .claude/skills/adopt/scripts/slice.ts --cluster pose`.
- **Package:** `scripts/audio-analysis` (coreslopper-audio-analysis)
- **Shared library:** `packages/cli` (@coreslopper/cli)

Adopt one concept or domain plus at most one shared library per session. Then mark it adopted:

```bash
node .claude/skills/adopt/scripts/repo-map.ts --adopt-slice pose
node .claude/skills/adopt/scripts/repo-map.ts --adopt scripts/audio-analysis
```
