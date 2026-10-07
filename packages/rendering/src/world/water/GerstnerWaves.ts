/**
 * PRD-10 §8.6 / T4.1 — Gerstner waves: the shared CPU/GPU source of truth.
 *
 * Two layers:
 *
 * 1. Spec layer (`GerstnerWaveSpec` → `packGerstnerWaves` → `gerstnerEvaluate`)
 *    mirrors the `a3d_prd10_gerstner` shader chunk exactly: `k = 2π/λ`,
 *    `c = sqrt(9.81/k) * speed`, `f = k·(d·xz − c·t)`, `a = steepness/k`.
 *    The CPU clamps Σ steepness ≤ 1 per the spec's loop-prevention rule.
 *    `water.surface`/`app.world.water(id)` heightAt/normalAt run through
 *    `gerstnerEvaluate`, so physics and pixels share one formula (§"one
 *    source for physics and pixels").
 *
 * 2. Fixture layer (`oceanPresetWaves`, `evaluateWaves`, `waveCompression`)
 *    is the T4.1 move out of `OceanSurface.ts` — the external-parity ocean
 *    fixture consumes them; `OceanSurface.ts` re-exports to keep its public
 *    surface unchanged until T4.7 retires the capture path.
 */
import type { OceanFixturePreset, OceanWaveDescriptor } from "../../OceanSurface.js";

// ------------------------------------------------------------- spec layer --

/** §7.1.6 `AuraGerstnerWave` — authored wave descriptor (metres/degrees). */
export interface GerstnerWaveSpec {
  readonly directionDeg: number;
  readonly wavelength: number;
  readonly steepness: number;
  readonly speed?: number; // multiplier on the dispersion celerity, default 1
}

/** Flat uniform layout matching `a3d_prd10_gerstner` (§8.6). */
export interface GerstnerWaveUniforms {
  /** vec4[8]: dir.x, dir.y, steepness, wavelength — zeros beyond waveCount. */
  readonly waves: Float32Array;
  /** float[8]: speed multiplier per wave — zeros beyond waveCount. */
  readonly waveSpeed: Float32Array;
  readonly waveCount: number;
  /** Steepness values that were rescaled to satisfy Σ ≤ 1 (0 when no clamp). */
  readonly steepnessClamped: number;
}

export const GERSTNER_MAX_WAVES = 8;

/** `waves` presets (§7.1.6): calm/moderate resolve to 4 waves, rough to 8. */
export const GERSTNER_PRESETS: Record<"calm" | "moderate" | "rough", readonly GerstnerWaveSpec[]> = {
  calm: [
    { directionDeg: 0, wavelength: 8.0, steepness: 0.18, speed: 1 },
    { directionDeg: 35, wavelength: 4.2, steepness: 0.14, speed: 1 },
    { directionDeg: 110, wavelength: 2.3, steepness: 0.1, speed: 1 },
    { directionDeg: 220, wavelength: 1.4, steepness: 0.08, speed: 1 }
  ],
  moderate: [
    { directionDeg: 0, wavelength: 12.0, steepness: 0.26, speed: 1 },
    { directionDeg: 28, wavelength: 7.5, steepness: 0.2, speed: 1 },
    { directionDeg: 96, wavelength: 4.1, steepness: 0.16, speed: 1 },
    { directionDeg: 205, wavelength: 2.2, steepness: 0.12, speed: 1 }
  ],
  rough: [
    { directionDeg: 0, wavelength: 16.0, steepness: 0.32, speed: 1.05 },
    { directionDeg: 24, wavelength: 11.0, steepness: 0.26, speed: 1 },
    { directionDeg: 78, wavelength: 7.0, steepness: 0.22, speed: 1 },
    { directionDeg: 150, wavelength: 4.6, steepness: 0.18, speed: 1 },
    { directionDeg: 200, wavelength: 3.2, steepness: 0.15, speed: 1 },
    { directionDeg: 255, wavelength: 2.4, steepness: 0.12, speed: 1 },
    { directionDeg: 315, wavelength: 1.8, steepness: 0.1, speed: 1 },
    { directionDeg: 45, wavelength: 1.2, steepness: 0.08, speed: 1 }
  ]
} as const;

export function resolveGerstnerWaves(waves: readonly GerstnerWaveSpec[] | "calm" | "moderate" | "rough" | undefined): readonly GerstnerWaveSpec[] {
  if (waves === undefined || waves === "moderate") return GERSTNER_PRESETS.moderate;
  if (waves === "calm" || waves === "rough") return GERSTNER_PRESETS[waves];
  return waves;
}

/**
 * Pack specs into the shader's flat uniform layout. Steepness is rescaled
 * uniformly when Σ steepness > 1 (§8.6 loop prevention). `maxWaves` is the
 * tier cap (4 Low / 8 High — §4.5 counts down by tier).
 */
export function packGerstnerWaves(specs: readonly GerstnerWaveSpec[], maxWaves: number = GERSTNER_MAX_WAVES): GerstnerWaveUniforms {
  const capped = specs.slice(0, Math.min(maxWaves, GERSTNER_MAX_WAVES));
  const sum = capped.reduce((s, w) => s + w.steepness, 0);
  const scale = sum > 1 ? 1 / sum : 1;
  const waves = new Float32Array(GERSTNER_MAX_WAVES * 4);
  const waveSpeed = new Float32Array(GERSTNER_MAX_WAVES);
  capped.forEach((w, i) => {
    const rad = (w.directionDeg * Math.PI) / 180;
    waves.set([Math.cos(rad), Math.sin(rad), w.steepness * scale, w.wavelength], i * 4);
    waveSpeed[i] = w.speed ?? 1;
  });
  return { waves, waveSpeed, waveCount: capped.length, steepnessClamped: sum > 1 ? sum - 1 : 0 };
}

export interface GerstnerEvaluation {
  /** Displaced surface point (x, y, z) — xz is displaced by the wave field. */
  readonly position: readonly [number, number, number];
  readonly normal: readonly [number, number, number];
  /** Jacobian proxy `1 − Σ steepness·sin(f)` — crest foam input. */
  readonly crest: number;
}

/** CPU twin of the `a3d_prd10_gerstner` GLSL — keep the two in lockstep. */
export function gerstnerEvaluate(packed: GerstnerWaveUniforms, x: number, z: number, timeSeconds: number): GerstnerEvaluation {
  let px = x;
  let py = 0;
  let pz = z;
  let tx = 1, ty = 0, tz = 0;
  let bx = 0, by = 0, bz = 1;
  let jacobian = 0;
  const { waves, waveSpeed, waveCount } = packed;
  for (let i = 0; i < waveCount; i += 1) {
    const dx = waves[i * 4]!;
    const dz = waves[i * 4 + 1]!;
    const s = waves[i * 4 + 2]!;
    const wavelength = waves[i * 4 + 3]!;
    const k = 6.2831853 / wavelength;
    const c = Math.sqrt(9.81 / k) * waveSpeed[i]!;
    const f = k * (dx * x + dz * z - c * timeSeconds);
    const a = s / k;
    const sinF = Math.sin(f);
    const cosF = Math.cos(f);
    px += dx * a * cosF;
    py += a * sinF;
    pz += dz * a * cosF;
    tx += -dx * dx * s * sinF;
    ty += dx * s * cosF;
    tz += -dx * dz * s * sinF;
    bx += -dx * dz * s * sinF;
    by += dz * s * cosF;
    bz += -dz * dz * s * sinF;
    jacobian += s * sinF;
  }
  // normal = normalize(cross(binormal, tangent))
  const nx = by * tz - bz * ty;
  const ny = bz * tx - bx * tz;
  const nz = bx * ty - by * tx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return {
    position: [px, py, pz],
    normal: [nx / len, ny / len, nz / len],
    crest: 1 - jacobian
  };
}

/** Convenience: surface height only (the `AuraWaterHandle.heightAt` path). */
export function gerstnerHeightAt(packed: GerstnerWaveUniforms, x: number, z: number, timeSeconds: number): number {
  return gerstnerEvaluate(packed, x, z, timeSeconds).position[1];
}

// ---------------------------------------------------------- fixture layer --
// Moved verbatim from OceanSurface.ts (T4.1); OceanSurface re-exports them.

export function oceanPresetWaves(preset: OceanFixturePreset): readonly OceanWaveDescriptor[] {
  if (preset === "calm") {
    return [
      wave(0.045, 0.9, 0.55, [1, 0.12], 0.2),
      wave(0.026, 0.48, 0.42, [0.58, 0.82], 0.18)
    ];
  }
  if (preset === "rough") {
    return [
      wave(0.13, 1.4, 0.86, [1, 0.08], 0.58),
      wave(0.09, 0.82, 0.72, [0.86, 0.5], 0.48),
      wave(0.052, 0.46, 0.58, [0.54, 0.84], 0.42),
      wave(0.032, 0.28, 0.48, [0.35, 0.94], 0.36)
    ];
  }
  if (preset === "storm") {
    return [
      wave(0.18, 1.75, 1.02, [1, 0.06], 0.72),
      wave(0.13, 1.08, 0.88, [0.92, 0.39], 0.62),
      wave(0.082, 0.62, 0.75, [0.76, 0.65], 0.54),
      wave(0.052, 0.36, 0.62, [0.48, 0.88], 0.48),
      wave(0.034, 0.22, 0.52, [0.28, 0.96], 0.42)
    ];
  }
  return [
    wave(0.08, 1.1, 0.72, [1, 0.1], 0.38),
    wave(0.055, 0.68, 0.58, [0.8, 0.6], 0.32),
    wave(0.036, 0.38, 0.46, [0.6, 0.8], 0.28)
  ];
}

function wave(amplitude: number, wavelength: number, speed: number, direction: readonly [number, number], steepness: number): OceanWaveDescriptor {
  const length = Math.hypot(direction[0], direction[1]) || 1;
  return {
    amplitude,
    wavelength,
    speed,
    direction: [round3(direction[0] / length), round3(direction[1] / length)],
    steepness: Math.min(1, steepness)
  };
}

export function evaluateWaves(waves: readonly OceanWaveDescriptor[], x: number, z: number, time: number): {
  readonly height: number;
  readonly horizontalDisplacement: readonly [number, number];
  readonly normal: readonly [number, number, number];
} {
  let height = 0;
  let dx = 0;
  let dz = 0;
  let nx = 0;
  let ny = 1;
  let nz = 0;
  for (const descriptor of waves) {
    const k = (2 * Math.PI) / descriptor.wavelength;
    const omega = descriptor.speed * k;
    const phase = k * (descriptor.direction[0] * x + descriptor.direction[1] * z) - omega * time;
    const sin = Math.sin(phase);
    const cos = Math.cos(phase);
    const q = descriptor.steepness / Math.max(0.0001, descriptor.amplitude * k * waves.length);
    const waveAmplitude = k * descriptor.amplitude;
    height += descriptor.amplitude * sin;
    dx += q * descriptor.amplitude * descriptor.direction[0] * cos;
    dz += q * descriptor.amplitude * descriptor.direction[1] * cos;
    nx -= descriptor.direction[0] * waveAmplitude * cos;
    ny -= q * waveAmplitude * sin;
    nz -= descriptor.direction[1] * waveAmplitude * cos;
  }
  const normalLength = Math.hypot(nx, ny, nz) || 1;
  return {
    height: round3(height),
    horizontalDisplacement: [round3(dx), round3(dz)],
    normal: [round3(nx / normalLength), round3(ny / normalLength), round3(nz / normalLength)]
  };
}

export function waveCompression(waves: readonly OceanWaveDescriptor[], x: number, z: number, time: number): number {
  let compression = 1;
  for (const descriptor of waves) {
    const k = (2 * Math.PI) / descriptor.wavelength;
    const omega = descriptor.speed * k;
    const phase = k * (descriptor.direction[0] * x + descriptor.direction[1] * z) - omega * time;
    compression -= descriptor.steepness * descriptor.amplitude * k * Math.sin(phase) * 0.35;
  }
  return round3(compression);
}

function round3(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
