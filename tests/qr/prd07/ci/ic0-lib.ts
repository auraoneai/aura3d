// 07-IC0 (PRD-07 §22.3, FINISH-LANE-07 Phase D) — flag-off identity math.
// Pure functions only: sRGB → CIELAB (D65), CIEDE2000 per pixel, the p99
// statistic over a frame, and the per-item verdict against a *measured*
// noise floor. The noise floor is the pairwise flag-off repeat p99 (same
// commit, fresh browser contexts; sentinels.json `$doc`) and is never
// assumed: with no repeat measurement the verdict is `noise-floor-unmeasured`.
//
// The CIEDE2000 formula follows Sharma, Wu & Dalal (2005); the unit test pins
// it to rows of their published test data.

export type Lab = readonly [number, number, number];

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

const XN = 0.95047;
const YN = 1.0;
const ZN = 1.08883;

function labF(t: number): number {
  return t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
}

/** 8-bit sRGB → CIELAB (D65 white, 2° observer). */
export function srgb8ToLab(r: number, g: number, b: number): Lab {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / XN;
  const y = (0.2126729 * R + 0.7151522 * G + 0.0721750 * B) / YN;
  const z = (0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / ZN;
  const fx = labF(x);
  const fy = labF(y);
  const fz = labF(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const DEG = Math.PI / 180;

/** CIEDE2000 colour difference (kL = kC = kH = 1). */
export function ciede2000(lab1: Lab, lab2: Lab): number {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const Cbar7 = Math.pow(Cbar, 7);
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + Math.pow(25, 7))));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const hue = (b: number, ap: number): number => {
    if (b === 0 && ap === 0) return 0;
    const h = Math.atan2(b, ap) / DEG;
    return h < 0 ? h + 360 : h;
  };
  const h1p = hue(b1, a1p);
  const h2p = hue(b2, a2p);
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * DEG);
  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;
  let hbarp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hbarp = (h1p + h2p) / 2;
    else if (h1p + h2p < 360) hbarp = (h1p + h2p + 360) / 2;
    else hbarp = (h1p + h2p - 360) / 2;
  }
  const T = 1
    - 0.17 * Math.cos((hbarp - 30) * DEG)
    + 0.24 * Math.cos(2 * hbarp * DEG)
    + 0.32 * Math.cos((3 * hbarp + 6) * DEG)
    - 0.20 * Math.cos((4 * hbarp - 63) * DEG);
  const dTheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2));
  const Cbarp7 = Math.pow(Cbarp, 7);
  const RC = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + Math.pow(25, 7)));
  const SL = 1 + (0.015 * Math.pow(Lbarp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbarp - 50, 2));
  const SC = 1 + 0.045 * Cbarp;
  const SH = 1 + 0.015 * Cbarp * T;
  const RT = -Math.sin(2 * dTheta * DEG) * RC;
  return Math.sqrt(
    Math.pow(dLp / SL, 2) + Math.pow(dCp / SC, 2) + Math.pow(dHp / SH, 2) + RT * (dCp / SC) * (dHp / SH)
  );
}

export interface RgbaFrame {
  readonly rgba: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/** Value at quantile q (0..1) of an unsorted sample (nearest-rank). */
export function quantile(values: Float64Array | readonly number[], q: number): number {
  const sorted = Float64Array.from(values).sort();
  if (sorted.length === 0) return Number.NaN;
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[rank]!;
}

/**
 * ΔE2000 p99 between two frames of equal size. Identical pixels short-cut to
 * 0 so a flag-off identical frame costs one pass. Frames of different size
 * are an identity failure by definition (returns +Infinity).
 */
export function deltaE2000P99(a: RgbaFrame, b: RgbaFrame): number {
  if (a.width !== b.width || a.height !== b.height) return Number.POSITIVE_INFINITY;
  const n = a.width * a.height;
  const de = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const o = i * 4;
    const r1 = a.rgba[o]!, g1 = a.rgba[o + 1]!, b1 = a.rgba[o + 2]!;
    const r2 = b.rgba[o]!, g2 = b.rgba[o + 1]!, b2 = b.rgba[o + 2]!;
    de[i] = r1 === r2 && g1 === g2 && b1 === b2 ? 0 : ciede2000(srgb8ToLab(r1, g1, b1), srgb8ToLab(r2, g2, b2));
  }
  return quantile(de, 0.99);
}

export type Ic0Status = "pass" | "fail" | "missing" | "noise-floor-unmeasured";

export interface Ic0Item {
  readonly kind: "scene" | "game-shot";
  readonly id: string;
  /** p99 of candidate vs IC-0 baseline. null when a frame is missing. */
  readonly p99: number | null;
  readonly status: Ic0Status;
  readonly detail?: string;
}

/**
 * Noise floor = max pairwise repeat p99 across items (the sentinels.json
 * definition). Returns null when no finite repeat measurement exists.
 */
export function noiseFloorFrom(repeatP99s: readonly number[]): number | null {
  const finite = repeatP99s.filter((v) => Number.isFinite(v));
  return finite.length === 0 ? null : Math.max(...finite);
}

export function ic0Verdict(p99: number | null, noiseFloor: number | null): Ic0Status {
  if (p99 === null) return "missing";
  if (noiseFloor === null) return "noise-floor-unmeasured";
  return p99 <= noiseFloor ? "pass" : "fail";
}

export interface ProviderIdentity {
  readonly ciProvider: string | null;
  readonly runnerImage: string | null;
  readonly browserChannel: string | null;
  readonly gpuRenderer: string | null;
}

/**
 * Program lead ruling (2026-10-10): frames compare only within GitHub
 * macos-14 runs. Same provider = same CI provider, same runner image family
 * (the ImageOS part, e.g. `macos14`), same browser channel and GPU renderer.
 */
export function sameProvider(a: ProviderIdentity, b: ProviderIdentity): { readonly same: boolean; readonly reason?: string } {
  const family = (image: string | null) => (image ?? "").split("/")[0] ?? "";
  if (a.ciProvider !== b.ciProvider) return { same: false, reason: `ciProvider ${a.ciProvider} vs ${b.ciProvider}` };
  if (family(a.runnerImage) !== family(b.runnerImage)) return { same: false, reason: `runnerImage ${a.runnerImage} vs ${b.runnerImage}` };
  if ((a.browserChannel ?? "chromium") !== (b.browserChannel ?? "chromium")) return { same: false, reason: `browserChannel ${a.browserChannel} vs ${b.browserChannel}` };
  if ((a.gpuRenderer ?? "") !== (b.gpuRenderer ?? "")) return { same: false, reason: `gpu ${a.gpuRenderer} vs ${b.gpuRenderer}` };
  return { same: true };
}
