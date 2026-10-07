// PRD-07 P3-T1 — preethamEvaluate matches the three.js r185 `Sky.js`
// fragment shader (MIT), transcribed here as an independent reference.
// The lane's implementation returns r185's linear `texColor` (pre-exposure),
// so this test compares exactly that value at 16 sky-hemisphere directions.
// For daytime suns the lane's sunfade adaptation and r185's own expression
// both evaluate to 1.0, so the comparison holds exactly.

import { describe, expect, it } from "vitest";
import { preethamEvaluate, preethamFrame, sunDirection, type PreethamSpec, type Vec3 } from "../../../../packages/rendering/src/atmosphere/PreethamSky";

// --- three.js r185 Sky.js reference (MIT), transcribed for comparison ------

const E_R185 = 2.71828182845904523536028747135266249775724709369995957;
const PI_R185 = Math.PI;
const TOTAL_RAYLEIGH: Vec3 = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
const MIE_CONST: Vec3 = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
const CUTOFF = PI_R185 / 1.95;
const STEEP = 1.5;
const EE_R185 = 1000.0;
const RAY_ZEN = 8.4e3;
const MIE_ZEN = 1.25e3;
const SUN_COS = 0.999956676946448443553574619906976478926848692873900859324;

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function norm(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function mul3(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}
function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function div3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] / b[0], a[1] / b[1], a[2] / b[2]];
}
function pow3(v: Vec3, p: number): Vec3 {
  return [Math.pow(Math.max(0, v[0]), p), Math.pow(Math.max(0, v[1]), p), Math.pow(Math.max(0, v[2]), p)];
}
function mixv(t: number, a: Vec3, b: Vec3): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function clampv(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
function smoothstepR(e0: number, e1: number, x: number): number {
  const t = clampv((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** r185 vertex-shader varyings, given a unit sun direction. */
function r185Varyings(sunDir: Vec3, turbidity: number, rayleigh: number, mieCoefficient: number) {
  const up: Vec3 = [0, 1, 0];
  const zenithCos = clampv(dot3(sunDir, up), -1, 1);
  const vSunE = EE_R185 * Math.max(0, 1 - Math.pow(E_R185, -((CUTOFF - Math.acos(zenithCos)) / STEEP)));
  // r185: exp(sunPosition.y / 450000) with a unit sun ≈ exp(±1e-6) ≈ 1 → fade ≈ 1.
  const vSunfade = 1 - clampv(1 - Math.exp(sunDir[1] / 450000), 0, 1);
  const rayleighCoefficient = rayleigh - 1 * (1 - vSunfade);
  const vBetaR = mul3(TOTAL_RAYLEIGH, rayleighCoefficient);
  const c = 0.2 * turbidity * 10e-18;
  const totalMie = mul3(MIE_CONST, 0.434 * c);
  const vBetaM = mul3(totalMie, mieCoefficient);
  return { vSunE, vSunfade, vBetaR, vBetaM };
}

/** r185 fragment shader: the linear `texColor` before tone mapping. */
function r185TexColor(
  v: { vSunE: number; vSunfade: number; vBetaR: Vec3; vBetaM: Vec3 },
  mieDirectionalG: number,
  worldDirection: Vec3
): Vec3 {
  const up: Vec3 = [0, 1, 0];
  const sunDir: Vec3 = varyingsSunDir;
  const direction = norm(worldDirection);
  const zenithAngle = Math.acos(Math.max(0, dot3(up, direction)));
  const inv = 1 / (Math.cos(zenithAngle) + 0.15 * Math.pow(93.885 - ((zenithAngle * 180) / PI_R185), -1.253));
  const sR = RAY_ZEN * inv;
  const sM = MIE_ZEN * inv;
  const Fex: Vec3 = [
    Math.exp(-(v.vBetaR[0] * sR + v.vBetaM[0] * sM)),
    Math.exp(-(v.vBetaR[1] * sR + v.vBetaM[1] * sM)),
    Math.exp(-(v.vBetaR[2] * sR + v.vBetaM[2] * sM))
  ];
  const cosTheta = dot3(direction, sunDir);
  // r185: rayleighPhase(cosTheta*0.5+0.5) = 3/(16π)·(1 + p²), p=(cosθ+1)/2
  const p = cosTheta * 0.5 + 0.5;
  const rPhase = (3 / (16 * PI_R185)) * (1 + p * p);
  const betaRTheta = mul3(v.vBetaR, rPhase);
  const g = mieDirectionalG;
  const g2 = g * g;
  const mPhase = (1 / (4 * PI_R185)) * ((1 - g2) / Math.pow(1 - 2 * g * cosTheta + g2, 1.5));
  const betaMTheta = mul3(v.vBetaM, mPhase);
  const ratio = div3(add3(betaRTheta, betaMTheta), add3(v.vBetaR, v.vBetaM));
  // Lin = pow(sunE * ratio * (1 - Fex), 1.5)
  let Lin = pow3(
    [v.vSunE * ratio[0] * (1 - Fex[0]), v.vSunE * ratio[1] * (1 - Fex[1]), v.vSunE * ratio[2] * (1 - Fex[2])],
    1.5
  );
  const lin2 = pow3(mul3([ratio[0] * Fex[0], ratio[1] * Fex[1], ratio[2] * Fex[2]], v.vSunE), 0.5);
  const mixT = clampv(Math.pow(1 - dot3(up, sunDir), 5), 0, 1);
  const ones: Vec3 = [1, 1, 1];
  const scale = mixv(mixT, ones, lin2);
  Lin = [Lin[0] * scale[0], Lin[1] * scale[1], Lin[2] * scale[2]];
  const L0 = mul3(Fex, 0.1);
  const sundisc = smoothstepR(SUN_COS, SUN_COS + 0.00002, cosTheta);
  const L0d = add3(L0, mul3(Fex, v.vSunE * 19000 * sundisc));
  const sum = add3(Lin, L0d);
  return [sum[0] * 0.04 + 0, sum[1] * 0.04 + 0.0003, sum[2] * 0.04 + 0.00075];
}

let varyingsSunDir: Vec3 = [0, 1, 0];

const SPEC: PreethamSpec = {
  model: "preetham",
  sun: { elevationDeg: 45, azimuthDeg: 180 },
  turbidity: 10,
  rayleigh: 3,
  mieCoefficient: 0.005,
  mieDirectionalG: 0.8
};

const DIRS: Vec3[] = [];
for (const el of [5, 25, 45, 80]) {
  for (const az of [0, 90, 180, 270]) {
    const elr = (el * Math.PI) / 180;
    const azr = (az * Math.PI) / 180;
    DIRS.push([Math.cos(elr) * Math.sin(azr), Math.sin(elr), Math.cos(elr) * Math.cos(azr)]);
  }
}

describe("P3-T1 r185 CPU reference", () => {
  const frame = preethamFrame(SPEC);
  const sun = sunDirection(SPEC.sun);
  const varyings = r185Varyings(sun, SPEC.turbidity ?? 10, SPEC.rayleigh ?? 3, SPEC.mieCoefficient ?? 0.005);
  varyingsSunDir = sun;

  it("16 sky-hemisphere directions match r185 texColor within 1e-4", () => {
    for (const dir of DIRS) {
      const expected = r185TexColor(varyings, SPEC.mieDirectionalG ?? 0.8, dir);
      const actual = preethamEvaluate(frame, dir);
      for (let c = 0; c < 3; c++) {
        expect(Math.abs(actual[c] - expected[c]), `dir ${JSON.stringify(dir)} ch${c}`).toBeLessThan(1e-4);
      }
    }
  });
});
