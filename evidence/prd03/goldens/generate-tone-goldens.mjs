/**
 * PRD-03 — tone-operator golden generator.
 *
 *   pnpm exec tsx --tsconfig tsconfig.base.json evidence/prd03/goldens/generate-tone-goldens.mjs
 *
 * Writes `tone-operators.json`: 64 input triples × the five output operators
 * (linear, reinhard, aces, agx, neutral) at exposure 1, plus an 8-case ACES
 * exposure sweep. Two independent implementations are computed:
 *
 *   - `port`:     the shipped `post/ToneOperators.ts` port.
 *   - `reference`: a second implementation below, re-derived from the three r185
 *                  GLSL chunk with a different structure (component loops over
 *                  math.mjs-style helpers instead of the port's Vec3 ops).
 *
 * The run fails if they disagree beyond float error — the goldens therefore
 * pin the *math*, not a bug.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { applyToneOperator, POST_TONE_OPERATORS } from "../../../../packages/rendering/src/post/ToneOperators.ts";

const here = dirname(fileURLToPath(import.meta.url));

/* ---------------- independent reference (from the GLSL source) ------------ */

const saturate3 = (c) => c.map((x) => Math.min(1, Math.max(0, x)));

// GLSL `mat3 * vec3` expanded row-wise; matrices stored row-major below.
const mv = (rows, v) => rows.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);

// Row-major transposes of the GLSL column-major literals.
const ACES_IN = [
  [0.59719, 0.35458, 0.04823],
  [0.07600, 0.90834, 0.01566],
  [0.02840, 0.13383, 0.83777]
];
const ACES_OUT = [
  [1.60475, -0.53108, -0.07367],
  [-0.10208, 1.10813, -0.00605],
  [-0.00327, -0.07276, 1.07602]
];
const R2020_TO_SRGB = [
  [1.6605, -0.5876, -0.0728],
  [-0.1246, 1.1329, -0.0083],
  [-0.0182, -0.1006, 1.1187]
];
const SRGB_TO_R2020 = [
  [0.6274, 0.3293, 0.0433],
  [0.0691, 0.9195, 0.0113],
  [0.0164, 0.0880, 0.8956]
];
const AGX_INSET = [
  [0.856627153315983, 0.0951212405381588, 0.0482516061458583],
  [0.137318972929847, 0.761241990602591, 0.101439036467562],
  [0.11189821299995, 0.0767994186031903, 0.811302368396859]
];
const AGX_OUTSET = [
  [1.1271005818144368, -0.11060664309660323, -0.016493938717834573],
  [-0.1413297634984383, 1.157823702216272, -0.016493938717834257],
  [-0.14132976349843826, -0.11060664309660294, 1.2519364065950405]
];

const ref = {
  linear: (c, e) => saturate3(c.map((x) => x * e)),
  reinhard: (c, e) => saturate3(c.map((x) => { const v = x * e; return v / (1 + v); })),
  aces: (c, e) => {
    let v = c.map((x) => (x * e) / 0.6);
    v = mv(ACES_IN, v);
    v = v.map((x) => (x * (x + 0.0245786) - 0.000090537) / (x * (0.983729 * x + 0.432951) + 0.238081));
    v = mv(ACES_OUT, v);
    return saturate3(v);
  },
  agx: (c, e) => {
    let v = c.map((x) => x * e);
    v = mv(SRGB_TO_R2020, v);
    v = mv(AGX_INSET, v);
    v = v.map((x) => Math.max(x, 1e-10));
    v = v.map(Math.log2);
    const [mn, mx] = [-12.47393, 4.026069];
    v = v.map((x) => Math.min(1, Math.max(0, (x - mn) / (mx - mn))));
    v = v.map((x) => 15.5 * x ** 6 - 40.14 * x ** 5 + 31.96 * x ** 4 - 6.868 * x ** 3 + 0.4298 * x ** 2 + 0.1191 * x - 0.00232);
    v = mv(AGX_OUTSET, v);
    v = v.map((x) => Math.pow(Math.max(0, x), 2.2));
    v = mv(R2020_TO_SRGB, v);
    return v.map((x) => Math.min(1, Math.max(0, x)));
  },
  neutral: (c, e) => {
    const color = c.map((x) => x * e);
    const x = Math.min(color[0], Math.min(color[1], color[2]));
    const offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
    const cc = color.map((v) => v - offset);
    const peak = Math.max(cc[0], Math.max(cc[1], cc[2]));
    if (peak < 0.76) return cc;
    const d = 0.24;
    const newPeak = 1 - (d * d) / (peak + d - 0.76);
    const scaled = cc.map((v) => (v * newPeak) / peak);
    const g = 1 - 1 / (0.15 * (peak - newPeak) + 1);
    return scaled.map((v) => v + (newPeak - v) * g);
  }
};

/* ------------------------------ cases ------------------------------------ */

const cases = [];
const push = (label, rgb) => cases.push({ label, rgb });

// achromatic ramp — 20 stops incl. mid-gray and deep HDR
for (const v of [0, 1e-4, 1e-3, 0.005, 0.01, 0.02, 0.05, 0.08, 0.1, 0.18, 0.25, 0.36, 0.5, 0.64, 0.76, 1, 1.4, 2, 4, 8]) {
  push(`gray-${v}`, [v, v, v]);
}
// per-channel ramps
for (const v of [0.01, 0.1, 0.18, 0.35, 0.5, 0.75, 1, 2, 8, 32]) {
  push(`r-${v}`, [v, 0, 0]);
  push(`g-${v}`, [0, v, 0]);
  push(`b-${v}`, [0, 0, v]);
}
// mixed + saturated
for (const [label, rgb] of [
  ["warm-mid", [0.9, 0.55, 0.2]],
  ["cool-mid", [0.12, 0.4, 0.9]],
  ["neon-magenta", [1.4, 0.05, 1.1]],
  ["teal-shadow", [0.02, 0.09, 0.1]],
  ["fire-hdr", [6, 1.8, 0.4]],
  ["snow-hdr", [3.2, 3.4, 3.8]],
  ["sunset", [1.2, 0.4, 0.08]],
  ["foliage", [0.08, 0.5, 0.15]],
  ["skin", [0.62, 0.42, 0.32]],
  ["deep-ocean", [0.01, 0.05, 0.3]],
  ["emissive-blue", [0.02, 0.3, 4]],
  ["brass", [0.7, 0.45, 0.12]],
  ["flare-white", [12, 10, 8]],
  ["near-black", [0.002, 0.0015, 0.001]]
]) push(label, rgb);

if (cases.length !== 64) throw new Error(`expected 64 cases, got ${cases.length}`);

/* ------------------------------ generate --------------------------------- */

const TOL = 1e-7;
const operators = {};
for (const op of POST_TONE_OPERATORS) {
  const rows = cases.map(({ rgb }) => {
    const p = applyToneOperator(op, rgb, 1);
    const r = ref[op](rgb, 1);
    for (let i = 0; i < 3; i += 1) {
      if (Math.abs(p[i] - r[i]) > TOL) {
        throw new Error(`${op} disagrees with reference on ${rgb}: ${p} vs ${r}`);
      }
    }
    return [Number(p[0].toFixed(8)), Number(p[1].toFixed(8)), Number(p[2].toFixed(8))];
  });
  operators[op] = rows;
}

const exposureSweep = {
  operator: "aces",
  exposures: [0.5, 1.6],
  cases: cases.slice(0, 8).map(({ rgb }) => ({
    rgb,
    out: [0.5, 1.6].map((exposure) => {
      const p = applyToneOperator("aces", rgb, exposure);
      const r = ref.aces(rgb, exposure);
      for (let i = 0; i < 3; i += 1) {
        if (Math.abs(p[i] - r[i]) > TOL) throw new Error(`aces@${exposure} disagrees on ${rgb}`);
      }
      return [Number(p[0].toFixed(8)), Number(p[1].toFixed(8)), Number(p[2].toFixed(8))];
    })
  }))
};

const doc = {
  schema: "prd03/tone-operators@1",
  source: "three@0.185.1 tonemapping_pars_fragment.glsl.js (CPU port; exposure applied inside each operator)",
  exposure: 1,
  cases: cases.map(({ label, rgb }) => ({ label, rgb })),
  operators,
  exposureSweep
};

writeFileSync(join(here, "tone-operators.json"), `${JSON.stringify(doc, null, 2)}\n`);
console.log(`wrote tone-operators.json: ${cases.length} cases × ${POST_TONE_OPERATORS.length} operators + ${exposureSweep.exposures.length}-exposure ACES sweep`);
