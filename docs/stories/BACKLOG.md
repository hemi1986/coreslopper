# Backlog

> Generated from `docs/stories/ST-*.md` – **do not edit manually**. Change the story files instead.

**Progress: 31 of 31 domain stories done** · scenarios 108 of 108

**59 stories** · In Progress: 0 · Ready: 5 · Ready for Human Review: 0 · In Review: 0 · Draft: 0 · Done: 54 · Superseded: 0

Within each section: by priority, then by story ID, with dependencies pulled in front. Open questions: [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md)

## Ready

| ID | Title | Type | Context | Priority | Size | Risk | Depends on |
|---|---|---|---|---|---|---|---|
| [ST-052](ST-052-the-board-shows-the-release-shape.md) | The release board names the release shape and shows only its platforms | task | – | should | – | – | ST-047, ST-048 |
| [ST-053](ST-053-a-short-episode-joins-the-series-playlist.md) | A short episode's YouTube post asks for the series playlist | task | – | should | – | – | ST-048 |
| [ST-058](ST-058-the-contact-sheet-shows-the-keyframes.md) | The board's contact sheet shows each shot's keyframe | chore | – | should | – | – | – |
| [ST-059](ST-059-the-boards-werkstatt-look.md) | The board's "Werkstatt" look | chore | – | should | – | – | ST-056 |
| [ST-054](ST-054-the-microsite-data-names-the-aspect.md) | The microsite data names the video's aspect | task | – | could | – | – | ST-048 |

## Done

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
| [ST-003](ST-003-remove-a-library-sound.md) | Remove a library sound | domain | Sound library | should | – | – | ST-001 |
| [ST-004](ST-004-check-the-sound-library.md) | Check the sound library after hand edits | domain | Sound library | should | – | – | ST-001 |
| [ST-017](ST-017-document-the-sound-library.md) | Document how the user maintains the sound library | task | – | must | – | – | ST-001, ST-002, ST-003, ST-004 |
| [ST-021](ST-021-wizard-leads-to-the-project.md) | The wizard's last step leads to the new project or series | chore | – | must | – | – | – |
| [ST-022](ST-022-board-shows-loading-and-busy-buttons.md) | The board shows when it loads and when a button is working | chore | – | must | – | – | – |
| [ST-035](ST-035-level-speech-takes-in-the-episode-track.md) | The episode track levels speech takes to one loudness | task | – | must | – | – | – |
| [ST-036](ST-036-an-internal-project-gets-no-release-package.md) | An internal project gets no release package | domain | Release | must | – | – | – |
| [ST-037](ST-037-internal-projects-end-after-qa.md) | Internal projects are created as such and end after QA | task | – | must | – | – | ST-036 |
| [ST-038](ST-038-local-lip-sync-by-default-in-comfyui-projects.md) | ComfyUI projects lip-sync locally by default | task | – | must | – | – | – |
| [ST-043](ST-043-youtube-hashtags-without-hash-on-the-board.md) | The board lists YouTube hashtags comma-separated without "#" | chore | – | must | – | – | – |
| [ST-044](ST-044-a-story-has-only-a-caption-on-its-video.md) | A story carries no text, only an optional caption of at most 120 characters on its video | domain | Release | must | – | – | – |
| [ST-045](ST-045-the-main-video-reel-up-to-three-minutes.md) | The main video goes to Instagram as a Reel only up to 3 minutes | domain | Release | must | – | – | – |
| [ST-046](ST-046-x-carries-the-main-video.md) | The X post carries the main video by default | domain | Release | must | – | – | – |
| [ST-047](ST-047-the-release-shape-of-an-episode.md) | The release package records whether an episode is a short episode | domain | Release | must | – | – | – |
| [ST-048](ST-048-a-short-episodes-release.md) | A short episode is released as one video on every platform | domain | Release | must | – | – | ST-047 |
| [ST-050](ST-050-qa-expects-the-assets-of-the-release-shape.md) | QA expects the thumbnails and covers of the release shape | task | – | must | – | – | ST-047 |
| [ST-051](ST-051-the-release-shape-is-kept-once-posted.md) | The release shape is kept once the release has started | domain | Release | must | – | – | ST-047 |
| [ST-049](ST-049-a-short-horizontal-episode-posts-its-vertical-version.md) | A horizontal episode of up to 3 minutes posts its vertical version as its one Short | domain | Release | should | – | – | ST-047 |
| [ST-055](ST-055-skills-and-docs-for-platform-formats.md) | The release skill and the platform docs follow the release shapes | task | – | must | – | – | ST-044, ST-045, ST-046, ST-048, ST-049 |
| [ST-056](ST-056-the-board-has-a-top-navigation-and-full-width.md) | The board has a top navigation and uses the full width | task | – | must | – | – | – |
| [ST-057](ST-057-the-boards-project-list.md) | The board's project list with search, filters and series grouping | task | – | must | – | – | ST-056 |
| [ST-012](ST-012-a-shot-lands-on-the-sound-cue.md) | A shot lands on a sound's cue | domain | Storyboard | should | – | – | ST-011 |
| [ST-014](ST-014-burned-in-subtitles-for-a-meme.md) | A meme's render carries German subtitles | domain | Render | should | – | – | ST-007 |
| [ST-020](ST-020-episode-announcement-says-new-episode.md) | An episode's announcement images say "new episode", not "new song" | chore | – | should | – | – | – |
| [ST-023](ST-023-library-set-entries.md) | Library set entries and their validation | tech-task | – | should | – | – | – |
| [ST-024](ST-024-add-a-library-set-by-hand.md) | Add a library set by hand | domain | Library | should | – | – | ST-023 |
| [ST-025](ST-025-add-a-file-to-a-library-set.md) | Add a reference or a plate to a library set | domain | Library | should | – | – | ST-024 |
| [ST-026](ST-026-take-sets-into-the-library.md) | Take the sets of a production into the library | domain | Library | should | – | – | ST-023 |
| [ST-027](ST-027-finished-set-bibles-go-into-the-library.md) | The sets of a finished set bible go into the library by themselves | domain | Library | should | – | – | ST-026 |
| [ST-028](ST-028-use-a-library-set.md) | Use a library set in a music video or series canon | domain | Bibles | should | – | – | ST-025 |
| [ST-029](ST-029-update-a-library-set.md) | Update a library set's name, description, prompt and tags | domain | Library | could | – | – | ST-024 |
| [ST-030](ST-030-remove-a-file-from-a-library-set.md) | Remove a reference or a plate from a library set | domain | Library | could | – | – | ST-025 |
| [ST-031](ST-031-delete-a-library-set.md) | Delete a library set | domain | Library | could | – | – | ST-024 |
| [ST-032](ST-032-the-boards-sets-view.md) | The board's Sets view | task | – | should | – | – | ST-024, ST-025, ST-026, ST-028, ST-029, ST-030, ST-031 |
| [ST-033](ST-033-wizard-step-sets-from-the-library.md) | The wizard's step "Sets from the library" | task | – | should | – | – | ST-028 |
| [ST-034](ST-034-setup-skills-offer-library-sets.md) | The setup skills offer library sets while grilling | task | – | should | – | – | ST-028 |
| [ST-039](ST-039-restart-comfyui-only-when-stuck.md) | Restart ComfyUI only when it is stuck | task | – | should | – | – | – |
| [ST-040](ST-040-an-internal-calendar-books-no-slots.md) | An internal project's calendar books no slots | domain | Release | should | – | – | ST-036 |
| [ST-041](ST-041-the-autopilot-leaves-an-internal-project-alone.md) | The autopilot leaves an internal project alone | domain | Publishing | should | – | – | ST-036 |
| [ST-042](ST-042-an-internal-project-cannot-be-approved.md) | An internal project cannot be approved | domain | Release | should | – | – | ST-036 |
| [ST-018](ST-018-the-boards-sounds-view.md) | The board's Sounds view | task | – | could | – | – | ST-001, ST-002, ST-003, ST-006 |
| [ST-019](ST-019-spike-tiktok-trending-audio.md) | Spike: can a meme use TikTok's trending audio? | spike | – | could | – | – | – |
