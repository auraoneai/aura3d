import { AnimationClip } from "../AnimationClip.js";
import { AnimationAction, type AnimationActionSnapshot } from "../AnimationAction.js";
import type { AnimationEvent } from "../AnimationEvents.js";
import type { AnimationClipEvent, AnimationClipEventInvocation } from "../AnimationClipEvents.js";
import { compileClip, createTrackCursors, sampleTrackInto, type CompiledClip, type CompiledTrack, type CompiledTrackCursor } from "./CompiledClip.js";
import type { PoseBuffer } from "./PoseBuffer.js";
import type { SkeletonBinding } from "./SkeletonBinding.js";
import { lerpVec3Flat, multiplyQuatFlat, slerpQuatFlat } from "./quatFlat.js";
import { isClipAdditive } from "./makeClipAdditive.js";
import { PoseInertializer } from "./PoseInertializer.js";

/**
 * PRD-06 T1.3 — one pose authority implementing §6.4 blend semantics with
 * three.js r185 `AnimationMixer`/`PropertyMixer` parity (within 1e-4):
 *
 * - Base layer accumulates in action-activation order:
 *   `acc = mix(acc, vᵢ, wᵢ/(w₀+…+wᵢ))` — quats via `slerpFlat`, others lerp —
 *   then `out = lerp(acc, rest, 1 − min(1, Σw))` when Σw < 1.
 * - Override layers: `out[b] = slerp(out[b], layer[b], weight·mask[b])`.
 * - Additive layers: rotations `out = slerp(out, out·delta, w)`; translations
 *   and scales `out += delta·w` (matches `makeClipAdditive`/`_lerpAdditive`).
 * - Fades use mixer time; warp integrates unpaused action time so pausing
 *   playback also pauses a scheduled rate change.
 * - `syncGroup` is the Aura extension: unpaused members share normalised phase
 *   (leader-driven) — three r185 has no equivalent.
 * - `transition: "inertialize"` captures offsets via `PoseInertializer` and
 *   decays them instead of weight-fading (cost ≈ 1 clip evaluation).
 *
 * Playback and event crossings use the same action traversal as the root mixer.
 */

export type PoseChannel = "position" | "rotation" | "scale";
export type PoseLoopMode = "repeat" | "once" | "pingpong";
export type PoseBlendMode = "normal" | "additive";
export type PoseTransition = "crossfade" | "inertialize";

type TrackBinding = {
  readonly trackIndex: number;
  readonly boneIndex: number;
  readonly channel: PoseChannel;
};

export type PoseActionOptions = {
  readonly weight?: number;
  readonly timeScale?: number;
  readonly loopMode?: PoseLoopMode;
  readonly repetitions?: number;
  readonly clampWhenFinished?: boolean;
  readonly additive?: boolean;
  readonly syncGroup?: string;
};

export type PoseCrossFadeOptions = {
  readonly warp?: boolean;
  readonly transition?: PoseTransition;
  readonly halfLife?: number;
  readonly syncGroup?: string;
  /** Forwarded to the fade-in action (C-19 `animation.weight`/`blendMode: "additive"`). */
  readonly weight?: number;
  readonly additive?: boolean;
};

export type PoseLayerOptions = PoseActionOptions & {
  readonly mask?: Float32Array;
  /**
   * Seconds over which actions already playing on the layer fade out when a new clip
   * replaces them (anim-phys-03). `0` (default) stops them at once.
   */
  readonly fadeOutPrevious?: number;
};

type FadeState = {
  readonly startTime: number;
  readonly duration: number;
  readonly from: number;
  readonly to: number;
} | null;

type WarpState = {
  readonly duration: number;
  elapsed: number;
  readonly from: number;
  readonly to: number;
} | null;

type WarpSnapshot = {
  readonly startTime: number;
  readonly duration: number;
  readonly from: number;
  readonly to: number;
  /** Present when mixer-time subtraction cannot exactly represent the action-local progress. */
  readonly elapsed?: number;
} | null;

type TimeScaleSegment = {
  /** Elapsed mixer time from the beginning of this update, independent of its sign. */
  readonly startOffset: number;
  readonly duration: number;
  readonly from: number;
  readonly to: number;
  readonly distance: number;
};

/** JSON-safe state of a pose action, including its independently owned playback clock. */
export type PoseActionSnapshot = {
  readonly version: 1;
  /** Registration key, which need not equal the source clip's own name. */
  readonly clipName: string;
  readonly compiledIdentity: string;
  readonly targetIdentity: string;
  readonly mixerTime: number;
  readonly playback: AnimationActionSnapshot;
  readonly bindings: readonly TrackBinding[];
  readonly cursors: readonly number[];
  readonly additive: boolean;
  readonly weight: number;
  readonly timeScale: number;
  readonly enabled: boolean;
  readonly syncGroupName: string | null;
  readonly fade: FadeState;
  readonly warp: WarpSnapshot;
  readonly restoreTimeScale: number | null;
  readonly effectiveWeight: number;
  readonly effectiveTimeScale: number;
  readonly layerMask: readonly number[] | null;
  readonly layerBlendMode: "override" | "additive" | null;
};

type PoseBufferSnapshot = {
  readonly positions: readonly number[];
  readonly rotations: readonly number[];
  readonly scales: readonly number[];
};

type PoseSkeletonSnapshot = {
  readonly jointNames: readonly string[];
  readonly parentIndices: readonly number[];
  readonly missingJointSlots: readonly boolean[];
  readonly nameBindings: readonly { readonly name: string; readonly indices: readonly number[] }[];
  readonly restPose: PoseBufferSnapshot;
};

type PoseMixerActionSnapshot = {
  readonly action: PoseActionSnapshot;
  /** Index into the mixer mask pool, preserving sharing between layers/actions. */
  readonly mask: number | null;
};

export type PoseMixerSnapshot = {
  readonly version: 1;
  readonly time: number;
  readonly timeScale: number;
  /** `null` represents an unrepresentably large event overflow. */
  readonly lastEventOverflow: number | null;
  readonly lastDt: number;
  readonly target: PoseSkeletonSnapshot;
  /** All registered clips are external assets that must be rebound by name and content. */
  readonly clips: readonly {
    readonly name: string;
    readonly sourceIdentity: string;
    readonly compiledIdentity: string;
    readonly additive: boolean;
  }[];
  readonly masks: readonly (readonly number[])[];
  readonly actions: readonly PoseMixerActionSnapshot[];
  readonly layers: readonly {
    readonly name: string;
    readonly blendMode: "override" | "additive";
    readonly weight: number;
    readonly mask: number | null;
    readonly actions: readonly PoseMixerActionSnapshot[];
  }[];
  /** Inertializer history is supported, but an active transition is not. */
  readonly inertializer: null | {
    readonly latestPose: PoseBufferSnapshot | null;
    readonly previousPose: PoseBufferSnapshot | null;
    readonly halfLife: number;
  };
};

export type PoseMixerSerializeOptions = { readonly externalTarget?: "rebind" };

export class PoseAction {
  readonly mixer: PoseMixer;
  readonly clipName: string;
  readonly clip: CompiledClip;
  readonly bindings: readonly TrackBinding[];
  readonly cursors: CompiledTrackCursor;
  readonly additive: boolean;
  private readonly playback: AnimationAction;
  weight = 1;
  timeScale = 1;
  enabled = true;
  syncGroupName: string | null = null;
  private fade: FadeState = null;
  private warpState: WarpState = null;
  private restoreTimeScale: number | null = null;
  effectiveWeight = 0;
  effectiveTimeScale = 0;
  /**
   * Per-bone weights this action was started with on a named layer (anim-phys-03): a clip
   * fading out keeps the mask it played through while its replacement uses the new one.
   */
  layerMask: Float32Array | null = null;
  /** Blend mode of the layer when this action started on it (see `layerMask`). */
  layerBlendMode: "override" | "additive" | null = null;

  constructor(mixer: PoseMixer, clipName: string, clip: CompiledClip, options: PoseActionOptions = {}) {
    this.mixer = mixer;
    this.clipName = clipName;
    this.clip = clip;
    this.bindings = mixer.resolveBindings(clip);
    this.cursors = createTrackCursors(clip);
    const source = mixer.sourceClip(clipName);
    if (source === undefined) throw new Error(`ANIMATION_CLIP_NOT_FOUND: clip "${clipName}" is not registered.`);
    this.playback = new AnimationAction(source);
    this.additive = options.additive ?? (source !== undefined && isClipAdditive(source));
    this.setEffectiveWeight(options.weight ?? 1);
    this.setEffectiveTimeScale(options.timeScale ?? 1);
    this.setLoop(options.loopMode ?? "repeat", options.repetitions ?? Infinity);
    this.clampWhenFinished = options.clampWhenFinished ?? false;
    this.syncGroupName = options.syncGroup ?? null;
  }

  get time(): number { return this.playback.time; }
  set time(value: number) { this.playback.time = value; }
  get playing(): boolean { return this.playback.playing; }
  set playing(value: boolean) { this.playback.playing = value; }
  get paused(): boolean { return this.playback.paused; }
  set paused(value: boolean) { this.playback.paused = value; }
  get loopMode(): PoseLoopMode { return this.playback.loopMode; }
  set loopMode(value: PoseLoopMode) { this.playback.loopMode = value; }
  get repetitions(): number { return this.playback.repetitions; }
  set repetitions(value: number) { this.playback.repetitions = value; }
  get clampWhenFinished(): boolean { return this.playback.clampWhenFinished; }
  set clampWhenFinished(value: boolean) { this.playback.clampWhenFinished = value; }
  get lastPlaybackDelta(): number { return this.playback.lastPlaybackDelta; }
  /** @internal The core clip, rather than an independently compiled clip, owns playback. */
  get hasPlaybackDuration(): boolean { return this.playback.clip.duration > 0; }
  /** Maximum markers retained by a single update; excess crossings are reported by the mixer. */
  get maxEventCatchUp(): number { return this.playback.maxEventCatchUp; }
  set maxEventCatchUp(value: number) { this.playback.maxEventCatchUp = value; }

  play(): this {
    this.mixer.activate(this);
    this.playback.play();
    this.enabled = true;
    return this;
  }

  stop(): this {
    this.playback.stop();
    this.fade = null;
    this.warpState = null;
    this.restoreTimeScale = null;
    this.effectiveWeight = 0;
    this.effectiveTimeScale = 0;
    this.mixer.deactivate(this);
    return this;
  }

  pause(): this {
    this.playback.pause();
    return this;
  }

  setEffectiveWeight(weight: number): this {
    if (!Number.isFinite(weight) || weight < 0) throw new Error("PoseAction weight must be finite and non-negative.");
    this.weight = weight;
    return this;
  }

  setEffectiveTimeScale(timeScale: number): this {
    if (!Number.isFinite(timeScale)) throw new Error("PoseAction timeScale must be finite.");
    this.timeScale = timeScale;
    return this;
  }

  setLoop(mode: PoseLoopMode, repetitions = Infinity): this {
    this.playback.setLoop(mode, repetitions);
    return this;
  }

  /** three r185 syncWith: copy time + timeScale and stop any warping. */
  syncWith(other: PoseAction): this {
    this.playback.synchronizePlayback(other.playback);
    this.timeScale = other.timeScale;
    this.stopWarping();
    return this;
  }

  /** Align the starting phase and reflection direction without changing this action's rate. */
  synchronizePhaseWith(other: PoseAction): void {
    this.playback.synchronizePlayback(other.playback, true);
  }

  fadeIn(duration: number): this {
    return this.scheduleFade(duration, 0, this.weight);
  }

  fadeOut(duration: number): this {
    return this.scheduleFade(duration, this.currentWeight(this.mixer.time), 0);
  }

  fadeTo(weight: number, duration: number): this {
    return this.scheduleFade(duration, this.currentWeight(this.mixer.time), weight);
  }

  /** Linearly change the signed playback rate over unpaused mixer time. */
  warp(startTimeScale: number, endTimeScale: number, duration: number): this {
    if (![startTimeScale, endTimeScale, duration].every(Number.isFinite) ||
        !Number.isFinite(endTimeScale - startTimeScale) || duration < 0) {
      throw new Error("PoseAction warp rates and duration must be finite and duration non-negative.");
    }
    if (duration === 0) {
      this.warpState = null;
      this.timeScale = this.restoreTimeScale ?? endTimeScale;
      this.restoreTimeScale = null;
      return this;
    }
    this.warpState = { duration, elapsed: 0, from: startTimeScale, to: endTimeScale };
    return this;
  }

  stopWarping(): this {
    this.warpState = null;
    this.restoreTimeScale = null;
    return this;
  }

  /** True while a fade towards weight 0 is scheduled (fadeOut, crossFadeFrom, stopLayer). */
  get fadingOut(): boolean {
    return this.fade !== null && this.fade.to === 0;
  }

  stopFading(): this {
    this.fade = null;
    return this;
  }

  /** three r185 crossFadeFrom(this=fadeIn, fadeOut, duration, warp). */
  crossFadeFrom(fadeOutAction: PoseAction, duration: number, warp = false): this {
    fadeOutAction.fadeOut(duration);
    this.fadeIn(duration);
    if (warp) {
      const fadeInDuration = this.clip.duration;
      const fadeOutDuration = fadeOutAction.clip.duration;
      const startEndRatio = fadeInDuration === 0 ? 1 : fadeOutDuration / fadeInDuration;
      const endStartRatio = fadeOutDuration === 0 ? 1 : fadeInDuration / fadeOutDuration;
      fadeOutAction.restoreTimeScale = fadeOutAction.timeScale;
      this.restoreTimeScale = this.timeScale;
      fadeOutAction.warp(fadeOutAction.timeScale, fadeOutAction.timeScale * startEndRatio, duration);
      this.warp(this.timeScale * endStartRatio, this.timeScale, duration);
    }
    return this;
  }

  crossFadeTo(fadeInAction: PoseAction, duration: number, warp = false): PoseAction {
    return fadeInAction.crossFadeFrom(this, duration, warp);
  }

  get normalizedPhase(): number {
    return this.clip.duration > 0 ? this.time / this.clip.duration : 0;
  }

  /** A complete, JSON-safe snapshot; unlike a time/weight diagnostic it can be restored. */
  snapshot(): PoseActionSnapshot {
    return this.serialize();
  }

  /**
   * Capture both the core playback state and the pose-specific envelopes,
   * synchronization, bindings and layer state. Clip data and executable
   * callbacks are not copied; their identities must be rebound on restore.
   */
  serialize(): PoseActionSnapshot {
    this.mixer.assertSnapshotOperation("serialize");
    assertPoseActionData(this);
    assertPosePlaybackData(this.playback);
    const currentWarp = this.warpState;
    const startTime = currentWarp === null ? 0 : this.mixer.time - currentWarp.elapsed;
    const warp: WarpSnapshot = currentWarp === null ? null : {
      startTime,
      duration: currentWarp.duration,
      from: currentWarp.from,
      to: currentWarp.to,
      ...(this.mixer.time - startTime === currentWarp.elapsed ? {} : { elapsed: currentWarp.elapsed })
    };
    const snapshot: PoseActionSnapshot = {
      version: 1,
      clipName: this.clipName,
      compiledIdentity: poseCompiledIdentity(this.clip),
      targetIdentity: JSON.stringify(capturePoseSkeleton(this.mixer.skeleton)),
      mixerTime: this.mixer.time,
      playback: this.playback.serialize(),
      bindings: readPoseBindings(this.bindings, this.mixer.skeleton.boneCount, this.clip.tracks.length),
      cursors: readPoseTypedNumbers(this.cursors, Uint32Array, this.clip.tracks.length, "action cursors"),
      additive: this.additive,
      weight: this.weight,
      timeScale: this.timeScale,
      enabled: this.enabled,
      syncGroupName: this.syncGroupName,
      fade: readPoseEnvelope(this.fade, "fade", true),
      warp: readPoseWarp(warp),
      restoreTimeScale: this.restoreTimeScale,
      effectiveWeight: this.effectiveWeight,
      effectiveTimeScale: this.effectiveTimeScale,
      layerMask: this.layerMask === null ? null : readPoseTypedNumbers(this.layerMask, Float32Array, this.mixer.skeleton.boneCount, "action mask"),
      layerBlendMode: this.layerBlendMode
    };
    this.prepareRestore(snapshot, this.mixer.time);
    rejectPoseNegativeZero(snapshot);
    return snapshot;
  }

  /**
   * Restore in place without playing, dispatching events or registering the
   * action. Its existing mixer membership is unchanged. Envelopes are rebased
   * to the destination mixer's current clock.
   */
  restore(snapshot: PoseActionSnapshot): this {
    return this.restoreAtMixerTime(snapshot, this.mixer.time);
  }

  /** @internal Stage a restored action against the clock a mixer will commit. */
  restoreAtMixerTime(snapshot: PoseActionSnapshot, targetTime: number): this {
    this.mixer.assertSnapshotOperation("restore");
    this.assertRestoreWritable();
    const state = this.prepareRestore(snapshot, targetTime);
    const layerMask = state.layerMask === null ? null : new Float32Array(state.layerMask);
    this.playback.restore(state.playback);
    this.weight = state.weight;
    this.timeScale = state.timeScale;
    this.enabled = state.enabled;
    this.syncGroupName = state.syncGroupName;
    this.fade = state.fade;
    this.warpState = state.warp === null ? null : {
      duration: state.warp.duration,
      elapsed: state.warp.elapsed!,
      from: state.warp.from,
      to: state.warp.to
    };
    this.restoreTimeScale = state.restoreTimeScale;
    this.effectiveWeight = state.effectiveWeight;
    this.effectiveTimeScale = state.effectiveTimeScale;
    this.layerMask = layerMask;
    this.layerBlendMode = state.layerBlendMode;
    this.cursors.set(state.cursors);
    return this;
  }

  private prepareRestore(input: PoseActionSnapshot, targetTime: number): PoseActionSnapshot {
    const keys = [
      "version", "clipName", "compiledIdentity", "targetIdentity", "mixerTime", "playback", "bindings", "cursors",
      "additive", "weight", "timeScale", "enabled", "syncGroupName", "fade", "warp",
      "restoreTimeScale", "effectiveWeight", "effectiveTimeScale", "layerMask", "layerBlendMode"
    ];
    const record = poseRecord(input, "action snapshot", keys);
    if (record.version !== 1) throw new Error("PoseAction.restore: unsupported snapshot version.");
    if (record.clipName !== this.clipName || typeof record.compiledIdentity !== "string" ||
        record.compiledIdentity !== poseCompiledIdentity(this.clip)) {
      throw new Error("PoseAction.restore: registered clip or compiled clip identity does not match.");
    }
    if (typeof record.targetIdentity !== "string" ||
        record.targetIdentity !== JSON.stringify(capturePoseSkeleton(this.mixer.skeleton))) {
      throw new Error("PoseAction.restore: rebound skeleton target does not match.");
    }
    const mixerTime = poseNumber(record.mixerTime, "action mixerTime");
    const nextTime = poseNumber(targetTime, "destination mixerTime");
    const shift = nextTime - mixerTime;
    if (!Number.isFinite(shift)) throw new Error("PoseAction.restore: mixer clock offset is not finite.");
    const playbackRecord = poseRecord(record.playback, "core playback", [
      "clipName", "duration", "time", "weight", "timeScale", "playing", "paused", "loopMode", "state", "active"
    ], ["clipName", "duration", "time", "weight", "timeScale", "playing", "paused", "loopMode", "state"]);
    if (playbackRecord.state === undefined) throw new Error("PoseAction.restore: versioned core playback state is required.");
    // Validation takes place on a temporary action before any live state changes.
    const playback = new AnimationAction(this.playback.clip).restore(record.playback as AnimationActionSnapshot).serialize();
    const bindings = readPoseBindings(record.bindings, this.mixer.skeleton.boneCount, this.clip.tracks.length);
    const currentBindings = readPoseBindings(this.bindings, this.mixer.skeleton.boneCount, this.clip.tracks.length);
    if (JSON.stringify(bindings) !== JSON.stringify(currentBindings)) {
      throw new Error("PoseAction.restore: target bindings do not match the rebound skeleton.");
    }
    const cursors = readPoseNumberArray(record.cursors, this.clip.tracks.length, "action cursors")
      .map(value => {
        if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new Error("PoseAction.restore: invalid track cursor.");
        return value;
      });
    const additive = poseBoolean(record.additive, "action additive");
    if (additive !== this.additive) throw new Error("PoseAction.restore: additive mode does not match.");
    const syncGroupName = record.syncGroupName;
    if (syncGroupName !== null && typeof syncGroupName !== "string") throw new Error("PoseAction.restore: invalid synchronization group.");
    const fade = rebasePoseEnvelope(readPoseEnvelope(record.fade, "fade", true), shift);
    const capturedWarp = readPoseWarp(record.warp);
    let warp: WarpSnapshot = null;
    if (capturedWarp !== null) {
      const elapsed = capturedWarp.elapsed ?? Math.max(0, Math.min(capturedWarp.duration, mixerTime - capturedWarp.startTime));
      if (!Number.isFinite(elapsed)) throw new Error("PoseAction.restore: invalid warp elapsed time.");
      const rebased = rebasePoseEnvelope(capturedWarp, shift)!;
      warp = { ...rebased, elapsed };
    }
    const restoreTimeScale = record.restoreTimeScale === null ? null : poseNumber(record.restoreTimeScale, "restoreTimeScale");
    if (restoreTimeScale !== null && warp === null) throw new Error("PoseAction.restore: restoreTimeScale requires a scheduled warp.");
    const layerBlendMode = record.layerBlendMode;
    if (layerBlendMode !== null && layerBlendMode !== "override" && layerBlendMode !== "additive") {
      throw new Error("PoseAction.restore: invalid layer blend mode.");
    }
    const layerMask = record.layerMask === null ? null : readPoseFloatArray(record.layerMask, this.mixer.skeleton.boneCount, "action mask");
    const result: PoseActionSnapshot = {
      version: 1, clipName: this.clipName, compiledIdentity: record.compiledIdentity, targetIdentity: record.targetIdentity,
      mixerTime: nextTime, playback, bindings, cursors, additive,
      weight: poseNumber(record.weight, "action weight", 0),
      timeScale: poseNumber(record.timeScale, "action timeScale"),
      enabled: poseBoolean(record.enabled, "action enabled"),
      syncGroupName, fade, warp, restoreTimeScale,
      effectiveWeight: poseNumber(record.effectiveWeight, "action effectiveWeight", 0),
      effectiveTimeScale: poseNumber(record.effectiveTimeScale, "action effectiveTimeScale"),
      layerMask, layerBlendMode
    };
    rejectPoseNegativeZero(result);
    return result;
  }

  /** @internal Validate writable owned state before a mixer starts its commit. */
  assertRestoreWritable(): void {
    assertPoseActionData(this);
    assertPosePlaybackData(this.playback);
    assertPoseWritable(this, [
      "weight", "timeScale", "enabled", "syncGroupName", "fade", "warpState", "restoreTimeScale",
      "effectiveWeight", "effectiveTimeScale", "layerMask", "layerBlendMode"
    ], "action");
    assertPoseWritable(this.playback, [
      "time", "weight", "timeScale", "playing", "paused", "loopMode", "repetitions", "clampWhenFinished",
      "maxEventCatchUp", "pingPongForward", "loopsCompleted", "fadeDuration", "fadeElapsed",
      "fadeStartWeight", "fadeTargetWeight", "warpState", "lastPlaybackDelta", "signalLoopDelta",
      "signalFinishedDirection", "signalEventOverflow"
    ], "core playback");
    readPoseTypedNumbers(this.cursors, Uint32Array, this.clip.tracks.length, "action cursors");
  }

  /** @internal Stop an old handle without invoking overridable mixer callbacks. */
  retireForRestore(): void {
    AnimationAction.prototype.stop.call(this.playback);
    this.fade = null;
    this.warpState = null;
    this.restoreTimeScale = null;
    this.effectiveWeight = 0;
    this.effectiveTimeScale = 0;
  }

  /** @internal Advance only the part of a frame during which playback was active. */
  advanceWarp(elapsed: number): void {
    const warp = this.warpState;
    if (warp === null) return;
    // Mirror the core's per-segment accumulation, including rounding at a
    // rate reversal, rather than recomputing elapsed from the mixer clock.
    for (const segment of AnimationAction.warpSegments(elapsed, warp)) {
      if (segment.inWarp) warp.elapsed = Math.min(warp.duration, segment.elapsed + segment.duration);
    }
  }

  /** @internal A warp ending at zero pauses even when a sync leader keeps moving. */
  warpPauseOffset(): number | null {
    const warp = this.warpState;
    return warp !== null && (this.restoreTimeScale ?? warp.to) === 0
      ? Math.max(0, warp.duration - warp.elapsed)
      : null;
  }

  /** @internal Preserve the whole frame's signed travel across warp segments. */
  setPlaybackDelta(delta: number): void {
    this.playback.lastPlaybackDelta = delta;
  }

  private scheduleFade(duration: number, weightNow: number, weightThen: number): this {
    if (!Number.isFinite(duration) || duration < 0 || !Number.isFinite(weightThen) || weightThen < 0) {
      throw new Error("PoseAction fade weight and duration must be finite and non-negative.");
    }
    const now = this.mixer.time;
    if (duration <= 0) {
      this.fade = null;
      this.weight = weightThen;
      if (weightThen === 0) this.enabled = false;
      return this;
    }
    this.fade = { startTime: now, duration, from: weightNow, to: weightThen };
    return this;
  }

  private currentWeight(now: number): number {
    const fade = this.fade;
    if (fade === null) return this.weight;
    const t = Math.min(Math.max((now - fade.startTime) / fade.duration, 0), 1);
    return fade.from + (fade.to - fade.from) * t;
  }

  /** Effective weight at mixer.time, per r185 `_updateWeight`. */
  updateWeight(now: number): number {
    let weight = 0;
    if (this.enabled) {
      const fade = this.fade;
      weight = this.currentWeight(now);
      if (fade !== null) {
        const end = fade.startTime + fade.duration;
        if (now >= end) {
          this.fade = null;
          this.weight = fade.to;
          if (weight === 0) this.enabled = false;
        }
      }
    }
    this.effectiveWeight = weight;
    return weight;
  }

  /** Effective instantaneous rate, including a scheduled warp. */
  updateTimeScale(_now: number, finishPausedWarp = false): number {
    let timeScale = 0;
    if (!this.paused || finishPausedWarp) {
      let rate = this.timeScale;
      const warp = this.warpState;
      if (warp !== null) {
        const t = Math.min(warp.elapsed / warp.duration, 1);
        rate = warp.from + (warp.to - warp.from) * t;
        if (warp.elapsed >= warp.duration) {
          rate = this.restoreTimeScale ?? warp.to;
          this.timeScale = rate;
          if (rate === 0 && this.playing && !this.paused) {
            this.playback.pause();
          }
          this.warpState = null;
          this.restoreTimeScale = null;
        }
      }
      if (!this.paused) timeScale = rate;
    }
    this.effectiveTimeScale = timeScale;
    return timeScale;
  }

  /** Integrate each monotonic part of a warp, retaining any direction change. */
  integratedTimeScaleSegments(from: number, to: number): number[] {
    if (this.paused || to <= from) return [];
    if (!Number.isFinite(this.timeScale)) throw new Error("PoseAction timeScale must be finite.");
    const warp = this.warpState;
    if (warp === null) return this.integratedTimeScaleSpans(to - from).map(segment => segment.distance);
    // Keep this interval-query API relative to the current mixer clock. Actual
    // playback uses the local elapsed value directly, without subtracting clocks.
    const start = this.mixer.time - warp.elapsed;
    const segments: number[] = [];
    const beforeEnd = Math.min(to, start);
    if (beforeEnd > from) {
      const distance = (beforeEnd - from) * this.timeScale;
      if (distance !== 0) segments.push(distance);
    }
    const begin = Math.max(from, start);
    if (to > begin) {
      const elapsed = Math.max(0, Math.min(warp.duration, begin - start));
      for (const segment of AnimationAction.warpSegments(to - begin, { ...warp, elapsed })) {
        const rate = this.restoreTimeScale ?? segment.to;
        const distance = segment.inWarp ? segment.distance : segment.duration * (rate / 2 + rate / 2);
        if (distance !== 0) segments.push(distance);
      }
    }
    return segments;
  }

  /** @internal Use the same signed, action-local warp integration as core playback. */
  integratedTimeScaleSpans(delta: number): TimeScaleSegment[] {
    if (this.paused || delta === 0) return [];
    if (!Number.isFinite(delta)) throw new Error("PoseAction update delta must be finite.");
    if (!Number.isFinite(this.timeScale)) throw new Error("PoseAction timeScale must be finite.");
    const direction = delta < 0 ? -1 : 1;
    const warp = this.warpState;
    if (warp === null) {
      const distance = delta * this.timeScale;
      if (!Number.isFinite(distance)) throw new Error("PoseAction scaled playback span must be finite.");
      const rate = direction * this.timeScale;
      return [{ startOffset: 0, duration: Math.abs(delta), from: rate, to: rate, distance }];
    }
    let offset = 0;
    return AnimationAction.warpSegments(delta, warp).map(segment => {
      const restoredRate = !segment.inWarp ? this.restoreTimeScale : null;
      const from = direction * (restoredRate ?? segment.from);
      const to = direction * (restoredRate ?? segment.to);
      const distance = restoredRate === null
        ? segment.distance
        : direction * segment.duration * (restoredRate / 2 + restoredRate / 2);
      if (!Number.isFinite(distance)) {
        throw new Error("PoseAction warped playback span must be finite.");
      }
      const result = { startOffset: offset, duration: segment.duration, from, to, distance };
      offset += segment.duration;
      return result;
    });
  }

  /** Advance through the core action so signed playheads and marker boundaries agree. */
  updateTime(deltaTime: number): { wrapped: boolean; finished: boolean; previous: number; events: readonly AnimationEvent[]; eventOverflow: number } {
    const previous = this.time;
    // The caller has already applied both mixer and action rates.
    const events = this.playback.update(deltaTime);
    const signals = this.playback.consumePlaybackSignals();
    if (signals.finishedDirection !== 0 && !this.clampWhenFinished) this.enabled = false;
    return { wrapped: signals.loopDelta !== 0, finished: signals.finishedDirection !== 0, previous, events, eventOverflow: signals.eventOverflow };
  }
}

/** Stop synchronized travel at the follower's own warp-to-zero boundary. */
function limitTimeScaleSegments(segments: readonly TimeScaleSegment[], limit: number): TimeScaleSegment[] {
  const limited: TimeScaleSegment[] = [];
  for (const segment of segments) {
    if (segment.startOffset >= limit) break;
    if (segment.startOffset + segment.duration <= limit) {
      limited.push(segment);
      continue;
    }
    const duration = limit - segment.startOffset;
    const to = segment.from + (segment.to - segment.from) * (duration / segment.duration);
    const distance = duration * (segment.from / 2 + to / 2);
    if (!Number.isFinite(distance)) throw new Error("PoseAction limited playback span must be finite.");
    limited.push({ ...segment, duration, to, distance });
    break;
  }
  return limited;
}

/** Drop layer actions that stopped or finished fading out, so replaced clips do not pile up. */
function pruneFinishedLayerActions(layer: PoseLayer): void {
  for (let i = layer.actions.length - 1; i >= 0; i -= 1) {
    const action = layer.actions[i]!;
    if (action.playing && action.enabled) continue;
    if (action.playing) action.stop();
    layer.actions.splice(i, 1);
  }
}

export type PoseLayer = {
  readonly name: string;
  blendMode: "override" | "additive";
  /** Mask of the latest clip played on the layer; each action keeps its own in `layerMask`. */
  mask: Float32Array | null;
  /** Layer-wide multiplier (1). The `weight` option of `playLayer` is the action's weight. */
  weight: number;
  readonly actions: PoseAction[];
};

/**
 * Stateless blend spec for `evaluateSamples`: a clip sampled at an explicit
 * time with a weight, optional additive flag and optional per-bone weight
 * mask (aligned with `skeleton.jointNames`). No PoseAction is created or
 * mutated — this is the per-runtime "one-shot blend" mode T1.7 builds
 * `applyClips` on.
 */
export type PoseSampleSpec = {
  readonly clipName: string;
  readonly time: number;
  readonly weight?: number;
  readonly additive?: boolean;
  readonly mask?: Float32Array | null;
};

export class PoseMixer {
  readonly skeleton: SkeletonBinding;
  readonly inertializer: PoseInertializer | null;
  time = 0;
  /** Markers omitted by the catch-up bounds in the most recent update. */
  lastEventOverflow = 0;
  private timeScale = 1;
  private readonly clips = new Map<string, { source: AnimationClip; compiled: CompiledClip }>();
  private readonly actions: PoseAction[] = [];
  private readonly layers: PoseLayer[] = [];
  private readonly layerByName = new Map<string, PoseLayer>();
  private readonly eventListeners = new Set<(invocation: AnimationClipEventInvocation<AnimationClipEvent, string>) => void>();
  private disposed = false;
  private updateDepth = 0;
  private latestPose: PoseBuffer | null = null;
  private previousPose: PoseBuffer | null = null;
  private inertializerElapsed = Infinity;
  private inertializerHalfLife = 0.15;
  private scratchClip = new Float32Array(4);

  // §13 micro-budget — the accumulate paths must run in single-digit µs for a
  // 191-joint rig, so per-(bone,channel) state lives in flat arrays + touched
  // lists, not Maps: a Uint32Array push is ~1ns where Map.get/set ~50ns each
  // was the whole 60 µs budget on its own.
  private readonly accWeight: Float32Array;
  private readonly addWeight: Float32Array;
  private readonly addQuat: Float32Array;
  private readonly addVec: Float32Array;
  private readonly accTouched: Uint32Array;
  private readonly addTouched: Uint32Array;
  private accTouchedCount = 0;
  private addTouchedCount = 0;

  constructor(options: { skeleton: SkeletonBinding; inertializer?: PoseInertializer }) {
    this.skeleton = options.skeleton;
    this.inertializer = options.inertializer ?? null;
    const slots = this.skeleton.boneCount * 3;
    this.accWeight = new Float32Array(slots);
    this.addWeight = new Float32Array(slots);
    this.addQuat = new Float32Array(slots * 4);
    this.addVec = new Float32Array(slots * 3);
    this.accTouched = new Uint32Array(slots);
    this.addTouched = new Uint32Array(slots);
  }

  private resetAccumulators(): void {
    for (let i = 0; i < this.accTouchedCount; i += 1) this.accWeight[this.accTouched[i]!] = 0;
    for (let i = 0; i < this.addTouchedCount; i += 1) this.addWeight[this.addTouched[i]!] = 0;
    this.accTouchedCount = 0;
    this.addTouchedCount = 0;
  }

  setEffectiveTimeScale(timeScale: number): this {
    this.assertAlive();
    if (!Number.isFinite(timeScale)) throw new Error("PoseMixer timeScale must be finite.");
    this.timeScale = timeScale;
    return this;
  }

  get effectiveTimeScale(): number {
    return this.timeScale;
  }

  /** @internal Reject snapshots taken while an update is traversing callbacks. */
  assertSnapshotOperation(operation: "serialize" | "restore"): void {
    this.assertAlive();
    if (this.updateDepth !== 0) throw new Error(`PoseMixer.${operation}: cannot ${operation} during an update.`);
  }

  /** Register a clip under a name (compiles it for flat sampling). */
  addClip(name: string, clip: AnimationClip): this {
    this.assertAlive();
    this.clips.set(name, { source: clip, compiled: compileClip(clip) });
    return this;
  }

  /** Register a pre-compiled clip (returns undefined if unknown). */
  addCompiledClip(name: string, compiled: CompiledClip, source: AnimationClip): this {
    this.assertAlive();
    this.clips.set(name, { source, compiled });
    return this;
  }

  sourceClip(name: string): AnimationClip | undefined {
    return this.clips.get(name)?.source;
  }

  clipAction(name: string, options: PoseActionOptions = {}): PoseAction {
    this.assertAlive();
    const entry = this.clips.get(name);
    if (!entry) {
      throw new Error(`ANIMATION_CLIP_NOT_FOUND: clip "${name}" is not registered. Available: ${[...this.clips.keys()].join(", ")}`);
    }
    return new PoseAction(this, name, entry.compiled, options);
  }

  /** three r185 play: activate + begin (starts faded-in when `crossFade`). */
  play(name: string, options: PoseActionOptions = {}): PoseAction {
    const action = this.clipAction(name, options);
    action.play();
    return action;
  }

  /**
   * Every currently-playing, enabled action across the base layer and named
   * layers — the set `update`/`evaluate` will contribute this frame (T1.9
   * uses it to sample non-pose tracks at each action's own clock/weight and
   * to compute covered-bone sets for `restPoseReset: false`).
   */
  activeActions(): readonly PoseAction[] {
    this.assertAlive();
    const all: PoseAction[] = [];
    for (const action of this.actions) {
      if (action.playing && action.enabled) all.push(action);
    }
    for (const layer of this.layers) {
      for (const action of layer.actions) {
        if (action.playing && action.enabled) all.push(action);
      }
    }
    return all;
  }

  /** The active base (non-additive, base-layer) action, or null when none plays. */
  baseAction(): PoseAction | null {
    return this.activeBaseAction();
  }

  /**
   * Same active set as {@link activeActions} annotated with the owning layer
   * name — `""` for the base layer — for `animationState()` snapshots (C-37).
   */
  activeActionEntries(): readonly { readonly action: PoseAction; readonly layer: string }[] {
    this.assertAlive();
    const all: { action: PoseAction; layer: string }[] = [];
    for (const action of this.actions) {
      if (action.playing && action.enabled) all.push({ action, layer: "" });
    }
    for (const layer of this.layers) {
      for (const action of layer.actions) {
        if (action.playing && action.enabled) all.push({ action, layer: layer.name });
      }
    }
    return all;
  }

  /** Strict, restorable snapshot; the external skeleton must be acknowledged. */
  snapshot(options: PoseMixerSerializeOptions = {}): PoseMixerSnapshot {
    return this.serialize(options);
  }

  /**
   * Capture mixer-owned state only. The caller must rebind an equivalent
   * skeleton and matching registered clips; event listeners must be removed and
   * reattached explicitly. Active inertializer transitions cannot yet be
   * serialized because their captured velocities are externally owned.
   */
  serialize(options: PoseMixerSerializeOptions = {}): PoseMixerSnapshot {
    this.assertSnapshotOperation("serialize");
    this.assertGraphData();
    const captureOptions = poseRecord(options, "serialization options", ["externalTarget"], []);
    if (captureOptions.externalTarget !== "rebind") {
      throw new Error("PoseMixer.serialize: the external skeleton target requires externalTarget: 'rebind'.");
    }
    if (this.eventListeners.size !== 0) {
      throw new Error("PoseMixer.serialize: event callbacks/listeners cannot be serialized; unsubscribe and reattach them explicitly.");
    }
    if (this.inertializer !== null) assertPoseInertializerData(this.inertializer, this.skeleton.boneCount);
    if (this.inertializer !== null && (this.inertializer.active || this.inertializerElapsed !== Infinity)) {
      throw new Error("PoseMixer.serialize: active inertializer transitions cannot be serialized.");
    }
    const masks: number[][] = [];
    const indices = new Map<Float32Array, number>();
    const seenActions = new Set<PoseAction>();
    const maskIndex = (mask: Float32Array | null): number | null => {
      if (mask === null) return null;
      const existing = indices.get(mask);
      if (existing !== undefined) return existing;
      const index = masks.length;
      masks.push(readPoseTypedNumbers(mask, Float32Array, this.skeleton.boneCount, "layer mask"));
      indices.set(mask, index);
      return index;
    };
    const captureAction = (action: PoseAction): PoseMixerActionSnapshot => {
      if (seenActions.has(action)) throw new Error("PoseMixer.serialize: an action belongs to more than one mixer layer.");
      if (!(action instanceof PoseAction)) throw new Error("PoseMixer.serialize: invalid action.");
      assertPoseActionData(action);
      if (action.mixer !== this) throw new Error("PoseMixer.serialize: action belongs to another mixer.");
      seenActions.add(action);
      return { action: action.serialize(), mask: maskIndex(action.layerMask) };
    };
    const snapshot: PoseMixerSnapshot = {
      version: 1,
      time: this.time,
      timeScale: this.timeScale,
      lastEventOverflow: this.lastEventOverflow === Infinity ? null : this.lastEventOverflow,
      lastDt: this.lastDt,
      target: capturePoseSkeleton(this.skeleton),
      clips: this.captureClipCatalog(),
      masks,
      actions: this.actions.map(captureAction),
      layers: this.layers.map(layer => ({
        name: layer.name,
        blendMode: layer.blendMode,
        weight: layer.weight,
        mask: maskIndex(layer.mask),
        actions: layer.actions.map(captureAction)
      })),
      inertializer: this.inertializer === null ? null : {
        latestPose: this.latestPose === null ? null : capturePoseBuffer(this.latestPose, this.skeleton.boneCount, "latest pose"),
        previousPose: this.previousPose === null ? null : capturePoseBuffer(this.previousPose, this.skeleton.boneCount, "previous pose"),
        halfLife: this.inertializerHalfLife
      }
    };
    this.prepareRestore(snapshot);
    rejectPoseNegativeZero(snapshot);
    return snapshot;
  }

  /**
   * Atomically rebind to this mixer's skeleton and registered clips. No pose or
   * callbacks are applied. Existing actions are stopped and replaced; callers
   * should reacquire action handles via activeActions()/activeActionEntries().
   * Existing destination listeners remain attached.
   */
  restore(snapshot: PoseMixerSnapshot): this {
    this.assertSnapshotOperation("restore");
    this.assertGraphData();
    const plan = this.prepareRestore(snapshot);
    assertPoseWritable(this, [
      "time", "timeScale", "lastEventOverflow", "lastDt", "latestPose", "previousPose",
      "inertializerHalfLife", "inertializerElapsed"
    ], "mixer");
    assertPoseMutableArray(this.actions, "existing base actions");
    assertPoseMutableArray(this.layers, "existing layers");
    if (Object.getPrototypeOf(this.layerByName) !== Map.prototype || Reflect.ownKeys(this.layerByName).length !== 0) {
      throw new Error("PoseMixer.restore: existing layer index contains unsupported callbacks or properties.");
    }
    const previous = new Set<PoseAction>(this.actions);
    for (const layer of this.layers) {
      const record = poseRecord(layer, "existing layer", ["name", "blendMode", "mask", "weight", "actions"]);
      for (const action of poseArray(record.actions, "existing layer actions")) previous.add(action as PoseAction);
    }
    for (const action of previous) {
      if (!(action instanceof PoseAction)) {
        throw new Error("PoseMixer.restore: existing action belongs to another mixer or is invalid.");
      }
      assertPoseActionData(action);
      if (action.mixer !== this) throw new Error("PoseMixer.restore: existing action belongs to another mixer.");
      action.assertRestoreWritable();
    }
    for (const action of previous) PoseAction.prototype.retireForRestore.call(action);
    this.actions.length = 0;
    for (const action of plan.actions) this.actions.push(action);
    this.layers.length = 0;
    for (const layer of plan.layers) this.layers.push(layer);
    this.layerByName.clear();
    for (const layer of plan.layers) this.layerByName.set(layer.name, layer);
    this.time = plan.time;
    this.timeScale = plan.timeScale;
    this.lastEventOverflow = plan.lastEventOverflow;
    this.lastDt = plan.lastDt;
    this.latestPose = plan.latestPose;
    this.previousPose = plan.previousPose;
    this.inertializerHalfLife = plan.halfLife;
    this.inertializerElapsed = Infinity;
    return this;
  }

  private prepareRestore(input: PoseMixerSnapshot): PoseMixerRestorePlan {
    const record = poseRecord(input, "mixer snapshot", [
      "version", "time", "timeScale", "lastEventOverflow", "lastDt", "target", "clips", "masks", "actions", "layers", "inertializer"
    ]);
    if (record.version !== 1) throw new Error("PoseMixer.restore: unsupported snapshot version.");
    const time = poseNumber(record.time, "mixer time");
    const timeScale = poseNumber(record.timeScale, "mixer timeScale");
    const lastDt = poseNumber(record.lastDt, "lastDt", 0);
    const lastEventOverflow = record.lastEventOverflow === null
      ? Infinity : poseNumber(record.lastEventOverflow, "lastEventOverflow", 0);
    if (lastEventOverflow !== Infinity && !Number.isInteger(lastEventOverflow)) {
      throw new Error("PoseMixer.restore: invalid event overflow.");
    }
    const target = readPoseSkeleton(record.target, this.skeleton.boneCount);
    if (JSON.stringify(target) !== JSON.stringify(capturePoseSkeleton(this.skeleton))) {
      throw new Error("PoseMixer.restore: rebound skeleton target does not match.");
    }
    const clips = readPoseClipCatalog(record.clips);
    if (JSON.stringify(clips) !== JSON.stringify(this.captureClipCatalog())) {
      throw new Error("PoseMixer.restore: registered source/compiled clip catalog or identity does not match.");
    }
    const masks = poseArray(record.masks, "masks").map((mask, index) =>
      new Float32Array(readPoseFloatArray(mask, this.skeleton.boneCount, `mask ${index}`)));
    const usedMasks = new Set<number>();
    const maskAt = (value: unknown): Float32Array | null => {
      if (value === null) return null;
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value >= masks.length) {
        throw new Error("PoseMixer.restore: invalid mask reference.");
      }
      usedMasks.add(value);
      return masks[value]!;
    };
    const restoreAction = (inputAction: unknown): PoseAction => {
      const wrapper = poseRecord(inputAction, "mixer action", ["action", "mask"]);
      const actionRecord = poseRecord(wrapper.action, "action snapshot", [
        "version", "clipName", "compiledIdentity", "targetIdentity", "mixerTime", "playback", "bindings", "cursors",
        "additive", "weight", "timeScale", "enabled", "syncGroupName", "fade", "warp",
        "restoreTimeScale", "effectiveWeight", "effectiveTimeScale", "layerMask", "layerBlendMode"
      ]);
      if (typeof actionRecord.clipName !== "string" || typeof actionRecord.additive !== "boolean") {
        throw new Error("PoseMixer.restore: invalid action clip or additive mode.");
      }
      if (actionRecord.mixerTime !== time) throw new Error("PoseMixer.restore: action and mixer clocks do not match.");
      const action = this.clipAction(actionRecord.clipName, { additive: actionRecord.additive });
      action.restoreAtMixerTime(wrapper.action as PoseActionSnapshot, time);
      const mask = maskAt(wrapper.mask);
      if ((mask === null) !== (action.layerMask === null) ||
          (mask !== null && JSON.stringify([...mask]) !== JSON.stringify([...action.layerMask!]))) {
        throw new Error("PoseMixer.restore: action mask does not match its mask reference.");
      }
      action.layerMask = mask;
      return action;
    };
    const actions = poseArray(record.actions, "base actions").map(restoreAction);
    const names = new Set<string>();
    const layers: PoseLayer[] = poseArray(record.layers, "layers").map(inputLayer => {
      const layer = poseRecord(inputLayer, "layer", ["name", "blendMode", "weight", "mask", "actions"]);
      if (typeof layer.name !== "string" || names.has(layer.name)) throw new Error("PoseMixer.restore: invalid or duplicate layer name.");
      names.add(layer.name);
      if (layer.blendMode !== "override" && layer.blendMode !== "additive") throw new Error("PoseMixer.restore: invalid layer blend mode.");
      return {
        name: layer.name,
        blendMode: layer.blendMode,
        weight: poseNumber(layer.weight, "layer weight", 0),
        mask: maskAt(layer.mask),
        actions: poseArray(layer.actions, "layer actions").map(restoreAction)
      };
    });
    if (usedMasks.size !== masks.length) throw new Error("PoseMixer.restore: unreferenced mask data.");
    let latestPose: PoseBuffer | null = null;
    let previousPose: PoseBuffer | null = null;
    let halfLife = 0.15;
    if ((record.inertializer === null) !== (this.inertializer === null)) {
      throw new Error("PoseMixer.restore: rebound inertializer configuration does not match.");
    }
    if (record.inertializer !== null) {
      assertPoseInertializerData(this.inertializer!, this.skeleton.boneCount);
      if (this.inertializer!.active || this.inertializerElapsed !== Infinity) {
        throw new Error("PoseMixer.restore: active inertializer transitions cannot be replaced.");
      }
      const history = poseRecord(record.inertializer, "inertializer history", ["latestPose", "previousPose", "halfLife"]);
      latestPose = history.latestPose === null ? null : restorePoseBuffer(history.latestPose, this.skeleton.boneCount, "latest pose");
      previousPose = history.previousPose === null ? null : restorePoseBuffer(history.previousPose, this.skeleton.boneCount, "previous pose");
      halfLife = poseNumber(history.halfLife, "inertializer halfLife");
    }
    rejectPoseNegativeZero(input);
    return { time, timeScale, lastEventOverflow, lastDt, actions, layers, latestPose, previousPose, halfLife };
  }

  private assertGraphData(): void {
    poseArray(this.actions, "existing base actions");
    const layers = poseArray(this.layers, "existing layers");
    if (Object.getPrototypeOf(this.layerByName) !== Map.prototype || Reflect.ownKeys(this.layerByName).length !== 0 ||
        this.layerByName.size !== layers.length) {
      throw new Error("PoseMixer: layer index contains unsupported or inconsistent state.");
    }
    for (const input of layers) {
      const layer = poseRecord(input, "existing layer", ["name", "blendMode", "mask", "weight", "actions"]);
      if (typeof layer.name !== "string" || this.layerByName.get(layer.name) !== input) {
        throw new Error("PoseMixer: layer index does not match layer membership.");
      }
      poseArray(layer.actions, "existing layer actions");
    }
  }

  private captureClipCatalog(): PoseMixerSnapshot["clips"] {
    if (Object.getPrototypeOf(this.clips) !== Map.prototype || Reflect.ownKeys(this.clips).length !== 0) {
      throw new Error("PoseMixer.serialize: clip registry contains unsupported callbacks or properties.");
    }
    const clips = [...this.clips].map(([name, input]) => {
      if (typeof name !== "string") throw new Error("PoseMixer.serialize: invalid registered clip name.");
      const entry = poseRecord(input, "registered clip", ["source", "compiled"]);
      const source = entry.source;
      assertPoseSourceClip(source);
      const playback = new AnimationAction(source).serialize();
      return {
        name,
        sourceIdentity: playback.state!.clipIdentity!,
        compiledIdentity: poseCompiledIdentity(entry.compiled as CompiledClip),
        additive: isClipAdditive(source)
      };
    });
    return readPoseClipCatalog(clips);
  }

  /**
   * `crossFadeTo(clip, seconds, options)` — mirrors `node.play` semantics:
   * the current active base action fades out over `seconds` (default driven by
   * caller), the new one fades in; `warp` warps timescales by the duration
   * ratio; `transition: "inertialize"` captures pose offsets instead.
   */
  crossFadeTo(name: string, seconds: number, options: PoseCrossFadeOptions = {}): PoseAction {
    const transition = options.transition ?? "crossfade";
    const fadeIn = this.clipAction(name, {
      syncGroup: options.syncGroup,
      weight: options.weight,
      additive: options.additive
    });
    const current = this.activeBaseAction();

    if (transition === "inertialize" && this.inertializer !== null && this.latestPose !== null && this.previousPose !== null) {
      const dt = this.lastDt > 0 ? this.lastDt : 1 / 60;
      this.inertializer.transition(this.latestPose, this.previousPose, dt, options.halfLife ?? 0.15);
      this.inertializerElapsed = 0;
      this.inertializerHalfLife = options.halfLife ?? 0.15;
      if (current !== null) current.stop();
      fadeIn.play();
      return fadeIn;
    }

    if (current === null) {
      fadeIn.fadeIn(seconds);
      fadeIn.play();
      return fadeIn;
    }
    fadeIn.play();
    current.crossFadeTo(fadeIn, seconds, options.warp === true);
    return fadeIn;
  }

  private activeBaseAction(): PoseAction | null {
    for (let i = this.actions.length - 1; i >= 0; i -= 1) {
      const action = this.actions[i]!;
      if (!action.additive && action.playing && action.enabled) return action;
    }
    return null;
  }

  /** Layer API (C-19 playLayer/stopLayer groundwork). */
  playLayer(layerName: string, clipName: string, options: PoseLayerOptions & { blendMode?: "override" | "additive"; weight?: number } = {}): PoseAction {
    let layer = this.layerByName.get(layerName);
    if (!layer) {
      // `weight` is applied once, on the action (anim-phys-02); the layer multiplier stays 1.
      layer = { name: layerName, blendMode: options.blendMode ?? "override", mask: options.mask ?? null, weight: 1, actions: [] };
      this.layerByName.set(layerName, layer);
      this.layers.push(layer);
    } else {
      // A new clip on an existing layer takes the new mask and blend mode, and replaces the
      // clips already playing there instead of stacking on top of them (anim-phys-03).
      if (options.mask !== undefined) layer.mask = options.mask;
      if (options.blendMode !== undefined) layer.blendMode = options.blendMode;
      const fade = options.fadeOutPrevious ?? 0;
      for (const previous of layer.actions) {
        if (!previous.playing || previous.fadingOut) continue;
        if (fade > 0) previous.fadeOut(fade);
        else previous.stop();
      }
      pruneFinishedLayerActions(layer);
    }
    const { mask: _mask, fadeOutPrevious: _fadeOutPrevious, ...actionOptions } = options;
    const action = this.clipAction(clipName, actionOptions);
    action.layerMask = layer.mask;
    action.layerBlendMode = layer.blendMode;
    action.play();
    // `play()` registers the action with the base layer; a layer action must be evaluated only
    // through its layer (and its mask), or the clip also drives every bone at full weight.
    this.deactivate(action);
    layer.actions.push(action);
    return action;
  }

  stopLayer(layerName: string, fadeSeconds = 0): void {
    const layer = this.layerByName.get(layerName);
    if (!layer) return;
    for (const action of layer.actions) {
      if (fadeSeconds > 0) action.fadeOut(fadeSeconds);
      else action.stop();
    }
    if (fadeSeconds <= 0) {
      this.layerByName.delete(layerName);
      this.layers.splice(this.layers.indexOf(layer), 1);
    }
  }

  onEvent(listener: (invocation: AnimationClipEventInvocation<AnimationClipEvent, string>) => void): () => void {
    this.assertAlive();
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  activate(action: PoseAction): void {
    this.assertAlive();
    if (!this.actions.includes(action) && !this.layers.some(layer => layer.actions.includes(action))) this.actions.push(action);
  }

  deactivate(action: PoseAction): void {
    const index = this.actions.indexOf(action);
    if (index >= 0) this.actions.splice(index, 1);
  }

  /** Resolve `CompiledClip` node-path targets to skeleton bone indices. */
  resolveBindings(clip: CompiledClip): TrackBinding[] {
    const bindings: TrackBinding[] = [];
    for (let i = 0; i < clip.tracks.length; i += 1) {
      const track = clip.tracks[i]!;
      const parsed = parseTrackTarget(track.target);
      if (parsed === null) continue;
      const indices = this.skeleton.jointIndicesByName.get(parsed.nodeName)
        ?? this.skeleton.jointIndicesByName.get(unescapeNodeName(parsed.nodeName));
      if (!indices || indices.length === 0) continue;
      const expectedType = parsed.channel === "rotation" ? "quaternion" : "vector3";
      const expectedStride = parsed.channel === "rotation" ? 4 : 3;
      if (track.valueType !== expectedType || track.stride !== expectedStride) {
        throw new Error(`POSE_TRACK_TYPE_MISMATCH: ${track.target} requires ${expectedType} (${expectedStride} components), got ${track.valueType} (${track.stride}).`);
      }
      for (const boneIndex of indices) bindings.push({ trackIndex: i, boneIndex, channel: parsed.channel });
    }
    return bindings;
  }

  private readonly statelessBindings = new Map<CompiledClip, TrackBinding[]>();
  private readonly statelessCursors = new Map<CompiledClip, CompiledTrackCursor>();

  private statelessBindingsFor(clip: CompiledClip): TrackBinding[] {
    let bindings = this.statelessBindings.get(clip);
    if (bindings === undefined) {
      bindings = this.resolveBindings(clip);
      this.statelessBindings.set(clip, bindings);
    }
    return bindings;
  }

  private statelessCursorsFor(clip: CompiledClip): CompiledTrackCursor {
    let cursors = this.statelessCursors.get(clip);
    if (cursors === undefined) {
      cursors = createTrackCursors(clip);
      this.statelessCursors.set(clip, cursors);
    }
    return cursors;
  }

  private lastDt = 0;

  /**
   * Advance mixer time by `dt` (× mixer timescale), update all actions'
   * times/weights, and emit clip events between old and new action times.
   */
  update(dt: number): AnimationClipEventInvocation<AnimationClipEvent, string>[] {
    this.assertAlive();
    if (!Number.isFinite(dt) || !Number.isFinite(this.timeScale)) {
      throw new Error("PoseMixer update delta and timeScale must be finite.");
    }
    this.updateDepth += 1;
    try {
    this.lastDt = Math.abs(dt);
    const scaledDt = dt * this.timeScale;
    if (!Number.isFinite(scaledDt)) throw new Error("PoseMixer scaled delta must be finite.");
    // Durations use elapsed mixer time even during reverse playback. Fades
    // continue while an action is paused; its warp and playhead do not.
    const elapsedDt = Math.abs(scaledDt);
    this.time += elapsedDt;
    const events: AnimationClipEventInvocation<AnimationClipEvent, string>[] = [];
    this.lastEventOverflow = 0;

    const allActions: PoseAction[] = [...this.actions];
    for (const layer of this.layers) allActions.push(...layer.actions);

    // Establish the same phase and reflected direction before advancing. This
    // lets followers report markers they actually cross, including when a new
    // action joins a group while its leader is moving backwards.
    const leaders = new Map<string, PoseAction>();
    const leaderFor = new Map<PoseAction, PoseAction>();
    for (const action of allActions) {
      if (action.syncGroupName === null || !action.playing || !action.enabled) continue;
      const leader = leaders.get(action.syncGroupName);
      if (leader === undefined) leaders.set(action.syncGroupName, action);
      else {
        if (!action.paused) action.synchronizePhaseWith(leader);
        leaderFor.set(action, leader);
      }
    }
    const advances = new Map<PoseAction, TimeScaleSegment[]>();

    for (const action of allActions) {
      if (!action.playing || !action.enabled) {
        // Finished fades must not retain an ever-growing list of active actions.
        if (action.playing && !action.enabled) action.stop();
        else action.setPlaybackDelta(0);
        continue;
      }
      const wasPaused = action.paused;
      const leader = leaderFor.get(action);
      const leaderAdvances = leader === undefined ? undefined : advances.get(leader);
      const pauseOffset = action.warpPauseOffset();
      let clipSegments = wasPaused || !action.hasPlaybackDuration ? [] : leaderAdvances !== undefined
        ? leader!.clip.duration > 0
          ? leaderAdvances.map(segment => {
            const ratio = action.clip.duration / leader!.clip.duration;
            return {
              ...segment, from: segment.from * ratio, to: segment.to * ratio,
              distance: segment.distance * ratio
            };
          })
          : []
        : action.integratedTimeScaleSpans(scaledDt);
      if (pauseOffset !== null && pauseOffset < elapsedDt) {
        clipSegments = limitTimeScaleSegments(clipSegments, pauseOffset);
      }
      const actualAdvances: TimeScaleSegment[] = [];
      const actionEvents: { previous: number; event: AnimationEvent }[] = [];
      let actionOverflow = 0;
      let playbackDelta = 0;
      let finishOffset: number | null = null;
      const catchUpLimit = action.maxEventCatchUp;
      if (!Number.isSafeInteger(catchUpLimit) || catchUpLimit < 0) {
        throw new Error("PoseAction maxEventCatchUp must be a non-negative safe integer.");
      }
      const authoredLoopMode = action.loopMode;
      try {
        // A sync group is leader-driven: followers cross the same normalized
        // seams and reflections even when their standalone loop mode differs.
        if (leader !== undefined) action.loopMode = leader.loopMode;
        for (const segment of clipSegments) {
          action.maxEventCatchUp = Math.max(0, catchUpLimit - actionEvents.length);
          const result = action.updateTime(segment.distance);
          const travelled = action.lastPlaybackDelta;
          const finished = !action.playing || action.paused;
          const consumed = finished ? AnimationAction.consumedWarpDuration(segment, Math.abs(travelled)) : segment.duration;
          const endRate = segment.duration > 0
            ? segment.from + (segment.to - segment.from) * (consumed / segment.duration)
            : segment.from;
          actualAdvances.push({ ...segment, duration: consumed, to: endRate, distance: travelled });
          playbackDelta += travelled;
          actionOverflow += result.eventOverflow;
          for (const event of result.events) actionEvents.push({ previous: result.previous, event });
          if (finished) {
            finishOffset = segment.startOffset + consumed;
            break;
          }
        }
      } finally {
        action.maxEventCatchUp = catchUpLimit;
        action.loopMode = authoredLoopMode;
      }
      action.setPlaybackDelta(playbackDelta);
      advances.set(action, actualAdvances);
      if (!wasPaused && action.hasPlaybackDuration) {
        action.advanceWarp(Math.min(elapsedDt, finishOffset ?? elapsedDt, pauseOffset ?? elapsedDt));
      }
      action.updateTimeScale(this.time, !wasPaused && action.paused);
      action.updateWeight(this.time);
      if (!action.enabled) {
        if (action.playing) action.stop();
        else this.deactivate(action);
      }
      this.lastEventOverflow += actionOverflow;
      for (const { previous, event: marker } of actionEvents) {
        const { clipName: _clipName, direction, loopCount, ...event } = marker;
        events.push({
          clipId: action.clipName,
          event,
          time: event.time,
          previousTime: previous,
          localTime: event.time,
          normalizedTime: action.clip.duration > 0 ? event.time / action.clip.duration : 0,
          loopCount,
          direction,
          playbackTime: this.time
        });
      }
    }

    // Preserve the established leader-driven phase contract even if actions
    // have different loop modes; marker traversal above uses each action's mode.
    for (const [member, leader] of leaderFor) {
      if (member.playing && member.enabled && !member.paused && leader.playing && leader.enabled) {
        member.time = leader.normalizedPhase * member.clip.duration;
      }
    }

    for (const invocation of events) {
      for (const listener of this.eventListeners) listener(invocation);
    }
    if (this.inertializer !== null && this.inertializerElapsed !== Infinity) {
      this.inertializerElapsed += Math.abs(scaledDt);
    }
    // Sweep layers whose actions have all faded out.
    for (let i = this.layers.length - 1; i >= 0; i -= 1) {
      const layer = this.layers[i]!;
      if (layer.actions.length > 0 && layer.actions.every((a) => !a.enabled || !a.playing)) {
        for (const action of layer.actions) action.stop();
        this.layers.splice(i, 1);
        this.layerByName.delete(layer.name);
      } else {
        pruneFinishedLayerActions(layer);
      }
    }
    return events;
    } finally {
      this.updateDepth -= 1;
    }
  }

  /**
   * Evaluate the final pose into `out` (PoseBuffer with skeleton.boneCount
   * bones). Starts from `skeleton.restPose`, applies the base layer
   * (incremental-weighted, rest fills below Σw=1), then each layer in order.
   */
  evaluate(out: PoseBuffer): void {
    this.assertAlive();
    const n = this.skeleton.boneCount;
    const rest = this.skeleton.restPose;
    this.previousPose = this.latestPose;
    // Start at rest — bones untouched by any action keep rest TRS.
    out.positions.set(rest.positions);
    out.rotations.set(rest.rotations);
    out.scales.set(rest.scales);

    this.resetAccumulators();
    this.applyBase(out);
    this.applyRestFill(out);
    this.applyAdditiveAccumulators(out);

    for (const layer of this.layers) {
      this.applyLayer(out, layer);
    }

    if (this.inertializer !== null && this.inertializerElapsed !== Infinity && Number.isFinite(this.inertializerElapsed)) {
      this.inertializer.apply(out, out, this.inertializerElapsed);
    }
    // §13: the latestPose/previousPose snapshots only feed the inertialize
    // transition — skip the 4·boneCount store clone when no inertializer
    // exists (the common path, ~1-2µs on a 191-bone rig).
    if (this.inertializer !== null) {
      this.latestPose = clonePoseInto(out, this.latestPose, n);
    }
    this.resetAccumulators();
  }

  /**
   * Stateless one-shot blend (T1.7): evaluate the given clips at explicit
   * times with explicit weights and write the result into `out`. No
   * PoseAction is created or mutated; action/layer/inertializer state is
   * untouched. Same accumulate + rest-fill + additive pipeline as
   * `evaluate`, so the two paths stay within the 1e-4 parity bar.
   */
  evaluateSamples(samples: readonly PoseSampleSpec[], out: PoseBuffer): void {
    this.assertAlive();
    const rest = this.skeleton.restPose;
    out.positions.set(rest.positions);
    out.rotations.set(rest.rotations);
    out.scales.set(rest.scales);
    this.resetAccumulators();
    const scratch = this.scratchClip;
    for (const sample of samples) {
      const entry = this.clips.get(sample.clipName);
      if (entry === undefined) {
        throw new Error(`ANIMATION_CLIP_NOT_FOUND: clip "${sample.clipName}" is not registered. Available: ${[...this.clips.keys()].join(", ")}`);
      }
      const clip = entry.compiled;
      const weight = sample.weight ?? 1;
      if (weight <= 0) continue;
      const additive = sample.additive ?? isClipAdditive(entry.source);
      const bindings = this.statelessBindingsFor(clip);
      const cursors = this.statelessCursorsFor(clip);
      for (const binding of bindings) {
        const boneWeight = sample.mask == null ? weight : weight * sample.mask[binding.boneIndex]!;
        if (boneWeight <= 0) continue;
        const track = clip.tracks[binding.trackIndex]!;
        sampleTrackInto(track, sample.time, cursors, binding.trackIndex, scratch, 0);
        this.accumulate(out, binding, track, scratch, boneWeight, additive);
      }
    }
    this.applyRestFill(out);
    this.applyAdditiveAccumulators(out);
    this.resetAccumulators();
  }

  /** Stop all actions and release clip, binding, and event-listener references. */
  dispose(): void {
    if (this.disposed) return;
    for (const action of [...this.actions]) action.stop();
    for (const layer of this.layers) for (const action of layer.actions) action.stop();
    this.actions.length = 0;
    this.layers.length = 0;
    this.layerByName.clear();
    this.clips.clear();
    this.statelessBindings.clear();
    this.statelessCursors.clear();
    this.eventListeners.clear();
    this.latestPose = null;
    this.previousPose = null;
    this.disposed = true;
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error("PoseMixer has been disposed.");
  }

  private applyBase(out: PoseBuffer): void {
    const scratch = this.scratchClip;
    for (const action of this.actions) {
      const weight = action.effectiveWeight;
      if (weight <= 0 || !action.enabled) continue;
      for (const binding of action.bindings) {
        const track = action.clip.tracks[binding.trackIndex]!;
        sampleTrackInto(track, action.time, action.cursors, binding.trackIndex, scratch, 0);
        this.accumulate(out, binding, track, scratch, weight, action.additive);
      }
    }
  }

  private applyLayer(out: PoseBuffer, layer: PoseLayer): void {
    const scratch = this.scratchClip;
    for (const action of layer.actions) {
      const weight = action.effectiveWeight * layer.weight;
      if (weight <= 0 || !action.enabled) continue;
      const mask = action.layerMask;
      for (const binding of action.bindings) {
        const maskWeight = mask === null ? weight : weight * mask[binding.boneIndex]!;
        if (maskWeight <= 0) continue;
        const track = action.clip.tracks[binding.trackIndex]!;
        sampleTrackInto(track, action.time, action.cursors, binding.trackIndex, scratch, 0);
        if ((action.layerBlendMode ?? layer.blendMode) === "additive" || action.additive) {
          this.accumulateAdditive(out, binding, track, scratch, maskWeight);
        } else {
          this.applyOverride(out, binding, track, scratch, maskWeight);
        }
      }
    }
  }

  private accuKey(boneIndex: number, channel: PoseChannel): number {
    return boneIndex * 3 + (channel === "position" ? 0 : channel === "rotation" ? 1 : 2);
  }

  /** Base-layer incremental accumulate: `acc = mix(acc, v, w/(Σ+w))`, then rest. */
  private accumulate(out: PoseBuffer, binding: TrackBinding, track: CompiledTrack, sample: Float32Array, weight: number, additive: boolean): void {
    const b = binding.boneIndex;
    const key = this.accuKey(b, binding.channel);
    if (additive) {
      this.accumulateAdditiveAccu(binding, sample, weight);
      return;
    }
    const prevWeight = this.accWeight[key]!;
    if (prevWeight === 0) {
      this.accTouched[this.accTouchedCount++] = key;
      this.writeSample(out, b, binding.channel, sample);
      this.accWeight[key] = weight;
      return;
    }
    const cumulative = prevWeight + weight;
    const mix = weight / cumulative;
    this.mixInPlace(out, b, binding.channel, sample, mix);
    this.accWeight[key] = cumulative;
  }

  /** r185 `accumulateAdditive`: quats chain-multiply `add = slerp(add, add·delta, w)`; vecs `add += delta·w`. */
  private accumulateAdditiveAccu(binding: TrackBinding, delta: Float32Array, weight: number): void {
    const key = this.accuKey(binding.boneIndex, binding.channel);
    const prev = this.addWeight[key]!;
    if (prev === 0) this.addTouched[this.addTouchedCount++] = key;
    if (binding.channel === "rotation") {
      const off = key * 4;
      if (prev === 0) {
        this.addQuat[off] = 0;
        this.addQuat[off + 1] = 0;
        this.addQuat[off + 2] = 0;
        this.addQuat[off + 3] = 1;
      }
      const work = scratchMul;
      multiplyQuatFlat(work, 0, this.addQuat, off, delta, 0);
      slerpQuatFlat(this.addQuat, off, this.addQuat, off, work, 0, weight);
    } else {
      const off = key * 3;
      if (prev === 0) {
        this.addVec[off] = 0;
        this.addVec[off + 1] = 0;
        this.addVec[off + 2] = 0;
      }
      this.addVec[off]! += delta[0]! * weight;
      this.addVec[off + 1]! += delta[1]! * weight;
      this.addVec[off + 2]! += delta[2]! * weight;
    }
    this.addWeight[key] = prev + weight;
  }

  /** r185 `apply` additive stage: `accu = slerp(accu, accu·add, 1)` / `accu += add`. */
  private applyAdditiveAccumulators(out: PoseBuffer): void {
    for (let t = 0; t < this.addTouchedCount; t += 1) {
      const key = this.addTouched[t]!;
      const boneIndex = (key / 3) | 0;
      const channel: PoseChannel = key % 3 === 0 ? "position" : key % 3 === 1 ? "rotation" : "scale";
      if (channel === "rotation") {
        multiplyQuatFlat(scratchMul, 0, out.rotations, boneIndex * 4, this.addQuat, key * 4);
        slerpQuatFlat(out.rotations, boneIndex * 4, out.rotations, boneIndex * 4, scratchMul, 0, 1);
      } else {
        const off = boneIndex * 3;
        const src = key * 3;
        const dst = channel === "position" ? out.positions : out.scales;
        for (let k = 0; k < 3; k += 1) dst[off + k]! += this.addVec[src + k]!;
      }
    }
  }

  /** After base accumulate: fill below-1 remainder from rest pose. Call once per channel per evaluate. */
  private applyRestFill(out: PoseBuffer): void {
    const rest = this.skeleton.restPose;
    for (let t = 0; t < this.accTouchedCount; t += 1) {
      const key = this.accTouched[t]!;
      const weight = this.accWeight[key]!;
      if (weight >= 1) continue;
      const boneIndex = Math.floor(key / 3);
      const channel: PoseChannel = key % 3 === 0 ? "position" : key % 3 === 1 ? "rotation" : "scale";
      const remainder = 1 - weight;
      if (channel === "rotation") {
        slerpQuatFlat(out.rotations, boneIndex * 4, out.rotations, boneIndex * 4, rest.rotations, boneIndex * 4, remainder);
      } else {
        const off = boneIndex * 3;
        const dst = channel === "position" ? out.positions : out.scales;
        const src = channel === "position" ? rest.positions : rest.scales;
        lerpVec3Flat(dst, off, dst, off, src, off, remainder);
      }
    }
  }

  private writeSample(out: PoseBuffer, boneIndex: number, channel: PoseChannel, sample: Float32Array): void {
    if (channel === "rotation") {
      const off = boneIndex * 4;
      out.rotations[off] = sample[0]!;
      out.rotations[off + 1] = sample[1]!;
      out.rotations[off + 2] = sample[2]!;
      out.rotations[off + 3] = sample[3]!;
    } else {
      const off = boneIndex * 3;
      const dst = channel === "position" ? out.positions : out.scales;
      dst[off] = sample[0]!;
      dst[off + 1] = sample[1]!;
      dst[off + 2] = sample[2]!;
    }
  }

  private mixInPlace(out: PoseBuffer, boneIndex: number, channel: PoseChannel, sample: Float32Array, t: number): void {
    const scratchB = scratchSampleB;
    if (channel === "rotation") {
      slerpQuatFlat(out.rotations, boneIndex * 4, out.rotations, boneIndex * 4, sample, 0, t);
    } else {
      const off = boneIndex * 3;
      const dst = channel === "position" ? out.positions : out.scales;
      lerpVec3Flat(dst, off, dst, off, sample, 0, t);
      void scratchB;
    }
  }

  /**
   * Override layer: `out[b] = slerp(out[b], layer[b], w)` — applied to whatever
   * the base produced (which may itself be rest-blended).
   */
  private applyOverride(out: PoseBuffer, binding: TrackBinding, track: CompiledTrack, sample: Float32Array, weight: number): void {
    this.mixInPlace(out, binding.boneIndex, binding.channel, sample, weight);
  }

  /**
   * Additive: quats `out = slerp(out, out·delta, w)`; positions and scales
   * `out += delta·w` (r185 `_slerpAdditive`/`_lerpAdditive`).
   */
  private accumulateAdditive(out: PoseBuffer, binding: TrackBinding, track: CompiledTrack, delta: Float32Array, weight: number): void {
    const b = binding.boneIndex;
    if (binding.channel === "rotation") {
      multiplyQuatFlat(scratchMul, 0, out.rotations, b * 4, delta, 0);
      slerpQuatFlat(out.rotations, b * 4, out.rotations, b * 4, scratchMul, 0, weight);
    } else {
      const off = b * 3;
      const dst = binding.channel === "position" ? out.positions : out.scales;
      for (let k = 0; k < 3; k += 1) dst[off + k]! += delta[k]! * weight;
    }
  }


}

const scratchMul = new Float32Array(4);
const scratchSampleB = new Float32Array(4);

function clonePoseInto(source: PoseBuffer, target: PoseBuffer | null, boneCount: number): PoseBuffer {
  const pose = target ?? { boneCount, positions: new Float32Array(boneCount * 3), rotations: new Float32Array(boneCount * 4), scales: new Float32Array(boneCount * 3) };
  pose.positions.set(source.positions);
  pose.rotations.set(source.rotations);
  pose.scales.set(source.scales);
  return pose;
}

const CHANNELS: Readonly<Record<string, PoseChannel>> = {
  translation: "position",
  position: "position",
  rotation: "rotation",
  quaternion: "rotation",
  scale: "scale"
};

/** Parse `<nodeName>.<path>` — mirrors glTF runtime targets (weights/material/light are out of pose scope). */
function parseTrackTarget(target: string): { nodeName: string; channel: PoseChannel } | null {
  if (target.startsWith("material:") || target.startsWith("light:")) return null;
  const separator = target.lastIndexOf(".");
  if (separator <= 0 || separator === target.length - 1) return null;
  const channel = CHANNELS[target.slice(separator + 1)];
  if (channel === undefined) return null;
  return { nodeName: target.slice(0, separator), channel };
}

function unescapeNodeName(name: string): string {
  return name.replace(/\\(.)/gu, "$1");
}

type PoseMixerRestorePlan = {
  time: number;
  timeScale: number;
  lastEventOverflow: number;
  lastDt: number;
  actions: PoseAction[];
  layers: PoseLayer[];
  latestPose: PoseBuffer | null;
  previousPose: PoseBuffer | null;
  halfLife: number;
};

function poseRecord(value: unknown, label: string, allowed: readonly string[], required = allowed): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new Error(`PoseMixer.restore: ${label} must be a plain object.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.getOwnPropertySymbols(value).length || Object.keys(descriptors).some(key =>
    !allowed.includes(key) || !("value" in descriptors[key]!) || !descriptors[key]!.enumerable)) {
    throw new Error(`PoseMixer.restore: ${label} contains unsupported fields, accessors or callbacks.`);
  }
  if (required.some(key => !Object.prototype.hasOwnProperty.call(descriptors, key))) {
    throw new Error(`PoseMixer.restore: ${label} is missing required fields.`);
  }
  return value as Record<string, unknown>;
}

function poseArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length) {
    throw new Error(`PoseMixer.restore: ${label} must be a plain array.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  if (keys.length !== value.length + 1 || keys.some(key => key !== "length" &&
      (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length))) {
    throw new Error(`PoseMixer.restore: ${label} contains sparse or unsupported array properties.`);
  }
  for (let index = 0; index < value.length; index++) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      throw new Error(`PoseMixer.restore: ${label} contains sparse entries or accessors.`);
    }
  }
  return value;
}

function poseNumber(value: unknown, label: string, minimum = -Infinity): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || Object.is(value, -0)) {
    throw new Error(`PoseMixer.restore: ${label} must be a finite, JSON-roundtrippable number.`);
  }
  return value;
}

function poseBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`PoseMixer.restore: ${label} must be boolean.`);
  return value;
}

function readPoseNumberArray(value: unknown, length: number, label: string): number[] {
  const values = poseArray(value, label);
  if (values.length !== length) throw new Error(`PoseMixer.restore: ${label} has the wrong length.`);
  return values.map((item, index) => poseNumber(item, `${label}[${index}]`));
}

function readPoseFloatArray(value: unknown, length: number, label: string): number[] {
  return readPoseNumberArray(value, length, label).map(number => {
    if (Math.fround(number) !== number) throw new Error(`PoseMixer.restore: ${label} must contain exact Float32 values.`);
    return number;
  });
}

function readPoseTypedNumbers(
  value: unknown,
  constructor: Float32ArrayConstructor | Uint32ArrayConstructor,
  length: number,
  label: string
): number[] {
  if (!(value instanceof constructor) || Object.getPrototypeOf(value) !== constructor.prototype ||
      Object.getOwnPropertySymbols(value).length || value.length !== length) {
    throw new Error(`PoseMixer.serialize: ${label} must be an unmodified ${constructor.name} of the expected length.`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.keys(descriptors).length !== value.length || Object.keys(descriptors).some(key =>
    !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length ||
    !("value" in descriptors[key]!) || !descriptors[key]!.enumerable)) {
    throw new Error(`PoseMixer.serialize: ${label} contains unsupported properties or callbacks.`);
  }
  return Array.from(value, (item, index) => poseNumber(item, `${label}[${index}]`));
}

function readPoseBindings(value: unknown, boneCount: number, trackCount: number): TrackBinding[] {
  return poseArray(value, "track bindings").map(entry => {
    const binding = poseRecord(entry, "track binding", ["trackIndex", "boneIndex", "channel"]);
    const trackIndex = poseNumber(binding.trackIndex, "binding trackIndex", 0);
    const boneIndex = poseNumber(binding.boneIndex, "binding boneIndex", 0);
    if (!Number.isSafeInteger(trackIndex) || trackIndex >= trackCount ||
        !Number.isSafeInteger(boneIndex) || boneIndex >= boneCount ||
        (binding.channel !== "position" && binding.channel !== "rotation" && binding.channel !== "scale")) {
      throw new Error("PoseMixer.restore: invalid track binding.");
    }
    return { trackIndex, boneIndex, channel: binding.channel };
  });
}

function readPoseEnvelope(value: unknown, label: string, nonnegative: boolean): FadeState {
  if (value === null) return null;
  const record = poseRecord(value, label, ["startTime", "duration", "from", "to"]);
  const startTime = poseNumber(record.startTime, `${label} startTime`);
  const duration = poseNumber(record.duration, `${label} duration`, 0);
  const from = poseNumber(record.from, `${label} from`, nonnegative ? 0 : -Infinity);
  const to = poseNumber(record.to, `${label} to`, nonnegative ? 0 : -Infinity);
  if (duration === 0 || !Number.isFinite(startTime + duration) || !Number.isFinite(to - from)) {
    throw new Error(`PoseMixer.restore: invalid ${label} interval.`);
  }
  return { startTime, duration, from, to };
}

function readPoseWarp(value: unknown): WarpSnapshot {
  if (value === null) return null;
  const record = poseRecord(value, "warp", ["startTime", "duration", "from", "to", "elapsed"], ["startTime", "duration", "from", "to"]);
  const envelope = readPoseEnvelope({
    startTime: record.startTime, duration: record.duration, from: record.from, to: record.to
  }, "warp", false)!;
  if (!Object.prototype.hasOwnProperty.call(record, "elapsed")) return envelope;
  const elapsed = poseNumber(record.elapsed, "warp elapsed", 0);
  if (elapsed > envelope.duration) throw new Error("PoseMixer.restore: invalid warp elapsed time.");
  return { ...envelope, elapsed };
}

function rebasePoseEnvelope(envelope: FadeState, offset: number): FadeState {
  if (envelope === null) return null;
  const startTime = envelope.startTime + offset;
  if (!Number.isFinite(startTime) || !Number.isFinite(startTime + envelope.duration)) {
    throw new Error("PoseAction.restore: rebased envelope is not finite.");
  }
  return { ...envelope, startTime };
}

function capturePoseBuffer(value: PoseBuffer, boneCount: number, label: string): PoseBufferSnapshot {
  const record = poseRecord(value, label, ["boneCount", "positions", "rotations", "scales"]);
  if (record.boneCount !== boneCount) throw new Error(`PoseMixer.serialize: ${label} has the wrong bone count.`);
  return {
    positions: readPoseTypedNumbers(record.positions, Float32Array, boneCount * 3, `${label} positions`),
    rotations: readPoseTypedNumbers(record.rotations, Float32Array, boneCount * 4, `${label} rotations`),
    scales: readPoseTypedNumbers(record.scales, Float32Array, boneCount * 3, `${label} scales`)
  };
}

function readPoseBuffer(value: unknown, boneCount: number, label: string): PoseBufferSnapshot {
  const record = poseRecord(value, label, ["positions", "rotations", "scales"]);
  return {
    positions: readPoseFloatArray(record.positions, boneCount * 3, `${label} positions`),
    rotations: readPoseFloatArray(record.rotations, boneCount * 4, `${label} rotations`),
    scales: readPoseFloatArray(record.scales, boneCount * 3, `${label} scales`)
  };
}

function restorePoseBuffer(value: unknown, boneCount: number, label: string): PoseBuffer {
  const pose = readPoseBuffer(value, boneCount, label);
  return {
    boneCount,
    positions: new Float32Array(pose.positions),
    rotations: new Float32Array(pose.rotations),
    scales: new Float32Array(pose.scales)
  };
}

function readPoseSkeleton(value: unknown, boneCount: number): PoseSkeletonSnapshot {
  const record = poseRecord(value, "skeleton target", ["jointNames", "parentIndices", "missingJointSlots", "nameBindings", "restPose"]);
  const jointNames = poseArray(record.jointNames, "joint names");
  const parents = readPoseNumberArray(record.parentIndices, boneCount, "parent indices");
  const missing = poseArray(record.missingJointSlots, "missing joint slots");
  if (jointNames.length !== boneCount || jointNames.some(name => typeof name !== "string") ||
      parents.some(index => !Number.isSafeInteger(index) || index < -1 || index >= boneCount) ||
      missing.length !== boneCount || missing.some(value => typeof value !== "boolean")) {
    throw new Error("PoseMixer.restore: invalid skeleton target topology.");
  }
  const seenNames = new Set<string>();
  const nameBindings = poseArray(record.nameBindings, "skeleton name bindings").map(value => {
    const entry = poseRecord(value, "skeleton name binding", ["name", "indices"]);
    if (typeof entry.name !== "string" || seenNames.has(entry.name)) throw new Error("PoseMixer.restore: invalid skeleton name binding.");
    seenNames.add(entry.name);
    const indices = poseArray(entry.indices, "skeleton name indices").map(value => poseNumber(value, "skeleton joint index", 0));
    if (indices.some(index => !Number.isSafeInteger(index) || index >= boneCount)) throw new Error("PoseMixer.restore: invalid skeleton joint index.");
    return { name: entry.name, indices };
  });
  nameBindings.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return {
    jointNames: jointNames as string[], parentIndices: parents, missingJointSlots: missing as boolean[],
    nameBindings, restPose: readPoseBuffer(record.restPose, boneCount, "rest pose")
  };
}

function capturePoseSkeleton(skeleton: SkeletonBinding): PoseSkeletonSnapshot {
  const boneCount = poseNumber(skeleton.boneCount, "skeleton boneCount", 0);
  if (!Number.isSafeInteger(boneCount)) throw new Error("PoseMixer.serialize: invalid skeleton bone count.");
  const nodeIndices = readPoseNumberArray(skeleton.jointNodeIndices, boneCount, "skeleton node indices");
  const missing = poseArray(skeleton.missingNodeIndices, "missing node indices")
    .map(value => poseNumber(value, "missing node index", 0));
  if (nodeIndices.some(value => !Number.isSafeInteger(value) || value < 0) ||
      missing.some(value => !Number.isSafeInteger(value) || !nodeIndices.includes(value))) {
    throw new Error("PoseMixer.serialize: invalid skeleton node indices.");
  }
  const nameMap = skeleton.jointIndicesByName;
  if (!(nameMap instanceof Map) || Object.getPrototypeOf(nameMap) !== Map.prototype ||
      Reflect.ownKeys(nameMap).length !== 0) {
    throw new Error("PoseMixer.serialize: skeleton name bindings must be an unmodified Map.");
  }
  const target = {
    jointNames: skeleton.jointNames,
    parentIndices: skeleton.parentIndices,
    missingJointSlots: nodeIndices.map(index => missing.includes(index)),
    nameBindings: [...nameMap].map(([name, indices]) => ({ name, indices })),
    restPose: capturePoseBuffer(skeleton.restPose, boneCount, "rest pose")
  };
  return readPoseSkeleton(target, boneCount);
}

function assertPoseActionData(action: PoseAction): void {
  const allowed = [
    "mixer", "clipName", "clip", "bindings", "cursors", "additive", "playback", "weight", "timeScale",
    "enabled", "syncGroupName", "fade", "warpState", "restoreTimeScale", "effectiveWeight",
    "effectiveTimeScale", "layerMask", "layerBlendMode"
  ];
  const descriptors = Object.getOwnPropertyDescriptors(action);
  if (Object.getPrototypeOf(action) !== PoseAction.prototype || Object.getOwnPropertySymbols(action).length ||
      Object.keys(descriptors).some(key => !allowed.includes(key) || !("value" in descriptors[key]!) || !descriptors[key]!.enumerable)) {
    throw new Error("PoseAction.serialize: custom action fields, accessors and callbacks cannot be serialized.");
  }
}

function assertPosePlaybackData(playback: AnimationAction): void {
  const allowed = [
    "clip", "time", "weight", "timeScale", "loopMode", "repetitions", "clampWhenFinished", "playing", "paused",
    "maxEventCatchUp", "lastPlaybackDelta", "pingPongForward", "loopsCompleted", "signalLoopDelta",
    "signalFinishedDirection", "signalEventOverflow", "fadeDuration", "fadeElapsed", "fadeStartWeight",
    "fadeTargetWeight", "warpState"
  ];
  const descriptors = Object.getOwnPropertyDescriptors(playback);
  if (Object.getPrototypeOf(playback) !== AnimationAction.prototype || Object.getOwnPropertySymbols(playback).length ||
      Object.keys(descriptors).some(key => !allowed.includes(key) || !("value" in descriptors[key]!) || !descriptors[key]!.enumerable)) {
    throw new Error("PoseAction: custom core playback fields, accessors and callbacks cannot be serialized or restored.");
  }
  const warp = descriptors.warpState?.value;
  if (warp !== null && warp !== undefined) poseRecord(warp, "core playback warp", ["duration", "elapsed", "from", "to"]);
}

function assertPoseInertializerData(inertializer: PoseInertializer, boneCount: number): void {
  const allowed = ["captured", "positionVelocities", "scaleVelocities", "angularSpeeds", "angularAxes", "boneCount", "halfLife"];
  const descriptors = Object.getOwnPropertyDescriptors(inertializer);
  if (Object.getPrototypeOf(inertializer) !== PoseInertializer.prototype || Object.getOwnPropertySymbols(inertializer).length ||
      Object.keys(descriptors).some(key => !allowed.includes(key) || !("value" in descriptors[key]!) || !descriptors[key]!.enumerable) ||
      descriptors.boneCount?.value !== boneCount) {
    throw new Error("PoseMixer: custom inertializers, callbacks or mismatched bone counts cannot be serialized or restored.");
  }
}

function assertPoseWritable(value: object, keys: readonly string[], label: string): void {
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (keys.some(key => !descriptors[key] || !("value" in descriptors[key]!) || !descriptors[key]!.writable)) {
    throw new Error(`PoseMixer.restore: ${label} contains non-writable state or accessors.`);
  }
}

function assertPoseMutableArray(value: unknown, label: string): void {
  const array = poseArray(value, label);
  const descriptors = Object.getOwnPropertyDescriptors(array);
  if (!Object.isExtensible(array) || !Object.getOwnPropertyDescriptor(array, "length")?.writable ||
      Object.keys(descriptors).some(key => key !== "length" && (!descriptors[key]!.configurable || !descriptors[key]!.writable))) {
    throw new Error(`PoseMixer.restore: ${label} is not mutable.`);
  }
}

function assertPoseSourceClip(value: unknown): asserts value is AnimationClip {
  if (value === null || typeof value !== "object" || Object.getPrototypeOf(value) !== AnimationClip.prototype) {
    throw new Error("PoseMixer.serialize: custom source clips cannot be serialized.");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = ["name", "tracks", "events", "duration"];
  if (Object.getOwnPropertySymbols(value).length || keys.some(key => !descriptors[key]) ||
      Object.keys(descriptors).some(key => !keys.includes(key) || !("value" in descriptors[key]!) || !descriptors[key]!.enumerable)) {
    throw new Error("PoseMixer.serialize: source clip contains unsupported fields, accessors or callbacks.");
  }
}

function readPoseClipCatalog(value: unknown): PoseMixerSnapshot["clips"] {
  const names = new Set<string>();
  const clips = poseArray(value, "registered clips").map(input => {
    const clip = poseRecord(input, "registered clip identity", ["name", "sourceIdentity", "compiledIdentity", "additive"]);
    if (typeof clip.name !== "string" || names.has(clip.name) ||
        typeof clip.sourceIdentity !== "string" || typeof clip.compiledIdentity !== "string") {
      throw new Error("PoseMixer.restore: invalid or duplicate registered clip identity.");
    }
    names.add(clip.name);
    return {
      name: clip.name,
      sourceIdentity: clip.sourceIdentity,
      compiledIdentity: clip.compiledIdentity,
      additive: poseBoolean(clip.additive, "registered clip additive mode")
    };
  });
  clips.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return clips;
}

function rejectPoseNegativeZero(value: unknown): void {
  if (typeof value === "number" && Object.is(value, -0)) {
    throw new Error("PoseMixer.serialize: negative zero cannot round-trip through JSON.");
  }
  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) rejectPoseNegativeZero(nested);
  }
}

/**
 * Collision-free identity for the actual compiled samples, not just their
 * source clip. `addCompiledClip` permits independently supplied flat arrays.
 */
function poseCompiledIdentity(clip: CompiledClip): string {
  return canonicalPoseData(clip, new Set(), 0);
}

function canonicalPoseData(value: unknown, ancestors: Set<object>, depth: number): string {
  if (value === null) return "null";
  if (typeof value === "string") return `s${JSON.stringify(value)}`;
  if (typeof value === "boolean") return value ? "b1" : "b0";
  if (typeof value === "number" && Number.isFinite(value)) return `n${Object.is(value, -0) ? "-0" : JSON.stringify(value)}`;
  if (typeof value !== "object" || depth > 128) throw new Error("PoseMixer.serialize: compiled clip contains nonserializable data or callbacks.");
  if (ancestors.has(value)) throw new Error("PoseMixer.serialize: compiled clip contains a cycle.");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const values = poseArray(value, "compiled clip array");
      return `a[${values.map(entry => canonicalPoseData(entry, ancestors, depth + 1)).join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    const typed = prototype === Float32Array.prototype ? "f32" : prototype === Float64Array.prototype ? "f64"
      : prototype === Uint8Array.prototype ? "u8" : prototype === Uint32Array.prototype ? "u32" : null;
    if (typed !== null) {
      const array = value as Float32Array | Float64Array | Uint8Array | Uint32Array;
      const descriptors = Object.getOwnPropertyDescriptors(array);
      if (Object.getOwnPropertySymbols(array).length || Object.keys(descriptors).length !== array.length ||
          Object.keys(descriptors).some(key => !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= array.length ||
            !("value" in descriptors[key]!) || !descriptors[key]!.enumerable)) {
        throw new Error("PoseMixer.serialize: compiled clip typed array contains unsupported properties.");
      }
      return `t${typed}[${Array.from(array, entry => canonicalPoseData(entry, ancestors, depth + 1)).join(",")}]`;
    }
    if ((prototype !== Object.prototype && prototype !== null) || Object.getOwnPropertySymbols(value).length) {
      throw new Error("PoseMixer.serialize: compiled clip contains a nonserializable object.");
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Object.keys(descriptors).sort();
    if (keys.some(key => !("value" in descriptors[key]!) || !descriptors[key]!.enumerable)) {
      throw new Error("PoseMixer.serialize: compiled clip contains an accessor or nonserializable property.");
    }
    return `o{${keys.map(key => `${JSON.stringify(key)}:${canonicalPoseData(descriptors[key]!.value, ancestors, depth + 1)}`).join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}
