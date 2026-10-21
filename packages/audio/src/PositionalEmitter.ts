import { AudioSource, type AudioSourceState } from "./AudioSource";
import type { AudioClip } from "./AudioClip";
import type { AudioContextLike } from "./AudioContextManager";
import type { Vec3Like } from "./AudioListener";
import { SpatialAudio } from "./SpatialAudio";

export type DistanceAttenuationModel = "inverse" | "linear" | "exponential";

export interface DistanceAttenuationOptions {
  readonly refDistance?: number;
  readonly maxDistance?: number;
  readonly rolloffFactor?: number;
  readonly model?: DistanceAttenuationModel;
}

export interface DopplerOptions {
  readonly speedOfSound?: number;
  readonly dopplerFactor?: number;
}

/** A hook that reports how occluded an emitter is from the listener (0 = clear, 1 = fully blocked). */
export type OcclusionHook = (emitter: Vec3Like, listener: Vec3Like) => number;

const SPEED_OF_SOUND_DEFAULT = 343;
const DOPPLER_MIN = 0.25;
const DOPPLER_MAX = 4;

/**
 * Pure distance-attenuation gain in [0, 1], mirroring the PannerNode models so
 * evidence stays meaningful even when no WebAudio context exists (headless runs).
 *
 * Web Audio spec §6.4 (verified against Blink `DistanceEffect::Gain`):
 * - `inverse`: `d` is clamped to `[ref, ∞)`; `maxDistance` is ignored.
 * - `exponential`: `d` is clamped to `[ref, ∞)`; `maxDistance` is ignored.
 * - `linear`: `d` is clamped to `[min(ref,max), max(ref,max)]` and rolloff is
 *   clamped to `[0, 1]` — the only model that uses `maxDistance`.
 * (The previous implementation forced gain 0 for `d ≥ maxDistance` on every
 * model, which no panner does — evidence lied past `maxDistance`.)
 */
export function computeDistanceAttenuation(distance: number, options: DistanceAttenuationOptions = {}): number {
  if (!Number.isFinite(distance) || distance < 0) return 1;
  const refDistance = Math.max(Number.EPSILON, options.refDistance ?? 1);
  const maxDistance = options.maxDistance ?? 10_000;
  const rolloff = Math.max(0, options.rolloffFactor ?? 1);
  const model = options.model ?? "inverse";
  const d = Math.max(distance, refDistance);
  if (model === "linear") {
    const dRef = Math.min(refDistance, maxDistance);
    const dMax = Math.max(refDistance, maxDistance);
    const clamped = Math.min(Math.max(d, dRef), dMax);
    if (dRef === dMax) return 1 - rolloff;
    const f = Math.min(1, rolloff);
    return Math.max(0, 1 - f * ((clamped - dRef) / (dMax - dRef)));
  }
  if (model === "exponential") {
    return Math.pow(d / refDistance, -rolloff);
  }
  return refDistance / (refDistance + rolloff * (d - refDistance));
}

export interface ConeOptions {
  /** Degrees of full gain around `orientation`. Spec default 360 (omni). */
  readonly innerAngle?: number;
  /** Degrees at which gain reaches `outerGain`. Spec default 360. */
  readonly outerAngle?: number;
  /** Linear gain outside the outer cone, [0, 1]. Spec default 0. */
  readonly outerGain?: number;
}

/**
 * Pure cone gain in [0, 1], mirroring PannerNode §6.5 (Blink `ConeEffect::Gain`):
 * the angle between the *source→listener* vector and the source `orientation`.
 * Inside `innerAngle` → 1; outside `outerAngle` → `outerGain`; between → linear
 * interpolation. Zero orientation or a 360°/360° cone → omni (gain 1).
 */
export function computeConeGain(
  emitterPosition: Vec3Like,
  orientation: Vec3Like,
  listenerPosition: Vec3Like,
  cone: ConeOptions = {}
): number {
  const inner = cone.innerAngle ?? 360;
  const outer = cone.outerAngle ?? 360;
  const outerGain = Math.min(1, Math.max(0, cone.outerGain ?? 0));
  const orientationLength = Math.hypot(orientation.x, orientation.y, orientation.z);
  if (orientationLength < Number.EPSILON || (inner === 360 && outer === 360)) return 1;
  const toListener = {
    x: listenerPosition.x - emitterPosition.x,
    y: listenerPosition.y - emitterPosition.y,
    z: listenerPosition.z - emitterPosition.z
  };
  const listenerDistance = Math.hypot(toListener.x, toListener.y, toListener.z);
  if (listenerDistance < Number.EPSILON) return 1;
  const cosAngle = Math.min(
    1,
    Math.max(-1, dot(toListener, orientation) / (listenerDistance * orientationLength))
  );
  const absAngle = (Math.acos(cosAngle) * 180) / Math.PI;
  const absInner = Math.abs(inner) / 2;
  const absOuter = Math.abs(outer) / 2;
  if (absAngle <= absInner) return 1;
  if (absAngle >= absOuter) return outerGain;
  const x = (absAngle - absInner) / (absOuter - absInner);
  return 1 - x + outerGain * x;
}

function dot(a: Vec3Like, b: Vec3Like): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * Pure doppler playback-rate ratio for an emitter/listener pair. Returns 1 when
 * both are stationary relative to each other; clamped to [0.25, 4].
 */
export function computeDopplerShift(
  emitterPosition: Vec3Like,
  emitterVelocity: Vec3Like,
  listenerPosition: Vec3Like,
  listenerVelocity: Vec3Like,
  options: DopplerOptions = {}
): number {
  const speedOfSound = options.speedOfSound ?? SPEED_OF_SOUND_DEFAULT;
  const factor = options.dopplerFactor ?? 1;
  if (!Number.isFinite(speedOfSound) || speedOfSound <= 0 || !Number.isFinite(factor) || factor < 0) return 1;
  const delta = {
    x: emitterPosition.x - listenerPosition.x,
    y: emitterPosition.y - listenerPosition.y,
    z: emitterPosition.z - listenerPosition.z
  };
  const distance = Math.hypot(delta.x, delta.y, delta.z);
  if (distance < Number.EPSILON) return 1;
  // `direction` points from listener to emitter. Closing velocities (movement that
  // shrinks the distance) raise the observed pitch: f' = f(c + vl.r)/(c + ve.r).
  const direction = { x: delta.x / distance, y: delta.y / distance, z: delta.z / distance };
  const emitterRadial = dot(emitterVelocity, direction);
  const listenerRadial = dot(listenerVelocity, direction);
  const shift = (speedOfSound + factor * listenerRadial) / (speedOfSound + factor * emitterRadial);
  if (!Number.isFinite(shift)) return 1;
  return Math.min(DOPPLER_MAX, Math.max(DOPPLER_MIN, shift));
}

/** Resolve an occlusion amount from a hook, a literal, or absence (clear). Always clamped to [0, 1]. */
export function resolveOcclusion(
  occlusion: OcclusionHook | number | undefined,
  emitter: Vec3Like,
  listener: Vec3Like
): number {
  if (occlusion === undefined) return 0;
  const raw = typeof occlusion === "function" ? occlusion(emitter, listener) : occlusion;
  if (!Number.isFinite(raw)) return 0;
  return Math.min(1, Math.max(0, raw));
}

/** Gain multiplier for an occlusion amount: fully blocked still leaks 15% (never fully silent). */
export function applyOcclusionToGain(amount: number): number {
  const clamped = Math.min(1, Math.max(0, amount));
  return 1 - 0.85 * clamped;
}

/** Lowpass cutoff for an occlusion amount: clear = 20kHz, fully blocked ≈ 400Hz. */
export function occlusionLowpassFrequency(amount: number): number {
  const clamped = Math.min(1, Math.max(0, amount));
  return 20_000 * Math.pow(400 / 20_000, clamped);
}

export interface PositionalEmitterOptions {
  readonly context: AudioContextLike;
  readonly destination?: AudioNode;
  readonly clip?: AudioClip;
  readonly volume?: number;
  readonly loop?: boolean;
  readonly position?: Vec3Like;
  /** Direction the emitter's cone axis points (panner `orientationX/Y/Z`). */
  readonly orientation?: Vec3Like;
  readonly velocity?: Vec3Like;
  readonly attenuation?: DistanceAttenuationOptions;
  readonly cone?: ConeOptions;
  /** Panner `panningModel` — "HRTF" (default) or "equalpower". */
  readonly panningModel?: PanningModelType;
  readonly doppler?: DopplerOptions & { readonly enabled?: boolean };
}

export interface PositionalEmitterEvidence {
  readonly kind: "positional-emitter-evidence";
  readonly position: Vec3Like;
  readonly attenuationGain: number;
  /** Cone gain the panner applies (or software applies when headless). */
  readonly coneGain: number;
  /** Effective panner/software distance model for this emitter. */
  readonly distanceModel: DistanceAttenuationModel;
  readonly dopplerShift: number;
  readonly occlusion: number;
  readonly state: AudioSourceState;
  /** False when the context cannot build the panner/filter graph — math is still reported, never faked. */
  readonly connected: boolean;
}

const ZERO_VELOCITY: Vec3Like = { x: 0, y: 0, z: 0 };

/**
 * A positional voice: `AudioSource` (clip + gain) → occlusion lowpass → `SpatialAudio`
 * panner → bus. Reuses both owners instead of forking them; attenuation/doppler math
 * is pure so evidence works headless.
 */
export class PositionalEmitter {
  readonly source: AudioSource;
  readonly spatial: SpatialAudio | undefined;
  private readonly filter: BiquadFilterNode | undefined;
  private readonly baseVolume: number;
  private positionRef: Vec3Like;
  private velocityRef: Vec3Like;
  private orientationRef: Vec3Like;
  private lastListenerPosition: Vec3Like = { x: 0, y: 0, z: 0 };
  private readonly attenuationOptions: DistanceAttenuationOptions;
  private coneOptions: ConeOptions;
  private readonly dopplerOptions: DopplerOptions;
  private readonly dopplerEnabled: boolean;
  private occlusionRef = 0;
  private lastAttenuation = 1;
  private lastCone = 1;
  private lastDoppler = 1;

  constructor(private readonly options: PositionalEmitterOptions) {
    this.baseVolume = options.volume ?? 1;
    this.positionRef = { ...(options.position ?? { x: 0, y: 0, z: 0 }) };
    this.velocityRef = { ...(options.velocity ?? ZERO_VELOCITY) };
    this.orientationRef = { ...(options.orientation ?? { x: 1, y: 0, z: 0 }) };
    this.attenuationOptions = { ...(options.attenuation ?? {}) };
    this.coneOptions = { ...(options.cone ?? {}) };
    this.dopplerOptions = { ...(options.doppler ?? {}) };
    this.dopplerEnabled = options.doppler?.enabled ?? true;
    let spatial: SpatialAudio | undefined;
    let filter: BiquadFilterNode | undefined;
    try {
      spatial = new SpatialAudio({
        context: options.context,
        destination: options.destination,
        position: this.positionRef,
        orientation: this.orientationRef,
        panningModel: options.panningModel,
        distanceModel: this.attenuationOptions.model,
        maxDistance: this.attenuationOptions.maxDistance,
        refDistance: this.attenuationOptions.refDistance,
        rolloffFactor: this.attenuationOptions.rolloffFactor,
        coneInnerAngle: this.coneOptions.innerAngle,
        coneOuterAngle: this.coneOptions.outerAngle,
        coneOuterGain: this.coneOptions.outerGain
      });
      filter = options.context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 20_000;
      filter.connect(spatial.panner);
    } catch {
      spatial = undefined;
      filter = undefined;
    }
    this.spatial = spatial;
    this.filter = filter;
    this.source = new AudioSource({
      context: options.context,
      destination: filter ?? spatial?.panner ?? options.destination,
      clip: options.clip,
      loop: options.loop,
      volume: this.baseVolume
    });
  }

  get position(): Vec3Like {
    return { ...this.positionRef };
  }

  get occlusion(): number {
    return this.occlusionRef;
  }

  get connected(): boolean {
    return this.spatial !== undefined && this.filter !== undefined;
  }

  setPosition(position: Vec3Like): void {
    this.positionRef = { ...position };
    this.spatial?.setPosition(position);
  }

  setVelocity(velocity: Vec3Like): void {
    this.velocityRef = { ...velocity };
  }

  /** Repoint the cone axis; recomputes the cached cone gain against the last listener pose. */
  setOrientation(orientation: Vec3Like): void {
    this.orientationRef = { ...orientation };
    this.spatial?.setOrientation(orientation);
    this.refreshConeGain();
  }

  /** Change the cone shape; recomputes the cached cone gain. */
  setCone(cone: ConeOptions): void {
    this.coneOptions = { ...cone };
    if (this.spatial) {
      if (cone.innerAngle !== undefined) this.spatial.panner.coneInnerAngle = cone.innerAngle;
      if (cone.outerAngle !== undefined) this.spatial.panner.coneOuterAngle = cone.outerAngle;
      if (cone.outerGain !== undefined) this.spatial.panner.coneOuterGain = cone.outerGain;
    }
    this.refreshConeGain();
  }

  setOcclusion(amount: number): void {
    this.occlusionRef = Math.min(1, Math.max(0, amount));
    if (this.filter) {
      this.filter.frequency.value = occlusionLowpassFrequency(this.occlusionRef);
    }
    this.applyGain();
  }

  /**
   * Recompute attenuation + cone + doppler against the listener and push them
   * into the live graph (gain, playback rate, filter). Pure math runs even when
   * headless.
   */
  update(listenerPosition: Vec3Like, listenerVelocity: Vec3Like = ZERO_VELOCITY): PositionalEmitterEvidence {
    this.lastListenerPosition = { ...listenerPosition };
    const distance = Math.hypot(
      this.positionRef.x - listenerPosition.x,
      this.positionRef.y - listenerPosition.y,
      this.positionRef.z - listenerPosition.z
    );
    this.lastAttenuation = computeDistanceAttenuation(distance, this.attenuationOptions);
    this.lastCone = computeConeGain(this.positionRef, this.orientationRef, listenerPosition, this.coneOptions);
    this.lastDoppler = this.dopplerEnabled
      ? computeDopplerShift(this.positionRef, this.velocityRef, listenerPosition, listenerVelocity, this.dopplerOptions)
      : 1;
    this.source.setPlaybackRate(this.lastDoppler, 50);
    this.applyGain();
    return this.evidence();
  }

  play(when = 0): void {
    this.source.play(when);
  }

  stop(when = 0): void {
    this.source.stop(when);
  }

  evidence(): PositionalEmitterEvidence {
    return {
      kind: "positional-emitter-evidence",
      position: { ...this.positionRef },
      attenuationGain: this.lastAttenuation,
      coneGain: this.lastCone,
      distanceModel: this.attenuationOptions.model ?? "inverse",
      dopplerShift: this.lastDoppler,
      occlusion: this.occlusionRef,
      state: this.source.state,
      connected: this.connected
    };
  }

  dispose(): void {
    this.source.dispose();
    this.filter?.disconnect();
    this.spatial?.dispose();
  }

  private refreshConeGain(): void {
    this.lastCone = computeConeGain(this.positionRef, this.orientationRef, this.lastListenerPosition, this.coneOptions);
    this.applyGain();
  }

  /**
   * AU-02 / C10 — distance and cone attenuation are applied EXACTLY ONCE.
   *
   * Connected: the `PannerNode` owns them — `SpatialAudio` mirrors
   * `distanceModel`/`refDistance`/`maxDistance`/`rolloffFactor` and the cone
   * params onto the panner, so the software gain carries only
   * `volume × occlusion` (occlusion is ours; the panner cannot do it).
   * Previously the software gain multiplied `attenuationGain` on top of the
   * panner's own inverse-model gain — the C10 double attenuation.
   *
   * Headless (no panner/filter could be built): the software gain applies the
   * same formulas itself, so the emitter still attenuates rather than playing
   * full volume with `connected: false`.
   */
  private applyGain(): void {
    const occlusionGain = applyOcclusionToGain(this.occlusionRef);
    const spatialGain = this.connected ? 1 : this.lastAttenuation * this.lastCone;
    this.source.setVolume(this.baseVolume * spatialGain * occlusionGain);
  }
}
