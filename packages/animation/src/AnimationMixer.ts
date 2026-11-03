import { AnimationAction, type AnimationActionSnapshot } from "./AnimationAction.js";
import type { AnimationClip } from "./AnimationClip.js";
import type { AnimationEvent } from "./AnimationEvents.js";
import { AnimationLayer, type AnimationLayerSnapshot } from "./AnimationLayer.js";
import { cloneAnimationValue, normalizeQuat, slerpQuat, type AnimationValue } from "./Keyframe.js";
import { DEFAULT_INERTIALIZATION_HALF_LIFE, inertializedTransitionWeight } from "./Inertialization.js";
import { applyRootMotion, extractRootMotion, type RootMotionSample, type RootMotionTarget } from "./RootMotion.js";
import { additiveContributionValue, blendBaseValue } from "./pose/blendKernels.js";
import { poseMixerBlendEnabled } from "./pose/poseMixerFlags.js";

export type AnimationTarget = {
  setAnimationValue?: (target: string, value: AnimationValue) => void;
  applyRootMotion?: (sample: RootMotionSample) => void;
  /** Authoritative movement sink. When supplied, the mixer never also writes position. */
  consumeRootMotion?: (sample: RootMotionSample) => void;
  position?: [number, number, number];
};

export type AnimationMixerOptions = {
  readonly applyRootMotion?: boolean;
  readonly rootMotionTrack?: string;
  readonly rootMotionScale?: number;
  /** Remove extracted displacement from the sampled local root pose. Opt in for actor locomotion. */
  readonly consumeRootMotionTrack?: boolean;
};

export type AnimationMixerSnapshot = {
  readonly timeScale: number;
  readonly actionCount: number;
  readonly actions: readonly AnimationActionSnapshot[];
  readonly layers: readonly AnimationLayerSnapshot[];
  readonly values: Readonly<Record<string, AnimationValue>>;
  readonly applyErrors: readonly AnimationApplyError[];
  /** Present on `serialize()` output; ordinary diagnostic snapshots remain lightweight. */
  readonly state?: {
    readonly version: 1;
    readonly options: {
      readonly applyRootMotion: boolean;
      readonly rootMotionTrack: string;
      readonly rootMotionScale: number;
      readonly consumeRootMotionTrack: boolean;
    };
    /** Target callbacks and position are externally owned and must be rebound by the adapter. */
    readonly target: {
      readonly present: boolean;
      readonly setAnimationValue: boolean;
      readonly applyRootMotion: boolean;
      readonly consumeRootMotion: boolean;
      readonly position: boolean;
    };
    readonly layers: readonly { readonly actionIndices: readonly number[]; readonly baseWeights: readonly number[] }[];
    readonly inertialTransition: { readonly from: number; readonly to: number; readonly elapsed: number; readonly halfLife: number } | null;
    readonly warnedEmptyUpdate: boolean;
  };
};

export type AnimationApplyError = {
  readonly target: string;
  readonly message: string;
};

/**
 * Low-level playback events the mixer dispatches via {@link AnimationMixer.addEventListener}
 * (three's `AnimationMixer` "finished"/"loop" contract, SA-01). Clip marker
 * events remain on {@link AnimationMixer.onEvent}.
 */
export type AnimationMixerPlaybackEventType = "finished" | "loop" | "overflow";

export interface AnimationMixerFinishedEvent {
  readonly type: "finished";
  readonly action: AnimationAction;
  /** `1` when the playhead crossed the clip end, `-1` when it crossed the start (negative timeScale). */
  readonly direction: number;
}

export interface AnimationMixerLoopEvent {
  readonly type: "loop";
  readonly action: AnimationAction;
  /** Signed count of clip boundaries wrapped during this update (negative in reverse). */
  readonly loopDelta: number;
}

export interface AnimationMixerOverflowEvent {
  readonly type: "overflow";
  readonly action: AnimationAction;
  /** Marker occurrences skipped after the action's catch-up limit. */
  readonly dropped: number;
}

export type AnimationMixerPlaybackEvent = AnimationMixerFinishedEvent | AnimationMixerLoopEvent | AnimationMixerOverflowEvent;

export type AnimationMixerPlaybackEventListener = (event: AnimationMixerPlaybackEvent) => void;

/** three's event-map overload: listeners narrow to the event matching `type`. */
export interface AnimationMixerPlaybackEventMap {
  readonly finished: AnimationMixerFinishedEvent;
  readonly loop: AnimationMixerLoopEvent;
  readonly overflow: AnimationMixerOverflowEvent;
}

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
  private readonly playbackListeners = new Map<AnimationMixerPlaybackEventType, Set<AnimationMixerPlaybackEventListener>>();
  private disposed = false;
  private warnedEmptyUpdate = false;
  private updateDepth = 0;
  private inertialTransition: { from: AnimationAction; to: AnimationAction; elapsed: number; halfLife: number } | undefined;

  constructor(target?: AnimationTarget, private readonly options: AnimationMixerOptions = {}) {
    this.target = target;
  }

  play(clip: AnimationClip): AnimationAction {
    this.assertAlive();
    const action = new AnimationAction(clip).play();
    this.actions.push(action);
    this.warnedEmptyUpdate = false;
    return action;
  }

  addAction(action: AnimationAction): void {
    this.assertAlive();
    if (!(action instanceof AnimationAction)) {
      throw new Error("AnimationMixer.addAction: action must be an AnimationAction.");
    }
    if (this.actions.includes(action)) {
      console.warn(`AnimationMixer.addAction: action for clip "${action.clip.name}" is already registered; ignoring the duplicate.`);
      return;
    }
    this.actions.push(action);
    this.warnedEmptyUpdate = false;
  }

  addLayer(layer: AnimationLayer): void {
    this.assertAlive();
    if (!layer || typeof layer.name !== "string") {
      throw new Error("AnimationMixer.addLayer: layer must be an AnimationLayer.");
    }
    if (this.layers.includes(layer)) {
      console.warn(`AnimationMixer.addLayer: layer "${layer.name}" is already registered; ignoring the duplicate.`);
      return;
    }
    this.layers.push(layer);
  }

  setTimeScale(timeScale: number): void {
    this.assertAlive();
    if (!Number.isFinite(timeScale)) {
      throw new Error("AnimationMixer.setTimeScale: timeScale must be finite.");
    }
    this.timeScale = timeScale;
  }

  stopAll(): void {
    this.assertAlive();
    if (this.actions.length === 0) {
      console.warn("AnimationMixer.stopAll: no actions are registered; nothing to stop.");
      return;
    }
    for (const action of this.actions) {
      action.stop();
    }
  }

  crossFade(from: AnimationAction, to: AnimationAction, duration: number): void {
    this.assertAlive();
    this.assertCrossFadePair("AnimationMixer.crossFade", from, to);
    if (!Number.isFinite(duration) || duration < 0) {
      throw new Error("AnimationMixer.crossFade: duration must be finite and non-negative.");
    }
    if (!this.actions.includes(from)) {
      console.warn(`AnimationMixer.crossFade: "from" action (clip "${from.clip.name}") is not registered on this mixer; its fade-out will not advance.`);
    }
    from.fadeTo(0, duration);
    to.play().fadeTo(1, duration);
    if (!this.actions.includes(to)) this.addAction(to);
  }

  /**
   * Inertialized transition between two actions: instead of the linear weight ramp of
   * {@link crossFade}, the source action's weight follows a critically-damped decay (zero initial
   * slope, momentum-preserving) so the blend carries through instead of dissolving. The transition
   * is advanced deterministically inside {@link update}; weights always sum to 1 and the source is
   * stopped once it has effectively faded. Pass a `halfLife` (seconds) to tune snappiness.
   */
  inertialCrossFade(from: AnimationAction, to: AnimationAction, halfLife = DEFAULT_INERTIALIZATION_HALF_LIFE): void {
    this.assertAlive();
    this.assertCrossFadePair("AnimationMixer.inertialCrossFade", from, to);
    if (!Number.isFinite(halfLife)) {
      throw new Error("AnimationMixer.inertialCrossFade: halfLife must be finite.");
    }
    if (!this.actions.includes(from)) {
      console.warn(`AnimationMixer.inertialCrossFade: "from" action (clip "${from.clip.name}") is not registered on this mixer; its fade-out will not advance.`);
    }
    to.play();
    from.weight = 1;
    to.weight = 0;
    if (!this.actions.includes(to)) this.addAction(to);
    this.inertialTransition = { from, to, elapsed: 0, halfLife };
  }

  update(delta: number): readonly AnimationEvent[] {
    this.assertAlive();
    this.updateDepth++;
    try {
      return this.updateActions(delta);
    } finally {
      this.updateDepth--;
    }
  }

  private updateActions(delta: number): readonly AnimationEvent[] {
    if (!Number.isFinite(delta)) {
      throw new Error("AnimationMixer.update: delta must be finite.");
    }
    if (!Number.isFinite(this.timeScale)) {
      throw new Error("AnimationMixer.update: timeScale must be finite; call AnimationMixer.setTimeScale with a valid value.");
    }
    for (const layer of this.layers) {
      if (!Number.isFinite(layer.weight) || layer.weight < 0) {
        throw new Error(`AnimationMixer.update: layer "${layer.name}" weight is invalid; call AnimationLayer.setWeight with a finite non-negative value.`);
      }
    }
    if (this.actions.length === 0) {
      if (!this.warnedEmptyUpdate) {
        this.warnedEmptyUpdate = true;
        console.warn("AnimationMixer.update: no actions are registered; returning no events and applying no values.");
      }
      return [];
    }
    this.advanceInertialTransition(delta * this.timeScale);
    const events: AnimationEvent[] = [];
    const accumulators = new Map<string, TargetAccumulator>();
    const motion = new Map<string, TargetAccumulator>();
    let motionSample: RootMotionSample | undefined;
    for (const action of this.actions) {
      const previousTime = action.time;
      const wasPlaying = action.playing;
      const actionEvents = action.update(delta * this.timeScale);
      if (actionEvents.length > 0) {
        events.push(...actionEvents);
      }
      const signals = action.consumePlaybackSignals();
      if (signals.loopDelta !== 0) {
        this.dispatchPlaybackEvent({ type: "loop", action, loopDelta: signals.loopDelta });
      }
      if (signals.finishedDirection !== 0) {
        this.dispatchPlaybackEvent({ type: "finished", action, direction: signals.finishedDirection });
      }
      if (signals.eventOverflow > 0) {
        this.dispatchPlaybackEvent({ type: "overflow", action, dropped: signals.eventOverflow });
      }
      if (!wasPlaying) {
        continue;
      }
      const rootMotionTarget = this.options.rootMotionTrack ?? "root.position";
      if (this.options.applyRootMotion && action.weight > 0 && action.clip.tracks.some(track => track.target === rootMotionTarget)) {
        const looping = action.loopMode === "repeat" && action.clip.duration > 0;
        const end = looping ? previousTime + action.lastPlaybackDelta : action.time;
        const reverse = looping && end < previousTime;
        const extracted = extractRootMotion(action.clip, {
          fromTime: reverse ? end : previousTime,
          toTime: reverse ? previousTime : end,
          loop: looping,
          target: rootMotionTarget
        });
        const sample = reverse ? {
          ...extracted,
          fromTime: previousTime,
          toTime: end,
          delta: extracted.delta.map((value) => -value) as [number, number, number]
        } : extracted;
        motionSample = sample;
        for (const layer of this.layersForAction(action)) {
          if (layer.capturesTarget(rootMotionTarget)) {
            blendInto(motion, rootMotionTarget, "vector3", sample.delta, action.weight * layer.weight, layer.additive);
          }
        }
      }
      if (!action.playing) continue;
      for (const track of action.clip.tracks) {
        const sample = this.options.applyRootMotion && this.options.consumeRootMotionTrack && track.target === rootMotionTarget
          ? track.sample(0)
          : track.sample(action.time);
        for (const layer of this.layersForAction(action)) {
          if (layer.capturesTarget(track.target)) {
            blendInto(accumulators, track.target, track.valueType, sample, action.weight * layer.weight, layer.additive);
          }
        }
      }
    }
    if (motionSample) {
      const accumulator = motion.get(motionSample.target);
      if (accumulator) {
        const delta = finalizeTargetBlend(accumulator) as [number, number, number];
        const scale = this.options.rootMotionScale ?? 1;
        if (!Number.isFinite(scale)) throw new Error("Root motion scale must be finite.");
        const sample = { ...motionSample, delta: delta.map(value => value * scale) as [number, number, number] };
        this.target?.applyRootMotion?.(sample);
        if (this.target?.consumeRootMotion) this.target.consumeRootMotion(sample);
        else if (this.target?.position) applyRootMotion(this.target as RootMotionTarget, sample);
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
    if (typeof listener !== "function") {
      throw new Error("AnimationMixer.onEvent: listener must be a function.");
    }
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /**
   * three's `mixer.addEventListener("finished" | "loop", listener)` — fires when
   * any registered action crosses its final repetition ("finished", once per
   * finish) or wraps a loop boundary ("loop", with the signed `loopDelta`).
   * Returns an unsubscribe callback.
   */
  addEventListener<K extends AnimationMixerPlaybackEventType>(
    type: K,
    listener: (event: AnimationMixerPlaybackEventMap[K]) => void
  ): () => void {
    this.assertAlive();
    if (type !== "finished" && type !== "loop" && type !== "overflow") {
      throw new Error(`AnimationMixer.addEventListener: unknown event type "${String(type)}"; expected "finished", "loop" or "overflow".`);
    }
    if (typeof listener !== "function") {
      throw new Error(`AnimationMixer.addEventListener: listener for "${type}" must be a function.`);
    }
    let listeners = this.playbackListeners.get(type);
    if (!listeners) {
      listeners = new Set();
      this.playbackListeners.set(type, listeners);
    }
    listeners.add(listener as AnimationMixerPlaybackEventListener);
    return () => this.removeEventListener(type, listener as AnimationMixerPlaybackEventListener);
  }

  removeEventListener<K extends AnimationMixerPlaybackEventType>(
    type: K,
    listener: (event: AnimationMixerPlaybackEventMap[K]) => void
  ): void {
    const listeners = this.playbackListeners.get(type);
    if (!listeners) {
      return;
    }
    listeners.delete(listener as AnimationMixerPlaybackEventListener);
    if (listeners.size === 0) {
      this.playbackListeners.delete(type);
    }
  }

  private dispatchPlaybackEvent(event: AnimationMixerPlaybackEvent): void {
    const listeners = this.playbackListeners.get(event.type);
    if (!listeners) {
      return;
    }
    for (const listener of Array.from(listeners)) {
      listener(event);
    }
  }

  snapshot(): AnimationMixerSnapshot {
    const values: Record<string, AnimationValue> = {};
    for (const [target, value] of this.values) {
      Object.defineProperty(values, target, { value: cloneAnimationValue(value), enumerable: true, writable: true, configurable: true });
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

  /**
   * Capture restorable mixer-owned state. Listeners are executable closures and
   * must be unsubscribed before capture and explicitly reattached afterwards.
   * Targets are external dependencies: pass `{ externalTarget: "rebind" }` to
   * explicitly acknowledge that the target, its callbacks and scene/position
   * will be restored by the adapter. Only its binding capabilities are recorded.
   */
  serialize(options: { readonly externalTarget?: "rebind" } = {}): AnimationMixerSnapshot {
    this.assertAlive();
    if (this.updateDepth !== 0) throw new Error("AnimationMixer.serialize: cannot capture during an update.");
    const captureOptions = mixerRecord(options, "serialization options", ["externalTarget"], []);
    if (captureOptions.externalTarget !== undefined && captureOptions.externalTarget !== "rebind") {
      throw new Error("AnimationMixer.serialize: externalTarget must be 'rebind'.");
    }
    if (this.eventListeners.size || [...this.playbackListeners.values()].some(listeners => listeners.size > 0)) {
      throw new Error("AnimationMixer.serialize: event callbacks/listeners cannot be serialized; unsubscribe and reattach them explicitly.");
    }
    if (this.target !== undefined && captureOptions.externalTarget !== "rebind") {
      throw new Error("AnimationMixer.serialize: target and its callbacks are external; explicitly request externalTarget: 'rebind'.");
    }
    const layers = this.layers.map(layer => {
      const baseWeights = mixerLayerWeights(layer);
      return {
        actionIndices: layer.actions.map(action => {
          const index = this.actions.indexOf(action);
          if (index < 0) throw new Error("AnimationMixer.serialize: layer contains an unregistered action.");
          return index;
        }),
        baseWeights: layer.actions.map(action => {
          const weight = baseWeights.get(action);
          if (weight === undefined || !Number.isFinite(weight) || weight < 0) {
            throw new Error("AnimationMixer.serialize: layer base weight is invalid.");
          }
          return weight;
        })
      };
    });
    const transition = this.inertialTransition;
    const inertialTransition = transition ? {
      from: this.actions.indexOf(transition.from), to: this.actions.indexOf(transition.to),
      elapsed: transition.elapsed, halfLife: transition.halfLife
    } : null;
    const snapshot = this.snapshot();
    const serialized: AnimationMixerSnapshot = {
      ...snapshot,
      actions: this.actions.map(action => action.serialize()),
      state: {
        version: 1,
        options: mixerOptions(this.options),
        target: mixerTarget(this.target),
        layers,
        inertialTransition,
        warnedEmptyUpdate: this.warnedEmptyUpdate
      }
    };
    this.prepareRestore(serialized);
    rejectMixerNegativeZero(serialized);
    return serialized;
  }

  /**
   * Restore into already registered actions and layers in their original order.
   * The target, listener registrations and external scene state are not changed.
   * Validation of every action and layer completes before anything is mutated.
   */
  restore(snapshot: AnimationMixerSnapshot): this {
    this.assertAlive();
    if (this.updateDepth !== 0) throw new Error("AnimationMixer.restore: cannot restore during an update.");
    const plan = this.prepareRestore(snapshot);
    for (let index = 0; index < this.actions.length; index++) this.actions[index]!.restore(plan.actions[index]!);
    for (let index = 0; index < this.layers.length; index++) {
      const layer = this.layers[index]!;
      const state = plan.layers[index]!;
      layer.weight = state.weight;
      layer.additive = state.additive;
      const baseWeights = mixerLayerWeights(layer);
      for (let member = 0; member < state.indices.length; member++) {
        baseWeights.set(this.actions[state.indices[member]!]!, state.baseWeights[member]!);
      }
    }
    this.timeScale = plan.timeScale;
    this.values.clear();
    for (const [target, value] of plan.values) this.values.set(target, cloneAnimationValue(value));
    this.applyErrors = plan.applyErrors.map(error => ({ ...error }));
    this.inertialTransition = plan.transition ? {
      from: this.actions[plan.transition.from]!, to: this.actions[plan.transition.to]!,
      elapsed: plan.transition.elapsed, halfLife: plan.transition.halfLife
    } : undefined;
    this.warnedEmptyUpdate = plan.warnedEmptyUpdate;
    return this;
  }

  private prepareRestore(input: AnimationMixerSnapshot): MixerRestorePlan {
    const keys = ["timeScale", "actionCount", "actions", "layers", "values", "applyErrors"];
    const snapshot = mixerRecord(input, "snapshot", [...keys, "state"], keys);
    const timeScale = mixerNumber(snapshot.timeScale, "timeScale");
    const actionCount = mixerNumber(snapshot.actionCount, "actionCount", 0);
    const actionInputs = mixerArray(snapshot.actions, "actions");
    const layerInputs = mixerArray(snapshot.layers, "layers");
    if (!Number.isSafeInteger(actionCount) || actionCount !== actionInputs.length || actionCount !== this.actions.length) {
      throw new Error("AnimationMixer.restore: action count must match registered actions.");
    }
    if (layerInputs.length !== this.layers.length) throw new Error("AnimationMixer.restore: layer count must match registered layers.");
    const versioned = "state" in snapshot;
    const actions = actionInputs.map((action, index) => {
      if (versioned && (!action || typeof action !== "object" || !Object.prototype.hasOwnProperty.call(action, "state"))) {
        throw new Error("AnimationMixer.restore: versioned mixer requires complete action state.");
      }
      // A temporary action validates and normalizes each snapshot before any
      // registered action is changed, including legacy snapshots.
      return new AnimationAction(this.actions[index]!.clip).restore(action as AnimationActionSnapshot).serialize();
    });
    let layerStates: unknown[] | undefined;
    let transition: MixerRestorePlan["transition"] = null;
    let warnedEmptyUpdate = false;
    if (versioned) {
      const state = mixerRecord(snapshot.state, "state", ["version", "options", "target", "layers", "inertialTransition", "warnedEmptyUpdate"]);
      if (state.version !== 1) throw new Error("AnimationMixer.restore: unsupported state version.");
      if (JSON.stringify(mixerReadOptions(state.options)) !== JSON.stringify(mixerOptions(this.options))) {
        throw new Error("AnimationMixer.restore: mixer options do not match.");
      }
      if (JSON.stringify(mixerReadTarget(state.target)) !== JSON.stringify(mixerTarget(this.target))) {
        throw new Error("AnimationMixer.restore: external target bindings do not match.");
      }
      layerStates = mixerArray(state.layers, "layer state");
      if (layerStates.length !== layerInputs.length) throw new Error("AnimationMixer.restore: inconsistent layer state.");
      warnedEmptyUpdate = mixerBoolean(state.warnedEmptyUpdate, "warnedEmptyUpdate");
      if (state.inertialTransition !== null) {
        const record = mixerRecord(state.inertialTransition, "inertialTransition", ["from", "to", "elapsed", "halfLife"]);
        const from = mixerIndex(record.from, actions.length, "transition from");
        const to = mixerIndex(record.to, actions.length, "transition to");
        if (from === to) throw new Error("AnimationMixer.restore: transition actions must differ.");
        transition = { from, to, elapsed: mixerNumber(record.elapsed, "transition elapsed", 0), halfLife: mixerNumber(record.halfLife, "transition halfLife") };
      }
    }
    const layers = layerInputs.map((entry, index) => {
      const record = mixerRecord(entry, "layer", ["name", "weight", "additive", "mask", "actions"]);
      const layer = this.layers[index]!;
      mixerLayerWeights(layer);
      if (typeof record.name !== "string" || record.name !== layer.name) throw new Error("AnimationMixer.restore: layer names do not match.");
      const weight = mixerNumber(record.weight, "layer weight", 0);
      const additive = mixerBoolean(record.additive, "layer additive");
      const mask = mixerArray(record.mask, "layer mask");
      const names = mixerArray(record.actions, "layer actions");
      if (mask.some(value => typeof value !== "string" || value.length === 0) ||
          mask.length !== layer.mask.length || mask.some((value, member) => value !== layer.mask[member]) ||
          names.some(value => typeof value !== "string")) {
        throw new Error("AnimationMixer.restore: layer mask or action names do not match.");
      }
      let indices: number[];
      let baseWeights: number[];
      if (layerStates) {
        const savedLayer = mixerRecord(layerStates[index], "layer state", ["actionIndices", "baseWeights"]);
        indices = mixerArray(savedLayer.actionIndices, "layer actionIndices").map(value => mixerIndex(value, actions.length, "layer action index"));
        baseWeights = mixerArray(savedLayer.baseWeights, "layer baseWeights").map(value => mixerNumber(value, "layer base weight", 0));
      } else {
        // Old layer snapshots only contain names, so ambiguous names cannot be
        // rebound safely. Their original private base weights were not saved.
        indices = names.map(name => {
          const matches = actions.flatMap((action, actionIndex) => action.clipName === name ? [actionIndex] : []);
          if (matches.length !== 1) throw new Error("AnimationMixer.restore: legacy layer action name is ambiguous.");
          return matches[0]!;
        });
        baseWeights = indices.map(actionIndex => actions[actionIndex]!.weight);
      }
      if (indices.length !== names.length || baseWeights.length !== indices.length ||
          new Set(indices).size !== indices.length || layer.actions.length !== indices.length ||
          indices.some((actionIndex, member) => layer.actions[member] !== this.actions[actionIndex] || names[member] !== actions[actionIndex]!.clipName)) {
        throw new Error("AnimationMixer.restore: layer action membership does not match.");
      }
      return { weight, additive, indices, baseWeights };
    });
    const valuesRecord = mixerRecord(snapshot.values, "values");
    const values = Object.keys(valuesRecord).map(target => [target, mixerValue(valuesRecord[target], target)] as const);
    const applyErrors = mixerArray(snapshot.applyErrors, "applyErrors").map(entry => {
      const record = mixerRecord(entry, "apply error", ["target", "message"]);
      if (typeof record.target !== "string" || typeof record.message !== "string") throw new Error("AnimationMixer.restore: invalid apply error.");
      return { target: record.target, message: record.message };
    });
    return { timeScale, actions, layers, values, applyErrors, transition, warnedEmptyUpdate };
  }

  dispose(): void {
    this.actions.length = 0;
    this.layers.length = 0;
    this.values.clear();
    this.applyErrors = [];
    this.eventListeners.clear();
    this.playbackListeners.clear();
    this.inertialTransition = undefined;
    this.disposed = true;
  }

  private assertAlive(): void {
    if (this.disposed) {
      throw new Error("AnimationMixer has been disposed.");
    }
  }

  private assertCrossFadePair(api: string, from: AnimationAction, to: AnimationAction): void {
    if (!(from instanceof AnimationAction) || !(to instanceof AnimationAction)) {
      throw new Error(`${api}: "from" and "to" must both be AnimationAction instances.`);
    }
    if (from === to) {
      throw new Error(`${api}: "from" and "to" must be different actions; crossfading an action into itself is a no-op.`);
    }
  }

  private advanceInertialTransition(scaledDelta: number): void {
    const transition = this.inertialTransition;
    if (!transition) return;
    transition.elapsed += Math.abs(scaledDelta);
    const fromWeight = inertializedTransitionWeight(transition.elapsed, transition.halfLife);
    transition.from.weight = fromWeight;
    transition.to.weight = 1 - fromWeight;
    // Retire the transition once the source has effectively faded (offset within 1e-3).
    if (fromWeight <= 1e-3) {
      transition.from.weight = 0;
      transition.to.weight = 1;
      transition.from.stop();
      this.inertialTransition = undefined;
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

type MixerRestorePlan = {
  timeScale: number;
  actions: AnimationActionSnapshot[];
  layers: { weight: number; additive: boolean; indices: number[]; baseWeights: number[] }[];
  values: readonly (readonly [string, AnimationValue])[];
  applyErrors: AnimationApplyError[];
  transition: { from: number; to: number; elapsed: number; halfLife: number } | null;
  warnedEmptyUpdate: boolean;
};

function rejectMixerNegativeZero(value: unknown): void {
  if (typeof value === "number" && Object.is(value, -0)) {
    throw new Error("AnimationMixer.serialize: negative zero cannot round-trip through JSON.");
  }
  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) rejectMixerNegativeZero(nested);
  }
}

function mixerRecord(value: unknown, label: string, allowed?: readonly string[], required: readonly string[] = allowed ?? []): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new Error(`AnimationMixer.restore: ${label} must be a plain object.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.getOwnPropertySymbols(value).length || Object.keys(descriptors).some(key =>
    (allowed !== undefined && !allowed.includes(key)) || !("value" in descriptors[key]!) || !descriptors[key]!.enumerable)) {
    throw new Error(`AnimationMixer.restore: ${label} contains unsupported fields or callbacks.`);
  }
  if (required.some(key => !Object.prototype.hasOwnProperty.call(descriptors, key))) {
    throw new Error(`AnimationMixer.restore: ${label} is missing required fields.`);
  }
  return value as Record<string, unknown>;
}

function mixerArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length) {
    throw new Error(`AnimationMixer.restore: ${label} must be an array.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  if (keys.length !== value.length + 1 || keys.some(key => key !== "length" && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length))) {
    throw new Error(`AnimationMixer.restore: ${label} contains invalid array entries.`);
  }
  for (let index = 0; index < value.length; index++) {
    const item = descriptors[String(index)];
    if (!item || !("value" in item) || !item.enumerable) throw new Error(`AnimationMixer.restore: ${label} contains invalid array entries.`);
  }
  return value;
}

function mixerNumber(value: unknown, label: string, minimum = -Infinity): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) throw new Error(`AnimationMixer.restore: ${label} must be a finite number.`);
  return value;
}

function mixerBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`AnimationMixer.restore: ${label} must be boolean.`);
  return value;
}

function mixerIndex(value: unknown, length: number, label: string): number {
  const index = mixerNumber(value, label, 0);
  if (!Number.isSafeInteger(index) || index >= length) throw new Error(`AnimationMixer.restore: ${label} is out of range.`);
  return index;
}

function mixerValue(value: unknown, target: string): AnimationValue {
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return mixerArray(value, `value for ${target}`).map(component => mixerNumber(component, `value for ${target}`));
  throw new Error(`AnimationMixer.restore: value for ${target} is not serializable.`);
}

function mixerLayerWeights(layer: AnimationLayer): WeakMap<AnimationAction, number> {
  // AnimationLayer's applyWeight() depends on its original captured weights.
  // Keep the layer API unchanged, but explicitly capture that package-internal
  // state instead of silently substituting the current faded action weights.
  const descriptors = Object.getOwnPropertyDescriptors(layer);
  const allowed = ["name", "weight", "additive", "mask", "actions", "baseWeights"];
  if (Object.getPrototypeOf(layer) !== AnimationLayer.prototype || Object.getOwnPropertySymbols(layer).length ||
      Object.keys(descriptors).some(key => !allowed.includes(key) || !("value" in descriptors[key]!) || !descriptors[key]!.enumerable)) {
    throw new Error("AnimationMixer.serialize: custom layer behavior cannot be serialized.");
  }
  const weights = (layer as unknown as { baseWeights?: WeakMap<AnimationAction, number> }).baseWeights;
  if (!(weights instanceof WeakMap)) throw new Error("AnimationMixer.serialize: layer base weights are unavailable.");
  mixerArray(layer.actions, "layer actions");
  mixerArray(layer.mask, "layer mask");
  return weights;
}

function mixerOptions(options: AnimationMixerOptions): NonNullable<AnimationMixerSnapshot["state"]>["options"] {
  const record = mixerRecord(options, "mixer options", ["applyRootMotion", "rootMotionTrack", "rootMotionScale", "consumeRootMotionTrack"], []);
  const applyRootMotion = mixerBoolean(record.applyRootMotion ?? false, "applyRootMotion");
  const rootMotionTrack = record.rootMotionTrack ?? "root.position";
  if (typeof rootMotionTrack !== "string" || !rootMotionTrack.length) throw new Error("AnimationMixer.restore: invalid rootMotionTrack.");
  return {
    applyRootMotion,
    rootMotionTrack,
    rootMotionScale: mixerNumber(record.rootMotionScale ?? 1, "rootMotionScale"),
    consumeRootMotionTrack: mixerBoolean(record.consumeRootMotionTrack ?? false, "consumeRootMotionTrack")
  };
}

function mixerReadOptions(value: unknown): NonNullable<AnimationMixerSnapshot["state"]>["options"] {
  const record = mixerRecord(value, "options", ["applyRootMotion", "rootMotionTrack", "rootMotionScale", "consumeRootMotionTrack"]);
  return mixerOptions(record as AnimationMixerOptions);
}

function mixerTarget(target: AnimationTarget | undefined): NonNullable<AnimationMixerSnapshot["state"]>["target"] {
  if (target === undefined) return { present: false, setAnimationValue: false, applyRootMotion: false, consumeRootMotion: false, position: false };
  if (!target || typeof target !== "object") throw new Error("AnimationMixer.serialize: invalid external target.");
  const callback = (key: "setAnimationValue" | "applyRootMotion" | "consumeRootMotion"): boolean => {
    const value = target[key];
    if (value !== undefined && typeof value !== "function") throw new Error(`AnimationMixer.serialize: invalid target ${key} callback.`);
    return value !== undefined;
  };
  const position = target.position;
  if (position !== undefined && (!Array.isArray(position) || position.length !== 3 || position.some(value => !Number.isFinite(value)))) {
    throw new Error("AnimationMixer.serialize: invalid external target position.");
  }
  return {
    present: true,
    setAnimationValue: callback("setAnimationValue"),
    applyRootMotion: callback("applyRootMotion"),
    consumeRootMotion: callback("consumeRootMotion"),
    position: position !== undefined
  };
}

function mixerReadTarget(value: unknown): NonNullable<AnimationMixerSnapshot["state"]>["target"] {
  const record = mixerRecord(value, "target", ["present", "setAnimationValue", "applyRootMotion", "consumeRootMotion", "position"]);
  const target = {
    present: mixerBoolean(record.present, "target present"),
    setAnimationValue: mixerBoolean(record.setAnimationValue, "target setAnimationValue"),
    applyRootMotion: mixerBoolean(record.applyRootMotion, "target applyRootMotion"),
    consumeRootMotion: mixerBoolean(record.consumeRootMotion, "target consumeRootMotion"),
    position: mixerBoolean(record.position, "target position")
  };
  if (!target.present && (target.setAnimationValue || target.applyRootMotion || target.consumeRootMotion || target.position)) {
    throw new Error("AnimationMixer.restore: missing external target.");
  }
  return target;
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
  // T1.11 — facade routes through the pose-mixer's kernels under the sub-flag;
  // the legacy body below survives only for flag removal.
  if (poseMixerBlendEnabled()) {
    blendBaseValue(current, type, value, weight);
    return;
  }
  const total = current.weight + weight;
  const t = weight / total;
  if (type === "scalar") {
    current.value = (current.value as number) + ((value as number) - (current.value as number)) * t;
  } else if (type === "vector3" || type === "color") {
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
  if (poseMixerBlendEnabled()) {
    return additiveContributionValue(type, value, weight);
  }
  if (type === "scalar") {
    return (value as number) * weight;
  }
  if (type === "vector3" || type === "color") {
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
  if (type === "vector3" || type === "color") {
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
  if (type === "vector3" || type === "color") {
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
