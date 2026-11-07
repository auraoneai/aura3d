#!/usr/bin/env python3
"""Summarise evidence/color-514/games: per game, mean abs diff for base1-vs-base2 (noise floor), base-vs-branch, and frame sanity.
usage: summarize.py <games-dir> game1 game2 ..."""
import json, os, sys
import numpy as np
from PIL import Image

root = sys.argv[1]
def load(p):
    return np.asarray(Image.open(p).convert("RGB"), dtype=np.float32)
def mad(a, b):
    return round(float(np.abs(a - b).mean()), 3)
def pct(a, b):
    return round(float((np.abs(a - b).max(axis=2) > 8).mean() * 100), 2)
out = []
for g in sys.argv[2:]:
    f = {k: os.path.join(root, f"{g}-{k}.png") for k in ("base1", "base2", "base3", "branch", "branch2")}
    im = {k: load(p) for k, p in f.items() if os.path.exists(p)}
    if "base1" not in im or "branch" not in im:
        continue
    luma = 0.2126 * im["base1"][..., 0] + 0.7152 * im["base1"][..., 1] + 0.0722 * im["base1"][..., 2]
    row = {"game": g, "meanLuma": round(float(luma.mean()), 1), "blackFrac": round(float((luma < 4).mean()), 3), "distinct": int(len(np.unique(im["base1"].reshape(-1, 3), axis=0)))}
    for a, b, name in (("base1", "base2", "baseVsBase"), ("base1", "base3", "baseVsBase3"), ("base1", "branch", "baseVsBranch"), ("base2", "branch", "base2VsBranch"), ("branch", "branch2", "branchVsBranch2"), ("base1", "branch2", "baseVsBranch2")):
        if a in im and b in im:
            row[name] = {"mad": mad(im[a], im[b]), "pctPx>8": pct(im[a], im[b])}
    out.append(row)
    print(json.dumps(row))
json.dump(out, open(os.path.join(root, "summary.json"), "w"), indent=1)
