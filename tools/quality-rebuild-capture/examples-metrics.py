#!/usr/bin/env python3
"""Offline pixel metrics for capture-examples.mjs artifacts.

  python3 examples-metrics.py <run-dir> [--base <baseline-run-dir>] [--json out.json]

<run-dir> holds report.json + shots/<id>/{opening,mid,action}.png (the
`tools/quality-rebuild-capture/out/examples` tree of a suite=examples run).
Per example: mean luma (Rec.709 on 8-bit sRGB), clipped % (luma >= 250),
crushed % (luma <= 3), red-panel % (r>180, g<80, b<80), and with --base the
mean abs RGB difference over lit pixels (either frame's luma > 20) per shot,
plus fps ratio vs the baseline. Acceptance (owner rule): no page errors / panels,
luma 45-140, clipped < 2 %, diff >= 10 in >= 2 of 3 shots, fps >= 85 % of base.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SHOTS = ("opening", "mid", "action")


def load(path):
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)


def luma(img):
    return img[..., 0] * 0.2126 + img[..., 1] * 0.7152 + img[..., 2] * 0.0722


def shot_stats(img):
    y = luma(img)
    red = (img[..., 0] > 180) & (img[..., 1] < 80) & (img[..., 2] < 80)
    return {
        "luma": round(float(y.mean()), 1),
        "clipped": round(float((y >= 250).mean() * 100), 2),
        "crushed": round(float((y <= 3).mean() * 100), 2),
        "red": round(float(red.mean() * 100), 2),
    }


def lit_diff(a, b):
    if a.shape != b.shape:
        return None
    mask = (luma(a) > 20) | (luma(b) > 20)
    if mask.sum() == 0:
        return 0.0
    return round(float(np.abs(a - b).mean(axis=-1)[mask].mean()), 1)


def analyse(run, base=None):
    report = json.loads((run / "report.json").read_text())
    base_report = json.loads((base / "report.json").read_text()) if base else {"examples": []}
    base_by_id = {e["id"]: e for e in base_report["examples"]}
    rows = []
    for ex in report["examples"]:
        row = {"id": ex["id"], "kind": ex.get("kind"), "error": ex.get("error"),
               "pageErrors": len(ex.get("pageErrors", [])), "consoleErrors": len(ex.get("consoleErrors", [])),
               "panels": ex.get("domErrorPanels", []), "fps": round((ex.get("perf") or {}).get("fps") or 0, 1),
               "drawsPerFrame": round((ex.get("perf") or {}).get("drawsPerFrame") or 0, 1),
               "engineDrawCalls": (ex.get("probe") or {}).get("engineDrawCalls"), "shots": {}}
        bex = base_by_id.get(ex["id"])
        if bex:
            row["baseFps"] = round((bex.get("perf") or {}).get("fps") or 0, 1)
        for shot in SHOTS:
            png = run / "shots" / ex["id"] / f"{shot}.png"
            if not png.exists():
                continue
            img = load(png)
            stats = shot_stats(img)
            bpng = base / "shots" / ex["id"] / f"{shot}.png" if base else None
            if bpng is not None and bpng.exists():
                stats["diff"] = lit_diff(img, load(bpng))
            row["shots"][shot] = stats
        rows.append(row)
    return rows


def verdict(row, with_base):
    s = row["shots"]
    if row["error"] or len(s) < 3:
        return ["no-shots"]
    fails = []
    if row["pageErrors"]:
        fails.append("page-errors")
    if row["panels"] or any(v["red"] > 1.5 for v in s.values()):
        fails.append("error-panel")
    mean_luma = sum(v["luma"] for v in s.values()) / len(s)
    if not 45 <= mean_luma <= 140:
        fails.append(f"luma {mean_luma:.0f}")
    if max(v["clipped"] for v in s.values()) >= 2:
        fails.append("clipped")
    if with_base:
        if sum(1 for v in s.values() if (v.get("diff") or 0) >= 10) < 2:
            fails.append("diff<10")
        if row.get("baseFps") and row["fps"] < 0.85 * row["baseFps"]:
            fails.append("fps")
    return fails


def main(argv):
    run = Path(argv[1])
    base = Path(argv[argv.index("--base") + 1]) if "--base" in argv else None
    rows = analyse(run, base)
    for row in rows:
        row["fails"] = verdict(row, base is not None)
        s = row["shots"]
        shots = " ".join(f"{k[0]}:{v['luma']:.0f}/{v['clipped']:.1f}%" + (f"/d{v['diff']}" if "diff" in v else "") for k, v in s.items())
        fps = f"{row['fps']}" + (f"/{row['baseFps']}" if "baseFps" in row else "")
        print(f"{row['id']:34s} fps={fps:11s} dpf={row['drawsPerFrame']:6.1f} pe={row['pageErrors']} ce={row['consoleErrors']} {shots}  {'PASS' if not row['fails'] else 'FAIL ' + ','.join(row['fails'])}")
    if "--json" in argv:
        Path(argv[argv.index("--json") + 1]).write_text(json.dumps(rows, indent=2))


if __name__ == "__main__":
    main(sys.argv)
