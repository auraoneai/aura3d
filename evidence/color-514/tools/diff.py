#!/usr/bin/env python3
"""Mean abs diff (0..255, per RGB channel averaged) and frame sanity for evidence PNG pairs.
usage: diff.py a.png b.png [more pairs...]   -> JSON lines. Also prints mean luma, black fraction and distinct colours of `a`."""
import json, sys
import numpy as np
from PIL import Image

def load(p):
    return np.asarray(Image.open(p).convert("RGB"), dtype=np.float32)

def stats(a):
    luma = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    return {"meanLuma": round(float(luma.mean()), 2), "blackFrac": round(float((luma < 4).mean()), 3), "distinct": int(len(np.unique(a.reshape(-1, 3), axis=0)))}

args = sys.argv[1:]
for i in range(0, len(args), 2):
    a, b = load(args[i]), load(args[i + 1])
    if a.shape != b.shape:
        print(json.dumps({"a": args[i], "b": args[i + 1], "error": "shape mismatch"}))
        continue
    d = np.abs(a - b)
    print(json.dumps({"a": args[i].split("/")[-1], "b": args[i + 1].split("/")[-1], "meanAbsDiff": round(float(d.mean()), 3), "pctPixelsDiffGt8": round(float((d.max(axis=2) > 8).mean() * 100), 2), "statsA": stats(a)}))
