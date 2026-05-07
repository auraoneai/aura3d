import { AnimationAction, type AnimationActionSnapshot } from "./AnimationAction.js";
import type { AnimationClip } from "./AnimationClip.js";
import type { AnimationEvent } from "./AnimationEvents.js";
import type { AnimationLayer, AnimationLayerSnapshot } from "./AnimationLayer.js";
import { cloneAnimationValue, normalizeQuat, slerpQuat, type AnimationValue } from "./Keyframe.js";
import { applyRootMotion, extractRootMotion, type RootMotionSample, type RootMotionTarget } from "./RootMotion.js";

export type AnimationTarget = {
  setAnimationValue?: (target: string, value: AnimationValue) => void;
  applyRootMotion?: (sample: RootMotionSample) => void;
  position?: [number, number, number];
};

export type AnimationMixerOptions = {
  readonly applyRootMotion?: boolean;
  readonly rootMotionTrack?: string;
  readonly rootMotionScale?: number;
};

export type AnimationMixerSnapshot = {
  readonly timeScale: number;
  readonly actionCount: number;
  readonly actions: readonly AnimationActionSnapshot[];
  readonly layers: readonly AnimationLayerSnapshot[];
  readonly values: Readonly<Record<string, AnimationValue>>;
  readonly applyErrors: readonly AnimationApplyError[];
};

export type AnimationApplyError = {
  readonly target: string;
  readonly message: string;
};

type MixerLayer = Pick<AnimationLayer, "name" | "weight" | "additive" | "mask" | "actions" | "capturesTarget" | "snapshot">;
type WeightedAccumulator = { value: AnimationValue; weight: number; type: string };
type TargetAccumulator = { type: string; base?: WeightedAccumulator; additive?: AnimationValue };

export class AnimationMixer {
  readonly target: AnimationTarget | undefined;
  timeScale = 1;
  private readonly actions: AnimationAction[] = [];
  private readonly layers: AnimationLayer[] = [];
  private readonly values = new Map<string, AnimationValue>();
  private applyErrors: AnimationApplyError[] = [];
  private readonly eventListeners = new Set<(event: AnimationEvent) => void>();
  private disposed = false;

  constructor(target?: AnimationTarget, private readonly options: AnimationMixerOptions = {}) {
    this.target = target;
  }

  play(clip: AnimationClip): AnimationAction {
    this.assertAlive();
    const action = new AnimationAction(clip).play();
    this.actions.push(action);
    return action;
  }

  addAction(action: AnimationAction): void {
    this.assertAlive();
    if (!this.actions.includes(action)) {
      this.actions.push(action);
    }
  }

  addLayer(layer: AnimationLayer): void {
    this.assertAlive();
    if (!this.layers.includes(layer)) {
      this.layers.push(layer);
    }
  }

  stopAll(): void {
    this.assertAlive();
    for (const action of this.actions) {
      action.stop();
    }
  }

  crossFade(from: AnimationAction, to: AnimationAction, duration: number): void {
    this.assertAlive();
    from.fadeTo(0, duration);
    to.play().fadeTo(1, duration);
    this.addAction(to);
  }

  update(delta: number): readonly AnimationEvent[] {
    this.assertAlive();
    if (!Number.isFinite(delta) || delta < 0) {
      throw new Error("AnimationMixer delta must be finite and non-negative.");
    }
    const events: AnimationEvent[] = [];
    const accumulators = new Map<string, TargetAccumulator>();
    for (const action of this.actions) {
      const previousTime = action.time;
      const actionEvents = action.update(delta * this.timeScale);
      if (actionEvents.length > 0) {
        events.push(...actionEvents);
      }
      if (!action.playing && action.weight <= 0) {
        continue;
      }
      this.applyActionRootMotion(action, previousTime);
      for (const track of action.clip.tracks) {
        const sample = track.sample(action.time);
        for (const layer of this.layersForAction(action)) {
          if (layer.capturesTarget(track.target)) {
            blendInto(accumulators, track.target, track.valueType, sample, action.weight * layer.weight, layer.additive);
          }
        }
      }
    }
    this.values.clear();
    this.applyErrors = [];
    for (const [target, accumulator] of accumulators) {
      const value = finalizeTargetBlend(accumulator);
      this.values.set(target, value);
      try {
        this.target?.setAnimationValue?.(target, value);
      } catch (error) {
        this.applyErrors.push({
          target,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
    for (const event of events) {
      for (const listener of Array.from(this.eventListeners)) {
        listener(event);
      }
    }
    return events;
  }

  getValue(target: string): AnimationValue | undefined {
    const value = this.values.get(target);
    return value === undefined ? undefined : cloneAnimationValue(value);
  }

  onEvent(listener: (event: AnimationEvent) => void): () => void {
    this.assertAlive();
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  snapshot(): AnimationMixerSnapshot {
    const values: Record<string, AnimationValue> = {};
    for (const [target, value] of this.values) {
      values[target] = cloneAnimationValue(value);
    }
    return {
      timeScale: this.timeScale,
      actionCount: this.actions.length,
      actions: this.actions.map((action) => action.snapshot()),
      layers: this.layers.map((layer) => layer.snapshot()),
      values,
      applyErrors: this.applyErrors.map((error) => ({ ...error }))
    };
  }

  dispose(): void {
    this.actions.length = 0;
    this.layers.length = 0;
    this.values.clear();
    this.applyErrors = [];
    this.eventListeners.clear();
    this.disposed = true;
  }

  private assertAlive(): void {
    if (this.disposed) {
      throw new Error("AnimationMixer has been disposed.");
    }
  }

  private applyActionRootMotion(action: AnimationAction, previousTime: number): void {
    if (!this.options.applyRootMotion || action.weight <= 0) return;
    const sample = extractRootMotion(action.clip, {
      fromTime: previousTime,
      toTime: action.time,
      loop: action.loopMode === "repeat",
      ...(this.options.rootMotionTrack === undefined ? {} : { target: this.options.rootMotionTrack })
    });
    const scaledSample = action.weight === 1
      ? sample
      : {
          ...sample,
          delta: [
            sample.delta[0] * action.weight,
            sample.delta[1] * action.weight,
            sample.delta[2] * action.weight
          ] as [number, number, number]
        };
    this.target?.applyRootMotion?.(scaledSample);
    if (this.target?.position) {
      applyRootMotion(this.target as RootMotionTarget, scaledSample, this.options.rootMotionScale ?? 1);
    }
  }

  private layersForAction(action: AnimationAction): readonly MixerLayer[] {
    if (this.layers.length === 0) {
      return UNMASKED_LAYERS;
    }
    const owningLayers = this.layers.filter((layer) => layer.actions.includes(action));
    return owningLayers.length > 0 ? owningLayers : UNMASKED_LAYERS;
  }
}

const UNMASKED_LAYER: MixerLayer = {
  name: "default",
  weight: 1,
  additive: false,
  mask: [],
  actions: [],
  capturesTarget: () => true,
  snapshot: () => ({ name: "default", weight: 1, additive: false, mask: [], actions: [] })
};
const UNMASKED_LAYERS: readonly MixerLayer[] = [UNMASKED_LAYER];

function blendInto(accumulators: Map<string, TargetAccumulator>, target: string, type: string, value: AnimationValue, weight: number, additive: boolean): void {
  if (weight <= 0) {
    return;
  }
  const current = accumulators.get(target);
  if (!current) {
    const accumulator: TargetAccumulator = { type };
    if (additive) {
      accumulator.additive = additiveContribution(type, value, weight);
    } else {
      accumulator.base = { value: cloneAnimationValue(value), weight, type };
    }
    accumulators.set(target, accumulator);
    return;
  }
  if (current.type !== type) {
    throw new Error(`Cannot blend ${type} animation track into existing ${current.type} target ${target}.`);
  }
  if (additive) {
    current.additive = current.additive === undefined
      ? additiveContribution(type, value, weight)
      : combineAdditive(type, current.additive, value, weight);
    return;
  }
  if (!current.base) {
    current.base = { value: cloneAnimationValue(value), weight, type };
    return;
  }
  blendBase(current.base, type, value, weight);
}

function blendBase(current: WeightedAccumulator, type: string, value: AnimationValue, weight: number): void {
  const total = current.weight + weight;
  const t = weight / total;
  if (type === "scalar") {
    current.value = (current.value as number) + ((value as number) - (current.value as number)) * t;
  } else if (type === "vector3") {
    const a = current.value as [number, number, number];
    const b = value as [number, number, number];
    current.value = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  } else if (type === "quaternion") {
    current.value = slerpQuat(current.value as [number, number, number, number], value as [number, number, number, number], t);
  } else if (type === "number-array") {
    const a = current.value as readonly number[];
    const b = value as readonly number[];
    if (a.length !== b.length) {
      throw new Error("Cannot blend number-array animation values with different lengths.");
    }
    current.value = a.map((component, index) => component + (b[index]! - component) * t);
  } else {
    current.value = cloneAnimationValue(value);
  }
  current.weight = total;
}

function finalizeTargetBlend(accumulator: TargetAccumulator): AnimationValue {
  const base = accumulator.base
    ? finalizeBaseBlend(accumulator.base)
    : accumulator.additive !== undefined
      ? additiveNeutral(accumulator.type, accumulator.additive)
      : undefined;
  if (base === undefined) {
    throw new Error("Animation target accumulator has no sampled value.");
  }
  if (accumulator.additive === undefined) {
    return base;
  }
  return applyAdditive(accumulator.type, base, accumulator.additive);
}

function finalizeBaseBlend(accumulator: WeightedAccumulator): AnimationValue {
  if (accumulator.type === "quaternion") {
    return normalizeQuat(accumulator.value as [number, number, number, number]);
  }
  return cloneAnimationValue(accumulator.value);
}

function additiveContribution(type: string, value: AnimationValue, weight: number): AnimationValue {
  if (type === "scalar") {
    return (value as number) * weight;
  }
  if (type === "vector3") {
    const vector = value as [number, number, number];
    return [vector[0] * weight, vector[1] * weight, vector[2] * weight];
  }
  if (type === "number-array") {
    return (value as readonly number[]).map((component) => component * weight);
  }
  if (type === "quaternion") {
    return slerpQuat([0, 0, 0, 1], normalizeQuat(value as [number, number, number, number]), weight);
  }
  throw new Error("Additive animation layers require numeric, vector, quaternion, or number-array tracks.");
}

function combineAdditive(type: string, current: AnimationValue, value: AnimationValue, weight: number): AnimationValue {
  return applyAdditive(type, current, additiveContribution(type, value, weight));
}

function applyAdditive(type: string, base: AnimationValue, delta: AnimationValue): AnimationValue {
  if (type === "scalar") {
    return (base as number) + (delta as number);
  }
  if (type === "vector3") {
    const a = base as [number, number, number];
    const b = delta as [number, number, number];
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  }
  if (type === "number-array") {
    const a = base as readonly number[];
    const b = delta as readonly number[];
    if (a.length !== b.length) {
      throw new Error("Cannot add number-array animation values with different lengths.");
    }
    return a.map((component, index) => component + b[index]!);
  }
  if (type === "quaternion") {
    return normalizeQuat(multiplyQuat(base as [number, number, number, number], delta as [number, number, number, number]));
  }
  throw new Error("Additive animation layers require numeric, vector, quaternion, or number-array tracks.");
}

function additiveNeutral(type: string, value: AnimationValue): AnimationValue {
  if (type === "scalar") {
    return 0;
  }
  if (type === "vector3") {
    return [0, 0, 0];
  }
  if (type === "number-array") {
    return (value as readonly number[]).map(() => 0);
  }
  if (type === "quaternion") {
    return [0, 0, 0, 1];
  }
  throw new Error("Additive animation layers require numeric, vector, quaternion, or number-array tracks.");
}

function multiplyQuat(a: [number, number, number, number], b: [number, number, number, number]): [number, number, number, number] {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
  ];
}
