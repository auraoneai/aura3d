// PRD-07 P5-T2 — §8.2 procedural volume source: camera-following rain, snow,
// marine snow and dust motes. The CPU mirror below matches the
// `a3d_prd07_volume` chunk hash-for-hash so a producer can write instance
// buffers (the existing instanced particle path) that agree with generated
// shaders calling a3dProceduralVolumePos directly.

import { PARTICLE_INSTANCE_FLOATS, type ParticleInstanceRing } from "./ParticleInstanceLayout";

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

export type Vec3Tuple = readonly [number, number, number];

export interface VolumeEmitterSpec {
  /** Full extent of the wrap volume centred on the camera. */
  readonly extent: Vec3Tuple;
  /** Per-particle fall velocity (world units/s). */
  readonly fallVelocity: Vec3Tuple;
  /** Sway amplitude per axis. */
  readonly sway: Vec3Tuple;
  readonly swayFreq: number;
  readonly seed?: number;
  /** Particle size (uniform scalar). */
  readonly size: number;
  readonly color: Vec3Tuple;
  readonly alpha: number;
  /** Velocity-stretch factor for rain streaks (0 = camera-facing billboards). */
  readonly stretch?: number;
}

/** §14 presets — rain, snow, marine snow, dust motes. */
export const VOLUME_PRESETS = {
  rain: {
    extent: [40, 24, 40],
    fallVelocity: [0, -9, 0],
    sway: [0.15, 0, 0.15],
    swayFreq: 0.7,
    size: 0.09,
    color: [0.55, 0.62, 0.72],
    alpha: 0.45,
    stretch: 6
  },
  snow: {
    extent: [36, 18, 36],
    fallVelocity: [0, -1.2, 0],
    sway: [0.6, 0.05, 0.6],
    swayFreq: 0.5,
    size: 0.12,
    color: [0.95, 0.96, 1.0],
    alpha: 0.9,
    stretch: 0
  },
  marineSnow: {
    extent: [20, 12, 20],
    fallVelocity: [0, -0.12, 0],
    sway: [0.25, 0.1, 0.25],
    swayFreq: 0.22,
    size: 0.05,
    color: [0.85, 0.9, 0.95],
    alpha: 0.7,
    stretch: 0
  },
  dustMotes: {
    extent: [12, 8, 12],
    fallVelocity: [0, -0.04, 0],
    sway: [0.18, 0.12, 0.18],
    swayFreq: 0.35,
    size: 0.04,
    color: [0.9, 0.85, 0.7],
    alpha: 0.35,
    stretch: 0
  }
} as const satisfies Record<string, VolumeEmitterSpec>;

/**
 * On-screen limits for the camera-following volume sprites. A world-size sprite that passes close to the lens
 * projects to a large soft disc, so each preset carries a cap on its diameter (share of the viewport height,
 * which is the same for every device pixel ratio) and a distance, in metres, under which it fades out.
 * 0.0155 of a 900 px viewport is about 14 px (snow), 0.009 about 8 px (dust motes and marine snow).
 */
export const VOLUME_SPRITE_LIMITS = {
  rain: { maxScreen: 0.04, nearFade: 1 },
  snow: { maxScreen: 0.0155, nearFade: 1 },
  marineSnow: { maxScreen: 0.009, nearFade: 1 },
  dustMotes: { maxScreen: 0.009, nearFade: 1 }
} as const satisfies Record<keyof typeof VOLUME_PRESETS, { readonly maxScreen: number; readonly nearFade: number }>;

/**
 * CPU model of the particle vertex shader's size math for a camera-facing sprite: the projected diameter in
 * pixels at `distance` metres, after the `maxScreen` cap, and the alpha factor of the near fade.
 */
export function volumeSpriteScreenSize(
  size: number,
  distance: number,
  fovYRadians: number,
  viewportHeightPx: number,
  limits: { readonly maxScreen: number; readonly nearFade: number }
): { readonly pixels: number; readonly alpha: number } {
  const d = Math.max(distance, 1e-4);
  const ndcHalf = (size * 0.5) / (d * Math.tan(fovYRadians * 0.5));
  const cappedHalf = limits.maxScreen > 0 && ndcHalf > limits.maxScreen ? limits.maxScreen : ndcHalf;
  const alpha = limits.nearFade > 0 ? clamp(d / limits.nearFade, 0, 1) : 1;
  return { pixels: cappedHalf * viewportHeightPx, alpha };
}

function fract(x: number): number {
  return x - Math.floor(x);
}

/** a3dHash31 — CPU mirror (identical constants to the GLSL chunk). */
export function a3dHash31Cpu(x: number): Vec3Tuple {
  let px = fract(x * 0.1031);
  let py = fract(x * 0.103);
  let pz = fract(x * 0.0973);
  const d = px * (py + 33.33) + py * (pz + 33.33) + pz * (px + 33.33);
  px += d; py += d; pz += d;
  return [
    fract((px + px) * pz + px * py),
    fract((py + pz) * px + py * pz),
    fract((pz + px) * py + pz * px)
  ];
}

/**
 * §8.2 `a3dProceduralVolumePos` CPU mirror: returns the wrapped position of
 * particle `id` at time `t` inside the camera-centred volume.
 */
export function proceduralVolumePos(
  id: number,
  t: number,
  spec: VolumeEmitterSpec,
  cameraPosition: Vec3Tuple
): Vec3Tuple {
  const h = a3dHash31Cpu(id * 0.6180339 + (spec.seed ?? 0));
  const swayPhase = t * spec.swayFreq + h[0] * Math.PI * 2;
  const p: Vec3Tuple = [
    h[0] * spec.extent[0] + spec.fallVelocity[0] * t + spec.sway[0] * Math.sin(swayPhase),
    h[1] * spec.extent[1] + spec.fallVelocity[1] * t + spec.sway[1] * Math.sin(swayPhase),
    h[2] * spec.extent[2] + spec.fallVelocity[2] * t + spec.sway[2] * Math.sin(swayPhase)
  ];
  const o0 = p[0] - cameraPosition[0] + spec.extent[0] * 0.5;
  const o1 = p[1] - cameraPosition[1] + spec.extent[1] * 0.5;
  const o2 = p[2] - cameraPosition[2] + spec.extent[2] * 0.5;
  return [
    cameraPosition[0] + (o0 - Math.floor(o0 / spec.extent[0]) * spec.extent[0]) - spec.extent[0] * 0.5,
    cameraPosition[1] + (o1 - Math.floor(o1 / spec.extent[1]) * spec.extent[1]) - spec.extent[1] * 0.5,
    cameraPosition[2] + (o2 - Math.floor(o2 / spec.extent[2]) * spec.extent[2]) - spec.extent[2] * 0.5
  ];
}

/** §8.2 edge fade — min over axes of the 15% margin ramp. */
export function proceduralVolumeEdgeFade(
  pos: Vec3Tuple,
  spec: VolumeEmitterSpec,
  cameraPosition: Vec3Tuple
): number {
  let f = 1;
  for (let i = 0; i < 3; i += 1) {
    const edge = Math.abs(pos[i] - cameraPosition[i]);
    const denom = Math.max(spec.extent[i] * 0.15, 1e-4);
    f = Math.min(f, clamp((spec.extent[i] * 0.5 - edge) / denom, 0, 1));
  }
  return f;
}

/**
 * §8.2 procedural volume emitter: writes `count` particles into an
 * instance ring each frame (positions via the CPU mirror above), so the
 * draw path is the same instanced particle pass used by CPU emitters.
 * A future GPU-position variant would instead bind `a3d_prd07_volume`.
 */
export class ProceduralVolumeEmitter {
  constructor(private readonly spec: VolumeEmitterSpec, private readonly count: number) {}

  /** Particle count the emitter fills each frame (diagnostics/budget). */
  get particleCount(): number {
    return this.count;
  }

  /** Deterministic positions for all `count` ids at camera `cam`, time `t`. */
  positions(t: number, cam: Vec3Tuple): Float32Array {
    const out = new Float32Array(this.count * 3);
    for (let id = 0; id < this.count; id += 1) {
      const p = proceduralVolumePos(id, t, this.spec, cam);
      out[id * 3] = p[0];
      out[id * 3 + 1] = p[1];
      out[id * 3 + 2] = p[2];
    }
    return out;
  }

  /**
   * §6.2.1-packed instance data for this frame's wrapped positions (alpha
   * scaled by the edge fade). `out` may be a reusable scratch of at least
   * `count * 16` floats; otherwise one is allocated.
   */
  instanceData(t: number, cam: Vec3Tuple, out?: Float32Array): { readonly data: Float32Array; readonly live: number } {
    const required = this.count * PARTICLE_INSTANCE_FLOATS;
    const data = out && out.length >= required ? out : new Float32Array(required);
    for (let id = 0; id < this.count; id += 1) {
      const p = proceduralVolumePos(id, t, this.spec, cam);
      const fade = proceduralVolumeEdgeFade(p, this.spec, cam);
      const i = id * PARTICLE_INSTANCE_FLOATS;
      data[i] = p[0]; data[i + 1] = p[1]; data[i + 2] = p[2];
      data[i + 3] = this.spec.size;
      data[i + 4] = this.spec.fallVelocity[0];
      data[i + 5] = this.spec.fallVelocity[1];
      data[i + 6] = this.spec.fallVelocity[2];
      data[i + 7] = this.spec.stretch ?? 0;
      data[i + 8] = this.spec.color[0];
      data[i + 9] = this.spec.color[1];
      data[i + 10] = this.spec.color[2];
      data[i + 11] = this.spec.alpha * fade;
      data[i + 12] = 0;   // rotation
      data[i + 13] = 0;   // frame
      data[i + 14] = fade; // near-fade seed
      data[i + 15] = 0;
    }
    return { data, live: this.count };
  }

  /**
   * Fill a ParticleInstanceRing with this frame's wrapped positions (alpha
   * scaled by the edge fade). Positions feed the same instanced draw as
   * emitter-driven particles — §6.2.1 layout, 16 floats per particle.
   */
  fillInstanceRing(ring: ParticleInstanceRing, t: number, cam: Vec3Tuple): void {
    const { data, live } = this.instanceData(t, cam);
    ring.write(data, live);
  }
}
