/**
 * GU47 phase 7 (4.7.6, Task B draw budget): the rounded solid block pool as one instanced node per block family.
 *
 * Before 4.7.6 every block was its own `primitives.roundedBox` node (80 pooled nodes), so a fort of 30 blocks cost 30
 * meshes in every pass (main, contact-shadow depth, two sun cascades: about 4 draws each). The five families (wood,
 * stone, glass, ice, obsidian) are now five `instances.roundedBox` nodes of POOL.blocks instances each, drawn with the
 * same material and the same per-block transform, so a fort costs at most one mesh per family it uses.
 *
 * main.ts keeps addressing blocks by their pooled ids (`v-block-<i>`): `handle(id)` returns a stand-in handle with the
 * calls the game makes on a block (position, rotation, scale, visibility, material), which writes the slot and marks
 * its family dirty; `flush()` once per frame submits each dirty family. A family with no visible block is hidden, so
 * an unused family costs no draws. Presentation only: the sim, its bodies and its poses are unchanged (PRD D8).
 */
import type { AuraMaterialSpec, AuraRuntimeNodeHandle, AuraTransformSpec } from "@aura3d/engine";
import type { SiegeMaterialId } from "./materials";

export const BLOCK_FAMILIES: readonly SiegeMaterialId[] = ["wood", "stone", "glass", "ice", "obsidian"];

export function blockFamilyNodeId(family: SiegeMaterialId): string { return `v-blocks-${family}`; }

/** Where an unused instance waits: under the island, near-zero scale. */
export const PARKED_BLOCK: Readonly<AuraTransformSpec> = { position: [0, -120, 0], rotation: [0, 0, 0], scale: [1e-4, 1e-4, 1e-4] };

type V3 = [number, number, number];
interface Slot { family: SiegeMaterialId | null; position: V3; rotation: V3; scale: V3; visible: boolean }

/** The subset of a runtime node handle main.ts calls on a block. */
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
        s.scale = typeof scale === "number" ? [scale, scale, scale] : [scale[0], scale[1], scale[2]];
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
