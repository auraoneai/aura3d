"""Default-path proof: the flag-off frame of the branch vs the same frame from origin/main code (both GLSL, real GPU).
usage: python3 -I default-path-compare.py <evidence/a4-portable dir>"""
import json
import sys
import numpy as np
from PIL import Image

root = sys.argv[1]


def load(p):
    return np.asarray(Image.open(f"{root}/{p}").convert("RGB")).astype(int)


def diff(a, b):
    x = np.abs(a - b)
    return {
        "meanAbsDiff255": round(float(x.mean()), 4),
        "maxDiff255": int(x.max()),
        "changedPct": round(float((x.max(axis=2) > 0).mean() * 100), 3),
        "over16Pct": round(float((x.max(axis=2) > 16).mean() * 100), 3),
    }


out = {}
for name, head, base in [
    ("silt-inked", "silt/silt-inked-glsl.png", "baseline/silt-inked-glsl.png"),
    ("silt-original", "silt/silt-original-glsl.png", "baseline/silt-original-glsl.png"),
    ("last-train", "last-train/last-train-glsl.png", "baseline/last-train-glsl.png"),
]:
    out[f"{name}: branch flag-off vs origin/main"] = diff(load(head), load(base))
out["last-train: origin/main floor (glsl vs glsl2)"] = diff(load("baseline/last-train-glsl.png"), load("baseline/last-train-glsl2.png"))
out["last-train: branch floor (glsl vs glsl2)"] = diff(load("last-train/last-train-glsl.png"), load("last-train/last-train-glsl2.png"))
out["silt-inked: branch floor (glsl vs glsl2)"] = diff(load("silt/silt-inked-glsl.png"), load("silt/silt-inked-glsl2.png"))
for k, v in out.items():
    print(k, v)
json.dump(out, open(f"{root}/default-path-vs-origin-main.json", "w"), indent=2)
