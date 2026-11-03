import { describe, expect, it } from "vitest";
import { buildWorld, nodeName } from "../../../apps/showcase-pips-big-leap/src/game/world";
import { WORLD_IDS, worldLookMode } from "../../../apps/showcase-pips-big-leap/src/game/looks";
import { worldSpec } from "../../../apps/showcase-pips-big-leap/src/game/worlds";

type SceneNode = {
  readonly kind?: string;
  readonly name?: string;
  readonly asset?: { readonly hash?: string; readonly bounds?: readonly number[] };
  readonly position?: readonly number[];
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
  readonly targetMaxDimension?: number;
  readonly targetHeight?: number;
  readonly runtime?: unknown;
  readonly children?: readonly SceneNode[];
};

const flat = (nodes: readonly SceneNode[]): SceneNode[] =>
  nodes.flatMap((node) => [node, ...flat(node.children ?? [])]);

const pedestalHash = "sha256-c9af6f418b688bff7dab3bbe9d905b9456d8d82e4c9af94e4a84b3aae8fb22fc";
const boostPadHash = "sha256-e58b4f3ccba2ddefe11ae011f2ae5c3b24ee7688c89b67466f1adb32e0058791";
const checkpointFlagHash = "sha256-9b30fdbaf5a20aa2b0f3694a913b6b24c177a9e901fbbfdc1b74c7c4ebcee60c";

describe("pips-big-leap original spring and checkpoint presentation", () => {
  it("keeps the original pedestal and interactive models in every world", () => {
    for (const id of WORLD_IDS) {
      const spec = worldSpec(id);
      const built = buildWorld(spec, { look: worldLookMode(id, "?look=original") });
      const nodes = flat((built.scene.toJSON() as unknown as { nodes: SceneNode[] }).nodes);
      const byName = (name: string) => nodes.find((node) => node.name === name);

      expect(spec.springs, id).toHaveLength(1);
      expect(spec.checkpoints, id).toHaveLength(3);
      for (const spring of spec.springs) {
        expect(byName(`${nodeName.spring(spring.id)}:base`), `${id} ${spring.id}`).toMatchObject({
          kind: "model",
          asset: { hash: pedestalHash, bounds: [0.6, 1, 0.6] },
          position: [spring.x, spring.y, spring.z],
          castShadow: true,
          receiveShadow: true,
          targetMaxDimension: 0.92
        });
        expect(byName(nodeName.spring(spring.id)), `${id} ${spring.id}`).toMatchObject({
          kind: "model",
          asset: { hash: boostPadHash, bounds: [6.2, 0.24, 8.2] },
          position: [spring.x, spring.y + 0.14, spring.z],
          castShadow: true,
          receiveShadow: true,
          targetMaxDimension: 0.82
        });
        expect(byName(nodeName.spring(spring.id))?.runtime).toBeDefined();
      }
      for (const checkpoint of spec.checkpoints) {
        expect(byName(`${nodeName.checkpoint(checkpoint.id)}:pad`), `${id} ${checkpoint.id}`).toMatchObject({
          kind: "model",
          asset: { hash: pedestalHash, bounds: [0.6, 1, 0.6] },
          position: [checkpoint.x, checkpoint.y, checkpoint.z],
          castShadow: true,
          receiveShadow: true,
          targetMaxDimension: 0.78
        });
        expect(byName(nodeName.checkpointFlag(checkpoint.id)), `${id} ${checkpoint.id}`).toMatchObject({
          kind: "model",
          asset: { hash: checkpointFlagHash, bounds: [0.527, 1.899, 0.362] },
          position: [checkpoint.x, checkpoint.y, checkpoint.z],
          castShadow: true,
          targetHeight: 1.9
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
