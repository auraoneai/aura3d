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
import type { CharacterId, Gesture, MoveStyle, VisemeCode, VisemeCue } from "../types.js";
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
  placePiece,
  rotateZYX,
  type PoseOffset,
  type StagePose,
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

/**
 * Canonical 2-level kinematic parent hierarchy (`actorRoot -> body -> head -> leafPart`)
 * so eyes, eyelids, jaws, beaks, cheeks, ears, and tufts stay locked onto the head
 * during `computeHeadGaze`, `nod`, `tilt`, `sniff`, and `bow` without nested `groups.create` `pivot`s.
 */
export const SUB_PART_PARENT: Partial<Readonly<Record<SubPartId, SubPartId>>> = {
  head: "body",
  armL: "body",
  armR: "body",
  wingL: "body",
  wingR: "body",
  tail: "body",
  chimney: "body",
  cabDoorL: "body",
  cabDoorR: "body",
  eyelidL: "head",
  eyelidR: "head",
  jaw: "head",
  beakLower: "head",
  cheekPuff: "head",
  earL: "head",
  earR: "head",
  tuft: "head"
};

export interface ResolvedPartWorldTransform {
  readonly position: Vec3;
  readonly rotation: Vec3;
  readonly scale: Vec3;
}

/**
 * Resolves a rigid `SubPartId`'s world transform by composing `actorStagePose -> body -> head -> part`
 * around each part's baked `[0, 0, 0]` joint hinge (`partAnchorsM[part]`).
 */
export function resolveHierarchicalPartTransform(
  actorStagePose: StagePose,
  partsPose: ArticulatedPoseMap | undefined,
  part: SubPartId,
  baseAnchorM: Vec3,
  partAnchorsM?: Partial<Readonly<Record<SubPartId, Vec3>>>,
  explicitParent?: SubPartId
): ResolvedPartWorldTransform {
  // Build ancestor chain from shallowest (`body`) down to `part` (max depth 3, cycle-safe).
  const chain: SubPartId[] = [part];
  let cursor: SubPartId | undefined = explicitParent ?? SUB_PART_PARENT[part];
  let guard = 4;
  while (cursor && guard > 0) {
    guard -= 1;
    // Skip intermediate virtual parents absent on this rig (e.g. `gogo` has `eyelidL -> head -> body` with no `head`).
    if (!partAnchorsM || partAnchorsM[cursor] !== undefined) {
      chain.unshift(cursor);
    }
    cursor = SUB_PART_PARENT[cursor];
  }

  let curAnchor: Vec3 = [0, 0, 0];
  let curPos: Vec3 = [0, 0, 0];
  let curRot: Vec3 = [0, 0, 0];
  let curScale: Vec3 = [1, 1, 1];

  for (let i = 0; i < chain.length; i += 1) {
    const id = chain[i]!;
    const restAnchor: Vec3 =
      id === part ? baseAnchorM : (partAnchorsM?.[id] ?? [0, 0, 0]);
    const rel: Vec3 = [
      (restAnchor[0] - curAnchor[0]) * curScale[0],
      (restAnchor[1] - curAnchor[1]) * curScale[1],
      (restAnchor[2] - curAnchor[2]) * curScale[2]
    ];
    const carried = addVec3(curPos, rotateZYX(curRot, rel));
    const delta = partsPose?.[id];
    const localOff = delta?.offset ?? [0, 0, 0];
    const localRot = delta?.rotation ?? [0, 0, 0];
    const localScale = delta?.scale ?? [1, 1, 1];

    curPos = addVec3(carried, rotateZYX(curRot, localOff));
    curRot = composeRotation(curRot, localRot);
    curScale = [
      curScale[0] * localScale[0],
      curScale[1] * localScale[1],
      curScale[2] * localScale[2]
    ];
    curAnchor = restAnchor;
  }

  return {
    position: placePiece(actorStagePose, curPos),
    rotation: composeRotation(actorStagePose.rotation, curRot),
    scale: [
      actorStagePose.scale[0] * curScale[0],
      actorStagePose.scale[1] * curScale[1],
      actorStagePose.scale[2] * curScale[2]
    ]
  };
}

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
  if (partName === "body") {
    const rootBody = app.nodes.get(actorId);
    if (rootBody) return { handle: rootBody, source: "stand-in" };
  }
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

// ---------------------------------------------------------------- speech, timed visemes & locomotion sub-parts

export const VISEME_COARTICULATION_MS = 35;

/**
 * Samples a timed `VisemeCue[]` track at `elapsedMs` (PRD 09 B3.6).
 * Returns `{ viseme: "rest", openness: 0 }` before/after speech, in inter-word gaps, and during `"rest"` cues,
 * with a smooth 35 ms coarticulation ramp across cue boundaries so jaws never pop.
 */
function visemeCueEndMs(cue: VisemeCue): number {
  return cue.dMs !== undefined ? cue.tMs + Math.max(0, cue.dMs) : cue.endMs;
}

export function sampleVisemeAtMs(
  cues: readonly VisemeCue[],
  elapsedMs: number
): { readonly viseme: VisemeCode; readonly openness: number } {
  if (cues.length === 0 || !Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return { viseme: "rest", openness: 0 };
  }
  const first = cues[0];
  const last = cues[cues.length - 1];
  const lastEndMs = last ? visemeCueEndMs(last) : 0;
  if (!first || !last || elapsedMs < first.tMs || elapsedMs >= lastEndMs) {
    return { viseme: "rest", openness: 0 };
  }

  let activeIndex = -1;
  for (let i = 0; i < cues.length; i += 1) {
    const candidate = cues[i];
    if (!candidate) continue;
    const candidateEndMs = visemeCueEndMs(candidate);
    if (elapsedMs >= candidate.tMs && elapsedMs < candidateEndMs) {
      activeIndex = i;
      break;
    }
  }
  if (activeIndex < 0) {
    return { viseme: "rest", openness: 0 };
  }

  const cue = cues[activeIndex];
  if (!cue || cue.viseme === "rest" || !(cue.openness > 0)) {
    return { viseme: "rest", openness: 0 };
  }

  const cueEndMs = visemeCueEndMs(cue);
  const targetOpen = clamp01(cue.openness);
  const durMs = Math.max(1, cueEndMs - cue.tMs);
  const rampMs = Math.min(VISEME_COARTICULATION_MS, durMs * 0.45);
  if (rampMs <= 0.5) {
    return { viseme: cue.viseme, openness: targetOpen };
  }

  const prev = activeIndex > 0 ? cues[activeIndex - 1] : undefined;
  const next = activeIndex + 1 < cues.length ? cues[activeIndex + 1] : undefined;
  const prevEndMs = prev ? visemeCueEndMs(prev) : -Infinity;
  const prevOpen =
    prev && prev.viseme !== "rest" && Math.abs(cue.tMs - prevEndMs) <= 2
      ? clamp01(prev.openness)
      : 0;
  const nextOpen =
    next && next.viseme !== "rest" && Math.abs(next.tMs - cueEndMs) <= 2
      ? clamp01(next.openness)
      : 0;

  const entryStart = prevOpen > 0 ? 0.5 * (prevOpen + targetOpen) : 0;
  const exitEnd = nextOpen > 0 ? 0.5 * (targetOpen + nextOpen) : 0;
  const intoMs = elapsedMs - cue.tMs;
  const remainingMs = cueEndMs - elapsedMs;

  let openness = targetOpen;
  if (intoMs < rampMs) {
    openness = lerp(entryStart, targetOpen, ease("inOutSine", clamp01(intoMs / rampMs)));
  } else if (remainingMs < rampMs) {
    openness = lerp(exitEnd, targetOpen, ease("inOutSine", clamp01(remainingMs / rampMs)));
  }
  return { viseme: cue.viseme, openness: clamp01(openness) };
}

/**
 * Timed viseme mouth & face sub-parts (PRD 09 B3.6) across all Wonder World archetypes:
 * - `"rest"` or `openness <= 0.02`: `undefined` (mouth 100% closed at rest)
 * - `"MBP"`: closed/pressed lips (`jaw` `0.02`, subtle `cheekPuff` `1.05` width)
 * - `"AA"`: wide open jaw (`0.48 * openness` pitch, `-0.028 * openness` drop) + warm `cheekPuff` + gentle `head` nod
 * - `"OH"` / `"WQ"`: rounded open jaw (`0.36 * openness` pitch, slightly narrowed X / forward Z `cheekPuff`)
 * - `"EE"`: wide smile (`0.22 * openness` jaw pitch, wider `cheekPuff` X `1 + 0.15 * openness`)
 * - `"FV"` / `"LTH"`: half-open consonant (`0.16 * openness` jaw pitch)
 */
export function visemeSubParts(
  actorId: string,
  viseme: VisemeCode,
  openness: number,
  timeSec: number,
  reducedMotion = false
): ArticulatedPoseMap | undefined {
  if (viseme === "rest" || !Number.isFinite(openness) || openness <= 0.02) {
    return undefined;
  }
  const rawOpen = clamp01(openness);
  const damp = reducedMotion ? 0.65 : 1;
  const o = rawOpen * damp;
  const canonicalId = canonicalActorArchetypeId(actorId);
  const phase = phaseOf(actorId) * TAU;
  const cadence = reducedMotion ? 0 : Math.sin(TAU * 2.6 * timeSec + phase);

  if (viseme === "MBP") {
    const press = clamp01(rawOpen >= 0.12 ? 1 : (rawOpen - 0.02) / 0.1) * damp;
    if (BIRD_ACTORS.has(canonicalId)) {
      return {
        beakLower: { rotation: [0.02 * press, 0, 0] }
      };
    }
    if (canonicalId === "gogo") {
      return {
        chimney: {
          scale: [1 + 0.05 * press, 1 - 0.05 * press, 1 + 0.05 * press],
          offset: [0, 0.005 * press, 0]
        },
        jaw: { rotation: [0.02 * press, 0, 0] }
      };
    }
    if (canonicalId === "lumi") {
      const shimmer = 1 + 0.014 * press;
      return {
        jaw: { rotation: [0.02 * press, 0, 0] },
        cheekPuff: { scale: [1 + 0.05 * press, 1, 1 + 0.02 * press] },
        body: { scale: [shimmer, shimmer, shimmer] }
      };
    }
    if (canonicalId === "robot") {
      return {
        jaw: { rotation: [0.02 * press, 0, 0] }
      };
    }
    return {
      jaw: { rotation: [0.02 * press, 0, 0] },
      cheekPuff: { scale: [1 + 0.05 * press, 1 - 0.015 * press, 1 + 0.02 * press] }
    };
  }

  let pitchCoeff = 0.48;
  let dropCoeff = 0.028;
  let forwardJawCoeff = 0.004;
  let cheekScale: Vec3 = [1 + 0.11 * o, 1 + 0.09 * o, 1 + 0.11 * o];
  let cheekOffset: Vec3 | undefined;
  let nodWeight = 1;

  switch (viseme) {
    case "AA":
      pitchCoeff = 0.48;
      dropCoeff = 0.028;
      forwardJawCoeff = 0.004;
      cheekScale = [1 + 0.11 * o, 1 + 0.09 * o, 1 + 0.11 * o];
      nodWeight = 1;
      break;
    case "OH":
    case "WQ": {
      const round = viseme === "WQ" ? 1.15 : 1;
      pitchCoeff = 0.36;
      dropCoeff = 0.021;
      forwardJawCoeff = 0.002;
      cheekScale = [1 - 0.06 * o * round, 1 + 0.06 * o, 1 + 0.12 * o * round];
      cheekOffset = [0, 0, 0.005 * o * round];
      nodWeight = 0.78;
      break;
    }
    case "EE":
      pitchCoeff = 0.22;
      dropCoeff = 0.013;
      forwardJawCoeff = 0.003;
      cheekScale = [1 + 0.15 * o, 1 + 0.06 * o, 1 + 0.05 * o];
      nodWeight = 0.62;
      break;
    case "FV":
    case "LTH":
      pitchCoeff = 0.16;
      dropCoeff = 0.009;
      forwardJawCoeff = 0;
      cheekScale =
        viseme === "FV"
          ? [1 + 0.04 * o, 1, 1 - 0.03 * o]
          : [1 + 0.03 * o, 1 + 0.02 * o, 1 + 0.03 * o];
      nodWeight = 0.45;
      break;
  }

  const jawPitch = pitchCoeff * o;
  const jawDrop = -dropCoeff * o;
  const breath = 1 + 0.018 * o * nodWeight;

  if (BIRD_ACTORS.has(canonicalId)) {
    return {
      beakLower: {
        rotation: [jawPitch, 0, 0],
        offset: [0, -0.45 * dropCoeff * o, 0]
      },
      head: {
        rotation: [
          0.055 * o * nodWeight * (0.65 + 0.35 * cadence),
          0.022 * o * nodWeight * cadence,
          0.026 * o * nodWeight * cadence
        ]
      },
      ...(canonicalId === "peeko"
        ? { tuft: { rotation: [-0.09 * o * nodWeight, 0, 0.05 * o * cadence] } }
        : {}),
      body: { scale: [1, breath, 1] }
    };
  }

  if (canonicalId === "gogo") {
    const chug = o * (0.55 + 0.45 * nodWeight);
    return {
      chimney: {
        scale: [1 + 0.11 * chug, 1 - 0.12 * chug, 1 + 0.11 * chug],
        offset: [0, 0.012 * chug, 0]
      },
      jaw: {
        rotation: [0.72 * jawPitch, 0, 0],
        offset: [0, jawDrop, 0]
      },
      body: { scale: [1 + 0.012 * chug, breath, 1 + 0.012 * chug] }
    };
  }

  if (canonicalId === "lumi") {
    const shimmer = 1 + 0.036 * o * (0.5 + 0.5 * nodWeight);
    return {
      jaw: {
        rotation: [0.8 * jawPitch, 0, 0],
        offset: [0, 0.88 * jawDrop, 0]
      },
      body: { scale: [shimmer, shimmer, shimmer] },
      petals: { scale: [shimmer * 1.01, shimmer * 1.01, 1] },
      cheekPuff: {
        scale: cheekScale,
        ...(cheekOffset ? { offset: cheekOffset } : {})
      }
    };
  }

  if (canonicalId === "robot") {
    return {
      jaw: {
        rotation: [0.85 * jawPitch, 0, 0],
        offset: [0, 0.92 * jawDrop, 0]
      },
      head: {
        rotation: [
          0.05 * o * nodWeight * (0.65 + 0.35 * cadence),
          0.026 * o * nodWeight * cadence,
          0.022 * o * nodWeight * cadence
        ]
      },
      body: { scale: [1 + 0.01 * o, breath, 1 + 0.01 * o] }
    };
  }

  // Mammals & turtles (Momo, Lulu, Sheru, Tiko, Teddy, Cow, Sheep, Horse):
  return {
    jaw: {
      rotation: [jawPitch, 0, 0],
      offset: [0, jawDrop, forwardJawCoeff * o]
    },
    cheekPuff: {
      scale: cheekScale,
      ...(cheekOffset ? { offset: cheekOffset } : {})
    },
    head: {
      rotation: [
        0.06 * o * nodWeight * (0.65 + 0.35 * cadence),
        0.028 * o * nodWeight * cadence,
        0.03 * o * nodWeight * cadence
      ]
    },
    body: {
      scale: [1 + 0.01 * o * nodWeight, breath, 1 + 0.01 * o * nodWeight]
    }
  };
}

/**
 * 20 Hz syllable-envelope speech & vocalization sub-parts (`jaw` / `beakLower` / `cheekPuff` + `head` nod + `body` breath).
 * Uses a noise-gated perceptual curve plus natural ~3.8 Hz syllable articulation so mouths stay 100% closed at rest
 * (`speechEnergy <= 0.025`) and visibly open and close on every spoken line, song lyric, and animal call.
 */
export function speechSubParts(
  actorId: string,
  speechEnergy: number,
  timeSec: number,
  reducedMotion = false
): ArticulatedPoseMap | undefined {
  const e = clamp01(speechEnergy);
  if (e <= 0.025) return undefined;
  const canonicalId = canonicalActorArchetypeId(actorId);
  const damp = reducedMotion ? 0.65 : 1;
  const lifted = Math.pow(clamp01((e - 0.025) / 0.68), 0.62) * damp;
  const phase = phaseOf(actorId) * TAU;
  const cadence = Math.sin(TAU * 2.8 * timeSec + phase);
  const syllableWave = 0.5 + 0.5 * Math.sin(TAU * 3.9 * timeSec + phase * 1.3);
  const open = lifted * (reducedMotion ? 0.78 : 0.32 + 0.68 * syllableWave);
  const breath = 1 + 0.018 * lifted;

  if (BIRD_ACTORS.has(canonicalId)) {
    return {
      beakLower: {
        rotation: [0.46 * open, 0, 0],
        offset: [0, -0.012 * open, 0]
      },
      head: {
        rotation: [0.055 * lifted * (0.6 + 0.4 * cadence), 0.025 * lifted * cadence, 0.03 * lifted * cadence]
      },
      ...(canonicalId === "peeko"
        ? { tuft: { rotation: [-0.1 * lifted, 0, 0.06 * lifted * cadence] } }
        : {}),
      body: { scale: [1, breath, 1] }
    };
  }

  if (canonicalId === "gogo") {
    return {
      chimney: {
        scale: [1 + 0.1 * lifted, 1 - 0.11 * lifted, 1 + 0.1 * lifted],
        offset: [0, 0.012 * lifted, 0]
      },
      jaw: {
        rotation: [0.3 * open, 0, 0],
        offset: [0, -0.028 * open, 0]
      },
      body: { scale: [1 + 0.012 * lifted, 1 + 0.018 * lifted, 1 + 0.012 * lifted] }
    };
  }

  if (canonicalId === "lumi") {
    const shimmer = 1 + 0.035 * lifted;
    return {
      jaw: {
        rotation: [0.34 * open, 0, 0],
        offset: [0, -0.024 * open, 0]
      },
      body: { scale: [shimmer, shimmer, shimmer] },
      cheekPuff: { scale: [1 + 0.1 * open, 1 + 0.1 * open, 1 + 0.1 * open] }
    };
  }

  if (canonicalId === "robot") {
    return {
      jaw: {
        rotation: [0.36 * open, 0, 0],
        offset: [0, -0.026 * open, 0]
      },
      head: {
        rotation: [0.05 * lifted * (0.6 + 0.4 * cadence), 0.03 * lifted * cadence, 0.025 * lifted * cadence]
      },
      body: { scale: [1 + 0.01 * lifted, breath, 1 + 0.01 * lifted] }
    };
  }

  // Momo, Lulu, Sheru, Tiko, Teddy, Cow, Sheep, Horse: crisp jaw articulation + rosy cheekPuff + warm head nod.
  return {
    jaw: {
      rotation: [0.44 * open, 0, 0],
      offset: [0, -0.025 * open, 0.004 * open]
    },
    cheekPuff: {
      scale: [1 + 0.11 * open, 1 + 0.09 * open, 1 + 0.11 * open]
    },
    head: {
      rotation: [0.06 * lifted * (0.65 + 0.35 * cadence), 0.03 * lifted * cadence, 0.032 * lifted * cadence]
    },
    body: {
      scale: [1 + 0.01 * lifted, breath, 1 + 0.01 * lifted]
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

  const canonicalLocoId = canonicalActorArchetypeId(String(characterId));

  if (style === "drive" || canonicalLocoId === "gogo") {
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

  if (canonicalLocoId === "lumi" || style === "float") {
    if (reducedMotion) return undefined;
    const w = TAU * 0.38 * elapsedSec;
    return {
      body: {
        offset: [0.035 * Math.sin(w), 0.025 * Math.sin(2 * w), 0],
        rotation: [0, 0, 0.07 * Math.cos(w)]
      }
    };
  }

  if (QUADRUPED_ACTORS.has(canonicalLocoId)) {
    const hz = style === "run" ? 2.6 : 1.7;
    const phase = frac(elapsedSec * hz);
    const s = Math.sin(TAU * phase) * k;
    const liftA = Math.max(0, s) * 0.04;
    const liftB = Math.max(0, -s) * 0.04;
    const swingA = liftA > 1e-3 ? 0.38 * s : 0.12 * s;
    const swingB = liftB > 1e-3 ? -0.38 * s : -0.12 * s;
    const earFlop = 0.12 * Math.sin(TAU * phase - 0.55) * k;
    return {
      legFL: { rotation: [swingA, 0, 0], offset: [0, liftA, 0] },
      legBR: { rotation: [swingA, 0, 0], offset: [0, liftA, 0] },
      legFR: { rotation: [swingB, 0, 0], offset: [0, liftB, 0] },
      legBL: { rotation: [swingB, 0, 0], offset: [0, liftB, 0] },
      earL: { rotation: [Math.abs(earFlop) * 0.5, 0, -0.06 - Math.abs(earFlop)] },
      earR: { rotation: [Math.abs(earFlop) * 0.5, 0, 0.06 + Math.abs(earFlop)] },
      tail: { rotation: [0.14, 0.22 * Math.sin(TAU * 3.0 * elapsedSec) * k, 0] }
    };
  }

  if (BIRD_ACTORS.has(canonicalLocoId) || style === "hop") {
    const phase = frac(elapsedSec * 1.9);
    const hopLift = Math.max(0, Math.sin(TAU * phase)) * k;
    return {
      wingL: { rotation: [0, 0, -0.34 * hopLift] },
      wingR: { rotation: [0, 0, 0.34 * hopLift] },
      ...(canonicalLocoId === "peeko"
        ? { tuft: { rotation: [-0.16 * hopLift, 0, 0], offset: [0, 0.02 * hopLift, 0] } }
        : {}),
      footL: { rotation: [0.22 * hopLift, 0, 0] },
      footR: { rotation: [0.22 * hopLift, 0, 0] }
    };
  }

  if (canonicalLocoId === "tiko") {
    const isRun = style === "run";
    const hz = isRun ? 1.85 : 1.15;
    const stridePhase = frac(elapsedSec * hz);
    const wave = Math.sin(TAU * stridePhase) * k;
    const leftLift = Math.max(0, wave) * (isRun ? 0.045 : 0.028);
    const rightLift = Math.max(0, -wave) * (isRun ? 0.045 : 0.028);
    return {
      body: {
        rotation: [0, 0.045 * wave, 0.036 * wave],
        offset: [0, 0.008 * Math.abs(wave), 0]
      },
      footL: {
        rotation: [-0.26 * wave, 0, 0],
        offset: [0, leftLift, 0.038 * wave]
      },
      footR: {
        rotation: [0.26 * wave, 0, 0],
        offset: [0, rightLift, -0.038 * wave]
      },
      armL: {
        rotation: [0.3 * wave, 0.14 * wave, 0.14]
      },
      armR: {
        rotation: [-0.3 * wave, 0.14 * wave, -0.14]
      },
      head: {
        rotation: [0.035 * Math.abs(wave), -0.03 * wave, 0.025 * wave],
        offset: [0, 0, 0.012 * Math.abs(wave)]
      },
      tail: {
        rotation: [0.08, -0.2 * wave, 0]
      }
    };
  }

  // Bipeds (Momo, Lulu, Teddy, Robot): proceduralLegSwing + grounded stance clamping.
  const isRun = style === "run";
  const hz = isRun ? 2.5 : 1.6;
  const speed = isRun ? 2.0 : 1.1;
  const stridePhase = frac(elapsedSec * hz);
  const gait = proceduralLegSwing(stridePhase, speed * k, {
    maxHip: isRun ? 0.58 : 0.38,
    maxKnee: isRun ? 0.5 : 0.32,
    speedForMax: 2.2
  });
  const bounceOverlay = handBounceOverlayAngles(isRun ? 0.35 * k : 0.14 * k, true, 0.4);
  const leftLift = Math.max(0, Math.sin(TAU * stridePhase)) * (isRun ? 0.07 : 0.042) * k;
  const rightLift = Math.max(0, -Math.sin(TAU * stridePhase)) * (isRun ? 0.07 : 0.042) * k;
  const leftFootPitch = (-gait.left.hip + gait.left.knee * 0.35) * (leftLift > 1e-3 ? 1 : 0.22);
  const rightFootPitch = (-gait.right.hip + gait.right.knee * 0.35) * (rightLift > 1e-3 ? 1 : 0.22);

  return {
    footL: {
      rotation: [leftFootPitch, 0, 0],
      offset: [0, leftLift, gait.left.hip * 0.065]
    },
    footR: {
      rotation: [rightFootPitch, 0, 0],
      offset: [0, rightLift, gait.right.hip * 0.065]
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
    ...(canonicalLocoId === "lulu" ? {
      tail: { rotation: [0.06, -0.24 * Math.sin(TAU * stridePhase) * k, 0] }
    } : {})
  };
}

// ---------------------------------------------------------------- signature character gesture sub-parts (PRD §5.2)

export type ActiveCharacterPropAction =
  | "brushTeeth"
  | "washHands"
  | "dryHands"
  | "scrubTarget"
  | "dryTarget"
  | "blowBubble"
  | "playDrum"
  | "playShaker"
  | "playPiano";

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
  readonly speechViseme?: VisemeCode | null;
  readonly speechVisemeOpenness?: number | null;
  readonly carrying?: boolean;
  readonly activeAction?: ActiveCharacterPropAction | null;
  readonly activeActionWeight?: number;
  readonly timeSec: number;
  readonly reducedMotion: boolean;
  readonly distanceTravelled?: number;
}

function holdRamp01(u: number): number {
  return ease("inOutSine", clamp01(u / 0.35));
}

export const SLEEP_BREATH_HZ = 0.22;
export const CRADLE_ROCK_HZ = 0.35;

export type BedtimeArticulatedPropKey =
  | "cribMobile"
  | "musicBox"
  | "moon"
  | "sleepyCloud"
  | "cradle"
  | "nightlight";

/** Registered articulated sub-part declarations & traits for bedtime nursery props. */
export const BEDTIME_PROP_ARTICULATED_PARTS: Readonly<Record<BedtimeArticulatedPropKey, readonly SubPartId[]>> = {
  cribMobile: ["body", "petals"],
  musicBox: ["body", "lid", "petals"],
  moon: ["body", "eyelidL", "eyelidR", "cheekPuff"],
  sleepyCloud: ["body", "eyelidL", "eyelidR", "cheekPuff"],
  cradle: ["body"],
  nightlight: ["body"]
};

const BIPED_ACTORS: ReadonlySet<string> = new Set(["momo", "lulu", "tiko", "teddy", "robot"]);
const QUADRUPED_ACTORS: ReadonlySet<string> = new Set(["sheru", "cow", "sheep", "horse"]);
const BIRD_ACTORS: ReadonlySet<string> = new Set(["peeko", "duck", "bird"]);
const BEDTIME_FACE_PROPS: ReadonlySet<string> = new Set(["moon", "sleepyCloud"]);

function canonicalActorArchetypeId(actorId: string): string {
  if (
    BIPED_ACTORS.has(actorId) ||
    QUADRUPED_ACTORS.has(actorId) ||
    BIRD_ACTORS.has(actorId) ||
    actorId === "lumi" ||
    actorId === "gogo" ||
    actorId === "cribMobile" ||
    actorId === "musicBox" ||
    actorId === "moon" ||
    actorId === "sleepyCloud" ||
    actorId === "cradle" ||
    actorId === "nightlight" ||
    actorId === "flower" ||
    actorId === "flowerBud"
  ) {
    return actorId;
  }
  const compact = actorId.toLowerCase().replace(/[^a-z]/g, "");
  if (compact.startsWith("cribmobile")) return "cribMobile";
  if (compact.startsWith("musicbox")) return "musicBox";
  if (compact.startsWith("sleepycloud")) return "sleepyCloud";
  if (compact.startsWith("nightlight")) return "nightlight";
  if (compact.startsWith("cradle")) return "cradle";
  if (compact.startsWith("moon")) return "moon";
  if (compact.startsWith("tiko") || compact.startsWith("turtle")) return "tiko";
  if (compact.startsWith("sheep")) return "sheep";
  if (compact.startsWith("cow")) return "cow";
  if (compact.startsWith("duck")) return "duck";
  if (compact.startsWith("bird")) return "bird";
  if (compact.startsWith("horse")) return "horse";
  if (compact.startsWith("teddy")) return "teddy";
  if (compact.startsWith("robot")) return "robot";
  if (compact.startsWith("flowerbud")) return "flowerBud";
  if (compact.startsWith("flower")) return "flower";
  return actorId;
}

/**
 * Archetype-aware peaceful `"sleep"` pose + gentle `0.22 Hz` breathing (`0` wave when `reducedMotion === true`).
 * Closes `eyelidL`/`eyelidR` across all archetypes and tucks wings (birds), legs/ears/tail (quadrupeds),
 * petals (`lumi`), chimney (`gogo`), shell (`tiko`), or arms (`bipeds`).
 */
function sleepSubPartsForArchetype(
  actorId: string,
  canonicalId: string,
  holdEnv: number,
  timeSec: number,
  reducedMotion: boolean
): ArticulatedPoseMap {
  const breathWave = reducedMotion ? 0 : Math.sin(TAU * SLEEP_BREATH_HZ * timeSec + phaseOf(actorId) * TAU);
  const lidClosed: ArticulatedPartPose = {
    offset: [0, -0.013 * holdEnv, 0.004 * holdEnv],
    scale: [1, lerp(1, 0.08, holdEnv), 1]
  };

  if (canonicalId === "tiko") {
    return {
      body: {
        offset: [0, (-0.046 + 0.006 * breathWave) * holdEnv, 0],
        rotation: [0.08 * holdEnv, 0, 0],
        scale: [
          1 + 0.014 * breathWave * holdEnv,
          1 + 0.018 * breathWave * holdEnv,
          1 + 0.014 * breathWave * holdEnv
        ]
      },
      head: {
        rotation: [(0.22 - 0.02 * breathWave) * holdEnv, 0, 0.06 * holdEnv],
        offset: [0, -0.028 * holdEnv, -0.032 * holdEnv]
      },
      armL: {
        rotation: [-0.72 * holdEnv, 0.46 * holdEnv, -0.22 * holdEnv],
        offset: [0.018 * holdEnv, -0.01 * holdEnv, -0.014 * holdEnv]
      },
      armR: {
        rotation: [-0.72 * holdEnv, -0.46 * holdEnv, 0.22 * holdEnv],
        offset: [-0.018 * holdEnv, -0.01 * holdEnv, -0.014 * holdEnv]
      },
      footL: {
        rotation: [-0.16 * holdEnv, 0, 0],
        offset: [0, 0.01 * holdEnv, -0.016 * holdEnv]
      },
      footR: {
        rotation: [-0.16 * holdEnv, 0, 0],
        offset: [0, 0.01 * holdEnv, -0.016 * holdEnv]
      },
      tail: {
        rotation: [0.22 * holdEnv, 0.18 * holdEnv, 0],
        offset: [0, 0, 0.014 * holdEnv]
      },
      eyelidL: lidClosed,
      eyelidR: lidClosed
    };
  }

  if (BIRD_ACTORS.has(canonicalId)) {
    return {
      body: {
        offset: [0, (-0.032 + 0.006 * breathWave) * holdEnv, 0],
        rotation: [0.1 * holdEnv, 0, 0],
        scale: [
          1 + 0.014 * breathWave * holdEnv,
          1 + 0.02 * breathWave * holdEnv,
          1 + 0.014 * breathWave * holdEnv
        ]
      },
      head: {
        rotation: [(0.22 - 0.025 * breathWave) * holdEnv, 0, 0.08 * holdEnv],
        offset: [0, -0.016 * holdEnv, 0]
      },
      wingL: {
        rotation: [-0.32 * holdEnv, 0.28 * holdEnv, 0.18 * holdEnv],
        offset: [0.015 * holdEnv, -0.008 * holdEnv, 0.012 * holdEnv]
      },
      wingR: {
        rotation: [-0.32 * holdEnv, -0.28 * holdEnv, -0.18 * holdEnv],
        offset: [-0.015 * holdEnv, -0.008 * holdEnv, 0.012 * holdEnv]
      },
      ...(canonicalId === "peeko" ? { tuft: { rotation: [0.26 * holdEnv, 0, 0.06 * holdEnv] } } : {}),
      eyelidL: lidClosed,
      eyelidR: lidClosed
    };
  }

  if (QUADRUPED_ACTORS.has(canonicalId)) {
    return {
      body: {
        offset: [0, (-0.042 + 0.007 * breathWave) * holdEnv, 0],
        rotation: [0.06 * holdEnv, 0, 0],
        scale: [
          1 + 0.015 * breathWave * holdEnv,
          1 + 0.02 * breathWave * holdEnv,
          1 + 0.015 * breathWave * holdEnv
        ]
      },
      head: {
        rotation: [(0.24 - 0.025 * breathWave) * holdEnv, 0, 0.08 * holdEnv],
        offset: [0, -0.022 * holdEnv, 0.01 * holdEnv]
      },
      legFL: { rotation: [-0.46 * holdEnv, 0, 0.05 * holdEnv], offset: [0, -0.028 * holdEnv, 0.022 * holdEnv] },
      legFR: { rotation: [-0.46 * holdEnv, 0, -0.05 * holdEnv], offset: [0, -0.028 * holdEnv, 0.022 * holdEnv] },
      legBL: { rotation: [0.44 * holdEnv, 0, 0.05 * holdEnv], offset: [0, -0.026 * holdEnv, -0.02 * holdEnv] },
      legBR: { rotation: [0.44 * holdEnv, 0, -0.05 * holdEnv], offset: [0, -0.026 * holdEnv, -0.02 * holdEnv] },
      earL: { rotation: [0.36 * holdEnv, 0.16 * holdEnv, 0.12 * holdEnv] },
      earR: { rotation: [0.36 * holdEnv, -0.16 * holdEnv, -0.12 * holdEnv] },
      tail: { rotation: [0.32 * holdEnv, 0.28 * holdEnv, 0.12 * holdEnv] },
      eyelidL: lidClosed,
      eyelidR: lidClosed
    };
  }

  if (canonicalId === "lumi") {
    const petalScale = lerp(1, 0.92, holdEnv) + 0.016 * breathWave * holdEnv;
    return {
      body: {
        offset: [0, (-0.05 + 0.01 * breathWave) * holdEnv, 0],
        rotation: [0.08 * holdEnv, 0, 0.08 * holdEnv],
        scale: [
          1 + 0.016 * breathWave * holdEnv,
          1 + 0.018 * breathWave * holdEnv,
          1 + 0.016 * breathWave * holdEnv
        ]
      },
      petals: {
        scale: [petalScale, petalScale, 1],
        rotation: [0, 0, 0.04 * holdEnv]
      },
      cheekPuff: {
        scale: [
          1 + (0.06 + 0.015 * breathWave) * holdEnv,
          1 + 0.05 * holdEnv,
          1 + 0.06 * holdEnv
        ]
      },
      eyelidL: lidClosed,
      eyelidR: lidClosed
    };
  }

  if (canonicalId === "gogo") {
    return {
      body: {
        offset: [0, (-0.025 + 0.005 * breathWave) * holdEnv, 0],
        rotation: [0.04 * holdEnv, 0, 0],
        scale: [
          1 + 0.01 * breathWave * holdEnv,
          1 + 0.014 * breathWave * holdEnv,
          1 + 0.01 * breathWave * holdEnv
        ]
      },
      chimney: {
        offset: [0, (-0.012 + 0.006 * breathWave) * holdEnv, 0],
        scale: [
          1 + (0.03 + 0.024 * breathWave) * holdEnv,
          lerp(1, 0.93, holdEnv) - 0.02 * breathWave * holdEnv,
          1 + (0.03 + 0.024 * breathWave) * holdEnv
        ]
      },
      eyelidL: lidClosed,
      eyelidR: lidClosed
    };
  }

  if (BEDTIME_FACE_PROPS.has(canonicalId)) {
    const softCrescentLid: ArticulatedPartPose = {
      offset: [0, -0.008 * holdEnv, 0.002 * holdEnv],
      scale: [1, lerp(1, 0.72, holdEnv), 1]
    };
    return {
      body: {
        offset: [0, (-0.03 + 0.01 * breathWave) * holdEnv, 0],
        rotation: [0, 0, 0.06 * holdEnv],
        scale: [
          1 + 0.016 * breathWave * holdEnv,
          1 + 0.02 * breathWave * holdEnv,
          1 + 0.016 * breathWave * holdEnv
        ]
      },
      cheekPuff: {
        scale: [
          1 + (0.06 + 0.018 * breathWave) * holdEnv,
          1 + (0.05 + 0.015 * breathWave) * holdEnv,
          1 + 0.06 * holdEnv
        ]
      },
      eyelidL: softCrescentLid,
      eyelidR: softCrescentLid
    };
  }

  return {
    body: {
      offset: [0, (-0.034 + 0.006 * breathWave) * holdEnv, 0],
      rotation: [0.09 * holdEnv, 0, 0],
      scale: [
        1 + 0.014 * breathWave * holdEnv,
        1 + 0.02 * breathWave * holdEnv,
        1 + 0.014 * breathWave * holdEnv
      ]
    },
    head: { rotation: [(0.2 - 0.024 * breathWave) * holdEnv, 0, 0.1 * holdEnv] },
    armL: {
      rotation: [-0.58 * holdEnv, 0.34 * holdEnv, -0.14 * holdEnv],
      offset: [0.018 * holdEnv, 0.01 * holdEnv, 0.024 * holdEnv]
    },
    armR: {
      rotation: [-0.58 * holdEnv, -0.34 * holdEnv, 0.14 * holdEnv],
      offset: [-0.018 * holdEnv, 0.01 * holdEnv, 0.024 * holdEnv]
    },
    ...(canonicalId === "lulu" ? { tail: { rotation: [0.14 * holdEnv, 0.24 * holdEnv, 0.08 * holdEnv] } } : {}),
    ...(canonicalId === "teddy"
      ? {
          earL: { rotation: [0.12 * holdEnv, 0, 0.08 * holdEnv] },
          earR: { rotation: [0.12 * holdEnv, 0, -0.08 * holdEnv] }
        }
      : {}),
    eyelidL: lidClosed,
    eyelidR: lidClosed
  };
}

function yawnSubPartsForArchetype(
  canonicalId: string,
  u: number,
  env: number,
  k: number
): ArticulatedPoseMap {
  const yawnOpen = Math.sin(Math.PI * u) * env;
  const lidDroop: ArticulatedPartPose = {
    offset: [0, -0.012 * yawnOpen, 0.003 * yawnOpen],
    scale: [1, lerp(1, 0.16, yawnOpen), 1]
  };

  if (BIRD_ACTORS.has(canonicalId)) {
    return {
      beakLower: { rotation: [0.46 * yawnOpen, 0, 0], offset: [0, -0.012 * yawnOpen, 0] },
      wingL: { rotation: [-0.18 * yawnOpen, 0, -0.34 * yawnOpen * k] },
      wingR: { rotation: [-0.18 * yawnOpen, 0, 0.34 * yawnOpen * k] },
      head: { rotation: [-0.14 * yawnOpen * k, 0, 0.06 * yawnOpen * k] },
      ...(canonicalId === "peeko" ? { tuft: { rotation: [-0.16 * yawnOpen * k, 0, 0] } } : {}),
      body: { scale: [1 - 0.015 * yawnOpen, 1 + 0.042 * yawnOpen, 1 - 0.015 * yawnOpen] },
      eyelidL: lidDroop,
      eyelidR: lidDroop
    };
  }

  if (QUADRUPED_ACTORS.has(canonicalId)) {
    return {
      jaw: { rotation: [0.48 * yawnOpen, 0, 0], offset: [0, -0.024 * yawnOpen, 0] },
      head: { rotation: [-0.14 * yawnOpen * k, 0, 0.06 * yawnOpen * k] },
      earL: { rotation: [0.22 * yawnOpen, 0, -0.14 * yawnOpen] },
      earR: { rotation: [0.22 * yawnOpen, 0, 0.14 * yawnOpen] },
      tail: { rotation: [0.2 * yawnOpen, 0.16 * yawnOpen * k, 0] },
      body: {
        rotation: [-0.07 * yawnOpen * k, 0, 0],
        scale: [1 + 0.012 * yawnOpen, 1 + 0.036 * yawnOpen, 1 + 0.02 * yawnOpen]
      },
      eyelidL: lidDroop,
      eyelidR: lidDroop
    };
  }

  if (canonicalId === "lumi") {
    return {
      jaw: { rotation: [0.38 * yawnOpen, 0, 0], offset: [0, -0.022 * yawnOpen, 0] },
      petals: { scale: [1 + 0.045 * yawnOpen, 1 + 0.055 * yawnOpen, 1] },
      cheekPuff: { scale: [1 + 0.1 * yawnOpen, 1 + 0.08 * yawnOpen, 1 + 0.1 * yawnOpen] },
      body: { scale: [1 + 0.02 * yawnOpen, 1 + 0.04 * yawnOpen, 1 + 0.02 * yawnOpen] },
      eyelidL: lidDroop,
      eyelidR: lidDroop
    };
  }

  if (canonicalId === "gogo") {
    return {
      jaw: { rotation: [0.34 * yawnOpen, 0, 0], offset: [0, -0.024 * yawnOpen, 0] },
      chimney: {
        scale: [1 - 0.05 * yawnOpen, 1 + 0.09 * yawnOpen, 1 - 0.05 * yawnOpen],
        offset: [0, 0.014 * yawnOpen, 0]
      },
      body: { scale: [1 + 0.012 * yawnOpen, 1 + 0.028 * yawnOpen, 1 + 0.012 * yawnOpen] },
      eyelidL: lidDroop,
      eyelidR: lidDroop
    };
  }

  if (BEDTIME_FACE_PROPS.has(canonicalId)) {
    const softDroop: ArticulatedPartPose = {
      offset: [0, -0.008 * yawnOpen, 0.002 * yawnOpen],
      scale: [1, lerp(1, 0.76, yawnOpen), 1]
    };
    return {
      body: {
        rotation: [-0.05 * yawnOpen * k, 0, 0.04 * yawnOpen * k],
        scale: [1 + 0.02 * yawnOpen, 1 + 0.04 * yawnOpen, 1 + 0.02 * yawnOpen]
      },
      cheekPuff: { scale: [1 + 0.1 * yawnOpen, 1 + 0.08 * yawnOpen, 1 + 0.1 * yawnOpen] },
      eyelidL: softDroop,
      eyelidR: softDroop
    };
  }

  return {
    jaw: { rotation: [0.46 * yawnOpen, 0, 0], offset: [0, -0.024 * yawnOpen, 0.004 * yawnOpen] },
    cheekPuff: { scale: [1 + 0.1 * yawnOpen, 1 + 0.08 * yawnOpen, 1 + 0.1 * yawnOpen] },
    armL: {
      rotation: [-1.12 * yawnOpen * k, -0.16 * yawnOpen, -0.38 * yawnOpen * k],
      offset: [0, 0.035 * yawnOpen, 0]
    },
    armR: {
      rotation: [-1.12 * yawnOpen * k, 0.16 * yawnOpen, 0.38 * yawnOpen * k],
      offset: [0, 0.035 * yawnOpen, 0]
    },
    head: { rotation: [-0.14 * yawnOpen * k, 0, 0.07 * yawnOpen * k] },
    body: { scale: [1 + 0.015 * yawnOpen, 1 + 0.042 * yawnOpen, 1 + 0.015 * yawnOpen] },
    eyelidL: lidDroop,
    eyelidR: lidDroop
  };
}

function rockSubPartsForArchetype(
  canonicalId: string,
  elapsedSec: number,
  env: number,
  reducedMotion: boolean
): ArticulatedPoseMap {
  const damp = reducedMotion ? 0.45 : 1;
  const rockWave = Math.sin(TAU * CRADLE_ROCK_HZ * elapsedSec) * env * damp;

  if (canonicalId === "cradle") {
    return {
      body: {
        rotation: [0, 0, 0.095 * rockWave],
        offset: [0.018 * rockWave, 0, 0]
      }
    };
  }

  if (BIRD_ACTORS.has(canonicalId)) {
    return {
      body: { rotation: [0, 0, 0.065 * rockWave] },
      head: { rotation: [0.04 * env, 0, 0.07 * rockWave] },
      wingL: { rotation: [-0.14 * env, 0.12 * env, 0.08 * env] },
      wingR: { rotation: [-0.14 * env, -0.12 * env, -0.08 * env] }
    };
  }

  if (QUADRUPED_ACTORS.has(canonicalId)) {
    return {
      body: { rotation: [0, 0, 0.06 * rockWave] },
      head: { rotation: [0.05 * env, 0, 0.075 * rockWave] },
      tail: { rotation: [0.16 * env, 0.14 * rockWave, 0] }
    };
  }

  return {
    body: { rotation: [0, 0, 0.06 * rockWave] },
    head: { rotation: [0.05 * env, 0, 0.08 * rockWave] }
  };
}

function twinkleSubPartsForArchetype(
  canonicalId: string,
  u: number,
  env: number,
  reducedMotion: boolean
): ArticulatedPoseMap {
  const k = reducedMotion ? 0.45 : 1;
  const wave = Math.sin(TAU * u);
  const shimmer = (0.5 + 0.5 * Math.sin(TAU * 2 * u - Math.PI * 0.5)) * env * k;

  if (canonicalId === "cribMobile" || canonicalId === "musicBox") {
    return {
      petals: {
        rotation: [0, reducedMotion ? 0 : TAU * u * 0.5, 0],
        scale: [1 + 0.04 * shimmer, 1 + 0.04 * shimmer, 1 + 0.04 * shimmer]
      },
      ...(canonicalId === "musicBox" ? { lid: { rotation: [-0.1 * env * k, 0, 0] } } : {})
    };
  }

  if (canonicalId === "lumi" || canonicalId === "flower" || canonicalId === "flowerBud") {
    return {
      petals: {
        rotation: [0, 0, reducedMotion ? 0 : 0.18 * wave * env],
        scale: [1 + 0.055 * shimmer, 1 + 0.055 * shimmer, 1]
      },
      body: {
        scale: [1 + 0.03 * shimmer, 1 + 0.03 * shimmer, 1 + 0.03 * shimmer]
      },
      ...(canonicalId === "lumi"
        ? { cheekPuff: { scale: [1 + 0.08 * shimmer, 1 + 0.06 * shimmer, 1 + 0.08 * shimmer] } }
        : {})
    };
  }

  if (canonicalId === "moon" || canonicalId === "nightlight" || canonicalId === "sleepyCloud") {
    return {
      body: {
        rotation: [0, 0, reducedMotion ? 0 : 0.05 * wave * env],
        scale: [1 + 0.032 * shimmer, 1 + 0.032 * shimmer, 1 + 0.032 * shimmer]
      }
    };
  }

  if (BIRD_ACTORS.has(canonicalId)) {
    return {
      wingL: { rotation: [-0.15 * env, 0, (-0.24 - 0.14 * shimmer) * env] },
      wingR: { rotation: [-0.15 * env, 0, (0.24 + 0.14 * shimmer) * env] },
      head: { rotation: [-0.1 * env * k, 0.07 * wave * env * k, 0.06 * wave * env * k] }
    };
  }

  return {
    armL: { rotation: [-1.24 * env, -0.18 * env, (-0.32 - 0.12 * wave * k) * env] },
    armR: { rotation: [-1.24 * env, 0.18 * env, (0.32 - 0.12 * wave * k) * env] },
    head: { rotation: [-0.1 * env * k, 0.07 * wave * env * k, 0.06 * wave * env * k] }
  };
}

function bipedPeekabooHideParts(holdEnv: number): ArticulatedPoseMap {
  return {
    body: {
      offset: [0, -0.048 * holdEnv, 0.015 * holdEnv],
      rotation: [0.14 * holdEnv, 0, 0]
    },
    footL: { rotation: [-0.08 * holdEnv, 0, 0] },
    footR: { rotation: [-0.08 * holdEnv, 0, 0] },
    // Raise both hands cleanly over the eyes in a classic toddler peekaboo pose (zero head/eye squish!).
    armL: {
      rotation: [-2.12 * holdEnv, 0.56 * holdEnv, -0.34 * holdEnv],
      offset: [0.02 * holdEnv, 0.045 * holdEnv, 0.055 * holdEnv]
    },
    armR: {
      rotation: [-2.12 * holdEnv, -0.56 * holdEnv, 0.34 * holdEnv],
      offset: [-0.02 * holdEnv, 0.045 * holdEnv, 0.055 * holdEnv]
    },
    head: { rotation: [0.1 * holdEnv, 0, 0] },
    eyelidL: { scale: [1, lerp(1, 0.12, holdEnv), 1], offset: [0, -0.012 * holdEnv, 0.004 * holdEnv] },
    eyelidR: { scale: [1, lerp(1, 0.12, holdEnv), 1], offset: [0, -0.012 * holdEnv, 0.004 * holdEnv] }
  };
}

function bipedPeekParts(env: number, k: number): ArticulatedPoseMap {
  return {
    armL: {
      rotation: [-1.45 * env, -0.38 * env, -0.58 * env],
      offset: [-0.02 * env, 0.04 * env, 0.03 * env]
    },
    armR: {
      rotation: [-1.45 * env, 0.38 * env, 0.58 * env],
      offset: [0.02 * env, 0.04 * env, 0.03 * env]
    },
    head: { rotation: [-0.08 * env, 0.1 * env * k, -0.1 * env * k] },
    jaw: { rotation: [0.36 * env, 0, 0], offset: [0, -0.022 * env, 0] },
    cheekPuff: { scale: [1 + 0.1 * env, 1 + 0.08 * env, 1 + 0.1 * env] }
  };
}

function bipedEatParts(u: number, env: number, k: number): ArticulatedPoseMap {
  const bite = 0.5 * (1 - Math.cos(TAU * 3 * u)) * env;
  return {
    armL: {
      rotation: [-0.95 * env - 0.72 * bite, 0.62 * bite, -0.26 * bite],
      offset: [0.02 * bite, 0.035 * bite, 0.045 * bite]
    },
    armR: {
      rotation: [-0.95 * env - 0.72 * bite, -0.62 * bite, 0.26 * bite],
      offset: [-0.02 * bite, 0.035 * bite, 0.045 * bite]
    },
    jaw: {
      rotation: [0.42 * bite, 0, 0],
      offset: [0, -0.024 * bite, 0]
    },
    cheekPuff: {
      scale: [1 + 0.14 * bite, 1 + 0.11 * bite, 1 + 0.14 * bite]
    },
    head: {
      rotation: [0.1 * bite * k, 0, 0.04 * Math.sin(TAU * 3 * u) * env * k]
    }
  };
}

export function propActionSubParts(
  actorId: string,
  action: ActiveCharacterPropAction | null | undefined,
  weight: number,
  timeSec: number,
  reducedMotion: boolean
): ArticulatedPoseMap | undefined {
  if (!action) return undefined;
  const w = clamp01(weight);
  if (w <= 1e-3) return undefined;
  const k = reducedMotion ? 0.45 : 1;

  switch (action) {
    case "brushTeeth": {
      const scrub = Math.sin(TAU * 4.4 * timeSec) * k;
      const upDown = Math.cos(TAU * 2.2 * timeSec) * k;
      return {
        // Right hand holds the toothbrush right at the open mouth and scrubs side-to-side across the teeth!
        armR: {
          rotation: [-1.68 * w + 0.06 * upDown * w, (-0.72 + 0.26 * scrub) * w, 0.34 * w],
          offset: [(-0.025 + 0.032 * scrub) * w, 0.038 * w, 0.048 * w]
        },
        armL: {
          rotation: [-0.45 * w, 0.15 * w, -0.18 * w]
        },
        jaw: {
          rotation: [0.34 * w, 0, 0],
          offset: [0, -0.022 * w, 0]
        },
        cheekPuff: {
          scale: [1 + 0.09 * w, 1 + 0.07 * w, 1 + 0.09 * w]
        },
        head: {
          rotation: [-0.05 * w, -0.06 * scrub * w, 0.05 * scrub * w]
        }
      };
    }
    case "washHands": {
      const rub = Math.sin(TAU * 3.8 * timeSec) * k;
      const lather = Math.cos(TAU * 3.8 * timeSec) * k;
      return {
        body: {
          rotation: [0.14 * w, 0, 0],
          offset: [0, -0.02 * w, 0.03 * w]
        },
        armL: {
          rotation: [(-1.34 + 0.16 * rub) * w, (0.58 + 0.12 * lather) * w, -0.22 * w],
          offset: [0.025 * w, 0.02 * w, 0.055 * w]
        },
        armR: {
          rotation: [(-1.34 - 0.16 * rub) * w, (-0.58 + 0.12 * lather) * w, 0.22 * w],
          offset: [-0.025 * w, 0.02 * w, 0.055 * w]
        },
        head: {
          rotation: [0.18 * w, 0.05 * rub * w, 0]
        },
        jaw: {
          rotation: [0.16 * w, 0, 0],
          offset: [0, -0.01 * w, 0]
        }
      };
    }
    case "dryHands": {
      const rub = Math.sin(TAU * 3.4 * timeSec) * k;
      return {
        armL: {
          rotation: [(-1.22 + 0.18 * rub) * w, 0.54 * w, -0.2 * w],
          offset: [0.025 * w, 0.02 * w, 0.045 * w]
        },
        armR: {
          rotation: [(-1.22 - 0.18 * rub) * w, -0.54 * w, 0.2 * w],
          offset: [-0.025 * w, 0.02 * w, 0.045 * w]
        },
        head: {
          rotation: [0.12 * w, 0, 0.06 * rub * w]
        }
      };
    }
    case "scrubTarget":
    case "dryTarget": {
      const sweepX = Math.sin(TAU * 3.2 * timeSec) * k;
      const sweepY = Math.cos(TAU * 3.2 * timeSec) * k;
      return {
        body: {
          rotation: [0.22 * w, 0.08 * sweepX * w, 0],
          offset: [0.03 * sweepX * w, -0.025 * w, 0.26 * w]
        },
        footL: {
          offset: [0.015 * sweepX * w, 0, 0.23 * w]
        },
        footR: {
          offset: [0.015 * sweepX * w, 0, 0.25 * w]
        },
        armL: {
          rotation: [(-1.46 + 0.22 * sweepY) * w, (0.38 + 0.24 * sweepX) * w, -0.16 * w],
          offset: [0.025 * w, 0.03 * w, 0.1 * w]
        },
        armR: {
          rotation: [(-1.46 - 0.18 * sweepY) * w, (-0.38 + 0.24 * sweepX) * w, 0.16 * w],
          offset: [-0.025 * w, 0.03 * w, 0.1 * w]
        },
        head: {
          rotation: [0.08 * w, 0.08 * sweepX * w, 0.05 * sweepX * w]
        },
        jaw: {
          rotation: [0.2 * w, 0, 0],
          offset: [0, -0.012 * w, 0]
        }
      };
    }
    case "blowBubble": {
      const puff = (0.75 + 0.25 * Math.sin(TAU * 2.2 * timeSec)) * w;
      return {
        armR: {
          rotation: [-1.62 * w, -0.68 * w, 0.3 * w],
          offset: [-0.02 * w, 0.035 * w, 0.045 * w]
        },
        jaw: {
          rotation: [0.24 * puff, 0, 0],
          offset: [0, -0.014 * puff, 0]
        },
        cheekPuff: {
          scale: [1 + 0.22 * puff, 1 + 0.18 * puff, 1 + 0.22 * puff]
        },
        head: {
          rotation: [-0.06 * w, 0, 0]
        }
      };
    }
    case "playDrum":
    case "playPiano": {
      const strike = Math.sin(TAU * 4.2 * timeSec) * k;
      if (BIRD_ACTORS.has(actorId)) {
        return {
          wingL: { rotation: [0.2, 0, -0.55 * Math.max(0, strike) * w] },
          wingR: { rotation: [0.2, 0, 0.55 * Math.max(0, -strike) * w] },
          beakLower: { rotation: [0.28 * Math.abs(strike) * w, 0, 0] }
        };
      }
      return {
        armL: { rotation: [(-1.18 + 0.38 * strike) * w, 0.34 * w, -0.14 * w] },
        armR: { rotation: [(-1.18 - 0.38 * strike) * w, -0.34 * w, 0.14 * w] },
        head: { rotation: [0.08 * Math.abs(strike) * w, 0, 0.06 * strike * w] },
        jaw: { rotation: [0.22 * Math.abs(strike) * w, 0, 0], offset: [0, -0.012 * Math.abs(strike) * w, 0] }
      };
    }
    case "playShaker": {
      const shake = Math.sin(TAU * 5.0 * timeSec) * k;
      return {
        armR: {
          rotation: [(-1.45 + 0.36 * shake) * w, -0.22 * w, (0.35 + 0.22 * shake) * w],
          offset: [0, 0.04 * w, 0.03 * w]
        },
        armL: {
          rotation: [(-0.75 - 0.2 * shake) * w, 0.2 * w, -0.2 * w]
        },
        head: { rotation: [0.06 * shake * w, 0, 0.08 * shake * w] },
        jaw: { rotation: [0.24 * w, 0, 0], offset: [0, -0.014 * w, 0] }
      };
    }
  }
}

function gestureSpecificSubParts(
  actorId: string,
  gesture: Gesture,
  elapsedSec: number,
  durationSec: number,
  loop: boolean,
  reducedMotion: boolean,
  timeSec = elapsedSec
): ArticulatedPoseMap | undefined {
  const dur = Math.max(0.1, durationSec);
  const u = loop ? frac(Math.max(0, elapsedSec) / dur) : clamp01(elapsedSec / dur);
  const env = loop ? 1 : envelope(u);
  const holdEnv = loop ? 1 : holdRamp01(u);
  const k = reducedMotion ? 0.5 : 1;
  const canonicalId = canonicalActorArchetypeId(actorId);

  if (gesture === "blink") {
    const blinkU = clamp01(elapsedSec / Math.max(0.14, dur));
    const s = Math.sin(Math.PI * blinkU);
    return eyelidPoseFromWeight(s * s);
  }

  // ---- Universal bedtime kinematics across all archetypes & nursery props (`sleep`, `yawn`, `rock`, `twinkle`)
  if (gesture === "sleep") {
    return sleepSubPartsForArchetype(actorId, canonicalId, holdEnv, timeSec, reducedMotion);
  }
  if (gesture === "yawn") {
    return yawnSubPartsForArchetype(canonicalId, u, env, k);
  }
  if (gesture === "rock") {
    return rockSubPartsForArchetype(canonicalId, elapsedSec, env, reducedMotion);
  }
  if (gesture === "twinkle") {
    return twinkleSubPartsForArchetype(canonicalId, u, env, reducedMotion);
  }

  // ---- Tiko: gentle little sea-green turtle (cosy shell tuck/peek, slow deliberate nod/point/count, flipper waves)
  if (canonicalId === "tiko") {
    switch (gesture) {
      case "hide":
        return {
          body: {
            offset: [0, -0.055 * holdEnv, 0],
            rotation: [0.08 * holdEnv, 0, 0]
          },
          head: {
            offset: [0, -0.036 * holdEnv, -0.044 * holdEnv],
            rotation: [0.22 * holdEnv, 0, 0]
          },
          armL: {
            rotation: [-0.84 * holdEnv, 0.54 * holdEnv, -0.26 * holdEnv],
            offset: [0.02 * holdEnv, -0.014 * holdEnv, -0.02 * holdEnv]
          },
          armR: {
            rotation: [-0.84 * holdEnv, -0.54 * holdEnv, 0.26 * holdEnv],
            offset: [-0.02 * holdEnv, -0.014 * holdEnv, -0.02 * holdEnv]
          },
          footL: {
            rotation: [-0.18 * holdEnv, 0, 0],
            offset: [0, 0.012 * holdEnv, -0.018 * holdEnv]
          },
          footR: {
            rotation: [-0.18 * holdEnv, 0, 0],
            offset: [0, 0.012 * holdEnv, -0.018 * holdEnv]
          },
          tail: {
            rotation: [0.24 * holdEnv, 0.18 * holdEnv, 0],
            offset: [0, 0, 0.016 * holdEnv]
          },
          eyelidL: { scale: [1, lerp(1, 0.12, holdEnv), 1], offset: [0, -0.012 * holdEnv, 0.004 * holdEnv] },
          eyelidR: { scale: [1, lerp(1, 0.12, holdEnv), 1], offset: [0, -0.012 * holdEnv, 0.004 * holdEnv] }
        };
      case "peek":
        return {
          head: {
            offset: [0, 0.018 * env, 0.036 * env],
            rotation: [-0.1 * env, 0.12 * env * k, -0.09 * env * k]
          },
          armL: {
            rotation: [-0.62 * env, -0.28 * env, -0.46 * env],
            offset: [-0.014 * env, 0.024 * env, 0.02 * env]
          },
          armR: {
            rotation: [-0.62 * env, 0.28 * env, 0.46 * env],
            offset: [0.014 * env, 0.024 * env, 0.02 * env]
          },
          jaw: { rotation: [0.32 * env, 0, 0], offset: [0, -0.018 * env, 0] },
          cheekPuff: { scale: [1 + 0.1 * env, 1 + 0.08 * env, 1 + 0.1 * env] },
          tail: { rotation: [0.1, 0.24 * Math.sin(TAU * 2 * u) * env * k, 0] }
        };
      case "nod": {
        const nodWave = 0.5 * (1 - Math.cos(TAU * u)) * env;
        return {
          head: {
            rotation: [0.24 * nodWave * k, 0, 0],
            offset: [0, -0.008 * nodWave, 0.012 * nodWave]
          },
          armL: { rotation: [-0.16 * nodWave, 0.08 * nodWave, -0.1] },
          armR: { rotation: [-0.16 * nodWave, -0.08 * nodWave, 0.1] },
          tail: { rotation: [0.06, 0.1 * Math.sin(TAU * u) * env * k, 0] }
        };
      }
      case "point":
        return {
          armR: {
            rotation: [-1.18 * env, -0.12 * env, 0.18 * env],
            offset: [0, 0.032 * env, 0.065 * env]
          },
          armL: {
            rotation: [-0.22 * env, 0.1 * env, -0.14 * env]
          },
          head: {
            rotation: [-0.05 * env, 0.1 * env, 0.05 * env * k],
            offset: [0, 0.008 * env, 0.014 * env]
          },
          tail: { rotation: [0.08 * env, -0.12 * env, 0] }
        };
      case "wave": {
        const flipperArc = Math.sin(TAU * 1.8 * u) * env * k;
        return {
          armR: {
            rotation: [-0.28 * env, 0.12 * flipperArc, 1.48 * env * (reducedMotion ? 0.75 : 1) + 0.26 * flipperArc],
            offset: [0.02 * env, 0.055 * env, 0.025 * env]
          },
          head: { rotation: [-0.04 * env, 0.06 * flipperArc, 0.1 * env * k] },
          jaw: { rotation: [0.2 * env, 0, 0], offset: [0, -0.011 * env, 0] },
          tail: { rotation: [0.08, 0.2 * flipperArc, 0] }
        };
      }
      case "wait":
        return {
          head: { rotation: [0.07 * holdEnv * k, 0, 0.06 * holdEnv * k], offset: [0, 0, 0.015 * holdEnv] },
          armL: { rotation: [-0.2 * holdEnv, 0.14 * holdEnv, -0.08] },
          armR: { rotation: [-0.2 * holdEnv, -0.14 * holdEnv, 0.08] },
          tail: { rotation: [0.06 * holdEnv, 0, 0] }
        };
      default:
        break;
    }
  }

  // ---- Universal non-squished "hide", "peek", and "eat" across biped characters & companions
  if (BIPED_ACTORS.has(canonicalId)) {
    if (gesture === "hide") return bipedPeekabooHideParts(holdEnv);
    if (gesture === "peek") return bipedPeekParts(env, k);
    if (gesture === "eat") return bipedEatParts(u, env, k);
  }

  // ---- Momo: warm host (wave armR +1.9 rad, point armR + head lock, mirror silly faces, happy/cheer/surprise)
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
          },
          jaw: {
            rotation: [0.22 * waveEnvelope, 0, 0],
            offset: [0, -0.012 * waveEnvelope, 0]
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
          armL: { rotation: [-1.05 * env, 0.38 * env, -0.18 * env], offset: [0.02 * env, -0.02 * env, 0.04 * env] },
          armR: { rotation: [-1.05 * env, -0.38 * env, 0.18 * env], offset: [-0.02 * env, -0.02 * env, 0.04 * env] },
          body: { rotation: [0.18 * env, 0, 0], offset: [0, -0.04 * env, 0.02 * env] },
          head: { rotation: [0.16 * env * k, 0, 0] }
        };
      case "clap": {
        const beat = 0.5 * (1 - Math.cos(TAU * 3 * u)) * env;
        return {
          armL: { rotation: [-1.18 * env, 0.62 * beat, -0.24 * beat], offset: [0.03 * beat, 0.02 * beat, 0.05 * beat] },
          armR: { rotation: [-1.18 * env, -0.62 * beat, 0.24 * beat], offset: [-0.03 * beat, 0.02 * beat, 0.05 * beat] },
          jaw: { rotation: [0.24 * beat, 0, 0], offset: [0, -0.014 * beat, 0] }
        };
      }
      case "mirror": {
        const faceWave = Math.abs(Math.sin(TAU * 2 * u)) * env;
        return {
          armL: { rotation: [-1.52 * env, 0.44 * env, -0.28 * env], offset: [0.01 * env, 0.03 * env, 0.04 * env] },
          armR: { rotation: [-1.52 * env, -0.44 * env, 0.28 * env], offset: [-0.01 * env, 0.03 * env, 0.04 * env] },
          jaw: { rotation: [0.42 * faceWave, 0, 0], offset: [0, -0.024 * faceWave, 0] },
          cheekPuff: { scale: [1 + 0.16 * faceWave, 1 + 0.12 * faceWave, 1 + 0.16 * faceWave] },
          head: { rotation: [-0.06 * faceWave, 0.14 * Math.sin(TAU * 2 * u) * env * k, 0.1 * Math.sin(TAU * 2 * u) * env * k] }
        };
      }
      case "shrug":
        return {
          armL: { rotation: [-0.35 * env, -0.2 * env, -0.65 * env], offset: [0, 0.04 * env, 0] },
          armR: { rotation: [-0.35 * env, 0.2 * env, 0.65 * env], offset: [0, 0.04 * env, 0] },
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
            rotation: [-1.18 * env, 0.64 * beat, -0.26 * beat],
            offset: [0.04 * beat, 0.03 * beat, 0.06 * beat]
          },
          armR: {
            rotation: [-1.18 * env, -0.64 * beat, 0.26 * beat],
            offset: [-0.04 * beat, 0.03 * beat, 0.06 * beat]
          },
          jaw: { rotation: [0.26 * beat, 0, 0], offset: [0, -0.015 * beat, 0] },
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

  // ---- Sheru & quadrupeds: floppy-eared puppy & farm friends
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
          jaw: gesture === "happy" || gesture === "cheer"
            ? { rotation: [0.3 * env, 0, 0], offset: [0, -0.016 * env, 0] }
            : undefined,
          head: { rotation: [-0.05 * env * k, 0.06 * Math.sin(TAU * 2 * u) * env * k, 0.08 * Math.sin(TAU * u) * env * k] }
        };
      }
      case "hide": {
        return {
          body: {
            rotation: [0.14 * holdEnv, 0, 0],
            offset: [0, -0.045 * holdEnv, 0]
          },
          legFL: { rotation: [-0.36 * holdEnv, 0, 0], offset: [0, -0.022 * holdEnv, 0.02 * holdEnv] },
          legFR: { rotation: [-0.36 * holdEnv, 0, 0], offset: [0, -0.022 * holdEnv, 0.02 * holdEnv] },
          legBL: { rotation: [-0.28 * holdEnv, 0, 0], offset: [0, -0.02 * holdEnv, 0] },
          legBR: { rotation: [-0.28 * holdEnv, 0, 0], offset: [0, -0.02 * holdEnv, 0] },
          head: { rotation: [0.2 * holdEnv, 0, 0], offset: [0, -0.022 * holdEnv, 0] },
          earL: { rotation: [0.42 * holdEnv, 0.22 * holdEnv, 0.12 * holdEnv] },
          earR: { rotation: [0.42 * holdEnv, -0.22 * holdEnv, -0.12 * holdEnv] },
          eyelidL: { scale: [1, lerp(1, 0.12, holdEnv), 1] },
          eyelidR: { scale: [1, lerp(1, 0.12, holdEnv), 1] }
        };
      }
      case "peek":
        return {
          head: { rotation: [-0.1 * env, 0.1 * env * k, -0.1 * env * k] },
          earL: { rotation: [-0.14 * env, 0, -0.2 * env] },
          earR: { rotation: [-0.14 * env, 0, 0.2 * env] },
          jaw: { rotation: [0.34 * env, 0, 0], offset: [0, -0.018 * env, 0] },
          tail: { rotation: [0.2, 0.36 * Math.sin(TAU * 4 * u) * env * k, 0] }
        };
      case "eat": {
        const bite = 0.5 * (1 - Math.cos(TAU * 3 * u)) * env;
        return {
          jaw: { rotation: [0.42 * bite, 0, 0], offset: [0, -0.022 * bite, 0] },
          head: { rotation: [0.24 * bite * k, 0, 0] },
          earL: { rotation: [0.18 * bite, 0, -0.1 * env] },
          earR: { rotation: [0.18 * bite, 0, 0.1 * env] },
          tail: { rotation: [0.2, 0.32 * Math.sin(TAU * 4 * elapsedSec) * env * k, 0] }
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
          jaw: { rotation: [0.42 * env, 0, 0], offset: [0, -0.022 * env, 0] },
          head: { rotation: [-0.14 * env * k, 0, 0] },
          earL: { rotation: [-0.12 * env, 0, -0.18 * env] },
          earR: { rotation: [-0.12 * env, 0, 0.18 * env] },
          tail: { rotation: [0.2, 0.35 * Math.sin(TAU * 5 * u) * env * k, 0] }
        };
      case "surprise":
        return {
          earL: { rotation: [-0.18 * env, 0, -0.26 * env], offset: [0, 0.02 * env, 0] },
          earR: { rotation: [-0.18 * env, 0, 0.26 * env], offset: [0, 0.02 * env, 0] },
          jaw: { rotation: [0.3 * env, 0, 0], offset: [0, -0.016 * env, 0] },
          head: { rotation: [-0.08 * env, 0, 0.14 * env * k] }
        };
      default:
        break;
    }
  }

  // ---- Peeko & birds: round peekaboo chick & feathered friends
  if (actorId === "peeko" || BIRD_ACTORS.has(actorId)) {
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
          ...(actorId === "peeko"
            ? {
                tuft: {
                  rotation: [-0.22 * tuftLag, 0, 0.1 * Math.sin(TAU * cycles * u) * env * k],
                  offset: [0, 0.035 * tuftLag, 0]
                }
              }
            : {}),
          beakLower: {
            rotation: [gesture === "cheer" || gesture === "happy" ? 0.34 * env : 0.22 * env, 0, 0],
            offset: [0, -0.01 * env, 0]
          }
        };
      }
      case "hide": {
        const tuck = holdEnv;
        return {
          body: { offset: [0, -0.042 * tuck, 0], rotation: [0.12 * tuck, 0, 0] },
          wingL: { rotation: [-0.95 * tuck, 0.52 * tuck, -0.22 * tuck], offset: [0.02 * tuck, 0.03 * tuck, 0.04 * tuck] },
          wingR: { rotation: [-0.95 * tuck, -0.52 * tuck, 0.22 * tuck], offset: [-0.02 * tuck, 0.03 * tuck, 0.04 * tuck] },
          head: { rotation: [0.2 * tuck, 0, 0], offset: [0, -0.022 * tuck, 0] },
          ...(actorId === "peeko" ? { tuft: { rotation: [0.3 * tuck, 0, 0] } } : {}),
          eyelidL: { scale: [1, lerp(1, 0.12, tuck), 1] },
          eyelidR: { scale: [1, lerp(1, 0.12, tuck), 1] }
        };
      }
      case "peek": {
        return {
          wingL: { rotation: [0, 0, -0.38 * env] },
          wingR: { rotation: [0, 0, 0.38 * env] },
          ...(actorId === "peeko"
            ? { tuft: { rotation: [-0.2 * env, 0, -0.14 * env], offset: [0, 0.03 * env, 0] } }
            : {}),
          beakLower: { rotation: [0.38 * env, 0, 0], offset: [0, -0.01 * env, 0] },
          head: { rotation: [-0.08 * env, 0.14 * env * k, -0.12 * env * k] }
        };
      }
      case "eat": {
        const bite = 0.5 * (1 - Math.cos(TAU * 3 * u)) * env;
        return {
          beakLower: { rotation: [0.42 * bite, 0, 0], offset: [0, -0.012 * bite, 0] },
          head: { rotation: [0.22 * bite * k, 0, 0] },
          wingL: { rotation: [0, 0, -0.2 * bite] },
          wingR: { rotation: [0, 0, 0.2 * bite] }
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
          petals: { scale: [swell * 1.02, swell * 1.02, 1] },
          jaw: { rotation: [0.22 * env, 0, 0], offset: [0, -0.015 * env, 0] }
        };
      }
      case "hide": {
        return {
          body: { offset: [0, -0.1 * holdEnv, 0], rotation: [0.18 * holdEnv, 0, 0] },
          petals: { scale: [lerp(1, 0.92, holdEnv), lerp(1, 0.92, holdEnv), 1] },
          eyelidL: { scale: [1, lerp(1, 0.12, holdEnv), 1] },
          eyelidR: { scale: [1, lerp(1, 0.12, holdEnv), 1] }
        };
      }
      case "peek":
        return {
          petals: { scale: [1 + 0.06 * env, 1 + 0.06 * env, 1] },
          jaw: { rotation: [0.34 * env, 0, 0], offset: [0, -0.022 * env, 0] },
          cheekPuff: { scale: [1 + 0.12 * env, 1 + 0.12 * env, 1 + 0.12 * env] }
        };
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
          },
          jaw: {
            rotation: [0.26 * env, 0, 0],
            offset: [0, -0.022 * env, 0]
          }
        };
      }
      case "hide":
        return {
          eyelidL: { scale: [1, lerp(1, 0.12, holdEnv), 1] },
          eyelidR: { scale: [1, lerp(1, 0.12, holdEnv), 1] }
        };
      default:
        break;
    }
  }

  // ---- Farm quadrupeds (`cow`, `sheep`, `horse`) eat / bark / happy
  if (QUADRUPED_ACTORS.has(actorId)) {
    if (gesture === "eat") {
      const bite = 0.5 * (1 - Math.cos(TAU * 3 * u)) * env;
      return {
        jaw: { rotation: [0.4 * bite, 0, 0], offset: [0, -0.02 * bite, 0] },
        head: { rotation: [0.22 * bite * k, 0, 0] },
        tail: { rotation: [0.14, 0.26 * Math.sin(TAU * 3 * u) * env * k, 0] }
      };
    }
    if (gesture === "bark" || gesture === "happy" || gesture === "cheer") {
      return {
        jaw: { rotation: [0.36 * env, 0, 0], offset: [0, -0.018 * env, 0] },
        head: { rotation: [-0.1 * env * k, 0, 0] },
        tail: { rotation: [0.16, 0.28 * Math.sin(TAU * 3 * u) * env * k, 0] }
      };
    }
  }

  // Generic warm sub-part accents for any actor with head/arms/jaw (`momo`, `lulu`, `teddy`, `robot`, etc.).
  switch (gesture) {
    case "wave":
      return {
        armR: { rotation: [-0.25 * env, 0, 1.55 * env + 0.28 * Math.sin(TAU * 2 * u) * env * k] },
        head: { rotation: [0, 0, 0.1 * env * k] },
        jaw: { rotation: [0.2 * env, 0, 0], offset: [0, -0.012 * env, 0] }
      };
    case "clap": {
      const beat = 0.5 * (1 - Math.cos(TAU * 3 * u)) * env;
      return {
        armL: { rotation: [-1.18 * env, 0.6 * beat, -0.24 * beat], offset: [0.03 * beat, 0.02 * beat, 0.04 * beat] },
        armR: { rotation: [-1.18 * env, -0.6 * beat, 0.24 * beat], offset: [-0.03 * beat, 0.02 * beat, 0.04 * beat] },
        jaw: { rotation: [0.24 * beat, 0, 0], offset: [0, -0.014 * beat, 0] }
      };
    }
    case "stomp": {
      const stepOsc = Math.sin(TAU * 2 * u) * env;
      const leftLift = Math.max(0, stepOsc) * 0.12 * (reducedMotion ? 0.6 : 1);
      const rightLift = Math.max(0, -stepOsc) * 0.12 * (reducedMotion ? 0.6 : 1);
      return {
        footL: { offset: [0, leftLift, 0.02 * (leftLift / 0.12)], rotation: [-0.24 * (leftLift / 0.12), 0, 0] },
        footR: { offset: [0, rightLift, 0.02 * (rightLift / 0.12)], rotation: [-0.24 * (rightLift / 0.12), 0, 0] },
        armL: { rotation: [0.3 * stepOsc * k, 0, -0.15] },
        armR: { rotation: [-0.3 * stepOsc * k, 0, 0.15] }
      };
    }
    case "happy":
    case "cheer":
    case "wake":
      return {
        armL: { rotation: [-1.55 * env, -0.22 * env, -0.55 * env], offset: [0, 0.05 * env, 0] },
        armR: { rotation: [-1.55 * env, 0.22 * env, 0.55 * env], offset: [0, 0.05 * env, 0] },
        jaw: { rotation: [0.34 * env, 0, 0], offset: [0, -0.02 * env, 0] },
        cheekPuff: { scale: [1 + 0.12 * env, 1 + 0.1 * env, 1 + 0.12 * env] },
        head: { rotation: [-0.08 * env * k, 0, 0.06 * Math.sin(TAU * 2 * u) * env * k] }
      };
    case "surprise":
      return {
        armL: { rotation: [-1.35 * env, 0.42 * env, -0.28 * env], offset: [0.01 * env, 0.03 * env, 0.04 * env] },
        armR: { rotation: [-1.35 * env, -0.42 * env, 0.28 * env], offset: [-0.01 * env, 0.03 * env, 0.04 * env] },
        jaw: { rotation: [0.38 * env, 0, 0], offset: [0, -0.022 * env, 0] },
        head: { rotation: [-0.08 * env * k, 0, 0] }
      };
    case "talk": {
      const syl = 0.5 * (1 - Math.cos(TAU * 3 * u)) * env;
      return {
        jaw: { rotation: [0.38 * syl, 0, 0], offset: [0, -0.022 * syl, 0] },
        head: { rotation: [0.06 * syl * k, 0, 0.04 * Math.sin(TAU * u) * env * k] }
      };
    }
    case "dance":
    case "sway": {
      const groove = Math.sin(TAU * (gesture === "dance" ? 3 : 1) * u) * env * k;
      return {
        armL: { rotation: [-0.55 * env + 0.35 * groove, 0.15 * groove, -0.32 - 0.22 * groove] },
        armR: { rotation: [-0.55 * env - 0.35 * groove, 0.15 * groove, 0.32 - 0.22 * groove] },
        head: { rotation: [0.04 * Math.abs(groove), 0.08 * groove, 0.1 * groove] }
      };
    }
    case "nod":
      return {
        head: { rotation: [0.2 * 0.5 * (1 - Math.cos(TAU * 2 * u)) * k, 0, 0] }
      };
    case "look":
      return {
        head: { rotation: [0, 0.32 * Math.sin(TAU * u) * env * k, 0.05 * Math.sin(TAU * u) * env * k] }
      };
    default:
      return undefined;
  }
}

/**
 * Full articulated sub-part pose for an actor at the current instant:
 * natural eyelid blink + locomotion gait + gesture / held pose + active prop choreography / carry cradle + 20 Hz speech sync.
 */
export function sampleCharacterSubParts(input: CharacterSubPartSampleInput): ArticulatedPoseMap | undefined {
  const canonicalId = canonicalActorArchetypeId(input.id);
  const activeGesture: Gesture | null = input.gesture ?? (input.holding ? (input.holdGesture ?? null) : null);
  // Suppress periodic blink pulses while eyes are already closed in sleep/hide or on sculpted sleeping props.
  const suppressPeriodicBlink =
    activeGesture === "sleep" ||
    activeGesture === "hide" ||
    activeGesture === "yawn" ||
    BEDTIME_FACE_PROPS.has(canonicalId);
  const blink = suppressPeriodicBlink ? undefined : blinkPartsAt(input.id, input.timeSec, input.reducedMotion);
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
      input.reducedMotion,
      input.timeSec
    );
  } else if (input.holding && input.holdGesture) {
    gestureParts = gestureSpecificSubParts(
      input.id,
      input.holdGesture,
      1,
      1,
      false,
      input.reducedMotion,
      input.timeSec
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

  // Slow continuous nursery turntable / mobile rotation on `cribMobile` and `musicBox` when `!reducedMotion`.
  let ambientPropSpin: ArticulatedPoseMap | undefined;
  if (!input.reducedMotion && (canonicalId === "cribMobile" || canonicalId === "musicBox")) {
    const hz = canonicalId === "cribMobile" ? 0.08 : 0.16;
    ambientPropSpin = {
      petals: {
        rotation: [0, TAU * hz * input.timeSec + phaseOf(input.id) * TAU, 0]
      }
    };
  }

  const propParts = propActionSubParts(
    input.id,
    input.activeAction,
    input.activeActionWeight ?? (input.activeAction ? 1 : 0),
    input.timeSec,
    input.reducedMotion
  );

  const gestureDrivesArms =
    activeGesture === "hide" ||
    activeGesture === "peek" ||
    activeGesture === "eat" ||
    activeGesture === "clap" ||
    activeGesture === "wave" ||
    activeGesture === "mirror" ||
    activeGesture === "cheer" ||
    activeGesture === "happy" ||
    activeGesture === "sleep" ||
    activeGesture === "yawn" ||
    activeGesture === "twinkle";

  const carryParts: ArticulatedPoseMap | undefined =
    input.carrying && !propParts && !gestureDrivesArms && BIPED_ACTORS.has(canonicalId)
      ? {
          armL: { rotation: [-0.96, 0.34, -0.16], offset: [0.02, 0.02, 0.04] },
          armR: { rotation: [-0.96, -0.34, 0.16], offset: [-0.02, 0.02, 0.04] }
        }
      : undefined;

  const speech =
    input.speechViseme !== undefined && input.speechViseme !== null
      ? visemeSubParts(
          input.id,
          input.speechViseme,
          input.speechVisemeOpenness ?? 1,
          input.timeSec,
          input.reducedMotion
        )
      : speechSubParts(input.id, input.speechEnergy, input.timeSec, input.reducedMotion);

  return mergePartPoses(loco, ambientPropSpin, gestureParts, propParts, carryParts, speech, blink);
}

export type PartialCharacterSampleInput = Partial<Omit<CharacterSubPartSampleInput, "id" | "timeSec">> &
  Pick<CharacterSubPartSampleInput, "id" | "timeSec">;

export interface CharacterDirector {
  setTalking(actorId: string | null, energy?: number): void;
  setSpeechEnergy(energy: number | null): void;
  setSpeechViseme(viseme: VisemeCode | null, openness?: number | null): void;
  talking(): string | null;
  speechViseme(): VisemeCode | null;
  speechVisemeOpenness(): number | null;
  sample(input: PartialCharacterSampleInput): ArticulatedPoseMap | undefined;
}

/**
 * Stateful character speech/viseme sub-part director (`director.setSpeechViseme`) that drives
 * `sampleCharacterSubParts` with timed visemes when active and falls back cleanly to 20 Hz RMS speech energy.
 */
export function createCharacterDirector(): CharacterDirector {
  let activeSpeaker: string | null = null;
  let activeEnergy: number | null = null;
  let activeViseme: VisemeCode | null = null;
  let activeOpenness: number | null = null;

  return {
    setTalking(actorId, energy) {
      if (actorId === null || actorId !== activeSpeaker) {
        activeViseme = null;
        activeOpenness = null;
      }
      activeSpeaker = actorId;
      activeEnergy =
        actorId !== null && energy !== undefined && Number.isFinite(energy) ? clamp01(energy) : null;
    },
    setSpeechEnergy(energy) {
      if (activeSpeaker === null) {
        activeEnergy = null;
        return;
      }
      activeEnergy = energy !== null && Number.isFinite(energy) ? clamp01(energy) : null;
    },
    setSpeechViseme(viseme, openness) {
      activeViseme = viseme;
      activeOpenness =
        viseme !== null && openness !== undefined && openness !== null && Number.isFinite(openness)
          ? clamp01(openness)
          : null;
    },
    talking() {
      return activeSpeaker;
    },
    speechViseme() {
      return activeViseme;
    },
    speechVisemeOpenness() {
      return activeOpenness;
    },
    sample(input) {
      const isSpeaker = activeSpeaker === input.id;
      return sampleCharacterSubParts({
        gesture: null,
        gestureElapsedSec: 0,
        gestureDurationSec: 1,
        loop: false,
        holding: false,
        locomotion: null,
        reducedMotion: false,
        ...input,
        speechEnergy: isSpeaker && activeEnergy !== null ? activeEnergy : (input.speechEnergy ?? 0),
        speechViseme: isSpeaker ? activeViseme : null,
        speechVisemeOpenness: isSpeaker ? activeOpenness : null
      });
    }
  };
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
