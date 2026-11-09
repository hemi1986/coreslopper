# Security Policy

## Supported versions

The `main` branch and the latest `0.1.x` release receive security fixes.

## Reporting a vulnerability

Do not open a public issue, discussion, or pull request for a vulnerability.

Use GitHub's private vulnerability reporting for this repository (Security → Report a vulnerability). If that is unavailable, contact the maintainers through a private channel listed on the repository profile.

Please include:

- affected version or commit,
- a minimal reproduction,
- the impact (secret exposure, arbitrary code execution, path traversal, denial of service, license/consent issue),
- any suggested fix.

We will acknowledge the report and coordinate a disclosure timeline.

## Secrets

- API keys are read from environment variables and are never committed.
- `.env.example` documents variable names only.
- If a key was committed by accident, revoke it first, then remove it from history.
- CI runs with no secrets and uses the mock provider.

## Generated media and consent

This is a security-adjacent concern for this project:

- Do not commit songs, stems, generated fal.ai/Higgsfield media, or copyrighted music.
- Do not generate a recognizable real person without consent.
- Do not use a trademark or copyrighted character as a character reference.
- Report a licensing or consent problem with the same private process if it involves a person or a rights holder.

## Out of scope

- Vulnerabilities in Remotion, fal.ai, Higgsfield, or a model provider should be reported to that provider.
- Cost overruns caused by ignoring the budget guard are not a security vulnerability, but they are a bug worth reporting.
