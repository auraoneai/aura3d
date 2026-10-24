/**
 * The runner: an articulated figure built from primitives (head, spiked hair, torso, belt, hips, two
 * arms and two legs in two segments each, boots, hands and a streaming sash) posed from the run
 * cycle, jump, slide, flight and dive states. Pure maths: `poseHero` returns each part's position and
 * rotation in the runner's local frame (x right, y up, -z forward) and the world applies the road basis.
 */

export type V3 = [number, number, number];
/** Column-major 3x3: columns are the part's local x, y and z axes expressed in the parent frame. */
export type M3 = [number, number, number, number, number, number, number, number, number];

export const mul = (a: M3, b: M3): M3 => {
  const col = (j: number): V3 => [
    a[0] * b[j * 3] + a[3] * b[j * 3 + 1] + a[6] * b[j * 3 + 2],
    a[1] * b[j * 3] + a[4] * b[j * 3 + 1] + a[7] * b[j * 3 + 2],
    a[2] * b[j * 3] + a[5] * b[j * 3 + 1] + a[8] * b[j * 3 + 2]
  ];
  const c0 = col(0), c1 = col(1), c2 = col(2);
  return [c0[0], c0[1], c0[2], c1[0], c1[1], c1[2], c2[0], c2[1], c2[2]];
};
export const apply = (m: M3, v: V3): V3 => [
  m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
  m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
  m[2] * v[0] + m[5] * v[1] + m[8] * v[2]
];
export const rx = (a: number): M3 => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, s, 0, -s, c]; };
export const ry = (a: number): M3 => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 1, 0, s, 0, c]; };
export const rz = (a: number): M3 => { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, -s, c, 0, 0, 0, 1]; };
export const IDENTITY: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export type HeroShape = "capsule" | "sphere" | "cylinder" | "box" | "cone";
export type HeroColor = "gi" | "giDark" | "skin" | "hair" | "teal" | "boot" | "sash";

export interface HeroPartSpec {
  readonly id: string;
  readonly shape: HeroShape;
  /** Primitive `size` (diameter / [diameter, height, diameter] / box extents); cones use `cone` instead. */
  readonly size: number | readonly [number, number, number];
  readonly cone?: { readonly radius: number; readonly height: number };
  readonly color: HeroColor;
}

const SPIKES = 6;
const SPIKE_HEIGHT = 0.7;
const SASH = 4;

export const HERO_PARTS: readonly HeroPartSpec[] = [
  { id: "pelvis", shape: "capsule", size: [0.86, 0.72, 0.6], color: "giDark" },
  { id: "belt", shape: "cylinder", size: [0.88, 0.16, 0.64], color: "teal" },
  { id: "torso", shape: "capsule", size: [0.94, 1.14, 0.64], color: "gi" },
  { id: "neck", shape: "cylinder", size: [0.24, 0.22, 0.24], color: "skin" },
  { id: "head", shape: "sphere", size: 0.82, color: "skin" },
  { id: "hairCap", shape: "sphere", size: [0.88, 0.56, 0.88], color: "hair" },
  ...Array.from({ length: SPIKES }, (_, i): HeroPartSpec => ({ id: `spike${i}`, shape: "cone", size: 1, cone: { radius: 0.17, height: SPIKE_HEIGHT }, color: "hair" })),
  ...(["L", "R"] as const).flatMap((s): HeroPartSpec[] => [
    { id: `thigh${s}`, shape: "capsule", size: [0.4, 0.98, 0.4], color: "giDark" },
    { id: `shin${s}`, shape: "capsule", size: [0.33, 0.98, 0.33], color: "giDark" },
    { id: `boot${s}`, shape: "box", size: [0.4, 0.26, 0.66], color: "boot" },
    { id: `upper${s}`, shape: "capsule", size: [0.28, 0.82, 0.28], color: "skin" },
    { id: `fore${s}`, shape: "capsule", size: [0.24, 0.8, 0.24], color: "skin" },
    { id: `hand${s}`, shape: "sphere", size: 0.28, color: "skin" }
  ]),
  ...Array.from({ length: SASH }, (_, i): HeroPartSpec => ({ id: `sash${i}`, shape: "box", size: [0.34 - i * 0.04, 0.04, 0.46], color: "sash" }))
];

export interface HeroInput {
  /** Run-cycle phase in radians (advances with distance covered). */
  readonly phase: number;
  readonly time: number;
  readonly grounded: boolean;
  readonly vy: number;
  readonly sliding: boolean;
  readonly flying: boolean;
  readonly diving: boolean;
  /** Lateral lean in radians, positive to the runner's right. */
  readonly lean: number;
  /** Aura strength 0..1 (lifts the arms and flares the hair). */
  readonly surge: number;
  readonly stumble: number;
  readonly speed: number;
}

export interface HeroPartPose {
  readonly p: V3;
  readonly m: M3;
}

const HIP_Y = 1.56;
const THIGH = 0.78;
const SHIN = 0.78;
const UPPER = 0.62;
const FORE = 0.62;
const TORSO_LEN = 1.38;

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

interface Targets {
  pelvisY: number;
  pitch: number;
  torsoLean: number;
  twist: number;
  thigh: [number, number];
  knee: [number, number];
  upper: [number, number];
  elbow: [number, number];
  splay: [number, number];
}

function runTargets(i: HeroInput): Targets {
  const sw = Math.sin(i.phase);
  const swR = Math.sin(i.phase + Math.PI);
  const stride = clamp(0.55 + i.speed / 70, 0.7, 1.15);
  return {
    pelvisY: HIP_Y - 0.12 + 0.04 * Math.cos(2 * i.phase),
    pitch: 0.16 + Math.min(0.18, i.speed * 0.0022),
    torsoLean: 0.06,
    twist: 0.2 * sw,
    thigh: [sw * 0.95 * stride, swR * 0.95 * stride],
    knee: [-(0.3 + 0.95 * Math.max(0, Math.cos(i.phase + 0.3))), -(0.3 + 0.95 * Math.max(0, Math.cos(i.phase + Math.PI + 0.3)))],
    upper: [-sw * 0.9 * stride, -swR * 0.9 * stride],
    elbow: [0.95 + 0.25 * Math.max(0, sw), 0.95 + 0.25 * Math.max(0, swR)],
    splay: [0.08, 0.08]
  };
}

function airTargets(i: HeroInput): Targets {
  const rising = i.vy > 0;
  return {
    pelvisY: HIP_Y - 0.1,
    pitch: rising ? 0.12 : 0.04,
    torsoLean: 0.04,
    twist: 0,
    thigh: rising ? [0.95, -0.25] : [0.45, 0.2],
    knee: rising ? [-1.25, -0.6] : [-0.55, -0.35],
    upper: rising ? [-2.5, -0.6] : [-0.9, -0.9],
    elbow: rising ? [0.6, 0.9] : [0.5, 0.5],
    splay: rising ? [0.15, 0.15] : [0.7, 0.7]
  };
}

function slideTargets(): Targets {
  return {
    pelvisY: 0.78,
    pitch: -0.95,
    torsoLean: -0.1,
    twist: 0,
    thigh: [1.3, 1.22],
    knee: [-0.12, -0.2],
    upper: [-0.7, -0.5],
    elbow: [0.3, 0.3],
    splay: [0.35, 0.35]
  };
}

function flightTargets(i: HeroInput): Targets {
  const flutter = 0.1 * Math.sin(i.time * 9);
  return {
    pelvisY: HIP_Y + 0.3,
    pitch: i.diving ? 2.3 : 1.32,
    torsoLean: 0,
    twist: 0.05 * Math.sin(i.time * 3),
    thigh: [-0.12 + flutter, -0.18 - flutter],
    knee: [-0.22, -0.3],
    upper: [Math.PI - 0.38, Math.PI - 0.42],
    elbow: [-0.18, -0.12],
    splay: [0.3, 0.3]
  };
}

export function poseHero(input: HeroInput): Record<string, HeroPartPose> {
  const T = input.flying ? flightTargets(input) : input.sliding ? slideTargets() : !input.grounded ? airTargets(input) : runTargets(input);
  // lift the arms and widen the splay when the aura is up
  T.splay = [T.splay[0] + 0.25 * input.surge, T.splay[1] + 0.25 * input.surge];
  const shake = input.stumble > 0 ? 0.35 * input.stumble * Math.sin(input.time * 28) : 0;
  const parts: Record<string, HeroPartPose> = {};

  const Rroot = mul(rz(-input.lean), rx(-(T.pitch + shake)));
  const pelvis: V3 = [0, T.pelvisY, 0];
  const Rtorso = mul(mul(Rroot, rx(-T.torsoLean)), ry(T.twist));
  const Rhead = mul(Rtorso, mul(ry(-T.twist * 1.4), rx(input.flying ? T.pitch * 0.62 : 0.08 + 0.4 * T.pitch)));

  parts.pelvis = { p: pelvis, m: Rroot };
  parts.belt = { p: add(pelvis, apply(Rtorso, [0, 0.36, 0])), m: Rtorso };
  parts.torso = { p: add(pelvis, apply(Rtorso, [0, 0.98, 0])), m: Rtorso };
  const neck = add(pelvis, apply(Rtorso, [0, TORSO_LEN + 0.04, 0]));
  parts.neck = { p: neck, m: Rtorso };
  const headC = add(neck, apply(Rhead, [0, 0.38, 0]));
  parts.head = { p: headC, m: Rhead };
  parts.hairCap = { p: add(headC, apply(Rhead, [0, 0.12, 0.06])), m: Rhead };

  // spiked hair: spikes fan out from the crown, sweep back with speed and flare with the aura
  const sweep = 0.15 + clamp(input.speed / 110, 0, 0.5) + (input.flying ? 0.25 : 0);
  for (let k = 0; k < SPIKES; k++) {
    const yaw = (k / SPIKES) * Math.PI * 2 + 0.35;
    const tilt = 0.42 + 0.32 * input.surge + 0.07 * Math.sin(input.time * 6 + k * 1.9);
    const frame = mul(mul(Rhead, rx(sweep)), mul(ry(yaw), rz(-tilt)));
    const base = add(headC, apply(mul(Rhead, mul(rx(sweep * 0.6), ry(yaw))), [0.2, 0.26, 0]));
    parts[`spike${k}`] = { p: add(base, apply(frame, [0, SPIKE_HEIGHT * 0.5, 0])), m: frame };
  }

  const sides: readonly (readonly ["L" | "R", number, number])[] = [["L", -1, 0], ["R", 1, 1]];
  for (const [name, sx, idx] of sides) {
    // legs hang from the hips in the root frame
    const hip = add(pelvis, apply(Rroot, [sx * 0.27, -0.12, 0]));
    const thighA = T.thigh[idx] as number;
    const kneeA = T.knee[idx] as number;
    const Rthigh = mul(Rroot, rx(thighA));
    parts[`thigh${name}`] = { p: add(hip, apply(Rthigh, [0, -THIGH * 0.5, 0])), m: Rthigh };
    const kneeP = add(hip, apply(Rthigh, [0, -THIGH, 0]));
    const Rshin = mul(Rroot, rx(thighA + kneeA));
    parts[`shin${name}`] = { p: add(kneeP, apply(Rshin, [0, -SHIN * 0.5, 0])), m: Rshin };
    const ankle = add(kneeP, apply(Rshin, [0, -SHIN, 0]));
    parts[`boot${name}`] = { p: add(ankle, apply(Rshin, [0, -0.06, -0.12])), m: Rshin };

    // arms hang from the shoulders in the torso frame
    const shoulder = add(pelvis, apply(Rtorso, [sx * 0.66, TORSO_LEN - 0.12, 0]));
    const Rarm = mul(Rtorso, rz(sx * (T.splay[idx] as number)));
    const upperA = T.upper[idx] as number;
    const Rupper = mul(Rarm, rx(upperA));
    parts[`upper${name}`] = { p: add(shoulder, apply(Rupper, [0, -UPPER * 0.5, 0])), m: Rupper };
    const elbowP = add(shoulder, apply(Rupper, [0, -UPPER, 0]));
    const Rfore = mul(Rarm, rx(upperA + (T.elbow[idx] as number)));
    parts[`fore${name}`] = { p: add(elbowP, apply(Rfore, [0, -FORE * 0.5, 0])), m: Rfore };
    parts[`hand${name}`] = { p: add(elbowP, apply(Rfore, [0, -FORE - 0.04, 0])), m: Rfore };
  }

  // sash: overlapping cloth segments that trail straight back in the runner's frame, whipping with the airflow
  const anchor = add(pelvis, apply(Rtorso, [0, TORSO_LEN - 0.22, 0.34]));
  const streamLift = (input.flying ? 0.02 : 0.1) + 0.05 * clamp(input.speed / 120, 0, 0.5);
  for (let j = 0; j < SASH; j++) {
    const wave = Math.sin(input.time * 11 - j * 1.1);
    const m = mul(ry(0.25 * wave), rx(0.12 + 0.1 * j));
    parts[`sash${j}`] = { p: add(anchor, [0.07 * wave * (j + 1), streamLift * (j + 1) + 0.05 * wave, 0.34 * (j + 1)]), m };
  }
  return parts;
}
