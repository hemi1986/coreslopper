---
id: ST-023
title: Library set entries and their validation
type: tech-task
ui: false
priority: should
size: null
risk: null
depends_on: []
labels: [feature:set-library]
status: in-progress
---

## Task
The groundwork every set library story needs (ADR 0052): the entry format, its validation, and where its files
live. It changes no behaviour a person can see yet.

- `library/sets/<id>/set.yaml` with a schema `library-set` in `packages/core/src/schema.ts`: id, name, description,
  prompt, references, plates (id, angle, prompt, file), tags, origin, added, history – shaped like
  `LibraryCharacterSchema` and the set bible's `SetSchema` and `PlateSchema`.
- `sets.yaml` of a set bible accepts `library: <id>` on a set, as `characters.yaml` does on a character.
- `validate-file` checks a `set.yaml`: the id is the folder's name, every named file is a plain file of the folder
  and exists, plate ids are unique and every plate has an angle (invariants of AGG-LibrarySet).
- `npm run schema` regenerates `schema/`; the workspace `.gitignore` ignores the media under `library/sets/` and
  keeps `set.yaml`; `update` and `init` never overwrite `library/sets/` (they already leave `library/` alone –
  checked, not assumed).

## Acceptance Criteria
- [ ] `library-set` schema with tests for a valid entry, a missing plate angle and a duplicate plate id
- [ ] `sets.yaml` accepts `library` on a set; the set bible's tests cover it
- [ ] `validate-file` refuses a `set.yaml` whose id is not its folder or that names a missing file, with a test each
- [ ] `schema/` regenerated; `.gitignore` in the repository and in `workspace/` keeps `set.yaml` and ignores the media
- [ ] A test shows that `update` leaves an existing `library/sets/<id>/` untouched

## Out of Scope
- Any command that writes an entry (ST-024 onwards)

## Open Questions
- none
