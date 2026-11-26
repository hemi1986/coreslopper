---
status: proposed
date: 2026-11-22
---

# Series and episode audio: a committed series budget, a take registry, and a constructed episode track

## Status

Proposed — 2026-11-22. Records decisions already in the code and closes rules the code leaves open. Amends
[ADR 0016](0016-episode-projects.md). The layout stays as [ADR 0035](0035-series-in-projects.md) set it, and
what an episode may add to the canon stays as [ADR 0025](0025-plates-props-character-states.md) set it. The
adoption of the series slice recovered it. The user answered four questions about how they work and has not
reviewed the code.

## Context

ADR 0016 introduced episodes as a "first version": a hand-written demo canon, with a series budget and
`new-series` to follow later. Both shipped the same day. Since then, ADR 0035 moved canons into `projects/`,
takes gained a file hash, and episodes may append plates, props, and character states to the canon (ADR 0025).
ADR 0016 still says an episode never writes the canon, and no ADR says how the series budget is committed or
when a take goes stale (`docs/domain/adoption-report.md`, series).

## Decision

- **The series budget is a commitment.** Every series has a budget, set in `series.yaml`; `state.json` keeps a
  copy that must stay equal. The canon's spend plus every episode's budget fits in it: when an episode is
  created, when an episode budget changes, and before a canon generation. A new episode's budget must fit the
  **uncommitted series budget**: the series budget minus the canon's spend and minus every other episode's
  budget.
- **An episode number belongs to one episode.** `new` and the board wizard refuse a number the series already
  has. An episode outside the episode plan stays allowed.
- **Episode settings are copied once.** An episode takes its formats, providers, and brand from `series.yaml`
  when it is created. A later change to the series does not change it.
- **Episodes add to the canon and never overwrite it.** An episode may add plates, props, and character states
  (ADR 0025). A generation of an episode never writes over an existing canon file.
- **The script is validated as a whole.** The checks: unique ids, known sets and speakers, subtitle text on
  spoken and chat lines, and a typing speed for chat. The TTS rule applies to spoken text, and lines play one
  after another. The hook checks every edit. Only the agent writes the script: in the script stage, and later
  when the user asks for a change.
- **The take registry decides what is generated.** Every audible line has one take, and every scene with an
  ambience prompt has one ambience. A take is current while two things hold:
  - its file is the registered one;
  - what it was made from is unchanged: the line's kind, speaker, spoken text, and acting direction, and the
    content of the speaker's reference voice, or for an effect its prompt and length.

  A missing or stale generated take is generated again. An imported take is never generated over. A replaced
  or unregistered file, or a stale imported take, stops the voice track until the user imports or deletes it.
- **The acting direction reaches the voice.** `direction` is sent as the leading voice description of the spoken
  text. The bracket form inside the text stays accepted and is exempt from the TTS rule.
- **The episode track is constructed, not measured.** `episode-track` places the takes one after another. Its
  timing has no tempo, beats, or onsets. Its energy is the mix's envelope. It writes the timing, the mix, and
  one speaker stem per speaker together from the effective timing, so an override moves sound and picture
  together. The mix lays the ambience and an optional `audio/music.wav` under the takes. The episode's length
  is checked against the series' limit as soon as the track is built.
- **Lip-sync audio of an episode is cut from the speaker stem.** The lead-only muting of a music video
  (ADR 0026) does not apply, because an episode's timing has no words.
- **The spoken language as it is.** Spoken text is German (`text_de`, the TTS rule's examples and
  abbreviations), and subtitles are English (`text_en`, `renders/<slug>.en.srt`). The field names tie the
  product to that pair. The subtitle language is a project setting (`subtitles` in `project.yaml`: `de` by
  default for a meme, `en` for an episode, or `off`; HS-263, ST-014); the spoken language becomes a series
  setting when a series in another language needs it. Until then nothing is renamed.
- **Rules in core.** Three domain rules belong in `packages/core`: take status, the blocking rule, and the
  series budget sum. File access stays in the CLI.

## Consequences

- Several of these rules are ahead of the code (gaps G-105 and later in `docs/domain/gap-register.md`):
  - canon generations ignore episode budgets;
  - the schema leaves the series budget optional;
  - duplicate episode numbers pass;
  - an episode may overwrite canon files;
  - the take hash leaves out the reference voice and `direction`;
  - the episode length is checked only in QA;
  - take status and the series budget sum live in the CLI.
- No command changes a series budget yet, like a project budget (G-13). Raising it means changing
  `series.yaml` and `state.json` together.
- Speech still needs ComfyUI or imported takes; the cloud speech path of ADR 0016 stays open.
- Parallel creation of two episodes is not guarded: one setup skill or wizard runs at a time.
