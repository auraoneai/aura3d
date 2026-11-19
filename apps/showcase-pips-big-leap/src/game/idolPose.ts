// Idol wow pass (2026-11): drive the rigged Idol Pip and Brambleback from the game's existing procedural pose
// parameters. The Idol skeletons have unnamed bones (bone_0..bone_N); IDOL_RIGS maps the ones we drive (upper arm,
// forearm, thigh, shin, head) by hierarchy and rest position, read offline from the shipped GLBs
// (tools: `node packages/aura3d-cli/dist/cli.js assets inspect`; rest data below is model space, +Y up, +Z front).
//
// Locomotion on the ground (idle / walk / run) plays the Idol clips untouched. Every other state (jump, air, glide,
// dive, pound, swim, hurt, dead, celebrate) keeps the idle clip on the spine and overlays the old articulated rig's
// limb choreography: each limb's target direction is the old part's hanging direction rotated by its pitch / splay
// euler (Rz * Ry * Rx, exactly as main.ts placed the rigid parts), and the bone gets the shortest-arc rotation from
// its T-pose rest direction onto that target. Render layer only: nothing here reads or writes simulation state.
import type { AuraRuntimeNodeHandle } from "@aura3d/engine";
import { BOSS_IDOL_RIG, PIP_IDOL_RIG } from "./idolRigs.js";

type Quat = readonly [number, number, number, number];
type V3 = readonly [number, number, number];

export interface BoneRest {
  /** glTF node name of the bone. */
  readonly bone: string;
  /** Rest local rotation (relative to the parent bone). */
  readonly local: Quat;
  /** Rest world rotation of the parent bone in model space. */
  readonly parentWorld: Quat;
  /** Unit rest direction of the bone (towards its child) in model space. */
  readonly dir: V3;
}

export interface IdolLimbRig {
  readonly armL: BoneRest;
  readonly foreArmL: BoneRest;
  readonly armR: BoneRest;
  readonly foreArmR: BoneRest;
  readonly legL: BoneRest;
  readonly shinL: BoneRest;
  readonly legR: BoneRest;
  readonly shinR: BoneRest;
  readonly head?: BoneRest;
}

// ------------------------------------------------------------------ quaternion helpers

function qmul(a: Quat, b: Quat): [number, number, number, number] {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
  ];
}
const qinv = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];

function qnorm(q: readonly number[]): [number, number, number, number] {
  const l = Math.hypot(q[0]!, q[1]!, q[2]!, q[3]!) || 1;
  return [q[0]! / l, q[1]! / l, q[2]! / l, q[3]! / l];
}

/** Shortest-arc rotation taking unit vector a onto unit vector b. */
export function quatFromTo(a: V3, b: V3): [number, number, number, number] {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (d < -0.999999) {
    // Opposite: any perpendicular axis.
    const ax: V3 = Math.abs(a[0]) < 0.9 ? [0, -a[2], a[1]] : [-a[2], 0, a[0]];
    return qnorm([ax[0], ax[1], ax[2], 0]);
  }
  const c: V3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return qnorm([c[0], c[1], c[2], 1 + d]);
}

/** Euler (rx, ry, rz) composed as Rz * Ry * Rx, matching main.ts `writeEulerZYXMatrix` / `placeYawPart`. */
export function quatFromEulerZYX(rx: number, ry: number, rz: number): [number, number, number, number] {
  const qx: Quat = [Math.sin(rx / 2), 0, 0, Math.cos(rx / 2)];
  const qy: Quat = [0, Math.sin(ry / 2), 0, Math.cos(ry / 2)];
  const qz: Quat = [0, 0, Math.sin(rz / 2), Math.cos(rz / 2)];
  return qmul(qz, qmul(qy, qx));
}

function rotate(q: Quat, v: V3): [number, number, number] {
  const p = qmul(qmul(q, [v[0], v[1], v[2], 0]), qinv(q));
  return [p[0], p[1], p[2]];
}

/** Old rigid limbs hung straight down in their rest pose. */
const DOWN: V3 = [0, -1, 0];

/** Local bone rotation that points `rest.dir` along the model-space direction `target`. */
export function aimBoneLocal(rest: BoneRest, target: V3): Quat {
  const delta = quatFromTo(rest.dir, target);
  // local' = inv(parentWorld) * delta * parentWorld * local
  return qnorm(qmul(qinv(rest.parentWorld), qmul(delta, qmul(rest.parentWorld, rest.local))));
}

/** Model-space direction of an old rigid part hanging down, rotated by its euler. */
export function limbDirection(rx: number, ry: number, rz: number): [number, number, number] {
  return rotate(quatFromEulerZYX(rx, ry, rz), DOWN);
}

type Bones = Record<string, { readonly rotation: { readonly x: number; readonly y: number; readonly z: number; readonly w: number } }>;
const toRot = (q: Quat) => ({ x: q[0], y: q[1], z: q[2], w: q[3] });

function setLimb(bones: Bones, rest: BoneRest, child: BoneRest | undefined, target: V3, bend = 0): void {
  bones[rest.bone] = { rotation: toRot(aimBoneLocal(rest, target)) };
  // Keep the elbow / knee near its rest (straight) so the old rigid-part silhouette reads, with an optional bend.
  if (child) bones[child.bone] = { rotation: toRot(bend === 0 ? child.local : qnorm(qmul(child.local, quatFromEulerZYX(bend, 0, 0)))) };
}

function setPose(handle: AuraRuntimeNodeHandle, bones: Bones | undefined): void {
  const h = handle as AuraRuntimeNodeHandle & { setAnimationPose?: AuraRuntimeNodeHandle["setAnimationPose"] };
  if (typeof h.setAnimationPose !== "function") return;
  h.setAnimationPose(bones ? { bones, mode: "overlay" } : undefined);
}

// ------------------------------------------------------------------ Pip

export interface PipPoseParams {
  readonly headNod: number;
  readonly headYaw: number;
  readonly headRoll: number;
  readonly armPitchL: number;
  readonly armPitchR: number;
  readonly armSplay: number;
  readonly legPitchL: number;
  readonly legPitchR: number;
  readonly legSplay: number;
  readonly hipBob: number;
}

/** States whose limbs follow the Idol clip as-is (ground locomotion). */
const PIP_CLIP_STATES: ReadonlySet<string> = new Set(["idle", "walk", "run"]);
let pipOverlayActive = false;

export function pipStateUsesClipLimbs(key: string): boolean {
  return PIP_CLIP_STATES.has(key);
}

export function poseIdolPip(hero: AuraRuntimeNodeHandle, key: string, p: PipPoseParams): void {
  const rig: IdolLimbRig | null = PIP_IDOL_RIG;
  if (!rig) return;
  if (PIP_CLIP_STATES.has(key)) {
    if (pipOverlayActive) {
      setPose(hero, undefined);
      pipOverlayActive = false;
    }
    return;
  }
  const bones: Bones = {};
  // armL hangs on the model's -X side (splay rotates it outward with -armSplay), armR on +X.
  // Pip's oversized acorn head swallows arms raised straight overhead, so steep raises (celebrate) open into a V.
  const vL = Math.max(0, -p.armPitchL - 1.4);
  const vR = Math.max(0, -p.armPitchR - 1.4);
  setLimb(bones, rig.armL, rig.foreArmL, limbDirection(p.armPitchL + vL * 0.35, 0, -(p.armSplay + vL)));
  setLimb(bones, rig.armR, rig.foreArmR, limbDirection(p.armPitchR + vR * 0.35, 0, p.armSplay + vR));
  setLimb(bones, rig.legL, rig.shinL, limbDirection(p.legPitchL, 0, -p.legSplay));
  setLimb(bones, rig.legR, rig.shinR, limbDirection(p.legPitchR, 0, p.legSplay));
  if (rig.head) {
    bones[rig.head.bone] = { rotation: toRot(qnorm(qmul(qinv(rig.head.parentWorld), qmul(quatFromEulerZYX(p.headNod, p.headYaw, p.headRoll), qmul(rig.head.parentWorld, rig.head.local))))) };
  }
  setPose(hero, bones);
  pipOverlayActive = true;
}

// ------------------------------------------------------------------ Brambleback

export interface BossPoseParams {
  readonly armSwingL: number;
  readonly armSwingR: number;
  readonly legStride: number;
}

let bossOverlayActive = false;

/** Roll plays the Idol run clip as-is; every other phase overlays the old arm swing / stride on the idle clip. */
export function poseIdolBoss(boss: AuraRuntimeNodeHandle, mode: string, p: BossPoseParams): void {
  const rig: IdolLimbRig | null = BOSS_IDOL_RIG;
  if (!rig) return;
  if (mode === "roll" || mode === "dormant") {
    if (bossOverlayActive) {
      setPose(boss, undefined);
      bossOverlayActive = false;
    }
    return;
  }
  const bones: Bones = {};
  // The Idol boss carries its shell on its back, so backward swings (attack / vulnerable / down) would bury the arms in
  // it: those become a forward slam with the arms spread instead. Forward raises (windup) keep the old swing.
  const arm = (swing: number) => (swing > 0 ? { pitch: -0.35 + swing * 0.2, splay: 0.82 } : { pitch: swing, splay: 0.47 });
  const aL = arm(p.armSwingL);
  const aR = arm(p.armSwingR);
  setLimb(bones, rig.armL, rig.foreArmL, limbDirection(aL.pitch, 0, -aL.splay));
  setLimb(bones, rig.armR, rig.foreArmR, limbDirection(aR.pitch, 0, aR.splay));
  setLimb(bones, rig.legL, rig.shinL, limbDirection(-p.legStride, 0, -0.06));
  setLimb(bones, rig.legR, rig.shinR, limbDirection(p.legStride, 0, 0.06));
  setPose(boss, bones);
  bossOverlayActive = true;
}

/** After a remount or registry reset the overlay state is unknown: the next clip-driven frame clears any pose. */
export function resetIdolPoses(): void {
  pipOverlayActive = true;
  bossOverlayActive = true;
}
