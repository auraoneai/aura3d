// Aura FC 3D — Bespoke 3D Meshy soccer athlete rigs (`fcSoccerStrikerMeshy` & `fcGoalkeeperMeshy`).
//
// Each outfielder uses `assets.fcSoccerStrikerMeshy` and each goalkeeper uses
// `assets.fcGoalkeeperMeshy`, grounded at `minY = 0` and driven per-frame with
// stride bounce, sprint/shot pitch lean, keeper dive roll, facing yaw, contact
// shadow, chest club-kit badge, and tactical team/selection turf rings.

import { game, material, model, primitives } from "@aura3d/engine";
import { assets } from "../aura-assets-v2";
import type { PlayerState } from "./types";

export type RigNode = any;

export interface AthleteRig {
  readonly id: string;
  body: RigNode;
  shadow: RigNode; ring: RigNode;
  shorts: RigNode; torso: RigNode; head: RigNode; hair: RigNode;
  uarmL: RigNode; farmL: RigNode; handL: RigNode;
  uarmR: RigNode; farmR: RigNode; handR: RigNode;
  thighL: RigNode; shinL: RigNode; shoeL: RigNode;
  thighR: RigNode; shinR: RigNode; shoeR: RigNode;
  kitKey: string;
  jerseyColor: string;
  trimColor: string;
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
const HIDDEN: [number, number, number] = [0.0001, 0.0001, 0.0001];

export function skinFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return SKIN_TONES[h % SKIN_TONES.length];
}

function isPowerFrameRole(id: string): boolean {
  return id.endsWith("-gk") || id.endsWith("-df0") || id.endsWith("-df1");
}

/* ------------------------------------------------------------------ */

/** Build the scene nodes for one athlete: bespoke 3D Meshy soccer player + team markers. */
export function athleteNodes(id: string): RigNode[] {
  const ph = material.pbr({ color: "#888888", roughness: 0.8 });
  const isKeeper = id.endsWith("-gk");
  const isPower = isPowerFrameRole(id);
  const bodyAsset = isKeeper ? assets.fcGoalkeeperMeshy : assets.fcSoccerStrikerMeshy;

  const limb = (name: string) =>
    primitives.capsule({ name, size: [1, 1, 1], material: ph }).position(0, -20, 0).scale(HIDDEN).runtime(game.runtimeNode(name));
  const joint = (name: string) =>
    primitives.sphere({ name, size: [1, 1, 1], material: ph }).position(0, -20, 0).scale(HIDDEN).runtime(game.runtimeNode(name));
  return [
    model(bodyAsset, {
      name: `${id}-body`,
      targetHeight: isKeeper ? 1.92 : isPower ? 1.86 : 1.82
    } as any)
      .position(0, 0, 0)
      .runtime(game.runtimeNode(`${id}-body`)),
    primitives.cylinder({ name: `${id}-shadow`, size: [1, 0.01, 1], material: material.pbr({ color: "#000000", roughness: 1, opacity: 0.32 }) })
      .runtime(game.runtimeNode(`${id}-shadow`)),
    primitives.torus({ name: `${id}-ring`, size: [0.68, 0.04, 0.04], material: material.emissive({ color: "#d8ff3e", emissive: "#d8ff3e", emissiveIntensity: 1.1 }) })
      .runtime(game.runtimeNode(`${id}-ring`)),
    primitives.box({ name: `${id}-shorts`, size: [0.24, 0.16, 0.18], material: ph }).position(0, -20, 0).scale(HIDDEN).runtime(game.runtimeNode(`${id}-shorts`)),
    limb(`${id}-torso`),
    joint(`${id}-head`),
    primitives.cylinder({ name: `${id}-hair`, size: [1, 1, 1], material: ph }).position(0, -20, 0).scale(HIDDEN).runtime(game.runtimeNode(`${id}-hair`)),
    limb(`${id}-uarm-l`), limb(`${id}-uarm-r`),
    limb(`${id}-farm-l`), limb(`${id}-farm-r`),
    joint(`${id}-hand-l`), joint(`${id}-hand-r`),
    limb(`${id}-thigh-l`), limb(`${id}-thigh-r`),
    limb(`${id}-shin-l`), limb(`${id}-shin-r`),
    primitives.box({ name: `${id}-shoe-l`, size: [0.32, 0.11, 0.15], material: ph }).position(0, -20, 0).scale(HIDDEN).runtime(game.runtimeNode(`${id}-shoe-l`)),
    primitives.box({ name: `${id}-shoe-r`, size: [0.32, 0.11, 0.15], material: ph }).position(0, -20, 0).scale(HIDDEN).runtime(game.runtimeNode(`${id}-shoe-r`))
  ];
}

export function resolveAthlete(app: any, id: string): AthleteRig {
  const req = (n: string) => app.nodes.require(`${id}-${n}`);
  return {
    id,
    body: req("body"),
    shadow: req("shadow"), ring: req("ring"),
    shorts: req("shorts"), torso: req("torso"), head: req("head"), hair: req("hair"),
    uarmL: req("uarm-l"), farmL: req("farm-l"), handL: req("hand-l"),
    uarmR: req("uarm-r"), farmR: req("farm-r"), handR: req("hand-r"),
    thighL: req("thigh-l"), shinL: req("shin-l"), shoeL: req("shoe-l"),
    thighR: req("thigh-r"), shinR: req("shin-r"), shoeR: req("shoe-r"),
    kitKey: "",
    jerseyColor: "#1d63ff",
    trimColor: "#d8ff3e"
  };
}

/** Retint when the kit key changes (club switch / studio edit). */
export function applyAthleteKit(rig: AthleteRig, kit: AthleteKit): void {
  const key = `${kit.jersey}|${kit.shorts}|${kit.socks}|${kit.boots}|${kit.skin}|${kit.trim}|${kit.keeper}`;
  if (rig.kitKey === key) return;
  rig.kitKey = key;
  rig.jerseyColor = kit.jersey;
  rig.trimColor = kit.trim || "#d8ff3e";
  const jersey = material.pbr({ color: kit.jersey, roughness: 0.55, metalness: 0.1 });
  const shorts = material.pbr({ color: kit.shorts, roughness: 0.68 });
  rig.torso.setMaterial(jersey);
  rig.shorts.setMaterial(shorts);
  rig.ring.setMaterial(material.emissive({ color: kit.jersey, emissive: kit.jersey, emissiveIntensity: 0.95 }));
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
  const k = clamp(1 - p.kickT / 0.32, 0, 1);
  const swing = k < 0.35
    ? lerp(0, -0.42, k / 0.35)
    : lerp(-0.42, 0.52, (k - 0.35) / 0.65);
  const lift = Math.sin(k * Math.PI) * (0.22 + p.kickPower * 0.24);
  return {
    ...base,
    footR: [swing, 0.06 + lift, HIP_HALF * 0.85],
    footL: [-0.05, 0.055, -(HIP_HALF + 0.03)],
    handL: [0.22, SH_Y - 0.24, -(SH_HALF + 0.18)],
    handR: [-0.24, SH_Y - 0.30, SH_HALF + 0.14],
    leanX: -swing * 0.28,
    leanZ: -0.06,
    torsoYaw: -swing * 0.45
  };
}

function slideTargets(p: PlayerState): LimbTargets {
  const k = clamp(p.slideT / 0.48, 0, 1);
  return {
    footR: [0.68, 0.08, 0.05],
    footL: [0.18, 0.10, -0.22],
    handL: [-0.28, 0.18, -0.32],
    handR: [0.10, 0.42, 0.32],
    hipY: 0.24 + (1 - k) * 0.12,
    shY: 0.48 + (1 - k) * 0.18,
    headY: 0.66 + (1 - k) * 0.2,
    leanX: -0.34,
    leanZ: -0.12,
    torsoYaw: 0.3,
    lying: "front"
  };
}

function diveTargets(p: PlayerState): LimbTargets {
  const side = p.diveDir || 1;
  const k = clamp(1 - p.diveT / 0.72, 0, 1);
  const arc = Math.sin(k * Math.PI);
  const low = k > 0.65 ? (k - 0.65) / 0.35 : 0;
  const bodyY = lerp(0.75 + arc * 0.35, 0.28, low);
  return {
    footL: [0.0, Math.max(0.08, bodyY - 0.28), -side * 0.55],
    footR: [0.05, Math.max(0.10, bodyY - 0.20), -side * 0.38],
    handL: [0.24, bodyY + 0.22 - low * 0.12, side * 0.78],
    handR: [0.28, bodyY + 0.28 - low * 0.14, side * 0.90],
    hipY: bodyY - 0.08,
    shY: bodyY + 0.10,
    headY: bodyY + 0.22,
    leanX: 0.05,
    leanZ: side * (0.35 + k * 0.25),
    torsoYaw: 0,
    lying: side > 0 ? "right" : "left"
  };
}

function keeperSetTargets(p: PlayerState, base: LimbTargets, t: number): LimbTargets {
  void p;
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
    return {
      footL: [-0.3, 0.1, -HIP_HALF - 0.05], footR: [-0.3, 0.1, HIP_HALF + 0.05],
      handL: [-0.1, SH_Y - 0.28, -0.62], handR: [-0.1, SH_Y - 0.28, 0.62],
      hipY: lerp(HIP_Y, 0.5, c), shY: lerp(SH_Y, 0.92, c), headY: lerp(HEAD_Y, 1.14, c),
      leanX: -0.22, leanZ: 0, torsoYaw: 0
    };
  }
  if (kind === 1) {
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
    const hop = Math.max(0, Math.sin(c * Math.PI)) * 0.35;
    return {
      footL: [-0.1, 0.12 + hop * 0.4, -HIP_HALF], footR: [0.12, 0.1 + hop * 0.3, HIP_HALF],
      handL: [0.1, SH_Y - 0.3, -(SH_HALF + 0.1)], handR: [0.12, SH_Y + 0.5, SH_HALF * 0.4],
      hipY: HIP_Y + hop, shY: SH_Y + hop, headY: HEAD_Y + hop,
      leanX: -0.06, leanZ: 0, torsoYaw: 0
    };
  }
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

function skillTargets(p: PlayerState, base: LimbTargets, _t: number): LimbTargets {
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
 * Pose one athlete: updates the 3D Meshy athlete model's world transform + skeletal
 * animation clip, then aligns the team-colored kit overlays onto the character.
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
      const dx = opts.ballX - p.x, dz = (opts.ballZ ?? 0) - p.z;
      const c = Math.cos(ryaw), s = Math.sin(ryaw);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      const dl = Math.hypot(lx, lz) || 1;
      pose = { ...pose, footR: [lx / dl * 0.42, 0.1, lz / dl * 0.42] };
    }
  }

  // 1. Ground and orient the bespoke 3D Meshy soccer athlete GLB (`rig.body`)
  // Model forward is +Z; sim yaw=0 is +X, yaw=PI/2 is +Z -> modelY = PI/2 - p.yaw
  const modelY = Math.PI / 2 - p.yaw + pose.torsoYaw * 0.35;
  const groundY = p.slideT > 0 ? 0.08 : p.diveT > 0 ? 0.16 : Math.max(0, pose.hipY - HIP_Y);
  const diveRoll = p.diveT > 0 ? -p.diveDir * 0.95 : pose.leanZ * 0.45;
  rig.body
    ?.setPosition(p.x, groundY, p.z)
    .setRotation(pose.leanX * 0.65, modelY, diveRoll)
    .setScale([1, 1, 1])
    .setVisible(true);

  const hipY = pose.hipY, shY = pose.shY;
  const lx = pose.leanX, lz = pose.leanZ;

  // 2. Slim core team-kit chest band inside the torso silhouette for club color differentiation
  const hips = W([0, hipY + 0.12, 0]);
  const chest = W([lx * 0.7, shY - 0.04, lz * 0.7]);
  kit.orientCylinderBetween(rig.torso, hips, chest, 0.115, 0.105);

  // 3. Shadow + tactical team/controlled turf ring
  rig.shadow.setPosition(p.x, 0.014, p.z).setScale([1, 1, 1]).setVisible(true);
  const pulse = p.controlled ? 1.05 + Math.sin(t * 6) * 0.08 : 0.66;
  rig.ring.setPosition(p.x, 0.03, p.z).setRotation(Math.PI / 2, 0, 0)
    .setScale([pulse, pulse, pulse])
    .setVisible(true);
}

export function hideAthlete(rig: AthleteRig): void {
  for (const h of [rig.body, rig.shadow, rig.ring, rig.shorts, rig.torso, rig.head, rig.hair,
    rig.uarmL, rig.uarmR, rig.farmL, rig.farmR, rig.handL, rig.handR,
    rig.thighL, rig.thighR, rig.shinL, rig.shinR, rig.shoeL, rig.shoeR]) {
    h?.setVisible?.(false);
  }
}
