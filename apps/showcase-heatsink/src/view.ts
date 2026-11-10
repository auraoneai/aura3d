/**
 * Draw helpers that keep the frame loop allocation-free (audit C20). The per-circuit look is no longer a recolour of
 * a few nodes: a circuit change remounts the scene with its own sky, rig and post (GU47 HS-03, main.ts).
 */
import type { AuraRuntimeNodeHandle } from "@aura3d/engine";
import type { DroneId } from "./data";

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
