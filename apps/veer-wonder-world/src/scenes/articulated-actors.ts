// Wonder World articulated sub-part animation & gaze/speech/wheel/skinned helpers (PRD 5.5.1 §5 & §6).
//
// Pure deterministic math plus runtime handle binding via 5.5.1 `handle.part?.(partName)`
// with seamless fallback to stand-in sub-nodes `${actorId}__${partName}`.
// Zero clocks, zero randomness, zero console calls, and zero unsafe casts.

import {
  createAnimationController,
  sampleAuraVoiceBridgeAtTime,
  sampleVisemeTrack,
  type AnimationController,
  type AuraApp,
  type AuraRuntimeNodeHandle,
  type AuraVec3
} from "@aura3d/engine";
import {
  createSmoothFollow3,
  handBounceOverlayAngles,
  proceduralLegSwing,
  wrapAngle as wrapGameAngle,
  yawToFace,
  type SmoothFollow3
} from "@aura3d/engine/game";
import type { CharacterId, Gesture, MoveStyle } from "../types.js";
import {
  addVec3,
  clamp,
  clamp01,
  composeRotation,
  ease,
  envelope,
  frac,
  lerp,
  phaseOf,
  rotateZYX,
  type PoseOffset,
  type Vec3
} from "./motion.js";

const TAU = Math.PI * 2;

export const SUB_PART_IDS = [
  "body",
  "head",
  "armL",
  "armR",
  "footL",
  "footR",
  "tail",
  "wingL",
  "wingR",
  "tuft",
  "earL",
  "earR",
  "legFL",
  "legFR",
  "legBL",
  "legBR",
  "wheelFL",
  "wheelFR",
  "wheelRL",
  "wheelRR",
  "chimney",
  "cabDoorL",
  "cabDoorR",
  "eyelidL",
  "eyelidR",
  "jaw",
  "beakLower",
  "cheekPuff",
  "hingeLeaf",
  "hingeLeafR",
  "lid",
  "liftCab",
  "liftGate",
  "petals"
] as const;

export type SubPartId = (typeof SUB_PART_IDS)[number];

const SUB_PART_SET: ReadonlySet<string> = new Set<string>(SUB_PART_IDS);

export function isSubPartId(value: string): value is SubPartId {
  return SUB_PART_SET.has(value);
}

export interface ArticulatedPartPose {
  readonly offset?: Vec3;
  readonly rotation?: Vec3;
  readonly scale?: Vec3;
}

export type ArticulatedPoseMap = Partial<Readonly<Record<SubPartId, ArticulatedPartPose>>>;

/** Backward-compatible whole-actor pose plus optional articulated sub-part poses. */
export interface ActorPose {
  readonly offset: Vec3;
  readonly rotation: Vec3;
  readonly scale: Vec3;
  readonly parts?: ArticulatedPoseMap;
}

export function poseOffsetToActorPose(p: PoseOffset): ActorPose {
  return {
    offset: [p.dx, p.dy, p.dz],
    rotation: [p.rx, p.ry, p.rz],
    scale: [p.sx, p.sy, p.sz],
    ...(p.parts ? { parts: p.parts } : {})
  };
}

export function actorPoseToPoseOffset(a: ActorPose): PoseOffset {
  return {
    dx: a.offset[0],
    dy: a.offset[1],
    dz: a.offset[2],
    rx: a.rotation[0],
    ry: a.rotation[1],
    rz: a.rotation[2],
    sx: a.scale[0],
    sy: a.scale[1],
    sz: a.scale[2],
    ...(a.parts ? { parts: a.parts } : {})
  };
}

// ---------------------------------------------------------------- part pose algebra

export function hasPartPoses(parts: ArticulatedPoseMap | undefined): boolean {
  if (!parts) return false;
  for (const id of SUB_PART_IDS) {
    if (parts[id] !== undefined) return true;
  }
  return false;
}

function combineSinglePart(a: ArticulatedPartPose, b: ArticulatedPartPose): ArticulatedPartPose {
  const offset: Vec3 | undefined = a.offset && b.offset
    ? addVec3(a.offset, b.offset)
    : a.offset ?? b.offset;
  const rotation: Vec3 | undefined = a.rotation && b.rotation
    ? composeRotation(a.rotation, b.rotation)
    : a.rotation ?? b.rotation;
  const scale: Vec3 | undefined = a.scale && b.scale
    ? [a.scale[0] * b.scale[0], a.scale[1] * b.scale[1], a.scale[2] * b.scale[2]]
    : a.scale ?? b.scale;
  return {
    ...(offset ? { offset } : {}),
    ...(rotation ? { rotation } : {}),
    ...(scale ? { scale } : {})
  };
}

/** Additively merges articulated sub-part pose maps (offsets add, rotations compose, scales multiply). */
export function mergePartPoses(...maps: readonly (ArticulatedPoseMap | undefined)[]): ArticulatedPoseMap | undefined {
  const merged: Partial<Record<SubPartId, ArticulatedPartPose>> = {};
  let count = 0;
  for (const map of maps) {
    if (!map) continue;
    for (const id of SUB_PART_IDS) {
      const next = map[id];
      if (!next) continue;
      const prev = merged[id];
      if (prev) {
        merged[id] = combineSinglePart(prev, next);
      } else {
        merged[id] = next;
        count += 1;
      }
    }
  }
  return count > 0 ? merged : undefined;
}

/** Scales sub-part poses smoothly toward rest (`k = 0` yields `undefined`, `k = 1` keeps full pose). */
export function dampPartPoses(parts: ArticulatedPoseMap | undefined, k: number): ArticulatedPoseMap | undefined {
  if (!parts || k <= 0) return undefined;
  if (Math.abs(k - 1) < 1e-6) return parts;
  const out: Partial<Record<SubPartId, ArticulatedPartPose>> = {};
  let count = 0;
  const scaleTowardOne = (v: number): number => 1 + (v - 1) * k;
  for (const id of SUB_PART_IDS) {
    const p = parts[id];
    if (!p) continue;
    out[id] = {
      ...(p.offset ? { offset: [p.offset[0] * k, p.offset[1] * k, p.offset[2] * k] } : {}),
      ...(p.rotation ? { rotation: [p.rotation[0] * k, p.rotation[1] * k, p.rotation[2] * k] } : {}),
      ...(p.scale ? { scale: [scaleTowardOne(p.scale[0]), scaleTowardOne(p.scale[1]), scaleTowardOne(p.scale[2])] } : {})
    };
    count += 1;
  }
  return count > 0 ? out : undefined;
}

const MIRROR_PART_SWAP: Partial<Readonly<Record<SubPartId, SubPartId>>> = {
  armL: "armR",
  armR: "armL",
  footL: "footR",
  footR: "footL",
  wingL: "wingR",
  wingR: "wingL",
  earL: "earR",
  earR: "earL",
  legFL: "legFR",
  legFR: "legFL",
  legBL: "legBR",
  legBR: "legBL",
  wheelFL: "wheelFR",
  wheelFR: "wheelFL",
  wheelRL: "wheelRR",
  wheelRR: "wheelRL",
  cabDoorL: "cabDoorR",
  cabDoorR: "cabDoorL",
  eyelidL: "eyelidR",
  eyelidR: "eyelidL",
  hingeLeaf: "hingeLeafR",
  hingeLeafR: "hingeLeaf"
};

/** Left-right mirror image of articulated sub-part poses (swaps L/R parts and mirrors X offset and Y/Z rotations). */
export function mirrorPartPoses(parts: ArticulatedPoseMap | undefined): ArticulatedPoseMap | undefined {
  if (!parts) return undefined;
  const out: Partial<Record<SubPartId, ArticulatedPartPose>> = {};
  let count = 0;
  for (const id of SUB_PART_IDS) {
    const p = parts[id];
    if (!p) continue;
    const targetId = MIRROR_PART_SWAP[id] ?? id;
    out[targetId] = {
      ...(p.offset ? { offset: [-p.offset[0], p.offset[1], p.offset[2]] } : {}),
      ...(p.rotation ? { rotation: [p.rotation[0], -p.rotation[1], -p.rotation[2]] } : {}),
      ...(p.scale ? { scale: p.scale } : {})
    };
    count += 1;
  }
  return count > 0 ? out : undefined;
}

// ---------------------------------------------------------------- runtime handle binding (`handle.part(name)`)

export type ArticulatedAppSurface = Pick<AuraApp, "nodes">;

const GLB_PART_ALIASES: Partial<Readonly<Record<SubPartId, readonly string[]>>> = {
  body: ["Body", "Torso", "Spine", "Pelvis", "Hips"],
  head: ["Head", "Neck"],
  armL: ["ArmL", "LeftArm", "UpperArm.L", "Arm.L", "Hand.L"],
  armR: ["ArmR", "RightArm", "UpperArm.R", "Arm.R", "Hand.R"],
  footL: ["FootL", "LeftFoot", "Leg.L", "Foot.L"],
  footR: ["FootR", "RightFoot", "Leg.R", "Foot.R"],
  tail: ["Tail", "Tail.001"],
  wingL: ["WingL", "LeftWing", "Wing.L"],
  wingR: ["WingR", "RightWing", "Wing.R"],
  tuft: ["Tuft", "Crest", "FeatherTuft"],
  earL: ["EarL", "LeftEar", "Ear.L"],
  earR: ["EarR", "RightEar", "Ear.R"],
  legFL: ["LegFL", "FrontLeftLeg", "Leg.FL"],
  legFR: ["LegFR", "FrontRightLeg", "Leg.FR"],
  legBL: ["LegBL", "BackLeftLeg", "Leg.BL"],
  legBR: ["LegBR", "BackRightLeg", "Leg.BR"],
  wheelFL: ["WheelFL", "FrontLeftWheel", "Wheel.FL"],
  wheelFR: ["WheelFR", "FrontRightWheel", "Wheel.FR"],
  wheelRL: ["WheelRL", "RearLeftWheel", "Wheel.RL"],
  wheelRR: ["WheelRR", "RearRightWheel", "Wheel.RR"],
  chimney: ["Chimney", "Smokestack", "Funnel"],
  cabDoorL: ["CabDoorL", "DoorL", "LeftDoor"],
  cabDoorR: ["CabDoorR", "DoorR", "RightDoor"],
  eyelidL: ["EyelidL", "LeftEyelid", "Eye.L"],
  eyelidR: ["EyelidR", "RightEyelid", "Eye.R"],
  jaw: ["Jaw", "Mouth", "LowerJaw"],
  beakLower: ["BeakLower", "LowerBeak", "Beak.Lower"],
  cheekPuff: ["CheekPuff", "Cheeks"],
  hingeLeaf: ["HingeLeaf", "DoorLeaf", "DoorLeafL", "Door"],
  hingeLeafR: ["HingeLeafR", "DoorLeafR"],
  lid: ["Lid", "TopLid", "Cover"],
  liftCab: ["LiftCab", "Cabin", "Platform"],
  liftGate: ["LiftGate", "Gate"],
  petals: ["Petals", "Corolla", "Bloom"]
};

export interface ResolvedSubPart {
  readonly handle: AuraRuntimeNodeHandle;
  readonly source: "model-part" | "stand-in";
}

/**
 * Resolves a named sub-part via 5.5.1 `modelHandle?.part?.(partName)` (plus common GLB node aliases)
 * and falls back cleanly to the stand-in runtime node `${actorId}__${partName}`.
 */
export function resolveSubPartHandle(
  app: ArticulatedAppSurface,
  actorId: string,
  modelNodeId: string | null | undefined,
  partName: SubPartId
): ResolvedSubPart | undefined {
  const modelHandle = modelNodeId ? app.nodes.get(modelNodeId) : undefined;
  if (modelHandle?.part) {
    const direct = modelHandle.part(partName);
    if (direct) return { handle: direct, source: "model-part" };
    const aliases = GLB_PART_ALIASES[partName];
    if (aliases) {
      for (const alias of aliases) {
        const candidate = modelHandle.part(alias);
        if (candidate) return { handle: candidate, source: "model-part" };
      }
    }
  }
  const standIn = app.nodes.get(`${actorId}__${partName}`);
  if (standIn) return { handle: standIn, source: "stand-in" };
  return undefined;
}

interface StoredTransform {
  readonly position: Vec3;
  readonly rotation: Vec3;
  readonly scale: Vec3;
}

interface HandleTrackingState {
  base: StoredTransform;
  lastWritten: StoredTransform | null;
}

const handleStateCache = new WeakMap<AuraRuntimeNodeHandle, HandleTrackingState>();
const activePartsByRegistry = new WeakMap<object, Map<string, Map<SubPartId, ResolvedSubPart>>>();

function readScaleVec3(scale: number | AuraVec3): Vec3 {
  if (typeof scale === "number") return [scale, scale, scale];
  return [scale[0], scale[1], scale[2]];
}

function readHandleTransform(handle: AuraRuntimeNodeHandle): StoredTransform {
  return {
    position: [handle.position[0], handle.position[1], handle.position[2]],
    rotation: [handle.rotation[0], handle.rotation[1], handle.rotation[2]],
    scale: readScaleVec3(handle.scale)
  };
}

function sameVec3(a: Vec3, b: Vec3, eps = 1e-6): boolean {
  return Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps && Math.abs(a[2] - b[2]) <= eps;
}

function sameTransform(a: StoredTransform, b: StoredTransform): boolean {
  return sameVec3(a.position, b.position) && sameVec3(a.rotation, b.rotation) && sameVec3(a.scale, b.scale);
}

function writeHandleTransform(handle: AuraRuntimeNodeHandle, target: StoredTransform): void {
  handle.setPosition(target.position[0], target.position[1], target.position[2]);
  handle.setRotation(target.rotation[0], target.rotation[1], target.rotation[2]);
  handle.setScale([target.scale[0], target.scale[1], target.scale[2]]);
}

function baseTransformFor(resolved: ResolvedSubPart): HandleTrackingState {
  const current = readHandleTransform(resolved.handle);
  const existing = handleStateCache.get(resolved.handle);
  if (!existing) {
    const created: HandleTrackingState = { base: current, lastWritten: null };
    handleStateCache.set(resolved.handle, created);
    return created;
  }
  // Stand-in nodes are re-placed in world space by stage.ts each frame before sub-parts run.
  // When external code updated the handle since our last write, refresh its base transform cleanly.
  if (resolved.source === "stand-in" && existing.lastWritten && !sameTransform(current, existing.lastWritten)) {
    existing.base = current;
  }
  return existing;
}

function actorActiveMap(registry: object, actorId: string): Map<SubPartId, ResolvedSubPart> {
  let byActor = activePartsByRegistry.get(registry);
  if (!byActor) {
    byActor = new Map<string, Map<SubPartId, ResolvedSubPart>>();
    activePartsByRegistry.set(registry, byActor);
  }
  let map = byActor.get(actorId);
  if (!map) {
    map = new Map<SubPartId, ResolvedSubPart>();
    byActor.set(actorId, map);
  }
  return map;
}

/**
 * Applies additive local `offset` / `rotation` / `scale` to every resolved sub-part of `actorId`
 * (`modelHandle?.part?.(partName) ?? app.nodes.get(\`${actorId}__\${partName}\`)`) relative to rest pose,
 * and cleanly restores previously-driven sub-parts back to rest when omitted.
 */
export function applyArticulatedParts(
  app: ArticulatedAppSurface,
  actorId: string,
  modelNodeId: string | null | undefined,
  partsPose: ArticulatedPoseMap | undefined
): number {
  const activeMap = actorActiveMap(app.nodes, actorId);
  let applied = 0;

  if (partsPose) {
    for (const partName of SUB_PART_IDS) {
      const delta = partsPose[partName];
      if (!delta) continue;
      const resolved = resolveSubPartHandle(app, actorId, modelNodeId, partName);
      if (!resolved) continue;
      const state = baseTransformFor(resolved);
      const base = state.base;
      const localOffset = delta.offset ?? [0, 0, 0];
      const worldOrLocalOffset = resolved.source === "stand-in"
        ? rotateZYX(base.rotation, localOffset)
        : localOffset;
      const next: StoredTransform = {
        position: delta.offset ? addVec3(base.position, worldOrLocalOffset) : base.position,
        rotation: delta.rotation ? composeRotation(base.rotation, delta.rotation) : base.rotation,
        scale: delta.scale
          ? [base.scale[0] * delta.scale[0], base.scale[1] * delta.scale[1], base.scale[2] * delta.scale[2]]
          : base.scale
      };
      writeHandleTransform(resolved.handle, next);
      state.lastWritten = next;
      activeMap.set(partName, resolved);
      applied += 1;
    }
  }

  for (const [partName, resolved] of [...activeMap.entries()]) {
    if (partsPose && partsPose[partName] !== undefined) continue;
    const state = handleStateCache.get(resolved.handle);
    if (state) {
      const current = readHandleTransform(resolved.handle);
      // Only restore if nobody already re-wrote the stand-in piece to a fresh frame pose.
      if (!state.lastWritten || sameTransform(current, state.lastWritten)) {
        writeHandleTransform(resolved.handle, state.base);
      }
      state.lastWritten = null;
    }
    activeMap.delete(partName);
  }

  return applied;
}

// ---------------------------------------------------------------- natural eyelid blink (`3.2–4.1s`, `140ms`)

export const BLINK_MIN_PERIOD_SEC = 3.2;
export const BLINK_MAX_PERIOD_SEC = 4.1;
export const BLINK_DURATION_SEC = 0.14;

/**
 * Deterministic natural eyelid blink weight in `[0, 1]` (`0` = open, `1` = closed).
 * Blinks every `3.2–4.1s` seeded by `phaseOf(actorId)` with a smooth `140 ms` close/open curve.
 * Replaces whole-body vertical squash on `"blink"`.
 */
export function blinkWeightAt(actorId: string, elapsedSec: number, reducedMotion = false): number {
  const seed = phaseOf(actorId);
  const basePeriod = BLINK_MIN_PERIOD_SEC + (BLINK_MAX_PERIOD_SEC - BLINK_MIN_PERIOD_SEC) * seed;
  const period = reducedMotion ? basePeriod * 1.15 : basePeriod;
  const offset = phaseOf(`${actorId}:blink`) * period;
  const t = Math.max(0, elapsedSec) + offset;
  const cycleSec = t - Math.floor(t / period) * period;
  if (cycleSec >= BLINK_DURATION_SEC) return 0;
  const u = cycleSec / BLINK_DURATION_SEC;
  // Smooth close/open bell: sin^2(PI * u) has zero velocity at start and end.
  const s = Math.sin(Math.PI * u);
  return s * s;
}

/** Eyelid sub-part pose for a blink weight in `[0, 1]` (`undefined` when open). */
export function eyelidPoseFromWeight(weight: number): ArticulatedPoseMap | undefined {
  const w = clamp01(weight);
  if (w < 1e-3) return undefined;
  const lidScaleY = lerp(1, 0.1, w);
  const lidDrop = -0.014 * w;
  const lidPose: ArticulatedPartPose = {
    offset: [0, lidDrop, 0.004 * w],
    scale: [1, lidScaleY, 1]
  };
  return { eyelidL: lidPose, eyelidR: lidPose };
}

export function blinkPartsAt(actorId: string, elapsedSec: number, reducedMotion = false): ArticulatedPoseMap | undefined {
  return eyelidPoseFromWeight(blinkWeightAt(actorId, elapsedSec, reducedMotion));
}

// ---------------------------------------------------------------- smooth head / gaze tracking

export const MAX_HEAD_GAZE_YAW_RAD = 0.38;
export const MAX_HEAD_GAZE_PITCH_RAD = 0.2;

export interface HeadGazeOptions {
  readonly headHeightM?: number;
  readonly maxYawRad?: number;
  readonly maxPitchRad?: number;
  readonly weight?: number;
}

export interface HeadGazeResult {
  readonly yaw: number;
  readonly pitch: number;
  readonly parts: ArticulatedPoseMap;
}

/**
 * Computes clamped local `head` yaw (`±0.38 rad`) and pitch (`±0.20 rad`) toward `targetPosition`
 * using `@aura3d/engine/game` `yawToFace`.
 */
export function computeHeadGaze(
  actorPosition: Vec3,
  actorYaw: number,
  targetPosition: Vec3 | null | undefined,
  options: HeadGazeOptions = {}
): HeadGazeResult {
  if (!targetPosition) return { yaw: 0, pitch: 0, parts: {} };
  const weight = clamp01(options.weight ?? 1);
  if (weight <= 1e-4) return { yaw: 0, pitch: 0, parts: {} };
  const dx = targetPosition[0] - actorPosition[0];
  const dz = targetPosition[2] - actorPosition[2];
  const horizontal = Math.hypot(dx, dz);
  if (horizontal < 1e-4) return { yaw: 0, pitch: 0, parts: {} };

  const maxYaw = options.maxYawRad ?? MAX_HEAD_GAZE_YAW_RAD;
  const maxPitch = options.maxPitchRad ?? MAX_HEAD_GAZE_PITCH_RAD;
  const desiredWorldYaw = yawToFace(dx, dz, "+z");
  const localYaw = clamp(wrapGameAngle(desiredWorldYaw - actorYaw) * weight, -maxYaw, maxYaw);

  const eyeY = actorPosition[1] + (options.headHeightM ?? 0.62);
  const dy = targetPosition[1] - eyeY;
  // In +Z-forward ZYX Euler, positive rx tilts +Z downward and negative rx tilts +Z upward.
  const rawPitch = -Math.atan2(dy, horizontal);
  const localPitch = clamp(rawPitch * weight, -maxPitch, maxPitch);

  if (Math.abs(localYaw) < 1e-4 && Math.abs(localPitch) < 1e-4) {
    return { yaw: 0, pitch: 0, parts: {} };
  }
  return {
    yaw: localYaw,
    pitch: localPitch,
    parts: {
      head: {
        rotation: [localPitch, localYaw, -localYaw * 0.12]
      }
    }
  };
}

export interface GazeTracker {
  step(actorPosition: Vec3, actorYaw: number, targetPosition: Vec3 | null, dtSec: number, options?: HeadGazeOptions): HeadGazeResult;
  snap(targetPosition: Vec3): void;
}

/** Critically-damped 3D gaze target follower backed by `@aura3d/engine/game` `createSmoothFollow3`. */
export function createGazeTracker(smoothTime = 0.18): GazeTracker {
  const follower: SmoothFollow3 = createSmoothFollow3([0, 0.65, 2], { smoothTime, maxSpeed: 8 });
  let weight = 0;
  return {
    step(actorPosition, actorYaw, targetPosition, dtSec, options) {
      const dt = Math.max(0, Number.isFinite(dtSec) ? dtSec : 0);
      if (targetPosition) {
        follower.step(targetPosition, dt);
        weight = clamp01(weight + dt * 4.5);
      } else {
        weight = clamp01(weight - dt * 3.5);
      }
      const p = follower.position;
      return computeHeadGaze(actorPosition, actorYaw, [p[0], p[1], p[2]], {
        ...options,
        weight: weight * clamp01(options?.weight ?? 1)
      });
    },
    snap(targetPosition) {
      follower.snap(targetPosition);
      weight = 1;
    }
  };
}

// ---------------------------------------------------------------- wheel arc-length spin (`Δθ = Δs / r`)

/** Exact non-slipping wheel spin angle (`Δθ = Δs / r`) in radians. */
export function wheelSpinAngle(distanceTravelled: number, wheelRadius: number): number {
  if (!Number.isFinite(distanceTravelled) || !(wheelRadius > 1e-6)) return 0;
  return distanceTravelled / wheelRadius;
}

/** 4-wheel spin pose map (`wheelFL`, `wheelFR`, `wheelRL`, `wheelRR`) for `gogo`, `gogoCarriage`, and `car`. */
export function wheelSpinParts(distanceTravelled: number, wheelRadius: number): ArticulatedPoseMap | undefined {
  const angle = wheelSpinAngle(distanceTravelled, wheelRadius);
  if (Math.abs(angle) < 1e-5) return undefined;
  const wheelPose: ArticulatedPartPose = { rotation: [angle, 0, 0] };
  return {
    wheelFL: wheelPose,
    wheelFR: wheelPose,
    wheelRL: wheelPose,
    wheelRR: wheelPose
  };
}

// ---------------------------------------------------------------- speech & locomotion sub-parts

/**
 * 20 Hz syllable-envelope speech sub-parts (`jaw` / `beakLower` / `cheekPuff` + `head` nod + gentle `body` breath).
 */
export function speechSubParts(
  actorId: string,
  speechEnergy: number,
  timeSec: number,
  reducedMotion = false
): ArticulatedPoseMap | undefined {
  const e = clamp01(speechEnergy);
  if (e <= 1e-3) return undefined;
  const damp = reducedMotion ? 0.55 : 1;
  const energy = e * damp;
  const cadence = Math.sin(TAU * 2.8 * timeSec + phaseOf(actorId) * TAU);
  const breath = 1 + 0.018 * energy;

  if (actorId === "peeko") {
    // Peeko opens beakLower 0..0.24 rad cleanly from speechEnergy.
    return {
      beakLower: { rotation: [0.24 * e * (reducedMotion ? 0.7 : 1), 0, 0] },
      head: { rotation: [0.045 * energy * (0.6 + 0.4 * cadence), 0.02 * energy * cadence, 0.025 * energy * cadence] },
      tuft: { rotation: [-0.08 * energy, 0, 0.05 * energy * cadence] },
      body: { scale: [1, breath, 1] }
    };
  }

  if (actorId === "gogo") {
    return {
      chimney: {
        scale: [1 + 0.09 * energy, 1 - 0.1 * energy, 1 + 0.09 * energy],
        offset: [0, 0.01 * energy, 0]
      },
      jaw: { rotation: [0.12 * energy, 0, 0] },
      body: { scale: [1 + 0.014 * energy, 1 + 0.022 * energy, 1 + 0.014 * energy] }
    };
  }

  if (actorId === "lumi") {
    const shimmer = 1 + 0.045 * energy;
    return {
      body: { scale: [shimmer, shimmer, shimmer] },
      cheekPuff: { scale: [1 + 0.08 * energy, 1 + 0.08 * energy, 1 + 0.08 * energy] }
    };
  }

  // Momo, Lulu, Sheru, and speaking props/friends: subtle jaw + warm cheekPuff + expressive head nod.
  return {
    jaw: {
      rotation: [0.18 * energy, 0, 0],
      offset: [0, -0.01 * energy, 0]
    },
    cheekPuff: {
      scale: [1 + 0.09 * energy, 1 + 0.07 * energy, 1 + 0.09 * energy]
    },
    head: {
      rotation: [0.055 * energy * (0.65 + 0.35 * cadence), 0.025 * energy * cadence, 0.03 * energy * cadence]
    },
    body: {
      scale: [1 + 0.01 * energy, breath, 1 + 0.01 * energy]
    }
  };
}

/**
 * Character locomotion sub-parts (`walk`, `run`, `hop`, `float`, `drive`) backed by
 * `@aura3d/engine/game` `proceduralLegSwing` and `handBounceOverlayAngles`.
 */
export function locomotionSubParts(
  characterId: CharacterId | string,
  style: MoveStyle | null,
  elapsedSec: number,
  reducedMotion = false,
  distanceTravelled = 0
): ArticulatedPoseMap | undefined {
  if (!style) return undefined;
  const k = reducedMotion ? 0.35 : 1;

  if (style === "drive" || characterId === "gogo") {
    const chug = reducedMotion ? 0 : Math.abs(Math.sin(TAU * 2.5 * elapsedSec));
    const spinDist = distanceTravelled > 0 ? distanceTravelled : elapsedSec * 1.5;
    const wheels = wheelSpinParts(spinDist, 0.16);
    return mergePartPoses(wheels, chug > 1e-3 ? {
      chimney: {
        scale: [1 + 0.12 * chug, 1 - 0.14 * chug, 1 + 0.12 * chug],
        offset: [0, 0.012 * chug, 0]
      }
    } : undefined);
  }

  if (characterId === "lumi" || style === "float") {
    if (reducedMotion) return undefined;
    const w = TAU * 0.38 * elapsedSec;
    return {
      body: {
        offset: [0.035 * Math.sin(w), 0.025 * Math.sin(2 * w), 0],
        rotation: [0, 0, 0.07 * Math.cos(w)]
      }
    };
  }

  if (characterId === "sheru") {
    const hz = style === "run" ? 2.6 : 1.7;
    const phase = frac(elapsedSec * hz);
    const s = Math.sin(TAU * phase) * k;
    const liftA = Math.max(0, s) * 0.045;
    const liftB = Math.max(0, -s) * 0.045;
    const swing = 0.42 * s;
    const earFlop = 0.14 * Math.sin(TAU * phase - 0.55) * k;
    return {
      legFL: { rotation: [swing, 0, 0], offset: [0, liftA, 0] },
      legBR: { rotation: [swing, 0, 0], offset: [0, liftA, 0] },
      legFR: { rotation: [-swing, 0, 0], offset: [0, liftB, 0] },
      legBL: { rotation: [-swing, 0, 0], offset: [0, liftB, 0] },
      earL: { rotation: [Math.abs(earFlop) * 0.5, 0, -0.08 - Math.abs(earFlop)] },
      earR: { rotation: [Math.abs(earFlop) * 0.5, 0, 0.08 + Math.abs(earFlop)] },
      tail: { rotation: [0.16, 0.24 * Math.sin(TAU * 3.2 * elapsedSec) * k, 0] }
    };
  }

  if (characterId === "peeko" || style === "hop") {
    const phase = frac(elapsedSec * 1.9);
    const hopLift = Math.max(0, Math.sin(TAU * phase)) * k;
    return {
      wingL: { rotation: [0, 0, -0.36 * hopLift] },
      wingR: { rotation: [0, 0, 0.36 * hopLift] },
      tuft: { rotation: [-0.16 * hopLift, 0, 0], offset: [0, 0.02 * hopLift, 0] },
      footL: { rotation: [0.28 * hopLift, 0, 0] },
      footR: { rotation: [0.28 * hopLift, 0, 0] }
    };
  }

  // Bipeds (Momo, Lulu, robot, etc.): proceduralLegSwing + upper-body overlay lean.
  const isRun = style === "run";
  const hz = isRun ? 2.5 : 1.6;
  const speed = isRun ? 2.0 : 1.1;
  const stridePhase = frac(elapsedSec * hz);
  const gait = proceduralLegSwing(stridePhase, speed * k, {
    maxHip: isRun ? 0.62 : 0.42,
    maxKnee: isRun ? 0.55 : 0.34,
    speedForMax: 2.2
  });
  const bounceOverlay = handBounceOverlayAngles(isRun ? 0.35 * k : 0.14 * k, true, 0.4);
  const leftLift = Math.max(0, Math.sin(TAU * stridePhase)) * (isRun ? 0.075 : 0.045) * k;
  const rightLift = Math.max(0, -Math.sin(TAU * stridePhase)) * (isRun ? 0.075 : 0.045) * k;

  return {
    footL: {
      rotation: [-gait.left.hip + gait.left.knee * 0.35, 0, 0],
      offset: [0, leftLift, gait.left.hip * 0.08]
    },
    footR: {
      rotation: [-gait.right.hip + gait.right.knee * 0.35, 0, 0],
      offset: [0, rightLift, gait.right.hip * 0.08]
    },
    armL: {
      rotation: [-gait.armLeft * 0.85, 0, 0.08]
    },
    armR: {
      rotation: [-gait.armRight * 0.85, 0, -0.08]
    },
    head: {
      rotation: [bounceOverlay.head * 0.5, 0, 0.03 * Math.sin(TAU * stridePhase) * k]
    },
    ...(characterId === "lulu" ? {
      tail: { rotation: [0.06, -0.24 * Math.sin(TAU * stridePhase) * k, 0] }
    } : {})
  };
}

// ---------------------------------------------------------------- signature character gesture sub-parts (PRD §5.2)

export interface CharacterSubPartSampleInput {
  readonly id: string;
  readonly gesture: Gesture | null;
  readonly gestureElapsedSec: number;
  readonly gestureDurationSec: number;
  readonly loop: boolean;
  readonly holding: boolean;
  readonly holdGesture?: Gesture | null;
  readonly locomotion: MoveStyle | null;
  readonly speechEnergy: number;
  readonly carrying?: boolean;
  readonly timeSec: number;
  readonly reducedMotion: boolean;
  readonly distanceTravelled?: number;
}

function holdRamp01(u: number): number {
  return ease("inOutSine", clamp01(u / 0.35));
}

function gestureSpecificSubParts(
  actorId: string,
  gesture: Gesture,
  elapsedSec: number,
  durationSec: number,
  loop: boolean,
  reducedMotion: boolean
): ArticulatedPoseMap | undefined {
  const dur = Math.max(0.1, durationSec);
  const u = loop ? frac(Math.max(0, elapsedSec) / dur) : clamp01(elapsedSec / dur);
  const env = loop ? 1 : envelope(u);
  const holdEnv = loop ? 1 : holdRamp01(u);
  const k = reducedMotion ? 0.5 : 1;

  if (gesture === "blink") {
    const blinkU = clamp01(elapsedSec / Math.max(0.14, dur));
    const s = Math.sin(Math.PI * blinkU);
    return eyelidPoseFromWeight(s * s);
  }

  // ---- Momo: warm host (wave armR +1.9 rad, point armR + head lock, carry cradle)
  if (actorId === "momo") {
    switch (gesture) {
      case "wave": {
        const lift = loop ? 1 : Math.sin(Math.PI * clamp01(u * 1.15 > 1 ? 1 - (u - 0.8) / 0.2 : Math.min(1, u / 0.22)));
        const waveEnvelope = loop ? 1 : envelope(u);
        const waveArc = Math.sin(TAU * 2.5 * u) * waveEnvelope * k;
        return {
          armR: {
            rotation: [-0.32 * waveEnvelope, 0.14 * waveArc, 1.9 * waveEnvelope * (reducedMotion ? 0.75 : 1) + 0.34 * waveArc],
            offset: [0.03 * waveEnvelope, 0.08 * waveEnvelope, 0.03 * waveEnvelope]
          },
          head: {
            rotation: [-0.04 * waveEnvelope, 0.08 * waveArc, 0.14 * waveEnvelope * k]
          },
          armL: {
            rotation: [0.08 * waveEnvelope, 0, -0.1 * waveEnvelope * lift]
          }
        };
      }
      case "point":
        return {
          armR: {
            rotation: [-1.32 * env, -0.1 * env, 0.12 * env],
            offset: [0, 0.04 * env, 0.08 * env]
          },
          head: {
            rotation: [-0.05 * env, 0.12 * env, 0.04 * env]
          }
        };
      case "wait":
        return {
          head: { rotation: [0.08 * holdEnv * k, 0, 0.07 * holdEnv * k] },
          armL: { rotation: [-0.22 * holdEnv, 0.12 * holdEnv, 0] },
          armR: { rotation: [-0.22 * holdEnv, -0.12 * holdEnv, 0] }
        };
      case "pickUp":
        return {
          armL: { rotation: [-0.95 * env, 0.28 * env, 0.15 * env] },
          armR: { rotation: [-0.95 * env, -0.28 * env, -0.15 * env] },
          head: { rotation: [0.18 * env * k, 0, 0] }
        };
      case "clap": {
        const beat = 0.5 * (1 - Math.cos(TAU * 3 * u)) * env;
        return {
          armL: { rotation: [-0.85 * env, -0.58 * beat, 0.22 * beat] },
          armR: { rotation: [-0.85 * env, 0.58 * beat, -0.22 * beat] }
        };
      }
      case "shrug":
        return {
          armL: { rotation: [-0.35 * env, 0.2 * env, -0.65 * env], offset: [0, 0.04 * env, 0] },
          armR: { rotation: [-0.35 * env, -0.2 * env, 0.65 * env], offset: [0, 0.04 * env, 0] },
          head: { rotation: [0, 0, 0.12 * env * k] }
        };
      default:
        break;
    }
  }

  // ---- Lulu: mint baby dinosaur rhythm leader (clap inward, alternating stomp +0.14m, dance groove + tail, freeze mid-pose)
  if (actorId === "lulu") {
    switch (gesture) {
      case "clap": {
        const beat = 0.5 * (1 - Math.cos(TAU * 3 * u)) * env;
        return {
          armL: {
            rotation: [-0.88 * env, -0.64 * beat, 0.26 * beat],
            offset: [0.05 * beat, 0.03 * beat, 0.06 * beat]
          },
          armR: {
            rotation: [-0.88 * env, 0.64 * beat, -0.26 * beat],
            offset: [-0.05 * beat, 0.03 * beat, 0.06 * beat]
          },
          head: { rotation: [0.07 * beat * k, 0, 0] },
          tail: { rotation: [0.05, 0.18 * Math.sin(TAU * 3 * u) * env * k, 0] }
        };
      }
      case "stomp": {
        const stepOsc = Math.sin(TAU * 2 * u) * env;
        const leftLift = Math.max(0, stepOsc) * 0.14 * (reducedMotion ? 0.6 : 1);
        const rightLift = Math.max(0, -stepOsc) * 0.14 * (reducedMotion ? 0.6 : 1);
        return {
          footL: {
            offset: [0, leftLift, 0.02 * (leftLift / 0.14)],
            rotation: [-0.28 * (leftLift / 0.14), 0, 0]
          },
          footR: {
            offset: [0, rightLift, 0.02 * (rightLift / 0.14)],
            rotation: [-0.28 * (rightLift / 0.14), 0, 0]
          },
          armL: { rotation: [0.35 * stepOsc * k, 0, -0.18] },
          armR: { rotation: [-0.35 * stepOsc * k, 0, 0.18] },
          tail: { rotation: [0.08, -0.3 * stepOsc * k, 0.1 * stepOsc * k] }
        };
      }
      case "dance":
      case "sway": {
        const groove = Math.sin(TAU * (gesture === "dance" ? 3 : 1) * u) * env * k;
        const bounce = Math.sin(TAU * (gesture === "dance" ? 6 : 2) * u) * env * k;
        return {
          armL: { rotation: [-0.55 * env + 0.38 * groove, 0.15 * groove, -0.35 - 0.25 * groove] },
          armR: { rotation: [-0.55 * env - 0.38 * groove, 0.15 * groove, 0.35 - 0.25 * groove] },
          tail: { rotation: [0.08, -0.42 * groove, -0.16 * groove] },
          head: { rotation: [0.05 * bounce, 0.08 * groove, 0.1 * groove] }
        };
      }
      case "freeze": {
        const poseWeight = holdEnv;
        return {
          armL: { rotation: [-0.72 * poseWeight, -0.18 * poseWeight, -0.48 * poseWeight] },
          armR: { rotation: [-0.92 * poseWeight, 0.2 * poseWeight, 0.56 * poseWeight] },
          head: { rotation: [-0.05 * poseWeight, 0.12 * poseWeight, 0.1 * poseWeight] },
          tail: { rotation: [0.06 * poseWeight, 0.26 * poseWeight, 0] }
        };
      }
      default:
        break;
    }
  }

  // ---- Sheru: floppy-eared puppy (wag tail 5.5 Hz ±0.48 rad, sit hind tuck + level head, sniff +0.42 rad nose-down + ear lag)
  if (actorId === "sheru") {
    switch (gesture) {
      case "wag":
      case "happy":
      case "cheer":
      case "wave":
      case "dance": {
        const tailAngle = 0.48 * Math.sin(TAU * 5.5 * elapsedSec) * env * (reducedMotion ? 0.55 : 1);
        const earBounce = 0.14 * Math.sin(TAU * 2.75 * elapsedSec - 0.4) * env * k;
        return {
          tail: {
            rotation: [0.22, tailAngle, tailAngle * 0.35]
          },
          earL: { rotation: [0.08 * env, 0, -0.12 - Math.abs(earBounce)] },
          earR: { rotation: [0.08 * env, 0, 0.12 + Math.abs(earBounce)] },
          head: { rotation: [-0.05 * env * k, 0.06 * Math.sin(TAU * 2 * u) * env * k, 0.08 * Math.sin(TAU * u) * env * k] }
        };
      }
      case "sit":
      case "wait": {
        const sitK = gesture === "sit" ? holdEnv : holdEnv * 0.72;
        return {
          body: {
            rotation: [-0.36 * sitK, 0, 0],
            offset: [0, -0.05 * sitK, -0.02 * sitK]
          },
          // Counter-pitch head so Sheru gazes warmly and level at the child while seated.
          head: {
            rotation: [0.34 * sitK, 0, 0.05 * sitK]
          },
          legBL: {
            rotation: [-0.75 * sitK, 0, 0],
            offset: [0, 0.04 * sitK, 0.05 * sitK]
          },
          legBR: {
            rotation: [-0.75 * sitK, 0, 0],
            offset: [0, 0.04 * sitK, 0.05 * sitK]
          },
          legFL: { rotation: [0.18 * sitK, 0, 0] },
          legFR: { rotation: [0.18 * sitK, 0, 0] },
          tail: { rotation: [0.15, 0.22 * Math.sin(TAU * 3.2 * elapsedSec) * sitK * k, 0] }
        };
      }
      case "sniff": {
        const noseBob = 0.06 * Math.sin(TAU * 5 * u) * env * k;
        const lagU = clamp01((elapsedSec - 0.07) / dur);
        const earLag = (loop ? 1 : envelope(lagU)) * (1 + 0.22 * Math.sin(TAU * 5 * lagU));
        return {
          // Positive rx in +Z-forward ZYX pitches Sheru's snout down by 0.42 rad toward the ground.
          head: {
            rotation: [(0.42 + noseBob) * env * (reducedMotion ? 0.65 : 1), 0.08 * Math.sin(TAU * 2 * u) * env * k, 0],
            offset: [0, -0.03 * env, 0.03 * env]
          },
          earL: {
            rotation: [0.32 * earLag, 0, -0.14 * earLag]
          },
          earR: {
            rotation: [0.32 * earLag, 0, 0.14 * earLag]
          },
          tail: {
            rotation: [0.24 * env, 0.2 * Math.sin(TAU * 4 * elapsedSec) * env * k, 0]
          }
        };
      }
      case "bark":
        return {
          jaw: { rotation: [0.28 * env, 0, 0] },
          head: { rotation: [-0.14 * env * k, 0, 0] },
          earL: { rotation: [-0.12 * env, 0, -0.18 * env] },
          earR: { rotation: [-0.12 * env, 0, 0.18 * env] },
          tail: { rotation: [0.2, 0.35 * Math.sin(TAU * 5 * u) * env * k, 0] }
        };
      case "surprise":
        return {
          earL: { rotation: [-0.18 * env, 0, -0.26 * env], offset: [0, 0.02 * env, 0] },
          earR: { rotation: [-0.18 * env, 0, 0.26 * env], offset: [0, 0.02 * env, 0] },
          head: { rotation: [-0.08 * env, 0, 0.14 * env * k] }
        };
      default:
        break;
    }
  }

  // ---- Peeko: round peekaboo chick (wingL/wingR ±0.65 rad Z-flap + tuft bounce, zero torso X-stretch!)
  if (actorId === "peeko") {
    switch (gesture) {
      case "wave":
      case "happy":
      case "cheer":
      case "surprise": {
        const cycles = gesture === "surprise" ? 2 : gesture === "wave" ? 3 : 4;
        const flapWave = Math.abs(Math.sin(TAU * cycles * u)) * env * (reducedMotion ? 0.55 : 1);
        const tuftLag = Math.abs(Math.sin(TAU * cycles * u - 0.45)) * env * k;
        return {
          wingL: {
            rotation: [0.08 * flapWave, 0, -0.65 * flapWave],
            offset: [-0.02 * flapWave, 0.03 * flapWave, 0]
          },
          wingR: {
            rotation: [0.08 * flapWave, 0, 0.65 * flapWave],
            offset: [0.02 * flapWave, 0.03 * flapWave, 0]
          },
          tuft: {
            rotation: [-0.22 * tuftLag, 0, 0.1 * Math.sin(TAU * cycles * u) * env * k],
            offset: [0, 0.035 * tuftLag, 0]
          },
          beakLower: {
            rotation: [gesture === "cheer" || gesture === "happy" ? 0.16 * env : 0.08 * env, 0, 0]
          }
        };
      }
      case "hide": {
        const tuck = holdEnv;
        return {
          wingL: { rotation: [0.22 * tuck, 0.18 * tuck, 0.24 * tuck] },
          wingR: { rotation: [0.22 * tuck, -0.18 * tuck, -0.24 * tuck] },
          head: { rotation: [0.28 * tuck, 0, 0], offset: [0, -0.05 * tuck, 0] },
          tuft: { rotation: [0.35 * tuck, 0, 0], scale: [1, 1 - 0.25 * tuck, 1] },
          eyelidL: { scale: [1, 0.15, 1] },
          eyelidR: { scale: [1, 0.15, 1] }
        };
      }
      case "peek": {
        return {
          wingL: { rotation: [0, 0, -0.35 * env] },
          wingR: { rotation: [0, 0, 0.35 * env] },
          tuft: { rotation: [-0.2 * env, 0, -0.14 * env], offset: [0, 0.03 * env, 0] },
          head: { rotation: [-0.08 * env, 0.14 * env * k, -0.12 * env * k] }
        };
      }
      default:
        break;
    }
  }

  // ---- Lumi: warm star (smooth Lissajous figure-8 hover + gentle ray shimmer, zero strobe)
  if (actorId === "lumi") {
    switch (gesture) {
      case "float":
      case "dance": {
        if (reducedMotion) return undefined;
        const w = TAU * u;
        return {
          body: {
            offset: [0.045 * Math.sin(w), 0.025 * Math.sin(2 * w), 0],
            rotation: [0, 0, 0.07 * Math.cos(w)]
          },
          petals: {
            scale: [1 + 0.035 * Math.sin(w), 1 + 0.035 * Math.cos(w), 1]
          }
        };
      }
      case "glow": {
        const swell = 1 + 0.06 * env * k;
        return {
          body: { scale: [swell, swell, swell] },
          petals: { scale: [swell * 1.02, swell * 1.02, 1] }
        };
      }
      default:
        break;
    }
  }

  // ---- GoGo: chunky toy train (chimney chugga squash, cabDoorL boarding swing, spring nod)
  if (actorId === "gogo") {
    switch (gesture) {
      case "wait":
        return {
          cabDoorL: { rotation: [0, -1.25 * holdEnv, 0] },
          chimney: { scale: [1 + 0.04 * holdEnv, 1 - 0.04 * holdEnv, 1 + 0.04 * holdEnv] }
        };
      case "happy":
      case "cheer":
      case "wave": {
        const puff = Math.abs(Math.sin(TAU * 2 * u)) * env * k;
        return {
          chimney: {
            scale: [1 + 0.14 * puff, 1 - 0.16 * puff, 1 + 0.14 * puff],
            offset: [0, 0.015 * puff, 0]
          }
        };
      }
      default:
        break;
    }
  }

  // Generic warm sub-part accents for any actor with head/arms/wings.
  switch (gesture) {
    case "wave":
      return {
        armR: { rotation: [-0.25 * env, 0, 1.55 * env + 0.28 * Math.sin(TAU * 2 * u) * env * k] },
        head: { rotation: [0, 0, 0.1 * env * k] }
      };
    case "nod":
      return {
        head: { rotation: [0.2 * 0.5 * (1 - Math.cos(TAU * 2 * u)) * k, 0, 0] }
      };
    case "look":
      return {
        head: { rotation: [0, 0.32 * Math.sin(TAU * u) * env * k, 0.05 * Math.sin(TAU * u) * env * k] }
      };
    case "sleep":
      return {
        head: { rotation: [0.22 * holdEnv, 0, 0.08 * holdEnv] },
        eyelidL: { scale: [1, lerp(1, 0.08, holdEnv), 1] },
        eyelidR: { scale: [1, lerp(1, 0.08, holdEnv), 1] }
      };
    default:
      return undefined;
  }
}

/**
 * Full articulated sub-part pose for an actor at the current instant:
 * natural eyelid blink + locomotion gait + gesture / held pose + carry cradle + 20 Hz speech sync.
 */
export function sampleCharacterSubParts(input: CharacterSubPartSampleInput): ArticulatedPoseMap | undefined {
  const blink = blinkPartsAt(input.id, input.timeSec, input.reducedMotion);
  const loco = locomotionSubParts(
    input.id,
    input.locomotion,
    input.timeSec,
    input.reducedMotion,
    input.distanceTravelled ?? 0
  );

  let gestureParts: ArticulatedPoseMap | undefined;
  if (input.gesture) {
    gestureParts = gestureSpecificSubParts(
      input.id,
      input.gesture,
      input.gestureElapsedSec,
      input.gestureDurationSec,
      input.loop,
      input.reducedMotion
    );
  } else if (input.holding && input.holdGesture) {
    gestureParts = gestureSpecificSubParts(
      input.id,
      input.holdGesture,
      1,
      1,
      false,
      input.reducedMotion
    );
  } else if (input.id === "lumi" && !input.reducedMotion && !input.locomotion) {
    // Lumi's calm Lissajous figure-8 hover at idle.
    const w = (TAU * input.timeSec) / 5.2 + phaseOf(input.id) * TAU;
    gestureParts = {
      body: {
        offset: [0.04 * Math.sin(w), 0.02 * Math.sin(2 * w), 0],
        rotation: [0, 0, 0.065 * Math.cos(w)]
      },
      petals: {
        scale: [1 + 0.025 * Math.sin(w * 1.5), 1 + 0.025 * Math.cos(w * 1.5), 1]
      }
    };
  }

  const carryParts: ArticulatedPoseMap | undefined = input.carrying && (input.id === "momo" || input.id === "lulu")
    ? {
        armL: { rotation: [-0.88, 0.26, 0.16], offset: [0.02, 0.02, 0.04] },
        armR: { rotation: [-0.88, -0.26, -0.16], offset: [-0.02, 0.02, 0.04] }
      }
    : undefined;

  const speech = speechSubParts(input.id, input.speechEnergy, input.timeSec, input.reducedMotion);

  return mergePartPoses(loco, gestureParts, carryParts, speech, blink);
}

// ---------------------------------------------------------------- optional skinned clip + AuraVoice viseme bridge

export type AuraVoiceBridgeInput = Parameters<typeof sampleAuraVoiceBridgeAtTime>[0];
export type AuraVoiceVisemeTrackInput = Parameters<typeof sampleVisemeTrack>[0];

export interface SkinnedActorBridgeOptions {
  readonly actorId: string;
  readonly rigged: boolean;
  readonly clips: readonly string[];
  readonly crossFadeDurationSec?: number;
}

export interface SkinnedActorBridge {
  readonly active: boolean;
  readonly controller: AnimationController | null;
  playClip(handle: AuraRuntimeNodeHandle | undefined, clipName: string, loop?: boolean): boolean;
  update(dtSec: number): void;
  applyVoiceBridge(
    handle: AuraRuntimeNodeHandle | undefined,
    bridgePackage: AuraVoiceBridgeInput,
    timeSec: number
  ): number;
  applyVisemeTrack(
    handle: AuraRuntimeNodeHandle | undefined,
    track: AuraVoiceVisemeTrackInput,
    timeSec: number
  ): number;
  applySpeechEnvelopeMorphs(handle: AuraRuntimeNodeHandle | undefined, speechEnergy: number): void;
  dispose(): void;
}

/**
 * Optional skinned-GLB clip + AuraVoice viseme bridge using `@aura3d/engine`'s
 * `createAnimationController` and `sampleAuraVoiceBridgeAtTime`.
 * Activates only when `rigged === true` and `clips.length > 0`.
 */
export function createSkinnedActorBridge(options: SkinnedActorBridgeOptions): SkinnedActorBridge {
  const enabled = options.rigged && options.clips.length > 0;
  if (!enabled) {
    return {
      active: false,
      controller: null,
      playClip: () => false,
      update: () => {},
      applyVoiceBridge: () => 0,
      applyVisemeTrack: () => 0,
      applySpeechEnvelopeMorphs: () => {},
      dispose: () => {}
    };
  }

  const controller = createAnimationController({
    clips: options.clips.map((id) => ({ id, duration: 1.5, loop: true }))
  });
  const fadeSec = options.crossFadeDurationSec ?? 0.2;
  let currentClip: string | null = null;

  return {
    active: true,
    controller,
    playClip(handle, clipName, loop = true) {
      if (!options.clips.includes(clipName)) return false;
      if (currentClip === clipName) return true;
      if (currentClip !== null) {
        controller.crossFade(clipName, fadeSec, { loop });
      } else {
        controller.play(clipName, { loop });
      }
      handle?.play(clipName, { loop });
      currentClip = clipName;
      return true;
    },
    update(dtSec) {
      controller.update(Math.max(0, Number.isFinite(dtSec) ? dtSec : 0));
    },
    applyVoiceBridge(handle, bridgePackage, timeSec) {
      const sample = sampleAuraVoiceBridgeAtTime(bridgePackage, Math.max(0, timeSec), options.actorId);
      const viseme = sample.viseme;
      if (!viseme) {
        handle?.setMorphTargets({});
        return 0;
      }
      if (handle && Object.keys(viseme.blendshapeWeights).length > 0) {
        handle.setMorphTargets(viseme.blendshapeWeights);
      }
      return clamp01(viseme.mouthOpenness);
    },
    applyVisemeTrack(handle, track, timeSec) {
      const viseme = sampleVisemeTrack(track, Math.max(0, timeSec), options.actorId);
      if (handle && Object.keys(viseme.blendshapeWeights).length > 0) {
        handle.setMorphTargets(viseme.blendshapeWeights);
      }
      return clamp01(viseme.mouthOpenness);
    },
    applySpeechEnvelopeMorphs(handle, speechEnergy) {
      if (!handle) return;
      const e = clamp01(speechEnergy);
      handle.setMorphTargets(e > 1e-3 ? {
        jawOpen: 0.65 * e,
        mouthOpen: 0.55 * e,
        viseme_aa: 0.5 * e,
        mouthSmile: 0.18 * Math.min(1, e * 1.4)
      } : {});
    },
    dispose() {
      controller.dispose();
      currentClip = null;
    }
  };
}
