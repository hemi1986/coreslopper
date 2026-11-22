"""Extract a pose track (COCO-17 keypoints of one person) from a reference clip.

The clip is a motion source only: the track holds normalized keypoints, never pixels or sound.
Run through `npm run cli -- pose-extract`, which resolves paths, ffmpeg, and the model cache;
by hand:

    uv run --extra engine python extract.py --input clip.mp4 --output track.json [--preview p.mp4]

Engine: RTMPose (body7) with a YOLOX person detector through rtmlib on onnxruntime (CPU by
default). The models download once into --model-dir.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pose_core import (  # noqa: E402
    COCO_KEYPOINTS,
    COCO_SKELETON,
    OneEuroParams,
    PersonTracker,
    QualityInput,
    box_area,
    detect_cuts,
    fill_gaps,
    frame_records,
    parse_person_rule,
    quality,
    smooth,
)

MODES = {
    "lightweight": ("yolox_tiny_8xb8-300e_humanart-6f3252f9", (416, 416), "rtmpose-s_simcc-body7_pt-body7_420e-256x192-acd4a1ef_20230504", (192, 256)),
    "balanced": ("yolox_m_8xb8-300e_humanart-c2c7a14a", (640, 640), "rtmpose-m_simcc-body7_pt-body7_420e-256x192-e48f03d0_20230504", (192, 256)),
    "performance": ("yolox_x_8xb8-300e_humanart-a39d44ed", (640, 640), "rtmpose-x_simcc-body7_pt-body7_700e-384x288-71d7b7e9_20230629", (288, 384)),
}
MODEL_URL = "https://download.openmmlab.com/mmpose/v1/projects/rtmposev1/onnx_sdk/{}.zip"

# Inputs below this height are upscaled (bicubic) before detection and pose estimation.
MIN_HEIGHT = 720
MAX_UPSCALE = 6.0
# A detection must score this high (rtmlib's default of 0.7 drops blurry, small people).
DETECTION_SCORE = 0.45
# A pose whose mean keypoint confidence is below this counts as no person.
MIN_POSE_SCORE = 0.2
# Reuse the last box for this many frames when the detector misses (motion blur).
HOLD_BOX_FRAMES = 3
# Gaps up to this long are interpolated; longer ones stay missing.
MAX_GAP_SECONDS = 0.3
# Histogram distance (Bhattacharyya, HSV) above which a frame starts a new shot.
CUT_THRESHOLD = 0.5


def log(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def load_engine(mode: str, model_dir: str, device: str):
    # rtmlib caches downloads under $TORCH_HOME/hub/checkpoints; keep them in the workspace cache.
    os.environ["TORCH_HOME"] = model_dir
    from rtmlib import YOLOX, RTMPose

    det_name, det_size, pose_name, pose_size = MODES[mode]
    detector = YOLOX(MODEL_URL.format(det_name), model_input_size=det_size, score_thr=DETECTION_SCORE, backend="onnxruntime", device=device)
    estimator = RTMPose(MODEL_URL.format(pose_name), model_input_size=pose_size, backend="onnxruntime", device=device)
    return detector, estimator, {"name": "rtmlib", "mode": mode, "detector": det_name, "pose": pose_name, "device": device}


def open_clip(path: str):
    import cv2

    capture = cv2.VideoCapture(path)
    if not capture.isOpened():
        raise SystemExit(f"Cannot open {path}")
    fps = capture.get(cv2.CAP_PROP_FPS) or 0.0
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    if fps <= 0 or fps > 240:
        raise SystemExit(f"Cannot read the frame rate of {path}")
    return capture, fps, width, height, count


def window_frames(path: str, start: float, end: float | None):
    """Yield (index, seconds from window start, frame) for frames in [start, end)."""
    capture, fps, _, _, _ = open_clip(path)
    index = -1
    kept = 0
    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            index += 1
            t = index / fps
            if t + 1e-6 < start:
                continue
            if end is not None and t >= end - 1e-6:
                break
            yield kept, t - start, frame
            kept += 1
    finally:
        capture.release()


def histogram(frame):
    import cv2

    small = cv2.resize(frame, (160, 90), interpolation=cv2.INTER_AREA)
    hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1], None, [16, 8], [0, 180, 0, 256])
    return cv2.normalize(hist, hist).flatten()


def detect(args) -> dict:
    """Run detector and pose model over the window: the raw, unsmoothed result."""
    import cv2

    rule = parse_person_rule(args.person)
    capture, fps, width, height, count = open_clip(args.input)
    capture.release()
    duration = count / fps if count > 0 else None
    start = args.start or 0.0
    end = args.end
    if duration is not None:
        if start >= duration:
            raise SystemExit(f"--from {start:.2f} s is past the end of the clip ({duration:.2f} s)")
        end = min(end, duration) if end is not None else duration
    upscale = min(MAX_UPSCALE, MIN_HEIGHT / height) if height < MIN_HEIGHT else 1.0
    work_w, work_h = int(round(width * upscale)), int(round(height * upscale))

    detector, estimator, engine = load_engine(args.mode, args.model_dir, args.device)
    tracker = PersonTracker(rule=rule, width=work_w, height=work_h, lost_after=max(4, int(round(fps * 0.4))))

    times, points, conf, detected, people, distances = [], [], [], [], [], []
    previous_hist = None
    held = 0
    began = time.time()
    for index, t, frame in window_frames(args.input, start, end):
        hist = histogram(frame)
        distances.append(0.0 if previous_hist is None else float(cv2.compareHist(previous_hist, hist, cv2.HISTCMP_BHATTACHARYYA)))
        previous_hist = hist
        if len(distances) > 1 and distances[-1] > CUT_THRESHOLD:
            tracker.reset()
        image = frame if upscale == 1.0 else cv2.resize(frame, (work_w, work_h), interpolation=cv2.INTER_CUBIC)
        boxes = detector(image)
        boxes = [b for b in boxes if box_area(b) > 0]
        people.append(len(boxes))
        chosen = tracker.update(boxes)
        box = None
        if chosen is not None:
            box = boxes[chosen]
            held = 0
        elif tracker.last is not None and held < HOLD_BOX_FRAMES:
            box = tracker.last
            held += 1
        times.append(t)
        if box is None:
            points.append(np.zeros((17, 2)))
            conf.append(np.zeros(17))
            detected.append(False)
            continue
        keypoints, scores = estimator(image, bboxes=[list(box)])
        kp = np.asarray(keypoints[0], dtype=float) / np.array([work_w, work_h])
        sc = np.clip(np.asarray(scores[0], dtype=float), 0.0, 1.0)
        ok = float(np.mean(sc)) >= MIN_POSE_SCORE
        points.append(kp)
        conf.append(sc if ok else np.zeros(17))
        detected.append(ok)
        if ok and chosen is None:
            # A held box found the person again: follow the pose, not the stale box.
            xs, ys = kp[sc >= 0.3, 0] * work_w, kp[sc >= 0.3, 1] * work_h
            if len(xs):
                tracker.last = (float(xs.min()), float(ys.min()), float(xs.max()), float(ys.max()))
        if index % 50 == 0:
            log(f"pose-extract: frame {index}, {t:.1f} s")

    if not times:
        raise SystemExit("The window has no frames.")
    return {
        "file": Path(args.input).name, "start": start, "fps": fps, "width": width, "height": height,
        "upscale": upscale, "engine": engine, "rule": rule, "times": np.array(times), "points": np.array(points),
        "conf": np.array(conf), "detected": np.array(detected, dtype=bool), "people": people,
        "distances": distances, "reacquired": tracker.reacquired, "seconds": time.time() - began,
    }


def build_track(raw: dict, params: OneEuroParams | None = None) -> dict:
    """Fill gaps, smooth, measure, and lay out the pose track file."""
    params = params or OneEuroParams()
    times, fps, width, height = raw["times"], raw["fps"], raw["width"], raw["height"]
    cuts = detect_cuts(raw["distances"], CUT_THRESHOLD)
    filled, conf, valid, interpolated = fill_gaps(raw["points"], raw["conf"], raw["detected"], times, MAX_GAP_SECONDS, breaks=cuts)
    smoothed = smooth(filled, valid, times, params, aspect=width / height, breaks=cuts)
    stats = quality(
        QualityInput(
            times=times, fps=fps, width=width, height=height, upscale=round(raw["upscale"], 2),
            detected=raw["detected"], valid=valid, interpolated=interpolated, conf=conf,
            raw_points=filled, points=smoothed, people=raw["people"], cuts=cuts,
            reacquired=raw["reacquired"], rule=raw["rule"],
        )
    )
    start = raw["start"]
    return {
        "version": 1,
        "source": {
            "file": raw["file"],
            "from": round(start, 3),
            "to": round(start + len(times) / fps, 3),
            "fps": round(fps, 3),
            "width": width,
            "height": height,
            "aspect": round(width / height, 4),
        },
        "engine": {**raw["engine"], "upscale": round(raw["upscale"], 2)},
        "person": str(raw["rule"]),
        "smoothing": {"filter": "one-euro", **params.as_dict(), "maxGap": MAX_GAP_SECONDS},
        "keypoints": COCO_KEYPOINTS,
        "frames": frame_records(times, smoothed, conf, valid, interpolated),
        "quality": {**stats, "seconds": round(raw["seconds"], 1)},
    }


# ---------------------------------------------------------------------------
# Preview


COLORS = {"left": (80, 200, 255), "right": (255, 140, 60), "center": (120, 255, 120)}


def bone_color(a: int, b: int):
    name = COCO_KEYPOINTS[a] + COCO_KEYPOINTS[b]
    if "left" in name and "right" not in name:
        return COLORS["left"]
    if "right" in name and "left" not in name:
        return COLORS["right"]
    return COLORS["center"]


def draw_skeleton(image, keypoints, gate: float = 0.3, dim: bool = False):
    import cv2

    h, w = image.shape[:2]
    thickness = max(2, int(round(h / 180)))
    pts = [(int(round(x * w)), int(round(y * h)), c) for x, y, c in keypoints]
    for a, b in COCO_SKELETON:
        if pts[a][2] >= gate and pts[b][2] >= gate:
            color = bone_color(a, b)
            if dim:
                color = tuple(int(v * 0.55) for v in color)
            cv2.line(image, pts[a][:2], pts[b][:2], color, thickness, cv2.LINE_AA)
    for x, y, c in pts:
        if c >= gate:
            cv2.circle(image, (x, y), thickness + 1, (255, 255, 255), -1, cv2.LINE_AA)


def write_preview(args, track: dict) -> None:
    """Source window with the skeleton over it, beside the skeleton alone, as H.264 without sound."""
    import cv2

    source = track["source"]
    fps = source["fps"]
    height = int(min(720, max(480, source["height"])))
    height -= height % 2
    width = int(round(height * source["aspect"]))
    width -= width % 2
    frames = track["frames"]
    command = [
        args.ffmpeg, "-y", "-v", "error",
        "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{width * 2}x{height}", "-r", f"{fps}", "-i", "-",
        "-threads", "6", "-an", "-c:v", "libx264", "-crf", "23", "-preset", "veryfast", "-pix_fmt", "yuv420p",
        args.preview,
    ]
    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    try:
        for index, t, frame in window_frames(args.input, source["from"], source["to"]):
            if index >= len(frames):
                break
            record = frames[index]
            left = cv2.resize(frame, (width, height), interpolation=cv2.INTER_CUBIC)
            right = np.full_like(left, 24)
            label = f"{t:6.2f} s"
            if record["k"] is not None:
                draw_skeleton(left, record["k"])
                draw_skeleton(right, record["k"], dim=bool(record.get("interpolated")))
                if record.get("interpolated"):
                    label += "  interpolated"
            else:
                label += "  no person"
            cv2.putText(right, label, (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (230, 230, 230), 1, cv2.LINE_AA)
            process.stdin.write(np.hstack([left, right]).tobytes())
    finally:
        process.stdin.close()
        code = process.wait()
    if code != 0:
        raise SystemExit(f"ffmpeg failed writing the preview ({code})")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--from", dest="start", type=float, default=0.0)
    parser.add_argument("--to", dest="end", type=float, default=None)
    parser.add_argument("--person", default="largest")
    parser.add_argument("--mode", choices=sorted(MODES), default="balanced")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--model-dir", default=str(Path.home() / ".cache" / "coreslopper-pose"))
    parser.add_argument("--preview", default=None)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    args = parser.parse_args(argv)
    if args.end is not None and args.end <= args.start:
        raise SystemExit("--to must be after --from")
    try:
        parse_person_rule(args.person)
    except ValueError as error:
        raise SystemExit(str(error)) from error

    track = build_track(detect(args))
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + ".tmp")
    temporary.write_text(json.dumps(track, separators=(",", ":")) + "\n", encoding="utf8")
    temporary.replace(output)
    if args.preview:
        Path(args.preview).parent.mkdir(parents=True, exist_ok=True)
        write_preview(args, track)
    return 0


if __name__ == "__main__":
    sys.exit(main())
