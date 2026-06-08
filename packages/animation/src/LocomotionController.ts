import { AnimationClip } from "./AnimationClip.js";
import { AnimationTrack } from "./AnimationTrack.js";
import type { FootIkRig } from "./FootIk.js";
import { applyRootMotion, extractRootMotion } from "./RootMotion.js";

export interface LocomotionControllerState {
  speed: number;
  inPlace: boolean;
  paused: boolean;
  pathRadius: number;
}

export interface LocomotionControllerSample {
  clipName: string;
  clipTime: number;
  worldX: number;
  worldZ: number;
  heading: number;
  stride: number;
  rootMotionDistance: number;
}

export interface LocomotionControllerOptions {
  readonly clip: AnimationClip;
  readonly rootMotionTrack?: string;
  readonly speed?: number;
  readonly inPlace?: boolean;
  readonly paused?: boolean;
  readonly pathRadius?: number;
  readonly strideAmplitude?: number;
  readonly rootMotionScale?: number;
  /** Optional foot-IK rig so locomotion can ground feet on uneven terrain (no foot sliding). */
  readonly footIkRig?: FootIkRig;
}

export interface ProceduralWalkClipOptions {
  readonly name?: string;
  readonly duration?: number;
  readonly distance?: number;
  readonly rootMotionTrack?: string;
}

export class LocomotionController {
  readonly clip: AnimationClip;
  readonly rootMotionTrack: string;
  readonly strideAmplitude: number;
  readonly rootMotionScale: number;
  readonly state: LocomotionControllerState;
  /** Optional foot-IK rig hook; call `footIk.solveFootPlacement(...)` to ground feet. */
  readonly footIk: FootIkRig | undefined;

  constructor(options: LocomotionControllerOptions) {
    if (!Number.isFinite(options.clip.duration) || options.clip.duration <= 0) {
      throw new Error("LocomotionController requires a clip with positive finite duration.");
    }
    this.clip = options.clip;
    this.rootMotionTrack = options.rootMotionTrack ?? "root.position";
    this.strideAmplitude = options.strideAmplitude ?? 1;
    this.rootMotionScale = options.rootMotionScale ?? 1;
    this.footIk = options.footIkRig;
    this.state = {
      speed: options.speed ?? 1,
      inPlace: options.inPlace ?? false,
      paused: options.paused ?? false,
      pathRadius: options.pathRadius ?? 1
    };
  }

  setSpeed(speed: number): this {
    if (!Number.isFinite(speed) || speed < 0) {
      throw new Error("LocomotionController speed must be finite and non-negative.");
    }
    this.state.speed = speed;
    return this;
  }

  setInPlace(inPlace: boolean): this {
    this.state.inPlace = inPlace;
    return this;
  }

  setPaused(paused: boolean): this {
    this.state.paused = paused;
    return this;
  }

  setPathRadius(pathRadius: number): this {
    if (!Number.isFinite(pathRadius) || pathRadius <= 0) {
      throw new Error("LocomotionController pathRadius must be positive and finite.");
    }
    this.state.pathRadius = pathRadius;
    return this;
  }

  sample(elapsedSeconds: number): LocomotionControllerSample {
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
      throw new Error("LocomotionController elapsed time must be finite and non-negative.");
    }
    const scaledTime = this.state.paused ? 0 : elapsedSeconds * this.state.speed;
    const previousTime = Math.max(0, scaledTime - 1 / 60);
    const clipTime = wrapTime(scaledTime, this.clip.duration);
    const previousClipTime = wrapTime(previousTime, this.clip.duration);
    const target = { position: [0, 0, 0] as [number, number, number] };
    const rootMotion = extractRootMotion(this.clip, {
      target: this.rootMotionTrack,
      fromTime: previousClipTime,
      toTime: clipTime,
      loop: true
    });
    applyRootMotion(target, rootMotion, this.state.inPlace ? 0 : this.rootMotionScale);
    const rootMotionDistance = this.state.inPlace ? 0 : scaledTime * this.rootMotionScale;
    const pathAngle = this.state.inPlace ? -0.9 : rootMotionDistance / Math.max(0.1, this.state.pathRadius);
    return {
      clipName: this.clip.name,
      clipTime,
      worldX: this.state.inPlace ? 0 : Math.sin(pathAngle) * this.state.pathRadius,
      worldZ: this.state.inPlace ? 0 : Math.cos(pathAngle) * this.state.pathRadius,
      heading: this.state.inPlace ? 0 : pathAngle + Math.PI / 2,
      stride: Math.sin((clipTime / this.clip.duration) * Math.PI * 2) * this.strideAmplitude,
      rootMotionDistance: Math.hypot(target.position[0], target.position[2]) + rootMotionDistance
    };
  }
}

export function createRootMotionWalkClip(options: ProceduralWalkClipOptions = {}): AnimationClip {
  const name = options.name ?? "a3d-procedural-root-walk";
  const duration = options.duration ?? 1.2;
  const distance = options.distance ?? 1.28;
  const target = options.rootMotionTrack ?? "root.position";
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(distance) || distance <= 0) {
    throw new Error("Root-motion walk clip duration and distance must be positive finite values.");
  }
  return new AnimationClip({
    name,
    duration,
    tracks: [
      new AnimationTrack({
        target,
        valueType: "vector3",
        keyframes: [
          { time: 0, value: [0, 0, 0], interpolation: "linear" },
          { time: duration * 0.25, value: [0, 0, distance * 0.25], interpolation: "linear" },
          { time: duration * 0.5, value: [0, 0, distance * 0.5], interpolation: "linear" },
          { time: duration * 0.75, value: [0, 0, distance * 0.75], interpolation: "linear" },
          { time: duration, value: [0, 0, distance], interpolation: "linear" }
        ]
      })
    ]
  });
}

function wrapTime(time: number, duration: number): number {
  const wrapped = time % duration;
  return wrapped < 0 ? wrapped + duration : wrapped;
}
