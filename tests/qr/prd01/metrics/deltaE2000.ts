/**
 * PRD-01 metric: CIEDE2000 colour difference (the tonemap-ramp scene's
 * deltaE2000 <= 2 / mean <= 1 gate). sRGB -> linear -> XYZ (D65) -> CIE Lab,
 * then the 2000 revision of the delta-E formula. Inputs are sRGB 0..255.
 */

import type { ImageLike, MaskRect } from "./maskIoU";

export type Rgb = readonly [number, number, number];

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export interface Lab {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

export function rgbToLab(rgb: Rgb): Lab {
  const r = srgbToLinear(rgb[0]);
  const g = srgbToLinear(rgb[1]);
  const b = srgbToLinear(rgb[2]);
  // sRGB D65
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function deltaE2000Lab(a: Lab, b: Lab): number {
  const avgL = (a.l + b.l) / 2;
  const c1 = Math.hypot(a.a, a.b);
  const c2 = Math.hypot(b.a, b.b);
  const avgC = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(Math.pow(avgC, 7) / (Math.pow(avgC, 7) + Math.pow(25, 7))));
  const a1p = a.a * (1 + g);
  const a2p = b.a * (1 + g);
  const c1p = Math.hypot(a1p, a.b);
  const c2p = Math.hypot(a2p, b.b);
  const avgCp = (c1p + c2p) / 2;
  const h1p = Math.atan2(a.b, a1p) + (Math.atan2(a.b, a1p) < 0 ? 2 * Math.PI : 0);
  const h2p = Math.atan2(b.b, a2p) + (Math.atan2(b.b, a2p) < 0 ? 2 * Math.PI : 0);
  const avgHp =
    c1p === 0 || c2p === 0 ? h1p + h2p : Math.abs(h1p - h2p) > Math.PI ? (h1p + h2p + 2 * Math.PI) / 2 : (h1p + h2p) / 2;
  const t =
    1 -
    0.17 * Math.cos(avgHp - Math.PI / 6) +
    0.24 * Math.cos(2 * avgHp) +
    0.32 * Math.cos(3 * avgHp + Math.PI / 30) -
    0.2 * Math.cos(4 * avgHp - (21 * Math.PI) / 60);
  const dLp = b.l - a.l;
  const dCp = c2p - c1p;
  const dhp = c1p === 0 || c2p === 0 ? 0 : Math.abs(h2p - h1p) <= Math.PI ? h2p - h1p : h2p <= h1p ? h2p - h1p + 2 * Math.PI : h2p - h1p - 2 * Math.PI;
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin(dhp / 2);
  const sl = 1 + (0.015 * Math.pow(avgL - 50, 2)) / Math.sqrt(20 + Math.pow(avgL - 50, 2));
  const sc = 1 + 0.045 * avgCp;
  const sh = 1 + 0.015 * avgCp * t;
  const dTheta = (Math.PI / 6) * Math.exp(-Math.pow((avgHp - (275 * Math.PI) / 180) / (Math.PI / 6), 2));
  const rc = 2 * Math.sqrt(Math.pow(avgCp, 7) / (Math.pow(avgCp, 7) + Math.pow(25, 7)));
  const rt = -rc * Math.sin(2 * dTheta);
  return Math.sqrt(Math.pow(dLp / sl, 2) + Math.pow(dCp / sc, 2) + Math.pow(dHp / sh, 2) + rt * (dCp / sc) * (dHp / sh));
}

export function deltaE2000(a: Rgb, b: Rgb): number {
  return deltaE2000Lab(rgbToLab(a), rgbToLab(b));
}

export interface DeltaEStats {
  readonly mean: number;
  readonly max: number;
  readonly p95: number;
  readonly pixels: number;
}

/** Per-pixel deltaE2000 stats over a normalized region. */
export function regionDeltaE2000Stats(a: ImageLike, b: ImageLike, region?: MaskRect): DeltaEStats {
  const x0 = region ? Math.max(0, Math.floor(region.x * a.width)) : 0;
  const y0 = region ? Math.max(0, Math.floor(region.y * a.height)) : 0;
  const x1 = region ? Math.min(a.width, Math.ceil((region.x + region.w) * a.width)) : a.width;
  const y1 = region ? Math.min(a.height, Math.ceil((region.y + region.h) * a.height)) : a.height;
  const deltas: number[] = [];
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const o = (y * a.width + x) * 4;
      deltas.push(deltaE2000([a.data[o]!, a.data[o + 1]!, a.data[o + 2]!], [b.data[o]!, b.data[o + 1]!, b.data[o + 2]!]));
    }
  }
  if (deltas.length === 0) return { mean: 0, max: 0, p95: 0, pixels: 0 };
  deltas.sort((m, n) => m - n);
  const mean = deltas.reduce((s, v) => s + v, 0) / deltas.length;
  return { mean, max: deltas[deltas.length - 1]!, p95: deltas[Math.floor(0.95 * (deltas.length - 1))]!, pixels: deltas.length };
}
