#!/usr/bin/env python3
"""Deep-space starfield equirect generator (K1 planets-space 'starfield cube' candidate).

Deterministic stars on the unit sphere (golden-spiral lattice + hash jitter),
power-law magnitudes, blackbody-ish colours, faint galactic band. Writes a
Radiance .hdr (flat RGBE) equirect — downsample faces for cube use downstream.

Usage: gen-starfield.py <out.hdr> [--res N] [--stars N] [--seed N]
"""
import argparse, struct
import numpy as np

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--res", type=int, default=8192, help="equirect width (height = w/2)")
    ap.add_argument("--stars", type=int, default=6000)
    ap.add_argument("--seed", type=int, default=0x8a411208)
    args = ap.parse_args()
    W, H = args.res, args.res // 2
    rng = np.random.default_rng(args.seed)

    # Stars on the sphere: golden-spiral lattice with per-star jitter.
    n = args.stars
    ga = np.pi * (3 - np.sqrt(5))
    i = np.arange(n)
    y_s = 1 - (i / (n - 1)) * 2                      # 1 → -1 on sphere
    th = ga * i
    r = np.sqrt(np.clip(1 - y_s * y_s, 0, 1))
    dirs = np.stack([np.cos(th) * r, y_s, np.sin(th) * r], axis=1)
    dirs += rng.normal(0, 0.012, dirs.shape)          # jitter breaks the lattice
    dirs /= np.linalg.norm(dirs, axis=1, keepdims=True)

    # Magnitudes: power law (many faint, few bright). Linear radiance values.
    mag = rng.power(0.28, n) * rng.uniform(0.3, 4.0, n)      # 0..~4, skewed low
    mag += rng.uniform(0.02, 0.08, n)                        # floor glow
    # Colour temperature: blackbody-ish spread (mostly white-blue, some warm/red).
    t = rng.beta(2.2, 1.6, n)
    col = np.stack([0.75 + 0.55 * t, 0.82 + 0.30 * t, 1.05 - 0.25 * t], axis=1)
    col /= col.max(axis=1, keepdims=True)

    # Star → equirect pixel coords.
    lon = np.arctan2(dirs[:, 2], dirs[:, 0])          # -pi..pi
    lat = np.arcsin(np.clip(dirs[:, 1], -1, 1))       # -pi/2..pi/2
    sx = ((lon + np.pi) / (2 * np.pi) * W).astype(int) % W
    sy = (np.clip((np.pi / 2 - lat) / np.pi, 0, 1 - 1e-9) * H).astype(int)

    img = np.zeros((H, W, 3), dtype=np.float64)
    # Gaussian-ish PSF: deposit the star at its pixel + a 3x3 soft kernel.
    k = np.array([[0.03, 0.12, 0.03], [0.12, 0.41, 0.12], [0.03, 0.12, 0.03]])
    for j in range(n):
        x, yv = sx[j], sy[j]
        c = col[j] * mag[j]
        for dy in (-1, 0, 1):
            yy = (yv + dy) % H
            for dx in (-1, 0, 1):
                xx = (x + dx) % W
                img[yy, xx] += c * k[dy + 1, dx + 1]

    # Faint galactic band at 1/16 res (low-freq content; upsampled via repeat).
    axis = np.array([0.525, 0.0, 0.851])
    ds = 16
    bh, bw = H // ds, W // ds
    yy, xx = np.mgrid[0:bh, 0:bw]
    plon = (xx / bw) * 2 * np.pi - np.pi
    plat = np.pi / 2 - (yy / bh) * np.pi
    pdir = np.stack([np.cos(plat) * np.cos(plon), np.sin(plat), np.cos(plat) * np.sin(plon)], axis=-1)
    dist = np.abs(pdir @ axis)                       # 0 on the band plane
    band = np.exp(-((dist / 0.16) ** 2)) * 0.035
    for scale, amp in ((4, 0.55), (9, 0.3), (19, 0.15)):
        hashv = np.sin(pdir[..., 0] * scale * 12.7 + pdir[..., 1] * scale * 7.1 +
                       pdir[..., 2] * scale * 9.3 + args.seed) * 43758.5453
        band *= 1 + (hashv - np.floor(hashv) - 0.5) * amp
    # Bilinear-ish upsample via repeat+box blur (two passes of 2x replicate).
    band = np.repeat(np.repeat(band, ds, axis=0), ds, axis=1)
    band = np.lib.stride_tricks.sliding_window_view(
        np.pad(band, ((0, 2), (0, 2)), mode="wrap"), (3, 3)).mean(axis=(-2, -1))[:H, :W]
    img += band[..., None] * np.array([0.65, 0.72, 1.0])   # cool milky tint

    img = np.clip(img, 0, 32.0).astype(np.float32)

    # Radiance .hdr (flat, no RLE — simple + universally readable).
    rgbe = np.zeros((H, W, 4), dtype=np.uint8)
    mx = img.max(axis=-1)
    ok = mx > 1e-38
    mant, expo = np.frexp(mx[ok])
    scale = mant * 256.0 / mx[ok]
    rgbe[ok, 0] = (img[ok, 0] * scale).astype(np.uint8)
    rgbe[ok, 1] = (img[ok, 1] * scale).astype(np.uint8)
    rgbe[ok, 2] = (img[ok, 2] * scale).astype(np.uint8)
    rgbe[ok, 3] = (expo + 128).astype(np.uint8)

    with open(args.out, "wb") as f:
        f.write(b"#?RADIANCE\n")
        f.write(b"# aura3d quality-rebuild K1 deep-space starfield (procedural)\n")
        f.write(b"FORMAT=32-bit_rle_rgbe\n\n")
        f.write(f"-Y {H} +X {W}\n".encode())
        f.write(rgbe.tobytes())
    print(f"wrote {args.out} {W}x{H} stars={n} max={mx.max():.2f}")

if __name__ == "__main__":
    main()
