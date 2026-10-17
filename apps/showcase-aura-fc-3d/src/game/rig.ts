// Aura FC 3D — articulated athlete rigs.
//
// Each outfielder/keeper is a 16-node primitive puppet posed every frame:
// capsule torso, box shorts/boots, sphere head/hands, 2-bone-look limbs built
// from orientCylinderBetween + solveArmElbow (the same deterministic helpers
// the engine ships for sport rigs). Pose state comes straight off
// PlayerState — gait phase, kickT, slideT, diveT, celebrateT, trapT — so the
// visible athlete is a pure function of the simulation.
//
// NOTE on yaw: `kit.localToWorld` maps local +X to world (cosψ, −sinψ), i.e.
// it rotates the local frame by −yaw. The sim stores standard atan2(vz, vx)
// facing, so the rig uses `ryaw = -p.yaw`.

import { game, material, primitives } from "@aura3d/engine";
import type { PlayerState } from "./types";

export type RigNode = any;

export interface AthleteRig {
  readonly id: string;
  shadow: RigNode; ring: RigNode;
  shorts: RigNode; torso: RigNode; head: RigNode; hair: RigNode;
  uarmL: RigNode; farmL: RigNode; handL: RigNode;
  uarmR: RigNode; farmR: RigNode; handR: RigNode;
  thighL: RigNode; shinL: RigNode; shoeL: RigNode;
  thighR: RigNode; shinR: RigNode; shoeR: RigNode;
  kitKey: string;
}

export interface AthleteKit {
  readonly jersey: string;
  readonly shorts: string;
  readonly socks: string;
  readonly boots: string;
  readonly skin: string;
  readonly trim: string;
  readonly keeper: boolean;
}

const SKIN_TONES = ["#c68a5a", "#8a5f42", "#e0b48a", "#6e4a30", "#d09a6a"] as const;

export function skinFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return SKIN_TONES[h % SKIN_TONES.length];
}

/* ------------------------------------------------------------------ */

/** Build the 18 scene nodes for one athlete. Materials are placeholders —
 *  `applyAthleteKit` retints per club each time the matchup changes. */
export function athleteNodes(id: string): RigNode[] {
  const ph = material.pbr({ color: "#888888", roughness: 0.8 });
  const limb = (name: string) =>
    primitives.capsule({ name, size: [1, 1, 1], material: ph }).runtime(game.runtimeNode(name));
  const joint = (name: string) =>
    primitives.sphere({ name, size: [1, 1, 1], material: ph }).runtime(game.runtimeNode(name));
  return [
    primitives.cylinder({ name: `${id}-shadow`, size: [1, 0.01, 1], material: material.pbr({ color: "#000000", roughness: 1, opacity: 0.3 }) })
      .runtime(game.runtimeNode(`${id}-shadow`)),
    primitives.torus({ name: `${id}-ring`, size: [0.66, 0.035, 0.035], material: material.emissive({ color: "#d8ff3e", emissive: "#d8ff3e", emissiveIntensity: 1.1 }) })
      .runtime(game.runtimeNode(`${id}-ring`)),
    primitives.box({ name: `${id}-shorts`, size: [0.4, 0.26, 0.3], material: ph }).runtime(game.runtimeNode(`${id}-shorts`)),
    limb(`${id}-torso`),
    joint(`${id}-head`),
    primitives.cylinder({ name: `${id}-hair`, size: [1, 1, 1], material: ph }).runtime(game.runtimeNode(`${id}-hair`)),
    limb(`${id}-uarm-l`), limb(`${id}-uarm-r`),
    limb(`${id}-farm-l`), limb(`${id}-farm-r`),
    joint(`${id}-hand-l`), joint(`${id}-hand-r`),
    limb(`${id}-thigh-l`), limb(`${id}-thigh-r`),
    limb(`${id}-shin-l`), limb(`${id}-shin-r`),
    primitives.box({ name: `${id}-shoe-l`, size: [0.34, 0.12, 0.16], material: ph }).runtime(game.runtimeNode(`${id}-shoe-l`)),
    primitives.box({ name: `${id}-shoe-r`, size: [0.34, 0.12, 0.16], material: ph }).runtime(game.runtimeNode(`${id}-shoe-r`))
  ];
}

export function resolveAthlete(app: any, id: string): AthleteRig {
  const req = (n: string) => app.nodes.require(`${id}-${n}`);
  return {
    id,
    shadow: req("shadow"), ring: req("ring"),
    shorts: req("shorts"), torso: req("torso"), head: req("head"), hair: req("hair"),
    uarmL: req("uarm-l"), farmL: req("farm-l"), handL: req("hand-l"),
    uarmR: req("uarm-r"), farmR: req("farm-r"), handR: req("hand-r"),
    thighL: req("thigh-l"), shinL: req("shin-l"), shoeL: req("shoe-l"),
    thighR: req("thigh-r"), shinR: req("shin-r"), shoeR: req("shoe-r"),
    kitKey: ""
  };
}

/** Retint when the kit key changes (club switch / studio edit). */
export function applyAthleteKit(rig: AthleteRig, kit: AthleteKit): void {
  const key = `${kit.jersey}|${kit.shorts}|${kit.socks}|${kit.boots}|${kit.skin}|${kit.trim}|${kit.keeper}`;
  if (rig.kitKey === key) return;
  rig.kitKey = key;
  const jersey = material.pbr({ color: kit.jersey, roughness: 0.72 });
  const shorts = material.pbr({ color: kit.shorts, roughness: 0.78 });
  const socks = material.pbr({ color: kit.socks, roughness: 0.8 });
  const boots = material.pbr({ color: kit.boots, roughness: 0.55 });
  const skin = material.pbr({ color: kit.skin, roughness: 0.8 });
  const trim = material.pbr({ color: kit.trim, roughness: 0.5 });
  rig.torso.setMaterial(jersey);
  rig.uarmL.setMaterial(jersey); rig.uarmR.setMaterial(jersey);   // sleeves
  rig.shorts.setMaterial(shorts);
  rig.thighL.setMaterial(shorts); rig.thighR.setMaterial(shorts); // shorts cover the thigh
  rig.shinL.setMaterial(socks); rig.shinR.setMaterial(socks);
  rig.shoeL.setMaterial(boots); rig.shoeR.setMaterial(boots);
  rig.farmL.setMaterial(skin); rig.farmR.setMaterial(skin);
  rig.handL.setMaterial(skin); rig.handR.setMaterial(skin);
  rig.head.setMaterial(skin);
  rig.hair.setMaterial(trim);
  rig.ring.setMaterial(material.emissive({ color: kit.trim, emissive: kit.trim, emissiveIntensity: 1.15 }));
}

/* ------------------------------------------------------------------ */
/*  Pose math                                                          */
/* ------------------------------------------------------------------ */

type V3 = [number, number, number];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// skeleton proportions (metres)
const HIP_Y = 0.94;
const SH_Y = 1.38;
const HEAD_Y = 1.64;
const HIP_HALF = 0.115;
const SH_HALF = 0.235;
const THIGH_L = 0.42;
const SHIN_L = 0.40;
const UARM_L = 0.30;
const FARM_L = 0.28;

interface LimbTargets {
  footL: V3; footR: V3;                       // local space
  handL: V3; handR: V3;                       // local space
  hipY: number; shY: number; headY: number;
  leanX: number; leanZ: number;               // chest offset (local)
  torsoYaw: number;
  lying?: "left" | "right" | "front";         // dive/slide body plan
}

function runTargets(p: PlayerState, t: number, hasBall: boolean): LimbTargets {
  const speedN = clamp(p.speed / 6.4, 0, 1.15);
  const g = p.gait * Math.PI;                 // two half-steps per unit
  const stride = 0.16 + speedN * 0.34;
  const lift = 0.10 + speedN * 0.26;

  const swing = Math.sin(g);
  const liftL = Math.max(0, Math.cos(g));
  const liftR = Math.max(0, -Math.cos(g));

  // idle: subtle breathing sway + weight shift
  const idle = p.speed < 0.4;
  const sway = idle ? Math.sin(t * 1.7 + p.gait) * 0.02 : 0;
  const bounce = idle ? 0 : Math.abs(Math.sin(g)) * 0.05 * speedN;

  const dribbling = hasBall && !idle;

  return {
    footL: [swing * stride, 0.055 + liftL * lift, -HIP_HALF],
    footR: [-swing * stride, 0.055 + liftR * lift, HIP_HALF],
    handL: [-swing * (0.24 + speedN * 0.22), SH_Y - 0.34, -(SH_HALF + 0.07)],
    handR: [swing * (0.24 + speedN * 0.22), SH_Y - 0.34, SH_HALF + 0.07],
    hipY: HIP_Y - speedN * 0.06 + bounce + (dribbling ? -0.03 : 0),
    shY: SH_Y - speedN * 0.05 + bounce,
    headY: HEAD_Y - speedN * 0.04 + bounce,
    leanX: speedN * 0.14 + (dribbling ? 0.05 : 0),
    leanZ: sway,
    torsoYaw: swing * 0.12 * speedN
  };
}

function kickTargets(p: PlayerState, base: LimbTargets): LimbTargets {
  // kickT counts down 0.32 → 0; k=0 windup → ~0.5 contact → 1 follow-through
  const k = clamp(1 - p.kickT / 0.32, 0, 1);
  const power = clamp(p.kickPower, 0.2, 1);
  // right leg: back → through → high follow-through
  const back = Math.sin(Math.min(k * 2, 1) * Math.PI) * 0.3;          // wind-up
  const fwd = k < 0.5 ? lerp(-0.28, 0.42, k * 2) : lerp(0.42, 0.62 + power * 0.25, (k - 0.5) * 2);
  const up = k < 0.5 ? 0.06 : Math.sin((k - 0.5) * Math.PI) * (0.35 + power * 0.3);
  return {
    ...base,
    footR: [fwd - back, 0.055 + up, HIP_HALF + 0.02],
    footL: [-0.18, 0.055, -HIP_HALF - 0.03],
    handL: [0.30 + k * 0.2, SH_Y - 0.2, -(SH_HALF + 0.14)],
    handR: [-0.34 - k * 0.1, SH_Y - 0.3, SH_HALF + 0.1],
    torsoYaw: -0.28 + k * 0.5,
    leanX: 0.06 + k * 0.1,
    hipY: base.hipY - 0.04
  };
}

function slideTargets(p: PlayerState): LimbTargets {
  // body low, leading leg extended toward travel, torso reclined back
  const t = 1 - p.slideT / 0.55;
  return {
    footL: [0.52, 0.09, -HIP_HALF - 0.06],
    footR: [0.24, 0.10, HIP_HALF + 0.1],
    handL: [-0.1, 0.5, -(SH_HALF + 0.15)],
    handR: [0.15, 0.34, SH_HALF + 0.2],
    hipY: lerp(HIP_Y, 0.3, Math.min(1, t * 1.8)),
    shY: lerp(SH_Y, 0.62, Math.min(1, t * 1.8)),
    headY: lerp(HEAD_Y, 0.86, Math.min(1, t * 1.8)),
    leanX: -0.3,
    leanZ: 0.1,
    torsoYaw: 0.15
  };
}

function diveTargets(p: PlayerState): LimbTargets {
  // keeper horizontal lunge — local frame: facing +X(±flipped), dive side ±Z
  const k = clamp(1 - p.diveT / 0.72, 0, 1);          // 0 → committed → 1
  const side = -p.diveDir * (Math.cos(p.yaw) < 0 ? -1 : 1); // world z-dir → local z (facing ±X)
  const rise = Math.sin(Math.min(k * 1.4, 1) * Math.PI) * 0.25;
  return {
    footL: [-0.05, 0.1 + rise * 0.3, -HIP_HALF],
    footR: [0.08, 0.1 + rise * 0.5, HIP_HALF],
    handL: [0.3, 0.9 + rise, side * 0.6 - 0.1],
    handR: [0.3, 0.9 + rise, side * 0.6 + 0.1],
    hipY: lerp(HIP_Y, 0.42, Math.min(1, k * 2)),
    shY: lerp(SH_Y, 0.55, Math.min(1, k * 2)) + rise * 0.3,
    headY: lerp(HEAD_Y, 0.8, Math.min(1, k * 2)) + rise * 0.2,
    leanX: 0.05,
    leanZ: side * (0.35 + k * 0.25),
    torsoYaw: 0,
    lying: side > 0 ? "right" : "left"
  };
}

function keeperSetTargets(p: PlayerState, base: LimbTargets, t: number): LimbTargets {
  const crouch = 0.14;
  const sway = Math.sin(t * 2.4) * 0.03;
  return {
    ...base,
    footL: [0.05 + sway, 0.055, -HIP_HALF - 0.06],
    footR: [0.05 - sway, 0.055, HIP_HALF + 0.06],
    handL: [0.34, SH_Y - 0.42, -(SH_HALF + 0.02)],
    handR: [0.34, SH_Y - 0.42, SH_HALF + 0.02],
    hipY: HIP_Y - crouch,
    shY: SH_Y - crouch - 0.02,
    headY: HEAD_Y - crouch - 0.03,
    leanX: 0.16,
    torsoYaw: 0
  };
}

function celebrateTargets(p: PlayerState, t: number): LimbTargets {
  const kind = p.celebrateKind % 4;
  const c = Math.min(1, (2.6 - p.celebrateT) * 2 + 0.2);
  if (kind === 0) {
    // knee slide — drop to knees, arms spread, chest up
    return {
      footL: [-0.3, 0.1, -HIP_HALF - 0.05], footR: [-0.3, 0.1, HIP_HALF + 0.05],
      handL: [-0.1, SH_Y - 0.28, -0.62], handR: [-0.1, SH_Y - 0.28, 0.62],
      hipY: lerp(HIP_Y, 0.5, c), shY: lerp(SH_Y, 0.92, c), headY: lerp(HEAD_Y, 1.14, c),
      leanX: -0.22, leanZ: 0, torsoYaw: 0
    };
  }
  if (kind === 1) {
    // airplane spin — arms out, rotating torso
    const spin = t * 7;
    return {
      footL: [Math.sin(spin * 0.4) * 0.14, 0.055, -HIP_HALF - 0.04],
      footR: [-Math.sin(spin * 0.4) * 0.14, 0.055, HIP_HALF + 0.04],
      handL: [0.05, SH_Y + 0.02, -0.66], handR: [0.05, SH_Y + 0.02, 0.66],
      hipY: HIP_Y, shY: SH_Y + 0.02, headY: HEAD_Y + 0.03,
      leanX: 0.04, leanZ: Math.sin(spin * 0.4) * 0.1, torsoYaw: Math.sin(spin * 0.7) * 0.4
    };
  }
  if (kind === 2) {
    // leap + fist pump
    const hop = Math.max(0, Math.sin(c * Math.PI)) * 0.35;
    return {
      footL: [-0.1, 0.12 + hop * 0.4, -HIP_HALF], footR: [0.12, 0.1 + hop * 0.3, HIP_HALF],
      handL: [0.1, SH_Y - 0.3, -(SH_HALF + 0.1)], handR: [0.12, SH_Y + 0.5, SH_HALF * 0.4],
      hipY: HIP_Y + hop, shY: SH_Y + hop, headY: HEAD_Y + hop,
      leanX: -0.06, leanZ: 0, torsoYaw: 0
    };
  }
  // heart / arms up — both hands meet overhead
  const up = Math.min(1, c * 1.4);
  return {
    footL: [0.02, 0.055, -HIP_HALF], footR: [0.02, 0.055, HIP_HALF],
    handL: [lerp(-0.3, 0.02, up), lerp(SH_Y - 0.3, HEAD_Y + 0.24, up), lerp(-0.5, -0.06, up)],
    handR: [lerp(0.3, 0.02, up), lerp(SH_Y - 0.3, HEAD_Y + 0.24, up), lerp(0.5, 0.06, up)],
    hipY: HIP_Y, shY: SH_Y, headY: HEAD_Y,
    leanX: -0.08, leanZ: 0, torsoYaw: 0
  };
}

function stumbleTargets(base: LimbTargets): LimbTargets {
  return {
    ...base,
    hipY: base.hipY - 0.18, shY: base.shY - 0.22, headY: base.headY - 0.26,
    leanX: -0.14, torsoYaw: 0.1,
    handL: [-0.2, SH_Y - 0.4, -0.5], handR: [0.1, SH_Y - 0.5, 0.55]
  };
}

/** stepover: legs circle around the ball; chop: hard lateral cut pose */
function skillTargets(p: PlayerState, base: LimbTargets, t: number): LimbTargets {
  const k = clamp(1 - p.skillT / 0.42, 0, 1);
  if (p.skill === "stepover") {
    const c = Math.sin(k * Math.PI * 2);
    return {
      ...base,
      footR: [Math.cos(k * Math.PI * 2) * 0.3, 0.055 + Math.max(0, c) * 0.3, HIP_HALF + c * 0.15],
      torsoYaw: c * 0.2,
      leanX: 0.12
    };
  }
  // chop — plant + cut
  return {
    ...base,
    footL: [0.3, 0.055, -HIP_HALF - 0.16],
    footR: [0.36, 0.1 + Math.sin(k * Math.PI) * 0.14, HIP_HALF + 0.1],
    leanX: 0.2, torsoYaw: -0.3 + k * 0.3
  };
}

/* ------------------------------------------------------------------ */
/*  Per-frame driver                                                   */
/* ------------------------------------------------------------------ */

const kit = game.racketSports("aura-fc-3d");

/**
 * Pose one athlete. `t` is wall seconds for idle sway/spin poses.
 * Ball position only matters for trap poses (first touch toward the ball).
 */
export function poseAthlete(rig: AthleteRig, p: PlayerState, t: number, opts?: { ballX?: number; ballZ?: number; hasBall?: boolean }): void {
  const ryaw = -p.yaw;
  const root: V3 = [p.x, 0, p.z];
  const W = (l: readonly number[]): V3 => kit.localToWorld(root, ryaw, [1, 1, 1], l as V3) as V3;

  let pose: LimbTargets;
  if (p.diveT > 0 && p.isKeeper) pose = diveTargets(p);
  else if (p.slideT > 0) pose = slideTargets(p);
  else if (p.celebrateT > 0.2) pose = celebrateTargets(p, t);
  else {
    pose = runTargets(p, t, opts?.hasBall === true);
    if (p.kickT > 0.02) pose = kickTargets(p, pose);
    else if (p.skillT > 0 && p.skill !== "none") pose = skillTargets(p, pose, t);
    else if (p.stunT > 0) pose = stumbleTargets(pose);
    else if (p.isKeeper && p.speed < 0.8) pose = keeperSetTargets(p, pose, t);
    else if (p.trapT > 0 && opts?.ballX !== undefined) {
      // first touch: extend the near foot toward the incoming ball
      const dx = opts.ballX - p.x, dz = (opts.ballZ ?? 0) - p.z;
      const c = Math.cos(ryaw), s = Math.sin(ryaw);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      const dl = Math.hypot(lx, lz) || 1;
      pose = { ...pose, footR: [lx / dl * 0.42, 0.1, lz / dl * 0.42] };
    }
  }

  const hipY = pose.hipY, shY = pose.shY, headY = pose.headY;
  const lx = pose.leanX, lz = pose.leanZ;

  // core chain
  const hips = W([0, hipY, 0]);
  const chest = W([lx, shY, lz]);
  const headP = W([lx * 1.3, headY, lz * 1.3]);
  kit.orientCylinderBetween(rig.torso, hips, chest, 0.19, 0.155);
  rig.shorts.setPosition(hips[0], hips[1] + 0.03, hips[2]).setRotation(0, ryaw + pose.torsoYaw * 0.3, 0).setScale([1, 1, 1]);
  rig.head.setPosition(headP[0], headP[1] + 0.1, headP[2]).setScale([0.2, 0.235, 0.2]);
  rig.hair.setPosition(headP[0], headP[1] + 0.21, headP[2]).setRotation(0, ryaw, 0).setScale([0.2, 0.08, 0.2]);

  // arms — 2-bone IK from shoulder to posed hand target
  const shoulderR = W([lx * 0.7, shY + 0.03, SH_HALF + lz]);
  const shoulderL = W([lx * 0.7, shY + 0.03, -SH_HALF + lz]);
  const handR = W(pose.handR);
  const handL = W(pose.handL);
  const elbowR = kit.solveArmElbow(shoulderR, handR, 1, UARM_L, FARM_L);
  const elbowL = kit.solveArmElbow(shoulderL, handL, -1, UARM_L, FARM_L);
  kit.orientCylinderBetween(rig.uarmR, shoulderR, elbowR, 0.052);
  kit.orientCylinderBetween(rig.farmR, elbowR, handR, 0.044);
  kit.orientCylinderBetween(rig.uarmL, shoulderL, elbowL, 0.052);
  kit.orientCylinderBetween(rig.farmL, elbowL, handL, 0.044);
  rig.handR.setPosition(handR[0], handR[1], handR[2]).setScale([0.072, 0.072, 0.072]);
  rig.handL.setPosition(handL[0], handL[1], handL[2]).setScale([0.072, 0.072, 0.072]);

  // legs — knees forward in the facing direction (soccer knees bend +X local)
  for (const side of [-1, 1] as const) {
    const footLocal = side < 0 ? pose.footL : pose.footR;
    const hip = W([0, hipY, side * HIP_HALF]);
    const foot = W(footLocal);
    // knee: 2-bone solution biased forward — solveArmElbow sideSign flips bend
    const knee = kit.solveArmElbow(hip, foot, side * -1, THIGH_L, SHIN_L);
    const thigh = side < 0 ? rig.thighL : rig.thighR;
    const shin = side < 0 ? rig.shinL : rig.shinR;
    const shoe = side < 0 ? rig.shoeL : rig.shoeR;
    kit.orientCylinderBetween(thigh, hip, knee, 0.075);
    kit.orientCylinderBetween(shin, knee, foot, 0.055);
    shoe.setPosition(foot[0], Math.max(0.06, foot[1]), foot[2]).setRotation(0, ryaw, 0).setScale([1, 1, 1]);
  }

  // shadow + selection ring
  rig.shadow.setPosition(p.x, 0.014, p.z).setScale([1, 1, 1]);
  const pulse = 1 + Math.sin(t * 6) * 0.07;
  rig.ring.setPosition(p.x, 0.03, p.z).setRotation(Math.PI / 2, 0, 0)
    .setScale([pulse, pulse, pulse])
    .setVisible(p.controlled);
}

export function hideAthlete(rig: AthleteRig): void {
  for (const h of [rig.shadow, rig.ring, rig.shorts, rig.torso, rig.head, rig.hair,
    rig.uarmL, rig.uarmR, rig.farmL, rig.farmR, rig.handL, rig.handR,
    rig.thighL, rig.thighR, rig.shinL, rig.shinR, rig.shoeL, rig.shoeR]) {
    h?.setVisible?.(false);
  }
}
