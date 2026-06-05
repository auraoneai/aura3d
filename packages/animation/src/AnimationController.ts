import {
  animationClipEventKey,
  AnimationEventDispatcher,
  sampleClipEvents,
  type AnimationClipEvent,
  type AnimationClipEventInvocation,
  type AnimationClipEventUnsubscribe,
  type AnimationPlaybackDirection
} from "./AnimationClipEvents.js";
import {
  AnimationClipRegistry,
  type AnimationClipDefinition,
  type RegisteredAnimationClip
} from "./AnimationClipRegistry.js";

export type AnimationLoopMode = "once" | "loop" | "pingpong";
export type AnimationPlaybackStatus = "idle" | "playing" | "paused" | "stopped" | "completed";

export interface AnimationVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface AnimationQuaternion {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

export interface AnimationPoseTransform {
  readonly position?: AnimationVector3;
  readonly rotation?: AnimationQuaternion;
  readonly scale?: AnimationVector3;
}

export interface AnimationRootMotion {
  readonly translation?: AnimationVector3;
  readonly rotation?: AnimationQuaternion;
}

export interface AnimationPose {
  readonly bones: Record<string, AnimationPoseTransform>;
  readonly morphTargets?: Record<string, number>;
  readonly rootMotion?: AnimationRootMotion;
  readonly metadata?: Record<string, unknown>;
}

export interface AnimationClipPlaybackState<TClipId extends string = string> {
  readonly id: string;
  readonly clipId: TClipId;
  readonly status: AnimationPlaybackStatus;
  readonly localTime: number;
  readonly previousLocalTime: number;
  readonly normalizedTime: number;
  readonly duration: number;
  readonly speed: number;
  readonly weight: number;
  readonly targetWeight: number;
  readonly loopMode: AnimationLoopMode;
  readonly loopCount: number;
  readonly direction: AnimationPlaybackDirection;
  readonly completed: boolean;
  readonly fade?: AnimationFadeState;
}

export interface AnimationFadeState {
  readonly kind: "in" | "out";
  readonly elapsed: number;
  readonly duration: number;
  readonly fromWeight: number;
  readonly toWeight: number;
}

export interface AnimationPlayOptions<TClipId extends string = string> {
  readonly id?: string;
  readonly restart?: boolean;
  readonly exclusive?: boolean;
  readonly loop?: AnimationLoopMode | boolean;
  readonly speed?: number;
  readonly weight?: number;
  readonly startTime?: number;
  readonly fadeIn?: number;
  readonly paused?: boolean;
  readonly direction?: AnimationPlaybackDirection;
  readonly metadata?: Record<string, unknown>;
  readonly fallbackClipId?: TClipId;
}

export interface AnimationStopOptions {
  readonly fadeOut?: number;
}

export interface AnimationCrossfadeOptions<TClipId extends string = string> extends AnimationPlayOptions<TClipId> {
  readonly fromClipId?: TClipId;
}

export type AnimationCrossFadeOptions<TClipId extends string = string> = AnimationCrossfadeOptions<TClipId>;

export interface AnimationScrubOptions<TClipId extends string = string> {
  readonly clipId?: TClipId;
  readonly emitEvents?: boolean;
  readonly play?: boolean;
  readonly createIfMissing?: boolean;
}

export interface AnimationPoseCaptureOptions<TClipId extends string = string> {
  readonly clipId?: TClipId;
  readonly time?: number;
  readonly emitEvent?: boolean;
}

export interface AnimationPoseSnapshot<TClipId extends string = string> {
  readonly time: number;
  readonly pose: AnimationPose;
  readonly clips: readonly AnimationClipPlaybackState<TClipId>[];
}

export interface AnimationControllerSnapshot<TClipId extends string = string> {
  readonly time: number;
  readonly activeClipId?: TClipId;
  readonly clips: readonly AnimationClipPlaybackState<TClipId>[];
}

export interface AnimationClipLoopEvent<TClipId extends string = string> {
  readonly clipId: TClipId;
  readonly playbackId: string;
  readonly loopCount: number;
  readonly loopsPassed: number;
}

export interface AnimationCrossfadeEvent<TClipId extends string = string> {
  readonly fromClipIds: readonly TClipId[];
  readonly toClipId: TClipId;
  readonly duration: number;
}

export type AnimationCrossFadeEvent<TClipId extends string = string> = AnimationCrossfadeEvent<TClipId>;

export interface AnimationScrubEvent<TClipId extends string = string> {
  readonly clipId: TClipId;
  readonly playbackId: string;
  readonly fromTime: number;
  readonly toTime: number;
}

export interface AnimationControllerEventMap<
  TClipId extends string = string,
  TEvent extends AnimationClipEvent = AnimationClipEvent
> {
  readonly start: AnimationClipPlaybackState<TClipId>;
  readonly end: AnimationClipPlaybackState<TClipId>;
  readonly loop: AnimationClipLoopEvent<TClipId>;
  readonly event: AnimationClipEventInvocation<TEvent, TClipId>;
  readonly crossFadeStart: AnimationCrossFadeEvent<TClipId>;
  readonly crossFadeEnd: AnimationCrossFadeEvent<TClipId>;
  readonly crossfadeStart: AnimationCrossfadeEvent<TClipId>;
  readonly crossfadeEnd: AnimationCrossfadeEvent<TClipId>;
  readonly scrub: AnimationScrubEvent<TClipId>;
  readonly poseCaptured: AnimationPoseSnapshot<TClipId>;
  readonly stateChanged: AnimationControllerSnapshot<TClipId>;
}

interface InternalPlaybackState<TClipId extends string, TEvent extends AnimationClipEvent>
  extends AnimationClipPlaybackState<TClipId> {
  clip: RegisteredAnimationClip<TClipId, TEvent, AnimationPose>;
  metadata?: Record<string, unknown>;
  onceEvents: Set<string>;
  playhead: number;
  inputDirection: AnimationPlaybackDirection;
  status: AnimationPlaybackStatus;
  localTime: number;
  previousLocalTime: number;
  normalizedTime: number;
  speed: number;
  weight: number;
  targetWeight: number;
  loopCount: number;
  direction: AnimationPlaybackDirection;
  completed: boolean;
  fade?: AnimationFadeState;
}

export class AnimationController<
  TClipId extends string = string,
  TEvent extends AnimationClipEvent = AnimationClipEvent
> {
  readonly registry: AnimationClipRegistry<TClipId, TEvent, AnimationPose>;

  private readonly dispatcher = new AnimationEventDispatcher<AnimationControllerEventMap<TClipId, TEvent>>();
  private readonly states = new Map<string, InternalPlaybackState<TClipId, TEvent>>();
  private clockTime = 0;
  private nextPlaybackIndex = 0;
  private pendingCrossfade?: AnimationCrossfadeEvent<TClipId>;

  constructor(registry: AnimationClipRegistry<TClipId, TEvent, AnimationPose> = new AnimationClipRegistry()) {
    this.registry = registry;
  }

  on<K extends Extract<keyof AnimationControllerEventMap<TClipId, TEvent>, string>>(
    type: K,
    listener: (payload: AnimationControllerEventMap<TClipId, TEvent>[K]) => void
  ): AnimationClipEventUnsubscribe {
    return this.dispatcher.on(type, listener);
  }

  once<K extends Extract<keyof AnimationControllerEventMap<TClipId, TEvent>, string>>(
    type: K,
    listener: (payload: AnimationControllerEventMap<TClipId, TEvent>[K]) => void
  ): AnimationClipEventUnsubscribe {
    return this.dispatcher.once(type, listener);
  }

  registerClip(
    definition: AnimationClipDefinition<TClipId, TEvent, AnimationPose>
  ): RegisteredAnimationClip<TClipId, TEvent, AnimationPose> {
    return this.registry.register(definition);
  }

  play(clipId: TClipId, options: AnimationPlayOptions<TClipId> = {}): AnimationClipPlaybackState<TClipId> {
    const resolvedClipId = this.registry.has(clipId) ? clipId : options.fallbackClipId;
    if (!resolvedClipId) {
      throw new Error(`Animation clip "${clipId}" is not registered.`);
    }

    const existing = this.findStateByClip(resolvedClipId);
    if (existing && !options.restart) {
      existing.status = options.paused ? "paused" : "playing";
      existing.speed = sanitizeSpeed(options.speed ?? existing.speed);
      existing.targetWeight = sanitizeWeight(options.weight ?? existing.targetWeight);
      existing.inputDirection = options.direction ?? existing.inputDirection;
      this.emitStateChanged();
      return cloneState(existing);
    }

    if (options.exclusive ?? true) {
      this.states.clear();
    }

    const clip = this.registry.require(resolvedClipId);
    const playback = this.createPlaybackState(clip, options);
    this.states.set(playback.id, playback);
    this.dispatcher.emit("start", cloneState(playback));
    this.emitStateChanged();
    return cloneState(playback);
  }

  pause(clipId?: TClipId): void {
    for (const state of this.selectStates(clipId)) {
      if (state.status === "playing") {
        state.status = "paused";
      }
    }

    this.emitStateChanged();
  }

  resume(clipId?: TClipId): void {
    for (const state of this.selectStates(clipId)) {
      if (state.status === "paused") {
        state.status = "playing";
      }
    }

    this.emitStateChanged();
  }

  restart(clipId?: TClipId, options: AnimationPlayOptions<TClipId> = {}): AnimationClipPlaybackState<TClipId> {
    const resolvedClipId = clipId ?? this.activeClipId();
    if (!resolvedClipId) {
      throw new Error("Cannot restart animation without an active clip or clipId.");
    }

    return this.play(resolvedClipId, {
      ...options,
      restart: true
    });
  }

  stop(clipId?: TClipId, options: AnimationStopOptions = {}): void {
    const targets = this.selectStates(clipId);
    const fadeOut = sanitizeDuration(options.fadeOut ?? 0);

    for (const state of targets) {
      if (fadeOut > 0) {
        state.fade = {
          kind: "out",
          elapsed: 0,
          duration: fadeOut,
          fromWeight: state.weight,
          toWeight: 0
        };
        state.targetWeight = 0;
      } else {
        this.states.delete(state.id);
        state.status = "stopped";
        this.dispatcher.emit("end", cloneState(state));
      }
    }

    this.emitStateChanged();
  }

  crossFade(
    toClipId: TClipId,
    duration: number,
    options: AnimationCrossFadeOptions<TClipId> = {}
  ): AnimationClipPlaybackState<TClipId> {
    return this.crossfade(toClipId, duration, options);
  }

  crossfade(
    toClipId: TClipId,
    duration: number,
    options: AnimationCrossfadeOptions<TClipId> = {}
  ): AnimationClipPlaybackState<TClipId> {
    const fadeDuration = sanitizeDuration(duration);
    const fromStates = options.fromClipId ? this.selectStates(options.fromClipId) : this.getInternalStates();
    const fromClipIds = fromStates.map((state) => state.clipId);
    const event: AnimationCrossfadeEvent<TClipId> = {
      fromClipIds,
      toClipId,
      duration: fadeDuration
    };

    this.dispatcher.emit("crossFadeStart", event);
    this.dispatcher.emit("crossfadeStart", event);
    this.pendingCrossfade = event;

    for (const state of fromStates) {
      state.fade = {
        kind: "out",
        elapsed: 0,
        duration: fadeDuration,
        fromWeight: state.weight,
        toWeight: 0
      };
      state.targetWeight = 0;
    }

    const next = this.play(toClipId, {
      ...options,
      exclusive: false,
      restart: true,
      fadeIn: fadeDuration,
      weight: options.weight ?? 1
    });

    if (fadeDuration === 0) {
      this.finishCrossfade();
    }

    return next;
  }

  update(dt: number): AnimationControllerSnapshot<TClipId> {
    if (!Number.isFinite(dt) || dt === 0) {
      return this.snapshot();
    }

    this.clockTime += dt;
    const endedStates: InternalPlaybackState<TClipId, TEvent>[] = [];

    for (const state of this.getInternalStates()) {
      this.updateFade(state, Math.abs(dt));

      if (state.status !== "playing") {
        continue;
      }

      const advance = advanceState(state, dt);
      this.emitSampledEvents(state);

      if (advance.loopsPassed > 0) {
        this.dispatcher.emit("loop", {
          clipId: state.clipId,
          playbackId: state.id,
          loopCount: state.loopCount,
          loopsPassed: advance.loopsPassed
        });
      }

      if (advance.completed) {
        state.status = "completed";
        state.completed = true;
        endedStates.push(state);
      }
    }

    for (const state of endedStates) {
      this.dispatcher.emit("end", cloneState(state));
    }

    this.removeFinishedFadeOuts();
    this.finishCrossfadeIfReady();
    this.emitStateChanged();
    return this.snapshot();
  }

  scrub(time: number, options?: AnimationScrubOptions<TClipId>): AnimationPoseSnapshot<TClipId>;
  scrub(clipId: TClipId, time: number, options?: AnimationScrubOptions<TClipId>): AnimationPoseSnapshot<TClipId>;
  scrub(
    clipOrTime: TClipId | number,
    timeOrOptions: number | AnimationScrubOptions<TClipId> = {},
    maybeOptions: AnimationScrubOptions<TClipId> = {}
  ): AnimationPoseSnapshot<TClipId> {
    const hasClipId = typeof clipOrTime === "string";
    const time = hasClipId ? Number(timeOrOptions) : clipOrTime;
    const options = hasClipId ? maybeOptions : (timeOrOptions as AnimationScrubOptions<TClipId>);
    const clipId = hasClipId ? clipOrTime : options.clipId ?? this.activeClipId();

    if (!clipId) {
      throw new Error("Cannot scrub without an active clip or clipId.");
    }

    let state = this.findStateByClip(clipId);
    if (!state) {
      if (options.createIfMissing === false) {
        throw new Error(`Cannot scrub inactive animation clip "${clipId}".`);
      }

      this.play(clipId, {
        startTime: time,
        paused: true,
        restart: true
      });
      state = this.findStateByClip(clipId);
    }

    if (!state) {
      throw new Error(`Cannot scrub animation clip "${clipId}".`);
    }

    const previousTime = state.localTime;
    state.previousLocalTime = previousTime;
    state.localTime = normalizeStateTime(time, state.duration, state.loopMode);
    state.playhead = state.localTime;
    state.normalizedTime = state.duration > 0 ? state.localTime / state.duration : 0;
    state.completed = false;
    state.status = options.play ? "playing" : "paused";

    if (options.emitEvents) {
      this.emitSampledEvents(state);
    }

    this.dispatcher.emit("scrub", {
      clipId,
      playbackId: state.id,
      fromTime: previousTime,
      toTime: state.localTime
    });
    this.emitStateChanged();
    return this.capturePose({ emitEvent: false });
  }

  capturePose(options: AnimationPoseCaptureOptions<TClipId> = {}): AnimationPoseSnapshot<TClipId> {
    const states = options.clipId
      ? this.selectStates(options.clipId)
      : this.getInternalStates().filter((state) => state.weight > 0);

    const pose = options.time !== undefined && options.clipId
      ? this.sampleSinglePose(this.registry.require(options.clipId), options.time)
      : this.blendStates(states);

    const snapshot: AnimationPoseSnapshot<TClipId> = {
      time: this.clockTime,
      pose,
      clips: states.map(cloneState)
    };

    if (options.emitEvent ?? true) {
      this.dispatcher.emit("poseCaptured", snapshot);
    }

    return snapshot;
  }

  state(clipId?: TClipId): AnimationClipPlaybackState<TClipId> | undefined {
    const state = clipId ? this.findStateByClip(clipId) : this.primaryState();
    return state ? cloneState(state) : undefined;
  }

  snapshot(): AnimationControllerSnapshot<TClipId> {
    return {
      time: this.clockTime,
      activeClipId: this.activeClipId(),
      clips: this.getInternalStates().map(cloneState)
    };
  }

  dispose(): void {
    this.states.clear();
    this.dispatcher.clear();
    this.pendingCrossfade = undefined;
  }

  private createPlaybackState(
    clip: RegisteredAnimationClip<TClipId, TEvent, AnimationPose>,
    options: AnimationPlayOptions<TClipId>
  ): InternalPlaybackState<TClipId, TEvent> {
    const targetWeight = sanitizeWeight(options.weight ?? 1);
    const fadeIn = sanitizeDuration(options.fadeIn ?? 0);
    const localTime = normalizeStateTime(options.startTime ?? 0, clip.duration, normalizeLoopMode(options.loop, clip.loop));
    const id = options.id ?? `${clip.id}:${this.nextPlaybackIndex}`;
    this.nextPlaybackIndex += 1;

    return {
      id,
      clip,
      clipId: clip.id,
      metadata: options.metadata,
      status: options.paused ? "paused" : "playing",
      localTime,
      previousLocalTime: localTime,
      normalizedTime: clip.duration > 0 ? localTime / clip.duration : 0,
      duration: clip.duration,
      speed: sanitizeSpeed(options.speed ?? 1),
      weight: fadeIn > 0 ? 0 : targetWeight,
      targetWeight,
      loopMode: normalizeLoopMode(options.loop, clip.loop),
      loopCount: 0,
      direction: options.direction ?? 1,
      inputDirection: options.direction ?? 1,
      completed: false,
      playhead: localTime,
      onceEvents: new Set<string>(),
      fade: fadeIn > 0
        ? {
            kind: "in",
            elapsed: 0,
            duration: fadeIn,
            fromWeight: 0,
            toWeight: targetWeight
          }
        : undefined
    };
  }

  private emitSampledEvents(state: InternalPlaybackState<TClipId, TEvent>): void {
    const invocations = sampleClipEvents(
      {
        id: state.clipId,
        duration: state.duration,
        events: state.clip.events
      },
      {
        from: state.previousLocalTime,
        to: state.localTime,
        duration: state.duration,
        loop: state.loopMode !== "once",
        direction: state.direction,
        loopCount: state.loopCount,
        playbackTime: this.clockTime
      }
    );

    for (const invocation of invocations) {
      if (invocation.event.once) {
        const key = animationClipEventKey(invocation.clipId, invocation.event);
        if (state.onceEvents.has(key)) continue;
        state.onceEvents.add(key);
      }

      this.dispatcher.emit("event", invocation);
    }
  }

  private updateFade(state: InternalPlaybackState<TClipId, TEvent>, dt: number): void {
    if (!state.fade) return;

    if (state.fade.duration === 0) {
      state.weight = state.fade.toWeight;
      state.fade = undefined;
      return;
    }

    const elapsed = Math.min(state.fade.duration, state.fade.elapsed + dt);
    const alpha = elapsed / state.fade.duration;
    state.weight = lerp(state.fade.fromWeight, state.fade.toWeight, alpha);
    state.fade = elapsed >= state.fade.duration
      ? undefined
      : {
          ...state.fade,
          elapsed
        };
  }

  private removeFinishedFadeOuts(): void {
    for (const state of this.getInternalStates()) {
      if (state.fade || state.weight > 0 || state.targetWeight > 0) continue;
      this.states.delete(state.id);
      state.status = "stopped";
      this.dispatcher.emit("end", cloneState(state));
    }
  }

  private finishCrossfadeIfReady(): void {
    if (!this.pendingCrossfade) return;
    const hasActiveFade = this.getInternalStates().some((state) => state.fade);
    if (!hasActiveFade) {
      this.finishCrossfade();
    }
  }

  private finishCrossfade(): void {
    if (!this.pendingCrossfade) return;
    this.dispatcher.emit("crossFadeEnd", this.pendingCrossfade);
    this.dispatcher.emit("crossfadeEnd", this.pendingCrossfade);
    this.pendingCrossfade = undefined;
  }

  private blendStates(states: readonly InternalPlaybackState<TClipId, TEvent>[]): AnimationPose {
    const weightedStates = states.filter((state) => state.weight > 0);
    if (weightedStates.length === 0) {
      return emptyPose();
    }

    const accumulators = new Map<string, BoneAccumulator>();
    const morphTargets: Record<string, number> = {};
    let totalWeight = 0;

    for (const state of weightedStates) {
      const pose = this.sampleSinglePose(state.clip, state.localTime, state);
      const weight = state.weight;
      totalWeight += weight;

      for (const [boneName, transform] of Object.entries(pose.bones)) {
        const accumulator = accumulators.get(boneName) ?? createBoneAccumulator();
        accumulateTransform(accumulator, transform, weight);
        accumulators.set(boneName, accumulator);
      }

      for (const [name, value] of Object.entries(pose.morphTargets ?? {})) {
        morphTargets[name] = (morphTargets[name] ?? 0) + value * weight;
      }
    }

    const bones: Record<string, AnimationPoseTransform> = {};
    for (const [boneName, accumulator] of accumulators) {
      bones[boneName] = resolveAccumulator(accumulator);
    }

    if (totalWeight > 0) {
      for (const name of Object.keys(morphTargets)) {
        morphTargets[name] /= totalWeight;
      }
    }

    return {
      bones,
      morphTargets
    };
  }

  private sampleSinglePose(
    clip: RegisteredAnimationClip<TClipId, TEvent, AnimationPose>,
    time: number,
    state?: InternalPlaybackState<TClipId, TEvent>
  ): AnimationPose {
    if (!clip.sample) {
      return emptyPose();
    }

    const localTime = normalizeStateTime(time, clip.duration, clip.loop ? "loop" : "once");
    const pose = clip.sample({
      clip,
      time: localTime,
      normalizedTime: clip.duration > 0 ? localTime / clip.duration : 0,
      playbackState: state ? cloneState(state) : undefined
    });

    return isAnimationPose(pose) ? pose : emptyPose();
  }

  private selectStates(clipId?: TClipId): InternalPlaybackState<TClipId, TEvent>[] {
    const states = this.getInternalStates();
    if (!clipId) return states;
    return states.filter((state) => state.clipId === clipId);
  }

  private getInternalStates(): InternalPlaybackState<TClipId, TEvent>[] {
    return [...this.states.values()];
  }

  private findStateByClip(clipId: TClipId): InternalPlaybackState<TClipId, TEvent> | undefined {
    return this.getInternalStates().find((state) => state.clipId === clipId);
  }

  private primaryState(): InternalPlaybackState<TClipId, TEvent> | undefined {
    return this.getInternalStates().sort((a, b) => b.weight - a.weight)[0];
  }

  private activeClipId(): TClipId | undefined {
    return this.primaryState()?.clipId;
  }

  private emitStateChanged(): void {
    this.dispatcher.emit("stateChanged", this.snapshot());
  }
}

interface AdvanceResult {
  readonly completed: boolean;
  readonly loopsPassed: number;
}

interface BoneAccumulator {
  position?: MutableVector3;
  rotation?: MutableQuaternion;
  scale?: MutableVector3;
  weight: number;
}

interface MutableVector3 {
  x: number;
  y: number;
  z: number;
}

interface MutableQuaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

function advanceState<TClipId extends string, TEvent extends AnimationClipEvent>(
  state: InternalPlaybackState<TClipId, TEvent>,
  dt: number
): AdvanceResult {
  const previousPlayhead = state.playhead;
  const delta = dt * state.speed * state.inputDirection;
  state.previousLocalTime = state.localTime;
  state.playhead += delta;

  if (state.duration === 0) {
    state.localTime = 0;
    state.normalizedTime = 0;
    state.direction = state.inputDirection;
    return {
      completed: state.loopMode === "once",
      loopsPassed: 0
    };
  }

  const loopsPassed = state.loopMode === "once"
    ? 0
    : countBoundariesBetween(previousPlayhead, state.playhead, state.duration);

  if (state.loopMode === "once") {
    state.localTime = clamp(state.playhead, 0, state.duration);
    state.direction = state.inputDirection;
    state.normalizedTime = state.localTime / state.duration;
    return {
      completed: state.playhead <= 0 || state.playhead >= state.duration,
      loopsPassed: 0
    };
  }

  if (state.loopMode === "loop") {
    state.localTime = positiveModulo(state.playhead, state.duration);
    state.direction = state.inputDirection;
  } else {
    const previousLocalTime = state.localTime;
    state.localTime = pingPongTime(state.playhead, state.duration);
    state.direction = state.localTime >= previousLocalTime ? 1 : -1;
  }

  state.loopCount += loopsPassed;
  state.normalizedTime = state.localTime / state.duration;

  return {
    completed: false,
    loopsPassed
  };
}

function normalizeLoopMode(loop: AnimationLoopMode | boolean | undefined, clipLoops: boolean): AnimationLoopMode {
  if (loop === true) return "loop";
  if (loop === false) return "once";
  if (loop) return loop;
  return clipLoops ? "loop" : "once";
}

function normalizeStateTime(time: number, duration: number, loopMode: AnimationLoopMode): number {
  if (!Number.isFinite(time) || duration <= 0) return 0;
  if (loopMode === "once") return clamp(time, 0, duration);
  if (loopMode === "pingpong") return pingPongTime(time, duration);
  return positiveModulo(time, duration);
}

function cloneState<TClipId extends string>(
  state: AnimationClipPlaybackState<TClipId>
): AnimationClipPlaybackState<TClipId> {
  return {
    id: state.id,
    clipId: state.clipId,
    status: state.status,
    localTime: state.localTime,
    previousLocalTime: state.previousLocalTime,
    normalizedTime: state.normalizedTime,
    duration: state.duration,
    speed: state.speed,
    weight: state.weight,
    targetWeight: state.targetWeight,
    loopMode: state.loopMode,
    loopCount: state.loopCount,
    direction: state.direction,
    completed: state.completed,
    fade: state.fade
      ? {
          ...state.fade
        }
      : undefined
  };
}

function emptyPose(): AnimationPose {
  return {
    bones: {}
  };
}

function isAnimationPose(value: unknown): value is AnimationPose {
  if (!value || typeof value !== "object") return false;
  return "bones" in value && typeof (value as AnimationPose).bones === "object";
}

function createBoneAccumulator(): BoneAccumulator {
  return {
    weight: 0
  };
}

function accumulateTransform(
  accumulator: BoneAccumulator,
  transform: AnimationPoseTransform,
  weight: number
): void {
  accumulator.weight += weight;

  if (transform.position) {
    accumulator.position = addWeightedVector(accumulator.position, transform.position, weight);
  }

  if (transform.rotation) {
    accumulator.rotation = addWeightedQuaternion(accumulator.rotation, transform.rotation, weight);
  }

  if (transform.scale) {
    accumulator.scale = addWeightedVector(accumulator.scale, transform.scale, weight);
  }
}

function resolveAccumulator(accumulator: BoneAccumulator): AnimationPoseTransform {
  const divisor = accumulator.weight > 0 ? accumulator.weight : 1;
  return {
    position: accumulator.position ? divideVector(accumulator.position, divisor) : undefined,
    rotation: accumulator.rotation ? normalizeQuaternion(divideQuaternion(accumulator.rotation, divisor)) : undefined,
    scale: accumulator.scale ? divideVector(accumulator.scale, divisor) : undefined
  };
}

function addWeightedVector(
  current: MutableVector3 | undefined,
  value: AnimationVector3,
  weight: number
): MutableVector3 {
  return {
    x: (current?.x ?? 0) + value.x * weight,
    y: (current?.y ?? 0) + value.y * weight,
    z: (current?.z ?? 0) + value.z * weight
  };
}

function addWeightedQuaternion(
  current: MutableQuaternion | undefined,
  value: AnimationQuaternion,
  weight: number
): MutableQuaternion {
  return {
    x: (current?.x ?? 0) + value.x * weight,
    y: (current?.y ?? 0) + value.y * weight,
    z: (current?.z ?? 0) + value.z * weight,
    w: (current?.w ?? 0) + value.w * weight
  };
}

function divideVector(value: MutableVector3, divisor: number): AnimationVector3 {
  return {
    x: value.x / divisor,
    y: value.y / divisor,
    z: value.z / divisor
  };
}

function divideQuaternion(value: MutableQuaternion, divisor: number): AnimationQuaternion {
  return {
    x: value.x / divisor,
    y: value.y / divisor,
    z: value.z / divisor,
    w: value.w / divisor
  };
}

function normalizeQuaternion(value: AnimationQuaternion): AnimationQuaternion {
  const length = Math.hypot(value.x, value.y, value.z, value.w);
  if (length === 0) {
    return {
      x: 0,
      y: 0,
      z: 0,
      w: 1
    };
  }

  return {
    x: value.x / length,
    y: value.y / length,
    z: value.z / length,
    w: value.w / length
  };
}

function countBoundariesBetween(from: number, to: number, interval: number): number {
  if (interval <= 0 || from === to) return 0;
  const low = Math.min(from, to);
  const high = Math.max(from, to);
  const first = Math.floor(low / interval) + 1;
  const last = Math.floor(high / interval);
  return Math.max(0, last - first + 1);
}

function pingPongTime(time: number, duration: number): number {
  if (duration <= 0) return 0;
  const period = duration * 2;
  const wrapped = positiveModulo(time, period);
  return wrapped <= duration ? wrapped : period - wrapped;
}

function sanitizeSpeed(speed: number): number {
  return Number.isFinite(speed) ? speed : 1;
}

function sanitizeWeight(weight: number): number {
  if (!Number.isFinite(weight)) return 1;
  return Math.max(0, weight);
}

function sanitizeDuration(duration: number): number {
  if (!Number.isFinite(duration) || duration < 0) return 0;
  return duration;
}

function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * clamp(alpha, 0, 1);
}

function positiveModulo(value: number, divisor: number): number {
  if (divisor <= 0) return 0;
  return ((value % divisor) + divisor) % divisor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
