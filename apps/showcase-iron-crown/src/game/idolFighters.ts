import { game, group, model, type AuraAssetRef, type AuraRuntimeNodeHandle, type AuraSceneNode } from "@aura3d/engine";
import { computeGladiatorJointPose, type GladiatorPoseState } from "../art/proceduralModels";
import { idolAssets } from "./idol-assets";
import { IC_IDOL_RIGS } from "./idol-rigs";
import {
  eulerZYXFromQ,
  idolBind,
  qConj,
  qEulerZYX,
  qFromTo,
  qMul,
  qNorm,
  qRot,
  solveIdolPose,
  type HumanoidDrive,
  type IdolSkeleton,
  type Q,
  type V3
} from "./idolHumanoid";
import type { FighterId } from "./fighters";
import { fighterById } from "./fighters";
import { moveFor, type AttackKind } from "./moves";
import { createMocapBlend, fighterClip, fighterMocapSample, MAX_ARM_ELEVATION, mocapClip, mocapDrive, sampleMocap, type FighterMocapClip, type MocapAttack, type MocapBlendState } from "./idolMocap";

/**
 * Idol wow pass: each fighter is a rigged Idol image-to-3D GLB (one per side colour), its unnamed bones driven every
 * frame from the same `computeGladiatorJointPose` joint rotations that pose the procedural gladiator, so moves, timing
 * and hit frames are unchanged. Held weapons are separate Idol models placed on the posed hand. Falls back to the
 * procedural gladiator when a model is missing or `?icfighters=procedural`.
 */

export type IdolSide = "p1" | "cpu";

export const IDOL_FIGHTER_KEYS: Readonly<Record<FighterId, Readonly<Record<IdolSide, string>>>> = {
  kenji: { p1: "icKenjiP1", cpu: "icKenjiP2" },
  volt: { p1: "icVoltP1", cpu: "icVoltP2" },
  boulder: { p1: "icBoulderP1", cpu: "icBoulderP2" },
  seraph: { p1: "icSeraphP1", cpu: "icSeraphP2" },
  jinx: { p1: "icJinxP1", cpu: "icJinxP2" },
  sovereign: { p1: "icSovereignP1", cpu: "icSovereignP2" }
};

/**
 * Held props, in the procedural weapon/shield joint frame (origin at the grip, blade or shaft along +Z). `grip` and `tip`
 * are measured on the Idol model (metres, model space): the model is turned so grip->tip runs along +Z, rolled by `roll`
 * about that axis, and moved so the grip sits at the joint origin.
 */
export interface IdolHeldProp {
  readonly key: string;
  readonly joint: "weapon" | "shield";
  readonly grip: V3;
  readonly tip: V3;
  readonly roll?: number;
}

export const IDOL_HELD_PROPS: Readonly<Partial<Record<FighterId, readonly IdolHeldProp[]>>> = {
  // Idol spear stands tip-up, 1.98 m; held 0.56 m from the butt like the procedural spear (z -0.56..1.42).
  seraph: [{ key: "icSeraphSpear", joint: "weapon", grip: [0, 0.56, 0], tip: [0, 1.98, 0] }],
  // Idol kunai: handle low at +X, curved blade rising to the tip at -X.
  jinx: [{ key: "icJinxKunai", joint: "weapon", grip: [0.27, 0.04, 0], tip: [-0.31, 0.32, 0] }],
  sovereign: [
    // Idol sword stands blade-down: pommel at the top (1.5 m), grip centre at 1.33 m.
    { key: "icSovereignSword", joint: "weapon", grip: [0, 1.33, 0], tip: [0, 0, 0] },
    // Idol shield faces +Z, 0.62 m tall: turned to face outward (+X of the left forearm), centre 12 cm off the arm.
    { key: "icSovereignShield", joint: "shield", grip: [0, 0.31, -0.12], tip: [-1, 0.31, -0.12] }
  ]
};

/** Model-node position and Euler rotation that put a held prop's grip at the joint origin, blade along +Z. */
export function heldPropPlacement(p: IdolHeldProp): { readonly position: V3; readonly rotation: V3 } {
  const q = qMul(qEulerZYX([0, 0, p.roll ?? 0]), qFromTo([p.tip[0] - p.grip[0], p.tip[1] - p.grip[1], p.tip[2] - p.grip[2]], [0, 0, 1]));
  const g = qRot(q, p.grip);
  return { position: [-g[0], -g[1], -g[2]], rotation: eulerZYXFromQ(q) };
}

const catalog = idolAssets as unknown as Partial<Record<string, AuraAssetRef<"model">>>;

export function idolModelAsset(key: string): AuraAssetRef<"model"> | undefined {
  const ref = catalog[key];
  return ref?.type === "model" ? ref : undefined;
}

export function idolFighterRig(fighter: FighterId, side: IdolSide): { readonly asset: AuraAssetRef<"model">; readonly skel: IdolSkeleton; readonly key: string } | undefined {
  const key = IDOL_FIGHTER_KEYS[fighter][side];
  const asset = idolModelAsset(key);
  const skel = IC_IDOL_RIGS[key];
  return asset && skel ? { asset, skel, key } : undefined;
}

/** `?icfighters=procedural` keeps the procedural gladiators (comparison and fallback). */
export function idolFightersEnabled(): boolean {
  if (typeof location === "undefined") return true;
  return new URLSearchParams(location.search).get("icfighters") !== "procedural";
}

export const idolBodyId = (nodeId: string) => `${nodeId}-idol`;
export const idolPropId = (nodeId: string, i: number) => `${nodeId}-idol-prop-${i}`;

export interface IdolFighterNodeOptions {
  readonly nodeId: string;
  readonly label: string;
  readonly fighter: FighterId;
  readonly side: IdolSide;
  readonly position: V3;
  readonly yaw: number;
  readonly scale: number;
  /** Studio palette multiply tint (undefined: the model's own colours). */
  readonly tint?: string;
  /** Fresnel rim in the fighter's accent colour (IC47-M2 surface extras). */
  readonly rim?: { readonly color: string; readonly power: number; readonly intensity: number };
  readonly clearcoat?: { readonly clearcoat: number; readonly clearcoatRoughness: number };
  readonly runtimeTags: readonly string[];
}

/** The Idol fighter node, or undefined when its model or rig data is not available. */
export function buildIdolFighterNode(o: IdolFighterNodeOptions) {
  const rig = idolFighterRig(o.fighter, o.side);
  if (!rig) return undefined;
  const overrides = o.tint || o.rim || o.clearcoat
    ? [{ target: "*", ...(o.tint ? { color: o.tint, colorMode: "multiply" as const } : {}), ...(o.rim ? { rim: o.rim } : {}), ...(o.clearcoat ?? {}) }]
    : undefined;
  const children: AuraSceneNode[] = [
    // Rigged Idol GLBs are stored at unit height (skinning stays unscaled); the node applies the fighter-size scale.
    model(rig.asset, { name: `${o.label} idol body`, scaleMode: "world", castShadow: true, receiveShadow: true, scale: rig.skel.sceneScale ?? 1, ...(overrides ? { materialOverrides: overrides } : {}) })
      .runtime(game.runtimeNode(idolBodyId(o.nodeId), { tags: ["fighter", "idol", o.fighter] })) as unknown as AuraSceneNode
  ];
  (IDOL_HELD_PROPS[o.fighter] ?? []).forEach((prop, i) => {
    const asset = idolModelAsset(prop.key);
    if (!asset) return;
    children.push(
      group(`${o.label} idol prop ${i}`, [
        model(asset, { name: `${o.label} ${prop.key}`, scaleMode: "world", castShadow: true, receiveShadow: true })
          .position(...heldPropPlacement(prop).position)
          .rotate(...heldPropPlacement(prop).rotation) as unknown as AuraSceneNode
      ]).runtime(game.runtimeNode(idolPropId(o.nodeId, i), { tags: ["fighter", "idol-prop", o.fighter] })) as unknown as AuraSceneNode
    );
  });
  return group(o.label, children)
    .position(o.position[0], o.position[1], o.position[2])
    .rotate(0, o.yaw, 0)
    .scale(o.scale)
    .runtime(game.runtimeNode(o.nodeId, { tags: [...o.runtimeTags, "idol-fighter"] }));
}

const PROC_HIPS_Y = 0.94;

/** Procedural joint pose -> world (rig-space) rotations for the humanoid drive, plus the weapon/shield frames. */
export function gladiatorDrive(state: GladiatorPoseState): { readonly drive: HumanoidDrive; readonly weapon: Q; readonly shield: Q } {
  const p = computeGladiatorJointPose(state);
  const r = p.rotations;
  const hips = qEulerZYX(r.hips);
  const torso = qMul(hips, qEulerZYX(r.torso));
  const head = qMul(torso, qEulerZYX(r.head));
  const shL = qMul(torso, qEulerZYX(r["shoulder-l"]));
  const elL = qMul(shL, qEulerZYX(r["elbow-l"]));
  const shR = qMul(torso, qEulerZYX(r["shoulder-r"]));
  const elR = qMul(shR, qEulerZYX(r["elbow-r"]));
  const hipL = qMul(hips, qEulerZYX(r["hip-l"]));
  const kneeL = qMul(hipL, qEulerZYX(r["knee-l"]));
  const ankleL = qMul(kneeL, qEulerZYX(r["ankle-l"]));
  const hipR = qMul(hips, qEulerZYX(r["hip-r"]));
  const kneeR = qMul(hipR, qEulerZYX(r["knee-r"]));
  const ankleR = qMul(kneeR, qEulerZYX(r["ankle-r"]));
  return {
    drive: {
      hips,
      chest: torso,
      head,
      upperArmL: shL,
      forearmL: elL,
      upperArmR: shR,
      forearmR: elR,
      thighL: hipL,
      shinL: kneeL,
      footL: ankleL,
      thighR: hipR,
      shinR: kneeR,
      footR: ankleR,
      hipsOffset: [p.hipsPos[0], p.hipsPos[1] - PROC_HIPS_Y, p.hipsPos[2]],
      sourceHipsY: PROC_HIPS_Y
    },
    weapon: qMul(elR, qEulerZYX(r.weapon)),
    shield: qMul(elL, qEulerZYX(r.shield))
  };
}

/**
 * Solve, then lift the hips when an ankle would sink below its bind height (the Idol legs are proportioned differently
 * from the procedural rig, so a deep crouch can push a foot into the floor). Never lowers the body.
 */
export function solveIdolGrounded(skel: IdolSkeleton, drive: HumanoidDrive) {
  const first = solveIdolPose(skel, drive);
  const ro = skel.roles;
  const bind = idolBind(skel);
  const sink = Math.max(bind.worldT[ro.footL]![1] - first.worldT[ro.footL]![1], bind.worldT[ro.footR]![1] - first.worldT[ro.footR]![1]);
  if (sink <= 0.005) return first;
  const k = bind.hipsY / drive.sourceHipsY;
  return solveIdolPose(skel, { ...drive, hipsOffset: [drive.hipsOffset[0], drive.hipsOffset[1] + sink / k, drive.hipsOffset[2]] });
}

/** Palm centre past the wrist in metres for a 0.94 m hips height, scaled to each Idol skeleton. */
const PALM_REACH = 0.075;
/** Shield sits on the outer forearm, measured from the elbow toward the wrist (fraction of the forearm). */
const SHIELD_ALONG = 0.45;

/**
 * Pose one Idol fighter for this frame. Returns false when the fighter has no Idol body (the caller then keeps
 * posing the procedural gladiator).
 */
/** Pose state from main.ts: the procedural pose state plus the sim timing the mocap clips need. */
export interface IdolPoseState extends GladiatorPoseState {
  /** Seconds since the logical state began. */
  readonly clipTime?: number;
  /** Sim hold of the current state and of the layered attack (seconds). */
  readonly hold?: number;
  readonly layerDuration?: number;
  /**
   * Forward distance (fighter-local metres, the fighter group's own scale removed) from this fighter's root to the
   * opponent's body surface. Attacks lunge the body toward it so the strike lands on the opponent at the hit frame.
   */
  readonly reachTo?: number;
}

/** `?icmocap=0` drives the Idol fighters from the old procedural joint pose instead of the motion-captured clips. */
export function idolMocapEnabled(): boolean {
  if (typeof location === "undefined") return true;
  return new URLSearchParams(location.search).get("icmocap") !== "0";
}

const blends = new Map<string, MocapBlendState>();

/** Sim first-active-frame fraction of a hold for this fighter's move (frame data at 60 fps). */
export function simHitFraction(fighter: FighterId, kind: AttackKind, holdSeconds: number | undefined): number | undefined {
  if (!holdSeconds || holdSeconds <= 0) return undefined;
  const move = moveFor(kind, fighterById(fighter));
  return ((move.activeFrames?.[0] ?? 1) / 60) / holdSeconds;
}

/** The posed Idol skeleton for one frame (mocap clips, or the procedural joint pose with `?icmocap=0`). */
export function idolFighterPose(skel: IdolSkeleton, fighter: FighterId, state: IdolPoseState, blendKey?: string) {
  if (!idolMocapEnabled()) {
    const { drive } = gladiatorDrive(state);
    return { drive, solved: solveIdolGrounded(skel, drive) };
  }
  let blend = blendKey ? blends.get(blendKey) : undefined;
  if (blendKey && !blend) blends.set(blendKey, (blend = createMocapBlend()));
  const attack = state.clip === "light" || state.clip === "heavy" || state.clip === "special" || state.clip === "throw" ? state.clip : undefined;
  const sample = fighterMocapSample(
    {
      clip: state.clip as FighterMocapClip,
      fighter,
      time: state.time,
      clipTime: state.clipTime ?? (state.clipProgress ?? 0) * (state.hold ?? 1),
      clipProgress: state.clipProgress ?? 0,
      moveDir: state.moveDir ?? 1,
      layerAttack: state.layerAttack ?? undefined,
      layerProgress: state.layerProgress,
      hitFraction: attack ? simHitFraction(fighter, attack, state.hold) : undefined,
      layerHitFraction: state.layerAttack ? simHitFraction(fighter, state.layerAttack, state.layerDuration) : undefined
    },
    blend
  );
  let drive = mocapDrive(skel, sample, fighterArmElevation(fighter), FIGHTER_SPINE_BEND[fighter] ?? Infinity, FIGHTER_ARM_BACK[fighter] ?? Infinity);
  const lunge = strikeLunge(skel, fighter, state);
  if (lunge > 0) {
    const b = idolBind(skel);
    drive = { ...drive, hipsOffset: [drive.hipsOffset[0], drive.hipsOffset[1], drive.hipsOffset[2] + lunge / b.hipsY] };
  }
  return { drive, solved: solveIdolGrounded(skel, drive) };
}

/**
 * Per-fighter arm-elevation limit (radians from the chest's down axis). Boulder (regenerated in an A-pose with a compact
 * torso) still folds his shoulder skin with the arms raised past shoulder height (CPU-skinned QA), so his stop below it.
 */
export const FIGHTER_ARM_ELEVATION: Partial<Record<FighterId, number>> = { boulder: (60 * Math.PI) / 180 };
/** Per-fighter chest bend limit against the hips (radians; see idolMocap.ts limitSpine). */
export const FIGHTER_SPINE_BEND: Partial<Record<FighterId, number>> = { boulder: (25 * Math.PI) / 180 };
/** Per-fighter limit on arms swung behind the chest (radians; see idolMocap.ts clampArmBack). */
export const FIGHTER_ARM_BACK: Partial<Record<FighterId, number>> = { boulder: (10 * Math.PI) / 180 };
export function fighterArmElevation(fighter: FighterId): number {
  return FIGHTER_ARM_ELEVATION[fighter] ?? MAX_ARM_ELEVATION;
}

/** Held-weapon reach past the striking hand (metres, scene scale) for the weapon fighters' hand strikes. */
export const WEAPON_REACH: Partial<Record<FighterId, number>> = { seraph: 1.25, sovereign: 0.75, jinx: 0.18 };
/** Largest body lunge a strike may add (metres): beyond it the opponent is simply out of range. */
export const MAX_STRIKE_LUNGE = 0.55;
const reachCache = new WeakMap<IdolSkeleton, Map<string, number>>();

/**
 * How far forward the striking limb reaches at the clip's strike frame on this skeleton (fighter-local +Z): the furthest
 * fist or foot, or the weapon tip for a weapon fighter's hand strike. Cached per skeleton and clip.
 */
export function strikeReach(skel: IdolSkeleton, fighter: FighterId, kind: MocapAttack): number {
  let bySkel = reachCache.get(skel);
  if (!bySkel) reachCache.set(skel, (bySkel = new Map()));
  const clip = fighterClip(fighter, kind);
  const hit = bySkel.get(`${fighter}|${clip}`);
  if (hit !== undefined) return hit;
  const solved = solveIdolGrounded(skel, mocapDrive(skel, sampleMocap(clip, mocapClip(clip).contact, false), fighterArmElevation(fighter), FIGHTER_SPINE_BEND[fighter] ?? Infinity, FIGHTER_ARM_BACK[fighter] ?? Infinity));
  const ro = skel.roles;
  const z = (i: number) => solved.worldT[i]![2];
  const hand = Math.max(z(ro.handL), z(ro.handR)) + (WEAPON_REACH[fighter] ?? 0);
  const foot = Math.max(z(ro.footL), z(ro.footR));
  const reach = Math.max(hand, foot);
  bySkel.set(`${fighter}|${clip}`, reach);
  return reach;
}

/** 0 -> 1 into the strike frame, held through the active window, back to 0 by the end of the move. */
function lungeEnvelope(p: number, hit: number): number {
  const s = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
  const hold = Math.min(0.95, hit + 0.18);
  if (p <= hit) return s(p / Math.max(0.05, hit));
  if (p <= hold) return 1;
  return 1 - s((p - hold) / Math.max(0.05, 1 - hold));
}

/** Forward body lunge (metres) that carries this frame's strike onto the opponent (0 when not attacking or in range). */
export function strikeLunge(skel: IdolSkeleton, fighter: FighterId, state: IdolPoseState): number {
  if (state.reachTo === undefined || !Number.isFinite(state.reachTo)) return 0;
  const attacks = ["light", "heavy", "special", "throw"] as const;
  const main = (attacks as readonly string[]).includes(state.clip) ? (state.clip as MocapAttack) : undefined;
  const kind = main ?? (state.layerAttack ?? undefined);
  if (!kind) return 0;
  const p = main ? (state.clipProgress ?? 0) : (state.layerProgress ?? 0);
  const hit = (main ? simHitFraction(fighter, kind, state.hold) : simHitFraction(fighter, kind, state.layerDuration)) ?? 0.3;
  const need = Math.max(0, Math.min(MAX_STRIKE_LUNGE, state.reachTo - strikeReach(skel, fighter, kind)));
  return need * lungeEnvelope(p, Math.max(0.05, Math.min(0.9, hit)));
}

/**
 * Held props follow the posed hand (weapons) or forearm (shield): world = bone posed * bone bind^-1 * grip calibration.
 * Calibration: the procedural weapon/shield frame has +Y pointing back up the forearm (toward the elbow) and the blade
 * along +Z; at the Idol bind that is the shortest turn of +Y onto the reversed finger direction.
 */
export function heldPropTransform(skel: IdolSkeleton, solved: ReturnType<typeof solveIdolPose>, joint: "weapon" | "shield") {
  const ro = skel.roles;
  const b = idolBind(skel);
  const bone = joint === "weapon" ? ro.handR : ro.forearmL;
  const tip = joint === "weapon" ? ro.handR : ro.handL;
  const base = joint === "weapon" ? ro.forearmR : ro.forearmL;
  const finger: V3 = [b.worldT[tip]![0] - b.worldT[base]![0], b.worldT[tip]![1] - b.worldT[base]![1], b.worldT[tip]![2] - b.worldT[base]![2]];
  const fl = Math.hypot(...finger) || 1;
  const fingerDir: V3 = [finger[0] / fl, finger[1] / fl, finger[2] / fl];
  const calib = qFromTo([0, 1, 0], [-fingerDir[0], -fingerDir[1], -fingerDir[2]]);
  const delta = qNorm(qMul(solved.worldR[bone]!, qConj(b.worldR[bone]!)));
  const rot = qNorm(qMul(delta, calib));
  const posed = qRot(delta, fingerDir);
  const k = b.hipsY / PROC_HIPS_Y;
  let pos: V3;
  if (joint === "weapon") {
    const w = solved.worldT[ro.handR]!;
    pos = [w[0] + posed[0] * PALM_REACH * k, w[1] + posed[1] * PALM_REACH * k, w[2] + posed[2] * PALM_REACH * k];
  } else {
    const e = solved.worldT[ro.forearmL]!, w = solved.worldT[ro.handL]!;
    pos = [e[0] + (w[0] - e[0]) * SHIELD_ALONG, e[1] + (w[1] - e[1]) * SHIELD_ALONG, e[2] + (w[2] - e[2]) * SHIELD_ALONG];
  }
  return { pos, rot };
}

/**
 * Pose one Idol fighter for this frame. Returns false when the fighter has no Idol body (the caller then keeps
 * posing the procedural gladiator).
 */
export function poseIdolFighter(
  getNode: (id: string) => AuraRuntimeNodeHandle | undefined,
  nodeId: string,
  fighter: FighterId,
  side: IdolSide,
  state: IdolPoseState
): boolean {
  const body = getNode(idolBodyId(nodeId)) as (AuraRuntimeNodeHandle & { setAnimationPose?: (pose: unknown) => unknown }) | undefined;
  const rig = idolFighterRig(fighter, side);
  if (!body?.setAnimationPose || !rig) return false;
  const { solved } = idolFighterPose(rig.skel, fighter, state, nodeId);
  body.setAnimationPose({ bones: solved.bones, mode: "replace" });
  (IDOL_HELD_PROPS[fighter] ?? []).forEach((prop, i) => {
    const node = getNode(idolPropId(nodeId, i));
    if (!node) return;
    const { pos, rot } = heldPropTransform(rig.skel, solved, prop.joint);
    node.setPosition(pos[0], pos[1], pos[2]);
    const e = eulerZYXFromQ(rot);
    node.setRotation(e[0], e[1], e[2]);
  });
  return true;
}
