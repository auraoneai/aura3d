import { describe, expect, it } from "vitest";
import { buildWorld, nodeName } from "../../../apps/showcase-pips-big-leap/src/game/world";
import { WORLD_IDS, worldLookMode } from "../../../apps/showcase-pips-big-leap/src/game/looks";
import { worldSpec } from "../../../apps/showcase-pips-big-leap/src/game/worlds";

type SceneNode = {
  readonly kind?: string;
  readonly primitive?: string;
  readonly name?: string;
  readonly position?: readonly number[];
  readonly castShadow?: boolean;
  readonly runtime?: unknown;
  readonly children?: readonly SceneNode[];
};

const flat = (nodes: readonly SceneNode[]): SceneNode[] =>
  nodes.flatMap((node) => [node, ...flat(node.children ?? [])]);

describe("pips-big-leap original spring and checkpoint presentation", () => {
  it("mounts zero GLB models and keeps procedural interactive springs and checkpoints in every world", () => {
    for (const id of WORLD_IDS) {
      const spec = worldSpec(id);
      const built = buildWorld(spec, { look: worldLookMode(id, "?look=original") });
      const nodes = flat((built.scene.toJSON() as unknown as { nodes: SceneNode[] }).nodes);
      const byName = (name: string) => nodes.find((node) => node.name === name);

      expect(nodes.filter((node) => node.kind === "model"), `${id} original models`).toEqual([]);
      expect(spec.springs, id).toHaveLength(1);
      expect(spec.checkpoints, id).toHaveLength(3);
      for (const spring of spec.springs) {
        expect(byName(`${nodeName.spring(spring.id)}:base`)?.kind, `${id} ${spring.id}:base`).toBe("group");
        expect(byName(nodeName.spring(spring.id))?.kind, `${id} ${spring.id}`).toBe("group");
        expect(byName(nodeName.spring(spring.id))?.runtime).toBeDefined();
      }
      for (const checkpoint of spec.checkpoints) {
        expect(byName(`${nodeName.checkpoint(checkpoint.id)}:pad`)?.kind, `${id} ${checkpoint.id}:pad`).toBe("group");
        expect(byName(nodeName.checkpointFlag(checkpoint.id)), `${id} ${checkpoint.id}`).toMatchObject({
          kind: "primitive",
          primitive: "custom",
          position: [checkpoint.x, checkpoint.y, checkpoint.z],
          castShadow: true
        });
        expect(byName(nodeName.checkpointFlag(checkpoint.id))?.runtime).toBeDefined();
      }
    }
  });

  it("keeps simulation, collisions and camera obstacles identical in both looks", () => {
    const fields = [
      "spec", "motion", "solids", "hazards", "waters", "seeds", "acorns", "hearts",
      "springs", "checkpoints", "spinNodes", "movingSolids", "timedSolids", "cameraObstacles", "bossArenaZ"
    ] as const;
    for (const id of WORLD_IDS) {
      const spec = worldSpec(id);
      const original = buildWorld(spec, { look: worldLookMode(id, "?look=original") });
      const diorama = buildWorld(spec, { look: worldLookMode(id, "?look=diorama") });
      for (const field of fields) expect(diorama[field], `${id} ${field}`).toEqual(original[field]);
    }
  });
});
