// PRD-07 P3-T1 — analytic Preetham sky evaluator.
// Faithful CPU port of three.js r185 `examples/jsm/objects/Sky.js` (MIT) so the
// CPU reference tests (P3-T2) and the GPU fragment shader share the same math.
// Numbers are linear HDR radiance, pre-exposure — same as r185's `texColor`.

export type Vec3 = readonly [number, number, number];

export interface AuraSkySunSpecLike {
  readonly elevationDeg: number;
  readonly azimuthDeg: number;
  readonly intensity?: number;
  readonly discSize?: number;
}

export interface PreethamSpec {
  readonly model: "preetham";
  readonly sun: AuraSkySunSpecLike;
  readonly turbidity?: number;
  readonly rayleigh?: number;
  readonly mieCoefficient?: number;
  readonly mieDirectionalG?: number;
  readonly exposure?: number;
  readonly groundColor?: Vec3 | readonly number[];
}

// --- r185 constants -------------------------------------------------------
const E = 2.71828182845904523536028747135266249775724709369995957;
const PI = 3.141592653589793238462643383279502884197169;
const TOTAL_RAYLEIGH: Vec3 = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
const MIE_CONST: Vec3 = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
const CUTOFF_ANGLE = 1.6110731556870734;
const STEEPNESS = 1.5;
const EE = 1000.0;
const RAYLEIGH_ZENITH = 8.4e3;
const MIE_ZENITH = 1.25e3;
const SUN_ANGULAR_DIAMETER_COS = 0.999956676946448443553574619906976478926848692873900859324;
const THREE_OVER_SIXTEEN_PI = 0.05968310365946075;
const ONE_OVER_FOUR_PI = 0.07957747154594767;

function sunIntensity(zenithAngleCos: number): number {
  const c = Math.max(-1, Math.min(1, zenithAngleCos));
  return EE * Math.max(0, 1 - Math.pow(E, -((CUTOFF_ANGLE - Math.acos(c)) / STEEPNESS)));
}

function totalMie(turbidity: number): Vec3 {
  const c = 0.2 * turbidity * 10e-18;
  return [0.434 * c * MIE_CONST[0], 0.434 * c * MIE_CONST[1], 0.434 * c * MIE_CONST[2]];
}

function rayleighPhase(cosTheta: number): number {
  return THREE_OVER_SIXTEEN_PI * (1 + cosTheta * cosTheta);
}

function hgPhase(cosTheta: number, g: number): number {
  const g2 = g * g;
  return ONE_OVER_FOUR_PI * ((1 - g2) / Math.pow(1 - 2 * g * cosTheta + g2, 1.5));
}

/** Sun direction from elevation/azimuth degrees (x=east-ish, y=up, z=north-ish). */
export function sunDirection(sun: AuraSkySunSpecLike): Vec3 {
  const phi = (sun.azimuthDeg * Math.PI) / 180;
  const theta = (sun.elevationDeg * Math.PI) / 180;
  const y = Math.sin(theta);
  const r = Math.cos(theta);
  return [r * Math.sin(phi), y, r * Math.cos(phi)];
}

export interface PreethamFrame {
  readonly sunDirection: Vec3;
  readonly sunE: number;
  readonly sunfade: number;
  readonly betaR: Vec3;
  readonly betaM: Vec3;
  readonly mieDirectionalG: number;
  readonly exposure: number;
  readonly showSunDisc: number;
  readonly groundColor: Vec3;
}

/** Per-frame constants — identical inputs to the GPU sky program's uniforms. */
export function preethamFrame(spec: PreethamSpec): PreethamFrame {
  const sun = sunDirection(spec.sun);
  const turbidity = spec.turbidity ?? 10;
  const rayleigh = spec.rayleigh ?? 3;
  const mieCoefficient = spec.mieCoefficient ?? 0.005;
  const mieDirectionalG = spec.mieDirectionalG ?? 0.8;
  const sunE = sunIntensity(sun[1]);
  // r185: 1 - clamp(1 - exp(sunPosition.y / 450000)). Aura's sun is a unit
  // direction, so sun.y × 2 plays the 450000-scale role: fade ≈ 1 by day,
  // → ~0.13 at sun.y = -0.5 (deep night).
  const sunfade = 1 - Math.max(0, Math.min(1, 1 - Math.exp(sun[1] * 2)));
  const rayleighCoefficient = rayleigh - (1 * (1 - sunfade));
  const betaR: Vec3 = [
    TOTAL_RAYLEIGH[0] * rayleighCoefficient,
    TOTAL_RAYLEIGH[1] * rayleighCoefficient,
    TOTAL_RAYLEIGH[2] * rayleighCoefficient
  ];
  const mie = totalMie(turbidity);
  const betaM: Vec3 = [mie[0] * mieCoefficient, mie[1] * mieCoefficient, mie[2] * mieCoefficient];
  const ground = (spec.groundColor ?? [0.11, 0.115, 0.12]) as Vec3;
  return {
    sunDirection: sun,
    sunE,
    sunfade,
    betaR,
    betaM,
    mieDirectionalG,
    exposure: spec.exposure ?? 1,
    showSunDisc: 1,
    groundColor: [ground[0] ?? 0.11, ground[1] ?? 0.115, ground[2] ?? 0.12]
  };
}

/** Linear HDR radiance along `dir` — the CPU mirror of the fragment shader. */
export function preethamEvaluate(frame: PreethamFrame, dir: Vec3): Vec3 {
  const up: Vec3 = [0, 1, 0];
  const direction = normalize3(dir);
  const zenithAngle = Math.acos(Math.max(0, dot3(up, direction)));
  const inverse = 1 / (Math.cos(zenithAngle) + 0.15 * Math.pow(93.885 - (zenithAngle * 180) / PI, -1.253));
  const sR = RAYLEIGH_ZENITH * inverse;
  const sM = MIE_ZENITH * inverse;
  const fex: Vec3 = [
    Math.exp(-(frame.betaR[0] * sR + frame.betaM[0] * sM)),
    Math.exp(-(frame.betaR[1] * sR + frame.betaM[1] * sM)),
    Math.exp(-(frame.betaR[2] * sR + frame.betaM[2] * sM))
  ];
  const cosTheta = dot3(direction, frame.sunDirection);
  const rP = rayleighPhase(cosTheta * 0.5 + 0.5);
  const mP = hgPhase(cosTheta, frame.mieDirectionalG);
  const betaRTheta = scale3(frame.betaR, rP);
  const betaMTheta = scale3(frame.betaM, mP);
  const ratio: Vec3 = [
    (betaRTheta[0] + betaMTheta[0]) / (frame.betaR[0] + frame.betaM[0]),
    (betaRTheta[1] + betaMTheta[1]) / (frame.betaR[1] + frame.betaM[1]),
    (betaRTheta[2] + betaMTheta[2]) / (frame.betaR[2] + frame.betaM[2])
  ];
  const lin0: Vec3 = [
    Math.pow(Math.max(0, frame.sunE * ratio[0] * (1 - fex[0])), 1.5),
    Math.pow(Math.max(0, frame.sunE * ratio[1] * (1 - fex[1])), 1.5),
    Math.pow(Math.max(0, frame.sunE * ratio[2] * (1 - fex[2])), 1.5)
  ];
  const mixT = Math.max(0, Math.min(1, Math.pow(1 - dot3(up, frame.sunDirection), 5)));
  const lin1: Vec3 = [
    Math.pow(Math.max(0, frame.sunE * ratio[0] * fex[0]), 0.5),
    Math.pow(Math.max(0, frame.sunE * ratio[1] * fex[1]), 0.5),
    Math.pow(Math.max(0, frame.sunE * ratio[2] * fex[2]), 0.5)
  ];
  const lin: Vec3 = [
    lin0[0] * mix3(1, lin1[0], mixT),
    lin0[1] * mix3(1, lin1[1], mixT),
    lin0[2] * mix3(1, lin1[2], mixT)
  ];
  const sundisc =
    smoothstep(SUN_ANGULAR_DIAMETER_COS, SUN_ANGULAR_DIAMETER_COS + 0.00002, cosTheta) * frame.showSunDisc;
  const l0: Vec3 = [0.1 * fex[0], 0.1 * fex[1], 0.1 * fex[2]];
  const disc: Vec3 = [
    frame.sunE * 19000 * fex[0] * sundisc,
    frame.sunE * 19000 * fex[1] * sundisc,
    frame.sunE * 19000 * fex[2] * sundisc
  ];
  const sky: Vec3 = [
    (lin[0] + l0[0] + disc[0]) * 0.04,
    (lin[1] + l0[1] + disc[1]) * 0.04,
    (lin[2] + l0[2] + disc[2]) * 0.04
  ];
  const base: Vec3 = [sky[0] + 0, sky[1] + 0.0003, sky[2] + 0.00075];
  if (direction[1] < 0) {
    // Ground hemisphere: blend to the spec's ground colour below the horizon.
    const t = Math.max(0, Math.min(1, -direction[1] * 4));
    return [mix3(base[0], frame.groundColor[0] * 0.04, t), mix3(base[1], frame.groundColor[1] * 0.04, t), mix3(base[2], frame.groundColor[2] * 0.04, t)];
  }
  return base;
}

export function normalize3(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
export function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function scale3(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}
function mix3(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
