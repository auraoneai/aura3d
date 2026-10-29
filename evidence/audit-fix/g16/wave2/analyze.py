# usage: analyze.py <card@2x.jpg> <frames-dir> [shot]
import sys, glob, os
from PIL import Image
import numpy as np
card = sys.argv[1]; d = sys.argv[2]; shot = sys.argv[3] if len(sys.argv) > 3 else "settle-60s"
L = lambda p: np.asarray(Image.open(p).convert("RGB"), dtype=np.float64) @ np.array([0.2126, 0.7152, 0.0722])
ref = L(card)
frames = {os.path.basename(p)[:-len(f"-{shot}.jpg")]: L(p) for p in sorted(glob.glob(f"{d}/*-{shot}.jpg"))}
base = frames.get("ship")
# GLB mask: pixels the environment changes (n1 vs ship by > 10 luma), eroded by neighbour agreement
lit = frames.get("n1")
mask = np.abs(lit - base) > 10
# control: pixels no variant touches and far from the mask
far = ~mask
for k, f in frames.items():
    far &= np.abs(f - base) < 3
print(f"shot {shot}: GLB-mask px {mask.sum()} ({mask.mean()*100:.1f}%), control px {far.sum()}")
print(f"{'variant':10s} {'glb':>7s} {'card':>7s} {'ratio':>7s} {'ctrl':>7s} {'cardctl':>7s} {'whole':>7s}")
for k, f in frames.items():
    g, c = f[mask].mean(), ref[mask].mean()
    print(f"{k:10s} {g:7.1f} {c:7.1f} {g/c*100:6.1f}% {f[far].mean():7.1f} {ref[far].mean():7.1f} {f.mean():7.2f}")
# half-split of the mask: upper (towers/balloons) vs lower (undersides)
ys = np.nonzero(mask)[0]; mid = np.median(ys)
for name, sel in (("mask-upper", mask & (np.arange(mask.shape[0])[:, None] < mid)), ("mask-lower", mask & (np.arange(mask.shape[0])[:, None] >= mid))):
    print(name, "card", round(ref[sel].mean(), 1), " ".join(f"{k}={f[sel].mean()/ref[sel].mean()*100:.1f}%" for k, f in frames.items()))
