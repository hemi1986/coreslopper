# The board's wizard for new projects, and user references

## Status

Accepted — 2026-11-21. Extends [ADR 0013](0013-existing-song-interactive-setup.md), [ADR 0016](0016-episode-projects.md), and [ADR 0030](0030-board-as-hub.md).

## Context

Starting a music video meant a Claude Code session that asked for the project data in chat, had the user paste lyrics, told them where to copy the song and the stem, and only then began the interview that needs a human. Mood boards, the user's own storyboards, concepts, or a photo of the performer had no place: they went into the chat as paths, if at all, and were gone with the session. Series and episodes had the same gap for character photos, voice recordings, and script drafts.

The board is the workspace's page (ADR 0030). The setup steps that are a form (data, lyrics, files) do not need an agent, and they should come out the same however they are entered.

## Decision

- **The board has a wizard** (**+ New**) for a music video, a series, and an episode. It collects what a form can hold and ends with the one command to type in Claude Code: `/new-video <slug>`, `/new-series <slug>`, or `/new-episode <slug>`. It asks no creative questions: the grilling (brief, treatment, bible, script) stays with the agent.
- **Every step is a function the CLI shares**: `createProject` and `createSeries` as `new` and `new-series` run them; lyrics are written only when every line sits under a section tag (`lyrics`); the song goes through `import-song`; `setup` is marked done through the same state functions as `stage-done`. Inputs are checked like the CLI's (slug, budget at least the configured minimum, providers, ISO language).
- **Lyrics tags are proposed deterministically**: blocks split at blank lines; a block that repeats is `[Chorus]`, every other block a numbered `[Verse n]`; tags the user wrote stay, and lines before the first tag get `[Intro]`. The user corrects them and confirms the section list, which is what the setup stage asked of them before.
- **User references** are a new artifact: `references.yaml` in a project or series canon (id, kind, file or url, title, subject, note, added; validated by the hook) with the files in `assets/references/`, where the project template already put user references. Kinds: look, character, location, storyboard, concept, footage, voice, other. The skills read them before the grilling (`new-video`, `new-series`, `new-episode`) and as inputs of the brief, treatment, style and character bibles, and the storyboard; a user's storyboard or concept is the starting point. `reference add|link|list|remove` records material handed over in chat the same way.
- **Uploads stream to disk** under a size limit (1 GB of audio, 4 GB per reference) through a `.part` file, with an extension whitelist, and only from the board's own page: a raw `application/octet-stream` body with a matching `Origin`, which a cross-site page cannot send without a preflight the board never answers.
- **An episode created in the wizard has its setup done**, so `/new-episode` starts with the script; a music video's setup is done when its lyrics and song are in.

## Alternatives considered

- **A questionnaire in the wizard** (topic, audience, look). The grilling's value is that it follows the answers; a form freezes the first answer and duplicates the brief.
- **Let the wizard start Claude Code.** The user starts sessions (ADR 0030).
- **References as free-form files in a folder.** Without kind, subject, and note the agent has to guess what a photo is for; the list also lets the board show and remove them.
- **Multipart form uploads.** A form post is a simple request any website can send to 127.0.0.1; a raw body with a non-simple content type keeps the board's same-origin rule.

## Consequences

- `references.yaml` is tracked with the project's other text files; the reference files are media under `assets/` and stay local.
- The wizard can create a project and stop halfway; the production view links back to it until the setup is done, and `/new-video <slug>` resumes from whatever the wizard left.
