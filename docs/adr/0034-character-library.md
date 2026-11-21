# The workspace character library

## Status

Accepted — 2026-11-21. Extends [ADR 0025](0025-plates-props-character-states.md), [ADR 0030](0030-board-as-hub.md), and [ADR 0033](0033-board-wizard.md).

## Context

A character bible belongs to one project or one series canon. A character who comes back in a later video (a recurring performer, a channel's host, a mascot) was copied by hand from an old project's `characters/<id>/` into the new one, with its `characters.yaml` entry retyped. Each copy drifted on its own: other names, other references, its own states, and nothing tied the copies together. A reviewed sheet that cost several attempts was regenerated, or the agent never learned that it existed.

## Decision

- **The workspace has a character library**: `library/characters/<id>/character.yaml` (schema `library-character`, validated by the hook) with the character's files next to it. An entry holds the identity (name, description, prompt, display rule, sheet, references, voice with transcript), the continuity states of earlier productions, tags, where it came from first (`origin`), and a `history` of later imports.
- **Characters come in by themselves.** `stage-done <project> style-character` imports every character of the project's `characters.yaml` that has at least one file; `new-series` runs `character import <slug> --series` once the canon references passed. `character import` and the board's **Characters** view bring in existing projects and canons; `character new` / `add-file` and the board's form add a character by hand.
- **One character, one entry.** An imported character goes into the entry it was taken from (`library: <id>`), or into an entry with the same id whose files share content with it, or `--into` an entry the user names; anything else becomes a new entry, `<id>-<slug>` when the id is taken. Files are stored once by content. An import into an existing entry keeps its identity, fills in only what is missing, appends new references and states (a state id that exists with another image becomes `<state>-<slug>`), and records what it brought in `history`.
- **Using a character copies it.** `character use <target> <id> [--states <ids>|all]` and the board (the character's page, and a step of the **+ New** wizard for music videos and series) copy the files into the target's `characters/<id>/` and add the entry to its `characters.yaml` with `library: <id>`. The sheet, references, and voice always come along; each state only when chosen, since states are tied to the story that made them. Using the same character again adds the files and states the target lacks. An episode takes its characters from its series canon, so `use` goes to the series.
- **The character bible builds on a library character.** Its sheet and references passed review before; `character-bible` keeps them and its description, and adds the states and outfits the new video needs. `new-video` and `new-series` offer matching library characters while grilling.
- **The library belongs to the user.** `update` never overwrites `library/`; the media are gitignored, each `character.yaml` stays tracked like the other text artifacts.

## Alternatives considered

- **Point to the library instead of copying.** No duplicate bytes, but a changed library file would change a finished video's inputs and every cache key derived from them, and `media-link`, the release package, and the art director would need a second root. A copy keeps a project self-contained.
- **Derive the library from all projects on the fly.** No new folder, but the same character in three projects would show three times with no way to merge them, and deleting a project would delete the character.
- **Take every state along.** A state like "glitched" or "version 47" belongs to the story that made it; copying all of them into every new video crowds its character bible with looks nobody asked for.
- **Only explicit imports.** Characters would be missing from the library exactly when they are most likely to be reused: right after the video that made them.

## Consequences

- Shared characters keep one identity across productions, and each new production adds its states and outfits back into the library.
- The board serves library files from `/library-files/<id>/<file>`, never `character.yaml` or dot files, with the same sandboxing headers as project files; writes and uploads follow the board's same-origin rules.
- A character with the same id in two older projects and no shared file lands as two entries; `character import <project> --id <c> --into <entry>` merges it by hand.
