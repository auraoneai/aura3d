#!/usr/bin/env python3
"""PRD-10 S16 / IC-0 — sentinel flag-off identity noise (macos-14 capture job).

Compares two independent `--flags none` captures (A, B) of the six C-30
sentinel scenes (benchmarks/quality-rebuild/sentinels.json) from the same
commit and fresh browser contexts. Per scene it reports the CIEDE2000 p99
between A and B — the IC-0 noise floor that S16's flag-off identity
tolerance is measured against (sentinels.json `identityCheck`).

Fails when a sentinel is missing or not `ready` in either arm, or when the
two arms differ in size. It never compares against an assumed tolerance:
the output JSON *is* the IC-0 measurement, cited by run id in
docs/project/aura3d-quality-rebuild/evidence/prd-10/IC-0.md.

usage: sentinel-identity.py <capture-A-dir> <capture-B-dir> <out.json>
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / "tools/quality-gate/metrics"))
from metrics.metrics import _delta_e2000, _rgb_to_lab  # noqa: E402  (pure-numpy CIEDE2000)


def load(path: Path) -> np.ndarray:
    with Image.open(path) as img:
        return np.asarray(img.convert("RGB"), dtype=np.float32) / 255.0


def scene_status(report: dict, scene: str) -> str:
    for entry in report.get("scenes", []):
        if entry.get("scene") == scene:
            result = (entry.get("engines") or {}).get("aura3d") or {}
            return str(result.get("status", "missing"))
    return "missing"


def main(argv: list[str]) -> int:
    if len(argv) != 4:
        print(__doc__, file=sys.stderr)
        return 2
    arm_a, arm_b, out = Path(argv[1]), Path(argv[2]), Path(argv[3])
    sentinels = json.loads((ROOT / "benchmarks/quality-rebuild/sentinels.json").read_text())
    rep_a = json.loads((arm_a / "report.json").read_text())
    rep_b = json.loads((arm_b / "report.json").read_text())
    rows, bad = [], []
    for s in sentinels["scenes"]:
        scene = s["id"]
        st_a, st_b = scene_status(rep_a, scene), scene_status(rep_b, scene)
        pa, pb = arm_a / scene / "aura3d.png", arm_b / scene / "aura3d.png"
        if st_a != "ready" or st_b != "ready" or not pa.exists() or not pb.exists():
            bad.append(f"{scene}: A={st_a} B={st_b}")
            rows.append({"scene": scene, "statusA": st_a, "statusB": st_b})
            continue
        a, b = load(pa), load(pb)
        if a.shape != b.shape:
            bad.append(f"{scene}: size {a.shape} vs {b.shape}")
            continue
        de = _delta_e2000(_rgb_to_lab(a), _rgb_to_lab(b))
        row = {
            "scene": scene,
            "statusA": st_a,
            "statusB": st_b,
            "size": [int(a.shape[1]), int(a.shape[0])],
            "deltaE2000P99": float(np.percentile(de, 99)),
            "deltaE2000Max": float(de.max()),
            "pixelsDiffering": int(np.count_nonzero(np.any(np.abs(a - b) > 0, axis=-1)))
        }
        rows.append(row)
        print(f"{scene}: dE2000 p99={row['deltaE2000P99']:.4f} max={row['deltaE2000Max']:.4f} differing={row['pixelsDiffering']}")
    measured = [r["deltaE2000P99"] for r in rows if "deltaE2000P99" in r]
    summary = {
        "schema": "aura3d-prd10-sentinel-identity/1",
        "metric": sentinels["identityCheck"]["metric"],
        "statistic": "p99",
        "flags": "none",
        "arms": [str(arm_a), str(arm_b)],
        "noiseP99": max(measured) if measured else None,
        "scenes": rows,
        "failures": bad
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(summary, indent=2) + "\n")
    print(f"IC-0 sentinel noise p99 (max over scenes) = {summary['noiseP99']}")
    if bad:
        print("sentinel failures: " + "; ".join(bad), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
