/**
 * GU47 WP-21 BZ-18: one `.cube` grading LUT per descent floor (F1-F6; the Kill House stays ungraded). Each LUT is a
 * luminance-preserving split tone authored here as data: shadows lean to one tint, highlights to the floor's lamp tint,
 * blended at `strength`. The files under `public/aura-assets/luts/` are generated from this table by
 * `scripts/make-luts.ts` (no paid generation, no third-party source; the bytes are pinned by sha256 below and the unit
 * test regenerates and compares them). Presentation only (PRD D8).
 */
import type { AuraAssetRef } from "@aura3d/engine";

export interface FloorLutSpec {
  readonly slot: number;
  readonly file: string;
  readonly shadows: string;
  readonly highlights: string;
  readonly strength: number;
}

/** 17^3 is the common grading size and keeps each file near 100 KB. */
export const BZ_LUT_SIZE = 17;

export const BZ_LUT_SPECS: readonly FloorLutSpec[] = [
  { slot: 0, file: "bz-f1-tungsten.cube", shadows: "#2a3a4a", highlights: "#ffc890", strength: 0.3 },
  { slot: 1, file: "bz-f2-cellar.cube", shadows: "#0e2a2a", highlights: "#b8ffe0", strength: 0.32 },
  { slot: 2, file: "bz-f3-forge.cube", shadows: "#3a1206", highlights: "#ffa860", strength: 0.4 },
  { slot: 3, file: "bz-f4-brass.cube", shadows: "#2a2410", highlights: "#ffe8a0", strength: 0.3 },
  { slot: 4, file: "bz-f5-fluorescent.cube", shadows: "#1a2638", highlights: "#e8f4ff", strength: 0.28 },
  { slot: 5, file: "bz-f6-alarm.cube", shadows: "#0c1430", highlights: "#ff6a50", strength: 0.34 }
];

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const luma = (c: readonly number[]) => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** The graded colour of an input colour (0..1 per channel): luminance kept, chroma pulled toward the tone tint. */
export function gradeColor(c: readonly [number, number, number], spec: FloorLutSpec): [number, number, number] {
  const l = luma(c);
  const s = rgb(spec.shadows), h = rgb(spec.highlights);
  const t = l * l * (3 - 2 * l);
  const tint: [number, number, number] = [s[0] + (h[0] - s[0]) * t, s[1] + (h[1] - s[1]) * t, s[2] + (h[2] - s[2]) * t];
  const tl = Math.max(1e-4, luma(tint));
  const k = spec.strength;
  return [0, 1, 2].map((i) => clamp01(c[i]! + (tint[i]! * (l / tl) - c[i]!) * k)) as [number, number, number];
}

/** The `.cube` text of a spec (red fastest, the Adobe order). */
export function cubeText(spec: FloorLutSpec, size = BZ_LUT_SIZE): string {
  const lines = [`TITLE "Bunker Zero ${spec.file.replace(/\.cube$/, "")}"`, `LUT_3D_SIZE ${size}`, "DOMAIN_MIN 0 0 0", "DOMAIN_MAX 1 1 1"];
  for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) {
    const o = gradeColor([r / (size - 1), g / (size - 1), b / (size - 1)], spec);
    lines.push(o.map((v) => v.toFixed(6)).join(" "));
  }
  return `${lines.join("\n")}\n`;
}

/** sha256 of each generated file (the test regenerates and compares; `scripts/make-luts.ts` prints them). */
export const BZ_LUT_SHA256: Readonly<Record<string, string>> = {
  "bz-f1-tungsten.cube": "2119175d73f3a7d1306d0fd020523b4f238da0ba215e193f8dea39a51c9f22e5",
  "bz-f2-cellar.cube": "57e62dd10ce2192e80de7ac51ab336a031eba77e3d72ee44c991a557b20c5008",
  "bz-f3-forge.cube": "622dafeafab7f7b7d2bfc79e62d64209e107961c4a1ca654768efdbb16468e2e",
  "bz-f4-brass.cube": "2002aa7659d7021ba7a13ba96d13775fc29c574108129302d1a713932db90d1c",
  "bz-f5-fluorescent.cube": "ac6c9721f7fded1d93c7f8eb4eb6e09e5cd1b3c7851a8bc6dbe5a39025dcf4c3",
  "bz-f6-alarm.cube": "58fa1910685848a2ea90c6f426a520b74a166f0663ac4f85b6312f5e3b89fd4b"
};

/**
 * BZ-18 chromatic-aberration pulse on heavy hits: a hit of at least `minDamage` kicks the S10 CA to `peak` and it decays
 * over `seconds`. Off under reduced motion or reduced flash (PRD §6.3/§6.4); the engine drops CA on Low tier.
 */
export const BZ_CA_PULSE = { minDamage: 18, peak: 0.006, seconds: 0.35 } as const;
export function caPulseLevel(secondsSinceHit: number, reduced: boolean): number {
  if (reduced || !(secondsSinceHit >= 0) || secondsSinceHit >= BZ_CA_PULSE.seconds) return 0;
  const t = 1 - secondsSinceHit / BZ_CA_PULSE.seconds;
  return BZ_CA_PULSE.peak * t * t;
}

/** Typed LUT ref of a slot, or null for the Kill House (no LUT). main.ts also skips it with `?lut=0` (the on/off A/B). */
export function lutOfSlot(slot: number): AuraAssetRef<"lut"> | null {
  const spec = BZ_LUT_SPECS.find((s) => s.slot === slot);
  if (!spec) return null;
  return { kind: "aura-asset-ref", id: `bunkerZero.${spec.file}`, type: "lut", url: lutUrlOfSlot(slot), format: "cube", sha256: BZ_LUT_SHA256[spec.file] } as unknown as AuraAssetRef<"lut">;
}

/** URL of a slot's LUT file, or "" for the Kill House (an empty `lut` patch binds no LUT). */
export const lutUrlOfSlot = (slot: number): string => {
  const spec = BZ_LUT_SPECS.find((s) => s.slot === slot);
  return spec ? `/aura-assets/luts/${spec.file}` : "";
};
