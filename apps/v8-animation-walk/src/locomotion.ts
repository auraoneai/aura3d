import { AnimationClip, AnimationTrack, applyRootMotion, extractRootMotion } from "@galileo3d/animation";

export interface LocomotionState {
  speed: number;
  inPlace: boolean;
  paused: boolean;
  pathRadius: number;
}

export interface LocomotionSample {
  clipTime: number;
  worldX: number;
  worldZ: number;
  heading: number;
  stride: number;
  rootMotionDistance: number;
}

export function createLocomotionState(): LocomotionState {
  return {
    speed: 1,
    inPlace: false,
    paused: false,
    pathRadius: 1.05
  };
}

export function createWalkClip(): AnimationClip {
  return new AnimationClip({
    name: "g3d-procedural-root-walk",
    duration: 1.2,
    tracks: [
      new AnimationTrack({
        target: "root.position",
        valueType: "vector3",
        keyframes: [
          { time: 0, value: [0, 0, 0], interpolation: "linear" },
          { time: 0.3, value: [0, 0, 0.32], interpolation: "linear" },
          { time: 0.6, value: [0, 0, 0.64], interpolation: "linear" },
          { time: 0.9, value: [0, 0, 0.96], interpolation: "linear" },
          { time: 1.2, value: [0, 0, 1.28], interpolation: "linear" }
        ]
      })
    ]
  });
}

export function sampleLocomotion(clip: AnimationClip, state: LocomotionState, elapsedSeconds: number): LocomotionSample {
  const scaledTime = state.paused ? 0 : elapsedSeconds * state.speed;
  const previousTime = Math.max(0, scaledTime - 1 / 60);
  const clipTime = wrapTime(scaledTime, clip.duration);
  const previousClipTime = wrapTime(previousTime, clip.duration);
  const target = { position: [0, 0, 0] as [number, number, number] };
  const sample = extractRootMotion(clip, {
    fromTime: previousClipTime,
    toTime: clipTime,
    loop: true
  });
  applyRootMotion(target, sample, state.inPlace ? 0 : 1);
  const rootMotionDistance = state.inPlace ? 0 : scaledTime * 0.78;
  const pathAngle = state.inPlace ? -0.9 : rootMotionDistance / Math.max(0.1, state.pathRadius);
  return {
    clipTime,
    worldX: state.inPlace ? 0 : Math.sin(pathAngle) * state.pathRadius,
    worldZ: state.inPlace ? 0 : Math.cos(pathAngle) * state.pathRadius,
    heading: state.inPlace ? 0 : pathAngle + Math.PI / 2,
    stride: Math.sin((clipTime / clip.duration) * Math.PI * 2),
    rootMotionDistance: Math.hypot(target.position[0], target.position[2]) + rootMotionDistance
  };
}

function wrapTime(time: number, duration: number): number {
  const wrapped = time % duration;
  return wrapped < 0 ? wrapped + duration : wrapped;
}
