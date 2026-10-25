#!/usr/bin/env python3
"""Palette change for the Cumulus Dash runner (hero.glb): masked hue shift of the baked colour texture.

Tunic orange -> teal, sash/wrist/boot blue -> gold, near-black hair -> plum. Skin, soles and eyes are untouched.
Geometry, skin weights, normals and animation are not modified; only the base-colour JPEG inside the GLB is replaced.
Usage: recolor-hero.py <in.glb> <out.glb> [--preview out.jpg]
"""
import io, json, struct, sys
import numpy as np
from PIL import Image


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def hsv(rgb):
    """rgb float [0,1] HxWx3 -> hue degrees [0,360), saturation, value."""
    r, g, b = (np.ascontiguousarray(rgb[..., i]) for i in range(3))
    mx = rgb.max(axis=-1)
    mn = rgb.min(axis=-1)
    d = mx - mn
    safe = np.where(d > 1e-9, d, 1.0)
    hue = np.where(mx == r, ((g - b) / safe) % 6.0, np.where(mx == g, (b - r) / safe + 2.0, (r - g) / safe + 4.0))
    hue = np.where(d > 1e-9, hue * 60.0, 0.0)
    sat = np.where(mx > 1e-9, d / np.where(mx > 1e-9, mx, 1.0), 0.0)
    return hue, sat, mx


def from_hsv(h, s, v):
    c = v * s
    hp = (h % 360.0) / 60.0
    x = c * (1 - np.abs(hp % 2.0 - 1))
    z = np.zeros_like(c)
    sector = np.floor(hp).astype(int) % 6
    r = np.choose(sector, [c, x, z, z, x, c])
    g = np.choose(sector, [x, c, c, x, z, z])
    b = np.choose(sector, [z, z, x, c, c, x])
    m = v - c
    return np.stack([r + m, g + m, b + m], -1)


def recolor_block(rgb):
    h, s, v = hsv(rgb)
    orange = smooth(2, 10, h) * (1 - smooth(36, 46, h)) * smooth(0.50, 0.65, s) * smooth(0.35, 0.5, v)
    blue = smooth(185, 195, h) * (1 - smooth(235, 245, h)) * smooth(0.40, 0.55, s) * smooth(0.2, 0.35, v)
    dark = (1 - smooth(0.10, 0.20, v)) * (1 - smooth(0.0, 0.35, s) * 0.0)
    out = rgb.copy()
    # tunic -> teal (hue 172), slightly deeper
    teal = from_hsv(np.full_like(h, 172.0), np.clip(s * 0.88, 0, 1), np.clip(v * 0.74, 0, 1))
    # sash and bands -> gold (hue 44), lifted
    gold = from_hsv(np.full_like(h, 44.0), np.clip(s * 1.05, 0, 0.9), np.clip(v * 1.35 + 0.05, 0, 1))
    # hair and deep shadow -> plum
    plum = np.stack([np.clip(v * 2.2 + 0.07, 0, 1) * 0.55, np.clip(v * 2.2 + 0.03, 0, 1) * 0.30, np.clip(v * 2.2 + 0.12, 0, 1) * 0.62], -1)
    for mask, col in ((orange, teal), (blue, gold), (dark, plum)):
        out = out * (1 - mask[..., None]) + col * mask[..., None]
    return out


CHUNK = 2048  # this numpy build returns wrong results for large arrays, so work in small blocks and self-check


def recolor(img):
    import colorsys
    rgb = np.asarray(img.convert("RGB"), dtype=np.float64) / 255.0
    flat = rgb.reshape(-1, 3)
    out = np.empty_like(flat)
    for i in range(0, flat.shape[0], CHUNK):
        out[i:i + CHUNK] = recolor_block(flat[i:i + CHUNK].reshape(-1, 1, 3)).reshape(-1, 3)
    # self-check: hue of the sampled input pixels against colorsys
    for i in range(0, flat.shape[0], 7919):
        blk = flat[i:i + 1].reshape(1, 1, 3)
        h_np = hsv(blk)[0][0, 0]
        h_cs = colorsys.rgb_to_hsv(*flat[i])[0] * 360.0
        assert abs(h_np - h_cs) < 1.0 or abs(abs(h_np - h_cs) - 360.0) < 1.0, f"hsv self-check failed at {i}"
    return Image.fromarray((np.clip(out.reshape(rgb.shape), 0, 1) * 255 + 0.5).astype(np.uint8), "RGB")


def main():
    src, dst = sys.argv[1], sys.argv[2]
    preview = sys.argv[sys.argv.index("--preview") + 1] if "--preview" in sys.argv else None
    b = open(src, "rb").read()
    jl = struct.unpack("<I", b[12:16])[0]
    j = json.loads(b[20:20 + jl])
    off = 20 + jl
    bl = struct.unpack("<I", b[off:off + 4])[0]
    binch = bytearray(b[off + 8:off + 8 + bl])
    mat = j["materials"][0]["pbrMetallicRoughness"]["baseColorTexture"]["index"]
    img_idx = j["textures"][mat]["source"]
    bv_idx = j["images"][img_idx]["bufferView"]
    bv = j["bufferViews"][bv_idx]
    start = bv.get("byteOffset", 0)
    old = bytes(binch[start:start + bv["byteLength"]])
    new_img = recolor(Image.open(io.BytesIO(old)))
    if preview:
        new_img.save(preview, quality=92)
    buf = io.BytesIO(); new_img.save(buf, "JPEG", quality=90, optimize=True); new = buf.getvalue()
    pad = (4 - len(new) % 4) % 4
    delta = len(new) + pad - (bv["byteLength"] + ((4 - bv["byteLength"] % 4) % 4))
    old_end = start + bv["byteLength"] + ((4 - bv["byteLength"] % 4) % 4)
    binch[start:old_end] = new + b"\x00" * pad
    bv["byteLength"] = len(new)
    for other in j["bufferViews"]:
        if other is not bv and other.get("byteOffset", 0) > start:
            other["byteOffset"] = other.get("byteOffset", 0) + delta
    j["buffers"][0]["byteLength"] = len(binch)
    jb = json.dumps(j, separators=(",", ":")).encode()
    jb += b" " * ((4 - len(jb) % 4) % 4)
    binb = bytes(binch) + b"\x00" * ((4 - len(binch) % 4) % 4)
    total = 12 + 8 + len(jb) + 8 + len(binb)
    open(dst, "wb").write(b[:8] + struct.pack("<I", total) + struct.pack("<I", len(jb)) + b"JSON" + jb + struct.pack("<I", len(binb)) + b"BIN\x00" + binb)
    print(f"texture {len(old)} -> {len(new)} bytes; glb {len(b)} -> {total} bytes")


if __name__ == "__main__":
    main()
