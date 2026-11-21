import { game, group, instances, material, model, primitives, type AuraAssetRef, type AuraNodeBuilder, type AuraSceneNode } from "@aura3d/engine";
import type { EnemyKind, WeaponId } from "../sim";
import { idolAssets } from "./idol-assets";
import { BZ_IDOL_RIGS, BZ_IDOL_RIGS_SCENE_SCALE } from "./idol-rigs";
import { enemyMocapDrive, enemyMocapPose } from "./idolMocap";

/** `?bzmocap=0` drives the Idol enemies from the procedural joint pose only. */
export function enemyMocapEnabled(): boolean {
  return typeof location === "undefined" || new URLSearchParams(location.search).get("bzmocap") !== "0";
}
import {
  eulerZYXFromQ,
  idolBind,
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
import type { EnemyRigPose } from "./proceduralModels";

/**
 * Idol wow pass for Bunker Zero: image-to-3D GLBs (speridlabs/idol/max) for the four first-person weapons, the enemies
 * (rigged bodies driven by `computeEnemyRigPose`, held guns placed on the posed hands), doors, pickups and bunker
 * dressing. Every builder returns undefined when its model is not admitted, so the procedural build stays the fallback;
 * `?bzidol=0` forces the procedural look everywhere for comparison.
 */

const catalog = idolAssets as unknown as Partial<Record<string, AuraAssetRef<"model">>>;

export function idolEnabled(): boolean {
  if (typeof location === "undefined") return true;
  return new URLSearchParams(location.search).get("bzidol") !== "0";
}

export function idolModel(key: string): AuraAssetRef<"model"> | undefined {
  if (!idolEnabled()) return undefined;
  const ref = catalog[key];
  return ref?.type === "model" ? ref : undefined;
}

/** Placement of a normalised Idol GLB (front +Z, grounded, centred) inside a procedural node's local frame. */
export interface IdolPlacement {
  readonly key: string;
  readonly position?: V3;
  readonly rotation?: V3;
  readonly scale?: number;
  /**
   * Held-prop alternative to position/rotation: the grip and the muzzle/tip measured on the Idol model (metres, model
   * space). The model is turned so grip->tip runs along +Z (then rolled about Z) and moved so the grip sits at the origin.
   */
  readonly grip?: V3;
  readonly tip?: V3;
  readonly roll?: number;
}

/** Resolve a grip/tip placement to the model node's position and Euler rotation. */
export function resolvePlacement(p: IdolPlacement): { position: V3; rotation: V3 } {
  if (!p.grip || !p.tip) return { position: p.position ?? [0, 0, 0], rotation: p.rotation ?? [0, 0, 0] };
  const q = qMul(qEulerZYX([0, 0, p.roll ?? 0]), qFromTo(sub(p.tip, p.grip), [0, 0, 1]));
  const g = mul(qRot(q, p.grip), p.scale ?? 1);
  return { position: [-g[0], -g[1], -g[2]], rotation: eulerZYXFromQ(q) };
}

/** One Idol model wrapped in a group carrying the placement, or undefined when the model is not admitted. */
export function idolPlacedGroup(name: string, p: IdolPlacement, opts: { readonly castShadow?: boolean; readonly receiveShadow?: boolean } = {}, extra: readonly AuraSceneNode[] = []) {
  const asset = idolModel(p.key);
  if (!asset) return undefined;
  const { position: pos, rotation: rot } = resolvePlacement(p);
  const inner = model(asset, { name: `${name} idol`, scaleMode: "world", castShadow: opts.castShadow ?? true, receiveShadow: opts.receiveShadow ?? true })
    .position(pos[0], pos[1], pos[2])
    .rotate(rot[0], rot[1], rot[2]);
  if (p.scale !== undefined) inner.scale(p.scale);
  return group(name, [inner as unknown as AuraSceneNode, ...extra]) as unknown as AuraNodeBuilder<AuraSceneNode>;
}

// ---------------------------------------------------------------------------------------------------------------
// First-person weapons. Each placement maps the Idol GLB into the procedural viewmodel frame (see the yaw note in
// proceduralModels.ts: pistol and mg muzzles at -X, rocket muzzle at +X, machete tip along +X/+Y).
// ---------------------------------------------------------------------------------------------------------------

export const IDOL_VIEWMODELS: Readonly<Record<WeaponId, IdolPlacement>> = {
  // Idol machete: grip top-right, tip bottom-left at 43 deg; turned tip-forward (+X/+Y) at the procedural 17 deg rake,
  // scaled from its 0.85 m blade line to the procedural 0.66 m span.
  knife: { key: "bzVmMachete", position: [0.2, 0.24, 0], rotation: [0, 0, Math.PI - 0.45], scale: 0.78 },
  // Idol pistol: muzzle at -X, grip +X (same as the procedural frame); slide top lifted to the procedural 0.068 m.
  pistol: { key: "bzVmPistol", position: [-0.04, -0.24, 0] },
  // Idol carbine: muzzle at -X like the procedural rifle; muzzle and receiver top matched (-0.438 m, 0.078 m).
  mg: { key: "bzVmCarbine", position: [-0.07, -0.111, 0] },
  // Idol launcher: generated diagonally (muzzle toward -X+Z) with a deep grip; turned muzzle-to-+X like the procedural
  // tube, tube axis (0.62 m up the model) dropped onto the procedural axis at y = 0.
  rocket: { key: "bzVmRocket", position: [-0.02, -0.53, 0], rotation: [0, (3 * Math.PI) / 4, 0], scale: 0.85 }
};

export function idolViewmodelNode(id: WeaponId, name: string) {
  return idolPlacedGroup(name, IDOL_VIEWMODELS[id], { castShadow: false, receiveShadow: false });
}

// ---------------------------------------------------------------------------------------------------------------
// Enemies.
// ---------------------------------------------------------------------------------------------------------------

export interface IdolEnemySpec {
  readonly key: string;
  /** Held gun in the right hand: grip at the origin, barrel along +Z after `rotation`. */
  readonly gun?: IdolPlacement;
  /** Right-hand grip target from the right shoulder, torso frame, metres for a 0.94 m hips height. */
  readonly gripFromShoulder?: V3;
  /** Left hand on the gun, metres from the grip along the gun's (forward, up, right) axes. */
  readonly supportOnGun?: V3;
  /** Rest pitch of the gun (radians, + aims down) before the arm aim from the sim pose. */
  readonly gunRestPitch?: number;
  /** Elbow bend for empty hands hanging at the sides (boss), radians. */
  readonly hangElbow?: number;
  /** Uniform scale on the model (match the procedural silhouette when the Idol proportions differ). */
  readonly scale?: number;
  /** Spinning barrel cluster in the gun frame (procedural, turned by the pose's `specRot[2]`). */
  readonly barrels?: { readonly at: V3; readonly length: number; readonly ring: number; readonly radius: number };
  /** Separate Idol backpack pitched by the pose's `specRot[0]`, placed in the chest frame (metres at 0.94 m hips). */
  readonly pack?: { readonly key: string; readonly offset: V3; readonly scale?: number };
}

export const IDOL_ENEMIES: Readonly<Record<EnemyKind, IdolEnemySpec>> = {
  guard: {
    key: "bzGuard",
    // The Idol rifle lies diagonally (muzzle toward +X-Z) and is about 1.2 m long; held at the procedural carbine's 0.86 m.
    gun: { key: "bzGuardRifle", grip: [-0.07, 0.12, 0.07], tip: [0.43, 0.12, -0.43], scale: 0.72 },
    gripFromShoulder: [0.07, -0.27, 0.3],
    supportOnGun: [0.27, 0.02, 0.0],
    gunRestPitch: 0.06
  },
  gunner: {
    key: "bzGunner",
    // The Idol rotary gun lies diagonally (barrels toward -X+Z), about 1.6 m long; held at 1.1 m.
    gun: { key: "bzGunnerMinigun", grip: [0.25, 0.12, -0.22], tip: [-0.6, 0.12, 0.63], scale: 0.7 },
    gripFromShoulder: [0.05, -0.42, 0.24],
    supportOnGun: [0.2, 0.14, 0.0],
    gunRestPitch: 0.02
  },
  boss: { key: "bzWarden", hangElbow: 0.35 },
  // The Idol hound stands 1.16 m to the ear tips; the procedural hound 0.96 m.
  dog: { key: "bzHound", scale: 0.83 }
};

/**
 * MOVING-PARTS pass: when the split models are admitted, the gunner holds a barrel-less housing with a procedural
 * six-barrel cluster that spins, and the Warden wears a separate backpack that pitches during volleys and venting.
 */
export const IDOL_ENEMY_SPLITS: Readonly<Partial<Record<EnemyKind, IdolEnemySpec>>> = {
  gunner: {
    ...IDOL_ENEMIES.gunner,
    // Idol housing (no barrels): socket at -X, 0.42 m up; rear pistol grip at +0.15, 0.15 m up. Six procedural barrels
    // spin in the socket (gun frame: 0.27 m above and 0.53 m ahead of the grip).
    gun: { key: "bzMinigunBody", grip: [0.15, 0.15, 0], tip: [-1, 0.15, 0], scale: 1 },
    barrels: { at: [0, 0.27, 0.5], length: 0.6, ring: 0.07, radius: 0.024 },
    supportOnGun: [0.06, 0.12, 0.36]
  },
  // Idol pack faces its louvres to +Z: turned to face backward, 1.3x (about 1 m on the 3 m Warden), hung from the chest.
  boss: { ...IDOL_ENEMIES.boss, key: "bzWardenNoPack", pack: { key: "bzWardenPack", offset: [0, -0.25, -0.2], scale: 1.3 } }
};

/** The spec in use: the split variant when all its models (and rig data) are admitted. */
export function enemySpec(kind: EnemyKind): IdolEnemySpec {
  const split = IDOL_ENEMY_SPLITS[kind];
  if (split && idolModel(split.key) && (kind === "dog" || BZ_IDOL_RIGS[split.key]) && (!split.gun || idolModel(split.gun.key)) && (!split.pack || idolModel(split.pack.key))) return split;
  return IDOL_ENEMIES[kind];
}

export const idolEnemyBodyId = (bodyId: string) => `${bodyId}-idol`;
export const idolEnemyBarrelsId = (bodyId: string) => `${bodyId}-idol-barrels`;
export const idolEnemyPackId = (bodyId: string) => `${bodyId}-idol-pack`;
export const idolEnemyVisorId = (bodyId: string) => `${bodyId}-idol-visor`;

/** Enemy kit colours: multiply tint that pulls the desert camo to dark `#525a64` slate armor, plus hostile red/amber optic rim. */
export const ENEMY_KIT: Readonly<Record<EnemyKind, { readonly tint: string; readonly accent: string }>> = {
  guard: { tint: "#525a64", accent: "#ff3a2a" },
  gunner: { tint: "#4c545e", accent: "#ff9a24" },
  boss: { tint: "#525a64", accent: "#ff2050" },
  dog: { tint: "#6b737e", accent: "#ff3a2a" }
};
export const idolEnemyGunId = (bodyId: string) => `${bodyId}-idol-gun`;

export function idolEnemyAvailable(kind: EnemyKind): boolean {
  const spec = enemySpec(kind);
  if (!idolModel(spec.key)) return false;
  return kind === "dog" || BZ_IDOL_RIGS[spec.key] !== undefined;
}

/**
 * The Idol enemy node: `body` (moved and turned by main.ts) holding the rigged model and its held gun. Undefined when
 * the model or its rig data is missing (main.ts then builds the procedural enemy).
 */
export function buildIdolEnemyNode(
  kind: EnemyKind,
  name: string,
  bind: (partId: string, part: "body") => ReturnType<typeof game.runtimeNode>,
  bodyId: string,
  castShadow: boolean
) {
  if (!idolEnemyAvailable(kind)) return undefined;
  const spec = enemySpec(kind);
  const asset = idolModel(spec.key)!;
  const children: AuraSceneNode[] = [
    // Rigged Idol GLBs are stored at unit height; the node applies the generation scale (and any per-kind trim).
    model(asset, {
      name: `${name} idol body`,
      scaleMode: "world",
      castShadow,
      receiveShadow: true,
      scale: (spec.scale ?? 1) * (BZ_IDOL_RIGS_SCENE_SCALE[spec.key] ?? 1),
      // Readability (R23): dark `#525a64` slate armor with crisp hostile red/amber rim separation (`intensity: 0.85`).
      materialOverrides: [{ target: "*", color: ENEMY_KIT[kind].tint, colorMode: "multiply", rim: { color: ENEMY_KIT[kind].accent, intensity: 0.85, power: 2.2 } }]
    } as never)
      .runtime(game.runtimeNode(idolEnemyBodyId(bodyId), { tags: ["enemy", kind, "idol"] })) as unknown as AuraSceneNode
  ];
  if (kind !== "dog") {
    // Emissive optic visor slit, posed outside the brow in parent-local metres each frame (poseIdolEnemy).
    children.push(
      primitives.box({ name: `${name} visor`, size: [0.19, 0.038, 0.036], material: material.emissive({ color: ENEMY_KIT[kind].accent, emissive: ENEMY_KIT[kind].accent, emissiveIntensity: 3.6, roughness: 0.32 }), castShadow: false, receiveShadow: false })
        .runtime(game.runtimeNode(idolEnemyVisorId(bodyId), { tags: ["enemy", kind, "visor"] })) as unknown as AuraSceneNode
    );
  }
  if (spec.gun) {
    const barrels = spec.barrels
      ? [barrelCluster(`${name} idol barrels`, spec.barrels).runtime(game.runtimeNode(idolEnemyBarrelsId(bodyId), { tags: ["enemy", kind, "moving-part"] })) as unknown as AuraSceneNode]
      : [];
    const gun = idolPlacedGroup(`${name} idol gun`, spec.gun, { castShadow, receiveShadow: true }, barrels);
    if (gun) children.push(gun.runtime(game.runtimeNode(idolEnemyGunId(bodyId), { tags: ["enemy", kind, "idol-gun"] })) as unknown as AuraSceneNode);
  }
  if (spec.pack) {
    const pack = idolPlacedGroup(`${name} idol pack`, { key: spec.pack.key, scale: spec.pack.scale, rotation: [0, Math.PI, 0] }, { castShadow, receiveShadow: true });
    if (pack) children.push(pack.runtime(game.runtimeNode(idolEnemyPackId(bodyId), { tags: ["enemy", kind, "moving-part"] })) as unknown as AuraSceneNode);
  }
  return group(name, children).runtime(bind(bodyId, "body"));
}

const GUNMETAL = material.pbr({ color: "#3a3d42", roughness: 0.38, metallic: 0.9 });
const ROTOR_BLADE = material.pbr({ color: "#a7adb5", roughness: 0.45, metallic: 0.35 });
const ROTOR_BLUR = material.pbr({ color: "#c9ced4", roughness: 0.6, metalness: 0, opacity: 0.28 });

/** Six steel barrels round the +Z axis with two clamp rings; the group spins about Z (its origin is the axis). */
function barrelCluster(name: string, b: NonNullable<IdolEnemySpec["barrels"]>) {
  const parts: AuraSceneNode[] = [];
  for (let k = 0; k < 6; k += 1) {
    const a = (k / 6) * Math.PI * 2;
    parts.push(primitives.cylinder({ name: `${name} ${k}`, size: [b.radius * 2, b.length, b.radius * 2], position: [Math.cos(a) * b.ring, Math.sin(a) * b.ring, b.length / 2], rotation: [Math.PI / 2, 0, 0], material: GUNMETAL, castShadow: false, receiveShadow: false }) as unknown as AuraSceneNode);
  }
  for (const z of [b.length * 0.35, b.length * 0.92]) {
    parts.push(primitives.cylinder({ name: `${name} ring ${z.toFixed(2)}`, size: [(b.ring + b.radius) * 2.3, 0.03, (b.ring + b.radius) * 2.3], position: [0, 0, z], rotation: [Math.PI / 2, 0, 0], material: GUNMETAL, castShadow: false, receiveShadow: false }) as unknown as AuraSceneNode);
  }
  return group(name, parts).position(b.at[0], b.at[1], b.at[2]);
}

const DOWN: V3 = [0, -1, 0];
/** A hanging hand turned to point along +Z (wrapped round a pistol grip). */
const HAND_FORWARD: Q = qEulerZYX([-Math.PI / 2, 0, 0]);
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Two-bone IK: elbow position for shoulder `s` reaching `t` with segment lengths a, b, bending toward `pole`. */
function solveElbow(s: V3, t: V3, a: number, b: number, pole: V3): { elbow: V3; hand: V3 } {
  let d = sub(t, s);
  let dist = len(d);
  const maxReach = (a + b) * 0.999;
  if (dist > maxReach) { d = mul(norm(d), maxReach); dist = maxReach; }
  const dir = norm(d);
  const hand = add(s, d);
  const x = (a * a - b * b + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, a * a - x * x));
  const side = norm(cross(cross(dir, pole), dir));
  return { elbow: add(add(s, mul(dir, x)), mul(side, -h)), hand };
}

/** Bone lengths of a skeleton's arm (upper arm, forearm) and leg, from the bind pose. */
function limbLengths(skel: IdolSkeleton) {
  const b = idolBind(skel);
  const ro = skel.roles;
  const d = (i: number, j: number) => len(sub(b.worldT[j]!, b.worldT[i]!));
  return {
    upperL: d(ro.upperArmL, ro.forearmL), foreL: d(ro.forearmL, ro.handL),
    upperR: d(ro.upperArmR, ro.forearmR), foreR: d(ro.forearmR, ro.handR)
  };
}

const ENEMY_REST_Y: Readonly<Record<EnemyKind, number>> = { guard: 0.94, gunner: 0.96, boss: 1.4, dog: 0.52 };

/**
 * Pose one Idol enemy from the procedural pose for this frame. Returns false when the enemy has no Idol body.
 */
/** Breathing (rad), weight shift (m), hip sway (rad) and scan yaw (rad) for idle / patrol / alert enemies. */
export function idleLife(state: string, t: number, id: string) {
  const amp = state === "idle" ? 1 : state === "alert" || state === "patrol" ? 0.55 : 0;
  if (amp === 0) return { breath: 0, shift: 0, sway: 0, yaw: 0 };
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
  const ph = h / 997 * Math.PI * 2;
  return {
    breath: 0.035 * amp * Math.sin(t * 2 * Math.PI * 0.28 + ph),
    shift: 0.035 * amp * Math.sin(t * 2 * Math.PI * 0.11 + ph * 1.3),
    sway: 0.03 * amp * Math.sin(t * 2 * Math.PI * 0.11 + ph * 1.3),
    yaw: 0.32 * amp * Math.sin(t * 2 * Math.PI * 0.07 + ph) * Math.min(1, 0.5 + 0.5 * Math.sin(t * 0.9 + ph))
  };
}

export function poseIdolEnemy(
  getNode: (id: string) => { setPosition(x: number, y: number, z: number): unknown; setRotation(x: number, y: number, z: number): unknown; setAnimationPose?: (pose: unknown) => unknown; setAnimation?: (a: unknown) => unknown } | undefined,
  bodyId: string,
  kind: EnemyKind,
  pose: EnemyRigPose,
  state: string,
  /** Sim seconds (idle life layer, mocap clock); omitted = 0. */
  time?: number,
  /** State age, death age and per-enemy phase for the mocap clips (omitted: procedural pose only). */
  timing?: { readonly stateT: number; readonly deathT: number; readonly phase: number }
): boolean {
  const body = getNode(idolEnemyBodyId(bodyId));
  if (!body) return false;
  const spec = enemySpec(kind);
  if (kind === "dog") {
    poseIdolHound(body, pose, state);
    return true;
  }
  const skel = BZ_IDOL_RIGS[spec.key];
  if (!skel || !body.setAnimationPose) return false;
  const restY = ENEMY_REST_Y[kind];
  // Idle life (GPU QA: idle guards read frozen). On top of the sim pose: breathing, a slow weight shift between the feet
  // and a head-and-shoulder scan, so idle/alert enemies are never a static pose. Deterministic from the sim clock.
  const life = idleLife(state, time ?? 0, bodyId);
  const rig = qMul(qEulerZYX(pose.rigRot), qEulerZYX([0, life.yaw * 0.35, life.sway]));
  const chest = qMul(rig, qEulerZYX([pose.torsoRot[0] + life.breath, pose.torsoRot[1] + life.yaw, pose.torsoRot[2] - life.sway * 1.6]));
  const head = qMul(chest, qEulerZYX([pose.headRot[0] - life.breath * 0.5, pose.headRot[1] + life.yaw * 1.4, pose.headRot[2]]));
  const legL = qMul(rig, qEulerZYX(pose.legLRot));
  const legR = qMul(rig, qEulerZYX(pose.legRRot));
  // Single-joint procedural legs: add a soft knee on the trailing leg so the stride reads as walking, not stilts.
  const kneeL = Math.max(0, pose.legLRot[0]) * 0.9 + 0.06;
  const kneeR = Math.max(0, pose.legRRot[0]) * 0.9 + 0.06;
  const shinL = qMul(legL, qEulerZYX([kneeL, 0, 0]));
  const shinR = qMul(legR, qEulerZYX([kneeR, 0, 0]));
  const footL = qMul(shinL, qEulerZYX([-kneeL * 0.8, 0, 0]));
  const footR = qMul(shinR, qEulerZYX([-kneeR * 0.8, 0, 0]));
  const hipsOffset: V3 = [pose.rigPos[0] + life.shift, pose.rigPos[1] - restY - Math.abs(life.shift) * 0.25, pose.rigPos[2]];
  const armHang = (q: Q, bend: number) => ({ upper: q, fore: qMul(q, qEulerZYX([-bend, 0, 0])) });
  const aL = armHang(qMul(chest, qEulerZYX(pose.armLRot)), spec.hangElbow ?? 0.2);
  const aR = armHang(qMul(chest, qEulerZYX(pose.armRRot)), spec.hangElbow ?? 0.2);
  let drive: HumanoidDrive = {
    hips: rig, chest, head,
    upperArmL: aL.upper, forearmL: aL.fore, upperArmR: aR.upper, forearmR: aR.fore,
    thighL: legL, shinL, footL, thighR: legR, shinR, footR,
    hipsOffset, sourceHipsY: restY
  };
  // Generated motion (idolMocap.ts): hips, legs, spine and head come from the clip for the sim state; the arms
  // too, except for gun holders while alive, whose two-handed hold is solved by the IK below on the captured shoulders.
  // The idle-life scan and half the procedural aim lean stay layered on the chest and head so tracking still reads.
  if (timing && enemyMocapEnabled()) {
    const m = enemyMocapDrive(enemyMocapPose(skel, bodyId, state, time ?? 0, state === "dead" ? timing.deathT : timing.stateT, timing.phase * 0.37, kind));
    const scan = qEulerZYX([life.breath, life.yaw * 0.6, 0]);
    const lean = qEulerZYX([state === "attack" || state === "alert" ? pose.torsoRot[0] * 0.5 : 0, 0, 0]);
    const keepGunArms = !!spec.gripFromShoulder && state !== "dead" && state !== "pain";
    drive = {
      ...m,
      chest: qMul(qMul(m.chest, scan), lean),
      head: qMul(qMul(m.head, scan), qEulerZYX([pose.headRot[0] * 0.5, life.yaw * 0.6, 0])),
      ...(keepGunArms ? { upperArmL: drive.upperArmL, forearmL: drive.forearmL, handL: drive.handL, upperArmR: drive.upperArmR, forearmR: drive.forearmR, handR: drive.handR } : {})
    };
  }
  let solved = solveIdolPose(skel, drive);
  // 5.7.0 parent-local attachment scale: `body` applies `BZ_IDOL_RIGS_SCENE_SCALE[spec.key] * (spec.scale ?? 1)` while
  // `solved.worldT` is already in `skel.rootParent.s` space, so sibling attachments multiply by the exact ratio.
  const bodyScale = (BZ_IDOL_RIGS_SCENE_SCALE[spec.key] ?? 1) * (spec.scale ?? 1);
  const attachScale = bodyScale / Math.max(1e-3, skel.rootParent.s || 1);
  const toParentLocal = (v: V3): V3 => mul(v, attachScale);
  const gunNode = getNode(idolEnemyGunId(bodyId));
  if (spec.gripFromShoulder && spec.supportOnGun) {
    // Two-handed hold: right hand on the grip in front of the chest, the gun aimed by the procedural right-arm pitch,
    // left hand on the handguard; both arms solved by two-bone IK on the posed shoulders.
    const ro = skel.roles;
    const k = idolBind(skel).hipsY / 0.94;
    const lens = limbLengths(skel);
    const shR = solved.worldT[ro.upperArmR]!;
    const shL = solved.worldT[ro.upperArmL]!;
    const aim = qMul(chest, qEulerZYX([pose.armRRot[0] + (spec.gunRestPitch ?? 0), pose.armRRot[1], pose.armRRot[2]]));
    const grip = add(shR, mul(qRot(aim, spec.gripFromShoulder), k));
    const fwd = qRot(aim, [0, 0, 1]);
    const up = qRot(aim, [0, 1, 0]);
    const right = qRot(aim, [-1, 0, 0]);
    const support = add(grip, mul(add(add(mul(fwd, spec.supportOnGun[0]), mul(up, spec.supportOnGun[1])), mul(right, spec.supportOnGun[2])), k));
    const poleR = qRot(chest, [-0.8, -1, -0.2]);
    const poleL = qRot(chest, [0.6, -1, -0.2]);
    const r = solveElbow(shR, grip, lens.upperR, lens.foreR, poleR);
    const l = solveElbow(shL, support, lens.upperL, lens.foreL, poleL);
    const upperR = qFromTo(DOWN, sub(r.elbow, shR));
    const foreR = qFromTo(DOWN, sub(r.hand, r.elbow));
    const upperL = qFromTo(DOWN, sub(l.elbow, shL));
    const foreL = qFromTo(DOWN, sub(l.hand, l.elbow));
    solved = solveIdolPose(skel, { ...drive, upperArmR: upperR, forearmR: foreR, handR: qMul(aim, HAND_FORWARD), upperArmL: upperL, forearmL: foreL, handL: foreL });
    if (gunNode && state === "dead") {
      // Dropped: the gun lies on its side on the floor beside the body.
      const gPos = toParentLocal(grip);
      gunNode.setPosition(gPos[0], 0.05, Math.max(0.2, gPos[2]));
      gunNode.setRotation(0, 0.4, Math.PI / 2);
    } else if (gunNode) {
      // The gun's pistol grip sits in the palm, a hand's width past the IK wrist.
      const palm = toParentLocal(add(r.hand, mul(fwd, 0.07 * k)));
      gunNode.setPosition(palm[0], palm[1], palm[2]);
      const e = eulerZYXFromQ(qNorm(aim));
      gunNode.setRotation(e[0], e[1], e[2]);
    }
  } else if (gunNode) {
    gunNode.setPosition(0, -50, 0);
  }
  // Moving parts: the gunner's barrels spin with the pose's Gatling angle; the Warden's pack pitches on its back.
  getNode(idolEnemyBarrelsId(bodyId))?.setRotation(0, 0, state === "dead" ? 0 : pose.specRot[2]);
  const packNode = spec.pack ? getNode(idolEnemyPackId(bodyId)) : undefined;
  if (packNode && spec.pack) {
    const ro = skel.roles;
    const k = idolBind(skel).hipsY / 0.94;
    // Use `drive.chest` (character frame: +Z forward, +Y up) so the pack always rides on the dorsal -Z back.
    const cR = drive.chest;
    const at = toParentLocal(add(solved.worldT[ro.chest]!, mul(qRot(cR, spec.pack.offset), k)));
    packNode.setPosition(at[0], at[1], at[2]);
    const e = eulerZYXFromQ(qNorm(qMul(cR, qEulerZYX([pose.specRot[0], 0, 0]))));
    packNode.setRotation(e[0], e[1], e[2]);
  }
  const visor = getNode(idolEnemyVisorId(bodyId));
  if (visor) {
    const ro = skel.roles;
    const k = idolBind(skel).hipsY / 0.94;
    // Use `drive.head` (character +Z forward, +Y up) rather than raw Idol bone `worldR` (whose local +Z points -X)
    // and place the optic slit at `z: +0.13` cleanly outside the helmet brow.
    const hR = drive.head;
    const at = toParentLocal(add(solved.worldT[ro.head]!, mul(qRot(hR, [0, 0.08, 0.13]), k)));
    visor.setPosition(at[0], at[1], at[2]);
    const e = eulerZYXFromQ(qNorm(hR));
    visor.setRotation(e[0], e[1], e[2]);
  }
  body.setAnimationPose({ bones: solved.bones, mode: "replace" });
  return true;
}

/**
 * The hound: Idol's quadruped rig ships idle/walk/run clips; the sim state picks the clip and the procedural rig pose
 * drives bounded whole-body lunge, flinch and death roll without double-offsetting Y/Z in parent-local space.
 */
function poseIdolHound(
  body: { setPosition(x: number, y: number, z: number): unknown; setRotation(x: number, y: number, z: number): unknown; setAnimation?: (a: unknown) => unknown },
  pose: EnemyRigPose,
  state: string
) {
  const restY = ENEMY_REST_Y.dog;
  const localY = Math.max(0, Math.min(0.18, pose.rigPos[1] - restY));
  const localZ = Math.max(-0.18, Math.min(0.28, pose.rigPos[2]));
  body.setPosition(0, state === "dead" ? 0 : localY, state === "dead" ? 0 : localZ);
  const q = qMul(qEulerZYX(pose.rigRot), qEulerZYX([pose.torsoRot[0] * 0.5, 0, 0]));
  const e = eulerZYXFromQ(q);
  body.setRotation(e[0], e[1], e[2]);
  const clip = state === "chase" || state === "attack" ? "run" : state === "patrol" || state === "alert" ? "walk" : "idle";
  houndClip(body, clip, state === "dead" ? 0 : state === "attack" ? 1.25 : 1);
}

const houndClipState = new WeakMap<object, string>();
function houndClip(body: { setAnimation?: (a: unknown) => unknown }, clip: string, speed: number) {
  const key = `${clip}:${speed}`;
  if (houndClipState.get(body) === key) return;
  houndClipState.set(body, key);
  try { body.setAnimation?.({ clip, loop: true, speed }); } catch { /* clip not embedded: stays in bind pose */ }
}


// ---------------------------------------------------------------------------------------------------------------
// Doors, pickups and bunker dressing. Offsets put the grounded Idol model where the procedural piece's own origin was
// (pickups are built around their centre, so the model drops by the procedural piece's min Y).
// ---------------------------------------------------------------------------------------------------------------

export const IDOL_PROPS = {
  // Idol door was generated turned 45 deg (face toward -X+Z); turned square to the doorway. It is about 4.3 m wide at
  // 2.8 m tall, so its ends sit inside the jamb walls (the procedural leaf is 2.94 m) and slide into them when it opens.
  door: { key: "bzBlastDoor", rotation: [0, Math.PI / 4, 0], scale: 1.05 },
  // Idol shutter is 2.03 m tall; the exit opening is 2.34 m (BZ_EXIT_SHUTTER).
  shutter: { key: "bzShutter", scale: 1.15 },
  bullionSilver: { key: "bzBullionSilver", position: [0, -0.18, 0] },
  bullionGold: { key: "bzBullionGold", position: [0, -0.18, 0] },
  // Two stacked ammo cans, 0.9 m tall at generation; the procedural crate is 0.52 m.
  munition: { key: "bzMunition", position: [0, -0.2, 0], scale: 0.6 },
  armor: { key: "bzArmor", position: [0, -0.34, 0] },
  medkit: { key: "bzMedkit", position: [0, -0.156, 0] },
  plate: { key: "bzMedkit", position: [0, -0.115, 0], scale: 0.74 },
  keycard: { key: "bzKeycard", position: [0, -0.28, 0] },
  console: { key: "bzConsole" },
  cryo: { key: "bzCryo" },
  drone: { key: "bzDrone", position: [0, -0.17, 0] }
} as const satisfies Record<string, IdolPlacement>;

export function idolPropNode(prop: keyof typeof IDOL_PROPS, name: string, castShadow = false) {
  return idolPlacedGroup(name, IDOL_PROPS[prop], { castShadow, receiveShadow: true });
}

/** Instanced Idol drums or crates for a floor's prop pool (one draw instead of the procedural material pools). */
export function idolPropInstances(key: "bzDrum" | "bzCrate", name: string, transforms: readonly { position: readonly number[]; scale: readonly number[] }[], castShadow: boolean) {
  const asset = idolModel(key);
  if (!asset) return undefined;
  return instances.model(asset, {
    name,
    // Idol GLBs are real-size: keep world scale (model() otherwise normalises to a 1 m max dimension).
    scaleMode: "world",
    castShadow,
    receiveShadow: true,
    transforms: transforms.map((t) => ({ position: [t.position[0]!, t.position[1]!, t.position[2]!] as [number, number, number], scale: [t.scale[0]!, t.scale[1]!, t.scale[2]!] as [number, number, number] }))
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Patrol drone (MOVING-PARTS pass): Idol body generated without propellers + four procedural two-blade rotors that
// spin in its ducts. Positions are measured on the Idol body (duct centres, metres, model space).
// ---------------------------------------------------------------------------------------------------------------

export const IDOL_DRONE = {
  key: "bzDroneBody",
  /** The body is grounded at y = 0; the procedural drone hung 0.17 m below its node origin. */
  drop: -0.17,
  /** Duct ring centres measured from the model (rings span y 0.32-0.44, inner radius 0.107 m). */
  ducts: [[0.377, 0.39, 0.372], [-0.39, 0.39, 0.38], [0.37, 0.39, -0.366], [-0.375, 0.39, -0.364]] as readonly V3[],
  /** Blades just inside the duct's inner radius, light enough to read against the dark ring, plus a faint blur disc. */
  bladeLength: 0.205,
  bladeWidth: 0.045,
  blurRadius: 0.1,
  /** rad/s */
  spin: 42
};

export const idolDroneRotorId = (slot: number, i: number) => `f${slot}-drone-rotor-${i}`;

export function idolDroneNode(name: string, slot: number, bind: (id: string) => ReturnType<typeof game.runtimeNode>) {
  const asset = idolModel(IDOL_DRONE.key);
  if (!asset) return idolPropNode("drone", name);
  const rotors = IDOL_DRONE.ducts.map((d, i) =>
    group(`${name} rotor ${i}`, [
      ...[0, Math.PI / 2].map((a, b) =>
        primitives.box({ name: `${name} rotor ${i} blade ${b}`, size: [IDOL_DRONE.bladeLength, 0.012, IDOL_DRONE.bladeWidth], rotation: [0.18, a, 0], material: ROTOR_BLADE, castShadow: false, receiveShadow: false }) as unknown as AuraSceneNode
      ),
      primitives.cylinder({ name: `${name} rotor ${i} hub`, size: [0.05, 0.03, 0.05], material: GUNMETAL, castShadow: false, receiveShadow: false }) as unknown as AuraSceneNode,
      // Motion blur: a faint disc the spinning blades sweep, so the spin reads even when the frame rate aliases the blades.
      primitives.cylinder({ name: `${name} rotor ${i} blur`, size: [IDOL_DRONE.blurRadius * 2, 0.004, IDOL_DRONE.blurRadius * 2], material: ROTOR_BLUR, castShadow: false, receiveShadow: false }) as unknown as AuraSceneNode
    ])
      .position(d[0], d[1] + IDOL_DRONE.drop, d[2])
      .runtime(bind(idolDroneRotorId(slot, i))) as unknown as AuraSceneNode
  );
  return group(name, [
    model(asset, { name: `${name} idol`, scaleMode: "world", castShadow: false, receiveShadow: true }).position(0, IDOL_DRONE.drop, 0) as unknown as AuraSceneNode,
    ...rotors
  ]) as unknown as AuraNodeBuilder<AuraSceneNode>;
}

/** Rotor angle at time t (pure; used by the frame loop and the moving-parts test). */
export const idolDroneRotorYaw = (t: number, i: number) => (i % 2 === 0 ? 1 : -1) * IDOL_DRONE.spin * t;
