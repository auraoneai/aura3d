import type { AnimationClip } from "../AnimationClip.js";
import { sampleClipEvents, type AnimationClipEvent, type AnimationClipEventInvocation } from "../AnimationClipEvents.js";
import { compileClip, createTrackCursors, sampleTrackInto, type CompiledClip, type CompiledTrack, type CompiledTrackCursor } from "./CompiledClip.js";
import type { PoseBuffer } from "./PoseBuffer.js";
import type { SkeletonBinding } from "./SkeletonBinding.js";
import { lerpVec3Flat, multiplyQuatFlat, slerpQuatFlat } from "./quatFlat.js";
import { isClipAdditive } from "./makeClipAdditive.js";
import type { PoseInertializer } from "./PoseInertializer.js";

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
 * - Fades and crossfade warp use linear interpolants on mixer time (r185
 *   `_scheduleFading`/`warp`); `crossFadeTo` maps to `crossFadeFrom`.
 * - `syncGroup` is the Aura extension: members share normalised phase
 *   (leader-driven) — three r185 has no equivalent.
 * - `transition: "inertialize"` captures offsets via `PoseInertializer` and
 *   decays them instead of weight-fading (cost ≈ 1 clip evaluation).
 *
 * Events are emitted through `AnimationClipEvents.ts` `sampleClipEvents`.
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
};

type FadeState = {
  readonly startTime: number;
  readonly duration: number;
  readonly from: number;
  readonly to: number;
} | null;

type WarpState = {
  readonly startTime: number;
  readonly duration: number;
  readonly from: number;
  readonly to: number;
} | null;

export class PoseAction {
  readonly mixer: PoseMixer;
  readonly clipName: string;
  readonly clip: CompiledClip;
  readonly bindings: readonly TrackBinding[];
  readonly cursors: CompiledTrackCursor;
  readonly additive: boolean;
  weight = 1;
  timeScale = 1;
  time = 0;
  playing = false;
  paused = false;
  enabled = true;
  loopMode: PoseLoopMode = "repeat";
  repetitions = Infinity;
  clampWhenFinished = false;
  syncGroupName: string | null = null;
  private pingPongForward = true;
  private loopCount = -1;
  private fade: FadeState = null;
  private warpState: WarpState = null;
  private restoreTimeScale: number | null = null;
  effectiveWeight = 0;
  effectiveTimeScale = 0;

  constructor(mixer: PoseMixer, clipName: string, clip: CompiledClip, options: PoseActionOptions = {}) {
    this.mixer = mixer;
    this.clipName = clipName;
    this.clip = clip;
    this.bindings = mixer.resolveBindings(clip);
    this.cursors = createTrackCursors(clip);
    const source = mixer.sourceClip(clipName);
    this.additive = options.additive ?? (source !== undefined && isClipAdditive(source));
    this.weight = options.weight ?? 1;
    this.timeScale = options.timeScale ?? 1;
    if (options.loopMode) this.loopMode = options.loopMode;
    if (options.repetitions !== undefined) this.repetitions = options.repetitions;
    this.clampWhenFinished = options.clampWhenFinished ?? false;
    this.syncGroupName = options.syncGroup ?? null;
  }

  play(): this {
    this.playing = true;
    this.paused = false;
    this.enabled = true;
    this.mixer.activate(this);
    return this;
  }

  stop(): this {
    this.playing = false;
    this.paused = false;
    this.time = 0;
    this.loopCount = -1;
    this.pingPongForward = true;
    this.mixer.deactivate(this);
    return this;
  }

  pause(): this {
    this.paused = true;
    return this;
  }

  setEffectiveWeight(weight: number): this {
    this.weight = weight;
    return this;
  }

  setEffectiveTimeScale(timeScale: number): this {
    this.timeScale = timeScale;
    return this;
  }

  setLoop(mode: PoseLoopMode, repetitions = Infinity): this {
    this.loopMode = mode;
    this.repetitions = repetitions;
    return this;
  }

  /** three r185 syncWith: copy time + timeScale and stop any warping. */
  syncWith(other: PoseAction): this {
    this.time = other.time;
    this.timeScale = other.timeScale;
    this.stopWarping();
    return this;
  }

  fadeIn(duration: number): this {
    return this.scheduleFade(duration, 0, 1);
  }

  fadeOut(duration: number): this {
    return this.scheduleFade(duration, 1, 0);
  }

  fadeTo(weight: number, duration: number): this {
    return this.scheduleFade(duration, this.weight, weight);
  }

  /** three r185 warp: multiplicative timescale interpolant over mixer time (values = start/base → end/base). */
  warp(startTimeScale: number, endTimeScale: number, duration: number): this {
    const now = this.mixer.time;
    const base = this.timeScale;
    this.warpState = { startTime: now, duration, from: startTimeScale / base, to: endTimeScale / base };
    return this;
  }

  stopWarping(): this {
    this.warpState = null;
    this.restoreTimeScale = null;
    return this;
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
      fadeOutAction.warp(1.0, startEndRatio, duration);
      this.warp(endStartRatio, 1.0, duration);
    }
    return this;
  }

  crossFadeTo(fadeInAction: PoseAction, duration: number, warp = false): PoseAction {
    return fadeInAction.crossFadeFrom(this, duration, warp);
  }

  get normalizedPhase(): number {
    return this.clip.duration > 0 ? this.time / this.clip.duration : 0;
  }

  private scheduleFade(duration: number, weightNow: number, weightThen: number): this {
    const now = this.mixer.time;
    if (duration <= 0) {
      this.fade = null;
      this.weight = weightThen;
      return this;
    }
    this.fade = { startTime: now, duration, from: weightNow, to: weightThen };
    return this;
  }

  /** Effective weight at mixer.time, per r185 `_updateWeight`. */
  updateWeight(now: number): number {
    let weight = 0;
    if (this.enabled) {
      weight = this.weight;
      const fade = this.fade;
      if (fade !== null) {
        const end = fade.startTime + fade.duration;
        const t = Math.min(Math.max((now - fade.startTime) / fade.duration, 0), 1);
        const interpolant = fade.from + (fade.to - fade.from) * t;
        weight *= interpolant;
        if (now > end) {
          this.fade = null;
          if (interpolant === 0) this.enabled = false;
        }
      }
    }
    this.effectiveWeight = weight;
    return weight;
  }

  /** Effective timescale at mixer.time, per r185 `_updateTimeScale`. */
  updateTimeScale(now: number): number {
    let timeScale = 0;
    if (!this.paused) {
      timeScale = this.timeScale;
      const warp = this.warpState;
      if (warp !== null) {
        const end = warp.startTime + warp.duration;
        const t = Math.min(Math.max((now - warp.startTime) / warp.duration, 0), 1);
        timeScale *= warp.from + (warp.to - warp.from) * t;
        if (now > end) {
          if (timeScale === 0) {
            this.paused = true;
          } else {
            if (this.restoreTimeScale !== null) timeScale = this.restoreTimeScale;
            this.timeScale = timeScale;
          }
          this.warpState = null;
        }
      }
    }
    this.effectiveTimeScale = timeScale;
    return timeScale;
  }

  /** Advance clip time per r185 `_updateTime`; returns {wrapped, finished}. */
  updateTime(deltaTime: number): { wrapped: boolean; finished: boolean; previous: number } {
    const duration = this.clip.duration;
    const previous = this.time;
    let time = previous + deltaTime;
    let wrapped = false;
    let finished = false;

    if (this.loopMode === "once") {
      if (this.loopCount === -1) this.loopCount = 0;
      if (time >= duration) {
        time = duration;
        finished = true;
      } else if (time < 0) {
        time = 0;
        finished = true;
      }
      if (finished) {
        if (this.clampWhenFinished) this.paused = true;
        else this.enabled = false;
        this.time = time;
        return { wrapped, finished, previous };
      }
    } else {
      // repeat / pingpong
      if (this.loopCount === -1) {
        if (deltaTime >= 0) {
          this.loopCount = 0;
        }
      }
      if (duration > 0 && (time >= duration || time < 0)) {
        const loopDelta = Math.floor(time / duration);
        time -= duration * loopDelta;
        this.loopCount += Math.abs(loopDelta);
        wrapped = true;
        const pending = this.repetitions - this.loopCount;
        if (pending <= 0) {
          if (this.clampWhenFinished) this.paused = true;
          else this.enabled = false;
          this.time = deltaTime > 0 ? duration : 0;
          return { wrapped, finished: true, previous };
        }
      }
      if (this.loopMode === "pingpong") {
        if ((this.loopCount & 1) === 1) this.pingPongForward = false;
        else this.pingPongForward = true;
        if (!this.pingPongForward) time = duration - time;
      }
    }
    this.time = time;
    return { wrapped, finished, previous };
  }
}

export type PoseLayer = {
  readonly name: string;
  readonly blendMode: "override" | "additive";
  readonly mask: Float32Array | null;
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
  private timeScale = 1;
  private readonly clips = new Map<string, { source: AnimationClip; compiled: CompiledClip }>();
  private readonly actions: PoseAction[] = [];
  private readonly layers: PoseLayer[] = [];
  private readonly layerByName = new Map<string, PoseLayer>();
  private readonly eventListeners = new Set<(invocation: AnimationClipEventInvocation<AnimationClipEvent, string>) => void>();
  private latestPose: PoseBuffer | null = null;
  private previousPose: PoseBuffer | null = null;
  private inertializerElapsed = Infinity;
  private inertializerHalfLife = 0.15;
  private scratchClip = new Float32Array(4);

  constructor(options: { skeleton: SkeletonBinding; inertializer?: PoseInertializer }) {
    this.skeleton = options.skeleton;
    this.inertializer = options.inertializer ?? null;
  }

  setEffectiveTimeScale(timeScale: number): this {
    this.timeScale = timeScale;
    return this;
  }

  get effectiveTimeScale(): number {
    return this.timeScale;
  }

  /** Register a clip under a name (compiles it for flat sampling). */
  addClip(name: string, clip: AnimationClip): this {
    this.clips.set(name, { source: clip, compiled: compileClip(clip) });
    return this;
  }

  /** Register a pre-compiled clip (returns undefined if unknown). */
  addCompiledClip(name: string, compiled: CompiledClip, source: AnimationClip): this {
    this.clips.set(name, { source, compiled });
    return this;
  }

  sourceClip(name: string): AnimationClip | undefined {
    return this.clips.get(name)?.source;
  }

  clipAction(name: string, options: PoseActionOptions = {}): PoseAction {
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
      if (!action.additive && action.playing) return action;
    }
    return null;
  }

  /** Layer API (C-19 playLayer/stopLayer groundwork). */
  playLayer(layerName: string, clipName: string, options: PoseLayerOptions & { blendMode?: "override" | "additive"; weight?: number } = {}): PoseAction {
    let layer = this.layerByName.get(layerName);
    if (!layer) {
      layer = { name: layerName, blendMode: options.blendMode ?? "override", mask: options.mask ?? null, weight: options.weight ?? 1, actions: [] };
      this.layerByName.set(layerName, layer);
      this.layers.push(layer);
    }
    const action = this.clipAction(clipName, options);
    action.play();
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
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  activate(action: PoseAction): void {
    if (!this.actions.includes(action)) this.actions.push(action);
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
      const indices = this.skeleton.jointIndicesByName.get(parsed.nodeName);
      if (!indices || indices.length === 0) continue;
      bindings.push({ trackIndex: i, boneIndex: indices[0]!, channel: parsed.channel });
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
    this.lastDt = dt;
    this.time += dt;
    const scaledDt = dt * this.timeScale;
    const events: AnimationClipEventInvocation<AnimationClipEvent, string>[] = [];

    const allActions: PoseAction[] = [...this.actions];
    for (const layer of this.layers) allActions.push(...layer.actions);

    for (const action of allActions) {
      if (!action.playing && !action.enabled) continue;
      const effectiveTimeScale = action.updateTimeScale(this.time);
      const clipDelta = scaledDt * effectiveTimeScale;
      const { previous, wrapped } = action.updateTime(clipDelta);
      const weight = action.updateWeight(this.time);
      if (!action.enabled && !action.playing) this.deactivate(action);
      if (!action.enabled) continue;

      const source = this.clips.get(action.clipName);
      if (source !== undefined && source.source.events.length > 0 && weight > 0) {
        const to = action.time;
        const invocations = sampleClipEvents(
          { id: action.clipName, duration: source.compiled.duration, events: source.source.events as readonly AnimationClipEvent[] },
          {
            from: previous,
            to,
            duration: source.compiled.duration,
            loop: wrapped,
            direction: to >= previous ? 1 : -1,
            playbackTime: this.time
          }
        );
        events.push(...invocations);
      }
    }

    // Aura extension: sync groups keep normalized phase aligned to the leader
    // (first activated member) — three r185 has no phase sync.
    const groups = new Map<string, PoseAction[]>();
    for (const action of allActions) {
      if (action.syncGroupName === null || !action.playing) continue;
      const group = groups.get(action.syncGroupName) ?? [];
      group.push(action);
      groups.set(action.syncGroupName, group);
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const leader = group[0]!;
      const phase = leader.normalizedPhase;
      for (let i = 1; i < group.length; i += 1) {
        const member = group[i]!;
        member.time = phase * member.clip.duration;
      }
    }

    for (const invocation of events) {
      for (const listener of this.eventListeners) listener(invocation);
    }
    if (this.inertializer !== null && this.inertializerElapsed !== Infinity) {
      this.inertializerElapsed += scaledDt;
    }
    // Sweep layers whose actions have all faded out.
    for (let i = this.layers.length - 1; i >= 0; i -= 1) {
      const layer = this.layers[i]!;
      if (layer.actions.length > 0 && layer.actions.every((a) => !a.enabled || !a.playing)) {
        for (const action of layer.actions) action.stop();
        this.layers.splice(i, 1);
        this.layerByName.delete(layer.name);
      }
    }
    return events;
  }

  /**
   * Evaluate the final pose into `out` (PoseBuffer with skeleton.boneCount
   * bones). Starts from `skeleton.restPose`, applies the base layer
   * (incremental-weighted, rest fills below Σw=1), then each layer in order.
   */
  evaluate(out: PoseBuffer): void {
    const n = this.skeleton.boneCount;
    const rest = this.skeleton.restPose;
    this.previousPose = this.latestPose;
    // Start at rest — bones untouched by any action keep rest TRS.
    out.positions.set(rest.positions);
    out.rotations.set(rest.rotations);
    out.scales.set(rest.scales);

    this.accWeight.clear();
    this.addWeight.clear();
    this.applyBase(out);
    this.applyRestFill(out);
    this.applyAdditiveAccumulators(out);
    this.accWeight.clear();
    this.addWeight.clear();

    for (const layer of this.layers) {
      this.applyLayer(out, layer);
    }

    if (this.inertializer !== null && this.inertializerElapsed !== Infinity && Number.isFinite(this.inertializerElapsed)) {
      this.inertializer.apply(out, out, this.inertializerElapsed);
    }
    this.latestPose = clonePoseInto(out, this.latestPose, n);
  }

  /**
   * Stateless one-shot blend (T1.7): evaluate the given clips at explicit
   * times with explicit weights and write the result into `out`. No
   * PoseAction is created or mutated; action/layer/inertializer state is
   * untouched. Same accumulate + rest-fill + additive pipeline as
   * `evaluate`, so the two paths stay within the 1e-4 parity bar.
   */
  evaluateSamples(samples: readonly PoseSampleSpec[], out: PoseBuffer): void {
    const rest = this.skeleton.restPose;
    out.positions.set(rest.positions);
    out.rotations.set(rest.rotations);
    out.scales.set(rest.scales);
    this.accWeight.clear();
    this.addWeight.clear();
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
    this.accWeight.clear();
    this.addWeight.clear();
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
      for (const binding of action.bindings) {
        const maskWeight = layer.mask === null ? weight : weight * layer.mask[binding.boneIndex]!;
        if (maskWeight <= 0) continue;
        const track = action.clip.tracks[binding.trackIndex]!;
        sampleTrackInto(track, action.time, action.cursors, binding.trackIndex, scratch, 0);
        if (layer.blendMode === "additive" || action.additive) {
          this.accumulateAdditive(out, binding, track, scratch, maskWeight);
        } else {
          this.applyOverride(out, binding, track, scratch, maskWeight);
        }
      }
    }
  }

  // Per-(bone,channel) accumulation state, reset each evaluate.
  private readonly accWeight = new Map<number, number>();
  private readonly addWeight = new Map<number, number>();
  private readonly addQuat = new Map<number, Float32Array>();
  private readonly addVec = new Map<number, Float32Array>();

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
    const prevWeight = this.accWeight.get(key) ?? 0;
    if (prevWeight === 0) {
      this.writeSample(out, b, binding.channel, sample);
      this.accWeight.set(key, weight);
      return;
    }
    const cumulative = prevWeight + weight;
    const mix = weight / cumulative;
    this.mixInPlace(out, b, binding.channel, sample, mix);
    this.accWeight.set(key, cumulative);
  }

  /** r185 `accumulateAdditive`: quats chain-multiply `add = slerp(add, add·delta, w)`; vecs `add += delta·w`. */
  private accumulateAdditiveAccu(binding: TrackBinding, delta: Float32Array, weight: number): void {
    const key = this.accuKey(binding.boneIndex, binding.channel);
    const prev = this.addWeight.get(key) ?? 0;
    if (binding.channel === "rotation") {
      let acc = this.addQuat.get(key);
      if (acc === undefined || prev === 0) {
        acc = new Float32Array([0, 0, 0, 1]);
        this.addQuat.set(key, acc);
      }
      const work = scratchMul;
      multiplyQuatFlat(work, 0, acc, 0, delta, 0);
      slerpQuatFlat(acc, 0, acc, 0, work, 0, weight);
    } else {
      let acc = this.addVec.get(key);
      if (acc === undefined || prev === 0) {
        acc = new Float32Array(3);
        this.addVec.set(key, acc);
      }
      for (let k = 0; k < 3; k += 1) acc[k]! += delta[k]! * weight;
    }
    this.addWeight.set(key, prev + weight);
  }

  /** r185 `apply` additive stage: `accu = slerp(accu, accu·add, 1)` / `accu += add`. */
  private applyAdditiveAccumulators(out: PoseBuffer): void {
    for (const key of this.addWeight.keys()) {
      const boneIndex = Math.floor(key / 3);
      const channel: PoseChannel = key % 3 === 0 ? "position" : key % 3 === 1 ? "rotation" : "scale";
      if (channel === "rotation") {
        const add = this.addQuat.get(key)!;
        multiplyQuatFlat(scratchMul, 0, out.rotations, boneIndex * 4, add, 0);
        slerpQuatFlat(out.rotations, boneIndex * 4, out.rotations, boneIndex * 4, scratchMul, 0, 1);
      } else {
        const add = this.addVec.get(key)!;
        const off = boneIndex * 3;
        const dst = channel === "position" ? out.positions : out.scales;
        for (let k = 0; k < 3; k += 1) dst[off + k]! += add[k]!;
      }
    }
  }

  /** After base accumulate: fill below-1 remainder from rest pose. Call once per channel per evaluate. */
  private applyRestFill(out: PoseBuffer): void {
    const rest = this.skeleton.restPose;
    for (const [key, weight] of this.accWeight) {
      if (weight >= 1) continue;
      const boneIndex = Math.floor(key / 3);
      const channel: PoseChannel = key % 3 === 0 ? "position" : key % 3 === 1 ? "rotation" : "scale";
      const t = 1 - weight;
      if (channel === "rotation") {
        slerpQuatFlat(out.rotations, boneIndex * 4, out.rotations, boneIndex * 4, rest.rotations, boneIndex * 4, t);
      } else {
        const off = boneIndex * 3;
        const dst = channel === "position" ? out.positions : out.scales;
        const src = channel === "position" ? rest.positions : rest.scales;
        lerpVec3Flat(dst, off, dst, off, src, off, t);
      }
    }
  }

  private writeSample(out: PoseBuffer, boneIndex: number, channel: PoseChannel, sample: Float32Array): void {
    if (channel === "rotation") {
      out.rotations.set(sample.subarray(0, 4), boneIndex * 4);
    } else {
      const dst = channel === "position" ? out.positions : out.scales;
      dst.set(sample.subarray(0, 3), boneIndex * 3);
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
