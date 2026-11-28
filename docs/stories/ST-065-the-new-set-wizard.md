---
id: ST-065
title: A wizard creates or imports library sets
type: task
ui: true
priority: must
size: null
risk: null
depends_on: [ST-064]
labels: [feature:asset-library]
feature: asset-library
status: ready
---

## Context
Feature `asset-library`, decided by the user on 2026-11-28. Flow `FLOW-LibraryManagement`, commands
`CMD-AddLibrarySet`, `CMD-AddLibrarySetFile`, `CMD-ImportSets` (existing routes `/api/sets/new`, the set file upload,
`/api/sets/import`; no new route). Guidelines G6, G10. Same shape as the character wizard (ST-064), which brings the
**Bibliothek** group of the `#/new` chooser.

- **Entry:** **+ Neu** → **Set**, or **+ Neu** in the head of the Sets list (`#/new/set`).
- **Wizard `#/new/set`:** first the choice **Neu anlegen** / **Create new** or **Aus Projekt oder Serie übernehmen** /
  **Import from a project or series**.
  - **Create new:** step 1 name (required), description, prompt, tags → **Anlegen** creates the set and moves to
    `#/new/set/<id>`. Step 2 references and plates (a plate with its angle, as on the detail page today), each shown as
    it uploads. The last step links **Zum Set** / **To the set** (`#/sets/<id>`). Reloading resumes.
  - **Import:** choose a project or series → **Importieren** → the sets taken in, each linking to its detail page, or
    the existing "nothing found" text.
- **Rejected:** a refused write or upload names its reason in its step and keeps what was typed.
- The Sets list loses its inline creation and import forms; its head gets **+ Neu**, and its empty state links it.

## Task
- The Set card in the chooser's Library group.
- The set wizard with both paths, routed as `#/new/set[/<id>]`, reusing the existing set routes.
- Remove the inline forms from the Sets view and add **+ Neu**.
- `docs/board.md` and both board guides describe it.

## Acceptance Criteria
- [ ] The chooser's Library group has a Set card that opens `#/new/set` (test)
- [ ] Step 1 with a name creates the library set and the address becomes `#/new/set/<id>` (test with a fixture
      workspace)
- [ ] A reference and a plate uploaded in step 2 appear in the set (test)
- [ ] The import path takes the sets of a fixture project into the library and lists them with links (test)
- [ ] A refused name is shown with its reason and the fields keep their text
- [ ] The Sets view has no inline creation or import form, and its **+ Neu** opens `#/new/set`
