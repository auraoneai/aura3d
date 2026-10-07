// PRD-07 P5-T1 — §8.3 GPU particle sim: two single-target rgba32f ping-pong
// passes (position / velocity) per step, ring emission, value-noise curl,
// plane/heightfield collision. Gated on C-28 `probe.floatColorBuffer`; when
// false the caller falls back to the CPU emitter and reports
// PARTICLE_GPU_UNAVAILABLE. State targets register with the C-29
// resourceRegistrySlot so device-loss rebuilds recreate them.

import { Geometry } from "../Geometry";
import { VertexBuffer } from "../VertexBuffer";
import { VertexFormat } from "../VertexFormat";
import type { RenderDevice, RenderShaderProgram, RenderTarget } from "../RenderDevice";
import type { Texture } from "../Texture";
import type { DeviceProbe } from "../contracts/device";
import { resourceRegistrySlot } from "../contracts/rendererFactory";
import type { QrFlags } from "../contracts";
import { TextureBinding } from "../TextureBinding";
import {
  PRD07_GPU_SIM_MARKER,
  gpuSimPositionFragmentSource,
  gpuSimVelocityFragmentSource,
  gpuSimVertexSource
} from "./shaders/gpu-sim.glsl";

export interface GpuSimEmitterSpec {
  readonly origin: readonly [number, number, number];
  readonly direction: readonly [number, number, number];
  readonly spread: number;
  readonly speed: readonly [number, number];
  readonly discRadius?: number;
}

export interface GpuSimSpec {
  /** Particle capacity; state textures are width × ceil(capacity/width). */
  readonly capacity: number;
  /** Texel grid width (default: next power of two ≥ sqrt(capacity)). */
  readonly stateWidth?: number;
  readonly gravity?: readonly [number, number, number];
  readonly wind?: readonly [number, number, number];
  readonly drag?: number;
  readonly noiseFreq?: number;
  readonly noiseScroll?: number;
  readonly noiseStrength?: number;
  readonly groundPlane?: number;
  readonly bounce?: number;
  readonly lifeLoss?: number;
  readonly lifetimeMax: number;
  readonly emitter?: GpuSimEmitterSpec;
  readonly seed?: number;
  readonly useHeightfield?: boolean;
  readonly heightfield?: Texture;
  readonly heightUvScale?: number;
  readonly heightMax?: number;
}

export interface ParticleGpuSimState {
  /** Current (post-step) state textures. */
  readonly posTexture: Texture;
  readonly velTexture: Texture;
  /** Current state targets — exposed for readback (specs/tests) and device-loss rebuilds. */
  readonly posTarget: RenderTarget;
  readonly velTarget: RenderTarget;
  readonly capacity: number;
  readonly width: number;
  readonly height: number;
  /** Ring head — index of the next slot to emit into. */
  readonly head: number;
  readonly frame: number;
}

/* ------------------------------------------------------------------ *
 * CPU mirror — byte-for-byte the GLSL §8.3 formula. Used by the parity
 * browser spec (gpu-sim-parity.spec.ts) and as the CPU fallback path.
 * ------------------------------------------------------------------ */

const U32 = (x: number): number => x >>> 0;

function a3dHash(x: number): number {
  let v = U32(x + 0x6d2b79f5);
  let t = Math.imul(v ^ (v >>> 15), 1 | v);
  t = U32((t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t);
  return U32(t ^ (t >>> 14));
}
const a3dRand01 = (h: number): number => h * (1 / 4294967296);
const a3dRand3 = (h: number): [number, number, number] => [
  a3dRand01(a3dHash(h)),
  a3dRand01(a3dHash(U32(h ^ 0x9e3779b9))),
  a3dRand01(a3dHash(U32(h ^ 0x85ebca6b)))
];

function a3dLattice(cx: number, cy: number, cz: number): number {
  return a3dRand01(a3dHash(U32((Math.imul(cx, 3) ^ Math.imul(cy, 7) ^ Math.imul(cz, 13)) | 0)));
}

/** 3D value noise — identical constants to the GLSL a3dValueNoise. */
export function a3dValueNoise(px: number, py: number, pz: number): number {
  const ix = Math.floor(px), iy = Math.floor(py), iz = Math.floor(pz);
  const fx = px - ix, fy = py - iy, fz = pz - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
  const n000 = a3dLattice(ix, iy, iz), n100 = a3dLattice(ix + 1, iy, iz);
  const n010 = a3dLattice(ix, iy + 1, iz), n110 = a3dLattice(ix + 1, iy + 1, iz);
  const n001 = a3dLattice(ix, iy, iz + 1), n101 = a3dLattice(ix + 1, iy, iz + 1);
  const n011 = a3dLattice(ix, iy + 1, iz + 1), n111 = a3dLattice(ix + 1, iy + 1, iz + 1);
  const nx00 = mix(n000, n100, ux), nx10 = mix(n010, n110, ux);
  const nx01 = mix(n001, n101, ux), nx11 = mix(n011, n111, ux);
  return mix(mix(nx00, nx10, uy), mix(nx01, nx11, uy), uz) * 2 - 1;
}

const CURL_E = 0.1;
const CURL_O1 = [31.416, -47.853, 12.793] as const;
const CURL_O2 = [-233.145, -11.719, 95.637] as const;

/** Curl of F = (N(p), N(p+o1), N(p+o2)) — identical to the GLSL. */
export function a3dCurlNoise(px: number, py: number, pz: number): [number, number, number] {
  const inv = 1 / (2 * CURL_E);
  const dFx_dz = (a3dValueNoise(px, py, pz + CURL_E) - a3dValueNoise(px, py, pz - CURL_E)) * inv;
  const dFx_dy = (a3dValueNoise(px, py + CURL_E, pz) - a3dValueNoise(px, py - CURL_E, pz)) * inv;
  const dFy_dx = (a3dValueNoise(px + CURL_E + CURL_O1[0], py + CURL_O1[1], pz + CURL_O1[2]) - a3dValueNoise(px - CURL_E + CURL_O1[0], py + CURL_O1[1], pz + CURL_O1[2])) * inv;
  const dFy_dz = (a3dValueNoise(px + CURL_O1[0], py + CURL_O1[1], pz + CURL_E + CURL_O1[2]) - a3dValueNoise(px + CURL_O1[0], py + CURL_O1[1], pz - CURL_E + CURL_O1[2])) * inv;
  const dFz_dx = (a3dValueNoise(px + CURL_E + CURL_O2[0], py + CURL_O2[1], pz + CURL_O2[2]) - a3dValueNoise(px - CURL_E + CURL_O2[0], py + CURL_O2[1], pz + CURL_O2[2])) * inv;
  const dFz_dy = (a3dValueNoise(px + CURL_O2[0], py + CURL_E + CURL_O2[1], pz + CURL_O2[2]) - a3dValueNoise(px + CURL_O2[0], py - CURL_E + CURL_O2[1], pz + CURL_O2[2])) * inv;
  return [dFz_dy - dFy_dz, dFx_dz - dFz_dx, dFy_dx - dFx_dy];
}

function inRing(index: number, head: number, count: number, capacity: number): boolean {
  let m = index - head;
  if (m < 0) m += capacity;
  return m >= 0 && m < count;
}

/** Emit slot `index` — identical hashing to the GLSL a3dEmit. */
export function gpuSimEmit(index: number, seed: number, frame: number, spec: GpuSimSpec, pos: Float32Array, vel: Float32Array): void {
  const e = spec.emitter ?? { origin: [0, 0, 0] as const, direction: [0, 1, 0] as const, spread: 0, speed: [1, 1] as const };
  const h = a3dHash(U32(U32(index) ^ U32(seed) ^ Math.imul(U32(frame), 0x9e3779b9)));
  const r = a3dRand01(h);
  const j = a3dRand3(U32(h ^ 0x51ed270b)).map((v) => (v - 0.5) * 2 * e.spread) as [number, number, number];
  const dl = Math.hypot(e.direction[0] + j[0], e.direction[1] + j[1], e.direction[2] + j[2]) || 1;
  const theta = a3dRand01(U32(h ^ 0x27d4eb2f)) * Math.PI * 2;
  const disc = e.discRadius ?? 0.05;
  pos[index * 4] = e.origin[0] + Math.cos(theta) * disc;
  pos[index * 4 + 1] = e.origin[1];
  pos[index * 4 + 2] = e.origin[2] + Math.sin(theta) * disc;
  pos[index * 4 + 3] = 0;
  const speed = e.speed[0] + (e.speed[1] - e.speed[0]) * r;
  vel[index * 4] = ((e.direction[0] + j[0]) / dl) * speed;
  vel[index * 4 + 1] = ((e.direction[1] + j[1]) / dl) * speed;
  vel[index * 4 + 2] = ((e.direction[2] + j[2]) / dl) * speed;
  vel[index * 4 + 3] = a3dRand01(U32(h ^ 0x165667b1));
}

/**
 * One §8.3 step across the whole state (CPU mirror of a3dSimStep).
 * `pos`/`vel` are rgba32f state (pos.xyz+age, vel.xyz+seed), length
 * capacity*4; `emitHead`/`emitCount` select ring slots for (re)emission.
 */
export function gpuSimCpuStep(
  pos: Float32Array,
  vel: Float32Array,
  spec: GpuSimSpec,
  dt: number,
  time: number,
  frame: number,
  emitHead: number,
  emitCount: number,
  heightAt?: (x: number, z: number) => number
): void {
  const g = spec.gravity ?? [0, -9.8, 0];
  const w = spec.wind ?? [0, 0, 0];
  const drag = spec.drag ?? 0;
  const nf = spec.noiseFreq ?? 0, ns = spec.noiseScroll ?? 0, nstr = spec.noiseStrength ?? 0;
  const groundPlane = spec.groundPlane ?? Number.NEGATIVE_INFINITY;
  const bounce = spec.bounce ?? 0.5;
  const lifeLoss = spec.lifeLoss ?? 0;
  const seed = spec.seed ?? 0;
  const capacity = spec.capacity;
  const expDrag = Math.exp(-drag * dt);
  for (let index = 0; index < capacity; index += 1) {
    const i = index * 4;
    if (inRing(index, emitHead, emitCount, capacity)) {
      gpuSimEmit(index, seed, frame, spec, pos, vel);
      continue;
    }
    if (pos[i + 3] >= spec.lifetimeMax) continue;
    let curlX = 0, curlY = 0, curlZ = 0;
    if (nstr !== 0) {
      const c = a3dCurlNoise(pos[i] * nf + time * ns, pos[i + 1] * nf + time * ns, pos[i + 2] * nf + time * ns);
      curlX = c[0] * nstr; curlY = c[1] * nstr; curlZ = c[2] * nstr;
    }
    vel[i] = (vel[i] + (g[0] + w[0] + curlX) * dt) * expDrag;
    vel[i + 1] = (vel[i + 1] + (g[1] + w[1] + curlY) * dt) * expDrag;
    vel[i + 2] = (vel[i + 2] + (g[2] + w[2] + curlZ) * dt) * expDrag;
    pos[i] += vel[i] * dt;
    pos[i + 1] += vel[i + 1] * dt;
    pos[i + 2] += vel[i + 2] * dt;
    pos[i + 3] += dt;
    const ground = spec.useHeightfield && heightAt ? heightAt(pos[i], pos[i + 2]) : groundPlane;
    if (pos[i + 1] < ground) {
      pos[i + 1] = ground;
      vel[i + 1] = -vel[i + 1] * bounce;
      vel[i] *= 0.7;
      vel[i + 2] *= 0.7;
      pos[i + 3] += lifeLoss;
    }
  }
}

/* ------------------------------------------------------------------ *
 * GPU driver
 * ------------------------------------------------------------------ */

let fullscreen: Geometry | null = null;

function fullscreenTriangle(): Geometry {
  if (fullscreen) return fullscreen;
  const vertices = new VertexBuffer(VertexFormat.P3, 3);
  vertices.setAttribute(0, "position", [-1, -1, 0]);
  vertices.setAttribute(1, "position", [3, -1, 0]);
  vertices.setAttribute(2, "position", [-1, 3, 0]);
  fullscreen = new Geometry(vertices, null, "triangles", { min: [-1, -1, 0], max: [3, 3, 0] });
  return fullscreen;
}

/** True when the device can render to rgba32f (EXT_color_buffer_float, C-28). */
export function particleGpuSimAvailable(device: RenderDevice): boolean {
  return device.probe?.floatColorBuffer === true;
}

export class ParticleGpuSim {
  private readonly width: number;
  private readonly height: number;
  private readonly spec: GpuSimSpec;
  private pos: [RenderTarget, RenderTarget] | null = null;
  private vel: [RenderTarget, RenderTarget] | null = null;
  private read = 0;
  private head = 0;
  private frame = 0;
  private posProgram: RenderShaderProgram | null = null;
  private velProgram: RenderShaderProgram | null = null;

  constructor(
    private readonly device: RenderDevice,
    spec: GpuSimSpec,
    flags?: QrFlags
  ) {
    this.spec = spec;
    this.width = spec.stateWidth ?? Math.max(1, Math.ceil(Math.sqrt(spec.capacity)));
    this.height = Math.ceil(spec.capacity / this.width);
    this.allocate();
    // C-29 — rebuild the state textures on device restore.
    const registryFactory = flags ? resourceRegistrySlot.get(flags) : null;
    registryFactory?.().register(this, { kind: "prd07.gpuSim", rebuild: () => this.allocate() });
  }

  /** Capability check per P5-T1: false → caller keeps the CPU emitter. */
  static isAvailable(probe: DeviceProbe | undefined): boolean {
    return probe?.floatColorBuffer === true;
  }

  private allocate(): void {
    const desc = { width: this.width, height: this.height, format: "rgba32f" as const, label: "prd07.gpuSim" };
    this.pos = [this.device.createRenderTarget(desc), this.device.createRenderTarget({ ...desc, label: "prd07.gpuSim.pos" })];
    this.vel = [this.device.createRenderTarget(desc), this.device.createRenderTarget({ ...desc, label: "prd07.gpuSim.vel" })];
    // Dead state: age = +∞ so every slot reads past u_lifetimeMax.
    for (const target of [...this.pos, ...this.vel]) {
      this.device.setRenderTarget(target);
      this.device.clearRenderTarget?.([0, 0, 0, 1e9]);
    }
    this.device.setRenderTarget(null);
  }

  get state(): ParticleGpuSimState | null {
    if (!this.pos || !this.vel) return null;
    return {
      posTexture: this.pos[this.read].colorTexture,
      velTexture: this.vel[this.read].colorTexture,
      posTarget: this.pos[this.read],
      velTarget: this.vel[this.read],
      capacity: this.spec.capacity,
      width: this.width,
      height: this.height,
      head: this.head,
      frame: this.frame
    };
  }

  private program(kind: "pos" | "vel"): RenderShaderProgram {
    if (kind === "pos" && this.posProgram) return this.posProgram;
    if (kind === "vel" && this.velProgram) return this.velProgram;
    const program = this.device.createShaderProgram({
      label: `prd07.gpuSim.${kind}`,
      vertex: gpuSimVertexSource(),
      fragment: kind === "pos" ? gpuSimPositionFragmentSource() : gpuSimVelocityFragmentSource(),
      marker: PRD07_GPU_SIM_MARKER
    });
    if (kind === "pos") this.posProgram = program;
    else this.velProgram = program;
    return program;
  }

  private uniforms(dt: number, emitCount: number, time: number): Map<string, import("../RenderDevice").UniformValue> {
    const s = this.spec;
    const e = s.emitter ?? { origin: [0, 0, 0] as const, direction: [0, 1, 0] as const, spread: 0, speed: [1, 1] as const, discRadius: 0.05 };
    const u = new Map<string, import("../RenderDevice").UniformValue>();
    const pos = this.pos!;
    const vel = this.vel!;
    u.set("u_prevPos", new TextureBinding({ name: "u_prevPos", texture: pos[this.read].colorTexture }));
    u.set("u_prevVel", new TextureBinding({ name: "u_prevVel", texture: vel[this.read].colorTexture }));
    u.set("u_stateWidth", this.width);
    u.set("u_capacity", s.capacity);
    u.set("u_emitHead", this.head);
    u.set("u_emitCount", emitCount);
    u.set("u_frame", this.frame);
    u.set("u_seed", s.seed ?? 0);
    u.set("u_dt", dt);
    u.set("u_time", time);
    u.set("u_gravity", [...(s.gravity ?? [0, -9.8, 0])]);
    u.set("u_wind", [...(s.wind ?? [0, 0, 0])]);
    u.set("u_drag", s.drag ?? 0);
    u.set("u_noiseFreq", s.noiseFreq ?? 0);
    u.set("u_noiseScroll", s.noiseScroll ?? 0);
    u.set("u_noiseStrength", s.noiseStrength ?? 0);
    u.set("u_groundPlane", s.groundPlane ?? Number.NEGATIVE_INFINITY);
    u.set("u_bounce", s.bounce ?? 0.5);
    u.set("u_lifeLoss", s.lifeLoss ?? 0);
    u.set("u_useHeightfield", s.useHeightfield ? 1 : 0);
    u.set("u_heightfield", new TextureBinding({ name: "u_heightfield", texture: s.heightfield ?? null, required: false }));
    u.set("u_heightUvScale", s.heightUvScale ?? 1);
    u.set("u_heightMax", s.heightMax ?? 1);
    u.set("u_lifetimeMax", s.lifetimeMax);
    u.set("u_emitOrigin", [...e.origin]);
    u.set("u_emitDirection", [...e.direction]);
    u.set("u_emitSpread", e.spread);
    u.set("u_emitSpeed", [...e.speed]);
    u.set("u_emitDisc", e.discRadius ?? 0.05);
    return u;
  }

  /** One §8.3 step: pos pass then vel pass, then ping-pong swap. */
  step(dt: number, emitCount = 0, time = 0): ParticleGpuSimState {
    if (!this.pos || !this.vel) throw new Error("ParticleGpuSim not allocated");
    const geometry = fullscreenTriangle();
    const uniforms = this.uniforms(dt, emitCount, time);
    const write = 1 - this.read;
    for (const [kind, target] of [
      ["pos", this.pos[write]],
      ["vel", this.vel[write]]
    ] as const) {
      this.device.setRenderTarget(target);
      this.device.draw({
        label: `prd07.gpuSim.${kind}`,
        topology: "triangles",
        vertexBuffer: geometry.vertexBuffer.upload(this.device),
        vertexFormat: geometry.vertexBuffer.format,
        vertexCount: 3,
        shader: this.program(kind),
        uniforms,
        renderState: { depthTest: false, depthWrite: false, cullMode: "none", blend: false, depthCompare: "always" }
      });
    }
    this.device.setRenderTarget(null);
    this.read = write;
    this.head = (this.head + Math.max(0, emitCount)) % this.spec.capacity;
    this.frame += 1;
    return this.state!;
  }

  dispose(): void {
    for (const t of [...(this.pos ?? []), ...(this.vel ?? [])]) t.dispose();
    this.pos = null;
    this.vel = null;
    this.posProgram?.dispose();
    this.velProgram?.dispose();
    this.posProgram = null;
    this.velProgram = null;
  }
}
