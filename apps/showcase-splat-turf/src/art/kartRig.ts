/**
 * Moving parts for the Idol karts (presentation only). Idol returns one rigid mesh, so the hero and rival kart bodies are
 * generated WITHOUT wheels (`turfHeroKartBody`, `turfRivalKartBody`) and get separate Idol wheels (`turfKartWheel`, one
 * instanced draw for every wheel in the scene) that roll by distance / radius and steer; the rival karts also carry a
 * separate rotary scrub brush (`turfScrubBrush`) that spins like the old procedural hydro-scrubber.
 *
 * Matrices are column-major, rotations follow the engine's `rotationXYZ` (R = Rz · Ry · Rx), and every GLB is in its
 * normalised frame (grounded at y = 0, centred in x/z, front +Z).
 */
import type { AuraApp } from "@aura3d/engine";

type NodeHandle = ReturnType<AuraApp["nodes"]["require"]>;
export type Mat4 = Float32Array;
export type Vec3 = readonly [number, number, number];

export function identity(): Mat4 {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function multiply(a: Mat4, b: Mat4, out: Mat4 = new Float32Array(16)): Mat4 {
  const r = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let row = 0; row < 4; row++) {
      r[c * 4 + row] = a[row]! * b[c * 4]! + a[4 + row]! * b[c * 4 + 1]! + a[8 + row]! * b[c * 4 + 2]! + a[12 + row]! * b[c * 4 + 3]!;
    }
  }
  out.set(r);
  return out;
}

/** `T(t) · Rz · Ry · Rx · S(s)` (the engine's node transform order). */
export function trs(t: Vec3, rot: Vec3 = [0, 0, 0], s: number | Vec3 = 1): Mat4 {
  const [x, y, z] = rot;
  const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
  // R = Rz · Ry · Rx, columns
  const r00 = cz * cy, r10 = sz * cy, r20 = -sy;
  const r01 = cz * sy * sx - sz * cx, r11 = sz * sy * sx + cz * cx, r21 = cy * sx;
  const r02 = cz * sy * cx + sz * sx, r12 = sz * sy * cx - cz * sx, r22 = cy * cx;
  const [kx, ky, kz] = typeof s === "number" ? [s, s, s] : s;
  const m = new Float32Array(16);
  m[0] = r00 * kx; m[1] = r10 * kx; m[2] = r20 * kx;
  m[4] = r01 * ky; m[5] = r11 * ky; m[6] = r21 * ky;
  m[8] = r02 * kz; m[9] = r12 * kz; m[10] = r22 * kz;
  m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; m[15] = 1;
  return m;
}

export function transformPoint(m: Mat4, p: Vec3): Vec3 {
  return [
    m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!,
    m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!,
    m[2]! * p[0] + m[6]! * p[1] + m[10]! * p[2] + m[14]!
  ];
}

/** A kart body's wheel layout in its own GLB frame: hubs `[x, y, z]` (front pair first) and the rolling radius. */
export interface KartLayout {
  readonly hubs: readonly Vec3[];
  readonly wheelRadius: number;
  /** Width of the tyre across the axle (m). */
  readonly wheelWidth: number;
}

/** Normalised `turfKartWheel` GLB: axle along X, tyre grounded at y = 0 (diameter = `dims[1]`, width = `dims[0]`). */
export interface WheelGlb {
  readonly dims: Vec3;
}

/** Wheel matrix in the kart frame: `T(hub) · Ry(steer) · Rx(spin) · S · T(0, -h/2, 0)` with the tyre sized to the layout. */
export function wheelLocal(layout: KartLayout, glb: WheelGlb, i: number, spin: number, steer: number): Mat4 {
  const hub = layout.hubs[i]!;
  const s = (2 * layout.wheelRadius) / glb.dims[1];
  const sx = layout.wheelWidth / glb.dims[0];
  const mirror = hub[0] < 0 ? Math.PI : 0; // outer face (rim) always faces away from the body
  const steerYaw = i < 2 ? steer : 0;
  return multiply(
    trs(hub, [0, steerYaw + mirror, 0]),
    multiply(trs([0, 0, 0], [mirror === 0 ? spin : -spin, 0, 0]), trs([0, -glb.dims[1] / 2, 0], [0, 0, 0], [sx, s, s]))
  );
}

/** Dense instance-matrix writer for one `instances.model` node (unused capacity is parked below the road). */
export class MatrixWriter {
  readonly matrices: Float32Array;
  private n = 0;
  constructor(readonly capacity: number) {
    this.matrices = new Float32Array(capacity * 16);
  }
  begin(): void { this.n = 0; }
  push(m: Mat4): void {
    if (this.n >= this.capacity) return;
    this.matrices.set(m, this.n * 16);
    this.n++;
  }
  get count(): number { return this.n; }
  end(handle: NodeHandle): void {
    if (this.n === 0) this.push(trs([0, -60, 0], [0, 0, 0], 0.001));
    handle.setInstanceMatrices?.(this.matrices, this.n);
  }
}

/** Translation, Euler angles (engine order R = Rz · Ry · Rx) and uniform scale of a rigid, uniformly scaled matrix. */
export function decompose(m: Mat4): { t: Vec3; rot: Vec3; s: number } {
  const s = Math.hypot(m[0]!, m[1]!, m[2]!) || 1;
  const r00 = m[0]! / s, r10 = m[1]! / s, r20 = m[2]! / s, r21 = m[6]! / s, r22 = m[10]! / s;
  const ry = Math.asin(Math.max(-1, Math.min(1, -r20)));
  return { t: [m[12]!, m[13]!, m[14]!], rot: [Math.atan2(r21, r22), ry, Math.atan2(r10, r00)], s };
}
