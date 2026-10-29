import sys, numpy as np
from PIL import Image
import warnings; warnings.filterwarnings("ignore")
L = lambda p: np.asarray(Image.open(p).convert("RGB"), dtype=np.float64) @ np.array([0.2126, 0.7152, 0.0722])
card, E = sys.argv[1], sys.argv[2]
ref = L(card)
for r in ("base", "e2"):
    before, n1 = L(f"{E}/cal-{r}/ship-settle-60s.jpg"), L(f"{E}/cal-{r}/n1-settle-60s.jpg")
    mask = np.abs(n1 - before) > 10
    rows = np.arange(mask.shape[0])[:, None]; mid = np.median(np.nonzero(mask)[0])
    ctrl = (np.abs(n1 - before) < 3)
    for shot in ("settle-30s", "settle-60s"):
        after = L(f"{E}/after-{r}/ship-{shot}.jpg")
        out = [f"engine={r} {shot}: GLB before {before[mask].mean():.1f} after {after[mask].mean():.1f} card {ref[mask].mean():.1f} -> {after[mask].mean()/ref[mask].mean()*100:.1f}% of card (before {before[mask].mean()/ref[mask].mean()*100:.1f}%)"]
        for nm, sel in (("upper", mask & (rows < mid)), ("lower", mask & (rows >= mid))):
            out.append(f"{nm} {after[sel].mean()/ref[sel].mean()*100:.1f}%")
        out.append(f"control before {before[ctrl].mean():.1f} after {after[ctrl].mean():.1f}; whole {before.mean():.2f}->{after.mean():.2f}")
        print(" | ".join(out))
