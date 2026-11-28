# Acceptance – ST-064: The New chooser offers the library, and a wizard creates or imports characters
Date: 2026-11-28 · Tests run: `npx vitest run tests/board-character-wizard.test.ts tests/board-characters.test.ts` → 16 passed, 0 failed · Preview: none

Type `task`: no Gherkin; each checklist item needs evidence.

## Checklist
| Item | Evidence (file) | Really checked? | Result |
|---|---|---|---|
| `#/new` groups Production and Library, Library has Character card | tests/board-character-wizard.test.ts "shows the groups…" | Group titles and card kinds asserted as literals; click goes to `#/new/character` | OK |
| Step 1 with a name creates the entry, address `#/new/character/<id>` | "step 1 with a name creates…" | Real board handler over a fixture workspace; hash `#/new/character/nova-lee` and saved entry read from disk | OK |
| Sheet + two images (step 2), voice with transcript (step 3) | "shows a sheet and two images…" | Upload through the real route; tiles and saved entry (sheet, refs, voice ref and transcript) asserted | OK |
| Reload resumes with its files | same test, second `showCharacterWizard('juno')` | Images, voice, done steps and the `#/characters/juno` link asserted | OK |
| Import takes a fixture project's characters and lists them with links | "imports the characters of a fixture project…" | Link text and href, library entry, and the empty text "No character with images found." | OK |
| Empty name refused with reason, other fields keep text | "refuses an empty or taken name…" | Reason, description and tags kept; duplicate name also covered | OK |
| Characters view has no inline form; + New opens `#/new/character` | "has no inline creation or import form…" | No FORM, old text absent, click sets hash; the empty-state link is tested in tests/board-characters.test.ts | OK |

Also covered: a refused upload names its reason and is retried (rejected rule in the story). The task bullet for docs is met (docs/board.md, board-guide.md, board-guide.de.md changed).

## Definition of done
| Item | Applies | Evidence | OK? |
|---|---|---|---|
| Texts from the message catalog, both languages | yes | `addStrings` with de and en in character-wizard.js | OK |
| Every command writes its journal entry | yes | Reuses the existing library routes, no new write path | OK |
| No personal data in logs | yes | No logging added | OK |
| Untrusted input (id in the address) | yes | The id only filters the API listing and is rendered via `text`/`href` of API data; an unknown id shows an error | OK |
| Docs | yes | board.md and both guides describe wizard and chooser | OK |
| Lists fast / design size | n/a | no new list | – |

## Edge cases not covered by the story
| Case | Expected by a rule? | Recommendation |
|---|---|---|
| Name differing only by case or spaces from an existing one | Id derives from the name in the existing route; the duplicate refusal is the library's | question: the wizard relies on the route, which is unchanged here |
| Voice upload without a transcript | Library rule (a voice needs its transcript); the route refuses, the wizard shows the message in the step | question: no wizard test for this case |
| Import of a series or a scope with no target | Handled by "No project or series" text; untested | question |
| Reload at `#/new/character/<unknown id>` | Shows the "No character" message with a link back | question: untested |

## Verdict
accepted

Findings: blocker 0, major 0, minor 0, question 4. Merge blockers: 0.
