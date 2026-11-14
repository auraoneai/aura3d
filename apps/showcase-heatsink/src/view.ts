/**
 * Draw helpers that keep the frame loop allocation-free (audit C20). The per-circuit look is no longer a recolour of
 * a few nodes: a circuit change remounts the scene with its own sky, rig and post (GU47 HS-03, main.ts).
 */
import type { AuraRuntimeNodeHandle } from "@aura3d/engine";
import type { DroneId } from "./data";

function wrapRadians(angle: number): number {
  let a = (angle + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

/**
 * Converts natural hover-drone attitude `Ry(worldYaw) * Rx(pitch) * Rz(roll)` into `@aura3d/engine`'s `"ZYX"`
 * `setRotation(rx, ry, rz)` (`Rz(rz) * Ry(ry) * Rx(rx)`), selecting the continuous branch closest to `worldYaw`
 * so banking or barrel-rolling on `90°` track bends never pitches end-over-end or detaches rotors/plumes.
 */
export function droneEulerZYX(
  pitch: number,
  worldYaw: number,
  roll: number,
  out: [number, number, number] = [0, 0, 0]
): [number, number, number] {
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cy = Math.cos(worldYaw), sy = Math.sin(worldYaw);
  const cr = Math.cos(roll), sr = Math.sin(roll);

  const m00 = cy * cr + sy * sp * sr;
  const m01 = -cy * sr + sy * sp * cr;
  const m10 = cp * sr;
  const m11 = cp * cr;
  const m20 = -sy * cr + cy * sp * sr;
  const m21 = sy * sr + cy * sp * cr;
  const m22 = cy * cp;

  const sinY = Math.max(-1, Math.min(1, -m20));
  if (Math.abs(m20) >= 0.999999) {
    out[0] = 0;
    out[1] = Math.asin(sinY);
    out[2] = Math.atan2(-m01, m11);
    return out;
  }

  const ryA = Math.asin(sinY);
  const rxA = Math.atan2(m21, m22);
  const rzA = Math.atan2(m10, m00);

  const ryB = sinY >= 0 ? Math.PI - ryA : -Math.PI - ryA;
  const rxB = Math.atan2(-m21, -m22);
  const rzB = Math.atan2(-m10, -m00);

  const costA = Math.abs(rxA) + Math.abs(rzA) + 0.35 * Math.abs(wrapRadians(ryA - worldYaw));
  const costB = Math.abs(rxB) + Math.abs(rzB) + 0.35 * Math.abs(wrapRadians(ryB - worldYaw));
  if (costB < costA) {
    out[0] = rxB;
    out[1] = ryB;
    out[2] = rzB;
  } else {
    out[0] = rxA;
    out[1] = ryA;
    out[2] = rzA;
  }
  return out;
}

/**
 * Dense per-frame writer for one instanced node: column-major T·Ry·S matrices into a preallocated buffer, unused
 * slots parked at scale 0 so the instance count (and the node-owned storage) never changes.
 */
export class InstanceWriter {
  private readonly matrices: Float32Array;
  private cursor = 0;
  constructor(private readonly handle: AuraRuntimeNodeHandle, readonly capacity: number) {
    this.matrices = new Float32Array(capacity * 16);
  }
  begin(): void { this.cursor = 0; }
  push(x: number, y: number, z: number, yaw: number, scale: number): void {
    this.pushScaled(x, y, z, yaw, scale, scale, scale);
  }
  /** T·Ry·S with a per-axis scale (HS-15: the lava pool is a scaled gutter instance). */
  pushScaled(x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number): void {
    if (this.cursor >= this.capacity) return;
    const o = this.cursor * 16;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const m = this.matrices;
    m[o] = c * sx; m[o + 1] = 0; m[o + 2] = -s * sx; m[o + 3] = 0;
    m[o + 4] = 0; m[o + 5] = sy; m[o + 6] = 0; m[o + 7] = 0;
    m[o + 8] = s * sz; m[o + 9] = 0; m[o + 10] = c * sz; m[o + 11] = 0;
    m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
    this.cursor += 1;
  }
  /**
   * Full 3-axis Euler pose (`Ry(yaw) * Rx(pitch) * Rz(roll) * S`) with strictly non-negative scales so GPU instancing
   * never splits batches over negative-determinant mirrored scales.
   */
  pushPose(x: number, y: number, z: number, pitch: number, yaw: number, roll: number, sx: number, sy: number, sz: number): void {
    if (this.cursor >= this.capacity) return;
    const psx = Math.max(0, sx);
    const psy = Math.max(0, sy);
    const psz = Math.max(0, sz);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const cy = Math.cos(yaw), syw = Math.sin(yaw);
    const cr = Math.cos(roll), sr = Math.sin(roll);
    // R = Ry(yaw) * Rx(pitch) * Rz(roll), column-major
    const r00 = cy * cr + syw * sp * sr;
    const r10 = cp * sr;
    const r20 = -syw * cr + cy * sp * sr;
    const r01 = -cy * sr + syw * sp * cr;
    const r11 = cp * cr;
    const r21 = syw * sr + cy * sp * cr;
    const r02 = syw * cp;
    const r12 = -sp;
    const r22 = cy * cp;
    const o = this.cursor * 16;
    const m = this.matrices;
    m[o] = r00 * psx; m[o + 1] = r10 * psx; m[o + 2] = r20 * psx; m[o + 3] = 0;
    m[o + 4] = r01 * psy; m[o + 5] = r11 * psy; m[o + 6] = r21 * psy; m[o + 7] = 0;
    m[o + 8] = r02 * psz; m[o + 9] = r12 * psz; m[o + 10] = r22 * psz; m[o + 11] = 0;
    m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
    this.cursor += 1;
  }
  /**
   * Coaxial thruster-plume pose (`Ry(yaw) * Rx(pitch) * Rz(roll) * Rx(+pi/2) * S`) so the plume's `+Y` length axis
   * points strictly along the drone's `+Z` exhaust axis through banks and 360-degree barrel rolls.
   */
  pushThrusterPlumePose(
    x: number,
    y: number,
    z: number,
    pitch: number,
    yaw: number,
    roll: number,
    radialScale: number,
    lengthScale: number
  ): void {
    if (this.cursor >= this.capacity) return;
    const psr = Math.max(0, radialScale);
    const psl = Math.max(0, lengthScale);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const cy = Math.cos(yaw), syw = Math.sin(yaw);
    const cr = Math.cos(roll), sr = Math.sin(roll);
    // R_drone = [c0, c1, c2]; R_plume = R_drone * Rx(+pi/2) = [c0, c2, -c1] (det = +1)
    const c0x = cy * cr + syw * sp * sr;
    const c0y = cp * sr;
    const c0z = -syw * cr + cy * sp * sr;
    const c1x = -cy * sr + syw * sp * cr;
    const c1y = cp * cr;
    const c1z = syw * sr + cy * sp * cr;
    const c2x = syw * cp;
    const c2y = -sp;
    const c2z = cy * cp;
    const o = this.cursor * 16;
    const m = this.matrices;
    m[o] = c0x * psr; m[o + 1] = c0y * psr; m[o + 2] = c0z * psr; m[o + 3] = 0;
    m[o + 4] = c2x * psl; m[o + 5] = c2y * psl; m[o + 6] = c2z * psl; m[o + 7] = 0;
    m[o + 8] = -c1x * psr; m[o + 9] = -c1y * psr; m[o + 10] = -c1z * psr; m[o + 11] = 0;
    m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
    this.cursor += 1;
  }
  park(): void { this.push(0, -60, 0, 0, 0); }
  end(): void {
    while (this.cursor < this.capacity) this.park();
    this.handle.setInstanceMatrices(this.matrices, this.capacity);
  }
}

/**
 * Stable mapping of drawn rivals onto the six non-player drone models: a rival keeps its model while it stays drawn,
 * a newly drawn rival takes a free model. Writes droneId -> rival index into `out` (reused every frame).
 */
export function slotRivals(drawn: readonly number[], bySlot: Map<number, DroneId>, models: readonly DroneId[], out: Map<DroneId, number> = new Map()): Map<DroneId, number> {
  bySlot.forEach((model, rival) => { if (!drawn.includes(rival) || !models.includes(model)) bySlot.delete(rival); });
  out.clear();
  bySlot.forEach((model, rival) => { out.set(model, rival); });
  for (const rival of drawn) {
    if (bySlot.has(rival)) continue;
    let free: DroneId | undefined;
    for (const m of models) if (!out.has(m)) { free = m; break; }
    if (!free) break;
    bySlot.set(rival, free);
    out.set(free, rival);
  }
  return out;
}
