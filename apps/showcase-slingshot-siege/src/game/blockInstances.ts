/**
 * GU47 phase 7 (4.7.6, Task B draw budget) + WP-12 prop instancing:
 *   1. `BlockInstancePool`: the rounded solid block pool as one `instances.roundedBox` node per block family (5 draws).
 *   2. `PropInstancePool`: batches the 84 individual pooled GLB prop actors (18 crates, 12 barrels + iron bands,
 *      24 planks, 30 debris) into 4 `instances.model` pools + 1 `instances.cylinder` keg-hoop pool (5 draws vs 84!).
 *
 * All instance transforms clamp scales to strictly positive determinants (`>= 1e-4`) so GPU instancing never splits
 * draw calls when `cullMode !== "none"`. Presentation only: `SiegeSim` bodies and poses are untouched.
 */
import type { AuraMaterialSpec, AuraRuntimeNodeHandle, AuraTransformSpec } from "@aura3d/engine";
import type { SiegeMaterialId } from "./materials";

export const BLOCK_FAMILIES: readonly SiegeMaterialId[] = ["wood", "stone", "glass", "ice", "obsidian"];

export function blockFamilyNodeId(family: SiegeMaterialId): string { return `v-blocks-${family}`; }

/** Where an unused instance waits: under the island, near-zero positive scale. */
export const PARKED_BLOCK: Readonly<AuraTransformSpec> = { position: [0, -120, 0], rotation: [0, 0, 0], scale: [1e-4, 1e-4, 1e-4] };

type V3 = [number, number, number];
interface Slot { family: SiegeMaterialId | null; position: V3; rotation: V3; scale: V3; visible: boolean }

function positiveScale(scale: number | readonly [number, number, number]): V3 {
  if (typeof scale === "number") {
    const s = Math.max(1e-4, Math.abs(scale));
    return [s, s, s];
  }
  return [
    Math.max(1e-4, Math.abs(scale[0])),
    Math.max(1e-4, Math.abs(scale[1])),
    Math.max(1e-4, Math.abs(scale[2]))
  ];
}

/** The subset of a runtime node handle main.ts calls on a block or pooled prop. */
export interface BlockHandle {
  setPosition(x: number, y: number, z: number): BlockHandle;
  setRotation(x: number, y: number, z: number): BlockHandle;
  setScale(scale: number | readonly [number, number, number]): BlockHandle;
  setVisible(visible: boolean): BlockHandle;
  setMaterial(material: AuraMaterialSpec): BlockHandle;
}

export class BlockInstancePool {
  private readonly slots = new Map<string, Slot>();
  private readonly handles = new Map<string, BlockHandle>();
  private readonly dirty = new Set<SiegeMaterialId>(BLOCK_FAMILIES);
  /** Families whose node already took its material (nodes mount with the stone material, as the old pool did). */
  private readonly dressed = new Set<SiegeMaterialId>();

  constructor(
    private readonly capacity: number,
    private readonly materials: Readonly<Record<SiegeMaterialId, AuraMaterialSpec>>,
    private readonly resolve: (id: string) => AuraRuntimeNodeHandle | undefined
  ) {}

  private slot(id: string): Slot {
    let s = this.slots.get(id);
    if (!s) {
      s = { family: null, position: [0, -120, 0], rotation: [0, 0, 0], scale: [1, 1, 1], visible: false };
      this.slots.set(id, s);
    }
    return s;
  }

  private touch(s: Slot): void { if (s.family) this.dirty.add(s.family); }

  handle(id: string): BlockHandle {
    const existing = this.handles.get(id);
    if (existing) return existing;
    const s = this.slot(id);
    const h: BlockHandle = {
      setPosition: (x, y, z) => { s.position = [x, y, z]; this.touch(s); return h; },
      setRotation: (x, y, z) => { s.rotation = [x, y, z]; this.touch(s); return h; },
      setScale: (scale) => {
        s.scale = positiveScale(scale);
        this.touch(s);
        return h;
      },
      setVisible: (visible) => { if (s.visible !== visible) { s.visible = visible; this.touch(s); } return h; },
      setMaterial: (material) => {
        const family = BLOCK_FAMILIES.find((f) => this.materials[f] === material) ?? "stone";
        if (family !== s.family) { this.touch(s); s.family = family; this.touch(s); }
        return h;
      }
    };
    this.handles.set(id, h);
    return h;
  }

  /** The instance list a family submits: its visible blocks first, the rest of the capacity parked. */
  transforms(family: SiegeMaterialId): { readonly transforms: AuraTransformSpec[]; readonly live: number } {
    const out: AuraTransformSpec[] = [];
    for (const s of this.slots.values()) {
      if (s.family !== family || !s.visible || out.length >= this.capacity) continue;
      out.push({ position: [...s.position], rotation: [...s.rotation], scale: [...s.scale] });
    }
    const live = out.length;
    while (out.length < this.capacity) out.push(PARKED_BLOCK);
    return { transforms: out, live };
  }

  /** Visible blocks per family (evidence and the audit spec's pool check). */
  liveCounts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const s of this.slots.values()) if (s.family && s.visible) out[s.family] = (out[s.family] ?? 0) + 1;
    return out;
  }

  /** Submit every family whose blocks changed since the last flush; a family node not mounted yet stays dirty. */
  flush(): void {
    for (const family of [...this.dirty]) {
      const node = this.resolve(blockFamilyNodeId(family));
      if (!node) continue;
      if (!this.dressed.has(family)) { node.setMaterial(this.materials[family]); this.dressed.add(family); }
      const { transforms, live } = this.transforms(family);
      if (live === 0) node.setVisible(false);
      else node.setInstances(transforms).setVisible(true);
      this.dirty.delete(family);
    }
  }
}

export type PropPoolFamily = "crate" | "barrel" | "plank" | "debris";
export const PROP_POOL_FAMILIES: readonly PropPoolFamily[] = ["crate", "barrel", "plank", "debris"];
export const BARREL_BAND_POOL_ID = "v-barrel-bands-pool";

export function propPoolNodeId(family: PropPoolFamily): string {
  return family === "debris" ? "v-debris-pool" : `v-${family}s-pool`;
}

interface PropSlot {
  readonly family: PropPoolFamily;
  position: V3;
  rotation: V3;
  scale: V3;
  visible: boolean;
}

/**
 * Batches crates (18), barrels (12 + iron keg hoops), planks (24), and debris chips (30) into
 * 4 `instances.model` nodes + 1 `instances.cylinder` keg-band node.
 */
export class PropInstancePool {
  private readonly slots = new Map<string, PropSlot>();
  private readonly handles = new Map<string, BlockHandle>();
  private readonly dirty = new Set<PropPoolFamily>(PROP_POOL_FAMILIES);

  constructor(
    private readonly capacities: Readonly<Record<PropPoolFamily, number>>,
    private readonly resolve: (id: string) => AuraRuntimeNodeHandle | undefined
  ) {}

  private slot(id: string, family: PropPoolFamily): PropSlot {
    let s = this.slots.get(id);
    if (!s) {
      s = { family, position: [0, -120, 0], rotation: [0, 0, 0], scale: [0.4, 0.4, 0.4], visible: false };
      this.slots.set(id, s);
    }
    return s;
  }

  handle(id: string, family: PropPoolFamily): BlockHandle {
    const existing = this.handles.get(id);
    if (existing) return existing;
    const s = this.slot(id, family);
    const h: BlockHandle = {
      setPosition: (x, y, z) => { s.position = [x, y, z]; this.dirty.add(family); return h; },
      setRotation: (x, y, z) => { s.rotation = [x, y, z]; this.dirty.add(family); return h; },
      setScale: (scale) => { s.scale = positiveScale(scale); this.dirty.add(family); return h; },
      setVisible: (visible) => { if (s.visible !== visible) { s.visible = visible; this.dirty.add(family); } return h; },
      setMaterial: () => h
    };
    this.handles.set(id, h);
    return h;
  }

  transforms(family: PropPoolFamily): { readonly transforms: AuraTransformSpec[]; readonly live: number } {
    const cap = this.capacities[family];
    const out: AuraTransformSpec[] = [];
    for (const s of this.slots.values()) {
      if (s.family !== family || !s.visible || out.length >= cap) continue;
      out.push({ position: [...s.position], rotation: [...s.rotation], scale: [...s.scale] });
    }
    const live = out.length;
    while (out.length < cap) out.push(PARKED_BLOCK);
    return { transforms: out, live };
  }

  liveCounts(): Record<PropPoolFamily, number> {
    const out: Record<PropPoolFamily, number> = { crate: 0, barrel: 0, plank: 0, debris: 0 };
    for (const s of this.slots.values()) if (s.visible) out[s.family] += 1;
    return out;
  }

  flush(): void {
    for (const family of [...this.dirty]) {
      const node = this.resolve(propPoolNodeId(family));
      if (!node) continue;
      const { transforms, live } = this.transforms(family);
      if (live === 0) node.setVisible(false);
      else node.setInstances(transforms).setVisible(true);

      // Sync dark forged-iron / crimson-lacquer explosive keg collar bands onto every live barrel!
      if (family === "barrel") {
        const bandNode = this.resolve(BARREL_BAND_POOL_ID);
        if (bandNode) {
          if (live === 0) {
            bandNode.setVisible(false);
          } else {
            const bandTransforms: AuraTransformSpec[] = transforms.map((t, idx) => {
              if (idx >= live) return PARKED_BLOCK;
              const sc = Array.isArray(t.scale) ? t.scale : [0.42, 0.42, 0.42];
              const p = t.position ?? [0, -120, 0];
              return {
                position: [p[0], p[1] + 0.19, p[2]],
                rotation: t.rotation ? [...t.rotation] : [0, 0, 0],
                scale: [Math.max(1e-4, sc[0]! * 0.88), Math.max(1e-4, sc[1]! * 0.42), Math.max(1e-4, sc[2]! * 0.88)]
              };
            });
            bandNode.setInstances(bandTransforms).setVisible(true);
          }
        }
      }
      this.dirty.delete(family);
    }
  }
}
