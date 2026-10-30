#!/usr/bin/env node
/**
 * GU47 WP-11 (G01) TT-P3: the six venue grading LUTs for Aura Slam, authored deterministically (no download, no paid
 * generation). Run from the repo root:
 *
 *   node examples/aura-slam/tools/gen-luts.mjs
 *
 * Writes examples/aura-slam/assets/luts/slam-<venue>.cube (LUT_3D_SIZE 17, display-referred 0..1 RGB, red fastest) and
 * prints each file's bytes and sha256 for the asset table in view/assets.ts.
 *
 * Each venue LUT is a split tone (a shadow tint fading out by mid-grey, a highlight tint fading in above it), a soft
 * S-curve and a saturation trim, so the six venues read as different hours and climates on top of the shared
 * contrast/saturation grade:
 *   hard   New York night: blue-teal shadows, cold-white highlights, deeper blacks.
 *   grass  London morning: green-leaning mids, cream highlights, gentle curve.
 *   clay   Paris golden hour: teal shadows, orange highlights (the warm/cool split of raking sun).
 *   desert Dubai noon: lifted, bleached blacks, yellow-white highlights, less saturation.
 *   beach  sunset: violet shadows, magenta-coral highlights.
 *   moon   lunar day: near-neutral, cold, hard curve, desaturated.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "../assets/luts");

export const LUT_SIZE = 17;

/**
 * Per-venue grade recipe. `shadow` / `highlight`: RGB offsets added at full weight (shadow weight (1 - 2L)^2 below mid-grey,
 * highlight weight (2L - 1)^2 above it). `curve`: S-curve strength (0 = linear). `saturation`: multiplier around luma.
 * `lift`: black level raise.
 */
export const VENUE_LUT_RECIPES = {
  hard: { shadow: [-0.05, 0.03, 0.15], highlight: [-0.04, 0.0, 0.06], curve: 0.42, saturation: 1.0, lift: 0 },
  grass: { shadow: [-0.03, 0.06, 0.0], highlight: [0.0, 0.08, -0.04], curve: 0.24, saturation: 1.08, lift: 0.01 },
  clay: { shadow: [-0.05, 0.03, 0.08], highlight: [0.11, 0.02, -0.08], curve: 0.22, saturation: 1.08, lift: 0 },
  desert: { shadow: [0.03, 0.02, 0.0], highlight: [0.05, 0.05, -0.07], curve: 0.06, saturation: 0.88, lift: 0.04 },
  beach: { shadow: [0.06, -0.03, 0.11], highlight: [0.1, -0.04, 0.04], curve: 0.18, saturation: 1.1, lift: 0.01 },
  moon: { shadow: [-0.01, 0.0, 0.03], highlight: [-0.01, 0.0, 0.02], curve: 0.3, saturation: 0.78, lift: 0 }
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** One graded colour for a display-referred input (all channels 0..1). */
export function gradeColor(recipe, r, g, b) {
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Saturation around luma.
  let c = [r, g, b].map((v) => luma + (v - luma) * recipe.saturation);
  // Soft S-curve: blend toward smoothstep by `curve`.
  c = c.map((v) => {
    const x = clamp01(v);
    const s = x * x * (3 - 2 * x);
    return x + (s - x) * recipe.curve;
  });
  // Split tone weighted by the input luma.
  const ws = luma < 0.5 ? (1 - 2 * luma) ** 2 : 0;
  const wh = luma > 0.5 ? (2 * luma - 1) ** 2 : 0;
  return c.map((v, i) => clamp01(recipe.lift + v * (1 - recipe.lift) + recipe.shadow[i] * ws + recipe.highlight[i] * wh));
}

/** The .cube text for one venue (red varies fastest, as the format requires). */
export function venueLutCube(venue, size = LUT_SIZE) {
  const recipe = VENUE_LUT_RECIPES[venue];
  if (!recipe) throw new Error(`unknown venue ${venue}`);
  const lines = [
    `TITLE "Aura Slam ${venue}"`,
    "# GU47 TT-P3, authored by examples/aura-slam/tools/gen-luts.mjs (CC0-1.0)",
    `LUT_3D_SIZE ${size}`,
    "DOMAIN_MIN 0 0 0",
    "DOMAIN_MAX 1 1 1"
  ];
  const n = size - 1;
  for (let bi = 0; bi < size; bi++) {
    for (let gi = 0; gi < size; gi++) {
      for (let ri = 0; ri < size; ri++) {
        const out = gradeColor(recipe, ri / n, gi / n, bi / n);
        lines.push(out.map((v) => v.toFixed(4)).join(" "));
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

function main() {
  mkdirSync(outDir, { recursive: true });
  for (const venue of Object.keys(VENUE_LUT_RECIPES)) {
    const text = venueLutCube(venue);
    const file = resolve(outDir, `slam-${venue}.cube`);
    writeFileSync(file, text);
    const bytes = Buffer.byteLength(text);
    process.stdout.write(`${JSON.stringify({ file: `examples/aura-slam/assets/luts/slam-${venue}.cube`, bytes, sha256: createHash("sha256").update(text).digest("hex") })}\n`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
