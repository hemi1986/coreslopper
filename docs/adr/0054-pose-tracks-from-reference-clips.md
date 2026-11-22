# Pose tracks from reference clips

## Status

Accepted — 2026-11-22.

## Context

A motion shot can animate a flat cut-out figure in Remotion. Hand-keyed dance moves look stiff; the moves of a
real person in a clip the user hands over (a stage appearance, a viral dance) look alive. Those clips are third-party
material: no frame or sound of them may end up in a video. What the pipeline needs from them is the motion alone,
as data a component can play at any frame, and a stage runner may only get it through a CLI command.

The clips are what the internet keeps: 144p to 1080p, 10 to 30 fps, blurry, often a montage with camera cuts and
more than one person on stage.

## Decision

- **`pose-extract` writes a pose track.** `npm run cli -- pose-extract <project> --input <clip> --name <id>` writes
  `assets/poses/<id>.json`: per frame of the chosen window, the 17 COCO keypoints of one person, normalized to the
  source frame, with a confidence each, and a quality block (detection rate, confidence per limb, jitter, people,
  camera cuts, gaps, warnings). `--preview` adds `<id>.preview.mp4` (the skeleton over the source beside the
  skeleton alone) for human review only. The track is a motion source; no image or sound of the clip is kept in it.
- **RTMPose through rtmlib on onnxruntime.** A YOLOX person detector trained on Human-Art and RTMPose (body7)
  run on the CPU by default, in their own uv project (`scripts/pose/`, extra `engine`), invoked by the CLI like the
  bench invokes transcription. The models download once into the workspace's `.cache/pose/models/`, never into the
  repository. MediaPipe was the other candidate: its current releases no longer ship the legacy pose solution with
  bundled models, its landmarker needs a separately downloaded model as well, and it tracks one person without a
  detector we can steer. RTMPose is COCO-17 natively, multi-person, and holds up on blurry low-resolution stage
  footage.
- **One person, tracked.** `--person largest|center|<n>` picks the person in the first frame with detections; later
  frames follow that box by overlap, then by centroid. A lost person is picked again by the rule after a short
  grace, and so after every camera cut; the report says when.
- **Short gaps interpolated, long gaps missing.** Gaps up to 0.3 s between two found frames are filled linearly and
  marked `interpolated`; longer ones, gaps at the edges, and gaps across a cut stay `k: null`.
- **Zero-phase One-Euro smoothing.** The filter runs forwards and backwards and averages, per segment between gaps
  and cuts, with its parameters in the file. A single pass trails a fast arm by a tenth of the frame.
- **Sampling lives in core.** `PoseTrackSchema`, `samplePoseTrack` (linear interpolation, confidence gating, loop),
  `relativePose` (joints from mid-hip in torso lengths, the aspect undone) and `poseBoneAngles` are browser-safe
  exports, so a project's puppet component in Remotion retargets a track onto any proportions. The puppet itself
  stays project-specific.

## Consequences

- The first run installs the Python engine (onnxruntime, OpenCV, rtmlib; about 650 MB in `.venv`) and downloads
  about 150 MB of models; later runs are offline. A 14 s 1080p window takes about two minutes on the CPU.
- On a 144p test clip, upscaling before detection gave no measurable gain (both models resize their input); it
  stays as a cheap safeguard, one bicubic resize per frame.
- A track from a montage has jumps at its cuts; the report lists them, and one track per shot of the source is the
  rule.
- Pose tracks live under `assets/`, gitignored like every derived asset; they are rebuilt from the clip.
