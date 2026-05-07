import type { AnimationClip } from "./AnimationClip.js";
import type { AnimationTrack } from "./AnimationTrack.js";
import type { Vec3 } from "./Keyframe.js";

export type RootMotionExtractionDescriptor = {
  readonly target?: string;
  readonly fromTime: number;
  readonly toTime: number;
  readonly loop?: boolean;
};

export type RootMotionSample = {
  readonly target: string;
  readonly fromTime: number;
  readonly toTime: number;
  readonly looped: boolean;
  readonly delta: Vec3;
};

export type RootMotionTarget = {
  position: [number, number, number];
};

const defaultRootMotionTarget = "root.position";

export function extractRootMotion(clip: AnimationClip, descriptor: RootMotionExtractionDescriptor): RootMotionSample {
  const target = descriptor.target ?? defaultRootMotionTarget;
  if (!Number.isFinite(descriptor.fromTime) || !Number.isFinite(descriptor.toTime)) {
    throw new Error("Root motion times must be finite.");
  }
  const track = clip.tracks.find((candidate) => candidate.target === target);
  if (!track) {
    throw new Error(`Root motion track "${target}" was not found.`);
  }
  if (track.valueType !== "vector3") {
    throw new Error(`Root motion track "${target}" must be a vector3 track.`);
  }

  const loop = descriptor.loop ?? false;
  const delta = loop
    ? extractLoopingDelta(track, clip.duration, descriptor.fromTime, descriptor.toTime)
    : subtractVec3(
        sampleVec3(track, clampTime(descriptor.toTime, clip.duration)),
        sampleVec3(track, clampTime(descriptor.fromTime, clip.duration))
      );

  return {
    target,
    fromTime: descriptor.fromTime,
    toTime: descriptor.toTime,
    looped: loop,
    delta
  };
}

export function applyRootMotion(target: RootMotionTarget, sample: RootMotionSample, scale = 1): RootMotionTarget {
  if (!Number.isFinite(scale)) {
    throw new Error("Root motion scale must be finite.");
  }
  target.position = [
    target.position[0] + sample.delta[0] * scale,
    target.position[1] + sample.delta[1] * scale,
    target.position[2] + sample.delta[2] * scale
  ];
  return target;
}

function extractLoopingDelta(track: AnimationTrack, duration: number, fromTime: number, toTime: number): Vec3 {
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Looping root motion requires a positive clip duration.");
  }

  let effectiveTo = toTime;
  if (effectiveTo < fromTime) {
    effectiveTo += Math.ceil((fromTime - effectiveTo) / duration) * duration;
  }

  const fromCycle = Math.floor(fromTime / duration);
  const toCycle = Math.floor(effectiveTo / duration);
  const fromWrapped = wrapTime(fromTime, duration);
  const toWrapped = wrapTime(effectiveTo, duration);

  if (fromCycle === toCycle) {
    return subtractVec3(sampleVec3(track, toWrapped), sampleVec3(track, fromWrapped));
  }

  const cycleDelta = subtractVec3(sampleVec3(track, duration), sampleVec3(track, 0));
  const firstPartial = subtractVec3(sampleVec3(track, duration), sampleVec3(track, fromWrapped));
  const wholeCycles = Math.max(0, toCycle - fromCycle - 1);
  const finalPartial = subtractVec3(sampleVec3(track, toWrapped), sampleVec3(track, 0));
  return addVec3(addVec3(firstPartial, scaleVec3(cycleDelta, wholeCycles)), finalPartial);
}

function clampTime(time: number, duration: number): number {
  if (!Number.isFinite(duration) || duration < 0) {
    throw new Error("Root motion clip duration must be finite and non-negative.");
  }
  return Math.max(0, Math.min(duration, time));
}

function wrapTime(time: number, duration: number): number {
  const wrapped = time % duration;
  return wrapped < 0 ? wrapped + duration : wrapped;
}

function sampleVec3(track: AnimationTrack, time: number): Vec3 {
  const value = track.sample(time);
  if (!Array.isArray(value) || value.length !== 3 || value.some((component) => typeof component !== "number" || !Number.isFinite(component))) {
    throw new Error(`Root motion track "${track.target}" sampled an invalid vector3 value.`);
  }
  return [value[0], value[1], value[2]];
}

function addVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtractVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scaleVec3(a: Vec3, scale: number): Vec3 {
  return [a[0] * scale, a[1] * scale, a[2] * scale];
}
