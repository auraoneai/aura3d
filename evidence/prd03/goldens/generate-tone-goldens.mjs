/**
 * Generate independent equation references for the Aura3D output operators.
 * Run with `node evidence/prd03/goldens/generate-tone-goldens.mjs`.
 *
 * This program imports neither the renderer nor another engine. The formulas
 * come from Reinhard et al. (2002), Stephen Hill's published ACES RRT/ODT fit,
 * the published AgX log-domain contrast fit, and Khronos PBR Neutral. The ACES
 * viewing scale 1/0.6 is the existing Aura3D presentation contract. Calculated
 * values are rounded to eight decimal places; the tests allow 1e-6.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const clip = (x) => Math.max(0, Math.min(1, x));
const times = (a, b) => a.map((x) => x * b);
const vectorMatrix = (v, rows) => rows.map((row) => row.reduce((sum, n, i) => sum + n * v[i], 0));
const fitted = (x) => (x * x + 0.0245786 * x - 0.000090537) / (0.983729 * x * x + 0.432951 * x + 0.238081);

const matrices = {
  acesInput: [[0.59719, 0.35458, 0.04823], [0.076, 0.90834, 0.01566], [0.0284, 0.13383, 0.83777]],
  acesOutput: [[1.60475, -0.53108, -0.07367], [-0.10208, 1.10813, -0.00605], [-0.00327, -0.07276, 1.07602]],
  wideInput: [[0.6274, 0.3293, 0.0433], [0.0691, 0.9195, 0.0113], [0.0164, 0.088, 0.8956]],
  wideOutput: [[1.6605, -0.5876, -0.0728], [-0.1246, 1.1329, -0.0083], [-0.0182, -0.1006, 1.1187]],
  inset: [
    [0.856627153315983, 0.0951212405381588, 0.0482516061458583],
    [0.137318972929847, 0.761241990602591, 0.101439036467562],
    [0.11189821299995, 0.0767994186031903, 0.811302368396859]
  ],
  outset: [
    [1.1271005818144368, -0.11060664309660323, -0.016493938717834573],
    [-0.1413297634984383, 1.157823702216272, -0.016493938717834257],
    [-0.14132976349843826, -0.11060664309660294, 1.2519364065950405]
  ]
};

function linear(rgb, exposure) {
  return times(rgb, exposure).map(clip);
}
function reinhard(rgb, exposure) {
  return times(rgb, exposure).map((x) => clip(x / (1 + x)));
}
function aces(rgb, exposure) {
  const working = vectorMatrix(times(rgb, exposure / 0.6), matrices.acesInput);
  return vectorMatrix(working.map(fitted), matrices.acesOutput).map(clip);
}
function agx(rgb, exposure) {
  const wide = vectorMatrix(times(rgb, exposure), matrices.wideInput);
  const inset = vectorMatrix(wide, matrices.inset);
  const polynomial = [-0.00232, 0.1191, 0.4298, -6.868, 31.96, -40.14, 15.5];
  const curved = inset.map((v) => {
    const normalized = clip((Math.log2(Math.max(v, 1e-10)) + 12.47393) / 16.499999);
    return polynomial.reduce((sum, coefficient, power) => sum + coefficient * normalized ** power, 0);
  });
  const output = vectorMatrix(curved, matrices.outset).map((x) => Math.max(x, 0) ** 2.2);
  return vectorMatrix(output, matrices.wideOutput).map(clip);
}
function neutral(rgb, exposure) {
  const exposed = times(rgb, exposure);
  const least = Math.min(...exposed);
  const offset = least < 0.08 ? least - 6.25 * least * least : 0.04;
  const shifted = exposed.map((value) => value - offset);
  const peak = Math.max(...shifted);
  const compressionStart = 0.76;
  if (peak < compressionStart) return shifted;
  const shoulder = 1 - compressionStart;
  const compressed = 1 - shoulder ** 2 / (peak + shoulder - compressionStart);
  const desaturation = 1 - 1 / (1 + 0.15 * (peak - compressed));
  return shifted.map((value) => value * compressed / peak * (1 - desaturation) + compressed * desaturation);
}

const curves = { linear, reinhard, aces, agx, neutral };
const cases = [];
for (const value of [0, 1e-4, 1e-3, 0.005, 0.01, 0.02, 0.05, 0.08, 0.1, 0.18, 0.25, 0.36, 0.5, 0.64, 0.76, 1, 1.4, 2, 4, 8]) {
  cases.push({ label: `gray-${value}`, rgb: [value, value, value] });
}
for (const value of [0.01, 0.1, 0.18, 0.35, 0.5, 0.75, 1, 2, 8, 32]) {
  for (let channel = 0; channel < 3; channel++) {
    const rgb = [0, 0, 0];
    rgb[channel] = value;
    cases.push({ label: `${"rgb"[channel]}-${value}`, rgb });
  }
}
for (const [label, rgb] of [
  ["warm-mid", [0.9, 0.55, 0.2]], ["cool-mid", [0.12, 0.4, 0.9]], ["neon-magenta", [1.4, 0.05, 1.1]],
  ["teal-shadow", [0.02, 0.09, 0.1]], ["fire-hdr", [6, 1.8, 0.4]], ["snow-hdr", [3.2, 3.4, 3.8]],
  ["sunset", [1.2, 0.4, 0.08]], ["foliage", [0.08, 0.5, 0.15]], ["skin", [0.62, 0.42, 0.32]],
  ["deep-ocean", [0.01, 0.05, 0.3]], ["emissive-blue", [0.02, 0.3, 4]], ["brass", [0.7, 0.45, 0.12]],
  ["flare-white", [12, 10, 8]], ["near-black", [0.002, 0.0015, 0.001]]
]) cases.push({ label, rgb });
if (cases.length !== 64) throw new Error(`Expected 64 input vectors; got ${cases.length}.`);

const rounded = (v) => v.map((value) => Number(value.toFixed(8)));
const operators = Object.fromEntries(Object.entries(curves).map(([name, curve]) =>
  [name, cases.map(({ rgb }) => rounded(curve(rgb, 1)))]));
const exposures = [0.5, 1.6];
const exposureSweep = {
  operator: "aces",
  exposures,
  cases: cases.slice(0, 8).map(({ rgb }) => ({ rgb, out: exposures.map((exposure) => rounded(aces(rgb, exposure))) }))
};
const result = {
  schema: "prd03/tone-operators@1",
  source: "Independent published-equation reference: Reinhard 2002; Hill ACES RRT/ODT fit; AgX log/contrast fit; Khronos PBR Neutral. JS double, 8 decimals; ACES view scale 1/0.6.",
  exposure: 1,
  cases,
  operators,
  exposureSweep
};
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), "tone-operators.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(`Generated ${cases.length} input vectors for ${Object.keys(curves).length} independent tone equations.`);
