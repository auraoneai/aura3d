"""Grid luma compare: grid.py A.png B.png [n] -> n x n mean luma A / B."""
import sys
import numpy as np
from PIL import Image


def luma(p):
    a = np.asarray(Image.open(p).convert("RGB"), dtype=np.float32)
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


n = int(sys.argv[3]) if len(sys.argv) > 3 else 6
A, B = luma(sys.argv[1]), luma(sys.argv[2])
h, w = A.shape
for i in range(n):
    row = []
    for j in range(n):
        sa = A[i * h // n:(i + 1) * h // n, j * w // n:(j + 1) * w // n]
        sb = B[i * h // n:(i + 1) * h // n, j * w // n:(j + 1) * w // n]
        row.append(f"{sa.mean():5.0f}/{sb.mean():<5.0f}")
    print(" ".join(row))
