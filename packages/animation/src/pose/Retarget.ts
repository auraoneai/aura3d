/**
 * T3.8 (PRD-06 §7.2) — offline clip retarget baking. `bakeRetargetedClips` turns
 * a source skeleton's compiled clips into `CompiledClip`s bound to the target
 * skeleton once at load: per baked keyframe the source clip is sampled into an
 * {@link AnimationPose}, `retargetHumanoidPose` (HumanoidRetargeting.ts)
 * re-anchors rest deltas + facing + per-bone length-ratio scale onto the target
 * rig, and the result is recompiled — runtime cost is then zero.
 *
 * `hipsScale: "leg-length"` (the default) derives the hips translation scale
 * from the lower-limb chain length ratio (|lowerLeg|+|foot|+|toes| offsets)
 * rather than the map's generic per-bone estimate; a number pins an explicit
 * factor; `undefined` keeps the map's own hips binding scale.
 *
 * `fingers: true` additionally carries any source bone whose name matches a
 * finger pattern onto a same-named target joint with the same rest-delta
 * reconciliation the humanoid path uses (scale 1 — finger lengths differ too
 * much to scale translations meaningfully).
 */

import type { AnimationPose, AnimationPoseTransform, AnimationQuaternion, AnimationVector3 } from "../AnimationController.js";
import { AnimationClip } from "../AnimationClip.js";
import { AnimationTrack } from "../AnimationTrack.js";
import {
  HUMANOID_BONES,
  createHumanoidRetargetingMap,
  retargetHumanoidPose,
  type HumanoidBoneName,
  type HumanoidRigDefinition,
  type HumanoidRetargetingMap,
  type HumanoidRetargetingOptions
} from "../HumanoidRetargeting.js";
import { inferHumanoidRig } from "../HumanoidBoneInference.js";
import { compileClip, createTrackCursors, sampleTrackInto, type CompiledClip } from "./CompiledClip.js";
import type { SkeletonBinding } from "./SkeletonBinding.js";

/** C-19 surface name for the prebuilt retargeting map. */
export type AuraHumanoidBoneMap = HumanoidRetargetingMap;

export interface BakeRetargetedClipsOptions {
  /** Prebuilt map; when absent the rigs are inferred from each skeleton's joint names. */
  readonly map?: AuraHumanoidBoneMap;
  /** Hips translation scale: "leg-length" chain ratio (default) or an explicit factor. */
  readonly hipsScale?: "leg-length" | number;
  /** Carry same-named finger bones through the rest-delta path. */
  readonly fingers?: boolean;
  /** HumanoidRetargeting options for an inferred map (minRequiredCoverage etc.). */
  readonly retarget?: HumanoidRetargetingOptions;
}

export interface RetargetSource {
  readonly skeleton: SkeletonBinding;
  readonly clips: readonly (CompiledClip & { readonly name?: string })[];
}

/** One detected limb flip: a >`thresholdDeg` single-frame joint swing on a baked rotation track. */
export interface LimbFlip {
  readonly track: string;
  readonly keyframeIndex: number;
  readonly degrees: number;
}

const FINGER_PATTERN = /(thumb|index|middle|ring|pinky|little|finger)/i;

function poseTransformAt(restPose: { readonly positions: Float32Array; readonly rotations: Float32Array; readonly scales: Float32Array }, joint: number): AnimationPoseTransform {
  return {
    position: { x: restPose.positions[joint * 3]!, y: restPose.positions[joint * 3 + 1]!, z: restPose.positions[joint * 3 + 2]! },
    rotation: { x: restPose.rotations[joint * 4]!, y: restPose.rotations[joint * 4 + 1]!, z: restPose.rotations[joint * 4 + 2]!, w: restPose.rotations[joint * 4 + 3]! },
    scale: { x: restPose.scales[joint * 3]!, y: restPose.scales[joint * 3 + 1]!, z: restPose.scales[joint * 3 + 2]! }
  };
}

/** Inferred humanoid rig with `restPose` filled from the skeleton binding. */
export function humanoidRigForSkeleton(skeleton: SkeletonBinding, id: string): HumanoidRigDefinition {
  return rigWithRestPose(inferHumanoidRig(skeleton.jointNames, { id }), skeleton);
}

/**
 * `restPose` for a rig whose bones were declared explicitly (non-inferable
 * skeletons — e.g. CesiumMan's `leg_joint_L_1` ordinals). Bone names resolve
 * through `jointIndicesByName`; unbound bones simply lack rest entries.
 */
export function rigWithRestPose(rig: HumanoidRigDefinition, skeleton: SkeletonBinding): HumanoidRigDefinition {
  const restPose: Partial<Record<HumanoidBoneName, AnimationPoseTransform>> = {};
  for (const bone of HUMANOID_BONES) {
    const binding = rig.bones[bone];
    if (!binding) continue;
    const indices = skeleton.jointIndicesByName.get(binding.name);
    if (!indices || indices.length === 0) continue;
    restPose[bone] = poseTransformAt(skeleton.restPose, indices[0]!);
  }
  return { ...rig, restPose };
}

function splitTarget(target: string): { readonly node: string; readonly path: string } | undefined {
  const dot = target.lastIndexOf(".");
  if (dot <= 0 || dot === target.length - 1) return undefined;
  const path = target.slice(dot + 1);
  if (path !== "translation" && path !== "rotation" && path !== "scale" && path !== "weights" && path !== "position" && path !== "quaternion") {
    return undefined;
  }
  return { node: target.slice(0, dot), path };
}

/** Sample a CompiledClip at `time` into an AnimationPose keyed by source node names. */
function sampleClipToPose(
  clip: CompiledClip,
  skeleton: SkeletonBinding,
  map: HumanoidRetargetingMap,
  cursors: Uint32Array,
  scratch: Float32Array,
  time: number
): AnimationPose {
  const bones: Record<string, { position?: AnimationVector3; rotation?: AnimationQuaternion; scale?: AnimationVector3 }> = {};
  const rest = skeleton.restPose;
  const jointIndex = new Map<string, number>();
  for (const [name, indices] of skeleton.jointIndicesByName) {
    if (indices.length > 0) jointIndex.set(name, indices[0]!);
  }
  for (let t = 0; t < clip.tracks.length; t += 1) {
    const track = clip.tracks[t]!;
    const split = splitTarget(track.target);
    if (!split || (track.valueType !== "vector3" && track.valueType !== "quaternion")) continue;
    const path = split.path === "position" ? "translation" : split.path === "quaternion" ? "rotation" : split.path;
    if (path !== "translation" && path !== "rotation" && path !== "scale") continue;
    sampleTrackInto(track, time, cursors, t, scratch, 0);
    const node = bones[split.node] ?? (bones[split.node] = {});
    if (path === "rotation") {
      node.rotation = { x: scratch[0]!, y: scratch[1]!, z: scratch[2]!, w: scratch[3]! };
    } else {
      const v = { x: scratch[0]!, y: scratch[1]!, z: scratch[2]! };
      if (path === "translation") node.position = v;
      else node.scale = v;
    }
  }
  // Rest-fill every humanoid-mapped bone so the retarget sees a complete pose.
  for (const binding of Object.values(map.bindings)) {
    const sourceName = binding.source.name;
    const joint = jointIndex.get(sourceName);
    const existing = bones[sourceName];
    const restTransform = joint !== undefined ? poseTransformAt(rest, joint) : {};
    bones[sourceName] = {
      position: existing?.position ?? restTransform.position,
      rotation: existing?.rotation ?? restTransform.rotation,
      scale: existing?.scale ?? restTransform.scale
    };
  }
  return { bones };
}

function sortedUnionTimes(clip: CompiledClip): number[] {
  const set = new Set<number>();
  for (const track of clip.tracks) {
    for (const t of track.times) set.add(Math.min(Math.round(t * 10000) / 10000, clip.duration));
  }
  set.add(0);
  set.add(clip.duration);
  return [...set].sort((a, b) => a - b);
}

/** Humanoid bone name → source node name, from the map bindings. */
function sourceNameFor(map: HumanoidRetargetingMap, bone: HumanoidBoneName): string | undefined {
  return map.bindings[bone]?.source.name;
}

/**
 * Resolve each binding's `source.name` to the node the CLIP actually animates:
 * name inference can pick a rest anchor (`root`) while the authored track
 * lives on an alias (`mixamorig:Hips`). Rewrites `source.name`,
 * `sourceRest`, and `sourceRestPosition` to the animated candidate's rest
 * transform; bindings whose name already has tracks (or that have none at
 * all — rest-only bones) pass through unchanged.
 */
function normalizeMapToClip(map: HumanoidRetargetingMap, sourceSkeleton: SkeletonBinding, clip: CompiledClip): HumanoidRetargetingMap {
  const clipNodes = new Set<string>();
  for (const track of clip.tracks) {
    const split = splitTarget(track.target);
    if (split) clipNodes.add(split.node);
  }
  let changed = false;
  const bindings: HumanoidRetargetingMap["bindings"] = { ...map.bindings };
  for (const bone of HUMANOID_BONES) {
    const binding = bindings[bone];
    if (!binding) continue;
    const candidates = [binding.source.name, ...(binding.source.aliases ?? [])];
    const animated = candidates.find((name) => clipNodes.has(name));
    if (animated === undefined || animated === binding.source.name) continue;
    const joint = sourceSkeleton.jointIndicesByName.get(animated)?.[0];
    const restTransform = joint !== undefined ? poseTransformAt(sourceSkeleton.restPose, joint) : undefined;
    bindings[bone] = {
      ...binding,
      source: { ...binding.source, name: animated },
      sourceRest: restTransform?.rotation ?? binding.sourceRest,
      sourceRestPosition: restTransform?.position ?? binding.sourceRestPosition
    };
    changed = true;
  }
  return changed ? { ...map, bindings } : map;
}

/** |local rest position| of `node` — a child offset equals its parent's segment length. */
function segmentLengthAt(skeleton: SkeletonBinding, nodeName: string | undefined): number {
  if (nodeName === undefined) return 0;
  const joint = skeleton.jointIndicesByName.get(nodeName)?.[0];
  if (joint === undefined) return 0;
  const p = skeleton.restPose.positions;
  return Math.hypot(p[joint * 3]!, p[joint * 3 + 1]!, p[joint * 3 + 2]!);
}

/** Lower-limb chain length via the map's resolved node names on `side` ("source"|"target"). */
function legChainLength(map: HumanoidRetargetingMap, skeleton: SkeletonBinding, side: "source" | "target"): number {
  const name = (bone: HumanoidBoneName) => map.bindings[bone]?.[side].name;
  const lower = name("leftLowerLeg") ?? name("rightLowerLeg");
  const foot = name("leftFoot") ?? name("rightFoot");
  const toes = name("leftToes") ?? name("rightToes");
  return segmentLengthAt(skeleton, lower) + segmentLengthAt(skeleton, foot) + segmentLengthAt(skeleton, toes);
}

function quatConj(q: AnimationQuaternion): AnimationQuaternion {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

function quatMul(a: AnimationQuaternion, b: AnimationQuaternion): AnimationQuaternion {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
  };
}

function quatNormalize(q: AnimationQuaternion): AnimationQuaternion {
  const len = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len };
}

/**
 * Bake `source.clips` onto `target` skeleton (PRD §7.2 signature).
 * Names: `name` on each input clip survives onto the baked clip when present.
 */
export function bakeRetargetedClips(
  source: RetargetSource,
  target: SkeletonBinding,
  options: BakeRetargetedClipsOptions = {}
): readonly CompiledClip[] {
  return source.clips.map((entry) => bakeRetargetedClip(entry, entry.name ?? "retargeted", source.skeleton, target, options).clip);
}

/** Named-map form used by `addClipsFrom` — clip names travel with the data. */
export function bakeRetargetedClipMap(
  source: { readonly skeleton: SkeletonBinding; readonly clips: ReadonlyMap<string, CompiledClip> },
  target: SkeletonBinding,
  options: BakeRetargetedClipsOptions = {}
): ReadonlyMap<string, CompiledClip> {
  const baked = new Map<string, CompiledClip>();
  for (const [name, clip] of source.clips) {
    baked.set(name, bakeRetargetedClip(clip, name, source.skeleton, target, options).clip);
  }
  return baked;
}

function bakeRetargetedClip(
  sourceClip: CompiledClip,
  name: string,
  sourceSkeleton: SkeletonBinding,
  targetSkeleton: SkeletonBinding,
  options: BakeRetargetedClipsOptions
): { readonly clip: CompiledClip; readonly name: string } {
  let map = options.map;
  if (map === undefined) {
    const sourceRig = humanoidRigForSkeleton(sourceSkeleton, `${name}:source`);
    const targetRig = humanoidRigForSkeleton(targetSkeleton, `${name}:target`);
    map = createHumanoidRetargetingMap(sourceRig, targetRig, options.retarget ?? {});
  }

  // Resolve aliases to the nodes this clip actually animates (e.g. inference's
  // `root` → `mixamorig:Hips` when the authored hips tracks live on the alias).
  map = normalizeMapToClip(map, sourceSkeleton, sourceClip);

  // hipsScale: "leg-length" measures the lower-limb chain (lowerLeg+foot+toes
  // local-offset magnitudes) on each skeleton via the map's resolved node
  // names — a real units/length ratio even when the rig defs carry no `length`
  // fields; a number pins an explicit factor; `undefined` keeps the map's own
  // hips scale.
  if (options.hipsScale !== undefined) {
    const scale = options.hipsScale === "leg-length"
      ? (() => {
          const sourceLeg = legChainLength(map, sourceSkeleton, "source");
          const targetLeg = legChainLength(map, targetSkeleton, "target");
          return sourceLeg > 1e-9 && targetLeg > 1e-9 ? targetLeg / sourceLeg : (map.bindings.hips?.scale ?? 1);
        })()
      : options.hipsScale;
    const hips = map.bindings.hips;
    if (hips) {
      map = { ...map, bindings: { ...map.bindings, hips: { ...hips, scale } } };
    }
  }

  // Which mapped source bones carry animated translation / scale channels.
  const animatedTranslation = new Set<string>();
  const animatedScale = new Set<string>();
  for (const track of sourceClip.tracks) {
    const split = splitTarget(track.target);
    if (!split || track.valueType !== "vector3") continue;
    if (split.path === "translation" || split.path === "position") animatedTranslation.add(split.node);
    else if (split.path === "scale") animatedScale.add(split.node);
  }

  // Finger pass-through pairs when requested (same-named source+target nodes).
  const fingerPairs: { source: string; target: string; sourceRest: AnimationQuaternion; targetRest: AnimationQuaternion }[] = [];
  if (options.fingers === true) {
    for (const [name, indices] of sourceSkeleton.jointIndicesByName) {
      if (!FINGER_PATTERN.test(name) || indices.length === 0) continue;
      const targetIndices = targetSkeleton.jointIndicesByName.get(name);
      if (!targetIndices || targetIndices.length === 0) continue;
      const sRest = poseTransformAt(sourceSkeleton.restPose, indices[0]!).rotation ?? { x: 0, y: 0, z: 0, w: 1 };
      const tRest = poseTransformAt(targetSkeleton.restPose, targetIndices[0]!).rotation ?? { x: 0, y: 0, z: 0, w: 1 };
      fingerPairs.push({ source: name, target: name, sourceRest: sRest, targetRest: tRest });
    }
  }

  const times = sortedUnionTimes(sourceClip);
  const cursors = createTrackCursors(sourceClip);
  const scratch = new Float32Array(8);
  const outChannels = new Map<string, { times: number[]; values: number[] }>();
  const channel = (target: string) => {
    let c = outChannels.get(target);
    if (c === undefined) outChannels.set(target, (c = { times: [], values: [] }));
    return c;
  };

  for (const t of times) {
    const pose = sampleClipToPose(sourceClip, sourceSkeleton, map, cursors, scratch, t);
    const retargeted = retargetHumanoidPose(pose, map, { scaleRootMotion: true });
    for (const bone of HUMANOID_BONES) {
      const binding = map.bindings[bone];
      if (!binding) continue;
      const transform = retargeted.bones[binding.target.name];
      if (!transform) continue;
      const rot = channel(`${binding.target.name}.rotation`);
      const r = transform.rotation ?? { x: 0, y: 0, z: 0, w: 1 };
      rot.times.push(t); rot.values.push(r.x, r.y, r.z, r.w);
      const sourceName = sourceNameFor(map, bone);
      if (sourceName !== undefined && animatedTranslation.has(sourceName) && transform.position) {
        const pos = channel(`${binding.target.name}.translation`);
        pos.times.push(t); pos.values.push(transform.position.x, transform.position.y, transform.position.z);
      }
      if (transform.scale && sourceName !== undefined && animatedScale.has(sourceName)) {
        const scl = channel(`${binding.target.name}.scale`);
        scl.times.push(t); scl.values.push(transform.scale.x, transform.scale.y, transform.scale.z);
      }
    }
    for (const pair of fingerPairs) {
      const animated = pose.bones[pair.source]?.rotation;
      if (!animated) continue;
      const delta = quatMul(quatConj(pair.sourceRest), quatNormalize(animated));
      const q = quatNormalize(quatMul(pair.targetRest, delta));
      const c = channel(`${pair.target}.rotation`);
      c.times.push(t); c.values.push(q.x, q.y, q.z, q.w);
    }
  }

  const tracks = [...outChannels.entries()].map(([target, c]) => new AnimationTrack({
    target,
    valueType: target.endsWith(".rotation") ? "quaternion" : "vector3",
    keyframes: c.times.map((time, i) => ({
      time,
      value: target.endsWith(".rotation")
        ? [c.values[i * 4]!, c.values[i * 4 + 1]!, c.values[i * 4 + 2]!, c.values[i * 4 + 3]!]
        : [c.values[i * 3]!, c.values[i * 3 + 1]!, c.values[i * 3 + 2]!]
    }))
  }));
  return {
    name,
    clip: compileClip(new AnimationClip({ name, duration: sourceClip.duration, tracks }))
  };
}

/**
 * Convert a baked `CompiledClip` back into an `AnimationClip` — baked clips are
 * authored as linear keys (cubic tangents are flattened at bake time), so the
 * raw form loses nothing and can register into `clipsByName`/the mixer.
 */
export function decompileCompiledClip(name: string, compiled: CompiledClip): AnimationClip {
  const tracks = compiled.tracks.map((track) => {
    const keyframes = [];
    for (let k = 0; k < track.keyframeCount; k += 1) {
      const base = k * track.stride;
      keyframes.push({
        time: track.times[k]!,
        value: Array.from(track.values.slice(base, base + track.stride)),
        ...(track.interpolation[k] === 1 ? { interpolation: "step" as const } : {})
      });
    }
    return new AnimationTrack({ target: track.target, valueType: track.valueType, keyframes });
  });
  return new AnimationClip({ name, duration: compiled.duration, tracks });
}

/**
 * Limb-flip detector (Phase 3 exit (a)): counts baked rotation keyframes whose
 * single-frame joint swing exceeds `thresholdDeg` (default 120°). A clean
 * retarget reports none.
 */
export function detectLimbFlips(clip: CompiledClip, thresholdDeg = 120): readonly LimbFlip[] {
  const flips: LimbFlip[] = [];
  const cosThreshold = Math.cos((thresholdDeg * Math.PI) / 180);
  const qa = [0, 0, 0, 1];
  const qb = [0, 0, 0, 1];
  for (const track of clip.tracks) {
    if (track.valueType !== "quaternion") continue;
    for (let k = 0; k + 1 < track.keyframeCount; k += 1) {
      const a = k * 4;
      const b = (k + 1) * 4;
      qa[0] = track.values[a]!; qa[1] = track.values[a + 1]!; qa[2] = track.values[a + 2]!; qa[3] = track.values[a + 3]!;
      qb[0] = track.values[b]!; qb[1] = track.values[b + 1]!; qb[2] = track.values[b + 2]!; qb[3] = track.values[b + 3]!;
      const dot = Math.abs(qa[0]! * qb[0]! + qa[1]! * qb[1]! + qa[2]! * qb[2]! + qa[3]! * qb[3]!);
      const clamped = Math.min(1, dot);
      // angle between adjacent local rotations: 2·acos(|dot|) (shortest arc).
      const degrees = (2 * Math.acos(clamped) * 180) / Math.PI;
      if (clamped < cosThreshold) {
        flips.push({ track: track.target, keyframeIndex: k + 1, degrees });
      }
    }
  }
  return flips;
}
