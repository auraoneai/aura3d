/**
 * Draw helpers that keep the frame loop allocation-free (audit C20) and the per-circuit recolour (C12).
 */
import type { AuraRuntimeNodeHandle } from "@aura3d/engine";
import type { CircuitSpec, DroneId } from "./data";
import { chevronMaterial, emissive, spineMaterial } from "./scene";
import { material } from "@aura3d/engine";

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
    if (this.cursor >= this.capacity) return;
    const o = this.cursor * 16;
    const c = Math.cos(yaw) * scale, s = Math.sin(yaw) * scale;
    const m = this.matrices;
    m[o] = c; m[o + 1] = 0; m[o + 2] = -s; m[o + 3] = 0;
    m[o + 4] = 0; m[o + 5] = scale; m[o + 6] = 0; m[o + 7] = 0;
    m[o + 8] = s; m[o + 9] = 0; m[o + 10] = c; m[o + 11] = 0;
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

export interface LookHandles {
  readonly backdrop: AuraRuntimeNodeHandle;
  readonly floor: AuraRuntimeNodeHandle;
  readonly bandA: AuraRuntimeNodeHandle;
  readonly bandB: AuraRuntimeNodeHandle;
  readonly spineA: AuraRuntimeNodeHandle;
  readonly spineB: AuraRuntimeNodeHandle;
  readonly chevA: AuraRuntimeNodeHandle;
  readonly chevB: AuraRuntimeNodeHandle;
}

/** Recolour the sky, floor, horizon bands, road spine and wall chevrons for a circuit. */
export function applyCircuitLook(h: LookHandles, circuit: CircuitSpec): void {
  h.backdrop.setMaterial(emissive(circuit.skyColor, 0.6));
  h.floor.setMaterial(material.pbr({ color: circuit.fogTint, roughness: 0.92, metalness: 0.12 }));
  h.bandA.setMaterial(emissive(circuit.accentColor, 0.75));
  h.bandB.setMaterial(emissive(circuit.horizonColor, 0.65));
  h.spineA.setMaterial(spineMaterial(circuit.horizonColor));
  h.spineB.setMaterial(spineMaterial(circuit.accentColor));
  h.chevA.setMaterial(chevronMaterial(circuit.accentColor));
  h.chevB.setMaterial(chevronMaterial(circuit.horizonColor));
}
