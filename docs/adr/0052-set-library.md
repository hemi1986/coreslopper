# The workspace set library

## Status

Accepted — 2026-11-22. Extends [ADR 0034](0034-character-library.md) to sets. Builds on
[ADR 0025](0025-plates-props-character-states.md) and [ADR 0043](0043-bibles-and-character-identity.md).

## Context

A set bible belongs to one music video or one series canon. A place that comes back in a later video (a channel's
studio, a recurring bar, a bedroom) is copied by hand from an old project's `sets/<id>/` into the new one, or it is
generated again. Its plates passed the art director at some cost, and a regenerated plate drifts in light and
furniture. The character library (ADR 0034) solved the same problem for characters. The user wants the same for
sets: kept in the board like characters, offered by the wizard and while grilling.

## Decision

- **The workspace has a set library**: `library/sets/<id>/set.yaml` (schema `library-set`, validated by the hook)
  with the set's files next to it. An entry holds the set's name, description and prompt, its reference images, its
  plates with their camera angles, tags, where it came from first (`origin`), and a `history` of later imports.
- **The character library's rules hold for sets.** Sets come in by themselves where characters do (stage-done
  `style-character` for a music video, the canon once its references passed), and by `set import` and the board.
  One set is one entry; files are stored once by content; an import into an existing entry keeps its name,
  description and prompt and appends references and plates (a plate id that exists with another image becomes
  `<plate>-<slug>`). `set new`, `set add-file`, and the board's form add a set by hand.
- **Using a set copies it, with every plate.** `set use <target> <id>`, the board's set page, and a step of the
  **+ New** wizard for music videos and series copy the references and all plates into the target's `sets/<id>/`
  and add the set to its `sets.yaml` with `library: <id>`. Unlike character states, plates are not chosen: they
  are fixed camera angles of the same place in the same light, not looks of one story. An episode takes its sets
  from its series canon, so `use` goes to the series. A target set of the same id that is not linked to the entry
  refuses the use.
- **Props stay out.** A prop reference is tied more closely to the story that made it; a prop library can follow
  as its own decision.
- **One Library context.** The character library and the set library are one bounded context, `BC-Library`: same
  owner, same rules, same exchange of copies with the bibles. The sound library stays its own context
  (ADR 0051), since its entries become takes, not bible entries.
- **The library belongs to the user.** `update` never overwrites `library/`; the media are gitignored, each
  `set.yaml` stays tracked.

## Alternatives considered

- **Put sets into the character library's entries or folder.** One folder, but a set has no identity, voice or
  states, and the ids of a character and a set would collide in one namespace.
- **Let the user choose plates on use, as states.** More control, but a set without some of its angles forces the
  storyboard to generate the missing ones again – the cost the library is there to avoid.
- **Point to the library instead of copying.** Rejected for characters in ADR 0034 for the same reasons: a changed
  library file would change a finished video's inputs and cache keys.

## Consequences

- Recurring places keep their look across productions, and each new production adds its plates back.
- The board gets a **Sets** view beside **Characters**, and the wizard a step "Sets from the library". Library set
  files are served from their own path, apart from character files, with the same sandboxing headers.
- The setup skills (`new-video`, `new-series`) offer matching library sets while grilling, as they offer
  characters.
