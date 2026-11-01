// GU47 phase 7 (4.7.6, Task B): the per-family instanced block pool keeps every block's pose and family.
import { describe, expect, it } from "vitest";
import { BlockInstancePool, PARKED_BLOCK, blockFamilyNodeId } from "../../../apps/showcase-slingshot-siege/src/game/blockInstances";
import { SOLID_BLOCK_MATERIALS } from "../../../apps/showcase-slingshot-siege/src/game/stage";

function fakeNode() {
  const calls: { visible: boolean[]; instances: unknown[][]; material?: unknown } = { visible: [], instances: [] };
  const h = {
    setVisible(v: boolean) { calls.visible.push(v); return h; },
    setInstances(t: unknown[]) { calls.instances.push(t); return h; },
    setMaterial(m: unknown) { calls.material = m; return h; }
  };
  return { h, calls };
}

describe("slingshot-siege block instance pool", () => {
  it("submits visible blocks per family, parks the rest and hides unused families", () => {
    const nodes = new Map(["wood", "stone", "glass", "ice", "obsidian"].map((f) => [blockFamilyNodeId(f as never), fakeNode()]));
    const pool = new BlockInstancePool(4, SOLID_BLOCK_MATERIALS, (id) => nodes.get(id)?.h as never);
    pool.handle("v-block-0").setMaterial(SOLID_BLOCK_MATERIALS.wood).setPosition(1, 2, 3).setRotation(0, 0.5, 0).setScale([0.4, 0.2, 0.4]).setVisible(true);
    pool.handle("v-block-1").setMaterial(SOLID_BLOCK_MATERIALS.stone).setPosition(4, 5, 6).setVisible(true);
    pool.handle("v-block-2").setMaterial(SOLID_BLOCK_MATERIALS.stone).setVisible(false);
    pool.flush();
    const wood = nodes.get("v-blocks-wood")!.calls;
    expect(wood.instances[0]).toHaveLength(4);
    expect(wood.instances[0]![0]).toEqual({ position: [1, 2, 3], rotation: [0, 0.5, 0], scale: [0.4, 0.2, 0.4] });
    expect(wood.instances[0]![1]).toBe(PARKED_BLOCK);
    expect(wood.visible).toEqual([true]);
    expect(wood.material).toBe(SOLID_BLOCK_MATERIALS.wood);
    expect(nodes.get("v-blocks-glass")!.calls.visible).toEqual([false]);
    expect(pool.liveCounts()).toEqual({ wood: 1, stone: 1 });
    // A re-slotted block leaves its old family.
    pool.handle("v-block-0").setMaterial(SOLID_BLOCK_MATERIALS.glass);
    pool.flush();
    expect(nodes.get("v-blocks-wood")!.calls.visible.at(-1)).toBe(false);
    expect(nodes.get("v-blocks-glass")!.calls.instances.at(-1)![0]).toEqual({ position: [1, 2, 3], rotation: [0, 0.5, 0], scale: [0.4, 0.2, 0.4] });
  });
});
