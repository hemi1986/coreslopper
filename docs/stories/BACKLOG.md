# Backlog

> Generated from `docs/stories/ST-*.md` – **do not edit manually**. Change the story files instead.

**Progress: 0 of 12 domain stories done** · scenarios 0 of 44

**21 stories** · In Progress: 0 · Ready: 20 · Ready for Human Review: 0 · In Review: 0 · Draft: 0 · Done: 1 · Superseded: 0

Within each section: by priority, then by story ID, with dependencies pulled in front. Open questions: [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md)

## Ready

| ID | Title | Type | Context | Priority | Size | Risk | Depends on |
|---|---|---|---|---|---|---|---|
| [ST-001](ST-001-add-a-library-sound.md) | Add a library sound | domain | Sound library | must | – | – | – |
| [ST-002](ST-002-edit-a-library-sound.md) | Edit a library sound's description | domain | Sound library | must | – | – | ST-001 |
| [ST-005](ST-005-validate-hand-edited-sound-entries.md) | Validate a hand-edited sound entry | domain | Sound library | must | – | – | ST-001 |
| [ST-006](ST-006-list-the-sound-library.md) | List the sound library for the meme skill | task | – | must | – | – | ST-001 |
| [ST-007](ST-007-project-kind-meme.md) | Project kind meme with its stages | tech-task | – | must | – | – | – |
| [ST-008](ST-008-create-a-meme-in-the-wizard.md) | Create a meme in the board's wizard | domain | Pipeline | must | – | – | ST-007 |
| [ST-009](ST-009-validate-a-memes-script.md) | Validate a meme's script with library sounds | domain | Scripted audio | must | – | – | ST-001, ST-007 |
| [ST-010](ST-010-the-new-meme-skill.md) | The new-meme skill grills the pitch into a script | task | – | must | – | – | ST-006, ST-008, ST-009 |
| [ST-011](ST-011-take-library-sounds-into-a-meme.md) | The voice track takes library sounds into a meme | domain | Scripted audio | must | – | – | ST-009 |
| [ST-013](ST-013-style-and-characters-for-a-meme.md) | The style-character stage of a meme | task | – | must | – | – | ST-007, ST-010 |
| [ST-015](ST-015-a-memes-release-folder.md) | A meme's release folder | domain | Release | must | – | – | ST-007 |
| [ST-016](ST-016-licence-todo-for-library-sounds.md) | The release check flags sounds of unknown licence | domain | Release | must | – | – | ST-015 |
| [ST-004](ST-004-check-the-sound-library.md) | Check the sound library after hand edits | domain | Sound library | should | – | – | ST-001 |
| [ST-017](ST-017-document-the-sound-library.md) | Document how the user maintains the sound library | task | – | must | – | – | ST-001, ST-002, ST-004 |
| [ST-003](ST-003-remove-a-library-sound.md) | Remove a library sound | domain | Sound library | should | – | – | ST-001 |
| [ST-012](ST-012-a-shot-lands-on-the-sound-cue.md) | A shot lands on a sound's cue | domain | Storyboard | should | – | – | ST-011 |
| [ST-014](ST-014-burned-in-subtitles-for-a-meme.md) | A meme's render carries German subtitles | domain | Render | should | – | – | ST-007 |
| [ST-020](ST-020-episode-announcement-says-new-episode.md) | An episode's announcement images say "new episode", not "new song" | chore | – | should | – | – | – |
| [ST-018](ST-018-the-boards-sounds-view.md) | The board's Sounds view | task | – | could | – | – | ST-001, ST-002, ST-003, ST-006 |
| [ST-019](ST-019-spike-tiktok-trending-audio.md) | Spike: can a meme use TikTok's trending audio? | spike | – | could | – | – | – |

## Done

| ID | Title | Type | Context | Priority | Size | Risk | Depends on |
|---|---|---|---|---|---|---|---|
| [ST-021](ST-021-wizard-leads-to-the-project.md) | The wizard's last step leads to the new project or series | chore | – | must | – | – | – |
