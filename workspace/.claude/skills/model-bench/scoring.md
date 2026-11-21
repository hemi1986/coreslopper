# Scoring a bench case

You score every result of one case in one run against that case's rubric. You judge; you never generate.

## Inputs

- The run directory `bench/runs/<id>/` and its `run.json`: the results of your case have `"case": "<case>"`; `files`, `strip`, and `review` are relative to the run directory.
- The case file `bench/cases/<case>.yaml`: `focus`, `prompt`, `rubric`, `refusalOk`, and the fixtures. The inputs and the known good result (`golden`) are in `bench/fixtures/<case>/`.

## Looking

- **Stills:** open the output. Crop to full resolution where a criterion is about hands, text, or a face (`ffmpeg -i out.png -vf crop=w:h:x:y crop.png` into `/tmp`).
- **Clips:** start with `strip` (frames at the case's positions). For motion criteria (smear, morphing, a hand that wanders) extract more frames, one per timestamp: `ffmpeg -v error -ss <t> -i clip.mp4 -frames:v 1 -vf scale=640:-2 f-<t>.jpg`, every 0.25 s. The ffmpeg in `.tools/` or Remotion's build may lack the `fps` and `tile` filters; per-timestamp extraction works with every build. Check the last frame for drift.
- **Lip-sync:** extract frames every 0.125 s the same way, crop to the mouth, and compare them with the words of the line in the prompt; the vocal is the case's audio fixture. Count open-close cycles where the rubric asks for them.
- **First/last frame:** compare the clip's last frame with the `end` fixture.
- **Speech:** use `transcript` and its word error rate from `run.json` when present (run with `--transcribe`); otherwise score `complete` only if you can verify it, and say so in the notes.
- Look at the `golden` result once: it is the bar the source project accepted, not a target to copy.

## Points

Per criterion: **2** pass, **1** weak (usable with a note, or fails in one frame), **0** fail. Judge each criterion on its own; one bad frame of smearing does not fail `identity` unless the face changes.

- A `refused` result scores 0 on every criterion with verdict `fail` and the note "refused". For a case with `refusalOk: true` the report counts the refusal instead of the score, so the target's mean is not dragged down.
- An `error` result is not scored.
- Verdict: **pass** when no weighted criterion is 0 and the weighted score is at least 80 %; **fail** when a criterion with weight ≥ 2 is 0 or the score is below 50 %; otherwise **weak**.

## Output

Write `bench/runs/<id>/scores/<case>.json`, one entry per result key (`<case>/<target>/<seed index>`):

```json
{
  "dance-calm-2s/local/0": {
    "criteria": { "identity": 2, "motion": 2, "camera": 0, "hands": 2, "hair": 1 },
    "verdict": "weak",
    "notes": "Push-in from 0.5 s although the prompt says static; ponytail flicks across the cheek at 65 %."
  }
}
```

Notes are one or two sentences that name the frame position and the failure, so the user can find it on the page. Return a three-line summary per target: verdict counts and the worst failure.
