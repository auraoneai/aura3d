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
import { game, material, model, primitives } from "@aura3d/engine";
import { assets } from "../../../../src/aura-assets";
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
  readonly hero: any;
  readonly caddy: any;
  readonly golferBody: any;
  readonly caddyBody: any;
  readonly bag: any;
  readonly cart: any;
  readonly clubShaft: any;
  readonly clubHead: any;
  readonly clubGrip: any;
}

export function buildGolferNodes(fit: GolferFit): any[] {
  const steel = material.pbr({ color: "#3a3f47", metalness: 0.7, roughness: 0.35 });
  const rt = (name: string) => game.runtimeNode(name);

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
        material: material.emissive({ color: fit.polo || "#ffd76a", emissive: fit.polo || "#ffd76a", emissiveIntensity: 0.9 })
      })
      .scale(HIDDEN)
      .runtime(rt("golfer-ring")),
    // 3D Bespoke Meshy-6 Pro Golfer + Caddy + Bag + Golf Cart (minY = 0 grounded)
    model(assets.linksGolferAthleteMeshy, {
      name: "golfer-body",
      targetHeight: 1.84,
      role: "primaryCharacter",
      scaleMode: "fit",
      animation: { clip: "Ready", loop: true, speed: 1 }
    } as any)
      .animate({ clip: "Ready", loop: true, speed: 1 })
      .runtime(rt("golfer-body")),
    model(assets.linksGolferAthleteMeshy, {
      name: "caddy-body",
      targetHeight: 1.8,
      role: "setDressing",
      scaleMode: "fit",
      animation: { clip: "Idle_Loop", loop: true, speed: 0.9 }
    } as any)
      .animate({ clip: "Idle_Loop", loop: true, speed: 0.9 })
      .runtime(rt("caddy-body")),
    model(assets.rooftopBallRackCartMeshy, {
      name: "golfer-bag",
      targetHeight: 0.96,
      role: "setDressing",
      scaleMode: "fit"
    }).runtime(rt("golfer-bag")),
    model(assets.linksGolfCartMeshy, {
      name: "golfer-cart",
      targetHeight: 1.65,
      role: "setDressing",
      scaleMode: "fit"
    }).runtime(rt("golfer-cart")),
    // Club — grip, shaft, head (all re-posed every frame along the 3D swing arc)
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

let lastGolferAnimKey = "";
let lastCaddyAnimKey = "";

export function resolveGolferRig(app: any): GolferRig {
  const req = (n: string) => app.nodes.require(n);
  const golferBody = req("golfer-body");
  const caddyBody = req("caddy-body");
  golferBody?.setAnimation?.({ clip: "Ready", loop: true, speed: 1 });
  caddyBody?.setAnimation?.({ clip: "Idle_Loop", loop: true, speed: 0.9 });
  lastGolferAnimKey = "Ready:1";
  lastCaddyAnimKey = "Idle_Loop:0.9";
  return {
    shadow: req("golfer-shadow"),
    ring: req("golfer-ring"),
    hero: golferBody,
    caddy: caddyBody,
    golferBody,
    caddyBody,
    bag: req("golfer-bag"),
    cart: req("golfer-cart"),
    clubShaft: req("golfer-club-shaft"),
    clubHead: req("golfer-club-head"),
    clubGrip: req("golfer-club-grip")
  };
}

/* ------------------------------------------------------------------ *
 *  Player Studio fit — updates address ring and club grip accents      *
 * ------------------------------------------------------------------ */

export function applyGolferFit(rig: GolferRig, fit: GolferFit): void {
  const accent = fit.polo || "#ffd76a";
  rig.ring?.setMaterial?.(material.emissive({ color: accent, emissive: accent, emissiveIntensity: 0.9 }));
  rig.clubGrip?.setMaterial?.(material.pbr({ color: fit.cap || "#1a1c22", roughness: 0.85 }));
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
      return swingPose(segKey([K_ADDR, K_MID_BACK, K_TOP], s), {
        coil: lerp(0, 0.7, s),
        hipZ: HIP_Z + lerp(0, -0.045, s),
        hipY: HIP_Y - 0.01 * s
      });
    case "downswing":
      return swingPose(segKey([K_TOP, K_MID_DOWN, K_IMPACT], Math.pow(u, 0.75)), {
        coil: lerp(0.7, 0.08, s),
        hipZ: HIP_Z + lerp(-0.045, 0.015, s),
        hipY: HIP_Y - 0.015 + 0.015 * s
      });
    case "follow":
      return swingPose(segKey([K_IMPACT, K_MID_THRU, K_FINISH], s), {
        coil: lerp(0.08, -0.9, s),
        hipZ: HIP_Z + lerp(0.015, 0.055, s),
        hipY: lerp(HIP_Y - 0.015, 0.93, s),
        headUp: 0.12 * s,
        footR: [FOOT_R[0] - 0.02 * s, FOOT_R[1] + 0.04 * s, FOOT_R[2] + 0.02 * s]
      });
    case "putt":
      return swingPose(segKey([K_PUTT_BACK, K_PUTT_ADDR, K_PUTT_THRU], s), {
        hipY: HIP_Y - 0.03,
        kneeDrive: 0.07
      });
    case "celebrate": {
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
  faceYaw: number,
  heightFn?: (x: number, z: number) => number
): void {
  const p = golferPose(phase, t);
  const W = (v: V3) => golfKit.localToWorld(at, faceYaw, UNI, v);
  const groundAt = (x: number, z: number) => (heightFn ? heightFn(x, z) : at[1]);

  const tw = -p.coil; // spec-convention coil → standard +Y rotation
  const stanceW = W([HIP_X, 0, p.hipZ]);
  const golferGroundY = groundAt(stanceW[0], stanceW[2]);

  // Skeletal animation selection for rigged `linksGolferAthleteMeshy`
  const heroAnim =
    phase === "walk" ? { clip: "Walk_Loop", speed: 1.1 } :
    phase === "backswing" ? { clip: "Load", speed: 1.4 } :
    phase === "downswing" ? { clip: "Attack", speed: 1.8 } :
    phase === "follow" || phase === "putt" ? { clip: "FollowThrough", speed: 1.2 } :
    phase === "celebrate" ? { clip: "Jump_Loop", speed: 1.2 } :
    { clip: "Ready", speed: 1.0 };
  const heroKey = `${heroAnim.clip}:${heroAnim.speed}`;
  if (heroKey !== lastGolferAnimKey) {
    lastGolferAnimKey = heroKey;
    rig.golferBody?.setAnimation?.({ clip: heroAnim.clip, loop: true, speed: heroAnim.speed });
  }

  const caddyAnim = phase === "celebrate"
    ? { clip: "Contest", speed: 1.15 }
    : { clip: "Idle_Loop", speed: 0.9 };
  const caddyKey = `${caddyAnim.clip}:${caddyAnim.speed}`;
  if (caddyKey !== lastCaddyAnimKey) {
    lastCaddyAnimKey = caddyKey;
    rig.caddyBody?.setAnimation?.({ clip: caddyAnim.clip, loop: true, speed: caddyAnim.speed });
  }

  // 3D Bespoke Meshy Golfer (`linksGolferAthleteMeshy`, targetHeight 1.84, minY = 0 grounded)
  const heroY = golferGroundY + Math.max(0, p.hipY - HIP_Y) + p.bob;
  const heroPitch = phase === "celebrate" ? -0.08 : 0.14 - p.headUp * 0.85;
  const heroYaw = faceYaw - Math.PI / 2 + tw * 0.65;
  const heroRoll = p.coil * 0.14;
  rig.hero
    ?.setPosition(stanceW[0], heroY, stanceW[2])
    .setRotation(heroPitch, heroYaw, heroRoll)
    .setVisible(true);

  // 3D Bespoke Meshy Caddy (`linksGolferAthleteMeshy`, targetHeight 1.80, minY = 0 grounded)
  const caddyW = W([2.45, 0, -1.65]);
  const caddyGroundY = groundAt(caddyW[0], caddyW[2]);
  const caddyPump = phase === "celebrate" ? Math.abs(Math.sin(t * Math.PI * 2)) * 0.14 : 0;
  rig.caddy
    ?.setPosition(caddyW[0], caddyGroundY + caddyPump, caddyW[2])
    .setRotation(0, faceYaw - 0.38, 0)
    .setVisible(true);

  // 3D Golf Bag (`rooftopBallRackCartMeshy`, targetHeight 1.16, centered origin -> +0.58m half-height)
  const bagW = W([2.95, 0, -1.35]);
  const bagGroundY = groundAt(bagW[0], bagW[2]);
  rig.bag
    ?.setPosition(bagW[0], bagGroundY + 0.58, bagW[2])
    .setRotation(0.12, faceYaw - 0.5, 0)
    .setVisible(true);

  // 3D Bespoke Golf Cart (`linksGolfCartMeshy`, targetHeight 1.65, minY = 0 grounded)
  const cartW = W([5.2, 0, -3.6]);
  const cartGroundY = groundAt(cartW[0], cartW[2]);
  rig.cart
    ?.setPosition(cartW[0], cartGroundY, cartW[2])
    .setRotation(0, faceYaw - 0.25, 0)
    .setVisible(true);

  // Club — grip sits between the hands; shaft along grip → clubhead.
  const handLW = W(p.handL);
  const handRW = W(p.handR);
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
    .setPosition(clubHeadW[0], Math.max(at[1] + 0.04, clubHeadW[1]), clubHeadW[2])
    .setRotation(clubEuler[0], faceYaw + clubEuler[1], clubEuler[2])
    .setScale([1, 1, 1])
    .setVisible(true);

  // Blob shadow under the stance + address marker ring on the ball spot.
  const shadowW = W(STANCE_MID);
  rig.shadow
    .setPosition(shadowW[0], golferGroundY + 0.015, shadowW[2])
    .setScale([0.9, 1, 0.8])
    .setVisible(true);
  const atAddress = phase === "address" || phase === "idle" || phase === "putt";
  rig.ring
    .setPosition(at[0], at[1] + 0.02, at[2])
    .setRotation(Math.PI / 2, 0, 0)
    .setScale(atAddress ? [1, 1, 1] : [HIDDEN, HIDDEN, HIDDEN])
    .setVisible(atAddress);
}
