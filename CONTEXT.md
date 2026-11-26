# coreslopper

A Claude Code-native workflow that produces music videos for an existing song, episodes of a series from a
script, and memes from a pitch, from setup to the release package. Creative work is agent work; mechanical work is tested scripts.

## Language

The product's glossary is **[docs/glossary.md](docs/glossary.md)**: the product standard, shipped to every
workspace, where the media agents use it. This file is Kataster's glossary for engineering on the repository and
never ships. It imports the product glossary and only extends it.

Imports: docs/glossary.md

Rules:

- A product term – one a workspace user or a media agent meets – lives in `docs/glossary.md`, never here.
- A term only engineering on this repository needs lives below, in the same format.
- A term is defined in one file only. An unclear meaning is a hotspot in `docs/domain/events.yaml`, not an
  `[OPEN]` in the shipped glossary.
- Kataster's deterministic tools (`check-language`, `story-context`) read only this file today; they do not
  follow the import yet. Agents read both.

## Engineering terms

**Workspace Payload**:
The part of the upstream repository that every workspace gets: the product code and docs at their own paths, and `workspace/`, which becomes the workspace root. The runtime snapshot is built from it.
_Avoid_: runtime source

**Engineering Layer**:
The agent instructions, tooling, and documents for working on the upstream repository itself: the root `AGENTS.md`, `CLAUDE.md`, and `.claude/`. It never reaches a workspace.
_Avoid_: dev workflow, dev config

**Sandbox Workspace**:
A workspace created from a local checkout of the upstream repository with `npm run dev:workspace`, outside the repository, to try the workflow the way a user gets it.
_Avoid_: test workspace, playground

**Release Post Plan**:
The plan `buildReleasePlan` builds and `release` stores as `manifest.plan`: every post's exact platform text, release-folder files, source, and text limit, keyed by calendar event id. The folder texts, QA, the board, the autopilot, and `publish` read it. It is not the `release-plan.md` table, which is the calendar laid out.
_Avoid_: calendar table (that is `release-plan.md`)

<!--
**Term**:
What it is, in one or two sentences.
_Avoid_: Synonym, other word
_UI (en)_: the one UI word
-->
