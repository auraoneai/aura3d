#!/usr/bin/env python3
"""Promotion score: does a flag-on capture beat flags-off? (owner rule 2026-10-11)

For every scene captured under both the `none` arm and the flag arm, both
aura3d frames are compared against the same three.js reference frame (taken
on the same runner, same scene) with the PRD-12 metric suite. Lower LPIPS /
FLIP is closer to the three.js target. A flag PASSES when:

  * every scene renders in the flag arm (status ready, frame present);
  * no scene regresses: lpips(flag) <= lpips(none) + EPS on every scene;
  * the mean LPIPS improves, or (if every frame is byte-identical to `none`)
    the verdict is NO-EFFECT, which is not a pass on its own.

Usage:
  python -m metrics.promote <bench-out-dir> <flag-arm> [--none none] [--json out.json]

<bench-out-dir> holds <arm>/report.json and <arm>/<scene>/{aura3d,three}.png
as written by benchmarks/quality-rebuild/ci.sh (one QR_BENCH_OUT per arm).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

from .metrics import flip, load_rgb, lpips_alex

EPS = 0.005  # LPIPS noise floor between two captures of the same frame


def _status(arm_dir: Path) -> dict[str, str]:
    report = json.loads((arm_dir / "report.json").read_text())
    return {s["scene"]: s["engines"].get("aura3d", {}).get("status", "missing") for s in report["scenes"]}


def _digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def score(out_dir: Path, flag_arm: str, none_arm: str = "none") -> dict[str, Any]:
    none_dir, flag_dir = out_dir / none_arm, out_dir / flag_arm
    none_status, flag_status = _status(none_dir), _status(flag_dir)
    rows: list[dict[str, Any]] = []
    for scene in sorted(none_status):
        row: dict[str, Any] = {"scene": scene, "none": none_status[scene], "flag": flag_status.get(scene, "missing")}
        ref = none_dir / scene / "three.png"
        a_none, a_flag = none_dir / scene / "aura3d.png", flag_dir / scene / "aura3d.png"
        if row["flag"] != "ready" or not a_flag.exists():
            row["verdict"] = "BROKEN"
        elif not ref.exists() or not a_none.exists():
            row["verdict"] = "NO-REFERENCE"
        else:
            row["identical"] = _digest(a_none) == _digest(a_flag)
            r, n, f = load_rgb(str(ref)), load_rgb(str(a_none)), load_rgb(str(a_flag))
            try:
                row["lpips_none"], row["lpips_flag"] = float(lpips_alex(r, n)), float(lpips_alex(r, f))
            except ImportError as error:
                # Never fabricate a score: without the pinned lpips/torch the
                # flag cannot be judged, so the verdict is UNAVAILABLE (fails).
                row["verdict"], row["reason"] = "UNAVAILABLE", str(error)
                rows.append(row)
                continue
            try:
                row["flip_none"], row["flip_flag"] = float(flip(r, n, None)), float(flip(r, f, None))
            except ImportError:
                row["flip_none"] = row["flip_flag"] = None
            row["verdict"] = "REGRESSED" if row["lpips_flag"] > row["lpips_none"] + EPS else "OK"
        rows.append(row)

    scored = [r for r in rows if "lpips_flag" in r]
    broken = [r["scene"] for r in rows if r["verdict"] == "BROKEN"]
    unavailable = [r["scene"] for r in rows if r["verdict"] in ("UNAVAILABLE", "NO-REFERENCE")]
    regressed = [r["scene"] for r in rows if r["verdict"] == "REGRESSED"]
    def mean(key: str) -> float | None:
        values = [r[key] for r in scored if r.get(key) is not None]
        return sum(values) / len(values) if values else None

    summary: dict[str, Any] = {
        "flag": flag_arm,
        "scenes": len(rows),
        "scored": len(scored),
        "broken": broken,
        "regressed": regressed,
        "unscorable": unavailable,
        "meanLpipsNone": mean("lpips_none"),
        "meanLpipsFlag": mean("lpips_flag"),
        "meanFlipNone": mean("flip_none"),
        "meanFlipFlag": mean("flip_flag"),
    }
    if broken or regressed or unavailable or not scored:
        summary["verdict"] = "FAIL"
    elif all(r.get("identical") for r in scored):
        summary["verdict"] = "NO-EFFECT"
    elif summary["meanLpipsFlag"] < summary["meanLpipsNone"]:
        summary["verdict"] = "PASS"
    else:
        summary["verdict"] = "FAIL"
    return {"summary": summary, "rows": rows}


def markdown(result: dict[str, Any]) -> str:
    s = result["summary"]
    out = [f"**{s['flag']}: {s['verdict']}** (mean LPIPS vs three.js: none {s['meanLpipsNone']} -> flag {s['meanLpipsFlag']})", "",
           "| scene | flag status | LPIPS none | LPIPS flag | FLIP none | FLIP flag | verdict |", "|---|---|---|---|---|---|---|"]
    fmt = lambda v: "-" if v is None else f"{v:.4f}"  # noqa: E731
    for r in result["rows"]:
        out.append(f"| {r['scene']} | {r['flag']} | {fmt(r.get('lpips_none'))} | {fmt(r.get('lpips_flag'))} | "
                   f"{fmt(r.get('flip_none'))} | {fmt(r.get('flip_flag'))} | {r['verdict']}{' (identical)' if r.get('identical') else ''} |")
    return "\n".join(out)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("out_dir", type=Path)
    parser.add_argument("flag_arm")
    parser.add_argument("--none", default="none")
    parser.add_argument("--json", type=Path)
    args = parser.parse_args(argv)
    result = score(args.out_dir, args.flag_arm, args.none)
    if args.json:
        args.json.write_text(json.dumps(result, indent=2))
    print(markdown(result))
    return 0 if result["summary"]["verdict"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
