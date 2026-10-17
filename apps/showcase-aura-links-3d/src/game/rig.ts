/**
 * Aura Links 3D — articulated primitive golfer rig + swing pose driver.
 *
 * Same technique as showcase-top-tennis-v2 `updateAthleteRig`: every limb is a
 * unit capsule/cylinder oriented world-space between two joints via
 * `golfKit.orientCylinderBetween`, elbows come from the 2-bone
 * `golfKit.solveArmElbow` solver, and all authoring happens in a golfer-local
 * frame mapped through `golfKit.localToWorld`.
 *
 * LOCAL FRAME ("shot frame", metres):
 *   origin = the ball / address spot (`at`)
 *   +Z     = intended shot direction (faceYaw = 0 → world +Z)
 *   +X     = the golfer's stance side — a right-handed golfer stands ~0.55 m
 *            left of the ball-line (viewer's left looking down the line)
 *   +Y     = up
 * The golfer faces -X toward the ball: lead (left) arm/foot sit on the +Z
 * (target) side, trail (right) side toward -Z.
 *
 * `coil` below is torso wind-up in spec convention: + = backswing (shoulders
 * turn away from the target, back to the line), - = follow-through. It is
 * negated when applied as a standard +Y rotation.
 */
import { game, material, primitives } from "@aura3d/engine";
import type { GolferFit, Vec3 } from "./types";

export type GolferPhase =
  | "address"
  | "backswing"
  | "downswing"
  | "follow"
  | "celebrate"
  | "walk"
  | "idle"
  | "putt";

const golfKit = game.racketSports("aura-links-golfer");

/* ------------------------------------------------------------------ *
 *  Small math helpers (mutable tuples; Vec3 stays readonly)            *
 * ------------------------------------------------------------------ */

type V3 = [number, number, number];

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const mix3 = (a: V3, b: V3, t: number): V3 => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t)
];
/** Piecewise-smooth interpolation across a keyframe list, u ∈ [0,1]. */
const seg3 = (keys: readonly V3[], u: number): V3 => {
  if (keys.length <= 1) return [keys[0][0], keys[0][1], keys[0][2]];
  const f = clamp01(u) * (keys.length - 1);
  const i = Math.min(keys.length - 2, Math.floor(f));
  return mix3(keys[i], keys[i + 1], smoothstep(f - i));
};
/** Rotate a vec3 about +Y by `a` (same convention as localToWorld). */
const rotY = (v: V3, a: number): V3 => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
};
const norm3 = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/* ------------------------------------------------------------------ *
 *  Body + stance constants (local frame, ball at origin)               *
 * ------------------------------------------------------------------ */

const HIDDEN = 0.0001;
const UNI: V3 = [1, 1, 1];

const HIP_X = 0.55;   // stance centre, ~0.55 m left of the ball-line
const HIP_Y = 0.87;   // athletic forward bend
const HIP_Z = -0.02;
const CHEST_Y = 1.3;
const CHEST_X = 0.42; // chest leans toward the ball (hip x - chest x = spine tilt)
const HEAD_X = 0.38;
const HEAD_Y = 1.52;
const HEAD_Z = -0.02;
const SHOULDER_HALF = 0.21;
const HIP_HALF = 0.1;
const UPPER_LEN = 0.3;
const FORE_LEN = 0.28;

const FOOT_L: V3 = [0.46, 0.055, 0.15]; // lead foot — target side (+Z)
const FOOT_R: V3 = [0.51, 0.055, -0.19]; // trail foot
const STANCE_MID: V3 = [0.52, 0.012, -0.02];

/** One swing keyframe: clubhead position + both hand positions. */
interface SwingKey {
  readonly head: V3;
  readonly handL: V3;
  readonly handR: V3;
}
const segKey = (keys: readonly SwingKey[], u: number): SwingKey => ({
  head: seg3(keys.map((k) => k.head), u),
  handL: seg3(keys.map((k) => k.handL), u),
  handR: seg3(keys.map((k) => k.handR), u)
});

/* Swing arc keyframes — club grounded behind ball → over trail shoulder →
 * impact → high over lead shoulder. Hands stay glued on the grip line. */
const K_ADDR: SwingKey = {
  head: [0.0, 0.045, -0.03],
  handL: [0.27, 0.97, -0.02],
  handR: [0.29, 0.88, 0.0]
};
const K_MID_BACK: SwingKey = {
  head: [0.48, 0.6, -0.52],
  handL: [0.36, 0.95, -0.16],
  handR: [0.38, 0.86, -0.12]
};
const K_TOP: SwingKey = {
  head: [0.42, 1.55, -0.85],
  handL: [0.55, 1.33, -0.26],
  handR: [0.57, 1.24, -0.19]
};
const K_MID_DOWN: SwingKey = {
  head: [0.52, 0.8, -0.42],
  handL: [0.42, 1.02, -0.12],
  handR: [0.44, 0.93, -0.08]
};
const K_IMPACT: SwingKey = {
  head: [0.0, 0.045, 0.02],
  handL: [0.25, 0.95, 0.06],
  handR: [0.27, 0.86, 0.08]
};
const K_MID_THRU: SwingKey = {
  head: [0.22, 1.02, 0.58],
  handL: [0.32, 1.06, 0.24],
  handR: [0.34, 0.98, 0.18]
};
const K_FINISH: SwingKey = {
  head: [0.28, 1.6, 0.75],
  handL: [0.42, 1.42, 0.3],
  handR: [0.46, 1.33, 0.22]
};

/* Putting pendulum — compact back/through around a slightly lower stance. */
const K_PUTT_BACK: SwingKey = {
  head: [0.02, 0.045, -0.2],
  handL: [0.26, 0.9, -0.07],
  handR: [0.28, 0.81, -0.05]
};
const K_PUTT_ADDR: SwingKey = {
  head: [0.0, 0.045, -0.01],
  handL: [0.26, 0.88, -0.01],
  handR: [0.28, 0.79, 0.01]
};
const K_PUTT_THRU: SwingKey = {
  head: [0.02, 0.045, 0.2],
  handL: [0.26, 0.9, 0.07],
  handR: [0.28, 0.81, 0.09]
};

/* ------------------------------------------------------------------ *
 *  Rig handles + builders                                             *
 * ------------------------------------------------------------------ */

export interface GolferRig {
  readonly shadow: any;
  readonly ring: any;
  readonly shorts: any;
  readonly torso: any;
  readonly head: any;
  readonly cap: any;
  readonly uarmL: any;
  readonly farmL: any;
  readonly handL: any;
  readonly uarmR: any;
  readonly farmR: any;
  readonly handR: any;
  readonly thighL: any;
  readonly shinL: any;
  readonly shoeL: any;
  readonly thighR: any;
  readonly shinR: any;
  readonly shoeR: any;
  readonly clubShaft: any;
  readonly clubHead: any;
  readonly clubGrip: any;
}

const GOLFER_NODE_NAMES = [
  "golfer-shadow",
  "golfer-ring",
  "golfer-shorts",
  "golfer-torso",
  "golfer-head",
  "golfer-cap",
  "golfer-uarm-l",
  "golfer-farm-l",
  "golfer-hand-l",
  "golfer-uarm-r",
  "golfer-farm-r",
  "golfer-hand-r",
  "golfer-thigh-l",
  "golfer-shin-l",
  "golfer-shoe-l",
  "golfer-thigh-r",
  "golfer-shin-r",
  "golfer-shoe-r",
  "golfer-club-shaft",
  "golfer-club-head",
  "golfer-club-grip"
] as const;

export function buildGolferNodes(fit: GolferFit): any[] {
  const polo = material.pbr({ color: fit.polo, roughness: 0.75 });
  const capMat = material.pbr({ color: fit.cap, roughness: 0.6 });
  const skin = material.pbr({ color: fit.skin, roughness: 0.8 });
  const trouser = material.pbr({ color: "#4a4f58", roughness: 0.85 });
  const rubber = material.pbr({ color: "#22262e", roughness: 0.9 });
  const steel = material.pbr({ color: "#3a3f47", metalness: 0.7, roughness: 0.35 });
  const rt = (name: string) => game.runtimeNode(name);
  const limb = (name: string, mat: any) =>
    primitives.capsule({ name, size: [1, 1, 1], material: mat }).runtime(rt(name));
  const joint = (name: string, mat: any) =>
    primitives.sphere({ name, size: [1, 1, 1], material: mat }).runtime(rt(name));

  return [
    // Blob shadow + "at address" marker ring (hidden until address/idle/putt)
    primitives
      .cylinder({
        name: "golfer-shadow",
        size: [1, 0.01, 1],
        material: material.pbr({ color: "#000000", roughness: 1, opacity: 0.32 })
      })
      .runtime(rt("golfer-shadow")),
    primitives
      .torus({
        name: "golfer-ring",
        size: [0.62, 0.03, 0.03],
        material: material.emissive({ color: "#ffd76a", emissive: "#ffd76a", emissiveIntensity: 0.9 })
      })
      .scale(HIDDEN)
      .runtime(rt("golfer-ring")),
    // Core body
    primitives
      .box({ name: "golfer-shorts", size: [0.4, 0.24, 0.26], material: material.pbr({ color: "#3c4149", roughness: 0.85 }) })
      .runtime(rt("golfer-shorts")),
    limb("golfer-torso", polo),
    joint("golfer-head", skin),
    primitives
      .cylinder({ name: "golfer-cap", size: [1, 1, 1], material: capMat })
      .runtime(rt("golfer-cap")),
    // Arms — polo sleeves on upper arms, skin on forearms + hands
    limb("golfer-uarm-l", polo),
    limb("golfer-uarm-r", polo),
    limb("golfer-farm-l", skin),
    limb("golfer-farm-r", skin),
    joint("golfer-hand-l", skin),
    joint("golfer-hand-r", skin),
    // Legs — trouser capsules + dark shoe boxes
    limb("golfer-thigh-l", trouser),
    limb("golfer-thigh-r", trouser),
    limb("golfer-shin-l", trouser),
    limb("golfer-shin-r", trouser),
    primitives
      .box({ name: "golfer-shoe-l", size: [0.3, 0.11, 0.42], material: rubber })
      .runtime(rt("golfer-shoe-l")),
    primitives
      .box({ name: "golfer-shoe-r", size: [0.3, 0.11, 0.42], material: rubber })
      .runtime(rt("golfer-shoe-r")),
    // Club — grip, shaft, head (all re-posed every frame)
    primitives
      .cylinder({ name: "golfer-club-shaft", size: [0.03, 1.05, 0.03], material: steel })
      .runtime(rt("golfer-club-shaft")),
    primitives
      .box({
        name: "golfer-club-head",
        size: [0.16, 0.09, 0.09],
        material: material.pbr({ color: "#8a919c", metalness: 0.75, roughness: 0.3 })
      })
      .runtime(rt("golfer-club-head")),
    primitives
      .cylinder({
        name: "golfer-club-grip",
        size: [0.035, 0.28, 0.035],
        material: material.pbr({ color: "#1a1c22", roughness: 0.9 })
      })
      .runtime(rt("golfer-club-grip"))
  ];
}

export function resolveGolferRig(app: any): GolferRig {
  const req = (n: string) => app.nodes.require(n);
  return {
    shadow: req("golfer-shadow"),
    ring: req("golfer-ring"),
    shorts: req("golfer-shorts"),
    torso: req("golfer-torso"),
    head: req("golfer-head"),
    cap: req("golfer-cap"),
    uarmL: req("golfer-uarm-l"),
    farmL: req("golfer-farm-l"),
    handL: req("golfer-hand-l"),
    uarmR: req("golfer-uarm-r"),
    farmR: req("golfer-farm-r"),
    handR: req("golfer-hand-r"),
    thighL: req("golfer-thigh-l"),
    shinL: req("golfer-shin-l"),
    shoeL: req("golfer-shoe-l"),
    thighR: req("golfer-thigh-r"),
    shinR: req("golfer-shin-r"),
    shoeR: req("golfer-shoe-r"),
    clubShaft: req("golfer-club-shaft"),
    clubHead: req("golfer-club-head"),
    clubGrip: req("golfer-club-grip")
  };
}

/* ------------------------------------------------------------------ *
 *  Player Studio fit — cached materials, re-called only on fit change  *
 * ------------------------------------------------------------------ */

const fitMaterialCache = new Map<string, unknown>();
const fitMat = (color: string, roughness: number, extra: Record<string, number> = {}) => {
  const key = `${color}|${roughness}|${JSON.stringify(extra)}`;
  let m = fitMaterialCache.get(key);
  if (!m) {
    m = material.pbr({ color, roughness, ...extra });
    fitMaterialCache.set(key, m);
  }
  return m;
};

export function applyGolferFit(rig: GolferRig, fit: GolferFit): void {
  const polo = fitMat(fit.polo, 0.75);
  const cap = fitMat(fit.cap, 0.6);
  const skin = fitMat(fit.skin, 0.8);
  rig.torso.setMaterial(polo);
  rig.uarmL.setMaterial(polo);
  rig.uarmR.setMaterial(polo);
  rig.cap.setMaterial(cap);
  rig.head.setMaterial(skin);
  rig.farmL.setMaterial(skin);
  rig.farmR.setMaterial(skin);
  rig.handL.setMaterial(skin);
  rig.handR.setMaterial(skin);
}

/* ------------------------------------------------------------------ *
 *  Pose evaluation — per-phase keyframes for the club arc + hands      *
 * ------------------------------------------------------------------ */

interface GolferPose {
  readonly clubHead: V3;
  readonly handL: V3;
  readonly handR: V3;
  /** grip point on the club; defaults to the hand midpoint */
  readonly grip?: V3;
  /** torso wind-up: + backswing / - follow-through (spec convention) */
  readonly coil: number;
  readonly hipY: number;
  /** weight shift along the stance line: - trail side / + lead side */
  readonly hipZ: number;
  /** head lift while tracking the shot (follow-through) */
  readonly headUp: number;
  /** breathing/bob offset added to chest + head */
  readonly bob: number;
  readonly footL: V3;
  readonly footR: V3;
  /** forward knee drive (stance flex), metres toward the ball */
  readonly kneeDrive: number;
}

const BASE_POSE = {
  coil: 0,
  hipY: HIP_Y,
  hipZ: HIP_Z,
  headUp: 0,
  bob: 0,
  footL: FOOT_L,
  footR: FOOT_R,
  kneeDrive: 0.1
};

const swingPose = (key: SwingKey, extra: Partial<GolferPose>): GolferPose => ({
  clubHead: key.head,
  handL: key.handL,
  handR: key.handR,
  ...BASE_POSE,
  ...extra
});

function golferPose(phase: GolferPhase, t: number): GolferPose {
  const u = clamp01(t);
  const s = smoothstep(u);
  switch (phase) {
    case "backswing":
      // Club sweeps low/inside then sets over the trail shoulder; coil to ~0.7.
      return swingPose(segKey([K_ADDR, K_MID_BACK, K_TOP], s), {
        coil: lerp(0, 0.7, s),
        hipZ: HIP_Z + lerp(0, -0.045, s),
        hipY: HIP_Y - 0.01 * s
      });
    case "downswing":
      // Whip down: pow<1 keeps the arc fast off the top into impact.
      return swingPose(segKey([K_TOP, K_MID_DOWN, K_IMPACT], Math.pow(u, 0.75)), {
        coil: lerp(0.7, 0.08, s),
        hipZ: HIP_Z + lerp(-0.045, 0.015, s),
        hipY: HIP_Y - 0.015 + 0.015 * s
      });
    case "follow":
      // Around and up over the lead shoulder; chest rotates through the line.
      return swingPose(segKey([K_IMPACT, K_MID_THRU, K_FINISH], s), {
        coil: lerp(0.08, -0.9, s),
        hipZ: HIP_Z + lerp(0.015, 0.055, s),
        hipY: lerp(HIP_Y - 0.015, 0.93, s),
        headUp: 0.12 * s,
        // trail heel releases as weight goes to the lead side
        footR: [FOOT_R[0] - 0.02 * s, FOOT_R[1] + 0.04 * s, FOOT_R[2] + 0.02 * s]
      });
    case "putt":
      // Compact face-square pendulum, stance a touch more bent.
      return swingPose(segKey([K_PUTT_BACK, K_PUTT_ADDR, K_PUTT_THRU], s), {
        hipY: HIP_Y - 0.03,
        kneeDrive: 0.07
      });
    case "celebrate": {
      // Both fists pump; a small jump carries the hips. Club raised in the
      // trail hand.
      const pump = Math.sin(Math.PI * u);
      const handL: V3 = [0.42, 1.12 + 0.34 * pump, 0.2];
      const handR: V3 = [0.46, 1.12 + 0.34 * pump, -0.18];
      return {
        clubHead: [handR[0] + 0.05, handR[1] + 0.85, handR[2] - 0.05],
        handL,
        handR,
        grip: handR,
        coil: 0.15 * pump,
        hipY: 0.92 + 0.06 * pump,
        hipZ: HIP_Z,
        headUp: 0.06,
        bob: 0,
        footL: FOOT_L,
        footR: FOOT_R,
        kneeDrive: 0.09 - 0.02 * pump
      };
    }
    case "walk": {
      // Gentle bob + counter-swaying arms; club carried in the trail hand.
      const w = Math.sin(u * Math.PI * 2);
      const handL: V3 = [0.5, 0.82, 0.23 + w * 0.05];
      const handR: V3 = [0.55, 0.82, -0.2 - w * 0.05];
      return {
        clubHead: [handR[0] + 0.1, 0.16, handR[2] + 0.14],
        handL,
        handR,
        grip: handR,
        coil: 0,
        hipY: 0.92 + w * 0.02,
        hipZ: HIP_Z,
        headUp: 0.02,
        bob: 0,
        footL: [FOOT_L[0], FOOT_L[1] + Math.max(0, w) * 0.03, FOOT_L[2] + w * 0.07],
        footR: [FOOT_R[0], FOOT_R[1] + Math.max(0, -w) * 0.03, FOOT_R[2] - w * 0.07],
        kneeDrive: 0.12
      };
    }
    case "address":
    case "idle":
    default:
      // Bent forward over the ball, club grounded just behind it, hands low.
      return swingPose(K_ADDR, {
        bob: Math.sin(u * Math.PI * 2) * 0.008
      });
  }
}

/* ------------------------------------------------------------------ *
 *  poseGolfer — map the local pose into world space + drive handles    *
 * ------------------------------------------------------------------ */

export function poseGolfer(
  rig: GolferRig,
  phase: GolferPhase,
  t: number,
  at: Vec3,
  faceYaw: number
): void {
  const p = golferPose(phase, t);
  // Local frame: origin at the ball, +Z = shot direction, +X = stance side.
  const W = (v: V3) => golfKit.localToWorld(at, faceYaw, UNI, v);

  const tw = -p.coil; // spec-convention coil → standard +Y rotation
  const hip: V3 = [HIP_X, p.hipY, p.hipZ];

  // Spine tilts toward the ball and swings with the coil; the shoulder axis
  // rotates the full wind-up while hips take ~45% (the "X-factor").
  const spine = rotY([CHEST_X - HIP_X, 0, -0.02 - HIP_Z], tw * 0.55);
  const chest: V3 = [hip[0] + spine[0], CHEST_Y + p.bob, hip[2] + spine[2]];
  const axis = rotY([0, 0, 1], tw);
  const shoulderL: V3 = [
    chest[0] + axis[0] * SHOULDER_HALF,
    chest[1] + 0.03,
    chest[2] + axis[2] * SHOULDER_HALF
  ];
  const shoulderR: V3 = [
    chest[0] - axis[0] * SHOULDER_HALF,
    chest[1] + 0.03,
    chest[2] - axis[2] * SHOULDER_HALF
  ];
  const head: V3 = [
    HEAD_X,
    HEAD_Y + p.bob + p.headUp * 0.6,
    HEAD_Z + p.headUp * 0.5
  ];

  const hipsW = W(hip);
  const chestW = W(chest);
  const headW = W(head);

  golfKit.orientCylinderBetween(rig.torso, hipsW, chestW, 0.2, 0.155);
  rig.shorts
    .setPosition(hipsW[0], hipsW[1], hipsW[2])
    .setRotation(0, faceYaw - Math.PI / 2 + tw * 0.45, 0)
    .setScale([1, 1, 1])
    .setVisible(true);
  rig.head
    .setPosition(headW[0], headW[1] + 0.1, headW[2])
    .setScale([0.21, 0.24, 0.22])
    .setVisible(true);
  // Cap: squat cylinder tipped slightly toward the ball — brim overhang reads
  // as a cap.
  rig.cap
    .setPosition(headW[0] - Math.cos(faceYaw) * 0.035, headW[1] + 0.17, headW[2] + Math.sin(faceYaw) * 0.035)
    .setRotation(0.06, faceYaw - Math.PI / 2, 0)
    .setScale([0.235, 0.09, 0.25])
    .setVisible(true);

  // Arms — 2-bone IK. Hands come from the swing keyframes.
  const shoulderLW = W(shoulderL);
  const shoulderRW = W(shoulderR);
  const handLW = W(p.handL);
  const handRW = W(p.handR);
  const elbowL = golfKit.solveArmElbow(shoulderLW, handLW, -1, UPPER_LEN, FORE_LEN);
  const elbowR = golfKit.solveArmElbow(shoulderRW, handRW, 1, UPPER_LEN, FORE_LEN);
  golfKit.orientCylinderBetween(rig.uarmL, shoulderLW, elbowL, 0.052);
  golfKit.orientCylinderBetween(rig.farmL, elbowL, handLW, 0.045);
  golfKit.orientCylinderBetween(rig.uarmR, shoulderRW, elbowR, 0.052);
  golfKit.orientCylinderBetween(rig.farmR, elbowR, handRW, 0.045);
  rig.handL.setPosition(handLW[0], handLW[1], handLW[2]).setScale([0.085, 0.085, 0.085]).setVisible(true);
  rig.handR.setPosition(handRW[0], handRW[1], handRW[2]).setScale([0.085, 0.085, 0.085]).setVisible(true);

  // Club — grip sits between the hands; shaft along grip → clubhead.
  const gripW = p.grip ? W(p.grip) : mix3(handLW, handRW, 0.5);
  const clubHeadW = W(p.clubHead);
  const dir = norm3([clubHeadW[0] - gripW[0], clubHeadW[1] - gripW[1], clubHeadW[2] - gripW[2]]);
  const butt: V3 = [gripW[0] - dir[0] * 0.13, gripW[1] - dir[1] * 0.13, gripW[2] - dir[2] * 0.13];
  const gripEnd: V3 = [gripW[0] + dir[0] * 0.08, gripW[1] + dir[1] * 0.08, gripW[2] + dir[2] * 0.08];
  const neck: V3 = [clubHeadW[0] - dir[0] * 0.04, clubHeadW[1] - dir[1] * 0.04, clubHeadW[2] - dir[2] * 0.04];
  golfKit.orientCylinderBetween(rig.clubGrip, butt, gripEnd, 0.026);
  golfKit.orientCylinderBetween(rig.clubShaft, gripEnd, neck, 0.02);
  const clubEuler = golfKit.directionToEulerXYZ(dir[0], dir[1], dir[2]);
  rig.clubHead
    .setPosition(clubHeadW[0], Math.max(0.045, clubHeadW[1]), clubHeadW[2])
    .setRotation(clubEuler[0], faceYaw + clubEuler[1], clubEuler[2])
    .setScale([1, 1, 1])
    .setVisible(true);

  // Legs — knees drive toward the ball for the athletic flexed stance.
  const hipAxis = rotY([0, 0, 1], tw * 0.45);
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1; // lead leg first (+Z), trail second
    const foot = i === 0 ? p.footL : p.footR;
    const hipJoint: V3 = [
      hip[0] + hipAxis[0] * HIP_HALF * side,
      hip[1] - 0.02,
      hip[2] + hipAxis[2] * HIP_HALF * side
    ];
    const knee: V3 = [
      (hipJoint[0] + foot[0]) * 0.5 - p.kneeDrive,
      (hipJoint[1] + foot[1]) * 0.5 + 0.02,
      (hipJoint[2] + foot[2]) * 0.5 + side * 0.025
    ];
    const hipW = W(hipJoint);
    const kneeW = W(knee);
    const footW = W(foot);
    golfKit.orientCylinderBetween(i === 0 ? rig.thighL : rig.thighR, hipW, kneeW, 0.075);
    golfKit.orientCylinderBetween(i === 0 ? rig.shinL : rig.shinR, kneeW, footW, 0.055);
    (i === 0 ? rig.shoeL : rig.shoeR)
      .setPosition(footW[0], Math.max(0.055, footW[1]), footW[2])
      .setRotation(0, faceYaw - Math.PI / 2, 0)
      .setScale([1, 1, 1])
      .setVisible(true);
  }

  // Blob shadow under the stance + address marker ring on the ball spot.
  const shadowW = W(STANCE_MID);
  rig.shadow
    .setPosition(shadowW[0], shadowW[1], shadowW[2])
    .setScale([0.9, 1, 0.8])
    .setVisible(true);
  const atAddress = phase === "address" || phase === "idle" || phase === "putt";
  rig.ring
    .setPosition(at[0], at[1] + 0.02, at[2])
    .setRotation(Math.PI / 2, 0, 0)
    .setScale(atAddress ? [1, 1, 1] : [HIDDEN, HIDDEN, HIDDEN])
    .setVisible(atAddress);
}
