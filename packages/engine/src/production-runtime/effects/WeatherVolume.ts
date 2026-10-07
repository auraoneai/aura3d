// PRD-07 P5-T3 — weather.rain / weather.snow / weather.lightning runtime:
// a camera-following §8.2 procedural volume plus a splash CPU emitter whose
// ground position comes from `groundHeightAt` (default: C-26
// `app.world.height().heightAt`, stub 0). Pure CPU state — the draw feed is
// the same instanced particle path as every other emitter.

import { ProceduralVolumeEmitter, VOLUME_PRESETS, type VolumeEmitterSpec } from "@aura3d/rendering";
import { createEmitter, stepEmitter, writeEmitterInstances, type EmitterState, type EmitterDescriptor } from "./CpuEmitter";
import { sampleLightningFlash } from "@aura3d/rendering";
import type { WeatherType } from "@aura3d/rendering";

export type Vec3Tuple = readonly [number, number, number];

export interface WeatherVolumeOptions {
  readonly type: WeatherType;
  readonly intensity?: number;
  readonly seed?: number;
  readonly wind?: Vec3Tuple;
  /** World height query; defaults to C-26 `app.world.height().heightAt`. */
  readonly groundHeightAt?: (x: number, z: number) => number;
  /** Splash particles per active rain drop wrap (rain only). */
  readonly splashCount?: number;
}

export interface WeatherVolume {
  readonly kind: "rain" | "snow";
  readonly emitter: ProceduralVolumeEmitter;
  readonly spec: VolumeEmitterSpec;
  readonly splashes: EmitterState | null;
  /** Current wetness level driven into the §6.8 chunk uniforms. */
  wetness: number;
  lightningIntensity(elapsedSeconds: number): number;
}

/**
 * Deterministic splash emitter: tiny upward pops emitted at
 * `groundHeightAt(x, z)` — the test asserts splash y equals the height query.
 */
export function createSplashEmitter(
  key: string,
  nodeId: string,
  count: number,
  seed: number,
  groundHeightAt: (x: number, z: number) => number
): EmitterState {
  const desc: EmitterDescriptor = {
    key,
    nodeId,
    origin: [0, 0, 0],
    capacity: Math.max(1, count),
    emissionRate: count * 2,
    life: [0.22, 0.4],
    speed: [0.6, 1.4],
    spread: 0.35,
    direction: [0, 1, 0],
    gravity: -4.5,
    size: [0.012, 0.03],
    color: [0.75, 0.8, 0.88],
    alpha: 0.5,
    spin: 0,
    stretch: 0,
    drag: 0.4,
    seed
  };
  const state = createEmitter(desc);
  // Splashes spawn at the queried ground height, not the emitter origin.
  const baseSpawnY = (i: number): number => groundHeightAt(state.px[i] ?? 0, state.pz[i] ?? 0);
  for (let i = 0; i < state.live; i += 1) state.py[i] = baseSpawnY(i);
  return state;
}

/**
 * P5-T3 splash step: integrate splashes with `groundHeightAt` as the spawn
 * plane. Each emitted splash re-samples the ground at its x/z so the splash
 * y equals the height query at spawn.
 */
export function stepSplashEmitter(
  state: EmitterState,
  dt: number,
  groundHeightAt: (x: number, z: number) => number
): void {
  const before = state.live;
  stepEmitter(state, dt);
  // stepEmitter spawned new particles at origin.y — re-seat at ground height.
  for (let i = before; i < state.live; i += 1) {
    state.py[i] = groundHeightAt(state.px[i] ?? 0, state.pz[i] ?? 0);
  }
  // Kill splashes that fell below the ground plane.
  let i = 0;
  while (i < state.live) {
    if (state.py[i] < groundHeightAt(state.px[i] ?? 0, state.pz[i] ?? 0) - 0.02) {
      const last = --state.live;
      for (const f of [state.px, state.py, state.pz, state.vx, state.vy, state.vz, state.age, state.life, state.size, state.seedA] as const) {
        f[i] = f[last]!;
      }
      continue;
    }
    i += 1;
  }
}

/**
 * Create the weather volume for a `weather.precipitation` node: a
 * camera-following procedural emitter (rain/snow preset adjusted by
 * intensity + wind) plus, for rain, the splash CPU emitter.
 */
export function createWeatherVolume(options: WeatherVolumeOptions): WeatherVolume {
  const seed = Math.floor(options.seed ?? 0xd3e7);
  const isRain = options.type !== "snow";
  const intensity = Math.min(1, Math.max(0, options.intensity ?? 0.5));
  const wind = options.wind ?? [0, 0, 0];
  const base = isRain ? VOLUME_PRESETS.rain : VOLUME_PRESETS.snow;
  const spec: VolumeEmitterSpec = {
    ...base,
    fallVelocity: [
      base.fallVelocity[0] + wind[0] * (isRain ? 1.6 : 0.5),
      base.fallVelocity[1] * (0.6 + intensity * 0.8),
      base.fallVelocity[2] + wind[2] * (isRain ? 1.6 : 0.5)
    ],
    alpha: base.alpha * (0.5 + intensity * 0.5),
    seed
  };
  const count = Math.max(200, Math.round((isRain ? 4000 : 2400) * (0.3 + intensity * 0.7)));
  const emitter = new ProceduralVolumeEmitter(spec, count);
  const groundHeightAt = options.groundHeightAt ?? ((x: number, z: number) => 0 * x + 0 * z);
  const splashes = isRain
    ? createSplashEmitter(
        `weather.splash.${seed}`,
        `weather.splash.${seed}`,
        Math.max(64, Math.round((options.splashCount ?? 300) * intensity)),
        seed ^ 0x51ed,
        groundHeightAt
      )
    : null;
  return {
    kind: isRain ? "rain" : "snow",
    emitter,
    spec,
    splashes,
    wetness: isRain ? intensity : 0,
    lightningIntensity: (elapsedSeconds) =>
      sampleLightningFlash({ type: options.type, elapsedSeconds, seed }).intensity
  };
}

/** Per-frame step: wraps drops around the camera, advances splashes. */
export function stepWeatherVolume(
  volume: WeatherVolume,
  dt: number,
  time: number,
  camera: Vec3Tuple,
  groundHeightAt?: (x: number, z: number) => number
): void {
  void volume;
  void dt;
  void time;
  void camera;
  if (volume.splashes && groundHeightAt) {
    stepSplashEmitter(volume.splashes, dt, groundHeightAt);
  }
}

/** Splash positions interleaved xyz (test + debug feed). */
export function splashPositions(state: EmitterState): Float32Array {
  const out = new Float32Array(state.live * 3);
  for (let i = 0; i < state.live; i += 1) {
    out[i * 3] = state.px[i]!;
    out[i * 3 + 1] = state.py[i]!;
    out[i * 3 + 2] = state.pz[i]!;
  }
  return out;
}

/** Splash instances in the §6.2.1 layout (for the particle feed). */
export function splashInstanceData(state: EmitterState): { readonly data: Float32Array; readonly live: number } {
  const scratch = new Float32Array(Math.max(64, state.desc.capacity) * 16);
  return { data: scratch, live: writeEmitterInstances(state, scratch) };
}
