#!/usr/bin/env python3
"""Per-run frame statistics from <dir>/<id>-1.png and <id>-2.png (same keys as evidence/agent-eval-503/framestats.json).
usage: framestats.py <framesDir> <out.json>
mean/std are luma (0-255); nonblack = fraction of pixels with luma > 8; diff = mean abs luma difference between frames;
changedFrac = fraction of pixels whose luma changed by more than 8."""
import glob
import json
import os
import sys

import numpy as np
from PIL import Image

frames, out = sys.argv[1], sys.argv[2]
ids = sorted({os.path.basename(p).rsplit("-", 1)[0] for p in glob.glob(os.path.join(frames, "*-1.png"))})
stats = {}
for rid in ids:
    a = os.path.join(frames, f"{rid}-1.png")
    b = os.path.join(frames, f"{rid}-2.png")
    if not os.path.exists(b):
        continue
    la = np.asarray(Image.open(a).convert("L"), dtype=np.float32)
    lb = np.asarray(Image.open(b).convert("L"), dtype=np.float32)
    d = np.abs(la - lb)
    stats[rid] = {
        "mean": round(float(lb.mean()), 1),
        "std": round(float(lb.std()), 1),
        "nonblack": round(float((lb > 8).mean()), 3),
        "diff": round(float(d.mean()), 2),
        "changedFrac": round(float((d > 8).mean()), 4),
    }
json.dump(stats, open(out, "w"), indent=1)
print(f"{len(stats)} runs")
