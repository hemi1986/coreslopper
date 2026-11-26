---
status: accepted
date: 2026-11-21
---

# Series canons live in projects/

## Status

Accepted — 2026-11-21. Changes the layout of [ADR 0016](0016-episode-projects.md); breaking for workspaces with series.

## Context

A workspace kept music videos and episodes in `projects/<slug>/` and series canons in `series/<slug>/` beside it. Everything a user produces is a project to them: a series sits on the board next to its episodes and the music videos, has a budget, references, and generated media, and more kinds of production will follow. Two top-level folders split what belongs together, made every episode reach its canon through `../../series/<s>/`, and would have needed a third folder for the next kind.

## Decision

- **Every production is a folder in `projects/`.** The file in it says what it is: `project.yaml` a music video or an episode (its `kind`), `series.yaml` a series canon. A future kind brings its own file. Episodes stay their own folders beside their series; their `project.yaml` names it in `series`.
- **One namespace for slugs.** A series and a project never share a slug; `new`, `new-series`, and the board's wizard refuse one that `projects/` holds already.
- **Paths from an episode into its canon are `../<series>/…`.** `seriesDir` resolves a sibling folder; the cache is unaffected because generation keys hash file contents, not paths.
- **A canon's review log stays in its `review/`** and is gitignored there (`projects/*/review/verdicts.jsonl`, `frames/`), so a series behaves as it did in `series/`.
- **`migrate-layout` moves an existing workspace**: every `series/<slug>/` with a `series.yaml` goes to `projects/<slug>/`; `../../series/<slug>/` and absolute paths into it are rewritten in the text files (YAML, JSON, JSONL, Markdown) of every project and canon, and the character library's `origin` and `from` labels follow. It stops before any change when a slug is taken, and `--dry-run` shows the plan. Until it ran, `doctor` reports the old layout, `update` warns, and `update` adds no `projects/<slug>/` file for a canon still in `series/<slug>/`, so the move never meets a copy.

## Alternatives considered

- **Episodes inside their series** (`projects/<series>/episodes/<n>/`). The tidier tree, but every episode path, slug, board route, and release calendar would change, for a grouping the board already shows.
- **One subfolder per kind** (`projects/videos/`, `projects/series/`). Every existing project path changes, and each new kind adds a folder again.
- **Read both places for good.** Not breaking, but two layouts stay in the code and the docs forever.
- **Move canons inside `update`.** Comfortable, but an update would move user data unasked; the user runs `migrate-layout` and commits the move on its own.

## Consequences

- Workspaces with series must run `npm run cli -- migrate-layout` once after updating; until then series do not show on the board and episodes do not find their canon.
- The legacy `series/` rules stay in `.gitignore` until every workspace moved, so an update before the migration does not start tracking canon media.
- The character library stays in `library/` ([ADR 0034](0034-character-library.md)): it is a store for all projects, not a production.
