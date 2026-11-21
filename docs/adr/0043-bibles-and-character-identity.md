# Bibles and character identity: one sheet per recurring character, an append-only canon, and copies in both directions

## Status

Proposed — 2026-11-22. Records decisions already in the code and closes rules the code leaves open. Amends
[ADR 0025](0025-plates-props-character-states.md) and [ADR 0034](0034-character-library.md). The adoption of the
character slice recovered it. The user answered four questions about how they work and has not reviewed the
code.

## Context

ADR 0025 added plates, prop references, and character states, and let an episode append them to the canon. ADR
0034 added the workspace character library. Neither says which rules hold for the bibles themselves, and the
sources disagree:
- The glossary requires a character sheet "for every character shot", but the schema makes it optional, nothing
  checks it, and the queue falls back to the first reference image.
- The glossary says no episode may change the canon, and the `new-series` skill says the same. ADR 0025 and the
  stage runner let the storyboard and assets stages append. No code enforces either.
- Characters reach the library by code only from a music video. A series canon relies on a skill step.
- `character use` drops the chain of a state whose parent was not chosen.
- Every other id of the bibles is unique and shaped like a script id. Character ids are not, although they name
  folders and library characters.

See `docs/domain/adoption-report.md`, the character slice.

## Decision

- **Two contexts.** The bibles of a production (style, character, and set bible, plus the user references) are
  one context. The workspace character library is another. Only copies cross between them: a bible's character
  names its library character, and changing the library never changes a production.
- **A character's identity travels; its states are chosen.** The identity is the name, description, prompt,
  display rule, character sheet, reference images (face, turnaround, outfits), and reference voice. Every
  character use copies it. A character state comes along only when the user chooses it, and it brings the states
  it derives from, so `from` always names a state of the same character. An outfit is a reference image of the
  identity, not a state.
- **Every recurring character the screen shows has a sheet.** Every display rule except voice-only needs one.
  The art director passes it before anything derives from it. A one-off figure needs none. The storyboard check
  refuses an AI shot that names a character without a sheet. For canon gaps, the sheet counts as a reference.
- **Character ids are like every other bible id.** They are unique within the bible and shaped like a script id.
- **The canon is append-only for episodes.** An episode's storyboard and assets stages may add plates, prop
  references, and character states, generated on the episode's budget. No episode changes or removes an entry
  of the character or set bible, and no generation of an episode writes over a canon file (ADR 0042). The
  check runs where the canon's bibles are written.
- **One import rule for both kinds.** The characters of a finished character bible go into the library by
  themselves: for a music video when `style-character` is done, and for a series canon once it has no canon gap.
  An import failure warns and never fails the stage.
- **Every file of a library character is named by it.** A re-import with a changed sheet adds the file as a
  reference image. A changed voice is reported and not copied. A state that cannot be stored is reported and
  copies nothing.
- **One resolution of continuity references.** Core resolves a shot's plate, states, sheets, and props once, for
  the storyboard check, QA, and the queue. The keyframe takes a prop's first reference image. Every reference
  image the bible names must exist before export.
- **The set bible is an output of style-character.** It is one whenever the production has a set bible, which
  music videos have when their AI shots return to a place or an object.
- **Concurrent writers are serialised.** A library character, the target's `characters.yaml` on use, and
  `references.yaml` are changed under the existing file lock.

## Alternatives considered

- **A sheet for every character shot.** The glossary's old wording. A one-off figure in a crowd would need a
  reviewed sheet for one shot, so the rule was narrowed to recurring characters.
- **A read-only canon.** ADR 0016's original stance. A later episode could not introduce a new state or a new
  plate without the user rerunning `new-series`. Appending keeps the cache keys of earlier episodes stable.
- **Keep the series import a skill step.** It works while the skill is followed. But it is the one place where
  the two kinds differ for no domain reason.

## Consequences

- Several of these rules are ahead of the code (gaps G-122 and later in `docs/domain/gap-register.md`):
  - the sheet is not checked;
  - character ids are free text and may repeat;
  - the canon's append rule is prompt text only;
  - a series canon is imported by a skill step;
  - `use` drops `from`;
  - a re-import leaves unnamed files;
  - nothing locks the files;
  - continuity references are resolved three times.
- The user has not used the library yet, so its gaps are low.
- The style bible's look and the prompts stay agent guidance that no code reads. A licence for fonts and look
  references has no field yet.
