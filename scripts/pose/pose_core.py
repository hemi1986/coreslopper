"""Pure helpers of the pose extractor: person tracking, gap filling, smoothing, cut detection, quality.

Everything here works on numpy arrays and plain values, so it is tested without the detector and
pose models (`extract.py` owns video decoding, inference, and drawing).

Conventions: a track has T frames and K = 17 COCO keypoints. `points` is a float array (T, K, 2)
of x, y normalized to the source frame (0-1), `conf` a float array (T, K) in 0-1, and `valid` a
bool array (T,) that is False where no person was found. Boxes are (x1, y1, x2, y2) in pixels.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

COCO_KEYPOINTS = [
    "nose",
    "left_eye",
    "right_eye",
    "left_ear",
    "right_ear",
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
]

# Bones for drawing (pairs of keypoint indices).
COCO_SKELETON = [
    (15, 13), (13, 11), (16, 14), (14, 12), (11, 12),
    (5, 11), (6, 12), (5, 6), (5, 7), (6, 8), (7, 9), (8, 10),
    (1, 2), (0, 1), (0, 2), (1, 3), (2, 4), (3, 5), (4, 6),
]

LIMBS = {
    "head": [0, 1, 2, 3, 4],
    "torso": [5, 6, 11, 12],
    "leftArm": [5, 7, 9],
    "rightArm": [6, 8, 10],
    "leftLeg": [11, 13, 15],
    "rightLeg": [12, 14, 16],
}

# A keypoint below this confidence does not count for jitter and limb visibility.
VISIBLE = 0.3


# ---------------------------------------------------------------------------
# Person selection and tracking


def box_area(box) -> float:
    return max(0.0, box[2] - box[0]) * max(0.0, box[3] - box[1])


def box_center(box) -> tuple[float, float]:
    return ((box[0] + box[2]) / 2.0, (box[1] + box[3]) / 2.0)


def iou(a, b) -> float:
    x1, y1 = max(a[0], b[0]), max(a[1], b[1])
    x2, y2 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    union = box_area(a) + box_area(b) - inter
    return inter / union if union > 0 else 0.0


def parse_person_rule(value: str) -> str | int:
    """`largest`, `center`, or a 1-based index counted from the left."""
    text = str(value).strip().lower()
    if text in ("largest", "center"):
        return text
    if text.isdigit() and int(text) >= 1:
        return int(text)
    raise ValueError(f"--person takes largest, center, or a number from 1 (from the left), not {value!r}")


def select_person(boxes, rule: str | int, width: float, height: float) -> int | None:
    """Index of the box the rule picks among this frame's detections, or None."""
    if len(boxes) == 0:
        return None
    if rule == "largest":
        return int(np.argmax([box_area(b) for b in boxes]))
    if rule == "center":
        cx, cy = width / 2.0, height / 2.0
        return int(np.argmin([math.hypot(box_center(b)[0] - cx, box_center(b)[1] - cy) for b in boxes]))
    order = sorted(range(len(boxes)), key=lambda i: box_center(boxes[i])[0])
    index = int(rule) - 1
    return order[index] if index < len(order) else None


@dataclass
class PersonTracker:
    """Follow one person across frames by box overlap, then by centroid distance.

    The first frame with detections picks the person by `rule`. Later frames take the detection
    that overlaps the last box most; without overlap, the nearest centroid within `max_jump` box
    diagonals. After `lost_after` frames without a match, or after `reset()` (a hard cut), the rule
    picks again and the event is recorded in `reacquired`.
    """

    rule: str | int
    width: float
    height: float
    lost_after: int = 8
    min_iou: float = 0.2
    max_jump: float = 0.75
    last: tuple | None = None
    misses: int = 0
    reacquired: list[int] = field(default_factory=list)
    _frame: int = -1
    _acquired_once: bool = False

    def reset(self) -> None:
        self.last = None
        self.misses = 0

    def update(self, boxes) -> int | None:
        self._frame += 1
        boxes = [tuple(float(v) for v in b[:4]) for b in boxes]
        if self.last is None:
            chosen = select_person(boxes, self.rule, self.width, self.height)
            if chosen is not None:
                if self._acquired_once:
                    self.reacquired.append(self._frame)
                self._acquired_once = True
                self.last = boxes[chosen]
                self.misses = 0
            return chosen
        best, best_iou = None, 0.0
        for index, box in enumerate(boxes):
            overlap = iou(self.last, box)
            if overlap > best_iou:
                best, best_iou = index, overlap
        if best is None or best_iou < self.min_iou:
            best = None
            lx, ly = box_center(self.last)
            diagonal = math.hypot(self.last[2] - self.last[0], self.last[3] - self.last[1]) or 1.0
            nearest = None
            for index, box in enumerate(boxes):
                cx, cy = box_center(box)
                distance = math.hypot(cx - lx, cy - ly) / diagonal
                if distance <= self.max_jump and (nearest is None or distance < nearest):
                    best, nearest = index, distance
        if best is None:
            self.misses += 1
            if self.misses > self.lost_after:
                self.reset()
            return None
        self.last = boxes[best]
        self.misses = 0
        return best


# ---------------------------------------------------------------------------
# Gaps


def runs(mask) -> list[tuple[int, int]]:
    """Half-open index ranges [start, end) where mask is True."""
    result = []
    start = None
    for index, value in enumerate(mask):
        if value and start is None:
            start = index
        elif not value and start is not None:
            result.append((start, index))
            start = None
    if start is not None:
        result.append((start, len(mask)))
    return result


def fill_gaps(points, conf, valid, times, max_gap: float, breaks=()):
    """Interpolate short gaps linearly; leave long ones and gaps at the edges or across a cut missing.

    Returns new (points, conf, valid, interpolated). An interpolated keypoint takes the lower
    confidence of its two neighbours, halved, so a consumer can gate it out.
    """
    points = np.array(points, dtype=float, copy=True)
    conf = np.array(conf, dtype=float, copy=True)
    valid = np.array(valid, dtype=bool, copy=True)
    interpolated = np.zeros(len(valid), dtype=bool)
    breaks = set(breaks)
    for start, end in runs(~valid):
        if start == 0 or end >= len(valid):
            continue
        before, after = start - 1, end
        if times[after] - times[before] > max_gap + 1e-9:
            continue
        if any(before < b <= after for b in breaks):
            continue
        span = times[after] - times[before]
        for index in range(start, end):
            weight = (times[index] - times[before]) / span if span > 0 else 0.5
            points[index] = points[before] * (1 - weight) + points[after] * weight
            conf[index] = np.minimum(conf[before], conf[after]) * 0.5
            valid[index] = True
            interpolated[index] = True
    return points, conf, valid, interpolated


def gap_spans(valid, times, fps: float) -> list[tuple[float, float]]:
    """Missing stretches as (start, end) seconds."""
    step = 1.0 / fps if fps > 0 else 0.0
    return [(float(times[s]), float(times[e - 1] + step)) for s, e in runs(~np.asarray(valid, dtype=bool))]


# ---------------------------------------------------------------------------
# Smoothing


@dataclass
class OneEuroParams:
    """One-Euro filter (Casiez et al. 2012) on positions in frame heights.

    Lower `min_cutoff` = less jitter, more lag; higher `beta` = less lag on fast moves. With
    `zero_phase` the filter runs forwards and backwards and the two passes are averaged, which
    cancels the lag of a single pass (the clip is processed offline, so the future is known).
    Tuned on fast dance footage at 30 fps: a single pass at the textbook values (1.0, 0.007 in
    pixels) trails a fast arm by a tenth of the frame.
    """

    min_cutoff: float = 1.0
    beta: float = 5.0
    d_cutoff: float = 1.0
    zero_phase: bool = True

    def as_dict(self) -> dict:
        return {"minCutoff": self.min_cutoff, "beta": self.beta, "dCutoff": self.d_cutoff, "zeroPhase": self.zero_phase}


def _alpha(cutoff: float, dt: float) -> float:
    tau = 1.0 / (2.0 * math.pi * cutoff)
    return 1.0 / (1.0 + tau / dt)


class OneEuroFilter:
    """One-Euro filter over a vector signal; values in units per second for `beta`."""

    def __init__(self, params: OneEuroParams):
        self.params = params
        self.x_prev = None
        self.dx_prev = None
        self.t_prev = None

    def __call__(self, x, t: float):
        x = np.asarray(x, dtype=float)
        if self.x_prev is None or self.t_prev is None or t <= self.t_prev:
            self.x_prev, self.dx_prev, self.t_prev = x, np.zeros_like(x), t
            return x
        dt = t - self.t_prev
        dx = (x - self.x_prev) / dt
        a_d = _alpha(self.params.d_cutoff, dt)
        dx_hat = a_d * dx + (1 - a_d) * self.dx_prev
        cutoff = self.params.min_cutoff + self.params.beta * np.abs(dx_hat)
        tau = 1.0 / (2.0 * math.pi * cutoff)
        a = 1.0 / (1.0 + tau / dt)
        x_hat = a * x + (1 - a) * self.x_prev
        self.x_prev, self.dx_prev, self.t_prev = x_hat, dx_hat, t
        return x_hat


def smooth(points, valid, times, params: OneEuroParams, aspect: float = 1.0, breaks=()):
    """One-Euro smoothing per segment of consecutive valid frames; a cut starts a new segment.

    x is scaled by the aspect ratio first so the filter treats both axes in the same unit
    (frame heights per second). With `params.zero_phase`, the mean of a forward and a backward pass.
    """
    forward = _smooth_pass(points, valid, times, params, aspect, breaks)
    if not params.zero_phase:
        return forward
    n = len(valid)
    backward = _smooth_pass(
        np.asarray(points, dtype=float)[::-1],
        np.asarray(valid, dtype=bool)[::-1],
        -np.asarray(times, dtype=float)[::-1],
        params,
        aspect,
        [n - b for b in breaks],
    )[::-1]
    return (forward + backward) / 2.0


def _smooth_pass(points, valid, times, params: OneEuroParams, aspect: float, breaks) -> np.ndarray:
    points = np.array(points, dtype=float, copy=True)
    valid = np.asarray(valid, dtype=bool)
    scale = np.array([aspect, 1.0])
    breaks = set(breaks)
    filt = None
    for index in range(len(valid)):
        if not valid[index] or index in breaks:
            filt = None
        if not valid[index]:
            continue
        if filt is None:
            filt = OneEuroFilter(params)
        points[index] = filt(points[index] * scale, float(times[index])) / scale
    return points


# ---------------------------------------------------------------------------
# Cuts and quality


def detect_cuts(distances, threshold: float = 0.5, min_ratio: float = 3.0) -> list[int]:
    """Frame indices that start a new shot.

    `distances[i]` is the histogram distance between frame i-1 and frame i (distances[0] is 0).
    A cut is a distance above `threshold` that is also `min_ratio` times the median distance,
    so a clip that is noisy throughout does not cut on every frame.
    """
    d = np.asarray(distances, dtype=float)
    if len(d) < 2:
        return []
    median = float(np.median(d[1:])) if len(d) > 1 else 0.0
    return [i for i in range(1, len(d)) if d[i] > threshold and d[i] > min_ratio * max(median, 1e-3)]


def jitter(points, conf, valid, times, aspect: float = 1.0) -> float:
    """Mean frame-to-frame acceleration of visible keypoints, in percent of the frame height.

    Second differences over three consecutive valid frames; smooth motion scores near 0, a
    trembling skeleton high. Typical: under 0.5 smooth, above 1.5 visibly shaky.
    """
    p = np.asarray(points, dtype=float) * np.array([aspect, 1.0])
    c = np.asarray(conf, dtype=float)
    v = np.asarray(valid, dtype=bool)
    values = []
    for i in range(1, len(v) - 1):
        if not (v[i - 1] and v[i] and v[i + 1]):
            continue
        seen = (c[i - 1] >= VISIBLE) & (c[i] >= VISIBLE) & (c[i + 1] >= VISIBLE)
        if not seen.any():
            continue
        acc = p[i + 1] - 2 * p[i] + p[i - 1]
        values.append(float(np.mean(np.hypot(acc[seen, 0], acc[seen, 1]))))
    return round(100.0 * float(np.mean(values)), 3) if values else 0.0


def limb_confidence(conf, valid) -> dict[str, float]:
    c = np.asarray(conf, dtype=float)[np.asarray(valid, dtype=bool)]
    if len(c) == 0:
        return {name: 0.0 for name in LIMBS}
    return {name: round(float(np.mean(c[:, idx])), 2) for name, idx in LIMBS.items()}


@dataclass
class QualityInput:
    times: np.ndarray
    fps: float
    width: int
    height: int
    upscale: float
    detected: np.ndarray  # bool (T,): the model found the person in this frame
    valid: np.ndarray  # bool (T,): after gap filling
    interpolated: np.ndarray  # bool (T,)
    conf: np.ndarray  # (T, K) after gap filling
    raw_points: np.ndarray
    points: np.ndarray  # smoothed
    people: list[int]  # detections per frame
    cuts: list[int]
    reacquired: list[int]
    rule: str | int


def quality(q: QualityInput) -> dict:
    total = len(q.times)
    detected = int(np.sum(q.detected))
    interpolated = int(np.sum(q.interpolated))
    missing = int(total - np.sum(q.valid))
    aspect = q.width / q.height if q.height else 1.0
    conf_detected = np.asarray(q.conf)[np.asarray(q.detected, dtype=bool)]
    mean_conf = round(float(np.mean(conf_detected)), 3) if len(conf_detected) else 0.0
    limbs = limb_confidence(q.conf, q.detected)
    people = np.asarray(q.people, dtype=int) if len(q.people) else np.zeros(1, dtype=int)
    several = float(np.mean(people >= 2)) if total else 0.0
    gaps = gap_spans(q.valid, q.times, q.fps)
    warnings: list[str] = []
    if min(q.width, q.height) < 360:
        warnings.append(
            f"low resolution ({q.width}x{q.height}): upscaled x{q.upscale:g} before detection; expect noisier hands and feet"
        )
    rate = detected / total if total else 0.0
    if rate < 0.8:
        warnings.append(f"person found in only {rate:.0%} of frames")
    if gaps:
        longest = max(gaps, key=lambda g: g[1] - g[0])
        warnings.append(
            f"person lost in {len(gaps)} stretch(es), {missing} frame(s); longest {longest[1] - longest[0]:.2f} s at {longest[0]:.2f}-{longest[1]:.2f} s"
        )
    # A re-acquisition right after a cut is expected; the cut warning names it.
    reacquired = [i for i in q.reacquired if not any(0 <= i - c <= 3 for c in q.cuts)]
    if reacquired:
        at = ", ".join(f"{q.times[i]:.2f}" for i in reacquired[:5])
        warnings.append(f"person re-acquired by rule '{q.rule}' at {at} s: check it is still the same person")
    if several >= 0.1:
        warnings.append(
            f"several people in {several:.0%} of frames (up to {int(people.max())}); tracked by rule '{q.rule}', check the preview"
        )
    if q.cuts:
        at = ", ".join(f"{q.times[i]:.2f}" for i in q.cuts[:8])
        warnings.append(f"camera cut(s) at {at} s: the pose jumps there; use one shot per track or cut around them")
    for name, value in limbs.items():
        if detected and value < 0.35:
            warnings.append(f"{name} barely visible (mean confidence {value:.2f}): out of frame or occluded")
    return {
        "frames": total,
        "detected": detected,
        "interpolated": interpolated,
        "missing": missing,
        "detectionRate": round(rate, 3),
        "meanConfidence": mean_conf,
        "limbs": limbs,
        "jitterRaw": jitter(q.raw_points, q.conf, q.detected, q.times, aspect),
        "jitter": jitter(q.points, q.conf, q.valid, q.times, aspect),
        "peopleMax": int(people.max()) if total else 0,
        "severalPeople": round(several, 3),
        "cuts": [round(float(q.times[i]), 3) for i in q.cuts],
        "gaps": [[round(a, 3), round(b, 3)] for a, b in gaps],
        "warnings": warnings,
    }


def frame_records(times, points, conf, valid, interpolated) -> list[dict]:
    """The track's frames: t, and per keypoint [x, y, confidence] rounded, or k = null when missing."""
    frames = []
    for i in range(len(times)):
        record: dict = {"t": round(float(times[i]), 3)}
        if valid[i]:
            record["k"] = [
                [round(float(points[i, k, 0]), 4), round(float(points[i, k, 1]), 4), round(float(min(1.0, max(0.0, conf[i, k]))), 2)]
                for k in range(points.shape[1])
            ]
        else:
            record["k"] = None
        if interpolated[i]:
            record["interpolated"] = True
        frames.append(record)
    return frames

