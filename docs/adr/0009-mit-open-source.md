# MIT open source with explicit third-party notices

**Status:** Accepted

## Context

The repository should be usable by anyone and is not a commercial product. It vendors MIT-licensed skills and depends on source-available Remotion and external model providers.

## Decision

License our code and documentation under MIT. Do not commit API keys, generated Suno/fal.ai assets, or copyrighted media. Vendor Matt Pocock's skills under `.claude/skills/` with source, pinned commit, license, and a summary in `docs/THIRD_PARTY.md`. Document Remotion's separate license, font licenses, and provider terms. The example brand uses original assets and OFL fonts. CI runs without secrets.

## Consequences

- Others may use the repository commercially; that is what MIT means.
- Remotion and provider compliance remain the user's responsibility.
- Updating a vendored skill requires re-vendoring, re-testing, and updating the notice.
