"""Per-game luma stats for desktop shots. usage: postluma.py LABEL=DIR [LABEL=DIR ...]
DIR = dir containing report.json (capture out). Prints mean luma, lit-pixel
luma (pixels with luma>16), clipped fraction (luma>=250), dark fraction (<16)."""
import sys, os, glob
import numpy as np
from PIL import Image

GAMES = ["blockfall-reactor", "vault-breakers", "courier-rush", "neon-swarm", "rooftop-buckets", "mech-hangar", "skyline-runner"]


def stats(path):
    a = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)
    l = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    lit = l[l > 16]
    return l.mean(), (lit.mean() if lit.size else 0.0), (l >= 250).mean(), (l < 16).mean()


def game_stats(d, g):
    files = sorted(glob.glob(os.path.join(d, f"*{g}*", "desktop-1280x720__0*.png")))
    if not files:
        return None
    s = np.array([stats(f) for f in files])
    return s.mean(axis=0), len(files)


runs = [a.split("=", 1) for a in sys.argv[1:]]
print("game".ljust(20) + "".join(f"{lab:>30}" for lab, _ in runs))
print(" " * 20 + "".join(f"{'mean/lit/clip%/dark%':>30}" for _ in runs))
for g in GAMES:
    row = g.ljust(20)
    for _, d in runs:
        r = game_stats(d, g)
        row += f"{'-':>30}" if r is None else f"{r[0][0]:7.1f}{r[0][1]:7.1f}{r[0][2]*100:7.2f}{r[0][3]*100:7.1f}({r[1]})".rjust(30)
    print(row)
