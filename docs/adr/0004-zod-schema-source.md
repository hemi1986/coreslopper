# Zod is the schema source of truth; JSON Schema is the cross-language contract

**Status:** Accepted

## Context

Project, state, timing, and storyboard data are consumed by TypeScript (Remotion, CLI) and Python (audio analysis). Hand-written schemas in both languages would drift.

## Decision

Define the schemas in Zod in `packages/core`. Generate JSON Schema and TypeScript types from Zod. Python validates against the generated JSON Schema with `jsonschema`. YAML and JSON are validated on every load; the Claude Code hook validates on file changes.

## Consequences

- One authoritative schema, checked into `schema/`.
- Python gets validation but not TypeScript types; generated artifacts are part of the contract.
- Zod features that cannot be represented in JSON Schema are avoided.
