---
id: ST-064
title: The New chooser offers the library, and a wizard creates or imports characters
type: task
ui: true
priority: must
size: null
risk: null
depends_on: []
labels: [feature:asset-library]
feature: asset-library
status: in-progress
---

## Context
Feature `asset-library`, decided by the user on 2026-11-28. Flow `FLOW-LibraryManagement`, commands
`CMD-AddLibraryCharacter`, `CMD-AddLibraryFile`, `CMD-ImportCharacters` (existing routes `/api/library/new`,
`/api/upload/library/<id>`, `/api/library/import`; no new route). Guidelines G6, G10 (everything that creates something
starts at + New), G3. Pattern: the project wizard (`packages/cli/src/board/wizard.js`, ADR 0033), which creates the
project in its first step and stays resumable by address; ST-021 (the last step leads to the new item).

- **Entry:** **+ Neu** in the navigation, then **Figur** / **Character**; or **+ Neu** in the head of the Characters
  list, which opens `#/new/character` directly.
- **Chooser:** `#/new` shows two groups, **Produktion** / **Production** (Musikvideo, Serie, Folge, Meme, as today)
  and **Bibliothek** / **Library** (Figur, Set, Sound). This story adds the group with its Character card; the Set and
  Sound cards arrive with ST-065 and ST-066.
- **Wizard `#/new/character`:** first the choice **Neu anlegen** / **Create new** or **Aus Projekt oder Serie
  übernehmen** / **Import from a project or series**.
  - **Create new:** step 1 name (required), display rule, description, prompt sentence, tags → **Anlegen** creates
    the entry and moves to `#/new/character/<id>`. Step 2 character sheet and further images, each shown as it
    uploads. Step 3 reference voice (WAV) with its exact transcript, optional. The last step links **Zur Figur** /
    **To the character** (`#/characters/<id>`). Reloading `#/new/character/<id>` resumes with what is already there.
  - **Import:** choose a project or series → **Importieren** → a list of the characters taken in, each linking to its
    detail page, or "Keine Figur mit Bildern gefunden." when there is none.
- **Rejected:** a refused write (e.g. an empty or duplicate name, an unsupported file) names its reason next to the
  step and keeps what was typed; a failed upload can be retried in its step.
- The Characters list loses its inline "Neue Figur anlegen" and "Aus Projekt oder Serie übernehmen" forms; its head
  gets **+ Neu**. The list's empty state links **+ Neu** to `#/new/character`.

## Task
- The `#/new` chooser with the two groups and the Character card.
- The character wizard with both paths, routed as `#/new/character[/<id>]`, reusing the existing library routes.
- Remove the inline forms from the Characters view and add **+ Neu**.
- `docs/board.md` and both board guides describe the wizard and the chooser.

## Acceptance Criteria
- [ ] `#/new` shows the groups Production and Library, and Library has a Character card (test)
- [ ] Step 1 with a name creates the library character and the address becomes `#/new/character/<id>` (test with a
      fixture workspace)
- [ ] A sheet and two images uploaded in step 2 appear in the entry; a voice with transcript in step 3 is its
      reference voice (test)
- [ ] Reloading `#/new/character/<id>` resumes at the entry with its files
- [ ] The import path takes the characters of a fixture project into the library and lists them with links (test)
- [ ] An empty name is refused with its reason and the other fields keep their text
- [ ] The Characters view has no inline creation or import form, and its **+ Neu** opens `#/new/character`
