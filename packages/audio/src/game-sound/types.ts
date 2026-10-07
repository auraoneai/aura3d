/**
 * game-sound/types.ts — shared internals for the GameSoundEngine (PRD-09 §7.5).
 *
 * The engine is unit-tested with fake contexts, so every node factory it
 * needs goes through `SoundGraphContext` — a widening of the package's
 * `AudioContextLike` with the optional factories a real `AudioContext`
 * supplies. Missing factories are handled per-feature (e.g. no
 * `createWaveShaper` → the safety clip stage is skipped and reported).
 */

import type { AudioContextLike } from "../AudioContextManager";

export interface SoundGraphContext extends AudioContextLike {
  createDynamicsCompressor?(): DynamicsCompressorNode;
  createWaveShaper?(): WaveShaperNode;
  createMediaElementSource?(element: HTMLMediaElement): MediaElementAudioSourceNode;
  decodeAudioData?(data: ArrayBuffer): Promise<AudioBuffer>;
}

/** Any node a fake can satisfy — connect/disconnect are all the engine uses generically. */
export interface SoundNodeLike {
  connect(destination: SoundNodeLike): SoundNodeLike;
  disconnect(): void;
}

export interface SoundGainLike {
  readonly gain: { value: number; setTargetAtTime?(v: number, t: number, tau: number): void; cancelScheduledValues?(t: number): void; setValueAtTime?(v: number, t: number): void; linearRampToValueAtTime?(v: number, t: number): void };
  connect(destination: SoundNodeLike): SoundNodeLike;
  disconnect(): void;
}

export const dbToGain = (db: number): number => Math.pow(10, db / 20);

export const gainToDb = (gain: number): number => 20 * Math.log10(Math.max(gain, 1e-6));

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Equal-power crossfade gain for mix m ∈ [0,1] (0 → full A, 1 → full B). */
export const equalPower = (m: number): { a: number; b: number } => {
  const t = clamp(m, 0, 1) * Math.PI * 0.5;
  return { a: Math.cos(t), b: Math.sin(t) };
};

export type Vec3 = readonly [number, number, number] | { x: number; y: number; z: number };

export const vec3 = (v: Vec3): { x: number; y: number; z: number } =>
  "x" in v ? v : { x: v[0], y: v[1], z: v[2] };

/** Panner interface as used by the engine (subset of `PannerNode`). */
export interface SoundPannerLike extends SoundNodeLike {
  panningModel?: PanningModelType;
  distanceModel?: DistanceModelType;
  refDistance?: number;
  maxDistance?: number;
  rolloffFactor?: number;
  positionX?: { value: number; setTargetAtTime?(v: number, t: number, tau: number): void };
  positionY?: { value: number; setTargetAtTime?(v: number, t: number, tau: number): void };
  positionZ?: { value: number; setTargetAtTime?(v: number, t: number, tau: number): void };
  setPosition?(x: number, y: number, z: number): void;
  setVelocity?(x: number, y: number, z: number): void;
}

export interface SoundBiquadLike extends SoundNodeLike {
  type?: BiquadFilterType;
  frequency?: { value: number; setTargetAtTime?(v: number, t: number, tau: number): void };
  Q?: { value: number };
}

export interface SoundSourceLike extends SoundNodeLike {
  buffer?: AudioBuffer | null;
  loop?: boolean;
  playbackRate?: { value: number; setTargetAtTime?(v: number, t: number, tau: number): number | void };
  start(when?: number, offset?: number, duration?: number): void;
  stop(when?: number): void;
  onended?: (() => void) | null;
}
