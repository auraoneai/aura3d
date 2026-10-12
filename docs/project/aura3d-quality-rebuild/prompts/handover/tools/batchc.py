"""Batch C luma stats. usage: batchc.py LABEL=DIR ... ; mean/lit(>16)/p99/clip%/n"""
import sys, os, glob
import numpy as np
from PIL import Image

GAMES = ["aura-clash-showcase", "showcase-gallery-shift", "showcase-deep-recovery",
         "showcase-patrol-wing", "showcase-bank-shot", "showcase-orbital-defense"]


def stats(path):
    a = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)
    l = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    lit = l[l > 16]
    return l.mean(), (lit.mean() if lit.size else 0.0), np.percentile(l, 99), (l >= 250).mean() * 100


runs = [a.split("=", 1) for a in sys.argv[1:]]
for g in GAMES:
    row = g[-22:].ljust(24)
    for _, d in runs:
        files = sorted(glob.glob(os.path.join(d, f"*{g}*", "desktop-1280x720__0*.png")))
        if not files:
            row += "-".rjust(34)
            continue
        s = np.array([stats(f) for f in files]).mean(axis=0)
        row += f"{s[0]:7.1f}{s[1]:7.1f}{s[2]:7.1f}{s[3]:6.2f}({len(files)})".rjust(34)
    print(row)
print("cols per run: mean lit p99 clip% (shots) ; runs:", [l for l, _ in runs])
