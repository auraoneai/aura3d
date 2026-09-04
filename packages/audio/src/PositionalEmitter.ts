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
 */
export function computeDistanceAttenuation(distance: number, options: DistanceAttenuationOptions = {}): number {
  if (!Number.isFinite(distance) || distance < 0) return 1;
  const refDistance = Math.max(Number.EPSILON, options.refDistance ?? 1);
  const maxDistance = Math.max(refDistance, options.maxDistance ?? 10_000);
  const rolloff = Math.max(0, options.rolloffFactor ?? 1);
  const model = options.model ?? "inverse";
  if (distance <= refDistance) return 1;
  if (distance >= maxDistance) return 0;
  if (model === "linear") {
    return Math.max(0, 1 - rolloff * ((distance - refDistance) / (maxDistance - refDistance)));
  }
  if (model === "exponential") {
    return Math.pow(distance / refDistance, -rolloff);
  }
  return refDistance / (refDistance + rolloff * (distance - refDistance));
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
  readonly velocity?: Vec3Like;
  readonly attenuation?: DistanceAttenuationOptions;
  readonly doppler?: DopplerOptions & { readonly enabled?: boolean };
}

export interface PositionalEmitterEvidence {
  readonly kind: "positional-emitter-evidence";
  readonly position: Vec3Like;
  readonly attenuationGain: number;
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
  private readonly attenuationOptions: DistanceAttenuationOptions;
  private readonly dopplerOptions: DopplerOptions;
  private readonly dopplerEnabled: boolean;
  private occlusionRef = 0;
  private lastAttenuation = 1;
  private lastDoppler = 1;

  constructor(private readonly options: PositionalEmitterOptions) {
    this.baseVolume = options.volume ?? 1;
    this.positionRef = { ...(options.position ?? { x: 0, y: 0, z: 0 }) };
    this.velocityRef = { ...(options.velocity ?? ZERO_VELOCITY) };
    this.attenuationOptions = { ...(options.attenuation ?? {}) };
    this.dopplerOptions = { ...(options.doppler ?? {}) };
    this.dopplerEnabled = options.doppler?.enabled ?? true;
    let spatial: SpatialAudio | undefined;
    let filter: BiquadFilterNode | undefined;
    try {
      spatial = new SpatialAudio({
        context: options.context,
        destination: options.destination,
        position: this.positionRef,
        maxDistance: this.attenuationOptions.maxDistance,
        refDistance: this.attenuationOptions.refDistance,
        rolloffFactor: this.attenuationOptions.rolloffFactor
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

  setOcclusion(amount: number): void {
    this.occlusionRef = Math.min(1, Math.max(0, amount));
    if (this.filter) {
      this.filter.frequency.value = occlusionLowpassFrequency(this.occlusionRef);
    }
    this.applyGain();
  }

  /**
   * Recompute attenuation + doppler against the listener and push them into the
   * live graph (gain, playback rate, filter). Pure math runs even when headless.
   */
  update(listenerPosition: Vec3Like, listenerVelocity: Vec3Like = ZERO_VELOCITY): PositionalEmitterEvidence {
    const distance = Math.hypot(
      this.positionRef.x - listenerPosition.x,
      this.positionRef.y - listenerPosition.y,
      this.positionRef.z - listenerPosition.z
    );
    this.lastAttenuation = computeDistanceAttenuation(distance, this.attenuationOptions);
    this.lastDoppler = this.dopplerEnabled
      ? computeDopplerShift(this.positionRef, this.velocityRef, listenerPosition, listenerVelocity, this.dopplerOptions)
      : 1;
    this.source.playbackRate = this.lastDoppler;
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

  private applyGain(): void {
    this.source.setVolume(this.baseVolume * this.lastAttenuation * applyOcclusionToGain(this.occlusionRef));
  }
}
