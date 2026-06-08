// Aura Clash secondary motion: wires the 1.3 Believable-Motion runtimes into the live fighters.
//
//   • Foot IK + foot-lock (T1.2): each grounded, locomoting fighter has its `thigh→calf→foot` leg
//     chains solved via the GLB runtime's two-bone IK (`solveImportedSkeletonTwoBoneIK`, built on
//     `@aura3d/animation` `solveTwoBoneIk`). A planted foot is pinned to its world contact point so it
//     stops sliding while the in-place walk/run clip plays under a translating root.
//   • Spring body-sway (T1.3): a deterministic `createSpringChain` reacts to the fighter's
//     horizontal velocity, so the body leans/lags into dashes, lunges, and knockback instead of
//     moving rigidly. This rig has no hair/cloth bone chain, so the spring drives an additive root
//     lean (a rigid transform — no skinning-palette refresh needed) rather than secondary bones.
//   • Footstep events (T1.2 + T2.2): a foot-plant transition fires a footstep cue.
//
// Everything here runs AFTER clip application + root sync and is presentation-only: it never touches
// the combat simulation, so the deterministic replay checksum is unchanged. Deterministic given the
// frame `dt` + fighter state.

import { createSpringChain, type SpringChain, type Vec3 } from "@aura3d/animation";
import type { TypedGLBActor } from "@aura3d/engine/production-runtime";

const LEGS: ReadonlyArray<{ readonly side: "left" | "right"; readonly chain: readonly [string, string, string]; readonly knee: string; readonly foot: string }> = [
  { side: "left", chain: ["thigh_l", "calf_l", "foot_l"], knee: "calf_l", foot: "foot_l" },
  { side: "right", chain: ["thigh_r", "calf_r", "foot_r"], knee: "calf_r", foot: "foot_r" }
];

const FOOT_IK_WEIGHT = 0.5; // partial solve so the anti-slide correction eases in instead of popping
const SPRING_LEAN_SCALE = 0.06; // radians of body lean per unit of horizontal spring lag (subtle)

interface FootLock {
  locked: boolean;
  world: Vec3;
}

export interface FighterSecondaryMotionState {
  readonly actor: TypedGLBActor;
  readonly nodeCache: Map<string, { transform: { worldMatrix: ArrayLike<number> } } | null>;
  readonly spring: SpringChain;
  floorY: number | null;
  readonly footLocks: Record<string, FootLock>;
  prevX: number;
  hasLegChains: boolean;
  /** Vertical impact-squash spring: offset from rest (0) + its velocity. Kicked on land/hit. */
  vSquash: number;
  vSquashVel: number;
}

export interface SecondaryMotionInput {
  readonly x: number;
  readonly grounded: boolean;
  readonly locomoting: boolean; // walk / run / dash (not idle, not attacking)
  readonly facingSign: 1 | -1;
  readonly rootRotation: readonly [number, number, number, number];
  /** One-shot impact impulse (land / hit) that kicks the vertical squash spring. 0 = none. */
  readonly impulse: number;
}

export interface SecondaryMotionResult {
  readonly groundedFeet: number;
  readonly footIkApplied: number;
  readonly maxFootSlideCorrected: number;
  readonly footstep: "left" | "right" | null;
  /** Additive body-lean rotation (compose onto the root) from the spring. */
  readonly leanRotation: readonly [number, number, number, number];
  readonly springLag: number;
  /** Vertical squash multiplier for the root (1 = rest, <1 compressed, >1 stretched on rebound). */
  readonly squashScale: number;
}

export function createFighterSecondaryMotion(actor: TypedGLBActor): FighterSecondaryMotionState {
  // A two-node spring chain: root particle = body base, tip = body top. The tip lags horizontally
  // when the body accelerates, producing the lean. Low stiffness/damping reads as weighty inertia.
  const spring = createSpringChain({
    bones: [
      [0, 0, 0],
      [0, 1.1, 0]
    ],
    stiffness: 90,
    damping: 12,
    gravity: [0, 0, 0],
    name: "fighter-body-sway"
  });
  return {
    actor,
    nodeCache: new Map(),
    spring,
    floorY: null,
    footLocks: { foot_l: { locked: false, world: [0, 0, 0] }, foot_r: { locked: false, world: [0, 0, 0] } },
    prevX: 0,
    hasLegChains: actorHasLegChains(actor),
    vSquash: 0,
    vSquashVel: 0
  };
}

export function resetFighterSecondaryMotion(state: FighterSecondaryMotionState): void {
  state.floorY = null;
  state.footLocks.foot_l.locked = false;
  state.footLocks.foot_r.locked = false;
  state.prevX = 0;
  state.vSquash = 0;
  state.vSquashVel = 0;
  state.spring.reset({ position: [0, 0, 0] });
}

export function updateFighterSecondaryMotion(
  state: FighterSecondaryMotionState,
  input: SecondaryMotionInput,
  dt: number
): SecondaryMotionResult {
  const safeDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 1 / 20) : 1 / 60;

  // --- Spring body-sway (always on; rigid root lean, no palette refresh) -----------------------
  state.spring.integrate(safeDt, { position: [input.x, 0, 0] });
  const tel = state.spring.telemetry();
  const lag = tel.tipPosition[0] - tel.rootPosition[0]; // horizontal lag of the body top
  const leanAngle = clamp(lag * SPRING_LEAN_SCALE, -0.16, 0.16);
  // Lean as a roll about the view axis (Z), composed onto the synced root rotation.
  const leanQuat = quatAxisAngle([0, 0, 1], leanAngle);
  const leanRotation = multiplyQuat(input.rootRotation, leanQuat);

  // --- Vertical impact-squash spring (T1.3) — body compresses + rebounds on land/hit -----------
  if (input.impulse > 0) state.vSquashVel -= input.impulse; // downward kick = compression
  // Critically-damped scalar spring back to rest (0).
  const vk = 220; // stiffness
  const vc = 22; // damping
  const acc = -vk * state.vSquash - vc * state.vSquashVel;
  state.vSquashVel += acc * safeDt;
  state.vSquash += state.vSquashVel * safeDt;
  // Map the offset to a vertical scale multiplier: negative offset => compressed (shorter).
  const squashScale = 1 + clamp(state.vSquash, -0.16, 0.12);

  // --- Foot IK + foot-lock (grounded locomotion only) -----------------------------------------
  let groundedFeet = 0;
  let footIkApplied = 0;
  let maxFootSlideCorrected = 0;
  let footstep: "left" | "right" | null = null;
  const eligible = state.hasLegChains && input.grounded && input.locomoting;

  if (!eligible) {
    state.footLocks.foot_l.locked = false;
    state.footLocks.foot_r.locked = false;
  } else {
    // Foot-lock the SUPPORT (lower) foot, and only while the body is actually translating. Idle
    // never triggers IK (idle foot-IK caused the foot splay). We pin the planted foot's HORIZONTAL
    // world position so it stops sliding under the in-place walk/run clip, while keeping its natural
    // vertical height (no over-extension) and the clip's own knee bend (no pole, so nothing twists).
    const moving = Math.abs(input.x - state.prevX) > 0.004;
    const left = readWorldPos(state, "foot_l");
    const right = readWorldPos(state, "foot_r");
    if (!moving || !left || !right) {
      state.footLocks.foot_l.locked = false;
      state.footLocks.foot_r.locked = false;
    } else {
      const plantedFoot = left[1] <= right[1] ? "foot_l" : "foot_r"; // the lower foot is planted
      for (const leg of LEGS) {
        const foot = leg.foot === "foot_l" ? left : right;
        const lock = state.footLocks[leg.foot]!;
        if (leg.foot !== plantedFoot) {
          lock.locked = false;
          continue;
        }
        groundedFeet += 1;
        if (!lock.locked) {
          lock.locked = true;
          lock.world = [foot[0], foot[1], foot[2]];
          footstep = leg.side; // a foot just planted -> footstep
        }
        // Pin X/Z to the plant point; keep the foot's natural height. No vertical distortion.
        maxFootSlideCorrected = Math.max(maxFootSlideCorrected, Math.hypot(foot[0] - lock.world[0], foot[2] - lock.world[2]));
        const target: Vec3 = [lock.world[0], foot[1], lock.world[2]];
        const result = state.actor.animation.solveImportedSkeletonTwoBoneIK({
          jointNames: [leg.chain[0], leg.chain[1], leg.chain[2]],
          target,
          weight: FOOT_IK_WEIGHT,
          apply: true
        });
        if (result.applied) footIkApplied += 1;
      }
    }
  }

  state.prevX = input.x;
  return {
    groundedFeet,
    footIkApplied,
    maxFootSlideCorrected: Number(maxFootSlideCorrected.toFixed(4)),
    footstep,
    leanRotation,
    springLag: Number(lag.toFixed(4)),
    squashScale
  };
}

function actorHasLegChains(actor: TypedGLBActor): boolean {
  // The leg bones must exist in the loaded scene for foot IK to be meaningful.
  const required = ["thigh_l", "calf_l", "foot_l"];
  const found = new Set<string>();
  try {
    actor.pipeline.resources.scene.traverse((node: { name: string }) => {
      if (required.includes(node.name)) found.add(node.name);
    });
  } catch {
    return false;
  }
  return required.every((name) => found.has(name));
}

function readWorldPos(state: FighterSecondaryMotionState, name: string): Vec3 | null {
  let entry = state.nodeCache.get(name);
  if (entry === undefined) {
    let node: { transform: { worldMatrix: ArrayLike<number> } } | null = null;
    state.actor.pipeline.resources.scene.traverse((candidate: { name: string; transform: { worldMatrix: ArrayLike<number> } }) => {
      if (!node && candidate.name === name) node = candidate;
    });
    entry = node;
    state.nodeCache.set(name, entry);
  }
  if (!entry) return null;
  const m = entry.transform.worldMatrix;
  return [m[12] ?? 0, m[13] ?? 0, m[14] ?? 0];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function quatAxisAngle(axis: Vec3, angle: number): readonly [number, number, number, number] {
  const half = angle / 2;
  const s = Math.sin(half);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)];
}

function multiplyQuat(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number]
): readonly [number, number, number, number] {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
  ];
}
