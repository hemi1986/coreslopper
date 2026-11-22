---
paths:
  - "packages/cli/src/character-library.ts"
  - "packages/cli/src/board/characters.js"
  - "workspace/.claude/skills/style-bible/**"
  - "workspace/.claude/skills/character-bible/**"
  - "tests/character-*.test.ts"
  - "tests/continuity.test.ts"
---

# Bibles and the character library (BC-Bibles, BC-Library)

> Concept slice across core's schemas, the CLI, the board and two workspace skills. Adopted 2026-11-22. Decided by
> recommendation plus four answers from the user. The model is in `docs/domain/events.yaml` (`AGG-StyleBible`,
> `AGG-CharacterBible`, `AGG-SetBible`, `AGG-UserReferences`, `AGG-LibraryCharacter`), the decisions in ADR 0043
> (proposed), and gaps G-122–G-136 in `docs/domain/gap-register.md`.

## Purpose

The bibles fix what a production must look and sound like before any shot is generated: style, characters with
their states, sets with plates and props, and the user's own references. There is one set per music video, or one
per series canon for all its episodes. The character library keeps characters for reuse across productions.

## Key terms

Style Bible, Character Bible, Set Bible, Character Sheet, Character Identity, Character State, Display Rule,
Reference Voice, Set, Plate, Prop Reference, Continuity Reference, Canon, Canon Gap, User Reference, Character
Library, Library Character, Character Import, Character Use. All are in `docs/glossary.md`.

An outfit is one of the identity's reference images, not a state. The `sheet` command's side-by-side image is not
a character sheet.

## As-is boundary

- One file is one aggregate, parsed whole by its schema in `packages/core/src/schema.ts`:
  - `style.yaml`, `characters.yaml` (files in `characters/<id>/`) and `sets.yaml` (`sets/<set>/plates/`,
    `props/<id>/`);
  - `references.yaml` (`assets/references/`);
  - `library/characters/<id>/character.yaml`.

  The hook validates each one on every edit (`validate-file.ts`).
- `loadProject` gives an episode its series' bibles. Files in the episode folder are ignored.
- `character-library.ts` holds every library rule: entry matching, content dedupe, import, use, and manual
  entries. `stage-done … style-character` imports by itself and only warns on failure.
- Continuity references are resolved in `timing.ts` (storyboard), `qa.ts` and `queue.ts` `shotReferences`.

## Boundaries

- Library and bibles exchange copies only. A bible's character names its library character in `library`. Never
  link to library files from a production.
- On use, a character's identity always comes along. A state comes along only when chosen, and its parent states
  should come with it (G-129).
- In a canon, an episode's storyboard and assets stages add plates, props and states on the episode's budget.
  They never change or remove an entry, and never overwrite a file (G-126, G-118).
- Generate and judge every sheet, state, plate and prop before a shot uses it: queue items in a music video,
  `review-image` by hand in a canon.
- `library/` belongs to the user: `update` never touches it, and its media stay gitignored.
- New rules go to core. File access stays in the CLI (G-132).

## Typical pitfalls

- A sheet is optional and unchecked; the queue silently uses the first reference image instead (G-122).
- Character ids may repeat or contain any text; lookups take the first match (G-124).
- Canon gaps ignore the sheet (G-123). A series canon reaches the library only through the `new-series` skill step
  (G-127).
- A re-import with a changed sheet or voice leaves an unnamed file in the library character (G-128).
- Nothing locks the library, `references.yaml`, or the target of a use (G-130).
- QA checks only a prop's first image, and the three reference resolvers differ (G-131).
- `sets.yaml` is missing from the `style-character` outputs (G-125).

## Read next

- `docs/glossary.md` (the bible and library terms), `docs/adr/0025-plates-props-character-states.md`,
  `docs/adr/0034-character-library.md`, `docs/adr/0043-bibles-and-character-identity.md`
- `docs/domain/events.yaml`, `docs/domain/context-map.as-is.md`, `docs/domain/gap-register.md`
- `.claude/rules/storyboard.md` (continuity references in shots), `.claude/rules/verdict.md` (judging the
  references), `.claude/rules/series.md` (the canon's readers)
