/**
 * Pure helpers for the HEATSINK blind A/B judge: seeded presentation order, image statistics (luma histogram, 4-bit
 * colour histogram, dominant palette, edge density), distances between two frames, and the binomial test of the
 * judge's accuracy against chance. No I/O, so the maths is unit tested.
 */

export interface Rgba { width: number; height: number; data: Uint8Array | Uint8ClampedArray }

/** mulberry32: small seeded generator whose seed is recorded with the results */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Assignment { step: number; pass: number; originalIs: "A" | "B" }

/** For each pass and step decide whether the original is shown as A or B, balanced within each pass. */
export function assignOrder(steps: readonly number[], passes: number, seed: number): Assignment[] {
  const out: Assignment[] = [];
  for (let pass = 0; pass < passes; pass++) {
    const rng = seededRng(seed + pass * 7919);
    const labels: ("A" | "B")[] = steps.map((_, i) => (i % 2 === 0 ? "A" : "B"));
    for (let i = labels.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [labels[i], labels[j]] = [labels[j] as "A" | "B", labels[i] as "A" | "B"];
    }
    steps.forEach((step, i) => out.push({ step, pass, originalIs: labels[i] as "A" | "B" }));
  }
  return out;
}

export interface ImageStats {
  lumaHist: number[];
  rgbHist: number[];
  palette: { rgb: [number, number, number]; share: number }[];
  edgeDensity: number;
  lumaMean: number;
}

const LUMA_BINS = 32;

export function imageStats(img: Rgba): ImageStats {
  const { width, height, data } = img;
  const n = width * height;
  const lumaHist = new Array<number>(LUMA_BINS).fill(0);
  const rgbHist = new Array<number>(4096).fill(0);
  const luma = new Float32Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const r = data[i * 4] as number, g = data[i * 4 + 1] as number, b = data[i * 4 + 2] as number;
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    luma[i] = l;
    sum += l;
    lumaHist[Math.min(LUMA_BINS - 1, Math.floor((l / 256) * LUMA_BINS))]!++;
    rgbHist[((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)]!++;
  }
  for (let i = 0; i < LUMA_BINS; i++) lumaHist[i]! /= n;
  for (let i = 0; i < 4096; i++) rgbHist[i]! /= n;
  const palette = rgbHist
    .map((share, idx) => ({ idx, share }))
    .filter((c) => c.share > 0)
    .sort((a, b) => b.share - a.share)
    .slice(0, 8)
    .map(({ idx, share }) => ({ rgb: [((idx >> 8) & 15) * 17, ((idx >> 4) & 15) * 17, (idx & 15) * 17] as [number, number, number], share }));
  let edges = 0, counted = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const gx = -luma[i - width - 1]! - 2 * luma[i - 1]! - luma[i + width - 1]! + luma[i - width + 1]! + 2 * luma[i + 1]! + luma[i + width + 1]!;
      const gy = -luma[i - width - 1]! - 2 * luma[i - width]! - luma[i - width + 1]! + luma[i + width - 1]! + 2 * luma[i + width]! + luma[i + width + 1]!;
      if (Math.hypot(gx, gy) > 96) edges++;
      counted++;
    }
  }
  return { lumaHist, rgbHist, palette, edgeDensity: counted ? edges / counted : 0, lumaMean: sum / n };
}

/** Jensen-Shannon divergence (base 2, so 0..1) between two normalised histograms */
export function jsDivergence(p: readonly number[], q: readonly number[]): number {
  let d = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i] as number, b = q[i] as number, m = (a + b) / 2;
    if (a > 0) d += 0.5 * a * Math.log2(a / m);
    if (b > 0) d += 0.5 * b * Math.log2(b / m);
  }
  return d;
}

/** Share-weighted mean distance (0..1, normalised by the RGB diagonal) from each dominant colour to the nearest in the other palette, both directions averaged. */
export function paletteDistance(a: ImageStats["palette"], b: ImageStats["palette"]): number {
  const diag = Math.sqrt(3 * 255 * 255);
  const one = (x: ImageStats["palette"], y: ImageStats["palette"]): number => {
    const total = x.reduce((s, c) => s + c.share, 0) || 1;
    let acc = 0;
    for (const c of x) {
      let best = Infinity;
      for (const o of y) best = Math.min(best, Math.hypot(c.rgb[0] - o.rgb[0], c.rgb[1] - o.rgb[1], c.rgb[2] - o.rgb[2]));
      acc += (c.share / total) * best;
    }
    return acc / diag;
  };
  return (one(a, b) + one(b, a)) / 2;
}

export interface FrameDistance { lumaJsd: number; rgbJsd: number; paletteDistance: number; edgeDensityOriginal: number; edgeDensityPort: number; edgeDensityRatio: number; lumaMeanDelta: number }

export function frameDistance(original: ImageStats, port: ImageStats): FrameDistance {
  return {
    lumaJsd: jsDivergence(original.lumaHist, port.lumaHist),
    rgbJsd: jsDivergence(original.rgbHist, port.rgbHist),
    paletteDistance: paletteDistance(original.palette, port.palette),
    edgeDensityOriginal: original.edgeDensity,
    edgeDensityPort: port.edgeDensity,
    edgeDensityRatio: original.edgeDensity > 0 ? port.edgeDensity / original.edgeDensity : NaN,
    lumaMeanDelta: port.lumaMean - original.lumaMean
  };
}

/** exact two-sided binomial p-value for k successes in n trials at success probability 0.5 */
export function binomialTwoSided(k: number, n: number): number {
  if (n === 0) return 1;
  const logChoose = (a: number, b: number): number => { let s = 0; for (let i = 1; i <= b; i++) s += Math.log((a - b + i) / i); return s; };
  const pmf = (i: number): number => Math.exp(logChoose(n, i) - n * Math.log(2));
  const observed = pmf(k);
  let p = 0;
  for (let i = 0; i <= n; i++) { const v = pmf(i); if (v <= observed * (1 + 1e-9)) p += v; }
  return Math.min(1, p);
}

/** 95% Wilson score interval */
export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = k / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

export interface Trial { step: number; pass: number; look: string; originalIs: "A" | "B"; picked: "A" | "B" | null; sameGame: boolean | null; sameGameConfidence: number | null; originalConfidence: number | null; tells: string[]; error?: string }

export interface JudgeSummary {
  trials: number;
  valid: number;
  correct: number;
  accuracy: number;
  ci95: [number, number];
  pValueVsChance: number;
  distinguishable: boolean;
  sameGameYes: number;
  sameGameRate: number;
  pickedA: number;
  byLook: Record<string, { valid: number; correct: number; accuracy: number }>;
}

/** the task's honesty rule: more than 70% identification of the original means the port is distinguishable */
export const DISTINGUISHABLE_THRESHOLD = 0.7;

export function summarize(trials: readonly Trial[]): JudgeSummary {
  const valid = trials.filter((t) => t.picked !== null);
  const correct = valid.filter((t) => t.picked === t.originalIs).length;
  const accuracy = valid.length ? correct / valid.length : NaN;
  const sameKnown = trials.filter((t) => t.sameGame !== null);
  const sameYes = sameKnown.filter((t) => t.sameGame).length;
  const byLook: JudgeSummary["byLook"] = {};
  for (const t of valid) {
    const e = (byLook[t.look] ??= { valid: 0, correct: 0, accuracy: 0 });
    e.valid++;
    if (t.picked === t.originalIs) e.correct++;
  }
  for (const e of Object.values(byLook)) e.accuracy = e.valid ? e.correct / e.valid : NaN;
  return {
    trials: trials.length,
    valid: valid.length,
    correct,
    accuracy,
    ci95: wilson(correct, valid.length),
    pValueVsChance: binomialTwoSided(correct, valid.length),
    distinguishable: accuracy > DISTINGUISHABLE_THRESHOLD,
    sameGameYes: sameYes,
    sameGameRate: sameKnown.length ? sameYes / sameKnown.length : NaN,
    pickedA: valid.filter((t) => t.picked === "A").length,
    byLook
  };
}

/** pulls the first JSON object out of a model reply (it may wrap it in prose or a code fence) */
export function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>; } catch { return null; }
}

/**
 * `@@HEATSINK_FRAME <step> <base64 jpeg>` records from a remote log. ACR wraps very long lines and interleaves the tool's
 * timestamped stderr lines (`[12.3s] ...`) into them, so those are stripped first, the base64 is read across line breaks
 * and each frame is cut at the JPEG end-of-image marker.
 */
export function parseFrameLines(log: string): Map<number, Buffer> {
  const out = new Map<number, Buffer>();
  const cleaned = log.replace(/\[\d+(?:\.\d)?s\][^\r\n]*/g, "");
  for (const m of cleaned.matchAll(/@@HEATSINK_FRAME (\d+) ([A-Za-z0-9+/=\r\n]+)/g)) {
    const raw = Buffer.from((m[2] as string).replace(/[\r\n]/g, ""), "base64");
    if (raw[0] !== 0xff || raw[1] !== 0xd8) continue;
    let end = -1;
    for (let i = 2; i < raw.length - 1; i++) if (raw[i] === 0xff && raw[i + 1] === 0xd9) { end = i + 2; break; }
    if (end > 0) out.set(Number(m[1]), raw.subarray(0, end));
  }
  return out;
}
