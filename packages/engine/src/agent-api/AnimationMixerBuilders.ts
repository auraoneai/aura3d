import {
  AnimationAction,
  AnimationClip,
  AnimationLayer,
  AnimationMixer,
  AnimationTrack,
  type AnimationClipDescriptor,
  type AnimationEvent,
  type AnimationEventMarker,
  type AnimationLayerOptions,
  type AnimationMixerOptions,
  type AnimationMixerSnapshot,
  type AnimationTarget,
  type AnimationTrackDescriptor,
  type AnimationValue,
  type LoopMode
} from "@aura3d/animation";

export {
  AnimationAction,
  AnimationClip,
  AnimationLayer,
  AnimationMixer,
  AnimationTrack
};
export type {
  AnimationClipDescriptor,
  AnimationEvent,
  AnimationEventMarker,
  AnimationLayerOptions,
  AnimationMixerOptions,
  AnimationMixerSnapshot,
  AnimationTrackDescriptor,
  AnimationValue,
  LoopMode
};

export interface RootAnimationMixerOptions extends AnimationMixerOptions {
  readonly target?: AnimationTarget;
  readonly timeScale?: number;
}

export interface RootAnimationActionOptions {
  readonly weight?: number;
  readonly timeScale?: number;
  readonly loop?: LoopMode;
  readonly autoplay?: boolean;
}

export interface RootAnimationEventMarkerOptions {
  readonly name: string;
  readonly time: number;
  readonly payload?: unknown;
}

export interface RootAnimationCrossFadeOptions {
  readonly inertial?: boolean;
  readonly halfLife?: number;
}

const ANIMATION_TRACK_VALUE_TYPES = new Set([
  "scalar",
  "vector3",
  "quaternion",
  "number-array",
  "boolean",
  "string"
]);

const ANIMATION_ACTION_LOOPS: readonly LoopMode[] = ["once", "repeat", "pingpong"];

/**
 * Root safe API entry for the three.js `AnimationMixer` workflow: mixer,
 * action, track, event, timeScale, crossfade, and layers are all reachable
 * from `@aura3d/engine` through these builders. Every builder fails loud:
 * invalid input throws naming the builder, and ignored operations on the
 * underlying mixer/action/layer warn or throw naming that API.
 */
export function createAnimationMixer(options: RootAnimationMixerOptions = {}): AnimationMixer {
  if (options.timeScale !== undefined && (!Number.isFinite(options.timeScale) || options.timeScale < 0)) {
    throw new Error("createAnimationMixer: timeScale must be finite and non-negative.");
  }
  if (options.rootMotionScale !== undefined && !Number.isFinite(options.rootMotionScale)) {
    throw new Error("createAnimationMixer: rootMotionScale must be finite.");
  }
  const mixer = new AnimationMixer(options.target, options);
  if (options.timeScale !== undefined) {
    mixer.setTimeScale(options.timeScale);
  }
  return mixer;
}

export function createAnimationTrack<T extends AnimationValue = AnimationValue>(
  descriptor: AnimationTrackDescriptor<T>
): AnimationTrack<T> {
  if (!descriptor || typeof descriptor !== "object") {
    throw new Error("createAnimationTrack: descriptor is required.");
  }
  if (!ANIMATION_TRACK_VALUE_TYPES.has(descriptor.valueType)) {
    throw new Error(`createAnimationTrack: unknown valueType "${String(descriptor.valueType)}" for target "${String(descriptor.target)}".`);
  }
  return new AnimationTrack(descriptor);
}

export function createAnimationClip(descriptor: AnimationClipDescriptor): AnimationClip {
  if (!descriptor || typeof descriptor !== "object") {
    throw new Error("createAnimationClip: descriptor is required.");
  }
  return new AnimationClip(descriptor);
}

export function createAnimationAction(clip: AnimationClip, options: RootAnimationActionOptions = {}): AnimationAction {
  if (!(clip instanceof AnimationClip)) {
    throw new Error("createAnimationAction: clip must be an AnimationClip created by createAnimationClip.");
  }
  if (options.weight !== undefined && (!Number.isFinite(options.weight) || options.weight < 0)) {
    throw new Error("createAnimationAction: weight must be finite and non-negative.");
  }
  if (options.timeScale !== undefined && (!Number.isFinite(options.timeScale) || options.timeScale < 0)) {
    throw new Error("createAnimationAction: timeScale must be finite and non-negative.");
  }
  if (options.loop !== undefined && !ANIMATION_ACTION_LOOPS.includes(options.loop)) {
    throw new Error(`createAnimationAction: loop must be one of ${ANIMATION_ACTION_LOOPS.join("|")}.`);
  }
  const action = new AnimationAction(clip);
  if (options.weight !== undefined) {
    action.setWeight(options.weight);
  }
  if (options.timeScale !== undefined) {
    action.setTimeScale(options.timeScale);
  }
  if (options.loop !== undefined) {
    action.setLoop(options.loop);
  }
  if (options.autoplay ?? true) {
    action.play();
  }
  return action;
}

export function createAnimationLayer(name: string, options: number | AnimationLayerOptions = 1): AnimationLayer {
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new Error("createAnimationLayer: name must be a non-empty string.");
  }
  return new AnimationLayer(name, options);
}

export function createAnimationEventMarker(options: RootAnimationEventMarkerOptions): AnimationEventMarker {
  if (!options || typeof options !== "object") {
    throw new Error("createAnimationEventMarker: options are required.");
  }
  if (typeof options.name !== "string" || options.name.trim().length === 0) {
    throw new Error("createAnimationEventMarker: name must be a non-empty string.");
  }
  if (!Number.isFinite(options.time) || options.time < 0) {
    throw new Error("createAnimationEventMarker: time must be finite and non-negative.");
  }
  return options.payload === undefined
    ? { name: options.name, time: options.time }
    : { name: options.name, time: options.time, payload: options.payload };
}

export function subscribeAnimationEvents(
  mixer: AnimationMixer,
  listener: (event: AnimationEvent) => void
): () => void {
  if (!(mixer instanceof AnimationMixer)) {
    throw new Error("subscribeAnimationEvents: mixer must be an AnimationMixer created by createAnimationMixer.");
  }
  if (typeof listener !== "function") {
    throw new Error("subscribeAnimationEvents: listener must be a function.");
  }
  return mixer.onEvent(listener);
}

export function setAnimationTimeScale(target: AnimationMixer | AnimationAction, timeScale: number): void {
  if (!(target instanceof AnimationMixer) && !(target instanceof AnimationAction)) {
    throw new Error("setAnimationTimeScale: target must be an AnimationMixer or an AnimationAction.");
  }
  if (!Number.isFinite(timeScale) || timeScale < 0) {
    throw new Error("setAnimationTimeScale: timeScale must be finite and non-negative.");
  }
  target.setTimeScale(timeScale);
}

export function crossFadeAnimations(
  mixer: AnimationMixer,
  from: AnimationAction,
  to: AnimationAction,
  duration: number,
  options: RootAnimationCrossFadeOptions = {}
): void {
  if (!(mixer instanceof AnimationMixer)) {
    throw new Error("crossFadeAnimations: mixer must be an AnimationMixer created by createAnimationMixer.");
  }
  if (options.inertial) {
    mixer.inertialCrossFade(from, to, options.halfLife);
    return;
  }
  if (options.halfLife !== undefined) {
    throw new Error("crossFadeAnimations: halfLife requires the inertial option.");
  }
  mixer.crossFade(from, to, duration);
}

export function attachAnimationLayer(mixer: AnimationMixer, layer: AnimationLayer): AnimationLayer {
  if (!(mixer instanceof AnimationMixer)) {
    throw new Error("attachAnimationLayer: mixer must be an AnimationMixer created by createAnimationMixer.");
  }
  if (!(layer instanceof AnimationLayer)) {
    throw new Error("attachAnimationLayer: layer must be an AnimationLayer created by createAnimationLayer.");
  }
  mixer.addLayer(layer);
  return layer;
}

export function assignActionToAnimationLayer(layer: AnimationLayer, action: AnimationAction): AnimationLayer {
  if (!(layer instanceof AnimationLayer)) {
    throw new Error("assignActionToAnimationLayer: layer must be an AnimationLayer created by createAnimationLayer.");
  }
  if (!(action instanceof AnimationAction)) {
    throw new Error("assignActionToAnimationLayer: action must be an AnimationAction created by createAnimationAction.");
  }
  layer.add(action);
  return layer;
}
