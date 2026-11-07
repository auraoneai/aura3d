"""Amplified |a-b| image (x gain), for locating particle pixels in a with-vs-without pair.
usage: python3 absdiff.py <a.png> <b.png> <out.png> [gain=8]"""
import sys
import numpy as np
from PIL import Image
a = np.asarray(Image.open(sys.argv[1]).convert("RGB"), dtype=np.float32)
b = np.asarray(Image.open(sys.argv[2]).convert("RGB"), dtype=np.float32)
gain = float(sys.argv[4]) if len(sys.argv) > 4 else 8
d = np.clip(np.abs(a - b) * gain, 0, 255).astype(np.uint8)
Image.fromarray(d).save(sys.argv[3])
m = np.abs(a - b).max(axis=2)
ys, xs = np.nonzero(m > 8)
print(f"{len(xs)} px over 8", (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())) if len(xs) else "")
