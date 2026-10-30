// GU47 WP-16 (G06) PBL-E4: the w2 millpond as a horizontal mirror under its tinted glass with a foam ring;
// water zones and colliders unchanged (swim tests read the same spec).
import { describe, expect, it } from "vitest";
import { buildWorld } from "../../../apps/showcase-pips-big-leap/src/game/world";
import { worldSpec } from "../../../apps/showcase-pips-big-leap/src/game/worlds";
import { WORLD_IDS } from "../../../apps/showcase-pips-big-leap/src/game/looks";
import { dioramaName } from "../../../apps/showcase-pips-big-leap/src/game/diorama";

type Node = { readonly kind: string; readonly name?: string; readonly surface?: string; readonly position?: readonly number[]; readonly size?: readonly number[]; readonly instances?: readonly unknown[]; readonly children?: readonly Node[] };
const flat = (nodes: readonly Node[]): Node[] => nodes.flatMap((n) => [n, ...(n.kind === "group" ? flat(n.children ?? []) : [])]);
const sceneOf = (id: (typeof WORLD_IDS)[number], look?: "original") =>
  flat((buildWorld(worldSpec(id), look ? { look } : {}).scene.toJSON() as unknown as { nodes: Node[] }).nodes);

describe("pips-big-leap millpond (PBL-E4)", () => {
  it("mirrors the w2 pond just under its glass and rings it with one foam draw, in w2 only", () => {
    for (const id of WORLD_IDS) {
      const nodes = sceneOf(id);
      const mirrors = nodes.filter((n) => n.kind === "surface" && n.surface === "mirror");
      const foam = nodes.filter((n) => n.name === dioramaName.millpondFoam);
      if (id !== "w2") {
        expect(mirrors, id).toEqual([]);
        expect(foam, id).toEqual([]);
        continue;
      }
      const pond = worldSpec("w2").waters[0]!;
      expect(mirrors).toHaveLength(1);
      expect(mirrors[0]!.position![1]).toBeCloseTo(pond.y - 0.02, 9);
      expect(mirrors[0]!.size![0]).toBeLessThan(pond.w);
      expect(foam).toHaveLength(1);
      expect(foam[0]!.instances!.length).toBeGreaterThanOrEqual(12);
    }
  });

  it("adds at most 3 draws and leaves the water zones and solids unchanged", () => {
    const d = buildWorld(worldSpec("w2"));
    const o = buildWorld(worldSpec("w2"), { look: "original" });
    expect(JSON.stringify(d.waters)).toBe(JSON.stringify(o.waters));
    expect(JSON.stringify(d.solids)).toBe(JSON.stringify(o.solids));
    expect(sceneOf("w2").filter((n) => (n.name ?? "").startsWith("pbl-millpond")).length).toBeLessThanOrEqual(3);
    expect(sceneOf("w2", "original").some((n) => n.kind === "surface")).toBe(false);
  });
});
