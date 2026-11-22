import json
from pathlib import Path

import numpy as np
import pytest

from pose_core import (
    COCO_KEYPOINTS,
    OneEuroFilter,
    OneEuroParams,
    PersonTracker,
    QualityInput,
    detect_cuts,
    fill_gaps,
    frame_records,
    gap_spans,
    iou,
    jitter,
    parse_person_rule,
    quality,
    select_person,
    smooth,
)

ROOT = Path(__file__).resolve().parents[3]


def box(cx, cy, w=100, h=200):
    return (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)


# --- person selection and tracking ------------------------------------------


def test_parse_person_rule():
    assert parse_person_rule("largest") == "largest"
    assert parse_person_rule("Center") == "center"
    assert parse_person_rule("2") == 2
    with pytest.raises(ValueError):
        parse_person_rule("0")
    with pytest.raises(ValueError):
        parse_person_rule("tallest")


def test_select_person_by_rule():
    boxes = [box(100, 300, 50, 100), box(960, 540, 80, 160), box(1700, 500, 200, 400)]
    assert select_person(boxes, "largest", 1920, 1080) == 2
    assert select_person(boxes, "center", 1920, 1080) == 1
    assert select_person(boxes, 1, 1920, 1080) == 0
    assert select_person(boxes, 3, 1920, 1080) == 2
    assert select_person(boxes, 4, 1920, 1080) is None
    assert select_person([], "largest", 1920, 1080) is None


def test_iou():
    assert iou(box(0, 0), box(0, 0)) == pytest.approx(1.0)
    assert iou(box(0, 0), box(1000, 0)) == 0.0


def test_tracker_follows_the_chosen_person_when_a_bigger_one_walks_in():
    tracker = PersonTracker(rule="largest", width=1920, height=1080)
    assert tracker.update([box(500, 500, 100, 200)]) == 0
    # A bigger person enters on the right; the tracked one moves a little.
    assert tracker.update([box(1500, 500, 300, 600), box(520, 500, 100, 200)]) == 1
    assert tracker.update([box(540, 505, 100, 200), box(1500, 500, 300, 600)]) == 0
    assert tracker.reacquired == []


def test_tracker_matches_a_fast_move_by_centroid():
    tracker = PersonTracker(rule="largest", width=1920, height=1080)
    tracker.update([box(500, 500)])
    # No overlap (moved 120 px with a 100 px wide box), but within 0.75 diagonals.
    assert tracker.update([box(620, 500)]) == 0
    assert tracker.update([box(1600, 500)]) is None


def test_tracker_reacquires_after_losing_the_person_and_after_a_reset():
    tracker = PersonTracker(rule="largest", width=1920, height=1080, lost_after=2)
    tracker.update([box(500, 500)])
    for _ in range(3):
        assert tracker.update([]) is None
    assert tracker.last is None
    assert tracker.update([box(1500, 500)]) == 0
    assert tracker.reacquired == [4]
    tracker.reset()
    assert tracker.update([box(200, 500, 50, 100), box(900, 500, 150, 300)]) == 1
    assert tracker.reacquired == [4, 5]


# --- gaps -------------------------------------------------------------------


def line_track(n=10, fps=10.0):
    times = np.arange(n) / fps
    points = np.zeros((n, 17, 2))
    points[:, :, 0] = np.linspace(0.1, 0.9, n)[:, None]
    points[:, :, 1] = 0.5
    conf = np.full((n, 17), 0.8)
    return times, points, conf


def test_fill_gaps_interpolates_short_gaps_linearly():
    times, points, conf = line_track()
    valid = np.ones(10, dtype=bool)
    valid[4:6] = False
    broken = points.copy()
    broken[4:6] = 0
    filled, conf_f, valid_f, interp = fill_gaps(broken, conf, valid, times, max_gap=0.35)
    assert valid_f.all()
    assert interp.tolist() == [False] * 4 + [True, True] + [False] * 4
    np.testing.assert_allclose(filled[4:6], points[4:6])
    assert conf_f[4, 0] == pytest.approx(0.4)


def test_fill_gaps_leaves_long_gaps_edges_and_cuts_missing():
    times, points, conf = line_track(20)
    valid = np.ones(20, dtype=bool)
    valid[0] = False  # edge
    valid[5:10] = False  # 0.6 s between neighbours: too long
    valid[14] = False  # short, but a cut at 15
    _, _, valid_f, interp = fill_gaps(points, conf, valid, times, max_gap=0.3, breaks=[15])
    assert not valid_f[0]
    assert not valid_f[5:10].any()
    assert not valid_f[14]
    assert not interp.any()
    assert gap_spans(valid_f, times, 10.0) == [(0.0, 0.1), (0.5, 1.0), (1.4, 1.5)]


# --- smoothing --------------------------------------------------------------


def test_one_euro_reduces_jitter_but_keeps_the_mean():
    rng = np.random.default_rng(7)
    times = np.arange(300) / 30.0
    truth = np.full((300, 17, 2), 0.5)
    noisy = truth + rng.normal(0, 0.01, truth.shape)
    valid = np.ones(300, dtype=bool)
    smoothed = smooth(noisy, valid, times, OneEuroParams())
    conf = np.full((300, 17), 0.9)
    assert jitter(smoothed, conf, valid, times) < jitter(noisy, conf, valid, times) * 0.5
    assert abs(float(np.mean(smoothed[30:])) - 0.5) < 0.005


def test_one_euro_follows_a_fast_move():
    params = OneEuroParams()
    filt = OneEuroFilter(params)
    out = None
    for i in range(30):
        out = filt(np.array([0.0 if i < 10 else 1.0]), i / 30.0)
    # 20 frames (0.67 s) after a jump the filter has caught up.
    assert out[0] > 0.95


def test_zero_phase_smoothing_does_not_trail_a_move():
    times = np.arange(60) / 30.0
    points = np.zeros((60, 17, 2))
    points[:, :, 0] = np.sin(times * 2 * np.pi)[:, None] * 0.2 + 0.5  # an arm swinging once a second
    valid = np.ones(60, dtype=bool)
    one_pass = smooth(points, valid, times, OneEuroParams(zero_phase=False))
    both = smooth(points, valid, times, OneEuroParams())
    middle = slice(10, 50)
    lag_one = np.abs(one_pass[middle] - points[middle]).mean()
    lag_both = np.abs(both[middle] - points[middle]).mean()
    assert lag_both < lag_one * 0.5
    assert lag_both < 0.01


def test_smooth_restarts_after_a_gap_and_at_a_cut():
    times = np.arange(6) / 30.0
    points = np.zeros((6, 17, 2))
    points[3:] = 1.0
    valid = np.ones(6, dtype=bool)
    smoothed = smooth(points, valid, times, OneEuroParams(), breaks=[3])
    # The new segment starts at its own first value instead of easing over from 0.
    assert smoothed[3, 0, 0] == pytest.approx(1.0)
    valid[2] = False
    smoothed = smooth(points, valid, times, OneEuroParams())
    assert smoothed[3, 0, 0] == pytest.approx(1.0)


# --- cuts and quality -------------------------------------------------------


def test_detect_cuts_needs_a_spike_over_the_median():
    calm = [0.0] + [0.05] * 20
    calm[12] = 0.8
    assert detect_cuts(calm) == [12]
    noisy = [0.0] + [0.55] * 20
    assert detect_cuts(noisy) == []


def test_quality_report_and_warnings():
    times, points, conf = line_track(20)
    detected = np.ones(20, dtype=bool)
    detected[8:12] = False
    filled, conf_f, valid, interp = fill_gaps(points, conf, detected, times, max_gap=0.3)
    conf_f[:, 13:] = 0.1  # legs out of frame
    stats = quality(
        QualityInput(
            times=times, fps=10.0, width=256, height=144, upscale=5.0, detected=detected, valid=valid,
            interpolated=interp, conf=conf_f, raw_points=filled, points=filled, people=[1] * 10 + [2] * 10,
            cuts=[15], reacquired=[6, 16], rule="largest",
        )
    )
    assert stats["frames"] == 20
    assert stats["detected"] == 16
    assert stats["missing"] == 4
    assert stats["detectionRate"] == 0.8
    assert stats["peopleMax"] == 2
    assert stats["cuts"] == [1.5]
    assert stats["gaps"] == [[0.8, 1.2]]
    text = " | ".join(stats["warnings"])
    assert "re-acquired by rule 'largest' at 0.60 s" in text  # 1.60, right after the cut, is not repeated
    for needle in ("low resolution", "person lost", "re-acquired", "several people", "camera cut", "leftLeg barely visible"):
        assert needle in text


def test_frame_records_round_and_mark_missing_frames():
    times, points, conf = line_track(3)
    valid = np.array([True, False, True])
    interp = np.array([False, False, True])
    records = frame_records(times, points + 1e-7, conf, valid, interp)
    assert records[1] == {"t": 0.1, "k": None}
    assert records[2]["interpolated"] is True
    assert len(records[0]["k"]) == 17
    assert records[0]["k"][0] == [0.1, 0.5, 0.8]


def test_a_built_track_matches_the_json_schema():
    jsonschema = pytest.importorskip("jsonschema")
    schema_path = ROOT / "schema" / "pose-track.schema.json"
    if not schema_path.exists():
        pytest.skip("run npm run schema first")
    times, points, conf = line_track(5)
    valid = np.array([True, True, False, True, True])
    interp = np.zeros(5, dtype=bool)
    stats = quality(
        QualityInput(
            times=times, fps=10.0, width=1920, height=1080, upscale=1.0, detected=valid, valid=valid,
            interpolated=interp, conf=conf, raw_points=points, points=points, people=[1] * 5, cuts=[],
            reacquired=[], rule="largest",
        )
    )
    track = {
        "version": 1,
        "source": {"file": "clip.mp4", "from": 0, "to": 0.5, "fps": 10, "width": 1920, "height": 1080, "aspect": 1.7778},
        "engine": {"name": "rtmlib", "mode": "balanced", "detector": "yolox", "pose": "rtmpose", "device": "cpu", "upscale": 1},
        "person": "largest",
        "smoothing": {"filter": "one-euro", **OneEuroParams().as_dict(), "maxGap": 0.3},
        "keypoints": COCO_KEYPOINTS,
        "frames": frame_records(times, points, conf, valid, interp),
        "quality": {**stats, "seconds": 1.0},
    }
    jsonschema.validate(json.loads(json.dumps(track)), json.loads(schema_path.read_text()))
