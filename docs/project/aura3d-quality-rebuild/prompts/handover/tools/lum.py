"""usage: lum.py LABEL=DIR ... ; per game: mean luma, lit luma (>16), bright% (>=200), clip% (>=250), nshots."""
import sys, os, glob
import numpy as np
from PIL import Image

GAMES = ["skyline-runner", "turbo-drift-circuit", "siege-golf", "aurora-lander", "gravity-post", "pulse-tunnel"]


def stats(p):
    a = np.asarray(Image.open(p).convert("RGB"), dtype=np.float32)
    l = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    lit = l[l > 16]
    return [l.mean(), lit.mean() if lit.size else 0.0, (l >= 200).mean() * 100, (l >= 250).mean() * 100]


runs = [a.split("=", 1) for a in sys.argv[1:]]
for g in GAMES:
    for lab, d in runs:
        fs = sorted(glob.glob(os.path.join(d, "**", f"showcase-{g}", "desktop-1280x720__0*.png"), recursive=True))
        if not fs:
            print(f"{g:22}{lab:10} -")
            continue
        s = np.array([stats(f) for f in fs]).mean(axis=0)
        print(f"{g:22}{lab:10} mean {s[0]:6.1f} lit {s[1]:6.1f} bright% {s[2]:5.2f} clip% {s[3]:5.2f} n={len(fs)}")
