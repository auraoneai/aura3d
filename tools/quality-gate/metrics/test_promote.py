"""Unit checks for metrics.promote (owner promotion rule). Plain unittest:
    python3 tools/quality-gate/metrics/test_promote.py
lpips_alex is patched with a deterministic stand-in so the verdict logic is
tested without torch; the real metric runs on the GPU runner.
"""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from metrics import promote  # noqa: E402


def fake_lpips(ref, test):
    return float(np.abs(ref - test).mean())


def write(out: Path, arm: str, scenes: dict):
    (out / arm).mkdir(parents=True, exist_ok=True)
    report = {"scenes": []}
    for scene, (status, aura, three) in scenes.items():
        d = out / arm / scene
        d.mkdir(exist_ok=True)
        if aura is not None:
            Image.fromarray(np.full((8, 8, 3), aura, np.uint8)).save(d / "aura3d.png")
        if three is not None:
            Image.fromarray(np.full((8, 8, 3), three, np.uint8)).save(d / "three.png")
        report["scenes"].append({"scene": scene, "engines": {"aura3d": {"status": status}}})
    (out / arm / "report.json").write_text(json.dumps(report))


class PromoteTests(unittest.TestCase):
    def run_case(self, none, flag):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(promote, "lpips_alex", fake_lpips), \
                mock.patch.object(promote, "flip", lambda r, t, m: 0.0):
            out = Path(tmp)
            write(out, "none", none)
            write(out, "x", flag)
            return promote.score(out, "x")["summary"]

    def test_pass_when_closer_to_reference_everywhere(self):
        s = self.run_case({"a": ("ready", 50, 100), "b": ("ready", 60, 100)},
                          {"a": ("ready", 90, None), "b": ("ready", 95, None)})
        self.assertEqual(s["verdict"], "PASS")

    def test_fail_on_any_regressed_scene(self):
        s = self.run_case({"a": ("ready", 50, 100), "b": ("ready", 100, 100)},
                          {"a": ("ready", 100, None), "b": ("ready", 10, None)})
        self.assertEqual(s["verdict"], "FAIL")
        self.assertEqual(s["regressed"], ["b"])

    def test_fail_on_broken_scene(self):
        s = self.run_case({"a": ("ready", 50, 100)}, {"a": ("renderer-error", None, None)})
        self.assertEqual(s["verdict"], "FAIL")
        self.assertEqual(s["broken"], ["a"])

    def test_identical_frames_are_no_effect_not_pass(self):
        s = self.run_case({"a": ("ready", 50, 100)}, {"a": ("ready", 50, None)})
        self.assertEqual(s["verdict"], "NO-EFFECT")

    def test_missing_metric_package_is_unscorable_never_pass(self):
        def missing(*_):
            raise ImportError("No module named 'lpips'")
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(promote, "lpips_alex", missing):
            out = Path(tmp)
            write(out, "none", {"a": ("ready", 50, 100)})
            write(out, "x", {"a": ("ready", 90, None)})
            s = promote.score(out, "x")["summary"]
        self.assertEqual(s["verdict"], "FAIL")
        self.assertEqual(s["unscorable"], ["a"])


if __name__ == "__main__":
    unittest.main()
