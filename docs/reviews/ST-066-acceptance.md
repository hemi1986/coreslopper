# Acceptance – ST-066: A wizard adds a library sound and sets its cue while it plays
Date: 2026-11-28 · Tests run: `PATH=.tools:$PATH npx vitest run tests/board-sound-wizard.test.ts tests/board-sound-list.test.ts tests/board-character-wizard.test.ts` → 27 passed, 0 failed, 0 skipped (the ffmpeg test ran) · Preview: none

Task story (checklist, no Gherkin): `check-scenarios.ts` reports 0/0 scenarios, traceability OK.

## Checklist items
| Item | Test (file) | Really checked? | Result |
|---|---|---|---|
| Library group has a Sound card opening `#/new/sound` | board-sound-wizard.test.ts "has a Sound card in the Library group…" | Yes: card found in the Library group, click, hash asserted | OK |
| Step 1 creates the sound, address becomes `#/new/sound/<id>` | "step 1 with a file, title and use-when creates…" | Yes: real WAV upload via the real route and ffmpeg, stored entry read back (title, use_when, tags, licence unknown, measured length), hash `#/new/sound/vine-boom` | OK |
| Cue and trim set in step 2 are stored | "stores a cue and trim set in step 2…" | Yes: buttons set from player position, literals 0.2/1.6/0.3 asserted on the stored sound, reload resumes | OK |
| Step 3 without a licence stays `unknown`, shows release-check note | "leaves the licence unknown…" | Yes: note, stored `unknown`, link `#/sounds/airhorn` | OK |
| Step 1 without a file refused with reason, typed fields kept | "refuses a step 1 without a file…" | Yes: exact text, nothing sent, fields kept | OK |
| Sounds view has no inline upload form, **+ Neu** opens `#/new/sound` | "has no inline upload form, and its + New opens…" | Yes: no form or file input, click, hash | OK |

Docs (board.md, both guides, sound-library both languages) are updated in the diff; the route is wired in app.js.

## Definition of done
| Item | Applies | Evidence | OK? |
|---|---|---|---|
| Texts from the message catalogs, both languages | yes | `addStrings` de/en in sound-wizard.js and sounds.js | OK |
| Journal entry per command | yes, but existing routes reused, no new command | no new route | OK |
| No personal data in logs | yes | none added | OK |
| Untrusted input (id, file name, texts) | yes | DOM built with `text`/`.value`, ids URI-encoded, unknown id shown as text | OK |
| Docs | yes | present | OK |
| Design size / long lists | partly | no list change beyond the head button | OK |

## Edge cases not covered by the story
| Case | Expected by a rule? (cite) | Recommendation |
|---|---|---|
| Missing title or use-when in step 1 has no wizard test (story names them under Rejected; the library route refuses them) | Context "Rejected", not a checklist item | question |
| Invalid trim (start >= end, end beyond length) has no test; only an invalid cue is tested | AGG-LibrarySound invariant "cue and trim lie inside the length" | question |
| Reload of `#/new/sound/<id>` after step 1 shows step 2 and 3 as not done until visited | Context "resumes with what is already set" (the fields resume, which is tested) | question |
| Duplicate file content or a taken id on upload | AGG-LibrarySound "one sound, one entry"; the route refuses, the wizard shows the message | question |
| Other roles / concurrent use | local single-user board | none |

No merge blockers found.

## Verdict
accepted with remarks (minor remarks only: untested missing title/use-when and invalid trim paths in the wizard).
