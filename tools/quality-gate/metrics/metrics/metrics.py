"""
PRD-12 §7.5 metrics engine: FLIP, SSIM, MS-SSIM, LPIPS(AlexNet), ΔE2000 plus
the §6.5 appearance detectors. Everything runs on CPU on the CI metrics runner.

Distances convention (§6.4): every gated quantity is a distance >= 0 (SSIM and
MS-SSIM are emitted both raw and gated as 1 - ssim / 1 - msssim).

Dependencies are pinned in requirements.lock. `flip` and `lpips_alex` import
their pinned packages lazily; when the package is absent the metric reports
{"value": null, "status": "unavailable"} — it is never fabricated or replaced
by a proxy.

Inputs: sRGB PNGs via Pillow; all detector math runs on linear-light luma
(§6.5). Mask PNGs are single-channel (values 0/255, or the object-id channel).
"""

from __future__ import annotations

import json
import math
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

try:
    from PIL import Image
except ImportError:  # pragma: no cover - Pillow is pinned
    Image = None


# --------------------------------------------------------------------------
# Loading / color conversion
# --------------------------------------------------------------------------

def load_rgb(path: str | Path) -> np.ndarray:
    """sRGB image -> float32 RGB in [0, 1]."""
    with Image.open(path) as img:
        return np.asarray(img.convert("RGB"), dtype=np.float32) / 255.0


def load_mask(path: str | Path) -> np.ndarray:
    """Mask PNG -> uint8 RGB. Binary masks are white; object-id masks keep the
    §8.1 idColor encoding (r=(i*37)%251+1, g=i>>8, b=0)."""
    with Image.open(path) as img:
        return np.asarray(img.convert("RGB"), dtype=np.uint8)


def _inside(mask: np.ndarray) -> np.ndarray:
    """2D bool inside-region for an RGB mask."""
    return mask.any(axis=-1)


def decode_object_ids(object_id_mask: np.ndarray) -> np.ndarray:
    """idColor → object index. r=(i*37)%251+1 ⇒ i≡(r−1)·95 (mod 251); g=i>>8 and
    256≡5 (mod 251), so i = 256·g + ((i_raw − 5·g) mod 251). -1 = background."""
    r = object_id_mask[..., 0].astype(np.int64)
    g = object_id_mask[..., 1].astype(np.int64)
    i_raw = (r - 1) * 95 % 251
    low = (i_raw - 5 * g) % 251
    return np.where(r > 0, 256 * g + low, -1)


def srgb_to_linear(rgb: np.ndarray) -> np.ndarray:
    c = np.clip(rgb.astype(np.float64), 0.0, 1.0)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def luma_linear(rgb_srgb: np.ndarray) -> np.ndarray:
    """Linear-light luminance (BT.709) of an sRGB image — detector domain (§6.5)."""
    lin = srgb_to_linear(rgb_srgb)
    return 0.2126 * lin[..., 0] + 0.7152 * lin[..., 1] + 0.0722 * lin[..., 2]


def luma_srgb8(rgb_srgb: np.ndarray) -> np.ndarray:
    """Perceptual luma in 0-255 levels (for the ≥250 clip detector)."""
    return (0.2126 * rgb_srgb[..., 0] + 0.7152 * rgb_srgb[..., 1] + 0.0722 * rgb_srgb[..., 2]) * 255.0


def _same_size(a: np.ndarray, b: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    h = min(a.shape[0], b.shape[0])
    w = min(a.shape[1], b.shape[1])
    return a[:h, :w], b[:h, :w]


def _mask_flat(mask: np.ndarray | None, shape: tuple[int, int]) -> np.ndarray:
    if mask is None:
        return np.ones(shape, dtype=bool)
    m = mask[: shape[0], : shape[1]] != 0
    return m


# --------------------------------------------------------------------------
# Reference metrics (§7.5 signatures)
# --------------------------------------------------------------------------

def flip(ref: np.ndarray, test: np.ndarray, mask: np.ndarray | None = None) -> float:
    """NVlabs flip-evaluator, LDR mode, ppd=67.0 (default viewing conditions)."""
    from flip_evaluator import evaluate as flip_evaluate  # lazy: pinned dep

    ref_c, test_c = _same_size(ref, test)
    mean, _weighted, _map = flip_evaluate(ref_c.astype(np.float32), test_c.astype(np.float32), "LDR", ppd=67.0)
    return float(mean)


def _gaussian_window(size: int, sigma: float) -> np.ndarray:
    coords = np.arange(size, dtype=np.float64) - (size - 1) / 2.0
    g = np.exp(-(coords**2) / (2 * sigma * sigma))
    g /= g.sum()
    return np.outer(g, g)


def _conv_valid(img: np.ndarray, win: np.ndarray) -> np.ndarray:
    """Pure-numpy correlate fallback (skimage/scipy absent): stride-windowed sums."""
    k = win.shape[0]
    pad = k // 2
    padded = np.pad(img, pad, mode="constant")
    out = np.empty_like(img, dtype=np.float64)
    # O(k^2) vectorized shifts — fine at 720p on the CI CPU (~0.1 s/plane).
    acc = np.zeros_like(img, dtype=np.float64)
    for dy in range(k):
        for dx in range(k):
            acc += padded[dy : dy + img.shape[0], dx : dx + img.shape[1]] * win[dy, dx]
    out = acc
    return out


def _filter2d(img: np.ndarray, win: np.ndarray) -> np.ndarray:
    try:
        from scipy.ndimage import correlate  # noqa: WPS433
        return correlate(img, win, mode="constant")
    except ImportError:
        return _conv_valid(img, win)


def ssim(ref: np.ndarray, test: np.ndarray, mask: np.ndarray | None = None,
         gaussian_sigma: float = 1.5, win: int = 11) -> float:
    """
    Gaussian-windowed SSIM on linear luma, skimage-compatible parameters
    (gaussian_weights=True, sigma=1.5, use_sample_covariance=False,
    data_range=1.0). Returned raw; the gate uses 1 - ssim (§6.4).
    """
    a, b = _same_size(ref, test)
    la = luma_linear(a)
    lb = luma_linear(b)
    try:
        from skimage.metrics import structural_similarity  # noqa: WPS433
        if mask is None:
            return float(structural_similarity(
                la, lb, gaussian_weights=True, sigma=gaussian_sigma,
                use_sample_covariance=False, data_range=1.0))
        full_map = structural_similarity(
            la, lb, gaussian_weights=True, sigma=gaussian_sigma,
            use_sample_covariance=False, data_range=1.0, full=True)[1]
        m = _mask_flat(mask, full_map.shape)
        return float(full_map[m].mean()) if m.any() else float("nan")
    except ImportError:
        pass
    w = _gaussian_window(win, gaussian_sigma)
    ux = _filter2d(la, w)
    uy = _filter2d(lb, w)
    uxx = _filter2d(la * la, w)
    uyy = _filter2d(lb * lb, w)
    uxy = _filter2d(la * lb, w)
    vx = uxx - ux * ux
    vy = uyy - uy * uy
    vxy = uxy - ux * uy  # population covariance (use_sample_covariance=False)
    c1 = (0.01 * 1.0) ** 2
    c2 = (0.03 * 1.0) ** 2
    ssim_map = ((2 * ux * uy + c1) * (2 * vxy + c2)) / ((ux * ux + uy * uy + c1) * (vx + vy + c2))
    m = _mask_flat(mask, ssim_map.shape)
    return float(ssim_map[m].mean()) if m.any() else float("nan")


def msssim(ref: np.ndarray, test: np.ndarray, mask: np.ndarray | None = None) -> float:
    """5-scale MS-SSIM (Wang 2003) on linear luma; weights sum to 1."""
    weights = np.array([0.0448, 0.2856, 0.3001, 0.2363, 0.1333])
    a, b = _same_size(ref, test)
    la, lb = luma_linear(a), luma_linear(b)
    w = _gaussian_window(11, 1.5)
    c1 = (0.01 * 1.0) ** 2
    c2 = (0.03 * 1.0) ** 2
    values = []
    for _ in range(5):
        ux = _filter2d(la, w)
        uy = _filter2d(lb, w)
        vx = _filter2d(la * la, w) - ux * ux
        vy = _filter2d(lb * lb, w) - uy * uy
        vxy = _filter2d(la * lb, w) - ux * uy
        ssim_map = ((2 * ux * uy + c1) * (2 * vxy + c2)) / ((ux * ux + uy * uy + c1) * (vx + vy + c2))
        cs_map = np.clip((2 * vxy + c2) / (vx + vy + c2), 0, None)
        m = _mask_flat(mask, ssim_map.shape)
        if not m.any():
            return float("nan")
        values.append((float(np.mean(np.sqrt(cs_map[m]))), float(ssim_map[m].mean())))
        la = la[::2, ::2]
        lb = lb[::2, ::2]
        if mask is not None:
            mask = mask[::2, ::2]
        if min(la.shape) < 11:
            break
    n = len(values)
    w = weights[:n] / weights[:n].sum()
    cs_prod = float(np.prod([v[0] ** w_i for v, w_i in zip(values[:-1], w[:-1])])) if n > 1 else 1.0
    return float(cs_prod * values[-1][1] ** w[-1])


def lpips_alex(ref: np.ndarray, test: np.ndarray) -> float:
    """lpips==0.1.4, net='alex', CPU, inputs scaled to [-1, 1] (§7.5)."""
    import torch  # noqa: WPS433
    import lpips  # noqa: WPS433

    ref_c, test_c = _same_size(ref, test)
    with torch.no_grad():
        net = _lpips_net()
        t1 = torch.tensor(ref_c.transpose(2, 0, 1)[None], dtype=torch.float32) * 2 - 1
        t2 = torch.tensor(test_c.transpose(2, 0, 1)[None], dtype=torch.float32) * 2 - 1
        return float(net(t1, t2).item())


_LPIPS_NET = None

def _lpips_net():
    global _LPIPS_NET
    if _LPIPS_NET is None:
        import lpips  # noqa: WPS433
        _LPIPS_NET = lpips.LPIPS(net="alex", verbose=False)
        _LPIPS_NET.eval()
    return _LPIPS_NET


# --- CIE Lab / ΔE2000 ------------------------------------------------------

def _rgb_to_lab(rgb_srgb: np.ndarray) -> np.ndarray:
    """sRGB -> CIE Lab (D65), matching skimage.color.rgb2lab."""
    lin = srgb_to_linear(rgb_srgb)
    # sRGB (D65) -> XYZ
    m = np.array([
        [0.41239079926595948, 0.35758433938387796, 0.18048078840183429],
        [0.21263900587151036, 0.71516867876775593, 0.07219231536073371],
        [0.01933081871559185, 0.11919477979462599, 0.95053215224966058],
    ])
    xyz = lin @ m.T
    xyzn = xyz / np.array([0.9504559270516716, 1.0, 1.0890577507598784])
    delta = 6 / 29
    t = np.where(xyzn > delta**3, np.cbrt(xyzn), xyzn / (3 * delta**2) + 4 / 29)
    L = 116 * t[..., 1] - 16
    a = 500 * (t[..., 0] - t[..., 1])
    b = 200 * (t[..., 1] - t[..., 2])
    return np.stack([L, a, b], axis=-1)


def _delta_e2000(lab1: np.ndarray, lab2: np.ndarray) -> np.ndarray:
    """CIEDE2000 (L*=1, C*=1, h*=1), matching skimage.color.deltaE_ciede2000."""
    l1, a1, b1 = lab1[..., 0], lab1[..., 1], lab1[..., 2]
    l2, a2, b2 = lab2[..., 0], lab2[..., 1], lab2[..., 2]
    c1 = np.hypot(a1, b1)
    c2 = np.hypot(a2, b2)
    cbar = (c1 + c2) / 2
    c7 = cbar**7
    g = 0.5 * (1 - np.sqrt(c7 / (c7 + 25.0**7 + 1e-12)))
    a1p = a1 * (1 + g)
    a2p = a2 * (1 + g)
    c1p = np.hypot(a1p, b1)
    c2p = np.hypot(a2p, b2)
    h1p = np.degrees(np.arctan2(b1, a1p)) % 360
    h2p = np.degrees(np.arctan2(b2, a2p)) % 360
    dl = l2 - l1
    dc = c2p - c1p
    dh_abs = np.abs(h2p - h1p)
    dh = np.where(dh_abs <= 180, h2p - h1p, np.where(h2p > h1p, h2p - h1p - 360, h2p - h1p + 360))
    dh = np.where((c1p * c2p) == 0, 0.0, dh)
    dhp = 2 * np.sqrt(c1p * c2p) * np.sin(np.radians(dh) / 2)
    lbar = (l1 + l2) / 2
    cbarp = (c1p + c2p) / 2
    hd_sum = h1p + h2p
    hbar = np.where(
        dh_abs <= 180, hd_sum / 2,
        np.where(hd_sum < 360, (hd_sum + 360) / 2, (hd_sum - 360) / 2),
    )
    hbar = np.where((c1p * c2p) == 0, hd_sum, hbar)
    t_h = (1 - 0.17 * np.cos(np.radians(hbar - 30))
           + 0.24 * np.cos(np.radians(2 * hbar))
           + 0.32 * np.cos(np.radians(3 * hbar + 6))
           - 0.20 * np.cos(np.radians(4 * hbar - 63)))
    sl = 1 + (0.015 * (lbar - 50) ** 2) / np.sqrt(20 + (lbar - 50) ** 2)
    sc = 1 + 0.045 * cbarp
    sh = 1 + 0.015 * cbarp * t_h
    delta_theta = 30 * np.exp(-(((hbar - 275) / 25) ** 2))
    cp7 = cbarp**7
    rc = 2 * np.sqrt(cp7 / (cp7 + 25.0**7 + 1e-12))
    rt = -np.sin(np.radians(2 * delta_theta)) * rc
    return np.sqrt(
        (dl / sl) ** 2 + (dc / sc) ** 2 + (dhp / sh) ** 2 + rt * (dc / sc) * (dhp / sh)
    )


def delta_e2000(ref: np.ndarray, test: np.ndarray, mask: np.ndarray | None = None) -> float:
    """Mean CIEDE2000 over the mask (spec: skimage rgb2lab + deltaE_ciede2000)."""
    a, b = _same_size(ref, test)
    try:
        from skimage.color import deltaE_ciede2000, rgb2lab  # noqa: WPS433
        de = deltaE_ciede2000(rgb2lab(a), rgb2lab(b))
    except ImportError:
        de = _delta_e2000(_rgb_to_lab(a), _rgb_to_lab(b))
    m = _mask_flat(mask, de.shape)
    return float(de[m].mean()) if m.any() else float("nan")


# --------------------------------------------------------------------------
# §6.5 appearance detectors (pure numpy; linear-luma domain)
# --------------------------------------------------------------------------

def _dilate(mask: np.ndarray, radius: int) -> np.ndarray:
    out = mask.copy()
    for _ in range(radius):
        padded = np.pad(out > 0, 1, mode="constant")
        out = (
            padded[:-2, 1:-1] | padded[2:, 1:-1] | padded[1:-1, :-2] | padded[1:-1, 2:]
            | padded[:-2, :-2] | padded[:-2, 2:] | padded[2:, :-2] | padded[2:, 2:]
        )
    return out


def _laplacian(luma: np.ndarray) -> np.ndarray:
    k = np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]], dtype=np.float64)
    return _filter2d(luma, k)


def _median(values: np.ndarray) -> float:
    return float(np.median(values)) if values.size else float("nan")


def detectors(img: np.ndarray, masks: dict[str, np.ndarray], ref_img: np.ndarray | None,
              strip: list[np.ndarray] | None = None, background_rgb: np.ndarray | None = None) -> dict[str, float | None]:
    """
    §6.5 detectors on one captured frame — the eleven canonical names only.
    `masks` are the three-side RGB mask PNGs applied to this image; `ref_img` is
    the three.js reference when present (ratio-style detectors compare img vs
    ref_img values outside this function — callers run detectors() per engine
    image and form the ratio themselves). Missing inputs yield None (null in
    the report), never a guess.
    """
    h, w = img.shape[:2]
    lin = luma_linear(img)
    lum8 = luma_srgb8(img)
    out: dict[str, float | None] = {}

    obj = masks.get("object-id")
    object_ids = decode_object_ids(obj) if obj is not None else None
    subject = object_ids is not None and (object_ids >= 0).any()
    subject_mask = (object_ids >= 0) if subject else np.ones((h, w), dtype=bool)
    sky_sel = _inside(masks["sky"]) if masks.get("sky") is not None else None
    metal_sel = _inside(masks["metal"]) if masks.get("metal") is not None else None
    shadow_sel = _inside(masks["shadow-receiver"]) if masks.get("shadow-receiver") is not None else None
    edge_sel = _inside(masks["silhouette-edge"]) if masks.get("silhouette-edge") is not None else None

    # blankOrBlack — fraction of pixels with luma < 4 (canvas region = frame).
    out["blankOrBlack"] = float((lum8 < 4).mean())

    # dynamicRange — p1–p99 luma (scene minus hud where a hud mask exists).
    hud_sel = _inside(masks["hud"]) if masks.get("hud") is not None else None
    scene_region = subject_mask if hud_sel is None else ~hud_sel
    out["dynamicRange"] = float(np.percentile(lin[scene_region], 99) - np.percentile(lin[scene_region], 1))

    # skyVariance — luma std inside the sky mask.
    out["skyVariance"] = float(lin[sky_sel].std()) if sky_sel is not None and sky_sel.any() else None

    # textureDetail — variance of the Laplacian inside the object mask.
    lap = _laplacian(lin)
    out["textureDetail"] = float(lap[subject_mask].var()) if subject_mask.any() else None

    # edgeAliasing — high-frequency energy along silhouette-edge / edge length.
    if edge_sel is not None and edge_sel.any():
        out["edgeAliasing"] = float((lap[edge_sel] ** 2).sum() / edge_sel.sum())
    else:
        out["edgeAliasing"] = None

    # shadowContrast — median luma(shadow mask) / median luma(lit ring 8-24 px).
    if shadow_sel is not None and shadow_sel.any():
        ring = _dilate(shadow_sel, 24) & ~_dilate(shadow_sel, 8)
        lit_ring = ring & ~shadow_sel
        shadow_l = _median(lin[shadow_sel])
        lit_l = _median(lin[lit_ring])
        out["shadowContrast"] = shadow_l / lit_l if lit_l > 0 else None
    else:
        out["shadowContrast"] = None

    # contactDarkening — luma ratio in a 6 px band under each caster's lowest
    # silhouette row vs the receiver mean (approximation: band = first 6 px
    # below each object-id region, inside the receiver mask when present).
    if object_ids is not None and subject:
        band_values: list[np.ndarray] = []
        receiver = shadow_sel if shadow_sel is not None else np.ones((h, w), dtype=bool)
        for object_id in np.unique(object_ids[object_ids >= 0]):
            region = object_ids == object_id
            rows = np.where(region.any(axis=1))[0]
            if rows.size == 0 or rows.max() + 6 >= h:
                continue
            band = np.zeros((h, w), dtype=bool)
            band[rows.max() + 1 : rows.max() + 7, :] = True
            band &= _dilate(region, 8) & ~_dilate(region, 0) & receiver
            if band.any():
                band_values.append(lin[band])
        if band_values and receiver.any():
            band_mean = float(np.concatenate(band_values).mean())
            receiver_mean = float(lin[receiver].mean())
            out["contactDarkening"] = band_mean / receiver_mean if receiver_mean > 0 else None
        else:
            out["contactDarkening"] = None
    else:
        out["contactDarkening"] = None

    # highlightEnergy — p99 luma8 on metal ∩ object (subject fallback).
    highlight_sel = metal_sel if metal_sel is not None and metal_sel.any() else (subject_mask if subject else None)
    out["highlightEnergy"] = float(np.percentile(lum8[highlight_sel], 99)) if highlight_sel is not None else None

    # roughnessResponse — fraction of adjacent object-id pairs whose mean luma
    # is monotone in id order (sweep scenes lay roughness out in id order).
    if object_ids is not None and len(np.unique(object_ids[object_ids >= 0])) >= 3:
        means = [float(lin[object_ids == object_id].mean()) for object_id in np.unique(object_ids[object_ids >= 0])]
        inc = np.diff(np.asarray(means))
        out["roughnessResponse"] = float(np.mean(inc >= 0)) if inc.size else None
    else:
        out["roughnessResponse"] = None

    # subjectPresence — fraction of the three object mask whose colour differs
    # from the flat background colour by > 6 levels (colour-background scenes).
    if background_rgb is not None and subject:
        diff = np.abs((img * 255).astype(np.int16) - np.asarray(background_rgb, dtype=np.int16)).max(axis=-1)
        out["subjectPresence"] = float((diff[subject_mask] > 6).mean())
    else:
        out["subjectPresence"] = None

    # temporalFlicker — mean |Δluma| between consecutive strip frames on static
    # pixels (same mask applied to every strip frame).
    if strip and len(strip) >= 2:
        deltas = []
        prev = luma_linear(strip[0])
        for frame in strip[1:]:
            cur = luma_linear(frame)
            deltas.append(np.abs(cur - prev).mean())
            prev = cur
        out["temporalFlicker"] = float(np.mean(deltas))
    else:
        out["temporalFlicker"] = None

    return out


# --------------------------------------------------------------------------
# Alignment check (§6.3) — the mask assumption is checked, never presumed.
# --------------------------------------------------------------------------

def _corner_background(img8: np.ndarray, patch: int = 8) -> tuple[np.ndarray, float]:
    """Median colour of the four corner patches + spread across them. A large
    spread means a non-flat (HDRI/gradient) background."""
    h, w = img8.shape[:2]
    corners = np.concatenate([
        img8[:patch, :patch].reshape(-1, 3), img8[:patch, -patch:].reshape(-1, 3),
        img8[-patch:, :patch].reshape(-1, 3), img8[-patch:, -patch:].reshape(-1, 3),
    ])
    patch_medians = np.vstack([
        np.median(img8[:patch, :patch].reshape(-1, 3), axis=0),
        np.median(img8[:patch, -patch:].reshape(-1, 3), axis=0),
        np.median(img8[-patch:, :patch].reshape(-1, 3), axis=0),
        np.median(img8[-patch:, -patch:].reshape(-1, 3), axis=0),
    ])
    return np.median(corners, axis=0), float(patch_medians.max(axis=0).std())


def mask_alignment(aura_rgb: np.ndarray, object_ids: np.ndarray, background_rgb: np.ndarray | None) -> dict[str, float | bool | str]:
    """
    IoU(Aura subject, three object-id mask) ≥ 0.98 on flat-background scenes.
    The Aura-side segmentation keys on the *observed* corner background — a
    near-black spec.background.color must not segment the whole frame as the
    subject. Non-flat (HDRI) backgrounds report `applicable: false`; the chamfer
    path needs Canny, which lands with the metrics runner (Phase 1 follow-up).
    """
    obj = object_ids >= 0
    img8 = (aura_rgb * 255).astype(np.int16)
    observed_bg, spread = _corner_background(img8)
    if background_rgb is None or spread > 6:
        return {"applicable": False, "reason": "non-flat background: chamfer check pending"}
    diff = np.abs(img8 - np.asarray(observed_bg, dtype=np.int16)).max(axis=-1)
    aura_subject = diff > 6
    inter = (aura_subject & obj).sum()
    union = (aura_subject | obj).sum()
    iou = float(inter / union) if union else 1.0
    return {"applicable": True, "iou": iou, "passed": iou >= 0.98}


# --------------------------------------------------------------------------
# CLI: python -m metrics run --items items.json --out metrics.json
# --------------------------------------------------------------------------

@dataclass
class ItemResult:
    item_id: str
    metrics: dict[str, Any] = field(default_factory=dict)
    detectors_aura: dict[str, float] = field(default_factory=dict)
    detectors_reference: dict[str, float] = field(default_factory=dict)
    alignment: dict[str, Any] | None = None
    status: str = "ok"


def _hex_to_rgb(color: str | None) -> np.ndarray | None:
    if not color:
        return None
    color = color.lstrip("#")
    return np.array([int(color[i : i + 2], 16) for i in (0, 2, 4)], dtype=np.uint8)


def _metric_or_unavailable(name: str, fn, *args):
    try:
        return {"value": fn(*args), "status": "ok"}
    except ImportError as error:
        return {"value": None, "status": "unavailable", "reason": str(error)}
    except Exception as error:  # keep batch going; record, never fabricate
        return {"value": None, "status": "error", "reason": f"{type(error).__name__}: {error}"}


def run_item(item: dict[str, Any]) -> ItemResult:
    result = ItemResult(item_id=item.get("itemId", "unknown"))
    aura = load_rgb(item["aura"])
    ref = load_rgb(item["reference"]) if item.get("reference") else None
    masks = {key: load_mask(path) for key, path in (item.get("masks") or {}).items()}
    strip = [load_rgb(path) for path in (item.get("strip") or [])]
    background_rgb = _hex_to_rgb(item.get("backgroundColor"))
    regions = item.get("regions") or ["frame"]

    object_ids = decode_object_ids(masks["object-id"]) if masks.get("object-id") is not None else None

    def region_mask(region: str) -> np.ndarray | None:
        """2D uint8 (255 = inside) mask for a C-30 region name, or None."""
        if region in ("frame", None):
            return None
        if region == "subject":
            return ((object_ids >= 0) * 255).astype(np.uint8) if object_ids is not None else None
        if region.startswith("object:"):
            if object_ids is None:
                return None
            target = int(region.split(":", 1)[1])
            return ((object_ids == target) * 255).astype(np.uint8)
        if region == "scene-minus-hud":
            hud = masks.get("hud")
            return None if hud is None else (~_inside(hud) * 255).astype(np.uint8)
        mask = masks.get(region)
        return None if mask is None else (_inside(mask) * 255).astype(np.uint8)

    if ref is not None:
        for region in regions:
            m = region_mask(region)
            for name, fn in (
                ("flip", lambda: flip(ref, aura, m)),
                ("ssim", lambda: ssim(ref, aura, m)),
                ("msssim", lambda: msssim(ref, aura, m)),
                ("lpips_alex", lambda: lpips_alex(ref, aura)),
                ("delta_e2000", lambda: delta_e2000(ref, aura, m)),
            ):
                key = name if region == "frame" else f"{name}@{region}"
                outcome = _metric_or_unavailable(name, fn)
                # SSIM/MS-SSIM emit the gated distance form too (1 - ssim).
                if name in ("ssim", "msssim") and outcome["status"] == "ok":
                    result.metrics[f"1-{key}"] = {"value": 1 - outcome["value"], "status": "ok"}
                result.metrics[key] = outcome

    result.detectors_aura = detectors(aura, masks, ref, strip, background_rgb)
    if ref is not None:
        result.detectors_reference = detectors(ref, masks, None, strip, background_rgb)
    if object_ids is not None:
        result.alignment = mask_alignment(aura, object_ids, background_rgb)
    return result


def main(argv: list[str]) -> int:
    if len(argv) < 1 or argv[0] != "run":
        print("usage: python -m metrics run --items items.json --out metrics.json", file=sys.stderr)
        return 2
    items_path = out_path = None
    args = iter(argv[1:])
    for arg in args:
        if arg == "--items":
            items_path = next(args)
        elif arg == "--out":
            out_path = next(args)
    if not items_path or not out_path:
        print("usage: python -m metrics run --items items.json --out metrics.json", file=sys.stderr)
        return 2
    spec = json.loads(Path(items_path).read_text())
    items = spec if isinstance(spec, list) else spec.get("items", [])
    started = time.time()
    results = []
    for item in items:
        try:
            results.append(run_item(item))
        except Exception as error:
            results.append(ItemResult(item_id=item.get("itemId", "unknown"), status=f"error: {type(error).__name__}: {error}"))
    report = {
        "schema": "aura3d-quality-gate-metrics/1.0",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "wallSeconds": round(time.time() - started, 3),
        "items": [
            {
                "itemId": r.item_id,
                "status": r.status,
                "metrics": r.metrics,
                "detectors": {"aura3d": r.detectors_aura, "reference": r.detectors_reference},
                "alignment": r.alignment,
            }
            for r in results
        ],
    }
    Path(out_path).write_text(json.dumps(report, indent=2, default=str))
    print(f"[metrics] {len(results)} items -> {out_path}")
    return 0
