#!/usr/bin/env python3
"""Mean absolute per-channel difference (0-255) between game frames: base-vs-base noise floor and base-vs-branch.
usage: diff.py <dir> <game> [game...]  (expects <game>-base1-N.png, <game>-base2-N.png, <game>-branch-N.png, N in 1,2)"""
import json
import sys

from PIL import Image, ImageChops, ImageStat


def mad(a, b):
    ia, ib = Image.open(a).convert("RGB"), Image.open(b).convert("RGB")
    if ia.size != ib.size:
        return None
    d = ImageChops.difference(ia, ib)
    return round(sum(ImageStat.Stat(d).mean) / 3, 4)


def stats(p):
    im = Image.open(p).convert("RGB")
    m = ImageStat.Stat(im)
    return {"mean": [round(x, 1) for x in m.mean], "stddev": round(sum(m.stddev) / 3, 1), "size": im.size}


root = sys.argv[1]
out = {}
for g in sys.argv[2:]:
    rows = []
    for n in (1, 2):
        f = lambda tag: f"{root}/{g}-{tag}-{n}.png"
        rows.append({
            "frame": n,
            "base_vs_base": mad(f("base1"), f("base2")),
            "base_vs_branch": mad(f("base1"), f("branch")),
            "base2_vs_branch": mad(f("base2"), f("branch")),
            "branch_stats": stats(f("branch")),
        })
    out[g] = rows
print(json.dumps(out, indent=2))
