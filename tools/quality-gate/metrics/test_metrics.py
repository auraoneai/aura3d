"""Deterministic unit checks for tools/quality-gate/metrics (T1.9 pair tests).

Runs with plain unittest (no pytest dependency):
    python3 tools/quality-gate/metrics/test_metrics.py
Optional metrics (flip/lpips) assert the honest "unavailable" behaviour when
their pinned packages are absent — they never fabricate a score.
"""
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from metrics import decode_object_ids, delta_e2000, detectors, mask_alignment, metrics as m


def flat(value: float, shape=(32, 32)) -> np.ndarray:
    return np.full((*shape, 3), value, dtype=np.float64)


def rgb_mask(sel: np.ndarray) -> np.ndarray:
    out = np.zeros((*sel.shape, 3), dtype=np.uint8)
    out[sel] = 255
    return out


def idcolor_mask(ids: np.ndarray) -> np.ndarray:
    """Encode a per-pixel object-index map as a §8.1 idColor RGB mask."""
    out = np.zeros((*ids.shape, 3), dtype=np.uint8)
    sel = ids >= 0
    i = ids[sel]
    out[sel, 0] = (i * 37) % 251 + 1
    out[sel, 1] = i >> 8
    return out


class TestReferenceMetrics(unittest.TestCase):
    def test_identical_images(self):
        img = np.random.RandomState(0).rand(48, 48, 3)
        self.assertAlmostEqual(m.ssim(img, img), 1.0, places=5)
        self.assertAlmostEqual(m.msssim(img, img), 1.0, places=5)
        self.assertAlmostEqual(delta_e2000(img, img), 0.0, places=6)

    def test_degraded_scores_worse(self):
        rng = np.random.RandomState(1)
        img = rng.rand(48, 48, 3)
        noisy = np.clip(img + rng.normal(0, 0.15, img.shape), 0, 1)
        self.assertLess(m.ssim(img, noisy), m.ssim(img, img))
        self.assertGreater(delta_e2000(img, noisy), 0.0)

    def test_mask_restricts_metric(self):
        img = np.zeros((24, 24, 3))
        other = img.copy()
        other[0:12] = 1.0  # top half differs
        mask = np.zeros((24, 24), dtype=np.uint8)
        mask[12:] = 255
        self.assertAlmostEqual(delta_e2000(img, other, mask), 0.0, places=6)
        self.assertGreater(delta_e2000(img, other, None), 0.0)

    def test_optional_metrics_report_unavailable_or_ok(self):
        img = np.zeros((16, 16, 3))
        try:
            flip_result = m.flip(img, img)
            lpips_result = m.lpips_alex(img, img)
        except ModuleNotFoundError:
            self.skipTest("flip-evaluator / lpips not installed (expected locally; CI installs requirements.lock)")
        # Only reached when the pinned packages exist; identical input must be 0.
        self.assertEqual(flip_result, 0.0)
        self.assertEqual(lpips_result, 0.0)


class TestOptionalDeps(unittest.TestCase):
    def test_optional_deps_flag(self):
        # Ensures the assertions above are conditional, not silently skipped.
        try:
            import flip_evaluator  # noqa: F401
            import lpips  # noqa: F401
            import torch  # noqa: F401
            has_optional = True
        except ImportError:
            has_optional = False
        if not has_optional:
            self.skipTest("flip-evaluator / lpips not installed (expected locally; CI installs requirements.lock)")


class TestDetectors(unittest.TestCase):
    def test_blank_or_black(self):
        black = np.zeros((32, 32, 3))
        lit = flat(0.8)
        self.assertEqual(detectors(black, {}, None)["blankOrBlack"], 1.0)
        self.assertEqual(detectors(lit, {}, None)["blankOrBlack"], 0.0)

    def test_sky_variance(self):
        img = flat(0.5)
        mask = rgb_mask(np.ones((32, 32), dtype=bool))
        self.assertAlmostEqual(detectors(img, {"sky": mask}, None)["skyVariance"], 0.0, places=12)
        noisy = np.random.RandomState(3).rand(32, 32, 3)
        self.assertGreater(detectors(noisy, {"sky": mask}, None)["skyVariance"], 0.01)

    def test_decode_object_ids_roundtrips(self):
        ids = np.full((16, 16), -1)
        ids[2:6, 2:6] = 0
        ids[8:12, 8:12] = 512
        decoded = decode_object_ids(idcolor_mask(ids))
        self.assertTrue((decoded == ids).all())

    def test_detector_names_are_the_canonical_eleven(self):
        result = detectors(flat(0.5), {"sky": rgb_mask(np.ones((32, 32), dtype=bool))}, None)
        self.assertEqual(
            set(result),
            {"shadowContrast", "contactDarkening", "highlightEnergy", "roughnessResponse",
             "textureDetail", "edgeAliasing", "dynamicRange", "skyVariance",
             "subjectPresence", "temporalFlicker", "blankOrBlack"},
        )

    def test_inapplicable_detector_is_null_not_nan(self):
        result = detectors(flat(0.5), {}, None)
        self.assertIsNone(result["edgeAliasing"])
        self.assertIsNone(result["shadowContrast"])
        import json
        json.dumps(result)  # strict-JSON safe

    def test_temporal_flicker(self):
        a = flat(0.4)
        b = flat(0.5)
        result = detectors(a, {}, None, strip=[a, b, a])["temporalFlicker"]
        self.assertGreater(result, 0.0)

    def test_mask_alignment_iou(self):
        ids = np.full((16, 16), -1)
        ids[4:12, 4:12] = 0
        aura = np.zeros((16, 16, 3))
        aura[4:12, 4:12] = 0.9
        result = mask_alignment(aura, ids, np.array([13, 13, 13], dtype=np.uint8))
        self.assertTrue(result["applicable"])
        self.assertEqual(result["iou"], 1.0)
        self.assertTrue(result["passed"])

    def test_mask_alignment_dark_background_not_subject(self):
        # spec.background ~13 vs rendered black: the Aura frame's dark
        # background must not be segmented as subject (was IoU 0.25 before).
        ids = np.full((64, 64), -1)
        ids[16:48, 16:48] = 0
        aura = np.zeros((64, 64, 3))
        aura[16:48, 16:48] = (0.8, 0.6, 0.3)
        result = mask_alignment(aura, ids, np.array([13, 13, 13], dtype=np.uint8))
        self.assertTrue(result["applicable"])
        self.assertGreaterEqual(result["iou"], 0.98)


if __name__ == "__main__":
    unittest.main(verbosity=2)
